use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::InstructionData;
use ephemeral_rollups_sdk::anchor::delegate;
use ephemeral_rollups_sdk::cpi::{delegate_account_with_actions, DelegateAccounts, DelegateConfig};
use ephemeral_rollups_sdk::dlp_api::compact::ClearText;

use crate::constants::ROOM_SEED;

#[delegate]
#[derive(Accounts)]
pub struct DelegateRoom<'info> {
    pub payer: Signer<'info>,

    #[account(mut, del)]
    /// CHECK: the room pda being delegated
    pub pda: UncheckedAccount<'info>,
}

/// Delegates a room to the Ephemeral Rollup and attaches a post-delegation
/// action: the moment delegation completes, the ER validator automatically
/// runs `open_submission` on the room, flipping it straight to
/// `SubmissionOpen`. The creator never has to send a second transaction to
/// kick off bidding.
pub(crate) fn handler(ctx: Context<DelegateRoom>, room_id: u64) -> Result<()> {
    let room_key = ctx.accounts.pda.key();

    let open_submission_action = Instruction {
        program_id: crate::ID,
        accounts: vec![AccountMeta::new(room_key, false)],
        data: crate::instruction::OpenSubmission {}.data(),
    };
    let actions = vec![open_submission_action].cleartext();

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
