use anchor_lang::prelude::*;

#[constant]
pub const ROOM_SEED: &str = "room";

#[constant]
pub const ROOM_SESSION_SEED: &str = "room_session";

/// Seeds for per-member private bid stores in the PER.
/// PDA: ["bid_store", room, member] — ephemeral, never committed to base layer.
#[constant]
pub const BID_STORE_SEED: &str = "bid_store";

pub const MAX_MEMBERS: usize = 10;
pub const MAX_DESCRIPTION_LEN: usize = 200;

/// Basis points denominator: shares in a resolved split always sum to this.
pub const BPS_DENOMINATOR: u16 = 10_000;
