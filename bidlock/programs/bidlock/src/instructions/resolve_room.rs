use anchor_lang::prelude::*;

use crate::error::BidLockError;
use crate::state::{MemberSplit, Room, RoomStatus};

/// Permissionless: anyone can fire this once valid reveals exist and the window
/// is closed. Designed to run as the post-delegation magic action attached by
/// `delegate_room_for_settlement`, so it fires automatically in the ER the
/// instant the room is delegated for settlement.
#[derive(Accounts)]
pub struct ResolveRoom<'info> {
    #[account(mut)]
    pub room: Account<'info, Room>,
}

/// Determines the winner (highest valid reveal), records their share in
/// `resolved_split`, then **clears all reveal amounts** so that no losing
/// bid quantity is ever committed to the base layer.
pub(crate) fn handler(ctx: Context<ResolveRoom>) -> Result<()> {
    let room = &mut ctx.accounts.room;

    require!(room.status != RoomStatus::Resolved, BidLockError::AlreadyResolved);

    // First maximum wins ties (earliest revealer among equal bids).
    let winner_key = room
        .reveals
        .iter()
        .filter(|r| r.valid)
        .fold(None::<(Pubkey, u64)>, |best, r| match best {
            None => Some((r.member, r.amount)),
            Some((_, best_amt)) if r.amount > best_amt => Some((r.member, r.amount)),
            _ => best,
        })
        .ok_or(BidLockError::NoValidReveals)?
        .0;

    // Winner takes the full pool; all others receive nothing.
    room.resolved_split = room
        .members
        .iter()
        .map(|&m| MemberSplit {
            member: m,
            share_bps: if m == winner_key { 10_000 } else { 0 },
        })
        .collect();

    // Erase reveals so losing bid amounts are not committed to base layer when
    // undelegate_room runs. The winner's amount is also erased — only the
    // identity of the winner (via resolved_split) lands on base layer.
    room.reveals.clear();

    room.status = RoomStatus::Resolved;

    Ok(())
}
