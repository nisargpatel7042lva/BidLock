use anchor_lang::prelude::{Clock, Pubkey};
use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use bidlock::ID as PROGRAM_ID;
use litesvm::LiteSVM;
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

/// Compute sha256(amount_le || salt) — mirrors what reveal_bid does on-chain.
fn commitment_of(amount: u64, salt: [u8; 32]) -> [u8; 32] {
    use sha2::{Digest, Sha256};
    Sha256::new()
        .chain_update(amount.to_le_bytes())
        .chain_update(salt)
        .finalize()
        .into()
}

fn create_room_ix(
    creator: Pubkey,
    room: Pubkey,
    room_id: u64,
    members: Vec<Pubkey>,
    submission_deadline: i64,
    reveal_deadline: i64,
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
        submission_deadline,
        reveal_deadline,
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
    let metas = vec![
        AccountMeta::new(signer, true),
        AccountMeta::new(room, false),
        AccountMeta::new_readonly(PROGRAM_ID, false), // None sentinel for room_session
    ];
    anchor_lang::solana_program::instruction::Instruction {
        program_id: PROGRAM_ID,
        accounts: metas,
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
    let message = VersionedMessage::Legacy(solana_message::Message::new_with_blockhash(
        &[ix],
        Some(&payer.pubkey()),
        &blockhash,
    ));
    let tx = VersionedTransaction::try_new(message, signers).unwrap();
    svm.send_transaction(tx)
}

fn set_clock(svm: &mut LiteSVM, ts: i64) {
    let mut clock = svm.get_sysvar::<Clock>();
    clock.unix_timestamp = ts;
    svm.set_sysvar::<Clock>(&clock);
}

/// Creates a room, immediately opens submissions, submits a bid from `member`
/// with the given commitment, then returns the room PDA.
fn setup_room_with_bid(
    svm: &mut LiteSVM,
    creator: &Keypair,
    room_id: u64,
    submission_deadline: i64,
    reveal_deadline: i64,
    commitment: [u8; 32],
) -> Pubkey {
    let room = room_pda(&creator.pubkey(), room_id);

    send_single(
        svm,
        create_room_ix(
            creator.pubkey(),
            room,
            room_id,
            vec![creator.pubkey()],
            submission_deadline,
            reveal_deadline,
        ),
        creator,
        &[creator],
    )
    .expect("create_room failed");

    send_single(svm, open_submission_ix(room), creator, &[creator])
        .expect("open_submission failed");

    send_single(svm, submit_bid_ix(creator.pubkey(), room, commitment), creator, &[creator])
        .expect("submit_bid failed");

    room
}

// ─── Tests ──────────────────────────────────────────────────────────────────

#[test]
fn reveal_bid_correct_accepted() {
    let mut svm = setup();
    let creator = Keypair::new();
    fund(&mut svm, &creator.pubkey());

    let amount: u64 = 1_500_000;
    let salt: [u8; 32] = [0xde; 32];
    let commitment = commitment_of(amount, salt);

    let sub_dl: i64 = 1_000;
    let rev_dl: i64 = 2_000;
    let room = setup_room_with_bid(&mut svm, &creator, 1, sub_dl, rev_dl, commitment);

    // Advance past submission deadline.
    set_clock(&mut svm, sub_dl + 1);

    let result = send_single(
        &mut svm,
        reveal_bid_ix(creator.pubkey(), room, amount, salt),
        &creator,
        &[&creator],
    );
    assert!(result.is_ok(), "correct reveal must be accepted: {result:?}");

    let account = svm.get_account(&room).unwrap();
    let state = bidlock::Room::try_deserialize(&mut account.data.as_slice()).unwrap();
    assert_eq!(state.reveals.len(), 1);
    assert_eq!(state.reveals[0].member, creator.pubkey());
    assert_eq!(state.reveals[0].amount, amount);
    assert!(state.reveals[0].valid);
}

#[test]
fn reveal_bid_mismatch_marked_invalid() {
    let mut svm = setup();
    let creator = Keypair::new();
    fund(&mut svm, &creator.pubkey());

    let real_amount: u64 = 1_500_000;
    let salt: [u8; 32] = [0xde; 32];
    let commitment = commitment_of(real_amount, salt);

    let sub_dl: i64 = 1_000;
    let room = setup_room_with_bid(&mut svm, &creator, 2, sub_dl, 2_000, commitment);

    set_clock(&mut svm, sub_dl + 1);

    // Reveal with a different amount — hash will not match.
    let wrong_amount: u64 = 999;
    let result = send_single(
        &mut svm,
        reveal_bid_ix(creator.pubkey(), room, wrong_amount, salt),
        &creator,
        &[&creator],
    );
    assert!(result.is_ok(), "mismatched reveal should still land (marked invalid): {result:?}");

    let account = svm.get_account(&room).unwrap();
    let state = bidlock::Room::try_deserialize(&mut account.data.as_slice()).unwrap();
    assert_eq!(state.reveals.len(), 1);
    assert!(!state.reveals[0].valid, "reveal must be marked invalid");
    // Amount must be zeroed to avoid leaking the mismatched attempt.
    assert_eq!(state.reveals[0].amount, 0, "invalid reveal must store 0 for amount");
}

#[test]
fn reveal_bid_before_submission_deadline_rejected() {
    let mut svm = setup();
    let creator = Keypair::new();
    fund(&mut svm, &creator.pubkey());

    let amount: u64 = 500;
    let salt: [u8; 32] = [0x01; 32];
    let commitment = commitment_of(amount, salt);

    // Clock starts at 0; deadline is 9_999_999_999 (far future).
    let room = setup_room_with_bid(&mut svm, &creator, 3, 9_999_999_999, 19_999_999_999, commitment);

    // Do NOT advance the clock — still before submission_deadline.
    let result = send_single(
        &mut svm,
        reveal_bid_ix(creator.pubkey(), room, amount, salt),
        &creator,
        &[&creator],
    );
    assert!(result.is_err(), "reveal before submission deadline must be rejected");
}

#[test]
fn reveal_bid_after_reveal_deadline_rejected() {
    let mut svm = setup();
    let creator = Keypair::new();
    fund(&mut svm, &creator.pubkey());

    let amount: u64 = 777;
    let salt: [u8; 32] = [0x77; 32];
    let commitment = commitment_of(amount, salt);

    let sub_dl: i64 = 1_000;
    let rev_dl: i64 = 2_000;
    let room = setup_room_with_bid(&mut svm, &creator, 4, sub_dl, rev_dl, commitment);

    // Advance past BOTH deadlines.
    set_clock(&mut svm, rev_dl + 1);

    let result = send_single(
        &mut svm,
        reveal_bid_ix(creator.pubkey(), room, amount, salt),
        &creator,
        &[&creator],
    );
    assert!(result.is_err(), "reveal after reveal deadline must be rejected");
}

#[test]
fn reveal_bid_duplicate_rejected() {
    let mut svm = setup();
    let creator = Keypair::new();
    fund(&mut svm, &creator.pubkey());

    let amount: u64 = 1_000;
    let salt: [u8; 32] = [0xaa; 32];
    let commitment = commitment_of(amount, salt);

    let sub_dl: i64 = 1_000;
    let room = setup_room_with_bid(&mut svm, &creator, 5, sub_dl, 2_000, commitment);

    set_clock(&mut svm, sub_dl + 1);

    send_single(&mut svm, reveal_bid_ix(creator.pubkey(), room, amount, salt), &creator, &[&creator])
        .expect("first reveal should succeed");

    let result = send_single(
        &mut svm,
        reveal_bid_ix(creator.pubkey(), room, amount, salt),
        &creator,
        &[&creator],
    );
    assert!(result.is_err(), "duplicate reveal must be rejected");
}

#[test]
fn reveal_bid_no_commitment_rejected() {
    let mut svm = setup();
    let creator = Keypair::new();
    let outsider = Keypair::new();
    fund(&mut svm, &creator.pubkey());
    fund(&mut svm, &outsider.pubkey());

    // Room has only creator as member; outsider never submitted a bid.
    let sub_dl: i64 = 1_000;
    let commitment = commitment_of(42, [0x00; 32]);
    let room = setup_room_with_bid(&mut svm, &creator, 6, sub_dl, 2_000, commitment);

    set_clock(&mut svm, sub_dl + 1);

    let result = send_single(
        &mut svm,
        reveal_bid_ix(outsider.pubkey(), room, 42, [0x00; 32]),
        &outsider,
        &[&outsider],
    );
    assert!(result.is_err(), "reveal with no prior commitment must be rejected");
}
