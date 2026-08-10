use anchor_lang::prelude::*;
use sha2::{Digest, Sha256};

use crate::error::BidLockError;
use crate::state::{MemberReveal, Room};

#[derive(Accounts)]
pub struct RevealBid<'info> {
    /// Must be the member's main wallet — session keys are not accepted for
    /// reveals, which happen on the base layer after the ER is wound down.
    pub member: Signer<'info>,

    #[account(mut)]
    pub room: Account<'info, Room>,
}

/// Opens the member's sealed commitment. The program recomputes
/// sha256(amount_le || salt) and compares it to the stored 32-byte hash.
///
/// A matching reveal is marked `valid = true` and its `amount` is stored.
/// A mismatched reveal is marked `valid = false` and `amount` is zeroed —
/// the caller proved nothing, so their attempt is excluded from resolution.
pub(crate) fn handler(ctx: Context<RevealBid>, amount: u64, salt: [u8; 32]) -> Result<()> {
    let room = &mut ctx.accounts.room;
    let member_key = ctx.accounts.member.key();

    let now = Clock::get()?.unix_timestamp;
    require!(now > room.submission_deadline, BidLockError::RevealNotOpen);
    require!(now < room.reveal_deadline, BidLockError::RevealExpired);

    let stored = room
        .submissions
        .iter()
        .find(|s| s.member == member_key)
        .ok_or(BidLockError::CommitmentNotFound)?
        .commitment;

    require!(
        !room.reveals.iter().any(|r| r.member == member_key),
        BidLockError::AlreadyRevealed
    );

    let computed: [u8; 32] = Sha256::new()
        .chain_update(amount.to_le_bytes())
        .chain_update(salt)
        .finalize()
        .into();
    let valid = computed == stored;

    room.reveals.push(MemberReveal {
        member: member_key,
        amount: if valid { amount } else { 0 },
        valid,
    });

    Ok(())
}
