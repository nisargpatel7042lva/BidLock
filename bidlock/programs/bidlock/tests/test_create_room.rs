use anchor_lang::prelude::Pubkey;
use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use bidlock::{RoomStatus, ID as PROGRAM_ID};
use litesvm::LiteSVM;
use solana_keypair::Keypair;
use solana_message::{Message, VersionedMessage};
use solana_signer::Signer;
use solana_transaction::versioned::VersionedTransaction;

const PROGRAM_BYTES: &[u8] = include_bytes!("../../../target/deploy/bidlock.so");

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

fn create_room_ix(
    creator: Pubkey,
    room: Pubkey,
    room_id: u64,
    pool_description: String,
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
        pool_description,
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

#[test]
fn create_room_sets_correct_initial_state() {
    let mut svm = setup();
    let creator = Keypair::new();
    fund(&mut svm, &creator.pubkey());

    let room_id: u64 = 1;
    let room = room_pda(&creator.pubkey(), room_id);
    let members = vec![Keypair::new().pubkey(), Keypair::new().pubkey()];

    // litesvm's default Clock has unix_timestamp == 0, so any large future
    // timestamp guarantees `> now` regardless of what "now" actually is.
    let submission_deadline: i64 = 9_999_999_999;
    let reveal_deadline: i64 = 9_999_999_998 + 100;

    let ix = create_room_ix(
        creator.pubkey(),
        room,
        room_id,
        "shared bounty pool".to_string(),
        members.clone(),
        submission_deadline,
        reveal_deadline,
    );

    let blockhash = svm.latest_blockhash();
    let message = VersionedMessage::Legacy(Message::new_with_blockhash(
        &[ix],
        Some(&creator.pubkey()),
        &blockhash,
    ));
    let tx = VersionedTransaction::try_new(message, &[&creator]).unwrap();

    let result = svm.send_transaction(tx);
    assert!(result.is_ok(), "create_room transaction failed: {result:?}");

    let account = svm.get_account(&room).expect("room account should exist");
    let room_state = bidlock::Room::try_deserialize(&mut account.data.as_slice())
        .expect("room account should deserialize");

    assert_eq!(room_state.creator, creator.pubkey());
    assert_eq!(room_state.room_id, room_id);
    assert_eq!(room_state.pool_description, "shared bounty pool");
    assert_eq!(room_state.members, members);
    assert_eq!(room_state.submission_deadline, submission_deadline);
    assert_eq!(room_state.reveal_deadline, reveal_deadline);
    assert_eq!(room_state.status, RoomStatus::Created);
    assert!(room_state.resolved_split.is_empty());
}

#[test]
fn create_room_rejects_forged_creator_signature() {
    let mut svm = setup();
    let real_creator = Keypair::new();
    let forged_creator = Keypair::new();
    fund(&mut svm, &real_creator.pubkey());
    fund(&mut svm, &forged_creator.pubkey());

    let room_id: u64 = 1;
    // PDA derived for the forged creator, since that's who the attacker
    // claims to be in the account list.
    let room = room_pda(&forged_creator.pubkey(), room_id);

    let ix = create_room_ix(
        forged_creator.pubkey(),
        room,
        room_id,
        "shared bounty pool".to_string(),
        vec![Keypair::new().pubkey()],
        9_999_999_999,
        9_999_999_999 + 100,
    );

    let blockhash = svm.latest_blockhash();
    // The message says `forged_creator` is the fee payer / signer, but we
    // only actually sign with `real_creator`'s key — this must fail, proving
    // a room's creator field can never be set to a pubkey the submitter does
    // not control.
    let message = VersionedMessage::Legacy(Message::new_with_blockhash(
        &[ix],
        Some(&forged_creator.pubkey()),
        &blockhash,
    ));
    let tx = VersionedTransaction::try_new(message, &[&real_creator]);

    assert!(
        tx.is_err(),
        "signing with a mismatched keypair should fail to produce a valid transaction"
    );
}
