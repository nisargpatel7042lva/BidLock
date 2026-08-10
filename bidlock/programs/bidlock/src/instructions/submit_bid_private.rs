use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::access_control::instructions::CreateEphemeralPermissionCpi;
use ephemeral_rollups_sdk::access_control::structs::{
    EphemeralMembersArgs, Member, AUTHORITY_FLAG,
};
use ephemeral_rollups_sdk::consts::{EPHEMERAL_VAULT_ID, MAGIC_PROGRAM_ID, PERMISSION_PROGRAM_ID};
use ephemeral_rollups_sdk::ephemeral_accounts::EphemeralAccount;

use crate::constants::BID_STORE_SEED;
use crate::error::BidLockError;
use crate::state::{BidStoreData, Room, RoomSession, RoomStatus};

#[derive(Accounts)]
pub struct SubmitBidPrivate<'info> {
    /// Bidder's session key (or main wallet).
    #[account(mut)]
    pub signer: Signer<'info>,

    /// The delegated room in the PER.
    #[account(mut)]
    pub room: Account<'info, Room>,

    /// Optional room-scoped session token (same auth as submit_bid).
    pub room_session: Option<Account<'info, RoomSession>>,

    /// Per-member ephemeral BidStore to be created: ["bid_store", room, member].
    /// Lives only inside the PER — never committed to the base layer.
    /// CHECK: created via Magic Program CPI below; seeds verified in handler.
    #[account(mut)]
    pub bid_store: UncheckedAccount<'info>,

    /// EphemeralPermission PDA for bid_store: ["permission:", bid_store].
    /// Restricts RPC reads of bid_store to the member only (is_private = true).
    /// CHECK: derived in handler via EphemeralPermission::find_pda(bid_store).
    #[account(mut)]
    pub permission: UncheckedAccount<'info>,

    /// Ephemeral rent vault — must be EPHEMERAL_VAULT_ID.
    /// CHECK: verified by address constraint.
    #[account(
        mut,
        constraint = vault.key() == Pubkey::new_from_array(EPHEMERAL_VAULT_ID.to_bytes())
            @ BidLockError::InvalidProgramAccount
    )]
    pub vault: UncheckedAccount<'info>,

    /// Magic Program that manages ephemeral account creation.
    /// CHECK: verified by address constraint.
    #[account(
        constraint = magic_program.key() == Pubkey::new_from_array(MAGIC_PROGRAM_ID.to_bytes())
            @ BidLockError::InvalidProgramAccount
    )]
    pub magic_program: UncheckedAccount<'info>,

    /// Permission Program that enforces PER access control.
    /// CHECK: verified by address constraint.
    #[account(
        constraint = permission_program.key() == Pubkey::new_from_array(PERMISSION_PROGRAM_ID.to_bytes())
            @ BidLockError::InvalidProgramAccount
    )]
    pub permission_program: UncheckedAccount<'info>,
}

/// Stores a member's plaintext bid amount in a private per-member ephemeral
/// account inside the PER. Unlike `submit_bid`, no hash commitment is needed —
/// the amount lives in an EphemeralPermission-protected BidStore that only the
/// member can observe via RPC. The owning program reads all BidStores during
/// resolution without restriction.
///
/// Permission enforcement (is_private = true):
///   - Member's session key → can observe via RPC (AUTHORITY_FLAG).
///   - Any other key (including room creator) → ER validator returns null.
///   - Resolving program → reads as account owner during instruction execution.
pub(crate) fn handler(ctx: Context<SubmitBidPrivate>, amount: u64) -> Result<()> {
    let room = &mut ctx.accounts.room;
    let signer_key = ctx.accounts.signer.key();
    let room_key = room.key();

    require!(room.status == RoomStatus::SubmissionOpen, BidLockError::SubmissionClosed);

    let now = Clock::get()?.unix_timestamp;
    require!(now < room.submission_deadline, BidLockError::SubmissionClosed);

    // Resolve member from signer or session key.
    let member = if let Some(ref session) = ctx.accounts.room_session {
        require!(session.room == room_key, BidLockError::SessionRoomMismatch);
        require!(session.session_key == signer_key, BidLockError::SessionKeyMismatch);
        require!(now < session.valid_until, BidLockError::SessionExpired);
        session.member
    } else {
        signer_key
    };

    require!(room.members.contains(&member), BidLockError::NotAMember);
    require!(
        !room.private_submitters.contains(&member),
        BidLockError::AlreadySubmitted
    );

    // Derive and verify the expected BidStore PDA.
    let (expected_bid_store, bid_store_bump) = Pubkey::find_program_address(
        &[BID_STORE_SEED.as_bytes(), room_key.as_ref(), member.as_ref()],
        &crate::ID,
    );
    require!(
        ctx.accounts.bid_store.key() == expected_bid_store,
        BidLockError::InvalidProgramAccount
    );

    // Verify the permission PDA matches what the Permission Program expects.
    let (expected_permission, _) =
        ephemeral_rollups_sdk::access_control::structs::EphemeralPermission::find_pda(
            &ctx.accounts.bid_store.key(),
        );
    require!(
        ctx.accounts.permission.key() == expected_permission,
        BidLockError::InvalidProgramAccount
    );

    let bid_store_seeds: &[&[u8]] = &[
        BID_STORE_SEED.as_bytes(),
        room_key.as_ref(),
        member.as_ref(),
        &[bid_store_bump],
    ];

    // ── Step 1: Create the ephemeral BidStore account via Magic Program. ──────
    // The BidStore PDA must sign (to prevent squatting); we sign via invoke_signed.
    EphemeralAccount::new(
        &ctx.accounts.signer.to_account_info(),
        &ctx.accounts.bid_store.to_account_info(),
        &ctx.accounts.vault.to_account_info(),
    )
    .with_signer_seeds(&[bid_store_seeds])
    .create(BidStoreData::SIZE as u32)?;

    // ── Step 2: Write member + amount into the BidStore. ──────────────────────
    {
        let mut data = ctx.accounts.bid_store.try_borrow_mut_data()?;
        let bid = BidStoreData { member, amount };
        bid.write_to(&mut data);
    }

    // ── Step 3: Create EphemeralPermission — is_private = true. ───────────────
    // Only the member (via AUTHORITY_FLAG) can observe this account via RPC.
    // The resolving program reads it directly as the account owner.
    let member_entry = Member {
        flags: AUTHORITY_FLAG,
        pubkey: member,
    };
    let perm_args = EphemeralMembersArgs {
        is_private: true,
        members: vec![member_entry],
    };

    CreateEphemeralPermissionCpi {
        permissioned_account: ctx.accounts.bid_store.to_account_info(),
        permission: ctx.accounts.permission.to_account_info(),
        payer: ctx.accounts.signer.to_account_info(),
        vault: ctx.accounts.vault.to_account_info(),
        magic_program: ctx.accounts.magic_program.to_account_info(),
        permission_program: ctx.accounts.permission_program.to_account_info(),
        args: perm_args,
    }
    .invoke_signed(&[bid_store_seeds])?;

    // ── Step 4: Record submission on the room. ────────────────────────────────
    room.private_submitters.push(member);

    Ok(())
}
