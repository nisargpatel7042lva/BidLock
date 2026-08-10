pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::ephemeral;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("23zkP27qb2eNg1nxKovh3zTLiLKXccKoRHRH6wukMYEs");

#[ephemeral]
#[program]
pub mod bidlock {
    use super::*;

    /// Creates a Sealed Consensus Split room: a fixed group of members who will
    /// each privately submit a proposed split of a shared pool, sealed until
    /// every member has committed, then resolved into one agreed outcome.
    pub fn create_room(
        ctx: Context<CreateRoom>,
        room_id: u64,
        pool_description: String,
        members: Vec<Pubkey>,
        submission_deadline: i64,
        reveal_deadline: i64,
    ) -> Result<()> {
        create_room::handler(
            ctx,
            room_id,
            pool_description,
            members,
            submission_deadline,
            reveal_deadline,
        )
    }

    /// Delegates a room to the Ephemeral Rollup, attaching a post-delegation
    /// action that auto-opens submissions the instant delegation lands.
    pub fn delegate_room(ctx: Context<DelegateRoom>, room_id: u64) -> Result<()> {
        delegate_room::handler(ctx, room_id)
    }

    /// Post-delegation action: flips a freshly delegated room straight to
    /// `SubmissionOpen`. Not meant to be called directly by clients.
    pub fn open_submission(ctx: Context<OpenSubmission>) -> Result<()> {
        open_submission::handler(ctx)
    }

    /// Commits the room's final ER state back to the base layer and
    /// undelegates it.
    pub fn undelegate_room(ctx: Context<UndelegateRoom>, room_id: u64) -> Result<()> {
        undelegate_room::handler(ctx, room_id)
    }

    /// Creates a per-room session token so the caller can sign `submit_bid`
    /// inside the ER with a lightweight session key instead of their main
    /// wallet. The session is strictly scoped to one room — it will be
    /// rejected by any instruction that acts on a different room.
    pub fn create_session(
        ctx: Context<CreateSession>,
        session_key: Pubkey,
        valid_until: i64,
    ) -> Result<()> {
        create_session::handler(ctx, session_key, valid_until)
    }

    /// Stores a sealed commitment (sha256(split_bps || salt)) from a member
    /// inside the ER. The signer may be the member's main wallet, or a
    /// room-scoped session key previously authorized via `create_session`.
    pub fn submit_bid(ctx: Context<SubmitBid>, commitment: [u8; 32]) -> Result<()> {
        submit_bid::handler(ctx, commitment)
    }

    /// Opens a member's sealed commitment after the submission window closes.
    /// The program recomputes sha256(amount_le || salt) and compares it to the
    /// stored hash. Matching reveals are marked valid; mismatched reveals are
    /// recorded as invalid and excluded from winner resolution.
    pub fn reveal_bid(ctx: Context<RevealBid>, amount: u64, salt: [u8; 32]) -> Result<()> {
        reveal_bid::handler(ctx, amount, salt)
    }

    /// Post-delegation magic action: computes the winner from valid reveals,
    /// records their share in `resolved_split`, then erases all reveal amounts
    /// so no losing bid quantities land on the base layer. Runs automatically
    /// inside the ER when fired by `delegate_room_for_settlement`.
    pub fn resolve_room(ctx: Context<ResolveRoom>) -> Result<()> {
        resolve_room::handler(ctx)
    }

    /// Delegates the room back to the ER for settlement and attaches
    /// `resolve_room` as a post-delegation magic action. Call this on the base
    /// layer after all reveals are in and the reveal deadline has passed.
    pub fn delegate_room_for_settlement(
        ctx: Context<DelegateRoomForSettlement>,
        room_id: u64,
    ) -> Result<()> {
        delegate_room_for_settlement::handler(ctx, room_id)
    }
}
