use anchor_lang::prelude::{Clock, Pubkey};
use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use bidlock::ID as PROGRAM_ID;
use litesvm::LiteSVM;
use sha2::{Digest, Sha256};
use solana_keypair::Keypair;
use solana_message::VersionedMessage;
use solana_signer::Signer;
use solana_transaction::versioned::VersionedTransaction;

const PROGRAM_BYTES: &[u8] = include_bytes!("../../../target/deploy/bidlock.so");

// ─── Helpers ────────────────────────────────────────────────────────────────

fn setup() -> LiteSVM {
    let mut svm = LiteSVM::new();
    svm.add_program(PROGRAM_ID, PROGRAM_BYTES).unwrap();
    svm
}

fn fund(svm: &mut LiteSVM, pubkey: &Pubkey) {
    svm.airdrop(pubkey, 10_000_000_000).unwrap();
}

fn room_pda(creator: &Pubkey, room_id: u64) -> Pubkey {
    Pubkey::find_program_address(
        &[
            bidlock::ROOM_SEED.as_bytes(),
            creator.as_ref(),
            room_id.to_le_bytes().as_ref(),
        ],
        &PROGRAM_ID,
    )
    .0
}

fn sha256_commitment(amount: u64, salt: [u8; 32]) -> [u8; 32] {
    Sha256::new()
        .chain_update(amount.to_le_bytes())
        .chain_update(salt)
        .finalize()
        .into()
}

type TxResult = Result<
    litesvm::types::TransactionMetadata,
    litesvm::types::FailedTransactionMetadata,
>;

fn send_single(
    svm: &mut LiteSVM,
    ix: anchor_lang::solana_program::instruction::Instruction,
    payer: &Keypair,
    signers: &[&Keypair],
) -> TxResult {
    let blockhash = svm.latest_blockhash();
    let msg = VersionedMessage::Legacy(solana_message::Message::new_with_blockhash(
        &[ix],
        Some(&payer.pubkey()),
        &blockhash,
    ));
    let tx = VersionedTransaction::try_new(msg, signers).unwrap();
    svm.send_transaction(tx)
}

fn set_clock(svm: &mut LiteSVM, ts: i64) {
    let mut c = svm.get_sysvar::<Clock>();
    c.unix_timestamp = ts;
    svm.set_sysvar::<Clock>(&c);
}

fn create_room_ix(
    creator: Pubkey,
    room: Pubkey,
    room_id: u64,
    members: Vec<Pubkey>,
    sub_dl: i64,
    rev_dl: i64,
) -> anchor_lang::solana_program::instruction::Instruction {
    let accounts = bidlock::accounts::CreateRoom {
        creator,
        room,
        system_program: anchor_lang::system_program::ID,
    };
    let data = bidlock::instruction::CreateRoom {
        room_id,
        pool_description: "test".to_string(),
        members,
        submission_deadline: sub_dl,
        reveal_deadline: rev_dl,
    };
    anchor_lang::solana_program::instruction::Instruction {
        program_id: PROGRAM_ID,
        accounts: accounts.to_account_metas(None),
        data: data.data(),
    }
}

fn open_submission_ix(room: Pubkey) -> anchor_lang::solana_program::instruction::Instruction {
    anchor_lang::solana_program::instruction::Instruction {
        program_id: PROGRAM_ID,
        accounts: vec![anchor_lang::solana_program::instruction::AccountMeta::new(
            room, false,
        )],
        data: bidlock::instruction::OpenSubmission {}.data(),
    }
}

fn submit_bid_ix(
    signer: Pubkey,
    room: Pubkey,
    commitment: [u8; 32],
) -> anchor_lang::solana_program::instruction::Instruction {
    use anchor_lang::solana_program::instruction::AccountMeta;
    anchor_lang::solana_program::instruction::Instruction {
        program_id: PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(signer, true),
            AccountMeta::new(room, false),
            AccountMeta::new_readonly(PROGRAM_ID, false), // None sentinel
        ],
        data: bidlock::instruction::SubmitBid { commitment }.data(),
    }
}

fn reveal_bid_ix(
    member: Pubkey,
    room: Pubkey,
    amount: u64,
    salt: [u8; 32],
) -> anchor_lang::solana_program::instruction::Instruction {
    let accounts = bidlock::accounts::RevealBid { member, room };
    let data = bidlock::instruction::RevealBid { amount, salt };
    anchor_lang::solana_program::instruction::Instruction {
        program_id: PROGRAM_ID,
        accounts: accounts.to_account_metas(None),
        data: data.data(),
    }
}

fn resolve_room_ix(room: Pubkey) -> anchor_lang::solana_program::instruction::Instruction {
    anchor_lang::solana_program::instruction::Instruction {
        program_id: PROGRAM_ID,
        accounts: vec![anchor_lang::solana_program::instruction::AccountMeta::new(
            room, false,
        )],
        data: bidlock::instruction::ResolveRoom {}.data(),
    }
}

/// Sets up a 3-member room, submits bids, advances clock past sub_dl,
/// reveals all bids, and returns the room PDA (clock is left past sub_dl).
/// Amounts: memberA=amount_a, memberB=amount_b, memberC=amount_c.
/// Set `invalid_c = true` to make memberC reveal the wrong amount (testing exclusion).
fn setup_room_with_reveals(
    svm: &mut LiteSVM,
    creator: &Keypair,      // memberA / room creator
    member_b: &Keypair,
    member_c: &Keypair,
    room_id: u64,
    sub_dl: i64,
    rev_dl: i64,
    amount_a: u64,
    amount_b: u64,
    amount_c: u64,
    invalid_c: bool, // if true, memberC reveals wrong amount
) -> Pubkey {
    let salt_a: [u8; 32] = [0x1a; 32];
    let salt_b: [u8; 32] = [0x2b; 32];
    let salt_c: [u8; 32] = [0x3c; 32];

    let commit_a = sha256_commitment(amount_a, salt_a);
    let commit_b = sha256_commitment(amount_b, salt_b);
    let commit_c = sha256_commitment(amount_c, salt_c);

    let room = room_pda(&creator.pubkey(), room_id);

    // Create room with 3 members.
    send_single(
        svm,
        create_room_ix(
            creator.pubkey(),
            room,
            room_id,
            vec![creator.pubkey(), member_b.pubkey(), member_c.pubkey()],
            sub_dl,
            rev_dl,
        ),
        creator,
        &[creator],
    )
    .expect("create_room");

    send_single(svm, open_submission_ix(room), creator, &[creator])
        .expect("open_submission");

    // Submit bids (clock is before sub_dl).
    send_single(svm, submit_bid_ix(creator.pubkey(), room, commit_a), creator, &[creator])
        .expect("submit_bid A");
    send_single(svm, submit_bid_ix(member_b.pubkey(), room, commit_b), member_b, &[member_b])
        .expect("submit_bid B");
    send_single(svm, submit_bid_ix(member_c.pubkey(), room, commit_c), member_c, &[member_c])
        .expect("submit_bid C");

    // Advance past submission deadline.
    set_clock(svm, sub_dl + 1);

    // Reveal bids.
    send_single(
        svm,
        reveal_bid_ix(creator.pubkey(), room, amount_a, salt_a),
        creator,
        &[creator],
    )
    .expect("reveal_bid A");

    send_single(
        svm,
        reveal_bid_ix(member_b.pubkey(), room, amount_b, salt_b),
        member_b,
        &[member_b],
    )
    .expect("reveal_bid B");

    let c_reveal_amount = if invalid_c { amount_c + 1 } else { amount_c };
    send_single(
        svm,
        reveal_bid_ix(member_c.pubkey(), room, c_reveal_amount, salt_c),
        member_c,
        &[member_c],
    )
    .expect("reveal_bid C");

    room
}

// ─── Tests ──────────────────────────────────────────────────────────────────

#[test]
fn resolve_room_selects_highest_valid_reveal() {
    let mut svm = setup();
    let creator = Keypair::new();
    let member_b = Keypair::new();
    let member_c = Keypair::new();
    fund(&mut svm, &creator.pubkey());
    fund(&mut svm, &member_b.pubkey());
    fund(&mut svm, &member_c.pubkey());

    // memberB has the highest bid.
    let room = setup_room_with_reveals(
        &mut svm,
        &creator,
        &member_b,
        &member_c,
        1,
        1_000,
        2_000,
        500,   // A
        1_500, // B ← winner
        300,   // C
        false,
    );

    let result = send_single(&mut svm, resolve_room_ix(room), &creator, &[&creator]);
    assert!(result.is_ok(), "resolve_room must succeed: {result:?}");

    let account = svm.get_account(&room).unwrap();
    let state = bidlock::Room::try_deserialize(&mut account.data.as_slice()).unwrap();

    assert_eq!(state.status, bidlock::RoomStatus::Resolved);

    // Winner (memberB) gets 10_000 BPS; others get 0.
    let split_b = state.resolved_split.iter().find(|s| s.member == member_b.pubkey()).unwrap();
    let split_a = state.resolved_split.iter().find(|s| s.member == creator.pubkey()).unwrap();
    let split_c = state.resolved_split.iter().find(|s| s.member == member_c.pubkey()).unwrap();

    assert_eq!(split_b.share_bps, 10_000, "winner must receive 10_000 BPS");
    assert_eq!(split_a.share_bps, 0);
    assert_eq!(split_c.share_bps, 0);

    // Reveals are cleared — no amounts on chain.
    assert!(state.reveals.is_empty(), "reveals must be wiped after resolution");
}

#[test]
fn resolve_room_excludes_invalid_reveals() {
    let mut svm = setup();
    let creator = Keypair::new();
    let member_b = Keypair::new();
    let member_c = Keypair::new();
    fund(&mut svm, &creator.pubkey());
    fund(&mut svm, &member_b.pubkey());
    fund(&mut svm, &member_c.pubkey());

    // memberC's reveal is invalid (wrong amount); memberA has the highest valid bid.
    let room = setup_room_with_reveals(
        &mut svm,
        &creator,
        &member_b,
        &member_c,
        2,
        1_000,
        2_000,
        2_000, // A ← highest VALID reveal
        1_000, // B
        9_999, // C committed to 9_999 but reveals wrong value → invalid
        true,  // C reveals invalid
    );

    send_single(&mut svm, resolve_room_ix(room), &creator, &[&creator])
        .expect("resolve_room must succeed");

    let account = svm.get_account(&room).unwrap();
    let state = bidlock::Room::try_deserialize(&mut account.data.as_slice()).unwrap();

    let split_a = state.resolved_split.iter().find(|s| s.member == creator.pubkey()).unwrap();
    assert_eq!(split_a.share_bps, 10_000, "memberA (highest valid) must win");

    let split_c = state.resolved_split.iter().find(|s| s.member == member_c.pubkey()).unwrap();
    assert_eq!(split_c.share_bps, 0, "invalid revealer must receive 0");

    assert!(state.reveals.is_empty());
}

#[test]
fn resolve_room_no_valid_reveals_rejected() {
    let mut svm = setup();
    let creator = Keypair::new();
    let member_b = Keypair::new();
    let member_c = Keypair::new();
    fund(&mut svm, &creator.pubkey());
    fund(&mut svm, &member_b.pubkey());
    fund(&mut svm, &member_c.pubkey());

    let sub_dl: i64 = 1_000;
    let room = room_pda(&creator.pubkey(), 3);

    send_single(
        &mut svm,
        create_room_ix(
            creator.pubkey(),
            room,
            3,
            vec![creator.pubkey(), member_b.pubkey(), member_c.pubkey()],
            sub_dl,
            2_000,
        ),
        &creator,
        &[&creator],
    )
    .expect("create_room");
    send_single(&mut svm, open_submission_ix(room), &creator, &[&creator]).expect("open");

    // Submit bids but reveal the WRONG amounts for all three → all invalid.
    for (kp, amount, salt) in [
        (&creator, 100u64, [0xaau8; 32]),
        (&member_b, 200, [0xbb; 32]),
        (&member_c, 300, [0xcc; 32]),
    ] {
        let commit = sha256_commitment(amount, salt);
        send_single(&mut svm, submit_bid_ix(kp.pubkey(), room, commit), kp, &[kp])
            .expect("submit");
    }

    set_clock(&mut svm, sub_dl + 1);

    // Reveal wrong amounts — all become invalid.
    for (kp, bad_amount, salt) in [
        (&creator, 999u64, [0xaau8; 32]),
        (&member_b, 999, [0xbb; 32]),
        (&member_c, 999, [0xcc; 32]),
    ] {
        send_single(
            &mut svm,
            reveal_bid_ix(kp.pubkey(), room, bad_amount, salt),
            kp,
            &[kp],
        )
        .expect("reveal (invalid)");
    }

    let result = send_single(&mut svm, resolve_room_ix(room), &creator, &[&creator]);
    assert!(result.is_err(), "resolve with no valid reveals must be rejected");
}

#[test]
fn resolve_room_already_resolved_rejected() {
    let mut svm = setup();
    let creator = Keypair::new();
    let member_b = Keypair::new();
    let member_c = Keypair::new();
    fund(&mut svm, &creator.pubkey());
    fund(&mut svm, &member_b.pubkey());
    fund(&mut svm, &member_c.pubkey());

    let room = setup_room_with_reveals(
        &mut svm,
        &creator,
        &member_b,
        &member_c,
        4,
        1_000,
        2_000,
        100,
        200,
        300,
        false,
    );

    send_single(&mut svm, resolve_room_ix(room), &creator, &[&creator])
        .expect("first resolve");

    let result = send_single(&mut svm, resolve_room_ix(room), &creator, &[&creator]);
    assert!(result.is_err(), "resolving an already-resolved room must fail");
}

#[test]
fn resolve_room_losing_amounts_not_on_chain() {
    let mut svm = setup();
    let creator = Keypair::new();
    let member_b = Keypair::new();
    let member_c = Keypair::new();
    fund(&mut svm, &creator.pubkey());
    fund(&mut svm, &member_b.pubkey());
    fund(&mut svm, &member_c.pubkey());

    // memberC wins with the highest bid.
    let winning_amount: u64 = 5_000;
    let room = setup_room_with_reveals(
        &mut svm,
        &creator,
        &member_b,
        &member_c,
        5,
        1_000,
        2_000,
        1_000,        // A
        2_000,        // B
        winning_amount, // C ← winner
        false,
    );

    send_single(&mut svm, resolve_room_ix(room), &creator, &[&creator])
        .expect("resolve_room");

    let account = svm.get_account(&room).unwrap();
    let state = bidlock::Room::try_deserialize(&mut account.data.as_slice()).unwrap();

    // The reveals Vec is empty — no bid amounts, winning or losing, are on chain.
    assert!(
        state.reveals.is_empty(),
        "all reveal amounts must be cleared after resolution"
    );

    // resolved_split exists and identifies the winner, but does NOT store amounts.
    assert_eq!(state.resolved_split.len(), 3);
    let split_c = state.resolved_split.iter().find(|s| s.member == member_c.pubkey()).unwrap();
    assert_eq!(split_c.share_bps, 10_000, "winner identified by BPS, not by stored amount");

    // The actual winning amount is NOT findable in any field.
    let amount_recoverable = state
        .resolved_split
        .iter()
        .any(|s| s.share_bps as u64 == winning_amount);
    assert!(!amount_recoverable, "winning bid amount must not be recoverable from base-layer state");
}
