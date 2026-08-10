use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::InstructionData;
use ephemeral_rollups_sdk::anchor::delegate;
use ephemeral_rollups_sdk::cpi::{delegate_account_with_actions, DelegateAccounts, DelegateConfig};
use ephemeral_rollups_sdk::dlp_api::compact::ClearText;

use crate::constants::ROOM_SEED;
use crate::error::BidLockError;
use crate::state::{Room, RoomStatus};

/// Delegates the room back to the ER for the settlement phase and attaches
/// `resolve_room` as a post-delegation magic action. The action fires
/// automatically inside the ER the instant delegation completes:
///   1. Winner is determined from valid reveals.
///   2. Losing bid amounts are erased from `room.reveals`.
///   3. `room.status` → Resolved.
/// When `undelegate_room` subsequently commits back to the base layer, only
/// `resolved_split` (who won) lands there — no losing amounts ever appear.
#[delegate]
#[derive(Accounts)]
pub struct DelegateRoomForSettlement<'info> {
    pub payer: Signer<'info>,

    #[account(mut, del)]
    /// CHECK: room PDA verified via seeds inside the handler
    pub pda: UncheckedAccount<'info>,
}

pub(crate) fn handler(
    ctx: Context<DelegateRoomForSettlement>,
    room_id: u64,
) -> Result<()> {
    // Deserialize room to check preconditions without a typed account (owner
    // may have changed if this is called on an already-delegated account).
    let room = {
        let data = ctx.accounts.pda.try_borrow_data()?;
        Room::try_deserialize(&mut &data[..])?
    };

    let now = Clock::get()?.unix_timestamp;
    require!(now > room.reveal_deadline, BidLockError::RevealWindowNotClosed);
    require!(room.status != RoomStatus::Resolved, BidLockError::AlreadyResolved);

    let room_key = ctx.accounts.pda.key();

    // Post-delegation magic action: resolve_room computes winner in the ER and
    // wipes reveal amounts before committing back to base layer.
    let resolve_action = Instruction {
        program_id: crate::ID,
        accounts: vec![AccountMeta::new(room_key, false)],
        data: crate::instruction::ResolveRoom {}.data(),
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
