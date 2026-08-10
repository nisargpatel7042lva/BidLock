"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { useProgram } from "@/lib/program";
import { roomPda, shortenAddress } from "@/lib/pda";

const WalletButton = dynamic(
  () => import("@/components/WalletButton").then((m) => m.WalletButton),
  { ssr: false }
);

function isValidPubkey(s: string): boolean {
  try { new PublicKey(s); return true; } catch { return false; }
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="mono" style={{
      display: "block", fontSize: 10, letterSpacing: "0.16em",
      color: "var(--text-3)", textTransform: "uppercase", marginBottom: 8,
    }}>
      {children}
    </label>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 6, lineHeight: 1.5 }}>
      {children}
    </p>
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

  const addMember = () => setMembers((m) => [...m, ""]);
  const removeMember = (i: number) => setMembers((m) => m.filter((_, idx) => idx !== i));
  const updateMember = (i: number, v: string) =>
    setMembers((m) => m.map((x, idx) => (idx === i ? v : x)));

  const handleCreate = useCallback(async () => {
    if (!program || !publicKey) return;

    setErrMsg("");

    const validMembers = members
      .map((m) => m.trim())
      .filter((m) => m.length > 0 && isValidPubkey(m));

    if (!description.trim()) { setErrMsg("Add a description."); return; }
    if (validMembers.length === 0) { setErrMsg("Add at least one member address."); return; }

    const allMembers = [...new Set([publicKey.toBase58(), ...validMembers])].map(
      (k) => new PublicKey(k)
    );

    const roomId = new BN(Date.now());
    const now    = Math.floor(Date.now() / 1000);
    const submissionDeadline = new BN(now + parseInt(sealingHours) * 3600);
    const revealDeadline     = new BN(now + parseInt(revealHours)  * 3600);

    if (parseInt(revealHours) <= parseInt(sealingHours)) {
      setErrMsg("Convergence window must end after the sealing window.");
      return;
    }

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

  if (status === "done") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <Nav />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div className="card animate-fade-up" style={{ maxWidth: 560, width: "100%", padding: "40px 36px" }}>
            <div className="mono" style={{
              fontSize: 10, letterSpacing: "0.22em", color: "var(--gold)",
              textTransform: "uppercase", marginBottom: 24,
            }}>
              Room created
            </div>
            <h2 className="display" style={{ fontSize: 36, marginBottom: 12 }}>
              {description}
            </h2>
            <p style={{ fontSize: 14, color: "var(--text-2)", marginBottom: 32, lineHeight: 1.6 }}>
              Share this address with your group. Each member navigates to the room URL to seal their proposal.
            </p>

            <div style={{
              background: "var(--surface-2)", border: "1px solid var(--border)",
              padding: "14px 16px", marginBottom: 24, display: "flex",
              alignItems: "center", justifyContent: "space-between", gap: 12,
            }}>
              <span className="mono" style={{ fontSize: 12, color: "var(--text-2)", wordBreak: "break-all" }}>
                {roomAddr}
              </span>
              <button
                className="btn-ghost"
                style={{ padding: "7px 14px", fontSize: 10, flexShrink: 0 }}
                onClick={() => navigator.clipboard.writeText(`${window.location.origin}/room/${roomAddr}`)}
              >
                Copy
              </button>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                className="btn-gold"
                style={{ flex: 1, justifyContent: "center" }}
                onClick={() => router.push(`/room/${roomAddr}`)}
              >
                Enter Room →
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Nav />

      <main style={{ flex: 1, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 24px" }}>
        <div style={{ maxWidth: 560, width: "100%" }}>
          {/* Header */}
          <div className="animate-fade-up" style={{ marginBottom: 40 }}>
            <div className="mono" style={{
              fontSize: 10, letterSpacing: "0.22em", color: "var(--text-3)",
              textTransform: "uppercase", marginBottom: 12,
            }}>
              New Room
            </div>
            <h1 className="display" style={{ fontSize: 44, lineHeight: 1.05, marginBottom: 10 }}>
              What is the group deciding?
            </h1>
            <p style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.6 }}>
              Create a sealed proposal room. Every member proposes privately, then reveals at once.
            </p>
          </div>

          {!connected ? (
            <div className="card animate-fade-up stagger-1" style={{ padding: 32, textAlign: "center" }}>
              <p style={{ color: "var(--text-2)", marginBottom: 20, fontSize: 14 }}>
                Connect your wallet to create a room.
              </p>
              <WalletButton />
            </div>
          ) : (
            <form
              onSubmit={(e) => { e.preventDefault(); handleCreate(); }}
              style={{ display: "flex", flexDirection: "column", gap: 28 }}
              className="animate-fade-up stagger-1"
            >
              {/* Description */}
              <div>
                <Label>What are we deciding?</Label>
                <input
                  className="input-dark"
                  placeholder="e.g. Budget for Q4 marketing"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={200}
                />
                <Hint>This appears at the top of every member's room view.</Hint>
              </div>

              {/* Members */}
              <div>
                <Label>Member addresses</Label>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {members.map((m, i) => (
                    <div key={i} style={{ display: "flex", gap: 6 }}>
                      <input
                        className="input-dark mono"
                        placeholder={`Member ${i + 1} address`}
                        value={m}
                        onChange={(e) => updateMember(i, e.target.value)}
                        style={{ flex: 1, fontSize: 12 }}
                      />
                      {members.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeMember(i)}
                          className="btn-ghost"
                          style={{ padding: "0 14px", fontSize: 16 }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addMember}
                  className="btn-ghost"
                  style={{ marginTop: 8, padding: "8px 16px", fontSize: 11 }}
                >
                  + Add member
                </button>
                <Hint>
                  Your address ({shortenAddress(publicKey!.toBase58(), 4)}) is added as a
                  member automatically.
                </Hint>
              </div>

              {/* Sealing window */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <Label>Sealing window (hours)</Label>
                  <input
                    className="input-dark mono"
                    type="number"
                    min={1}
                    value={sealingHours}
                    onChange={(e) => setSealingHours(e.target.value)}
                  />
                  <Hint>How long members have to seal their proposal.</Hint>
                </div>
                <div>
                  <Label>Convergence window (hours)</Label>
                  <input
                    className="input-dark mono"
                    type="number"
                    min={2}
                    value={revealHours}
                    onChange={(e) => setRevealHours(e.target.value)}
                  />
                  <Hint>When members reveal — must be after sealing ends.</Hint>
                </div>
              </div>

              {/* Error */}
              {(errMsg || status === "error") && (
                <p className="mono animate-fade-in" style={{
                  fontSize: 12, color: "var(--red)", letterSpacing: "0.05em",
                  padding: "12px 16px", background: "rgba(217,80,80,0.06)",
                  border: "1px solid rgba(217,80,80,0.2)",
                }}>
                  {errMsg || "Something went wrong. Check your wallet and try again."}
                </p>
              )}

              <button
                type="submit"
                className="btn-gold"
                disabled={status === "creating" || !connected}
                style={{ justifyContent: "center", padding: 14 }}
              >
                {status === "creating" ? (
                  <><div className="spinner" style={{ borderTopColor: "#06040A" }} /> Creating room…</>
                ) : (
                  "Create Room →"
                )}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

function Nav() {
  return (
    <nav style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "20px 40px", borderBottom: "1px solid var(--border)",
    }}>
      <Link href="/" className="display" style={{ fontSize: 20, letterSpacing: "-0.02em" }}>BidLock</Link>
      <WalletButton />
    </nav>
  );
}
