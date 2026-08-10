"use client";

import { useState, useRef, useCallback } from "react";

interface Props {
  onSeal: (amount: string) => Promise<void>;
  disabled?: boolean;
}

const SCRAMBLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789$#@!%&";

function scramble(
  text: string,
  setDisplay: (v: string) => void,
  onDone: () => void
) {
  const totalMs = 900;
  const stepMs  = 50;
  const steps   = totalMs / stepMs;
  let frame = 0;

  const id = setInterval(() => {
    frame++;
    const progress = frame / steps;
    const result = text
      .split("")
      .map((_, i) => {
        if (i / text.length < progress) return "•";
        return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
      })
      .join("");
    setDisplay(result);
    if (frame >= steps) {
      clearInterval(id);
      setDisplay("•".repeat(text.length));
      onDone();
    }
  }, stepMs);
}

type State = "idle" | "scrambling" | "sealing" | "sealed" | "error";

export function SealCard({ onSeal, disabled }: Props) {
  const [amount, setAmount]     = useState("");
  const [display, setDisplay]   = useState("");
  const [sealState, setSealState] = useState<State>("idle");
  const [errMsg, setErrMsg]     = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSeal = useCallback(async () => {
    const raw = amount.trim();
    if (!raw || Number(raw) <= 0) {
      setErrMsg("Enter a proposal amount greater than zero.");
      return;
    }
    setErrMsg("");
    setSealState("scrambling");

    scramble(raw, setDisplay, async () => {
      setSealState("sealing");
      try {
        await onSeal(raw);
        setSealState("sealed");
      } catch (e: any) {
        setSealState("error");
        setErrMsg(e?.message ?? "Transaction failed. Try again.");
        setTimeout(() => setSealState("idle"), 3000);
      }
    });
  }, [amount, onSeal]);

  const isSealed = sealState === "sealed";
  const isActive = sealState === "scrambling" || sealState === "sealing";

  if (isSealed) {
    return (
      <div
        className="card-sealed animate-fade-in"
        style={{ padding: "28px 24px" }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
          {/* Lock animation */}
          <div
            style={{
              animation: "seal-lock 0.6s cubic-bezier(0.34,1.56,0.64,1) forwards",
              color: "var(--gold)",
            }}
          >
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect x="5" y="14" width="22" height="16" rx="1"
                fill="var(--gold-dim)" stroke="var(--gold)" strokeWidth="1.5" />
              <path d="M10 14V10.5a6 6 0 0112 0V14"
                stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="square" />
              <rect x="13.5" y="19" width="5" height="5" rx="2.5" fill="var(--gold)" />
            </svg>
          </div>

          <div style={{ textAlign: "center" }}>
            <div
              className="mono"
              style={{
                fontSize: 11,
                letterSpacing: "0.22em",
                color: "var(--gold)",
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              Proposal Sealed
            </div>
            <div
              className="mono"
              style={{
                fontSize: 18,
                color: "var(--text-3)",
                letterSpacing: "0.12em",
                animation: "shimmer 2.5s linear infinite",
                backgroundImage:
                  "linear-gradient(90deg, var(--text-3) 25%, var(--text-2) 50%, var(--text-3) 75%)",
                backgroundSize: "200% 100%",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              {"•".repeat(Math.min(display.length || 6, 10))}
            </div>
          </div>

          <p
            style={{
              fontSize: 12,
              color: "var(--text-3)",
              textAlign: "center",
              lineHeight: 1.5,
              maxWidth: 260,
            }}
          >
            Your proposal is sealed. No one can see it until the reveal window opens.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: "24px" }}>
      <div style={{ marginBottom: 14 }}>
        <label
          className="mono"
          style={{
            display: "block",
            fontSize: 10,
            letterSpacing: "0.16em",
            color: "var(--text-3)",
            textTransform: "uppercase",
            marginBottom: 10,
          }}
        >
          Your Proposal (lamports)
        </label>

        {isActive ? (
          <div
            className="input-amount"
            style={{
              display: "flex",
              alignItems: "center",
              color: "var(--text-3)",
              cursor: "not-allowed",
              letterSpacing: "0.06em",
              borderColor: "var(--gold)",
              boxShadow: "0 0 0 1px var(--gold-dim)",
            }}
          >
            {display || "•••••••"}
          </div>
        ) : (
          <input
            ref={inputRef}
            className="input-amount"
            type="number"
            placeholder="0"
            value={amount}
            onChange={(e) => { setAmount(e.target.value); setErrMsg(""); }}
            disabled={disabled || isActive}
            onKeyDown={(e) => e.key === "Enter" && handleSeal()}
          />
        )}

        {errMsg && (
          <p
            className="mono animate-fade-in"
            style={{ fontSize: 11, color: "var(--red)", marginTop: 8, letterSpacing: "0.05em" }}
          >
            {errMsg}
          </p>
        )}
      </div>

      <button
        className="btn-gold"
        style={{
          width: "100%",
          justifyContent: "center",
          padding: "14px",
          fontSize: 12,
          animation: isActive ? undefined : undefined,
        }}
        onClick={handleSeal}
        disabled={disabled || isActive || !amount}
      >
        {sealState === "sealing" ? (
          <><div className="spinner" style={{ borderTopColor: "#06040A" }} /> Sealing…</>
        ) : sealState === "scrambling" ? (
          <><div className="spinner" style={{ borderTopColor: "#06040A" }} /> Encrypting…</>
        ) : sealState === "error" ? (
          "Try Again"
        ) : (
          <>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0 }}>
              <rect x="1.5" y="5.5" width="10" height="7" rx="0.5" stroke="currentColor" strokeWidth="1.3" />
              <path d="M3.5 5.5V3.5a3 3 0 016 0V5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="square" />
            </svg>
            Seal Proposal
          </>
        )}
      </button>

      <p
        style={{
          marginTop: 12,
          fontSize: 12,
          color: "var(--text-3)",
          lineHeight: 1.5,
        }}
      >
        Your proposal is hashed before submission. No one sees the amount until
        you reveal — not even the room creator.
      </p>
    </div>
  );
}
