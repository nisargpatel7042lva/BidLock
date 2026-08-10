use anchor_lang::prelude::*;

use crate::error::BidLockError;
use crate::state::{MemberCommitment, Room, RoomSession, RoomStatus};

#[derive(Accounts)]
pub struct SubmitBid<'info> {
    /// Either the member's main wallet, or a session key that was authorized
    /// via `create_session`. The handler resolves which role applies.
    #[account(mut)]
    pub signer: Signer<'info>,

    /// The delegated room, held in the Ephemeral Rollup during SubmissionOpen.
    #[account(mut)]
    pub room: Account<'info, Room>,

    /// Present when the caller is using a session key instead of their main
    /// wallet. The handler validates that the session is scoped to *this* room
    /// and has not expired — a session for a different room is rejected.
    pub room_session: Option<Account<'info, RoomSession>>,
}

/// Stores a sealed commitment from a member inside the ER. The commitment is
/// sha256(proposed_split_bps_array || salt), keeping the actual split private
/// until the reveal phase.
///
/// Auth: either the member signs directly, or a valid room-scoped session key
/// signs on the member's behalf. The main wallet is never required once a
/// session token exists.
pub(crate) fn handler(ctx: Context<SubmitBid>, commitment: [u8; 32]) -> Result<()> {
    let room = &mut ctx.accounts.room;
    let signer_key = ctx.accounts.signer.key();

    require!(room.status == RoomStatus::SubmissionOpen, BidLockError::SubmissionClosed);

    let now = Clock::get()?.unix_timestamp;
    require!(now < room.submission_deadline, BidLockError::SubmissionClosed);

    // Resolve the member: main wallet signing directly, or session key.
    let member = if let Some(ref session) = ctx.accounts.room_session {
        require!(session.room == room.key(), BidLockError::SessionRoomMismatch);
        require!(session.session_key == signer_key, BidLockError::SessionKeyMismatch);
        require!(now < session.valid_until, BidLockError::SessionExpired);
        session.member
    } else {
        signer_key
    };

    require!(room.members.contains(&member), BidLockError::NotAMember);
    require!(
        !room.submissions.iter().any(|s| s.member == member),
        BidLockError::AlreadySubmitted
    );

    room.submissions.push(MemberCommitment { member, commitment });

    Ok(())
}
