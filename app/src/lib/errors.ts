"use client";

const CODE_MAP: Record<string, string> = {
  DescriptionTooLong:       "Room description is too long (max 200 chars).",
  InvalidMemberCount:       "A room needs between 1 and 10 members.",
  DuplicateMember:          "Each member address must be unique.",
  SubmissionDeadlineInPast: "The sealing deadline must be in the future.",
  RevealBeforeSubmission:   "The convergence window must end after the sealing window.",
  InvalidRoomStatus:        "This action isn't valid for the room's current state.",
  NotAMember:               "Your wallet is not listed as a member of this room.",
  SubmissionClosed:         "The sealing window has already closed.",
  AlreadySubmitted:         "You've already sealed a proposal in this room.",
  SessionExpired:           "Your session key has expired. Refresh to create a new one.",
  SessionRoomMismatch:      "Session key is for a different room.",
  SessionKeyMismatch:       "Transaction signer doesn't match your registered session key.",
  RevealNotOpen:            "The reveal window hasn't opened yet — wait for the sealing deadline to pass.",
  RevealExpired:            "The convergence window has closed. Reveals are no longer accepted.",
  AlreadyRevealed:          "You've already revealed your proposal.",
  CommitmentNotFound:       "No sealed commitment found for your wallet. Did you seal from this browser?",
  RevealWindowNotClosed:    "The convergence window hasn't closed yet — wait before triggering settlement.",
  NoValidReveals:           "No valid proposals were revealed. The room cannot converge — every sealed commitment was either never revealed or didn't match.",
  AlreadyResolved:          "This room is already resolved.",
  InvalidProgramAccount:    "Unexpected program account address.",
};

export function friendlyError(e: unknown): string {
  // Anchor 0.32.1 + @solana/web3.js ≥1.98 wraps transaction errors into
  // SendTransactionError. The logs array has the real Anchor error code.
  const logs: string[] = (e as any)?.logs ?? [];
  const rawFromLogs = logs.join(" ");

  const raw = (e as any)?.message ?? String(e);
  const searchIn = rawFromLogs + " " + raw;

  for (const [code, msg] of Object.entries(CODE_MAP)) {
    if (searchIn.includes(code)) return msg;
  }

  // Anchor simulation / RPC-level messages
  if (searchIn.includes("does not exist")) return "Program account not found. Make sure the program is deployed on this network.";
  if (searchIn.includes("insufficient funds")) return "Insufficient SOL to pay for this transaction.";
  if (searchIn.includes("blockhash not found")) return "Transaction expired. Please try again.";
  if (searchIn.includes("User rejected")) return "Transaction cancelled.";
  if (searchIn.includes("Attempt to load a program")) return "Program not found on this network. Are you on devnet?";
  if (searchIn.includes("account not found") || searchIn.includes("AccountNotFound")) return "Required account does not exist on this network. Try re-authorizing your session key.";

  // Truncate very long raw messages — prefer the first log line for brevity
  const firstLog = logs.find(l => l.includes("Error") || l.includes("error") || l.includes("failed"));
  if (firstLog) return firstLog.length > 140 ? firstLog.slice(0, 140) + "…" : firstLog;

  return raw.length > 120 ? raw.slice(0, 120) + "…" : raw;
}
