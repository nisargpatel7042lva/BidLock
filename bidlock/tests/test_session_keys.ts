import * as anchor from "@coral-xyz/anchor";
import { Program, web3, BN } from "@coral-xyz/anchor";
import { assert } from "chai";
import { Bidlock } from "../target/types/bidlock";
import { DELEGATION_PROGRAM_ID } from "@magicblock-labs/ephemeral-rollups-sdk";

const ROOM_SEED = "room";
const ROOM_SESSION_SEED = "room_session";

// Local MagicBlock stack: base validator (8899) + ER validator (7799)
describe("session-keys — Phase 3 session-key auth", () => {
  const provider = new anchor.AnchorProvider(
    new anchor.web3.Connection(
      process.env.PROVIDER_ENDPOINT || "http://localhost:8899",
      { commitment: "confirmed" },
    ),
    anchor.Wallet.local(),
  );
  anchor.setProvider(provider);

  const providerEphemeralRollup = new anchor.AnchorProvider(
    new anchor.web3.Connection(
      process.env.EPHEMERAL_PROVIDER_ENDPOINT || "http://localhost:7799",
      { commitment: "confirmed" },
    ),
    anchor.Wallet.local(),
  );

  const program = anchor.workspace.bidlock as Program<Bidlock>;
  const erProgram = new Program<Bidlock>(program.idl, providerEphemeralRollup);
  const creator = (provider.wallet as anchor.Wallet).payer;

  // Fresh room IDs so re-runs never collide with prior PDAs.
  const roomId1 = new BN(Date.now());
  const roomId2 = new BN(Date.now() + 1);

  const [roomPda1] = web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from(ROOM_SEED),
      creator.publicKey.toBuffer(),
      roomId1.toArrayLike(Buffer, "le", 8),
    ],
    program.programId,
  );
  const [roomPda2] = web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from(ROOM_SEED),
      creator.publicKey.toBuffer(),
      roomId2.toArrayLike(Buffer, "le", 8),
    ],
    program.programId,
  );

  // The member whose session keys we're testing. Using creator as memberA for
  // simplicity (they own the wallet that's loaded from disk).
  const memberA = creator;

  // Session keypair: a fresh throwaway key that memberA authorizes.
  const sessionKeypair = web3.Keypair.generate();

  // Room-scoped session PDAs.
  const [sessionPda1] = web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from(ROOM_SESSION_SEED),
      roomPda1.toBuffer(),
      memberA.publicKey.toBuffer(),
    ],
    program.programId,
  );
  const [sessionPda2] = web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from(ROOM_SESSION_SEED),
      roomPda2.toBuffer(),
      memberA.publicKey.toBuffer(),
    ],
    program.programId,
  );

  const validatorIdentity = new web3.PublicKey(
    process.env.VALIDATOR || "mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev",
  );

  async function isDelegated(pda: web3.PublicKey): Promise<boolean> {
    const info = await provider.connection.getAccountInfo(pda);
    return info?.owner.toBase58() === DELEGATION_PROGRAM_ID.toBase58();
  }

  async function waitUntil(
    pred: () => Promise<boolean>,
    label: string,
    tries = 40,
  ): Promise<void> {
    for (let i = 0; i < tries; i++) {
      if (await pred()) return;
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`Timed out waiting for: ${label}`);
  }

  // ─── SETUP ──────────────────────────────────────────────────────────────────

  it("creates room 1 (memberA is a member)", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    await program.methods
      .createRoom(
        roomId1,
        "session-key test pool — room 1",
        [memberA.publicKey],
        new BN(nowSec + 3600),
        new BN(nowSec + 7200),
      )
      .accounts({
        creator: creator.publicKey,
        // @ts-ignore
        room: roomPda1,
        systemProgram: web3.SystemProgram.programId,
      })
      .rpc({ skipPreflight: true });

    const room = await program.account.room.fetch(roomPda1);
    assert.equal(room.status.created !== undefined, true);
    assert.deepEqual(room.members.map((k) => k.toBase58()), [
      memberA.publicKey.toBase58(),
    ]);
    assert.isEmpty(room.submissions);
  });

  it("creates room 2 (memberA is also a member — for cross-room rejection test)", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    await program.methods
      .createRoom(
        roomId2,
        "session-key test pool — room 2",
        [memberA.publicKey],
        new BN(nowSec + 3600),
        new BN(nowSec + 7200),
      )
      .accounts({
        creator: creator.publicKey,
        // @ts-ignore
        room: roomPda2,
        systemProgram: web3.SystemProgram.programId,
      })
      .rpc({ skipPreflight: true });

    const room = await program.account.room.fetch(roomPda2);
    assert.equal(room.status.created !== undefined, true);
  });

  // ─── SESSION CREATION (base layer, main wallet signs once) ───────────────

  it("memberA authorizes session key for room 1 (main wallet signs exactly once)", async () => {
    const validUntil = new BN(Math.floor(Date.now() / 1000) + 3600);

    // Fund the session keypair so it can pay fees.
    const fundTx = new web3.Transaction().add(
      web3.SystemProgram.transfer({
        fromPubkey: creator.publicKey,
        toPubkey: sessionKeypair.publicKey,
        lamports: 0.01 * anchor.web3.LAMPORTS_PER_SOL,
      }),
    );
    fundTx.feePayer = creator.publicKey;
    fundTx.recentBlockhash = (
      await provider.connection.getLatestBlockhash()
    ).blockhash;
    fundTx.sign(creator);
    await provider.connection.sendRawTransaction(fundTx.serialize(), {
      skipPreflight: true,
    });
    await provider.connection.confirmTransaction(
      await provider.connection.sendRawTransaction(fundTx.serialize(), {}),
      "confirmed",
    ).catch(() => {}); // confirm best-effort after first send

    await program.methods
      .createSession(sessionKeypair.publicKey, validUntil)
      .accounts({
        member: memberA.publicKey,
        room: roomPda1,
        // @ts-ignore
        roomSession: sessionPda1,
        systemProgram: web3.SystemProgram.programId,
      })
      .signers([memberA])
      .rpc({ skipPreflight: true });

    const session = await program.account.roomSession.fetch(sessionPda1);
    assert.equal(session.room.toBase58(), roomPda1.toBase58());
    assert.equal(session.member.toBase58(), memberA.publicKey.toBase58());
    assert.equal(
      session.sessionKey.toBase58(),
      sessionKeypair.publicKey.toBase58(),
    );
  });

  it("memberA authorizes session key for room 2 (for the cross-room rejection test)", async () => {
    const validUntil = new BN(Math.floor(Date.now() / 1000) + 3600);

    await program.methods
      .createSession(sessionKeypair.publicKey, validUntil)
      .accounts({
        member: memberA.publicKey,
        room: roomPda2,
        // @ts-ignore
        roomSession: sessionPda2,
        systemProgram: web3.SystemProgram.programId,
      })
      .signers([memberA])
      .rpc({ skipPreflight: true });

    const session = await program.account.roomSession.fetch(sessionPda2);
    assert.equal(session.room.toBase58(), roomPda2.toBase58());
  });

  // ─── DELEGATION ──────────────────────────────────────────────────────────

  it("delegates room 1 to ER (post-delegation action fires open_submission)", async () => {
    assert.isFalse(await isDelegated(roomPda1));

    await program.methods
      .delegateRoom(roomId1)
      .accounts({
        payer: creator.publicKey,
        // @ts-ignore
        pda: roomPda1,
      })
      .remainingAccounts([
        { pubkey: validatorIdentity, isSigner: false, isWritable: false },
      ])
      .rpc({ skipPreflight: true });

    await waitUntil(
      () => isDelegated(roomPda1),
      "room 1 delegated",
    );
    assert.isTrue(await isDelegated(roomPda1));
  });

  it("confirms post-delegation action opened submissions in the ER", async () => {
    await waitUntil(
      async () => {
        const room = await erProgram.account.room.fetch(roomPda1);
        return room.status.submissionOpen !== undefined;
      },
      "room 1 status == SubmissionOpen inside ER",
    );
    const room = await erProgram.account.room.fetch(roomPda1);
    assert.isTrue(room.status.submissionOpen !== undefined);
  });

  // ─── SUBMIT WITH SESSION KEY (main wallet never signs) ───────────────────

  it("memberA submits a sealed commitment using session key — main wallet never signs", async () => {
    // A realistic commitment: sha256(split_bps_array || salt).
    // For the test we use a deterministic dummy value.
    const commitment = Array.from({ length: 32 }, (_, i) => i + 1);

    // Build the transaction but sign ONLY with sessionKeypair — not memberA.
    const tx = await erProgram.methods
      .submitBid(commitment)
      .accounts({
        signer: sessionKeypair.publicKey,
        room: roomPda1,
        // @ts-ignore
        roomSession: sessionPda1,
      })
      .transaction();
    tx.feePayer = sessionKeypair.publicKey;
    tx.recentBlockhash = (
      await providerEphemeralRollup.connection.getLatestBlockhash()
    ).blockhash;
    tx.sign(sessionKeypair); // ← session key only; main wallet absent

    const sig = await providerEphemeralRollup.connection.sendRawTransaction(
      tx.serialize(),
      { skipPreflight: true },
    );
    await providerEphemeralRollup.connection.confirmTransaction(sig, "confirmed");

    const room = await erProgram.account.room.fetch(roomPda1);
    assert.equal(room.submissions.length, 1);
    assert.equal(
      room.submissions[0].member.toBase58(),
      memberA.publicKey.toBase58(),
    );
    assert.deepEqual(
      Array.from(room.submissions[0].commitment as unknown as number[]),
      commitment,
    );
  });

  it("submitting a second time from the same member is rejected (AlreadySubmitted)", async () => {
    const commitment = Array.from({ length: 32 }, () => 0xff);

    const tx = await erProgram.methods
      .submitBid(commitment)
      .accounts({
        signer: sessionKeypair.publicKey,
        room: roomPda1,
        // @ts-ignore
        roomSession: sessionPda1,
      })
      .transaction();
    tx.feePayer = sessionKeypair.publicKey;
    tx.recentBlockhash = (
      await providerEphemeralRollup.connection.getLatestBlockhash()
    ).blockhash;
    tx.sign(sessionKeypair);

    const sig = await providerEphemeralRollup.connection.sendRawTransaction(
      tx.serialize(),
      { skipPreflight: true },
    );
    const result = await providerEphemeralRollup.connection.confirmTransaction(
      sig,
      "confirmed",
    );
    assert.isNotNull(
      result.value.err,
      "double-submit must be rejected on-chain",
    );
  });

  // ─── CROSS-ROOM SESSION KEY REJECTION ────────────────────────────────────

  it("submitting to room 1 using the room-2 session key is rejected (SessionRoomMismatch)", async () => {
    const commitment = Array.from({ length: 32 }, () => 0xab);

    // sessionPda2 is scoped to room 2; trying to use it on room 1 must fail.
    const tx = await erProgram.methods
      .submitBid(commitment)
      .accounts({
        signer: sessionKeypair.publicKey,
        room: roomPda1,
        // @ts-ignore
        roomSession: sessionPda2, // ← room 2 session used on room 1
      })
      .transaction();
    tx.feePayer = sessionKeypair.publicKey;
    tx.recentBlockhash = (
      await providerEphemeralRollup.connection.getLatestBlockhash()
    ).blockhash;
    tx.sign(sessionKeypair);

    const sig = await providerEphemeralRollup.connection.sendRawTransaction(
      tx.serialize(),
      { skipPreflight: true },
    );
    const result = await providerEphemeralRollup.connection.confirmTransaction(
      sig,
      "confirmed",
    );
    assert.isNotNull(
      result.value.err,
      "cross-room session must be rejected on-chain",
    );
    console.log(
      "  (cross-room rejection) on-chain error:",
      JSON.stringify(result.value.err),
    );
  });

  // ─── UNDELEGATE AND VERIFY COMMITTED STATE ───────────────────────────────

  it("undelegates room 1 and confirms committed submissions survive on base layer", async () => {
    const tx = await program.methods
      .undelegateRoom(roomId1)
      .accounts({
        payer: creator.publicKey,
        // @ts-ignore
        room: roomPda1,
      })
      .transaction();
    tx.feePayer = creator.publicKey;
    tx.recentBlockhash = (
      await providerEphemeralRollup.connection.getLatestBlockhash()
    ).blockhash;
    tx.sign(creator);
    const sig = await providerEphemeralRollup.connection.sendRawTransaction(
      tx.serialize(),
      { skipPreflight: true },
    );
    await providerEphemeralRollup.connection.confirmTransaction(sig, "confirmed");

    await waitUntil(
      async () => !(await isDelegated(roomPda1)),
      "room 1 undelegated (owner reverts to bidlock)",
    );
    assert.isFalse(await isDelegated(roomPda1));

    const room = await program.account.room.fetch(roomPda1);
    assert.isTrue(
      room.status.submissionOpen !== undefined,
      "ER state (SubmissionOpen) must survive the commit",
    );
    assert.equal(
      room.submissions.length,
      1,
      "the one committed submission must be on base layer",
    );
    assert.equal(
      room.submissions[0].member.toBase58(),
      memberA.publicKey.toBase58(),
    );
    assert.deepEqual(
      Array.from(room.submissions[0].commitment as unknown as number[]),
      Array.from({ length: 32 }, (_, i) => i + 1),
    );
  });
});
