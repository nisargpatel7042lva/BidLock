use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::InstructionData;
use ephemeral_rollups_sdk::anchor::delegate;
use ephemeral_rollups_sdk::cpi::{delegate_account_with_actions, DelegateAccounts, DelegateConfig};
use ephemeral_rollups_sdk::dlp_api::compact::ClearText;

use crate::constants::{BID_STORE_SEED, ROOM_SEED};
use crate::error::BidLockError;
use crate::state::{Room, RoomStatus};

/// Re-delegates the room to the PER for settlement. Attaches `resolve_room_private`
/// as a post-delegation magic action with every member's BidStore PDA included.
/// The action fires automatically in the ER: reads all private BidStores, picks
/// the winner, zeroes amounts, then marks the room Resolved. On `undelegate_room`,
/// only the winner's identity (via resolved_split) commits to the base layer —
/// no bid amounts, winning or losing, ever appear on-chain.
#[delegate]
#[derive(Accounts)]
pub struct DelegateRoomForSettlementPrivate<'info> {
    pub payer: Signer<'info>,

    #[account(mut, del)]
    /// CHECK: room PDA verified via seeds in the handler
    pub pda: UncheckedAccount<'info>,
}

pub(crate) fn handler(
    ctx: Context<DelegateRoomForSettlementPrivate>,
    room_id: u64,
) -> Result<()> {
    let room = {
        let data = ctx.accounts.pda.try_borrow_data()?;
        Room::try_deserialize(&mut &data[..])?
    };

    let now = Clock::get()?.unix_timestamp;
    // The private flow has no reveal window — settlement starts after bidding closes.
    require!(now > room.submission_deadline, BidLockError::SubmissionClosed);
    require!(room.status != RoomStatus::Resolved, BidLockError::AlreadyResolved);
    require!(!room.private_submitters.is_empty(), BidLockError::NoValidReveals);

    let room_key = ctx.accounts.pda.key();

    // Build the resolve_room_private magic action.
    // First account: the room (writable, mutable in ER).
    // Remaining accounts: one BidStore PDA per private_submitter, in order.
    let mut action_accounts = vec![AccountMeta::new(room_key, false)];
    for member in &room.private_submitters {
        let (bid_store, _) = Pubkey::find_program_address(
            &[BID_STORE_SEED.as_bytes(), room_key.as_ref(), member.as_ref()],
            &crate::ID,
        );
        action_accounts.push(AccountMeta::new(bid_store, false));
    }

    let resolve_action = Instruction {
        program_id: crate::ID,
        accounts: action_accounts,
        data: crate::instruction::ResolveRoomPrivate {}.data(),
    };
    let actions = vec![resolve_action].cleartext();

    let payer = ctx.accounts.payer.to_account_info();
    let pda = ctx.accounts.pda.to_account_info();
    let delegate_accounts = DelegateAccounts {
        payer: &payer,
        pda: &pda,
        owner_program: &ctx.accounts.owner_program,
        buffer: &ctx.accounts.buffer_pda,
        delegation_record: &ctx.accounts.delegation_record_pda,
        delegation_metadata: &ctx.accounts.delegation_metadata_pda,
        delegation_program: &ctx.accounts.delegation_program,
        system_program: &ctx.accounts.system_program,
    };

    delegate_account_with_actions(
        delegate_accounts,
        &[
            ROOM_SEED.as_bytes(),
            ctx.accounts.payer.key().as_ref(),
            room_id.to_le_bytes().as_ref(),
        ],
        DelegateConfig {
            validator: ctx.remaining_accounts.first().map(|acc| acc.key()),
            ..Default::default()
        },
        actions,
        &[],
    )?;

    Ok(())
}
