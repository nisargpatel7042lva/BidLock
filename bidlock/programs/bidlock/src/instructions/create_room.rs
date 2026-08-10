use anchor_lang::prelude::*;

use crate::constants::{MAX_MEMBERS, ROOM_SEED};
use crate::error::BidLockError;
use crate::state::{Room, RoomStatus};

#[derive(Accounts)]
#[instruction(room_id: u64)]
pub struct CreateRoom<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        init,
        payer = creator,
        space = 8 + Room::INIT_SPACE,
        seeds = [ROOM_SEED.as_bytes(), creator.key().as_ref(), room_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub room: Account<'info, Room>,

    pub system_program: Program<'info, System>,
}

pub(crate) fn handler(
    ctx: Context<CreateRoom>,
    room_id: u64,
    pool_description: String,
    members: Vec<Pubkey>,
    submission_deadline: i64,
    reveal_deadline: i64,
) -> Result<()> {
    require!(
        pool_description.len() <= crate::constants::MAX_DESCRIPTION_LEN,
        BidLockError::DescriptionTooLong
    );
    require!(
        !members.is_empty() && members.len() <= MAX_MEMBERS,
        BidLockError::InvalidMemberCount
    );
    for i in 0..members.len() {
        for j in (i + 1)..members.len() {
            require!(members[i] != members[j], BidLockError::DuplicateMember);
        }
    }

    let now = Clock::get()?.unix_timestamp;
    require!(
        submission_deadline > now,
        BidLockError::SubmissionDeadlineInPast
    );
    require!(
        reveal_deadline > submission_deadline,
        BidLockError::RevealBeforeSubmission
    );

    let room = &mut ctx.accounts.room;
    room.creator = ctx.accounts.creator.key();
    room.room_id = room_id;
    room.pool_description = pool_description;
    room.members = members;
    room.submission_deadline = submission_deadline;
    room.reveal_deadline = reveal_deadline;
    room.status = RoomStatus::Created;
    room.submissions = Vec::new();
    room.reveals = Vec::new();
    room.resolved_split = Vec::new();
    room.bump = ctx.bumps.room;

    Ok(())
}
