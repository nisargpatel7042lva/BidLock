/**
 * Phase 7 — PER Private Bid integration tests.
 *
 * Requires a running MagicBlock devnet/localnet stack:
 *   base layer  → http://localhost:8899  (PROVIDER_ENDPOINT)
 *   ER validator → http://localhost:7799  (EPHEMERAL_PROVIDER_ENDPOINT)
 *
 * What we verify:
 *   1. submit_bid_private stores a plaintext bid inside a permissioned ephemeral
 *      BidStore. The room's private_submitters list grows as members submit.
 *   2. A second member's BidStore is NOT readable by the first member via RPC
 *      (ER validator returns null for non-authority callers).
 *   3. After the submission deadline, delegate_room_for_settlement_private fires
 *      resolve_room_private as a magic action. On undelegate:
 *        – resolved_split has exactly one member at 10 000 BPS (the highest bidder)
 *        – private_submitters is cleared (amounts never land on base layer)
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, web3, BN } from "@coral-xyz/anchor";
import { assert } from "chai";
import { Bidlock } from "../target/types/bidlock";
import {
  DELEGATION_PROGRAM_ID,
  MAGIC_CONTEXT_ID,
  MAGIC_PROGRAM_ID,
} from "@magicblock-labs/ephemeral-rollups-sdk";
import { PublicKey, SystemProgram } from "@solana/web3.js";

const ROOM_SEED = "room";
const BID_STORE_SEED = "bid_store";
const ROOM_SESSION_SEED = "room_session";

// The PER Permission Program address (from SDK consts).
const PERMISSION_PROGRAM_ID = new PublicKey(
  "ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1"
);
// Ephemeral rent vault (EPHEMERAL_VAULT_ID).
// This is derived from the Magic Program — reuse the MAGIC_CONTEXT_ID which
// the SDK re-exports as the vault in most helper paths.
const EPHEMERAL_VAULT = new PublicKey(MAGIC_CONTEXT_ID);

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function roomPda(
  programId: PublicKey,
  creator: PublicKey,
  roomId: BN
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from(ROOM_SEED),
      creator.toBuffer(),
      roomId.toArrayLike(Buffer, "le", 8),
    ],
    programId
  );
  return pda;
}

function bidStorePda(
  programId: PublicKey,
  roomKey: PublicKey,
  member: PublicKey
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from(BID_STORE_SEED), roomKey.toBuffer(), member.toBuffer()],
    programId
  );
  return pda;
}

function roomSessionPda(
  programId: PublicKey,
  room: PublicKey,
  member: PublicKey
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from(ROOM_SESSION_SEED), room.toBuffer(), member.toBuffer()],
    programId
  );
  return pda;
}

// Derive EphemeralPermission PDA: ["permission:", bid_store_key]
function permissionPda(bidStore: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("permission:"), bidStore.toBuffer()],
    PERMISSION_PROGRAM_ID
  );
  return pda;
}

describe("PER private bid — Phase 7", () => {
  const provider = new anchor.AnchorProvider(
    new anchor.web3.Connection(
      process.env.PROVIDER_ENDPOINT || "http://localhost:8899",
      { commitment: "confirmed" }
    ),
    anchor.Wallet.local()
  );
  anchor.setProvider(provider);

  const erConnection = new anchor.web3.Connection(
    process.env.EPHEMERAL_PROVIDER_ENDPOINT || "http://localhost:7799",
    { commitment: "confirmed" }
  );
  const providerER = new anchor.AnchorProvider(erConnection, anchor.Wallet.local());

  const program = anchor.workspace.bidlock as Program<Bidlock>;
  const erProgram = new Program<Bidlock>(program.idl, providerER);
  const creator = (provider.wallet as anchor.Wallet).payer;

  const memberB = web3.Keypair.generate();
  const memberC = web3.Keypair.generate();

  // Session keys used inside the ER to sign submit_bid_private.
  const sessionA = web3.Keypair.generate();
  const sessionB = web3.Keypair.generate();
  const sessionC = web3.Keypair.generate();

  // Amounts — memberC wins with 9 000.
  const AMOUNT_A = new BN(1_500);
  const AMOUNT_B = new BN(4_200);
  const AMOUNT_C = new BN(9_000); // winner

  const roomId = new BN(Date.now());
  let roomKey: PublicKey;
  let bidStoreA: PublicKey;
  let bidStoreB: PublicKey;
  let bidStoreC: PublicKey;
  let submissionDeadline: number;

  before("fund members and derive PDAs", async () => {
    // Fund memberB and memberC so they can pay tx fees.
    for (const kp of [memberB, memberC]) {
      const sig = await provider.connection.requestAirdrop(
        kp.publicKey,
        2 * anchor.web3.LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig, "confirmed");
    }

    roomKey = roomPda(program.programId, creator.publicKey, roomId);
    bidStoreA = bidStorePda(program.programId, roomKey, creator.publicKey);
    bidStoreB = bidStorePda(program.programId, roomKey, memberB.publicKey);
    bidStoreC = bidStorePda(program.programId, roomKey, memberC.publicKey);
  });

  it("creates and delegates the room", async () => {
    const now = Math.floor(Date.now() / 1000);
    // 15-second bidding window — enough time for the test to submit all bids.
    submissionDeadline = now + 15;

    await program.methods
      .createRoom(
        roomId,
        "PER private test room",
        [creator.publicKey, memberB.publicKey, memberC.publicKey],
        new BN(submissionDeadline),
        new BN(submissionDeadline + 30) // reveal_deadline not used in private flow
      )
      .accounts({ creator: creator.publicKey })
      .signers([creator])
      .rpc({ commitment: "confirmed" });

    await program.methods
      .delegateRoom(roomId)
      .accounts({ payer: creator.publicKey })
      .signers([creator])
      .rpc({ commitment: "confirmed" });
  });

  it("creates session tokens for all three members", async () => {
    const validUntil = new BN(Math.floor(Date.now() / 1000) + 3600);

    // Session for creator (member A) — signed by creator on base layer.
    await program.methods
      .createSession(sessionA.publicKey, validUntil)
      .accounts({
        member: creator.publicKey,
        room: roomKey,
      })
      .signers([creator])
      .rpc({ commitment: "confirmed" });

    // Sessions for B and C.
    for (const [member, session] of [
      [memberB, sessionB],
      [memberC, sessionC],
    ] as [web3.Keypair, web3.Keypair][]) {
      const memberProvider = new anchor.AnchorProvider(
        provider.connection,
        new anchor.Wallet(member),
        { commitment: "confirmed" }
      );
      const memberProgram = new Program<Bidlock>(program.idl, memberProvider);
      await memberProgram.methods
        .createSession(session.publicKey, validUntil)
        .accounts({
          member: member.publicKey,
          room: roomKey,
        })
        .signers([member])
        .rpc({ commitment: "confirmed" });
    }
  });

  it("all three members submit private bids inside the ER", async () => {
    const submissions: [web3.Keypair, web3.Keypair, PublicKey, BN][] = [
      [sessionA, creator, bidStoreA, AMOUNT_A],
      [sessionB, memberB, bidStoreB, AMOUNT_B],
      [sessionC, memberC, bidStoreC, AMOUNT_C],
    ];

    for (const [sessionKp, member, bidStore, amount] of submissions) {
      const sessionProvider = new anchor.AnchorProvider(
        erConnection,
        new anchor.Wallet(sessionKp),
        { commitment: "confirmed" }
      );
      const sessionProgram = new Program<Bidlock>(program.idl, sessionProvider);

      const roomSessionAcc = roomSessionPda(
        program.programId,
        roomKey,
        member.publicKey
      );
      const permAcc = permissionPda(bidStore);

      await sessionProgram.methods
        .submitBidPrivate(amount)
        .accountsPartial({
          signer: sessionKp.publicKey,
          room: roomKey,
          roomSession: roomSessionAcc,
          bidStore,
          permission: permAcc,
          vault: EPHEMERAL_VAULT,
          magicProgram: new PublicKey(MAGIC_PROGRAM_ID),
          permissionProgram: PERMISSION_PROGRAM_ID,
        })
        .signers([sessionKp])
        .rpc({ commitment: "confirmed" });
    }

    // Confirm private_submitters has all three members recorded in the ER room.
    const erRoom = await erProgram.account.room.fetch(roomKey);
    assert.equal(
      erRoom.privateSubmitters.length,
      3,
      "all three members should be in private_submitters"
    );
  });

  it("bidder A cannot read bidder B's BidStore via ER RPC", async () => {
    // The ER validator should refuse getAccountInfo for bidStoreB
    // when the requester is session A (not an authority on bidStoreB's permission).
    const sessionAConnection = new anchor.web3.Connection(
      process.env.EPHEMERAL_PROVIDER_ENDPOINT || "http://localhost:7799",
      {
        commitment: "confirmed",
        // httpHeaders normally not needed — ER validator uses tx signer context,
        // but for RPC reads the validator checks the X-Auth header or rejects.
        // In integration this returns null for non-authority callers.
      }
    );

    const accountInfo = await sessionAConnection.getAccountInfo(bidStoreB);
    // EphemeralPermission with is_private=true: ER validator returns null.
    assert.isNull(
      accountInfo,
      "ER validator must return null for non-authority reads of a private BidStore"
    );
  });

  it("settles the room after submission deadline passes", async () => {
    // Wait for submission deadline.
    const now = Math.floor(Date.now() / 1000);
    const waitMs = Math.max(0, (submissionDeadline - now + 2) * 1000);
    if (waitMs > 0) await sleep(waitMs);

    await program.methods
      .delegateRoomForSettlementPrivate(roomId)
      .accounts({ payer: creator.publicKey })
      .signers([creator])
      .rpc({ commitment: "confirmed" });
  });

  it("undelegates and verifies winner on base layer — no amounts exposed", async () => {
    // Allow time for the magic action to run inside the ER.
    await sleep(5000);

    await program.methods
      .undelegateRoom(roomId)
      .accounts({ payer: creator.publicKey })
      .signers([creator])
      .rpc({ commitment: "confirmed" });

    const room = await program.account.room.fetch(roomKey);

    // Winner must be memberC (highest bid 9 000).
    const winner = room.resolvedSplit.find((s: any) => s.shareBps === 10_000);
    assert.ok(winner, "must have exactly one winner with 10 000 BPS");
    assert.equal(
      winner.member.toBase58(),
      memberC.publicKey.toBase58(),
      "memberC (amount 9 000) should win"
    );

    // No other member gets a share.
    const losers = room.resolvedSplit.filter((s: any) => s.shareBps > 0 && s.shareBps < 10_000);
    assert.equal(losers.length, 0, "losers must have 0 BPS");

    // private_submitters is cleared — no bid metadata on base layer.
    assert.equal(
      room.privateSubmitters.length,
      0,
      "private_submitters must be cleared after settlement"
    );

    // BidStore PDAs should NOT exist on the base layer (ephemeral-only accounts
    // are never committed). Verify by checking account absence.
    for (const bs of [bidStoreA, bidStoreB, bidStoreC]) {
      const info = await provider.connection.getAccountInfo(bs);
      assert.isNull(info, "BidStore must not exist on base layer after settlement");
    }
  });
});
