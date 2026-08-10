"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { motion } from "framer-motion";
import { Lock, X, Plus, ArrowRight } from "lucide-react";
import { useProgram } from "@/lib/program";
import { roomPda, shortenAddress } from "@/lib/pda";

const WalletButton = dynamic(
  () => import("@/components/WalletButton").then((m) => m.WalletButton),
  { ssr: false }
);

const EASE = [0.16, 1, 0.3, 1] as const;

function isValidPubkey(s: string): boolean {
  try { new PublicKey(s); return true; } catch { return false; }
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mono" style={{ display: "block", fontSize: 9, letterSpacing: "0.2em", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", marginBottom: 10 }}>
      {children}
    </label>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 12, color: "rgba(255,255,255,0.28)", marginTop: 8, lineHeight: 1.6 }}>{children}</p>;
}

function GlassInput({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="liquid-glass"
      style={{
        width: "100%", background: "transparent", border: "none",
        borderRadius: 10, padding: "12px 16px",
        fontSize: 14, color: "#fff", fontFamily: "inherit", outline: "none",
        ...(props.style ?? {}),
      }}
    />
  );
}

export default function CreatePage() {
  const router = useRouter();
  const { publicKey, connected } = useWallet();
  const program = useProgram();

  const [description, setDescription] = useState("");
  const [members, setMembers]         = useState<string[]>([""]);
  const [sealingHours, setSealingHours] = useState("24");
  const [revealHours, setRevealHours]   = useState("48");
  const [status, setStatus]   = useState<"idle" | "creating" | "done" | "error">("idle");
  const [errMsg, setErrMsg]   = useState("");
  const [roomAddr, setRoomAddr] = useState("");

  const addMember    = () => setMembers(m => [...m, ""]);
  const removeMember = (i: number) => setMembers(m => m.filter((_, idx) => idx !== i));
  const updateMember = (i: number, v: string) => setMembers(m => m.map((x, idx) => idx === i ? v : x));

  const handleCreate = useCallback(async () => {
    if (!program || !publicKey) return;
    setErrMsg("");
    const validMembers = members.map(m => m.trim()).filter(m => m.length > 0 && isValidPubkey(m));
    if (!description.trim()) { setErrMsg("Add a description."); return; }
    if (validMembers.length === 0) { setErrMsg("Add at least one member address."); return; }
    if (parseInt(revealHours) <= parseInt(sealingHours)) { setErrMsg("Convergence window must end after the sealing window."); return; }

    const allMembers = [...new Set([publicKey.toBase58(), ...validMembers])].map(k => new PublicKey(k));
    const roomId     = new BN(Date.now());
    const now        = Math.floor(Date.now() / 1000);
    const submissionDeadline = new BN(now + parseInt(sealingHours) * 3600);
    const revealDeadline     = new BN(now + parseInt(revealHours) * 3600);

    setStatus("creating");
    try {
      const p = program as any;
      await p.methods
        .createRoom(roomId, description.trim(), allMembers, submissionDeadline, revealDeadline)
        .accounts({ creator: publicKey })
        .rpc({ commitment: "confirmed" });
      const pda = roomPda(publicKey, roomId);
      setRoomAddr(pda.toBase58());
      setStatus("done");
    } catch (e: any) {
      setErrMsg(e?.message ?? "Transaction failed.");
      setStatus("error");
    }
  }, [program, publicKey, description, members, sealingHours, revealHours]);

  /* ── Done state ── */
  if (status === "done") {
    return (
      <div style={{ minHeight: "100vh", background: "#000", display: "flex", flexDirection: "column" }}>
        <PageNav />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <motion.div className="liquid-glass" style={{ borderRadius: 24, maxWidth: 520, width: "100%", padding: "48px 40px" }}
            initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}>
            <span className="mono" style={{ fontSize: 9, letterSpacing: "0.22em", color: "#C9A44A", textTransform: "uppercase", display: "block", marginBottom: 20 }}>
              Room created
            </span>
            <h2 className="display" style={{ fontSize: 32, color: "#fff", marginBottom: 10 }}>{description}</h2>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", lineHeight: 1.7, marginBottom: 28 }}>
              Share this address with your group. Each member navigates to the room URL to seal their proposal.
            </p>
            <div className="liquid-glass" style={{ borderRadius: 10, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span className="mono" style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", wordBreak: "break-all" }}>{roomAddr}</span>
              <button className="mono" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/room/${roomAddr}`)}
                style={{ padding: "6px 12px", fontSize: 9, color: "#C9A44A", background: "transparent", border: "1px solid rgba(201,164,74,0.25)", borderRadius: 6, cursor: "pointer", whiteSpace: "nowrap", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                Copy URL
              </button>
            </div>
            <button onClick={() => router.push(`/room/${roomAddr}`)} style={{
              width: "100%", padding: "14px", background: "#C9A44A", color: "#000", border: "none", borderRadius: 10,
              fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.05em",
            }}>
              Enter Room →
            </button>
          </motion.div>
        </div>
      </div>
    );
  }

  /* ── Form ── */
  return (
    <div style={{ minHeight: "100vh", background: "#000", display: "flex", flexDirection: "column" }}>
      <PageNav />

      {/* ambient */}
      <div aria-hidden style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        <div style={{ position: "absolute", top: "20%", left: "50%", transform: "translateX(-50%)", width: 700, height: 500, background: "radial-gradient(ellipse, rgba(201,164,74,0.05) 0%, transparent 65%)" }} />
      </div>

      <main style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "60px 24px 80px" }}>
        <div style={{ maxWidth: 520, width: "100%" }}>
          {/* Header */}
          <motion.div style={{ marginBottom: 44 }}
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE }}>
            <span className="mono" style={{ fontSize: 9, letterSpacing: "0.22em", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", display: "block", marginBottom: 14 }}>
              New Room
            </span>
            <h1 className="display" style={{ fontSize: "clamp(32px,5vw,52px)", lineHeight: 1.05, color: "#fff", marginBottom: 10 }}>
              What is the group deciding?
            </h1>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", lineHeight: 1.7 }}>
              Create a sealed proposal room. Every member proposes privately, then reveals at once.
            </p>
          </motion.div>

          {!connected ? (
            <motion.div className="liquid-glass" style={{ borderRadius: 20, padding: 32, textAlign: "center" }}
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}>
              <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: 20, fontSize: 14 }}>Connect your wallet to create a room.</p>
              <WalletButton />
            </motion.div>
          ) : (
            <motion.form onSubmit={e => { e.preventDefault(); handleCreate(); }} style={{ display: "flex", flexDirection: "column", gap: 28 }}
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}>

              {/* Description */}
              <div>
                <FieldLabel>What are we deciding?</FieldLabel>
                <GlassInput placeholder="e.g. Budget for Q4 marketing" value={description} onChange={e => setDescription(e.target.value)} maxLength={200} />
                <Hint>This appears at the top of every member&apos;s room view.</Hint>
              </div>

              {/* Members */}
              <div>
                <FieldLabel>Member addresses</FieldLabel>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {members.map((m, i) => (
                    <div key={i} style={{ display: "flex", gap: 8 }}>
                      <GlassInput className="mono liquid-glass" placeholder={`Member ${i + 1} address`} value={m} onChange={e => updateMember(i, e.target.value)}
                        style={{ fontSize: 11 }} />
                      {members.length > 1 && (
                        <button type="button" onClick={() => removeMember(i)}
                          style={{ width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, cursor: "pointer", color: "rgba(255,255,255,0.5)", flexShrink: 0 }}>
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addMember}
                  style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "rgba(255,255,255,0.45)", background: "transparent", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontFamily: "inherit" }}>
                  <Plus size={12} /> Add member
                </button>
                <Hint>Your address ({shortenAddress(publicKey!.toBase58(), 4)}) is added automatically.</Hint>
              </div>

              {/* Deadlines */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <FieldLabel>Sealing window (hours)</FieldLabel>
                  <GlassInput className="mono liquid-glass" type="number" min={1} value={sealingHours} onChange={e => setSealingHours(e.target.value)} />
                  <Hint>How long members have to seal.</Hint>
                </div>
                <div>
                  <FieldLabel>Convergence window (hours)</FieldLabel>
                  <GlassInput className="mono liquid-glass" type="number" min={2} value={revealHours} onChange={e => setRevealHours(e.target.value)} />
                  <Hint>Must end after sealing closes.</Hint>
                </div>
              </div>

              {/* Error */}
              {errMsg && (
                <div style={{ padding: "12px 16px", background: "rgba(217,80,80,0.06)", border: "1px solid rgba(217,80,80,0.2)", borderRadius: 8 }}>
                  <p className="mono" style={{ fontSize: 11, color: "#D95050", letterSpacing: "0.05em" }}>{errMsg}</p>
                </div>
              )}

              {/* Submit */}
              <button type="submit" disabled={status === "creating" || !connected}
                style={{
                  width: "100%", padding: "14px", background: status === "creating" ? "rgba(201,164,74,0.4)" : "#C9A44A",
                  color: "#000", border: "none", borderRadius: 10,
                  fontSize: 13, fontWeight: 600, cursor: status === "creating" ? "not-allowed" : "pointer",
                  fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  transition: "background 0.2s",
                }}>
                {status === "creating" ? (
                  <><div className="spinner" style={{ borderTopColor: "#06040A" }} /> Creating room…</>
                ) : (
                  <><ArrowRight size={14} /> Create Room</>
                )}
              </button>
            </motion.form>
          )}
        </div>
      </main>
    </div>
  );
}

function PageNav() {
  return (
    <header style={{ position: "sticky", top: 0, zIndex: 50, padding: "16px 24px", background: "#000", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Lock size={13} color="#C9A44A" strokeWidth={1.5} />
          <span className="display" style={{ fontSize: 17, color: "#fff" }}>BidLock</span>
        </Link>
        <WalletButton />
      </div>
    </header>
  );
}
