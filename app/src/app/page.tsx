"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useInView, AnimatePresence } from "framer-motion";
import { ArrowRight, Lock, ArrowUpRight } from "lucide-react";
import dynamic from "next/dynamic";

const WalletButton = dynamic(
  () => import("@/components/WalletButton").then((m) => m.WalletButton),
  { ssr: false }
);

/* ── ease curve used everywhere ─────────────────────────────────── */
const EASE = [0.16, 1, 0.3, 1] as const;

/* ══════════════════════════════════════════════════════════════════
   HEX CANVAS
══════════════════════════════════════════════════════════════════ */
function HexCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const HEX = "0123456789abcdef";
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);
    type P = { x: number; y: number; ch: string; op: number; spd: number; gold: boolean; sz: number };
    const pts: P[] = Array.from({ length: 100 }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      ch: HEX[Math.floor(Math.random() * 16)],
      op: Math.random() * 0.2 + 0.04,
      spd: Math.random() * 0.22 + 0.06,
      gold: Math.random() > 0.6,
      sz: Math.random() > 0.8 ? 13 : 10,
    }));
    let raf: number;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of pts) {
        ctx.font = `${p.sz}px "JetBrains Mono", monospace`;
        ctx.fillStyle = p.gold ? `rgba(201,164,74,${p.op})` : `rgba(255,255,255,${p.op * 0.4})`;
        ctx.fillText(p.ch, p.x, p.y);
        p.y -= p.spd;
        if (Math.random() > 0.988) p.ch = HEX[Math.floor(Math.random() * 16)];
        if (p.y < -20) { p.y = canvas.height + 20; p.x = Math.random() * canvas.width; }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.55, pointerEvents: "none" }} />;
}

/* ══════════════════════════════════════════════════════════════════
   DEMO CARD (sealed → revealed cycle)
══════════════════════════════════════════════════════════════════ */
type DemoPhase = "sealed" | "revealed";
function DemoCard() {
  const [phase, setPhase] = useState<DemoPhase>("sealed");
  const cycle = useCallback(() => {
    setPhase("revealed");
    const t = setTimeout(() => setPhase("sealed"), 2800);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    const t = setTimeout(cycle, 2000);
    const id = setInterval(cycle, 5600);
    return () => { clearTimeout(t); clearInterval(id); };
  }, [cycle]);
  const sealed = phase === "sealed";
  return (
    <motion.div
      className="liquid-glass"
      style={{
        borderRadius: 16, padding: "20px 22px", width: 256,
        background: sealed ? "rgba(201,164,74,0.04)" : "rgba(62,206,206,0.04)",
      }}
      animate={{ boxShadow: sealed
        ? "0 0 0 1px rgba(201,164,74,0.2), 0 0 40px rgba(201,164,74,0.07)"
        : "0 0 0 1px rgba(62,206,206,0.2), 0 0 40px rgba(62,206,206,0.07)",
      }}
      transition={{ duration: 0.5 }}
    >
      {/* status */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <motion.div style={{ width: 6, height: 6, borderRadius: "50%" }}
          animate={{ backgroundColor: sealed ? "#C9A44A" : "#3ECECE" }} transition={{ duration: 0.4 }} />
        <motion.span className="mono" style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase" }}
          animate={{ color: sealed ? "#C9A44A" : "#3ECECE" }} transition={{ duration: 0.4 }}>
          {sealed ? "Proposal sealed" : "Revealed ✓"}
        </motion.span>
      </div>
      {/* amount */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
        <span className="mono" style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>Proposal</span>
        <AnimatePresence mode="wait">
          {sealed ? (
            <motion.span key="h" className="mono lp-pulse-gold"
              style={{ fontSize: 13, color: "#C9A44A", letterSpacing: "0.12em" }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              ● ● ● ● ●
            </motion.span>
          ) : (
            <motion.span key="r" className="mono"
              style={{ fontSize: 13, color: "#3ECECE" }}
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}>
              8,500
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      {/* hash */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12,
        display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="mono" style={{ fontSize: 9, color: "rgba(255,255,255,0.25)" }}>sha256</span>
        <span className="mono" style={{ fontSize: 9, color: "rgba(255,255,255,0.2)" }}>a3f9bc2d…e7c1</span>
      </div>
      <AnimatePresence>
        {!sealed && (
          <motion.div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6 }}
            initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ delay: 0.25 }}>
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path d="M1.5 5.5l3 3 5-5" stroke="#3ECECE" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="mono" style={{ fontSize: 9, color: "#3ECECE", letterSpacing: "0.1em" }}>Commitment verified</span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   NAVBAR
══════════════════════════════════════════════════════════════════ */
function LandingNav() {
  return (
    <motion.header style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, padding: "18px 24px" }}
      initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE }}>
      <nav className="liquid-glass" style={{
        borderRadius: 999, maxWidth: 960, margin: "0 auto",
        padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Lock size={14} color="#C9A44A" strokeWidth={1.5} />
          <span className="display" style={{ fontSize: 17, color: "#fff" }}>BidLock</span>
          <div style={{ display: "flex", gap: 28, marginLeft: 28 }}>
            {["Protocol", "How it works", "Architecture"].map(l => (
              <a key={l} href={`#${l.toLowerCase().replace(/\s+/g, "-")}`}
                style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", fontFamily: "inherit", transition: "color 0.2s" }}
                onMouseEnter={e => (e.currentTarget.style.color = "#fff")}
                onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.55)")}>
                {l}
              </a>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <WalletButton />
          <Link href="/create" className="liquid-glass" style={{
            borderRadius: 999, padding: "8px 20px", fontSize: 13,
            color: "#fff", whiteSpace: "nowrap",
          }}>
            Create Room →
          </Link>
        </div>
      </nav>
    </motion.header>
  );
}

/* ══════════════════════════════════════════════════════════════════
   HERO
══════════════════════════════════════════════════════════════════ */
function HeroSection() {
  const [input, setInput] = useState("");
  const router = useRouter();

  return (
    <section style={{ position: "relative", minHeight: "100vh", display: "flex", flexDirection: "column", overflow: "hidden", background: "#000" }}>
      {/* ambient */}
      <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <div style={{ position: "absolute", top: "30%", left: "50%", transform: "translate(-50%,-50%)", width: 800, height: 600, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(201,164,74,0.08) 0%, transparent 65%)" }} />
        <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: 600, height: 300, background: "radial-gradient(ellipse, rgba(62,206,206,0.04) 0%, transparent 70%)" }} />
      </div>
      <HexCanvas />

      <div style={{ position: "relative", zIndex: 10, flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "120px 24px 40px", textAlign: "center" }}>
        {/* eyebrow */}
        <motion.div className="liquid-glass" style={{ borderRadius: 999, padding: "6px 16px", marginBottom: 36, display: "inline-flex", alignItems: "center", gap: 8 }}
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#C9A44A", animation: "lp-pulse-gold 2s ease-in-out infinite" }} />
          <span className="mono" style={{ fontSize: 10, letterSpacing: "0.18em", color: "rgba(255,255,255,0.55)", textTransform: "uppercase" }}>
            Commit-reveal protocol · Solana + MagicBlock ER
          </span>
        </motion.div>

        {/* heading */}
        <div style={{ marginBottom: 28, overflow: "hidden" }}>
          <motion.h1 className="display" style={{ fontSize: "clamp(52px, 9vw, 136px)", lineHeight: 0.96, color: "#fff", whiteSpace: "nowrap" }}
            initial={{ opacity: 0, y: 60 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.1, ease: EASE }}>
            Propose in secret.
          </motion.h1>
          <motion.h1 className="display" style={{ fontSize: "clamp(52px, 9vw, 136px)", lineHeight: 0.96, whiteSpace: "nowrap" }}
            initial={{ opacity: 0, y: 60 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.2, ease: EASE }}>
            <em className="lp-hero-gradient" style={{ fontStyle: "italic" }}>Reveal together.</em>
          </motion.h1>
        </div>

        {/* demo card */}
        <motion.div style={{ marginBottom: 32 }}
          initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.35, ease: EASE }}>
          <DemoCard />
        </motion.div>

        {/* subtitle */}
        <motion.p style={{ maxWidth: 520, fontSize: 16, color: "rgba(255,255,255,0.55)", lineHeight: 1.75, marginBottom: 32 }}
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.48 }}>
          Every group member seals their proposal behind a cryptographic commitment.
          No one sees anyone else&#39;s input until the reveal window opens.
          Then the group{" "}
          <em style={{ fontStyle: "italic", color: "#3ECECE" }}>converges</em>{" "}
          on truth — on Solana.
        </motion.p>

        {/* input */}
        <motion.div className="liquid-glass" style={{ borderRadius: 999, padding: "8px 8px 8px 20px", display: "flex", alignItems: "center", gap: 10, maxWidth: 440, width: "100%", marginBottom: 14 }}
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.58 }}>
          <input
            suppressHydrationWarning
            type="text" placeholder="Paste room address to join…"
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && input.trim().length > 20) router.push(`/room/${input.trim()}`); }}
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 14, color: "#fff", fontFamily: "inherit" }} />
          <button suppressHydrationWarning onClick={() => { if (input.trim().length > 20) router.push(`/room/${input.trim()}`); }}
            style={{ background: "#fff", borderRadius: "50%", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", border: "none", cursor: "pointer", flexShrink: 0 }}>
            <ArrowRight size={16} color="#000" strokeWidth={2} />
          </button>
        </motion.div>

        {/* CTA */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}>
          <Link href="/create" className="liquid-glass" style={{
            borderRadius: 999, padding: "12px 32px", fontSize: 14, color: "#fff", display: "inline-block",
          }}>
            Create your first room →
          </Link>
        </motion.div>
      </div>

      {/* scroll hint */}
      <motion.div style={{ position: "relative", zIndex: 10, display: "flex", justifyContent: "center", paddingBottom: 28 }}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.3 }}>
        <motion.div animate={{ y: [0, 8, 0] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <span className="mono" style={{ fontSize: 9, color: "rgba(255,255,255,0.18)", letterSpacing: "0.2em", textTransform: "uppercase" }}>Scroll</span>
          <div style={{ width: 1, height: 28, background: "linear-gradient(to bottom, rgba(255,255,255,0.18), transparent)" }} />
        </motion.div>
      </motion.div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════
   MARQUEE
══════════════════════════════════════════════════════════════════ */
function MarqueeSection() {
  const items = [
    "SEAL","·","REVEAL","·","CONVERGE","·","ON SOLANA","·","COMMIT-REVEAL","·",
    "EPHEMERAL ROLLUPS","·","SESSION KEYS","·","SHA-256","·","ZERO ANCHORING","·",
    "SEAL","·","REVEAL","·","CONVERGE","·","ON SOLANA","·","COMMIT-REVEAL","·",
    "EPHEMERAL ROLLUPS","·","SESSION KEYS","·","SHA-256","·","ZERO ANCHORING","·",
  ];
  return (
    <div style={{ position: "relative", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "16px 0", overflow: "hidden", background: "#000" }}>
      <div style={{ position: "absolute", inset: "0 0 0", left: 0, width: 80, background: "linear-gradient(to right, #000, transparent)", zIndex: 1, pointerEvents: "none" }} />
      <div style={{ position: "absolute", inset: "0 0 0", right: 0, left: "auto", width: 80, background: "linear-gradient(to left, #000, transparent)", zIndex: 1, pointerEvents: "none" }} />
      <div className="lp-marquee-track">
        {items.map((item, i) => (
          <span key={i} className="mono" style={{ marginRight: 20, fontSize: 10, letterSpacing: "0.18em", whiteSpace: "nowrap", color: item === "·" ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.28)" }}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   PROBLEM SECTION
══════════════════════════════════════════════════════════════════ */
function Bar({ pct, color, delay }: { pct: number; color: string; delay: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });
  return (
    <div ref={ref} style={{ position: "relative", flex: 1, height: 24, background: "rgba(255,255,255,0.04)", borderRadius: 2, overflow: "hidden" }}>
      <motion.div style={{ position: "absolute", left: 0, top: 0, height: "100%", background: color, borderRadius: 2 }}
        initial={{ width: 0 }} animate={inView ? { width: `${pct}%` } : { width: 0 }}
        transition={{ duration: 0.8, delay, ease: EASE }} />
    </div>
  );
}

function ProblemSection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const before = [
    { label: "Member A", speaks: true,  honest: 60, stated: 60 },
    { label: "Member B", speaks: false, honest: 85, stated: 68 },
    { label: "Member C", speaks: false, honest: 45, stated: 55 },
    { label: "Member D", speaks: false, honest: 90, stated: 70 },
  ];
  return (
    <section id="protocol" style={{ background: "#000", padding: "120px 24px", overflow: "hidden" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }} ref={ref}>
        <motion.span className="mono" style={{ fontSize: 10, letterSpacing: "0.2em", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", display: "block", marginBottom: 28 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }} transition={{ duration: 0.6 }}>
          The problem
        </motion.span>
        <motion.h2 className="display" style={{ fontSize: "clamp(36px,6vw,90px)", lineHeight: 1.0, letterSpacing: "-0.02em", marginBottom: 60 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }} transition={{ duration: 0.8, delay: 0.1 }}>
          <span style={{ color: "#fff" }}>The first voice</span><br />
          <em style={{ fontStyle: "italic", color: "rgba(255,255,255,0.22)" }}>corrupts</em>
          <span style={{ color: "#fff" }}> the vote.</span>
        </motion.h2>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60 }}>
          {/* left */}
          <motion.div animate={inView ? { opacity: 1, x: 0 } : { opacity: 0, x: -30 }} transition={{ duration: 0.7, delay: 0.25 }}>
            <p style={{ fontSize: 16, color: "rgba(255,255,255,0.65)", lineHeight: 1.8, marginBottom: 20 }}>
              Whoever speaks first sets an anchor. Every other member adjusts toward that number — not toward their honest belief.
            </p>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.38)", lineHeight: 1.8, marginBottom: 20 }}>
              This isn&apos;t a human failing — it&apos;s cognitive physics. Anchoring bias is systematic and nearly impossible to resist consciously.
            </p>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.38)", lineHeight: 1.8, marginBottom: 32 }}>
              BidLock eliminates it by enforcing proposal order: seal first, reveal second, converge third. The commit window closes before any reveal is possible.
            </p>
            <div className="liquid-glass" style={{ borderRadius: 16, padding: "20px 22px" }}>
              <p className="mono" style={{ fontSize: 10, letterSpacing: "0.14em", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", marginBottom: 10 }}>BidLock&apos;s fix</p>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", lineHeight: 1.75 }}>
                Seal every proposal before any reveal. The window closes. Then everyone reveals simultaneously — when it&apos;s too late to adjust.
              </p>
            </div>
          </motion.div>

          {/* right – viz */}
          <motion.div animate={inView ? { opacity: 1, x: 0 } : { opacity: 0, x: 30 }} transition={{ duration: 0.7, delay: 0.35 }}>
            {/* without */}
            <div style={{ marginBottom: 36 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <span className="mono" style={{ fontSize: 9, letterSpacing: "0.16em", color: "rgba(255,255,255,0.25)", textTransform: "uppercase" }}>Without BidLock</span>
                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)" }} />
              </div>
              {before.map((m, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                  <span className="mono" style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", width: 70, flexShrink: 0 }}>{m.label}</span>
                  <Bar pct={m.honest} color="rgba(62,206,206,0.18)" delay={0.5 + i * 0.1} />
                  <Bar pct={m.stated}  color={m.speaks ? "rgba(201,164,74,0.65)" : "rgba(201,164,74,0.28)"} delay={0.3 + i * 0.1} />
                  {m.speaks && <span className="mono" style={{ fontSize: 8, color: "#C9A44A", opacity: 0.7, whiteSpace: "nowrap" }}>↑ anchor</span>}
                </div>
              ))}
              <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
                {[["rgba(62,206,206,0.4)","Honest"], ["rgba(201,164,74,0.5)","Stated"]].map(([c,l]) => (
                  <span key={l as string} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, color: "rgba(255,255,255,0.28)" }}>
                    <span style={{ width: 10, height: 5, borderRadius: 2, background: c as string, display: "inline-block" }} />{l as string}
                  </span>
                ))}
              </div>
            </div>
            {/* with */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <span className="mono" style={{ fontSize: 9, letterSpacing: "0.16em", color: "rgba(62,206,206,0.6)", textTransform: "uppercase" }}>With BidLock</span>
                <div style={{ flex: 1, height: 1, background: "rgba(62,206,206,0.1)" }} />
              </div>
              {before.map((m, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                  <span className="mono" style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", width: 70, flexShrink: 0 }}>{m.label}</span>
                  <Bar pct={m.honest} color="rgba(62,206,206,0.45)" delay={0.7 + i * 0.1} />
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
                    <path d="M2 6.5l3 3 5-5" stroke="#3ECECE" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              ))}
              <p className="mono" style={{ fontSize: 9, color: "rgba(62,206,206,0.4)", marginTop: 10 }}>Every proposal = honest value. Zero anchoring.</p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════
   PROTOCOL SECTION
══════════════════════════════════════════════════════════════════ */
function LockSVG() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
      <motion.rect x="7" y="20" width="30" height="20" rx="2" stroke="#C9A44A" strokeWidth="1.4"
        initial={{ pathLength: 0, opacity: 0 }} whileInView={{ pathLength: 1, opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.2 }} />
      <motion.path d="M13 20V14a9 9 0 0118 0v6" stroke="#C9A44A" strokeWidth="1.4" strokeLinecap="round"
        initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.4 }} />
      <motion.circle cx="22" cy="30" r="2.5" fill="#C9A44A"
        initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.9, type: "spring" }} />
    </svg>
  );
}
function RevealSVG() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
      <motion.circle cx="22" cy="22" r="13" stroke="#3ECECE" strokeWidth="1.4" strokeDasharray="4 3"
        animate={{ rotate: 360 }} transition={{ duration: 12, repeat: Infinity, ease: "linear" }} />
      {[0,60,120,180,240,300].map((a, i) => (
        <motion.line suppressHydrationWarning key={i} x1="22" y1="22" x2={22+9*Math.cos(a*Math.PI/180)} y2={22+9*Math.sin(a*Math.PI/180)}
          stroke="#3ECECE" strokeWidth="1.4" strokeLinecap="round"
          initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.1*i+0.4 }} />
      ))}
      <motion.circle cx="22" cy="22" r="3" fill="#3ECECE" initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.3, type: "spring" }} />
    </svg>
  );
}
function ConvergeSVG() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
      {[[8,9],[36,8],[7,35],[37,37]].map(([x,y],i) => (
        <motion.circle key={i} cx={x} cy={y} r="2.5" fill="white" opacity={0.5}
          initial={{ cx: x, cy: y }} whileInView={{ cx: 22, cy: 22 }} viewport={{ once: true }}
          transition={{ duration: 0.7, delay: i*0.1+0.3, ease: EASE }} />
      ))}
      <motion.circle cx="22" cy="22" r="5" fill="white" initial={{ scale: 0, opacity: 0 }} whileInView={{ scale: 1, opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.9, type: "spring" }} />
      <motion.circle cx="22" cy="22" r="10" stroke="white" strokeWidth="0.8" opacity={0.15} initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ delay: 1.1 }} />
    </svg>
  );
}

function ProtocolSection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const phases = [
    { num: "01", label: "Phase one · Seal", color: "#C9A44A", bg: "rgba(201,164,74,0.04)", glow: "rgba(201,164,74,0.15)",
      title: "Your proposal, locked in cryptographic silence.",
      body: "Enter your proposal. BidLock computes sha256(amount ‖ random_salt) in your browser and submits the 32-byte commitment to the Ephemeral Rollup via a session key. Your number never touches the base layer.",
      detail: "sha256(amount_le8 || salt_32) · 32 bytes on-chain · Session key signs · <400ms ER confirmation",
      icon: <LockSVG /> },
    { num: "02", label: "Phase two · Reveal", color: "#3ECECE", bg: "rgba(62,206,206,0.04)", glow: "rgba(62,206,206,0.15)",
      title: "When the window closes, everyone opens at once.",
      body: "The sealing window closes. Now the reveal window opens. Every member submits their amount and salt. The on-chain program re-computes the hash and verifies it matches. No take-backs. No adjustments. No anchoring.",
      detail: "revealBid(amount, salt) · On-chain hash verify · valid = false for mismatches · Excluded from convergence",
      icon: <RevealSVG /> },
    { num: "03", label: "Phase three · Converge", color: "rgba(255,255,255,0.7)", bg: "rgba(255,255,255,0.02)", glow: "rgba(255,255,255,0.12)",
      title: "The group's honest input becomes the group's fair outcome.",
      body: "Every valid reveal is normalized into basis-point shares. The program settles inside the ER, clears raw amounts for privacy via ClearText magic actions, then commits the convergence result back to Solana permanently.",
      detail: "resolveRoom() on ER · resolvedSplit[]: MemberSplit { shareBps } · ClearText clears amounts · undelegateRoom commits",
      icon: <ConvergeSVG /> },
  ];
  return (
    <section id="how-it-works" style={{ background: "#000", padding: "120px 24px", overflow: "hidden" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }} ref={ref}>
        <motion.span className="mono" style={{ fontSize: 10, letterSpacing: "0.2em", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", display: "block", marginBottom: 28 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }} transition={{ duration: 0.6 }}>
          The protocol
        </motion.span>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 60, flexWrap: "wrap", gap: 20 }}>
          <motion.h2 className="display" style={{ fontSize: "clamp(36px,6vw,90px)", lineHeight: 1.0, letterSpacing: "-0.02em" }}
            animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }} transition={{ duration: 0.8, delay: 0.1 }}>
            <span style={{ color: "#fff" }}>Three steps.</span><br />
            <em style={{ fontStyle: "italic", color: "rgba(255,255,255,0.25)" }}>One honest</em>
            <span style={{ color: "#fff" }}> convergence.</span>
          </motion.h2>
          <motion.p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", lineHeight: 1.7, maxWidth: 240 }}
            animate={inView ? { opacity: 1 } : { opacity: 0 }} transition={{ delay: 0.25 }}>
            The protocol is sequential and enforced on-chain. No step can be skipped or reordered.
          </motion.p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {phases.map((p, i) => (
            <motion.div key={p.num} className="liquid-glass" style={{ borderRadius: 24, padding: "32px 28px", background: p.bg }}
              animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
              transition={{ duration: 0.7, delay: i * 0.14, ease: EASE }}
              whileHover={{ y: -4, boxShadow: `0 0 0 1px ${p.glow}, 0 24px 48px rgba(0,0,0,0.4)` }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
                <span className="mono" style={{ fontSize: 56, lineHeight: 1, color: "rgba(255,255,255,0.07)", fontWeight: 700, userSelect: "none" }}>{p.num}</span>
                {p.icon}
              </div>
              <span className="mono" style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: p.color, display: "block", marginBottom: 12 }}>{p.label}</span>
              <h3 className="display" style={{ fontSize: "clamp(20px,2vw,26px)", color: "#fff", lineHeight: 1.25, marginBottom: 14 }}>{p.title}</h3>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.75, marginBottom: 20 }}>{p.body}</p>
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 16 }}>
                <p className="mono" style={{ fontSize: 10, color: "rgba(255,255,255,0.22)", lineHeight: 1.7 }}>{p.detail}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════
   STATS SECTION
══════════════════════════════════════════════════════════════════ */
function CountUp({ to, suffix = "", duration = 1400 }: { to: number; suffix?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      setVal(Math.round((1 - Math.pow(1 - t, 3)) * to));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [inView, to, duration]);
  return <span ref={ref}>{val}{suffix}</span>;
}

function StatsSection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const stats = [
    { v: 21,  s: "",    l: "Rust unit tests",       sub: "All passing. LiteSVM 0.10.0.",         c: "#C9A44A" },
    { v: 400, s: "ms",  l: "ER confirmation",        sub: "MagicBlock devnet commit time.",        c: "#3ECECE" },
    { v: 32,  s: "B",   l: "Commitment size",        sub: "SHA-256 digest, stored on-chain.",     c: "rgba(255,255,255,0.7)" },
    { v: 10,  s: "",    l: "Max members per room",   sub: "Configurable via MAX_MEMBERS const.",  c: "#C9A44A" },
    { v: 100, s: "%",   l: "On-chain verifiable",    sub: "Every commitment is tamper-evident.",  c: "#3ECECE" },
    { v: 0,   s: "",    l: "Admin keys",             sub: "No upgrade authority. No oracles.",    c: "rgba(255,255,255,0.7)" },
  ];
  return (
    <section style={{ background: "#000", padding: "80px 24px", overflow: "hidden" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }} ref={ref}>
        <motion.div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 40 }}
          animate={inView ? { opacity: 1 } : { opacity: 0 }} transition={{ duration: 0.6 }}>
          <span className="mono" style={{ fontSize: 10, letterSpacing: "0.18em", color: "rgba(255,255,255,0.2)", textTransform: "uppercase" }}>By the numbers</span>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)" }} />
        </motion.div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: "rgba(255,255,255,0.05)", borderRadius: 16, overflow: "hidden" }}>
          {stats.map((s, i) => (
            <motion.div key={s.l} style={{ background: "#000", padding: "36px 28px" }}
              animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              transition={{ duration: 0.6, delay: i * 0.07 }}>
              <div className="display" style={{ fontSize: "clamp(40px,5vw,64px)", lineHeight: 1, letterSpacing: "-0.02em", color: s.c, marginBottom: 10 }}>
                <CountUp to={s.v} suffix={s.s} />
              </div>
              <div style={{ fontSize: 14, color: "#fff", fontWeight: 500, marginBottom: 6 }}>{s.l}</div>
              <div className="mono" style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", lineHeight: 1.6 }}>{s.sub}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════
   ARCHITECTURE SECTION
══════════════════════════════════════════════════════════════════ */
function ArchitectureSection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const feats = [
    { l: "Session Keys", c: "#C9A44A", d: "Per-room ephemeral keypairs registered on-chain. Main wallet stays offline during ER submission. Scope-enforced by PDA seeds." },
    { l: "SHA-256 Commitment", c: "#3ECECE", d: "sha256(amount_le8 || salt_32) computed in-browser via SubtleCrypto. Verified on-chain by the Rust sha2 crate. Salt in localStorage only." },
    { l: "Ephemeral Rollups", c: "rgba(255,255,255,0.6)", d: "Commitments land in MagicBlock ER in <400ms. delegateRoomForSettlement → resolveRoom → undelegateRoom commits to base layer." },
    { l: "ClearText Actions", c: "#C9A44A", d: "Post-delegation magic actions zero out raw bid amounts before undelegation. Only convergence result reaches base layer." },
    { l: "Private ER (PER)", c: "#3ECECE", d: "access-control feature enables private BidStore ephemeral accounts. Private proposals never reach the base layer, even transiently." },
    { l: "21 Rust Tests", c: "rgba(255,255,255,0.6)", d: "LiteSVM 0.10.0 tests: create_room (3), submit_bid (7), reveal_bid (6), resolve_room (5). All pass." },
  ];
  return (
    <section id="architecture" style={{ background: "#000", padding: "120px 24px", overflow: "hidden" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }} ref={ref}>
        <motion.span className="mono" style={{ fontSize: 10, letterSpacing: "0.2em", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", display: "block", marginBottom: 28 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }} transition={{ duration: 0.6 }}>
          Architecture
        </motion.span>
        <motion.h2 className="display" style={{ fontSize: "clamp(36px,6vw,90px)", lineHeight: 1.0, letterSpacing: "-0.02em", marginBottom: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }} transition={{ duration: 0.8, delay: 0.1 }}>
          <span style={{ color: "#fff" }}>Built on</span>{" "}
          <em style={{ fontStyle: "italic", color: "rgba(255,255,255,0.25)" }}>cryptographic</em><br />
          <span style={{ color: "#fff" }}>truth.</span>
        </motion.h2>
        <motion.p style={{ fontSize: 16, color: "rgba(255,255,255,0.5)", lineHeight: 1.8, maxWidth: 560, marginBottom: 60 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }} transition={{ duration: 0.7, delay: 0.2 }}>
          Anchored to Solana for permanence. Accelerated by MagicBlock ER for speed. Every commitment, session, and reveal is verifiable on-chain. No trust assumptions.
        </motion.p>

        {/* feature grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 32 }}>
          {feats.map((f, i) => (
            <motion.div key={f.l} className="liquid-glass" style={{ borderRadius: 16, padding: "20px 22px" }}
              animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
              transition={{ duration: 0.6, delay: i * 0.09, ease: EASE }}
              whileHover={{ y: -3 }}>
              <span className="mono" style={{ fontSize: 10, letterSpacing: "0.12em", color: f.c, display: "block", marginBottom: 10 }}>{f.l}</span>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.42)", lineHeight: 1.7 }}>{f.d}</p>
            </motion.div>
          ))}
        </div>

        {/* program ID */}
        <motion.div className="liquid-glass" style={{ borderRadius: 12, padding: "14px 18px", display: "inline-flex", alignItems: "center", gap: 16 }}
          animate={inView ? { opacity: 1 } : { opacity: 0 }} transition={{ delay: 0.6 }}>
          <span className="mono" style={{ fontSize: 9, letterSpacing: "0.16em", color: "rgba(255,255,255,0.25)", textTransform: "uppercase" }}>Program · devnet</span>
          <span className="mono" style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>23zkP27qb2eNg1nxKovh3zTLiLKXccKoRHRH6wukMYEs</span>
          <a href="https://explorer.solana.com/address/23zkP27qb2eNg1nxKovh3zTLiLKXccKoRHRH6wukMYEs?cluster=devnet" target="_blank" rel="noopener noreferrer"
            style={{ color: "rgba(255,255,255,0.3)", display: "flex", alignItems: "center" }}>
            <ArrowUpRight size={12} />
          </a>
        </motion.div>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════
   CTA SECTION
══════════════════════════════════════════════════════════════════ */
function CTASection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [room, setRoom] = useState("");
  const router = useRouter();
  return (
    <section style={{ background: "#000", padding: "120px 24px 140px", position: "relative", overflow: "hidden" }}>
      {/* rings */}
      <div aria-hidden style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
        <div className="lp-spin-slow" style={{ width: 600, height: 600, borderRadius: "50%", border: "1px solid rgba(201,164,74,0.07)", position: "absolute" }} />
        <div className="lp-spin-reverse" style={{ width: 420, height: 420, borderRadius: "50%", border: "1px solid rgba(62,206,206,0.05)", position: "absolute" }} />
        <div style={{ position: "absolute", width: 700, height: 700, borderRadius: "50%", background: "radial-gradient(circle, rgba(201,164,74,0.05) 0%, transparent 60%)" }} />
      </div>

      <div style={{ position: "relative", zIndex: 1, maxWidth: 680, margin: "0 auto", textAlign: "center" }} ref={ref}>
        <motion.span className="mono" style={{ fontSize: 10, letterSpacing: "0.2em", color: "rgba(255,255,255,0.25)", textTransform: "uppercase", display: "block", marginBottom: 28 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }} transition={{ duration: 0.6 }}>
          Get started
        </motion.span>
        <motion.h2 className="display" style={{ fontSize: "clamp(44px,8vw,104px)", lineHeight: 0.97, letterSpacing: "-0.02em", marginBottom: 24 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }} transition={{ duration: 0.9, delay: 0.1, ease: EASE }}>
          <span style={{ color: "#fff" }}>Your next decision</span><br />
          <em className="lp-hero-gradient" style={{ fontStyle: "italic" }}>deserves truth.</em>
        </motion.h2>
        <motion.p style={{ fontSize: 16, color: "rgba(255,255,255,0.45)", lineHeight: 1.75, marginBottom: 44 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }} transition={{ duration: 0.7, delay: 0.2 }}>
          Stop letting the loudest voice win. Open a BidLock room in 30 seconds, share the URL, seal · reveal · converge.
        </motion.p>

        <motion.div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginBottom: 28 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }} transition={{ duration: 0.7, delay: 0.3 }}>
          <div className="liquid-glass" style={{ borderRadius: 999, padding: "9px 9px 9px 18px", display: "flex", alignItems: "center", gap: 8, flex: "1 1 220px", maxWidth: 340 }}>
            <input suppressHydrationWarning type="text" placeholder="Paste a room address…" value={room} onChange={e => setRoom(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && room.trim()) router.push(`/room/${room.trim()}`); }}
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 13, color: "#fff", fontFamily: "inherit" }} />
          </div>
          <Link href={room.trim() ? `/room/${room.trim()}` : "/create"} className="liquid-glass" style={{ borderRadius: 999, padding: "12px 28px", fontSize: 14, color: "#fff", whiteSpace: "nowrap" }}>
            {room.trim() ? "Enter Room →" : "Create Room →"}
          </Link>
        </motion.div>

        <motion.div style={{ display: "flex", justifyContent: "center", gap: 28, flexWrap: "wrap" }}
          animate={inView ? { opacity: 1 } : { opacity: 0 }} transition={{ delay: 0.45 }}>
          {[
            { l: "Solana Explorer", href: "https://explorer.solana.com/address/23zkP27qb2eNg1nxKovh3zTLiLKXccKoRHRH6wukMYEs?cluster=devnet" },
            { l: "MagicBlock ER", href: "https://magicblock.gg" },
          ].map(link => (
            <a key={link.l} href={link.href} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", display: "flex", alignItems: "center", gap: 4 }}>
              {link.l} <ArrowUpRight size={10} />
            </a>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════
   FOOTER
══════════════════════════════════════════════════════════════════ */
function LandingFooter() {
  return (
    <footer style={{ background: "#000", borderTop: "1px solid rgba(255,255,255,0.06)", padding: "48px 24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 32 }}>
        <div style={{ maxWidth: 280 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <Lock size={13} color="#C9A44A" strokeWidth={1.5} />
            <span className="display" style={{ fontSize: 16, color: "#fff" }}>BidLock</span>
          </div>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", lineHeight: 1.7 }}>
            Commit-reveal coordination protocol on Solana. Seal every proposal. Reveal simultaneously. Converge honestly.
          </p>
        </div>
        <div style={{ display: "flex", gap: 48, flexWrap: "wrap" }}>
          {[
            { head: "Product", links: [{ l: "Create Room", h: "/create" }, { l: "Enter Room", h: "/" }, { l: "Protocol", h: "#protocol" }] },
            { head: "Technical", links: [{ l: "Architecture", h: "#architecture" }, { l: "How it works", h: "#how-it-works" }, { l: "MagicBlock", h: "https://magicblock.gg" }] },
          ].map(col => (
            <div key={col.head}>
              <p className="mono" style={{ fontSize: 9, letterSpacing: "0.18em", color: "rgba(255,255,255,0.2)", textTransform: "uppercase", marginBottom: 16 }}>{col.head}</p>
              {col.links.map(lk => (
                <div key={lk.l} style={{ marginBottom: 10 }}>
                  <Link href={lk.h} style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}
                    onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.75)")}
                    onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}>
                    {lk.l}
                  </Link>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div style={{ maxWidth: 1100, margin: "28px auto 0", borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 20, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <span className="mono" style={{ fontSize: 10, color: "rgba(255,255,255,0.15)" }}>© 2025 BidLock · MIT License</span>
        <span className="mono" style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>Built on Solana + MagicBlock</span>
      </div>
    </footer>
  );
}

/* ══════════════════════════════════════════════════════════════════
   PAGE
══════════════════════════════════════════════════════════════════ */
export default function Home() {
  return (
    <div style={{ background: "#000", minHeight: "100vh" }}>
      <LandingNav />
      <HeroSection />
      <MarqueeSection />
      <ProblemSection />
      <ProtocolSection />
      <StatsSection />
      <ArchitectureSection />
      <CTASection />
      <LandingFooter />
    </div>
  );
}
