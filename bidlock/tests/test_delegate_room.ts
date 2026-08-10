import * as anchor from "@coral-xyz/anchor";
import { Program, web3, BN } from "@coral-xyz/anchor";
import { assert } from "chai";
import { Bidlock } from "../target/types/bidlock";
import { DELEGATION_PROGRAM_ID } from "@magicblock-labs/ephemeral-rollups-sdk";

const ROOM_SEED = "room";

// Local MagicBlock stack: client -> base solana validator (8899) and, once
// delegated, the ER validator (7799) directly.
describe("delegate_room — Phase 2 delegation lifecycle", () => {
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

  // A fresh room id per test run so re-runs against a persistent local
  // validator never collide with a previously-created room PDA.
  const roomId = new BN(Date.now());
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

  async function isDelegated(): Promise<boolean> {
    const info = await provider.connection.getAccountInfo(roomPda);
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

  it("creates the room on the base layer", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    await program.methods
      .createRoom(
        roomId,
        "integration-test shared pool",
        [web3.Keypair.generate().publicKey, web3.Keypair.generate().publicKey],
        new BN(nowSec + 3600),
        new BN(nowSec + 7200),
      )
      .accounts({
        creator: creator.publicKey,
        // @ts-ignore room PDA is auto-derivable but explicit is clearer here
        room: roomPda,
        systemProgram: web3.SystemProgram.programId,
      })
      .rpc({ skipPreflight: true });

    const room = await program.account.room.fetch(roomPda);
    assert.equal(room.status.created !== undefined, true);
    assert.isFalse(await isDelegated());
  });

  it("delegates the room and confirms it is locked on the base layer", async () => {
    assert.isFalse(
      await isDelegated(),
      "room must not already be delegated before this test",
    );

    await program.methods
      .delegateRoom(roomId)
      .accounts({
        payer: creator.publicKey,
        // @ts-ignore `pda` is the generic delegated-account slot from the #[delegate] macro
        pda: roomPda,
      })
      .remainingAccounts([
        { pubkey: validatorIdentity, isSigner: false, isWritable: false },
      ])
      .rpc({ skipPreflight: true });

    await waitUntil(isDelegated, "room delegated (base-layer owner flips to the delegation program)");
    assert.isTrue(await isDelegated(), "room should be owned by the delegation program while delegated");

    // The room account itself is now owned by the delegation program, not
    // bidlock — so any base-layer instruction that touches it as `Account<Room>`
    // must fail. This is the "genuinely unusable on-chain while delegated" check.
    //
    // Built and sent manually (not via `.rpc()`): anchor@0.32.1's SendTransactionError
    // wrapping is incompatible with the installed @solana/web3.js patch version and
    // throws an uninformative "Unknown action 'undefined'" instead of surfacing the
    // real on-chain error, so we inspect the confirmation result directly instead.
    const tx = await program.methods
      .openSubmission()
      .accounts({
        // @ts-ignore
        room: roomPda,
      })
      .transaction();
    tx.feePayer = creator.publicKey;
    tx.recentBlockhash = (await provider.connection.getLatestBlockhash()).blockhash;
    tx.sign(creator);
    const sig = await provider.connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: true,
    });
    const confirmation = await provider.connection.confirmTransaction(sig, "confirmed");

    assert.isNotNull(confirmation.value.err, "expected a base-layer instruction touching the delegated room to fail on-chain");
    console.log("  (locked-account check) on-chain error:", JSON.stringify(confirmation.value.err));
  });

  it("confirms the post-delegation action opened submissions inside the ER", async () => {
    // The `open_submission` action was attached to delegate_room and runs
    // automatically inside the ER the instant delegation completes — no
    // second transaction from the creator.
    await waitUntil(
      async () => {
        const room = await erProgram.account.room.fetch(roomPda);
        return room.status.submissionOpen !== undefined;
      },
      "post-delegation action (room.status == SubmissionOpen in the ER)",
    );

    const room = await erProgram.account.room.fetch(roomPda);
    assert.isTrue(room.status.submissionOpen !== undefined);
  });

  it("undelegates the room and confirms it is usable again on the base layer", async () => {
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
      await providerEphemeralRollup.connection.getLatestBlockhash()
    ).blockhash;
    tx.sign(creator);
    const sig = await providerEphemeralRollup.connection.sendRawTransaction(
      tx.serialize(),
      { skipPreflight: true },
    );
    await providerEphemeralRollup.connection.confirmTransaction(sig, "confirmed");

    await waitUntil(async () => !(await isDelegated()), "undelegation (base-layer owner reverts to bidlock)");
    assert.isFalse(await isDelegated());

    const room = await program.account.room.fetch(roomPda);
    assert.isTrue(room.status.submissionOpen !== undefined, "committed state should carry over the ER's status change");
    assert.equal(room.creator.toBase58(), creator.publicKey.toBase58());
    assert.equal(room.roomId.toString(), roomId.toString());
  });
});
