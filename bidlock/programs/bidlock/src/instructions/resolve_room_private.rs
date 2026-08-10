use anchor_lang::prelude::*;

use crate::error::BidLockError;
use crate::state::{BidStoreData, MemberSplit, Room, RoomStatus};

/// Post-delegation magic action for the PER private flow. Reads every
/// per-member BidStore account (passed as `remaining_accounts`) directly as the
/// owning program — bypassing the PER permission check that guards RPC reads.
///
/// After determining the winner the handler zeroes every BidStore's amount
/// field in-place. Because BidStore accounts are ephemeral (never committed to
/// the base layer), no bid amount — winning or losing — ever appears on-chain.
#[derive(Accounts)]
pub struct ResolveRoomPrivate<'info> {
    #[account(mut)]
    pub room: Account<'info, Room>,
    // remaining_accounts: one writable BidStore per private_submitter,
    // in the same order as room.private_submitters.
}

pub(crate) fn handler(ctx: Context<ResolveRoomPrivate>) -> Result<()> {
    let room = &mut ctx.accounts.room;

    require!(room.status != RoomStatus::Resolved, BidLockError::AlreadyResolved);

    let n = room.private_submitters.len();
    require!(n > 0, BidLockError::NoValidReveals);
    require!(
        ctx.remaining_accounts.len() >= n,
        BidLockError::NoValidReveals
    );

    // ── Determine winner by scanning all BidStore accounts. ──────────────────
    let mut winner_key = Pubkey::default();
    let mut winner_amount: u64 = 0;

    for bid_store_acc in &ctx.remaining_accounts[..n] {
        let data = bid_store_acc.try_borrow_data()?;
        if let Some(bid) = BidStoreData::read_from(&data) {
            // First-maximum wins ties (earliest submitter among equal bids).
            if bid.amount > winner_amount {
                winner_amount = bid.amount;
                winner_key = bid.member;
            }
        }
    }

    require!(winner_key != Pubkey::default(), BidLockError::NoValidReveals);

    // ── Record final split. ───────────────────────────────────────────────────
    room.resolved_split = room
        .members
        .iter()
        .map(|&m| MemberSplit {
            member: m,
            share_bps: if m == winner_key { 10_000 } else { 0 },
        })
        .collect();

    // ── Zero all BidStore amounts so no bid quantity lands on base layer. ─────
    // BidStore accounts are ephemeral (PER-only); zeroing here ensures that
    // even within the ER state snapshot, amounts are gone before resolution
    // commits via undelegate_room.
    for bid_store_acc in &ctx.remaining_accounts[..n] {
        let mut data = bid_store_acc.try_borrow_mut_data()?;
        BidStoreData::zero_amount(&mut data);
    }

    // Clear the submitters list — no private bid metadata on base layer.
    room.private_submitters.clear();

    room.status = RoomStatus::Resolved;

    Ok(())
}
