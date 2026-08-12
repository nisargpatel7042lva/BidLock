"use client";

import { useEffect, useRef, useState } from "react";
import { shortenAddress } from "@/lib/pda";
import type { RoomAccount } from "@/lib/bidlock_types";

interface Props { room: RoomAccount }

function useCountUp(target: number, duration = 1200) {
  const [val, setVal] = useState(0);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      setVal(Math.round((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);
  return val;
}

function Mono({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <span className="mono" style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", ...style }}>{children}</span>;
}

export function ConvergenceReveal({ room }: Props) {
  const winners = room.resolvedSplit.filter(s => s.shareBps > 0);
  const losers  = room.resolvedSplit.filter(s => s.shareBps === 0);
  const isTie   = winners.length > 1;

  const pct = useCountUp(winners.length > 0 ? Math.round(winners[0].shareBps / 100) : 0, 1200);

  if (winners.length === 0) {
    return (
      <div style={{ padding: "24px 0" }}>
        <Mono style={{ color: "rgba(255,255,255,0.3)", display: "block", marginBottom: 10 }}>Convergence result</Mono>
        <div style={{
          background: "rgba(217,80,80,0.05)", border: "1px solid rgba(217,80,80,0.2)",
          borderLeft: "3px solid #D95050", borderRadius: 12, padding: "20px 22px",
        }}>
          <p style={{ fontSize: 14, color: "#D95050", fontWeight: 500 }}>No valid proposals</p>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 6, lineHeight: 1.6 }}>
            Every commitment was either not revealed or failed verification. No convergence possible.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Mono style={{ color: "rgba(255,255,255,0.3)", display: "block" }}>Convergence result</Mono>

      {/* Winner block */}
      <div style={{
        background: "rgba(201,164,74,0.04)", border: "1px solid rgba(201,164,74,0.25)",
        borderLeft: "3px solid #C9A44A", borderRadius: 12, padding: "24px 22px",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at top left, rgba(201,164,74,0.06), transparent 60%)", pointerEvents: "none" }} />
        <Mono style={{ color: "#C9A44A", display: "block", marginBottom: 16 }}>
          {isTie ? "Tied — equal split" : "Highest proposal wins"}
        </Mono>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {winners.map((w) => (
            <div key={w.member.toBase58()} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#C9A44A", flexShrink: 0 }} />
                <span className="mono" style={{ fontSize: 12, color: "#fff", letterSpacing: "0.08em" }}>
                  {shortenAddress(w.member.toBase58(), 6)}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  background: "rgba(201,164,74,0.12)", border: "1px solid rgba(201,164,74,0.3)",
                  borderRadius: 4, padding: "3px 10px",
                }}>
                  <span className="mono" style={{ fontSize: 11, color: "#C9A44A" }}>
                    {isTie ? `${Math.round(w.shareBps / 100)}%` : `${pct}%`}
                  </span>
                </div>
                <span className="mono" style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>◉ Winner</span>
              </div>
            </div>
          ))}
        </div>

        <p style={{ marginTop: 14, fontSize: 11, color: "rgba(255,255,255,0.3)", lineHeight: 1.6 }}>
          Proposal amount sealed for privacy — only the outcome is committed on-chain.
        </p>
      </div>

      {/* Losers / full split */}
      {losers.length > 0 && (
        <div>
          <Mono style={{ color: "rgba(255,255,255,0.25)", display: "block", marginBottom: 10 }}>Other participants</Mono>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {losers.map((s) => (
              <div key={s.member.toBase58()} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 14px", background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8,
              }}>
                <span className="mono" style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                  {shortenAddress(s.member.toBase58(), 6)}
                </span>
                <span className="mono" style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>0%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
