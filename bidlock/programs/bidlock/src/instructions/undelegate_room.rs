use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::commit;
use ephemeral_rollups_sdk::ephem::{FoldableIntentBuilder, MagicIntentBundleBuilder};

use crate::constants::ROOM_SEED;
use crate::state::Room;

#[commit]
#[derive(Accounts)]
#[instruction(room_id: u64)]
pub struct UndelegateRoom<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [ROOM_SEED.as_bytes(), payer.key().as_ref(), room_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub room: Account<'info, Room>,
}

/// Commits the room's current (ER) state back to the base layer and
/// undelegates it, restoring normal base-layer read/write access.
pub(crate) fn handler(ctx: Context<UndelegateRoom>, _room_id: u64) -> Result<()> {
    MagicIntentBundleBuilder::new(
        ctx.accounts.payer.to_account_info(),
        ctx.accounts.magic_context.to_account_info(),
        ctx.accounts.magic_program.to_account_info(),
    )
    .commit_and_undelegate(&[ctx.accounts.room.to_account_info()])
    .build_and_invoke()?;

    Ok(())
}
