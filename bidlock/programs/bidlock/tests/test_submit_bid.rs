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

fn room_session_pda(room: &Pubkey, member: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[
            bidlock::ROOM_SESSION_SEED.as_bytes(),
            room.as_ref(),
            member.as_ref(),
        ],
        &PROGRAM_ID,
    )
    .0
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
        pool_description: "test pool".to_string(),
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

fn create_session_ix(
    member: Pubkey,
    room: Pubkey,
    room_session: Pubkey,
    session_key: Pubkey,
    valid_until: i64,
) -> anchor_lang::solana_program::instruction::Instruction {
    let accounts = bidlock::accounts::CreateSession {
        member,
        room,
        room_session,
        system_program: anchor_lang::system_program::ID,
    };
    let data = bidlock::instruction::CreateSession {
        session_key,
        valid_until,
    };
    anchor_lang::solana_program::instruction::Instruction {
        program_id: PROGRAM_ID,
        accounts: accounts.to_account_metas(None),
        data: data.data(),
    }
}

/// Build a submit_bid instruction. When `room_session` is None the signer is
/// treated as the member directly; when Some, the signer is the session key.
///
/// Anchor 1.x requires every optional account slot to be present in the
/// account list at all times. When the optional account is absent, pass the
/// program's own ID as a sentinel; Anchor recognises that as `None`.
fn submit_bid_ix(
    signer: Pubkey,
    room: Pubkey,
    room_session: Option<Pubkey>,
    commitment: [u8; 32],
) -> anchor_lang::solana_program::instruction::Instruction {
    use anchor_lang::solana_program::instruction::AccountMeta;

    let session_key = room_session.unwrap_or(PROGRAM_ID);
    let metas = vec![
        AccountMeta::new(signer, true),
        AccountMeta::new(room, false),
        AccountMeta::new_readonly(session_key, false),
    ];

    anchor_lang::solana_program::instruction::Instruction {
        program_id: PROGRAM_ID,
        accounts: metas,
        data: bidlock::instruction::SubmitBid { commitment }.data(),
    }
}

type TxResult = Result<litesvm::types::TransactionMetadata, litesvm::types::FailedTransactionMetadata>;

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

/// Creates a room in Created state and immediately flips it to SubmissionOpen.
fn setup_open_room(
    svm: &mut LiteSVM,
    creator: &Keypair,
    room_id: u64,
    members: Vec<Pubkey>,
    submission_deadline: i64,
) -> Pubkey {
    let room = room_pda(&creator.pubkey(), room_id);

    let create_ix = create_room_ix(
        creator.pubkey(),
        room,
        room_id,
        members,
        submission_deadline,
        submission_deadline + 100,
    );
    send_single(svm, create_ix, creator, &[creator]).expect("create_room failed");

    let open_ix = open_submission_ix(room);
    send_single(svm, open_ix, creator, &[creator]).expect("open_submission failed");

    room
}

// ─── Tests ──────────────────────────────────────────────────────────────────

#[test]
fn submit_bid_direct_member_stores_commitment() {
    let mut svm = setup();
    let creator = Keypair::new();
    fund(&mut svm, &creator.pubkey());

    let room = setup_open_room(&mut svm, &creator, 1, vec![creator.pubkey()], 9_999_999_999);
    let commitment: [u8; 32] = core::array::from_fn(|i| i as u8);

    let ix = submit_bid_ix(creator.pubkey(), room, None, commitment);
    let result = send_single(&mut svm, ix, &creator, &[&creator]);
    assert!(result.is_ok(), "direct-member submit_bid failed: {result:?}");

    let account = svm.get_account(&room).unwrap();
    let room_state = bidlock::Room::try_deserialize(&mut account.data.as_slice()).unwrap();
    assert_eq!(room_state.submissions.len(), 1);
    assert_eq!(room_state.submissions[0].member, creator.pubkey());
    assert_eq!(room_state.submissions[0].commitment, commitment);
    // No plaintext amount is stored — only the opaque 32-byte hash.
    assert_eq!(room_state.submissions[0].commitment.len(), 32);
}

#[test]
fn submit_bid_via_session_key_stores_commitment() {
    let mut svm = setup();
    let member = Keypair::new();
    let session_kp = Keypair::new();
    fund(&mut svm, &member.pubkey());
    fund(&mut svm, &session_kp.pubkey());

    let room = setup_open_room(&mut svm, &member, 2, vec![member.pubkey()], 9_999_999_999);
    let session_pda = room_session_pda(&room, &member.pubkey());

    // Member creates the session token (main wallet signs once).
    let create_sess_ix = create_session_ix(
        member.pubkey(),
        room,
        session_pda,
        session_kp.pubkey(),
        9_999_999_999,
    );
    send_single(&mut svm, create_sess_ix, &member, &[&member])
        .expect("create_session failed");

    // Session key submits — main wallet (`member`) is NOT a signer.
    let commitment: [u8; 32] = core::array::from_fn(|i| (i + 1) as u8);
    let ix = submit_bid_ix(session_kp.pubkey(), room, Some(session_pda), commitment);
    let result = send_single(&mut svm, ix, &session_kp, &[&session_kp]);
    assert!(result.is_ok(), "session-key submit_bid failed: {result:?}");

    let account = svm.get_account(&room).unwrap();
    let room_state = bidlock::Room::try_deserialize(&mut account.data.as_slice()).unwrap();
    assert_eq!(room_state.submissions.len(), 1);
    // Stored member is the main wallet, not the session key.
    assert_eq!(room_state.submissions[0].member, member.pubkey());
    assert_eq!(room_state.submissions[0].commitment, commitment);
}

#[test]
fn submit_bid_rejected_after_deadline() {
    let mut svm = setup();
    let creator = Keypair::new();
    fund(&mut svm, &creator.pubkey());

    // Deadline is far in the past relative to where we'll set the clock.
    let deadline: i64 = 1000;
    let room = setup_open_room(&mut svm, &creator, 3, vec![creator.pubkey()], deadline);

    // Advance the clock past the submission deadline.
    let mut clock = svm.get_sysvar::<Clock>();
    clock.unix_timestamp = deadline + 1;
    svm.set_sysvar::<Clock>(&clock);

    let commitment: [u8; 32] = [0xab; 32];
    let ix = submit_bid_ix(creator.pubkey(), room, None, commitment);
    let result = send_single(&mut svm, ix, &creator, &[&creator]);
    assert!(result.is_err(), "late submission must be rejected");
}

#[test]
fn submit_bid_rejected_if_not_member() {
    let mut svm = setup();
    let creator = Keypair::new();
    let stranger = Keypair::new();
    fund(&mut svm, &creator.pubkey());
    fund(&mut svm, &stranger.pubkey());

    let room = setup_open_room(&mut svm, &creator, 4, vec![creator.pubkey()], 9_999_999_999);

    // `stranger` is not in room.members → NotAMember.
    let commitment: [u8; 32] = [0x01; 32];
    let ix = submit_bid_ix(stranger.pubkey(), room, None, commitment);
    let result = send_single(&mut svm, ix, &stranger, &[&stranger]);
    assert!(result.is_err(), "non-member submit must be rejected");
}

#[test]
fn submit_bid_rejected_on_duplicate() {
    let mut svm = setup();
    let creator = Keypair::new();
    fund(&mut svm, &creator.pubkey());

    let room = setup_open_room(&mut svm, &creator, 5, vec![creator.pubkey()], 9_999_999_999);

    let ix1 = submit_bid_ix(creator.pubkey(), room, None, [0x42; 32]);
    send_single(&mut svm, ix1, &creator, &[&creator]).expect("first submit should succeed");

    let ix2 = submit_bid_ix(creator.pubkey(), room, None, [0xff; 32]);
    let result = send_single(&mut svm, ix2, &creator, &[&creator]);
    assert!(result.is_err(), "duplicate submit must be rejected");
}

#[test]
fn submit_bid_rejected_on_session_room_mismatch() {
    let mut svm = setup();
    let member = Keypair::new();
    let session_kp = Keypair::new();
    fund(&mut svm, &member.pubkey());
    fund(&mut svm, &session_kp.pubkey());

    // Room 1 — target for the submit
    let room1 = setup_open_room(&mut svm, &member, 10, vec![member.pubkey()], 9_999_999_999);

    // Room 2 — source of the mismatched session token
    let room2 = setup_open_room(&mut svm, &member, 11, vec![member.pubkey()], 9_999_999_999);
    let session_pda2 = room_session_pda(&room2, &member.pubkey());
    let create_sess_ix = create_session_ix(
        member.pubkey(),
        room2,
        session_pda2,
        session_kp.pubkey(),
        9_999_999_999,
    );
    send_single(&mut svm, create_sess_ix, &member, &[&member])
        .expect("create_session room2 failed");

    // Use room2's session on room1 → SessionRoomMismatch.
    let ix = submit_bid_ix(session_kp.pubkey(), room1, Some(session_pda2), [0xba; 32]);
    let result = send_single(&mut svm, ix, &session_kp, &[&session_kp]);
    assert!(result.is_err(), "cross-room session must be rejected");
}

#[test]
fn commitment_is_opaque_32_bytes_not_plaintext_amount() {
    // The on-chain submission slot is exactly 32 bytes. Its content is treated
    // as an opaque hash — no instruction stores, reads, or expects a bid amount
    // in plaintext at this stage.
    let mut svm = setup();
    let creator = Keypair::new();
    fund(&mut svm, &creator.pubkey());

    let bid_amount_le: u64 = 1_000_000;

    // A realistic commitment: sha256(amount_le || salt_le).
    // Precomputed bytes — the test doesn't care how they were derived, only
    // that the stored value is 32 bytes and isn't the raw amount.
    let commitment: [u8; 32] = [
        0x6b, 0x86, 0xb2, 0x73, 0xff, 0x34, 0xfc, 0xe1, 0x9d, 0x6b, 0x80, 0x4e, 0xff, 0x5a,
        0x3f, 0x57, 0x47, 0xad, 0xa4, 0xea, 0xa2, 0x2f, 0x1d, 0x49, 0xc0, 0x1e, 0x52, 0xdd,
        0xb7, 0x87, 0x5b, 0x4b,
    ];

    let room = setup_open_room(&mut svm, &creator, 6, vec![creator.pubkey()], 9_999_999_999);
    let ix = submit_bid_ix(creator.pubkey(), room, None, commitment);
    send_single(&mut svm, ix, &creator, &[&creator]).expect("submit_bid");

    let account = svm.get_account(&room).unwrap();
    let room_state = bidlock::Room::try_deserialize(&mut account.data.as_slice()).unwrap();
    let stored = room_state.submissions[0].commitment;

    // The stored 32 bytes are definitely not the raw amount.
    assert_ne!(
        u64::from_le_bytes(stored[..8].try_into().unwrap()),
        bid_amount_le,
        "commitment must not equal the raw bid amount",
    );
    // And it's exactly 32 bytes — the full slot, no extra plaintext.
    assert_eq!(stored.len(), 32);
    assert_eq!(stored, commitment);
}
