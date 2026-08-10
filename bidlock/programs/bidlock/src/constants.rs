use anchor_lang::prelude::*;

#[constant]
pub const ROOM_SEED: &str = "room";

#[constant]
pub const ROOM_SESSION_SEED: &str = "room_session";

pub const MAX_MEMBERS: usize = 10;
pub const MAX_DESCRIPTION_LEN: usize = 200;

/// Basis points denominator: shares in a resolved split always sum to this.
pub const BPS_DENOMINATOR: u16 = 10_000;
