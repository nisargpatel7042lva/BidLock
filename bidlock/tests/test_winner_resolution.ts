import * as anchor from "@coral-xyz/anchor";
import { Program, web3, BN } from "@coral-xyz/anchor";
import { assert } from "chai";
import { createHash } from "crypto";
import { Bidlock } from "../target/types/bidlock";
import { DELEGATION_PROGRAM_ID } from "@magicblock-labs/ephemeral-rollups-sdk";

const ROOM_SEED = "room";

// sha256(amount_le_8bytes || salt_32bytes) — mirrors the on-chain reveal_bid logic.
function sealedCommitment(amount: bigint, salt: Buffer): number[] {
  const amountBuf = Buffer.alloc(8);
  amountBuf.writeBigUInt64LE(amount);
  const hash = createHash("sha256").update(amountBuf).update(salt).digest();
  return Array.from(hash);
}

describe("winner-resolution — Phase 6 settlement", () => {
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

  // Two extra members — funded from the creator wallet.
  const memberB = web3.Keypair.generate();
  const memberC = web3.Keypair.generate();

  // Session keypairs for ER submissions.
  const sessionA = web3.Keypair.generate();
  const sessionB = web3.Keypair.generate();
  const sessionC = web3.Keypair.generate();

  // Bid amounts (memberB wins with the highest amount).
  const AMOUNT_A = BigInt(1_000);
  const AMOUNT_B = BigInt(3_500); // ← winner
  const AMOUNT_C = BigInt(2_200);
  const SALT_A = Buffer.alloc(32, 0x11);
  const SALT_B = Buffer.alloc(32, 0x22);
  const SALT_C = Buffer.alloc(32, 0x33);

  const roomId = new BN(Date.now());

  // Use tight deadlines (10 s apart) so the test doesn't take long.
  let submissionDeadline: number;
  let revealDeadline: number;

  const [roomPda] = web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from(ROOM_SEED),
      creator.publicKey.toBuffer(),
      roomId.toArrayLike(Buffer, "le", 8),
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
    tries = 60,
    intervalMs = 500,
  ): Promise<void> {
    for (let i = 0; i < tries; i++) {
      if (await pred()) return;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error(`Timed out waiting for: ${label}`);
  }

  async function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ─── SETUP ────────────────────────────────────────────────────────────────

  it("funds extra members and session keypairs", async () => {
    const fundTx = new web3.Transaction();
    const lamports = 0.05 * anchor.web3.LAMPORTS_PER_SOL;
    for (const pk of [
      memberB.publicKey,
      memberC.publicKey,
      sessionA.publicKey,
      sessionB.publicKey,
      sessionC.publicKey,
    ]) {
      fundTx.add(
        web3.SystemProgram.transfer({
          fromPubkey: creator.publicKey,
          toPubkey: pk,
          lamports,
        }),
      );
    }
    fundTx.feePayer = creator.publicKey;
    fundTx.recentBlockhash = (
      await provider.connection.getLatestBlockhash()
    ).blockhash;
    fundTx.sign(creator);
    await provider.connection.sendRawTransaction(fundTx.serialize(), {
      skipPreflight: true,
    });
    await sleep(2000); // let it confirm
  });

  it("creates room with 3 members and tight deadlines", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    submissionDeadline = nowSec + 10; // 10 s from now
    revealDeadline = nowSec + 22; // 12 s after submission closes

    await program.methods
      .createRoom(
        roomId,
        "winner-resolution test room",
        [creator.publicKey, memberB.publicKey, memberC.publicKey],
        new BN(submissionDeadline),
        new BN(revealDeadline),
      )
      .accounts({
        creator: creator.publicKey,
        // @ts-ignore
        room: roomPda,
        systemProgram: web3.SystemProgram.programId,
      })
      .rpc({ skipPreflight: true });

    const room = await program.account.room.fetch(roomPda);
    assert.equal(room.members.length, 3);
    assert.isEmpty(room.submissions);
    assert.isEmpty(room.reveals);
    assert.isEmpty(room.resolvedSplit);
  });

  // ─── SUBMISSION PHASE (ER) ────────────────────────────────────────────────

  it("each member creates a session key", async () => {
    const validUntil = new BN(Math.floor(Date.now() / 1000) + 3600);
    const ROOM_SESSION_SEED = "room_session";

    const [sessionPdaA] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from(ROOM_SESSION_SEED), roomPda.toBuffer(), creator.publicKey.toBuffer()],
      program.programId,
    );
    const [sessionPdaB] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from(ROOM_SESSION_SEED), roomPda.toBuffer(), memberB.publicKey.toBuffer()],
      program.programId,
    );
    const [sessionPdaC] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from(ROOM_SESSION_SEED), roomPda.toBuffer(), memberC.publicKey.toBuffer()],
      program.programId,
    );

    for (const [member, sessionKp, sessionPda] of [
      [creator, sessionA, sessionPdaA],
      [memberB, sessionB, sessionPdaB],
      [memberC, sessionC, sessionPdaC],
    ] as const) {
      await program.methods
        .createSession((sessionKp as web3.Keypair).publicKey, validUntil)
        .accounts({
          member: (member as web3.Keypair).publicKey,
          room: roomPda,
          // @ts-ignore
          roomSession: sessionPda,
          systemProgram: web3.SystemProgram.programId,
        })
        .signers([member as web3.Keypair])
        .rpc({ skipPreflight: true });
    }
  });

  it("delegates room to ER (open_submission fires automatically)", async () => {
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

    await waitUntil(() => isDelegated(roomPda), "room delegated");
    assert.isTrue(await isDelegated(roomPda));

    await waitUntil(
      async () => {
        const r = await erProgram.account.room.fetch(roomPda);
        return r.status.submissionOpen !== undefined;
      },
      "SubmissionOpen in ER",
    );
  });

  it("each member submits a sealed commitment via session key in the ER", async () => {
    const ROOM_SESSION_SEED = "room_session";

    const members = [
      { kp: creator, sessionKp: sessionA, amount: AMOUNT_A, salt: SALT_A },
      { kp: memberB, sessionKp: sessionB, amount: AMOUNT_B, salt: SALT_B },
      { kp: memberC, sessionKp: sessionC, amount: AMOUNT_C, salt: SALT_C },
    ];

    for (const { kp, sessionKp, amount, salt } of members) {
      const [sessionPda] = web3.PublicKey.findProgramAddressSync(
        [Buffer.from(ROOM_SESSION_SEED), roomPda.toBuffer(), kp.publicKey.toBuffer()],
        program.programId,
      );
      const commitment = sealedCommitment(amount, salt);

      const tx = await erProgram.methods
        .submitBid(commitment)
        .accounts({
          signer: sessionKp.publicKey,
          room: roomPda,
          // @ts-ignore
          roomSession: sessionPda,
        })
        .transaction();
      tx.feePayer = sessionKp.publicKey;
      tx.recentBlockhash = (
        await providerER.connection.getLatestBlockhash()
      ).blockhash;
      tx.sign(sessionKp);
      const sig = await providerER.connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: true,
      });
      await providerER.connection.confirmTransaction(sig, "confirmed");
    }

    const room = await erProgram.account.room.fetch(roomPda);
    assert.equal(room.submissions.length, 3, "all 3 commitments must be in ER");
  });

  it("undelegates room — submissions committed to base layer", async () => {
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
    const sig = await providerER.connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: true,
    });
    await providerER.connection.confirmTransaction(sig, "confirmed");

    await waitUntil(() => isDelegated(roomPda).then((d) => !d), "room undelegated");
    assert.isFalse(await isDelegated(roomPda));

    const room = await program.account.room.fetch(roomPda);
    assert.equal(room.submissions.length, 3, "submissions must survive undelegate");
  });

  // ─── REVEAL PHASE (base layer, after submission deadline) ─────────────────

  it("waits for submission deadline, then each member reveals their bid", async () => {
    const nowMs = Date.now();
    const deadlineMs = submissionDeadline * 1000;
    if (nowMs < deadlineMs) {
      await sleep(deadlineMs - nowMs + 2000); // +2 s buffer
    }

    const members = [
      { kp: creator, amount: AMOUNT_A, salt: SALT_A },
      { kp: memberB, amount: AMOUNT_B, salt: SALT_B },
      { kp: memberC, amount: AMOUNT_C, salt: SALT_C },
    ];

    for (const { kp, amount, salt } of members) {
      await program.methods
        .revealBid(new BN(amount.toString()), Array.from(salt))
        .accounts({
          member: kp.publicKey,
          room: roomPda,
        })
        .signers([kp])
        .rpc({ skipPreflight: true });
    }

    const room = await program.account.room.fetch(roomPda);
    assert.equal(room.reveals.length, 3, "all 3 reveals must be recorded");
    // All should be valid (correct amounts and salts used).
    assert.isTrue(
      (room.reveals as any[]).every((r) => r.valid),
      "all reveals must be valid",
    );
  });

  // ─── SETTLEMENT (base layer → ER magic action → base layer) ───────────────

  it("waits for reveal deadline, then delegates for settlement (resolve_room magic action fires)", async () => {
    const nowMs = Date.now();
    const deadlineMs = revealDeadline * 1000;
    if (nowMs < deadlineMs) {
      await sleep(deadlineMs - nowMs + 2000); // +2 s buffer
    }

    await program.methods
      .delegateRoomForSettlement(roomId)
      .accounts({
        payer: creator.publicKey,
        // @ts-ignore
        pda: roomPda,
      })
      .remainingAccounts([
        { pubkey: validatorIdentity, isSigner: false, isWritable: false },
      ])
      .rpc({ skipPreflight: true });

    await waitUntil(() => isDelegated(roomPda), "room delegated for settlement");

    // Wait for the resolve_room magic action to run in the ER.
    await waitUntil(
      async () => {
        const r = await erProgram.account.room.fetch(roomPda);
        return r.status.resolved !== undefined;
      },
      "room Resolved in ER after magic action",
    );

    const roomInER = await erProgram.account.room.fetch(roomPda);
    assert.isTrue(
      roomInER.status.resolved !== undefined,
      "resolve_room must have run inside the ER",
    );
    // Reveals are cleared — losing amounts are NOT in ER state either.
    assert.isEmpty(
      roomInER.reveals,
      "reveals must be cleared inside ER before committing to base layer",
    );
  });

  it("undelegates room — resolved state (winner only) commits to base layer", async () => {
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
    const sig = await providerER.connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: true,
    });
    await providerER.connection.confirmTransaction(sig, "confirmed");

    await waitUntil(() => isDelegated(roomPda).then((d) => !d), "room undelegated");
  });

  it("confirms correct winner on base layer with losing amounts not recoverable", async () => {
    const room = await program.account.room.fetch(roomPda);

    // Status is Resolved.
    assert.isTrue(
      room.status.resolved !== undefined,
      "room must be Resolved on base layer",
    );

    // memberB (AMOUNT_B = 3500) has the highest bid → wins.
    const splitB = (room.resolvedSplit as any[]).find(
      (s) => s.member.toBase58() === memberB.publicKey.toBase58(),
    );
    assert.isDefined(splitB, "memberB must appear in resolvedSplit");
    assert.equal(splitB.shareBps, 10_000, "winner must receive 10_000 BPS");

    const splitA = (room.resolvedSplit as any[]).find(
      (s) => s.member.toBase58() === creator.publicKey.toBase58(),
    );
    const splitC = (room.resolvedSplit as any[]).find(
      (s) => s.member.toBase58() === memberC.publicKey.toBase58(),
    );
    assert.equal(splitA.shareBps, 0, "loser A must receive 0 BPS");
    assert.equal(splitC.shareBps, 0, "loser C must receive 0 BPS");

    // Reveals are cleared — losing bid amounts are not recoverable.
    assert.isEmpty(
      room.reveals,
      "reveals must be empty — no bid amounts on base layer",
    );

    // The resolved_split does NOT store any bid amount — only who won (BPS).
    const anyAmountLeaked = (room.resolvedSplit as any[]).some(
      (s) =>
        s.shareBps === Number(AMOUNT_A) ||
        s.shareBps === Number(AMOUNT_B) ||
        s.shareBps === Number(AMOUNT_C),
    );
    assert.isFalse(
      anyAmountLeaked,
      "bid amounts must not be recoverable from resolvedSplit",
    );
  });
});
