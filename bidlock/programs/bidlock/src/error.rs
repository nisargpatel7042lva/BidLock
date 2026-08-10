use anchor_lang::prelude::*;

#[error_code]
pub enum BidLockError {
    #[msg("Pool description exceeds the maximum allowed length")]
    DescriptionTooLong,
    #[msg("A room must have between 1 and MAX_MEMBERS members")]
    InvalidMemberCount,
    #[msg("Member pubkeys must be unique")]
    DuplicateMember,
    #[msg("Submission deadline must be in the future")]
    SubmissionDeadlineInPast,
    #[msg("Reveal deadline must be after the submission deadline")]
    RevealBeforeSubmission,
    #[msg("Room must be in the Created status for this operation")]
    InvalidRoomStatus,
    #[msg("Caller is not a member of this room")]
    NotAMember,
    #[msg("The submission window is not open")]
    SubmissionClosed,
    #[msg("This member has already submitted a commitment")]
    AlreadySubmitted,
    #[msg("Session key has expired")]
    SessionExpired,
    #[msg("Session token is not scoped to this room")]
    SessionRoomMismatch,
    #[msg("Transaction signer does not match the session key on this token")]
    SessionKeyMismatch,
    #[msg("The reveal window is not open yet (submission deadline has not passed)")]
    RevealNotOpen,
    #[msg("The reveal window has expired")]
    RevealExpired,
    #[msg("This member has already revealed their bid")]
    AlreadyRevealed,
    #[msg("No commitment found for this member (did not submit a bid)")]
    CommitmentNotFound,
    #[msg("Reveal deadline has not passed yet — settlement cannot begin")]
    RevealWindowNotClosed,
    #[msg("No valid reveals — cannot determine a winner")]
    NoValidReveals,
    #[msg("Room is already resolved")]
    AlreadyResolved,
}
