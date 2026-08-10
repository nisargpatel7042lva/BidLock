/**
 * Phase 4 — Sealed Bid Submission (Commit Phase)
 *
 * Tests:
 *  • Multiple members each submit sealed commitments via their own session keys.
 *  • No plaintext bid amount is readable from any account at any point.
 *  • Late submissions (past the deadline) are rejected on-chain.
 *  • Duplicate submissions from the same member are rejected on-chain.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program, web3, BN } from "@coral-xyz/anchor";
import { assert } from "chai";
import { Bidlock } from "../target/types/bidlock";
import { DELEGATION_PROGRAM_ID } from "@magicblock-labs/ephemeral-rollups-sdk";
import * as crypto from "crypto";

const ROOM_SEED = "room";
const ROOM_SESSION_SEED = "room_session";

// Builds a sealed commitment: sha256(bid_amount_le_bytes || salt_bytes).
// Nothing on-chain stores the amount — only the 32-byte digest.
function sealedCommitment(bidAmount: bigint, salt: bigint): number[] {
  const buf = Buffer.alloc(16);
  buf.writeBigUInt64LE(bidAmount, 0);
  buf.writeBigUInt64LE(salt, 8);
  return Array.from(crypto.createHash("sha256").update(buf).digest());
}

describe("sealed-bids — Phase 4 commit phase", () => {
  const provider = new anchor.AnchorProvider(
    new anchor.web3.Connection(
      process.env.PROVIDER_ENDPOINT || "http://localhost:8899",
      { commitment: "confirmed" },
    ),
    anchor.Wallet.local(),
  );
  anchor.setProvider(provider);

  const providerER = new anchor.AnchorProvider(
    new anchor.web3.Connection(
      process.env.EPHEMERAL_PROVIDER_ENDPOINT || "http://localhost:7799",
      { commitment: "confirmed" },
    ),
    anchor.Wallet.local(),
  );

  const program = anchor.workspace.bidlock as Program<Bidlock>;
  const erProgram = new Program<Bidlock>(program.idl, providerER);
  const creator = (provider.wallet as anchor.Wallet).payer;

  const validatorIdentity = new web3.PublicKey(
    process.env.VALIDATOR || "mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev",
  );

  // ── Participants ───────────────────────────────────────────────────────────
  // memberA = creator (wallet loaded from disk)
  // memberB = freshly generated keypair, funded from creator
  const memberA = creator;
  const memberB = web3.Keypair.generate();

  // One session keypair per member.
  const sessionKpA = web3.Keypair.generate();
  const sessionKpB = web3.Keypair.generate();

  // Secret bids: never written to any account in plaintext.
  const BID_AMOUNT_A = BigInt(750_000);
  const BID_AMOUNT_B = BigInt(250_000);
  const SALT_A = BigInt("0xdeadbeefcafebabe");
  const SALT_B = BigInt("0xcafebabefeedface");

  // ── Shared room for the main test ─────────────────────────────────────────
  const nowSec = Math.floor(Date.now() / 1000);
  const roomId = new BN(Date.now());
  const [roomPda] = web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from(ROOM_SEED),
      creator.publicKey.toBuffer(),
      roomId.toArrayLike(Buffer, "le", 8),
    ],
    program.programId,
  );

  const [sessionPdaA] = web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from(ROOM_SESSION_SEED),
      roomPda.toBuffer(),
      memberA.publicKey.toBuffer(),
    ],
    program.programId,
  );
  const [sessionPdaB] = web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from(ROOM_SESSION_SEED),
      roomPda.toBuffer(),
      memberB.publicKey.toBuffer(),
    ],
    program.programId,
  );

  // ── Deadline-enforcement room (short-lived) ────────────────────────────────
  const expiredRoomId = new BN(Date.now() + 999);
  const [expiredRoomPda] = web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from(ROOM_SEED),
      creator.publicKey.toBuffer(),
      expiredRoomId.toArrayLike(Buffer, "le", 8),
    ],
    program.programId,
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

  async function sendToER(
    tx: web3.Transaction,
    feePayer: web3.Keypair,
    signers: web3.Keypair[],
  ): Promise<web3.RpcResponseAndContext<web3.SignatureResult>> {
    tx.feePayer = feePayer.publicKey;
    tx.recentBlockhash = (
      await providerER.connection.getLatestBlockhash()
    ).blockhash;
    tx.sign(...signers);
    const sig = await providerER.connection.sendRawTransaction(
      tx.serialize(),
      { skipPreflight: true },
    );
    return providerER.connection.confirmTransaction(sig, "confirmed");
  }

  // ── Setup ──────────────────────────────────────────────────────────────────

  it("funds memberB and session keypairs", async () => {
    const recipients = [
      memberB.publicKey,
      sessionKpA.publicKey,
      sessionKpB.publicKey,
    ];
    for (const pubkey of recipients) {
      const fundTx = new web3.Transaction().add(
        web3.SystemProgram.transfer({
          fromPubkey: creator.publicKey,
          toPubkey: pubkey,
          lamports: 0.02 * anchor.web3.LAMPORTS_PER_SOL,
        }),
      );
      await anchor.web3.sendAndConfirmTransaction(
        provider.connection,
        fundTx,
        [creator],
        { skipPreflight: true },
      );
    }
  });

  it("creates the main room with memberA and memberB", async () => {
    await program.methods
      .createRoom(
        roomId,
        "sealed-bid integration test — multi-member pool",
        [memberA.publicKey, memberB.publicKey],
        new BN(nowSec + 3600),
        new BN(nowSec + 7200),
      )
      .accounts({
        creator: creator.publicKey,
        // @ts-ignore
        room: roomPda,
        systemProgram: web3.SystemProgram.programId,
      })
      .rpc({ skipPreflight: true });

    const room = await program.account.room.fetch(roomPda);
    assert.deepEqual(
      room.members.map((k) => k.toBase58()).sort(),
      [memberA.publicKey.toBase58(), memberB.publicKey.toBase58()].sort(),
    );
    assert.isEmpty(room.submissions, "no submissions yet");
  });

  it("creates the expired room for deadline test (2-second window)", async () => {
    const shortDeadline = nowSec + 2;
    await program.methods
      .createRoom(
        expiredRoomId,
        "deadline-test pool",
        [memberA.publicKey],
        new BN(shortDeadline),
        new BN(shortDeadline + 100),
      )
      .accounts({
        creator: creator.publicKey,
        // @ts-ignore
        room: expiredRoomPda,
        systemProgram: web3.SystemProgram.programId,
      })
      .rpc({ skipPreflight: true });
  });

  // ── Session creation ───────────────────────────────────────────────────────

  it("memberA authorizes session key for main room (main wallet signs once)", async () => {
    await program.methods
      .createSession(sessionKpA.publicKey, new BN(nowSec + 7200))
      .accounts({
        member: memberA.publicKey,
        room: roomPda,
        // @ts-ignore
        roomSession: sessionPdaA,
        systemProgram: web3.SystemProgram.programId,
      })
      .signers([memberA])
      .rpc({ skipPreflight: true });

    const s = await program.account.roomSession.fetch(sessionPdaA);
    assert.equal(s.sessionKey.toBase58(), sessionKpA.publicKey.toBase58());
  });

  it("memberB authorizes session key for main room", async () => {
    // memberB must sign with their own keypair.
    const tx = await program.methods
      .createSession(sessionKpB.publicKey, new BN(nowSec + 7200))
      .accounts({
        member: memberB.publicKey,
        room: roomPda,
        // @ts-ignore
        roomSession: sessionPdaB,
        systemProgram: web3.SystemProgram.programId,
      })
      .transaction();
    await anchor.web3.sendAndConfirmTransaction(
      provider.connection,
      tx,
      [memberB],
      { skipPreflight: true },
    );

    const s = await program.account.roomSession.fetch(sessionPdaB);
    assert.equal(s.sessionKey.toBase58(), sessionKpB.publicKey.toBase58());
  });

  // ── Delegation ────────────────────────────────────────────────────────────

  it("delegates main room and waits for SubmissionOpen in ER", async () => {
    await program.methods
      .delegateRoom(roomId)
      .accounts({
        payer: creator.publicKey,
        // @ts-ignore
        pda: roomPda,
      })
      .remainingAccounts([
        { pubkey: validatorIdentity, isSigner: false, isWritable: false },
      ])
      .rpc({ skipPreflight: true });

    await waitUntil(() => isDelegated(roomPda), "main room delegated");

    await waitUntil(
      async () => {
        const room = await erProgram.account.room.fetch(roomPda);
        return room.status.submissionOpen !== undefined;
      },
      "SubmissionOpen in ER",
    );
  });

  // ── Sealed bid submission ─────────────────────────────────────────────────

  it("memberA submits sealed commitment via session key — main wallet never signs", async () => {
    const commitment = sealedCommitment(BID_AMOUNT_A, SALT_A);

    // Only `sessionKpA` signs — memberA's wallet is absent.
    const tx = await erProgram.methods
      .submitBid(commitment)
      .accounts({
        signer: sessionKpA.publicKey,
        room: roomPda,
        // @ts-ignore
        roomSession: sessionPdaA,
      })
      .transaction();
    const result = await sendToER(tx, sessionKpA, [sessionKpA]);
    assert.isNull(result.value.err, "memberA submit should succeed");

    const room = await erProgram.account.room.fetch(roomPda);
    assert.equal(room.submissions.length, 1);
    const sub = room.submissions[0];
    assert.equal(sub.member.toBase58(), memberA.publicKey.toBase58());

    // Verify no plaintext bid amount is readable.
    const stored = Array.from(sub.commitment as unknown as number[]);
    assert.notEqual(
      BigInt(
        "0x" +
          Buffer.from(stored.slice(0, 8).reverse()).toString("hex"),
      ),
      BID_AMOUNT_A,
      "stored bytes must not be the raw bid amount",
    );
    assert.equal(stored.length, 32, "commitment is exactly 32 bytes");
    assert.deepEqual(stored, commitment, "commitment round-trips correctly");
  });

  it("memberB submits sealed commitment via their session key", async () => {
    const commitment = sealedCommitment(BID_AMOUNT_B, SALT_B);

    const tx = await erProgram.methods
      .submitBid(commitment)
      .accounts({
        signer: sessionKpB.publicKey,
        room: roomPda,
        // @ts-ignore
        roomSession: sessionPdaB,
      })
      .transaction();
    const result = await sendToER(tx, sessionKpB, [sessionKpB]);
    assert.isNull(result.value.err, "memberB submit should succeed");

    const room = await erProgram.account.room.fetch(roomPda);
    assert.equal(
      room.submissions.length,
      2,
      "both members have now committed",
    );
    const members = room.submissions.map((s) => s.member.toBase58());
    assert.include(members, memberB.publicKey.toBase58());
  });

  it("all stored commitments are 32-byte opaque hashes — no plaintext amounts", async () => {
    const room = await erProgram.account.room.fetch(roomPda);
    for (const sub of room.submissions) {
      const stored = Array.from(sub.commitment as unknown as number[]);
      assert.equal(stored.length, 32, "each commitment is exactly 32 bytes");
      // The raw bid amounts (750_000 and 250_000) would be tiny u64 values;
      // a sha256 hash is uniformly distributed — its first 4 bytes are very
      // unlikely to equal either amount. The assertion is statistical but
      // extremely reliable in practice.
      const firstU32 = Buffer.from(stored.slice(0, 4)).readUInt32LE(0);
      assert.notEqual(firstU32, 750_000, "raw amount not in hash (memberA)");
      assert.notEqual(firstU32, 250_000, "raw amount not in hash (memberB)");
    }
  });

  it("duplicate submission from memberA is rejected on-chain", async () => {
    const commitment = sealedCommitment(BigInt(999_999), BigInt(0xabcd));

    const tx = await erProgram.methods
      .submitBid(commitment)
      .accounts({
        signer: sessionKpA.publicKey,
        room: roomPda,
        // @ts-ignore
        roomSession: sessionPdaA,
      })
      .transaction();
    const result = await sendToER(tx, sessionKpA, [sessionKpA]);
    assert.isNotNull(result.value.err, "duplicate submit must be rejected");
    console.log(
      "  (duplicate rejection) on-chain error:",
      JSON.stringify(result.value.err),
    );
  });

  // ── Deadline enforcement ──────────────────────────────────────────────────

  it("delegates expired room and opens submissions", async () => {
    await program.methods
      .delegateRoom(expiredRoomId)
      .accounts({
        payer: creator.publicKey,
        // @ts-ignore
        pda: expiredRoomPda,
      })
      .remainingAccounts([
        { pubkey: validatorIdentity, isSigner: false, isWritable: false },
      ])
      .rpc({ skipPreflight: true });

    await waitUntil(() => isDelegated(expiredRoomPda), "expired room delegated");
    await waitUntil(
      async () => {
        const room = await erProgram.account.room.fetch(expiredRoomPda);
        return room.status.submissionOpen !== undefined;
      },
      "expired room SubmissionOpen in ER",
    );
  });

  it("submission to expired room is rejected after deadline (SubmissionClosed)", async () => {
    // Wait until the 2-second window has definitely closed.
    await new Promise((r) => setTimeout(r, 4_000));

    const commitment = sealedCommitment(BigInt(100), BigInt(0x1234));
    const tx = await erProgram.methods
      .submitBid(commitment)
      .accounts({
        signer: creator.publicKey,
        room: expiredRoomPda,
        // Anchor 1.x requires the optional slot to be present; pass the
        // program's own ID as the sentinel for "no session token".
        // @ts-ignore
        roomSession: program.programId,
      })
      .transaction();
    tx.feePayer = creator.publicKey;
    tx.recentBlockhash = (
      await providerER.connection.getLatestBlockhash()
    ).blockhash;
    tx.sign(creator);
    const sig = await providerER.connection.sendRawTransaction(
      tx.serialize(),
      { skipPreflight: true },
    );
    const result = await providerER.connection.confirmTransaction(sig, "confirmed");
    assert.isNotNull(result.value.err, "late submission must be rejected on-chain");
    console.log(
      "  (deadline rejection) on-chain error:",
      JSON.stringify(result.value.err),
    );
  });

  // ── Final state ───────────────────────────────────────────────────────────

  it("undelegates main room and confirms both submissions survive on base layer", async () => {
    const tx = await program.methods
      .undelegateRoom(roomId)
      .accounts({
        payer: creator.publicKey,
        // @ts-ignore
        room: roomPda,
      })
      .transaction();
    tx.feePayer = creator.publicKey;
    tx.recentBlockhash = (
      await providerER.connection.getLatestBlockhash()
    ).blockhash;
    tx.sign(creator);
    const sig = await providerER.connection.sendRawTransaction(
      tx.serialize(),
      { skipPreflight: true },
    );
    await providerER.connection.confirmTransaction(sig, "confirmed");

    await waitUntil(
      async () => !(await isDelegated(roomPda)),
      "main room undelegated",
    );

    const room = await program.account.room.fetch(roomPda);
    assert.equal(
      room.submissions.length,
      2,
      "both sealed commitments committed to base layer",
    );
    // Still no plaintext — just 32-byte hashes on base layer too.
    for (const sub of room.submissions) {
      assert.equal(
        (sub.commitment as unknown as number[]).length,
        32,
        "commitment is 32 bytes on base layer",
      );
    }
  });
});
