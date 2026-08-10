"use client";

import { useEffect, useState } from "react";

interface Props {
  deadline: number; // unix timestamp seconds
  label: string;
  onExpire?: () => void;
}

function formatTime(secs: number): { h: string; m: string; s: string } {
  if (secs <= 0) return { h: "00", m: "00", s: "00" };
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return {
    h: String(h).padStart(2, "0"),
    m: String(m).padStart(2, "0"),
    s: String(s).padStart(2, "0"),
  };
}

export function CountdownTimer({ deadline, label, onExpire }: Props) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, deadline - Math.floor(Date.now() / 1000))
  );

  useEffect(() => {
    const id = setInterval(() => {
      const r = Math.max(0, deadline - Math.floor(Date.now() / 1000));
      setRemaining(r);
      if (r === 0) { onExpire?.(); clearInterval(id); }
    }, 1000);
    return () => clearInterval(id);
  }, [deadline, onExpire]);

  const { h, m, s } = formatTime(remaining);
  const expired = remaining === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--text-3)",
        }}
      >
        {label}
      </span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        {expired ? (
          <span
            className="mono"
            style={{ fontSize: 22, color: "var(--text-3)", letterSpacing: "0.04em" }}
          >
            00:00:00
          </span>
        ) : (
          <span
            className="mono"
            style={{
              fontSize: 22,
              color: "var(--gold)",
              letterSpacing: "0.04em",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {h}:{m}:{s}
          </span>
        )}
      </div>
    </div>
  );
}
