use anchor_lang::prelude::*;

use crate::constants::ROOM_SESSION_SEED;
use crate::error::BidLockError;
use crate::state::{Room, RoomSession};

#[derive(Accounts)]
pub struct CreateSession<'info> {
    #[account(mut)]
    pub member: Signer<'info>,

    /// UncheckedAccount avoids the owner constraint that would fire when the
    /// room is delegated (owner becomes the delegation program). We verify
    /// membership by deserializing the raw bytes manually.
    /// CHECK: deserialized below; membership verified in the handler
    pub room: UncheckedAccount<'info>,

    #[account(
        init,
        payer = member,
        space = 8 + RoomSession::INIT_SPACE,
        seeds = [
            ROOM_SESSION_SEED.as_bytes(),
            room.key().as_ref(),
            member.key().as_ref(),
        ],
        bump,
    )]
    pub room_session: Account<'info, RoomSession>,

    pub system_program: Program<'info, System>,
}

/// Creates a per-room session token for the calling member. After this, the
/// member can sign `submit_bid` inside the ER with `session_key` instead of
/// their main wallet. The session is valid until `valid_until` (unix seconds)
/// and can only authorize actions on *this specific room* — a session for room
/// A is rejected by any instruction acting on room B.
pub(crate) fn handler(
    ctx: Context<CreateSession>,
    session_key: Pubkey,
    valid_until: i64,
) -> Result<()> {
    let data = ctx.accounts.room.try_borrow_data()?;
    let room = Room::try_deserialize(&mut &data[..])?;
    require!(
        room.members.contains(&ctx.accounts.member.key()),
        BidLockError::NotAMember
    );

    let session = &mut ctx.accounts.room_session;
    session.room = ctx.accounts.room.key();
    session.member = ctx.accounts.member.key();
    session.session_key = session_key;
    session.valid_until = valid_until;
    session.bump = ctx.bumps.room_session;

    Ok(())
}
