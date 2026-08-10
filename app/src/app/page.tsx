"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useState } from "react";
import { useRouter } from "next/navigation";

const WalletButton = dynamic(
  () => import("@/components/WalletButton").then((m) => m.WalletButton),
  { ssr: false }
);

const features = [
  {
    glyph: "◈",
    title: "Seal",
    body: "Each member privately proposes their answer. The proposal is hashed on-chain — the amount is invisible to everyone, including the room creator.",
  },
  {
    glyph: "◎",
    title: "Reveal",
    body: "After the sealing window closes, all members reveal at once. No one can adjust based on what others proposed. Simultaneous, not sequential.",
  },
  {
    glyph: "◉",
    title: "Converge",
    body: "The group discovers its shared answer together. The highest honest proposal wins — anchoring bias eliminated by design.",
  },
];

export default function Home() {
  const [joinAddr, setJoinAddr] = useState("");
  const router = useRouter();

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const addr = joinAddr.trim();
    if (addr.length > 20) router.push(`/room/${addr}`);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
      {/* Grid lines */}
      <div aria-hidden style={{
        position: "fixed", inset: 0,
        backgroundImage: "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
        backgroundSize: "80px 80px", opacity: 0.45, pointerEvents: "none", zIndex: 0,
      }} />
      {/* Gold radial */}
      <div aria-hidden style={{
        position: "fixed", top: "-20vh", left: "50%", transform: "translateX(-50%)",
        width: "70vw", height: "60vh",
        background: "radial-gradient(ellipse at 50% 0%, rgba(201,164,74,0.08) 0%, transparent 70%)",
        pointerEvents: "none", zIndex: 0,
      }} />

      {/* Nav */}
      <nav style={{
        position: "relative", zIndex: 10, display: "flex", alignItems: "center",
        justifyContent: "space-between", padding: "20px 40px",
        borderBottom: "1px solid var(--border)",
      }}>
        <div className="display" style={{ fontSize: 22, letterSpacing: "-0.02em" }}>BidLock</div>
        <WalletButton />
      </nav>

      {/* Hero */}
      <main style={{
        position: "relative", zIndex: 1, flex: 1, display: "flex",
        flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: "80px 24px 60px", textAlign: "center",
      }}>
        <div className="mono animate-fade-up" style={{
          fontSize: 10, letterSpacing: "0.28em", color: "var(--gold)",
          textTransform: "uppercase", marginBottom: 32,
        }}>
          Sealed Consensus · Solana · MagicBlock ER
        </div>

        <h1 className="display animate-fade-up stagger-1" style={{
          fontSize: "clamp(52px, 8vw, 92px)", maxWidth: 800,
          color: "var(--text)", marginBottom: 16,
        }}>
          Seal your proposal.<br />
          <span style={{ color: "var(--text-2)" }}>Reveal together.</span><br />
          <span style={{
            backgroundImage: "linear-gradient(135deg, var(--gold) 0%, var(--gold-2) 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>Converge on truth.</span>
        </h1>

        <p className="animate-fade-up stagger-2" style={{
          maxWidth: 520, fontSize: 16, color: "var(--text-2)",
          lineHeight: 1.75, marginBottom: 48,
        }}>
          Groups reach a fair shared decision by sealing their honest input first,
          so no one anchors on anyone else, then converging together, live, on Solana.
        </p>

        <div className="animate-fade-up stagger-3" style={{
          display: "flex", gap: 12, flexWrap: "wrap",
          justifyContent: "center", marginBottom: 40,
        }}>
          <Link href="/create" className="btn-gold" style={{ fontSize: 12 }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 1V11M1 6H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
            </svg>
            Create a Room
          </Link>
        </div>

        <form className="animate-fade-up stagger-4" onSubmit={handleJoin}
          style={{ display: "flex", gap: 0, maxWidth: 440, width: "100%" }}>
          <input className="input-dark" placeholder="Paste room address to join…"
            value={joinAddr} onChange={(e) => setJoinAddr(e.target.value)}
            style={{ flex: 1, borderRight: "none" }} />
          <button type="submit" className="btn-ghost" style={{ borderRadius: 0, whiteSpace: "nowrap" }}>
            Join →
          </button>
        </form>
      </main>

      {/* Features */}
      <section style={{
        position: "relative", zIndex: 1, borderTop: "1px solid var(--border)",
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
      }}>
        {features.map((f, i) => (
          <div key={f.title} className={`animate-fade-up stagger-${i + 3}`} style={{
            padding: "40px 36px",
            borderRight: i < 2 ? "1px solid var(--border)" : undefined,
          }}>
            <div className="display" style={{ fontSize: 32, color: "var(--gold)", marginBottom: 16 }}>{f.glyph}</div>
            <h3 className="display" style={{ fontSize: 22, marginBottom: 10 }}>{f.title}</h3>
            <p style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.7 }}>{f.body}</p>
          </div>
        ))}
      </section>

      <footer style={{
        position: "relative", zIndex: 1, borderTop: "1px solid var(--border)",
        padding: "20px 40px", display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span className="mono" style={{ fontSize: 11, color: "var(--text-3)", letterSpacing: "0.1em" }}>BidLock</span>
        <span className="mono" style={{ fontSize: 11, color: "var(--text-3)", letterSpacing: "0.08em" }}>
          Powered by MagicBlock Ephemeral Rollups
        </span>
      </footer>
    </div>
  );
}
