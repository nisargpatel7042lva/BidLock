use anchor_lang::prelude::*;

use crate::constants::{MAX_DESCRIPTION_LEN, MAX_MEMBERS};

/// A shared pool that a fixed group of members will split by Sealed Consensus:
/// every member privately submits what they believe a fair share is, and once
/// all reveals land the program normalizes them into one agreed outcome.
/// No individual winner or loser — just one shared, sealed-then-revealed result.
#[account]
#[derive(InitSpace)]
pub struct Room {
    pub creator: Pubkey,
    pub room_id: u64,
    #[max_len(MAX_DESCRIPTION_LEN)]
    pub pool_description: String,
    #[max_len(MAX_MEMBERS)]
    pub members: Vec<Pubkey>,
    pub submission_deadline: i64,
    pub reveal_deadline: i64,
    pub status: RoomStatus,
    /// Sealed commitments from each member: sha256(split_bps_array || salt).
    /// Accumulated inside the ER during SubmissionOpen; committed to base layer
    /// on undelegate so the reveal phase has a tamper-evident record.
    #[max_len(MAX_MEMBERS)]
    pub submissions: Vec<MemberCommitment>,
    #[max_len(MAX_MEMBERS)]
    pub reveals: Vec<MemberReveal>,
    #[max_len(MAX_MEMBERS)]
    pub resolved_split: Vec<MemberSplit>,
    /// Members who have submitted via the PER private flow (`submit_bid_private`).
    /// Their plaintext bid amounts live in per-member ephemeral BidStore accounts
    /// inside the ER and never touch the base layer.
    #[max_len(MAX_MEMBERS)]
    pub private_submitters: Vec<Pubkey>,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum RoomStatus {
    Created,
    SubmissionOpen,
    RevealOpen,
    Resolved,
}

/// One member's final share of the pool, in basis points (sums to
/// BPS_DENOMINATOR across a room's full `resolved_split`).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub struct MemberSplit {
    pub member: Pubkey,
    pub share_bps: u16,
}

/// A sealed commitment from one member: sha256(proposed_split_bytes || salt).
/// 32 bytes so it fits a SHA-256 digest exactly.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub struct MemberCommitment {
    pub member: Pubkey,
    pub commitment: [u8; 32],
}

/// The result of a member's reveal attempt. `valid` is true only when the
/// recomputed sha256(amount_le || salt) matched the stored commitment.
/// Invalid reveals store `amount = 0` to avoid leaking a mismatched attempt.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub struct MemberReveal {
    pub member: Pubkey,
    pub amount: u64,
    pub valid: bool,
}

/// Serialization layout for a private per-member BidStore ephemeral account.
///
/// These accounts exist ONLY inside the PER. They are never delegated to or
/// committed to the Solana base layer, so there is no `#[account]` derive —
/// just a fixed-offset binary layout written and read by the program directly.
///
/// Layout (40 bytes):
///   [0..32]  member  Pubkey   — who this bid belongs to
///   [32..40] amount  u64 LE   — plaintext bid amount
pub struct BidStoreData {
    pub member: Pubkey,
    pub amount: u64,
}

impl BidStoreData {
    pub const SIZE: usize = 32 + 8; // 40 bytes

    pub fn write_to(&self, buf: &mut [u8]) {
        buf[..32].copy_from_slice(self.member.as_ref());
        buf[32..40].copy_from_slice(&self.amount.to_le_bytes());
    }

    pub fn read_from(buf: &[u8]) -> Option<Self> {
        if buf.len() < Self::SIZE {
            return None;
        }
        let member = Pubkey::new_from_array(buf[..32].try_into().ok()?);
        let amount = u64::from_le_bytes(buf[32..40].try_into().ok()?);
        Some(Self { member, amount })
    }

    /// Zero the amount field in-place (called during resolution to erase losing bids).
    pub fn zero_amount(buf: &mut [u8]) {
        if buf.len() >= Self::SIZE {
            buf[32..40].fill(0);
        }
    }
}

/// A per-room, per-member session token. Created on the base layer by the
/// member's main wallet; the room-scoped session key can then sign `submit_bid`
/// inside the ER without the main wallet being present.
///
/// Scoping is enforced by including the room pubkey in the PDA seeds — a
/// session created for room A cannot satisfy the `room_session` constraint
/// on room B, even if the same member key appears in both rooms.
#[account]
#[derive(InitSpace)]
pub struct RoomSession {
    pub room: Pubkey,
    pub member: Pubkey,
    pub session_key: Pubkey,
    pub valid_until: i64,
    pub bump: u8,
}
