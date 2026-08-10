use anchor_lang::prelude::*;

use crate::error::BidLockError;
use crate::state::{Room, RoomStatus};

#[derive(Accounts)]
pub struct OpenSubmission<'info> {
    #[account(mut)]
    pub room: Account<'info, Room>,
}

/// Runs automatically as a post-delegation action inside the ER, right after
/// `delegate_room` completes — this is what auto-initializes bidding without
/// the creator sending a second transaction.
pub(crate) fn handler(ctx: Context<OpenSubmission>) -> Result<()> {
    let room = &mut ctx.accounts.room;

    require!(
        room.status == RoomStatus::Created,
        BidLockError::InvalidRoomStatus
    );

    room.status = RoomStatus::SubmissionOpen;

    Ok(())
}
