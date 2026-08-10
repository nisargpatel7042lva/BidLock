"use client";

import { PublicKey } from "@solana/web3.js";
import { shortenAddress } from "@/lib/pda";
import type { RoomAccount } from "@/lib/bidlock_types";

interface Props {
  room: RoomAccount;
  currentMember?: PublicKey | null;
}

function LockIcon({ sealed }: { sealed: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="2.5" y="6" width="9" height="7" rx="0.5"
        stroke={sealed ? "var(--gold)" : "var(--text-3)"} strokeWidth="1.2" />
      <path d="M4.5 6V4.5a2.5 2.5 0 015 0V6"
        stroke={sealed ? "var(--gold)" : "var(--text-3)"} strokeWidth="1.2" strokeLinecap="square" />
      {sealed && (
        <rect x="6" y="8.5" width="2" height="2" rx="1" fill="var(--gold)" />
      )}
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2.5 7.5L5.5 10.5L11.5 4" stroke="var(--teal)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="5" stroke="var(--text-3)" strokeWidth="1.2" />
      <path d="M7 4.5V7L9 9" stroke="var(--text-3)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function ParticipantGrid({ room, currentMember }: Props) {
  const submitterSet = new Set(room.submissions.map((s) => s.member.toBase58()));
  const revealSet    = new Set(room.reveals.filter((r) => r.valid).map((r) => r.member.toBase58()));
  const resolvedMap  = new Map(room.resolvedSplit.map((s) => [s.member.toBase58(), s.shareBps]));
  const isResolved   = "resolved" in room.status;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
        gap: 1,
        background: "var(--border)",
      }}
    >
      {room.members.map((m) => {
        const key      = m.toBase58();
        const isMe     = currentMember?.toBase58() === key;
        const hasSealed = submitterSet.has(key);
        const hasRevealed = revealSet.has(key);
        const bps      = resolvedMap.get(key) ?? 0;
        const isWinner = bps === 10_000;

        return (
          <div
            key={key}
            className="animate-fade-in"
            style={{
              background: isWinner
                ? "rgba(201,164,74,0.05)"
                : isMe
                ? "var(--surface-2)"
                : "var(--surface)",
              border: isWinner
                ? "1px solid rgba(201,164,74,0.3)"
                : "1px solid var(--bg)",
              padding: "14px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {/* Address row */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                className="mono"
                style={{
                  fontSize: 12,
                  color: isMe ? "var(--text)" : "var(--text-2)",
                  flexGrow: 1,
                }}
              >
                {shortenAddress(key, 4)}
              </span>
              {isMe && (
                <span
                  className="mono"
                  style={{
                    fontSize: 9,
                    color: "var(--text-3)",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                  }}
                >
                  you
                </span>
              )}
            </div>

            {/* Status */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {isResolved ? (
                isWinner ? (
                  <>
                    <CheckIcon />
                    <span
                      className="mono"
                      style={{ fontSize: 10.5, color: "var(--gold)", letterSpacing: "0.1em" }}
                    >
                      Converged
                    </span>
                  </>
                ) : (
                  <>
                    <LockIcon sealed={false} />
                    <span
                      className="mono"
                      style={{ fontSize: 10.5, color: "var(--text-3)", letterSpacing: "0.1em" }}
                    >
                      Other path
                    </span>
                  </>
                )
              ) : hasRevealed ? (
                <>
                  <CheckIcon />
                  <span
                    className="mono"
                    style={{ fontSize: 10.5, color: "var(--teal)", letterSpacing: "0.1em" }}
                  >
                    Revealed
                  </span>
                </>
              ) : hasSealed ? (
                <>
                  <LockIcon sealed />
                  <span
                    className="mono"
                    style={{ fontSize: 10.5, color: "var(--gold)", letterSpacing: "0.1em" }}
                  >
                    Sealed
                  </span>
                </>
              ) : (
                <>
                  <ClockIcon />
                  <span
                    className="mono"
                    style={{ fontSize: 10.5, color: "var(--text-3)", letterSpacing: "0.1em" }}
                  >
                    Waiting
                  </span>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
