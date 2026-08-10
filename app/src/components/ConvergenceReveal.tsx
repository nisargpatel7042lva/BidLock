"use client";

import { useEffect, useRef, useState } from "react";
import { shortenAddress } from "@/lib/pda";
import type { RoomAccount } from "@/lib/bidlock_types";

interface Props {
  room: RoomAccount;
}

function useCountUp(target: number, duration = 1200) {
  const [val, setVal] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(ease * target));
      if (p < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);

  return val;
}

function WinnerCard({ member, amount }: { member: string; amount: number }) {
  const animated = useCountUp(amount, 1400);

  return (
    <div
      className="animate-fade-in"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--gold)",
        padding: "36px 40px",
        textAlign: "center",
        animation: "convergence-glow 3s ease-in-out infinite",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Corner accents */}
      {[
        { top: 0, left: 0 },
        { top: 0, right: 0 },
        { bottom: 0, left: 0 },
        { bottom: 0, right: 0 },
      ].map((pos, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            width: 12,
            height: 12,
            borderTop: pos.top === 0 ? "1px solid var(--gold-2)" : undefined,
            borderBottom: pos.bottom === 0 ? "1px solid var(--gold-2)" : undefined,
            borderLeft: pos.left === 0 ? "1px solid var(--gold-2)" : undefined,
            borderRight: pos.right === 0 ? "1px solid var(--gold-2)" : undefined,
            ...pos,
          }}
        />
      ))}

      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.24em",
          color: "var(--gold)",
          textTransform: "uppercase",
          marginBottom: 24,
        }}
      >
        The group converges on
      </div>

      <div
        className="display"
        style={{
          fontSize: 64,
          color: "var(--text)",
          lineHeight: 1,
          marginBottom: 8,
          fontWeight: 600,
        }}
      >
        {animated.toLocaleString()}
      </div>

      <div
        className="mono"
        style={{
          fontSize: 12,
          color: "var(--text-3)",
          marginBottom: 24,
          letterSpacing: "0.1em",
        }}
      >
        lamports
      </div>

      <div
        className="mono"
        style={{
          fontSize: 12,
          color: "var(--text-2)",
          letterSpacing: "0.06em",
          padding: "8px 16px",
          background: "var(--gold-dim)",
          display: "inline-block",
        }}
      >
        {shortenAddress(member, 6)}
      </div>
    </div>
  );
}

function RevealedCard({
  member,
  amount,
  valid,
  delay,
}: {
  member: string;
  amount: number;
  valid: boolean;
  delay: number;
}) {
  return (
    <div
      style={{
        background: valid ? "var(--surface-2)" : "var(--surface)",
        border: `1px solid ${valid ? "var(--border-lit)" : "var(--border)"}`,
        padding: "16px 18px",
        animation: `card-reveal 0.5s cubic-bezier(0.16,1,0.3,1) ${delay}ms both`,
      }}
    >
      <div
        className="mono"
        style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 8, letterSpacing: "0.1em" }}
      >
        {shortenAddress(member, 5)}
      </div>
      {valid ? (
        <div className="mono" style={{ fontSize: 20, color: "var(--text-2)" }}>
          {amount.toLocaleString()}
          <span style={{ fontSize: 11, marginLeft: 6, color: "var(--text-3)" }}>L</span>
        </div>
      ) : (
        <div className="mono" style={{ fontSize: 12, color: "var(--text-3)", letterSpacing: "0.1em" }}>
          Invalid reveal
        </div>
      )}
    </div>
  );
}

export function ConvergenceReveal({ room }: Props) {
  const winner = room.resolvedSplit.find((s) => s.shareBps === 10_000);
  const winnerReveal = winner
    ? room.reveals.find((r) => r.member.toBase58() === winner.member.toBase58())
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {winner && winnerReveal && (
        <WinnerCard
          member={winner.member.toBase58()}
          amount={winnerReveal.amount.toNumber()}
        />
      )}

      {room.reveals.length > 0 && (
        <div>
          <div
            className="mono"
            style={{
              fontSize: 10,
              letterSpacing: "0.18em",
              color: "var(--text-3)",
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            All proposals
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: 1,
              background: "var(--border)",
            }}
          >
            {room.reveals.map((r, i) => (
              <RevealedCard
                key={r.member.toBase58()}
                member={r.member.toBase58()}
                amount={r.amount.toNumber()}
                valid={r.valid}
                delay={i * 120}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
