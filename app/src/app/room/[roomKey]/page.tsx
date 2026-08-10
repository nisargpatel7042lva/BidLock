/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { useProgram } from "@/lib/program";
import { sessionPda, shortenAddress, PROGRAM_ID } from "@/lib/pda";
import { getOrCreateSessionKey, storeProposal, getProposal } from "@/lib/session";
import { computeCommitment, randomSalt } from "@/lib/commitment";
import { getRoomStatus, type RoomAccount } from "@/lib/bidlock_types";
import { ParticipantGrid } from "@/components/ParticipantGrid";
import { CountdownTimer } from "@/components/CountdownTimer";
import { SealCard } from "@/components/SealCard";
import { ConvergenceReveal } from "@/components/ConvergenceReveal";

const WalletButton = dynamic(
  () => import("@/components/WalletButton").then((m) => m.WalletButton),
  { ssr: false }
);

function Label({ text }: { text: string }) {
  return (
    <span className="mono" style={{
      fontSize: 10, letterSpacing: "0.16em", color: "var(--text-3)",
      textTransform: "uppercase",
    }}>{text}</span>
  );
}

function Section({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ padding: "24px 0", borderBottom: "1px solid var(--border)", ...style }}>
      {children}
    </div>
  );
}

export default function RoomPage({
  params,
}: {
  params: Promise<{ roomKey: string }>;
}) {
  const { roomKey } = use(params);
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();
  const program = useProgram();

  const [room, setRoom]             = useState<RoomAccount | null>(null);
  const [loading, setLoading]       = useState(true);
  const [errMsg, setErrMsg]         = useState("");
  const [actionMsg, setActionMsg]   = useState("");
  const [actionErr, setActionErr]   = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [copied, setCopied]         = useState(false);

  const roomPubkey = (() => {
    try { return new PublicKey(roomKey); } catch { return null; }
  })();

  /* ── Fetch room ─────────────────────────────────────────────────── */
  const fetchRoom = useCallback(async () => {
    if (!program || !roomPubkey) return;
    try {
      const data = await (program as any).account.room.fetch(roomPubkey);
      setRoom(data as unknown as RoomAccount);
      setErrMsg("");
    } catch (e: any) {
      setErrMsg("Room not found or could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [program, roomPubkey]);

  useEffect(() => {
    fetchRoom();
    const id = setInterval(fetchRoom, 5000);
    return () => clearInterval(id);
  }, [fetchRoom]);

  /* ── Session key setup ──────────────────────────────────────────── */
  useEffect(() => {
    if (!connected || !publicKey || !room || !program || sessionReady) return;

    const memberKey = publicKey.toBase58();
    const isMember  = room.members.some((m) => m.toBase58() === memberKey);
    if (!isMember) return;

    (async () => {
      const sessionKp  = getOrCreateSessionKey(roomKey);
      const sessionPdaKey = sessionPda(roomPubkey!, publicKey);

      try {
        await (program as any).account.roomSession.fetch(sessionPdaKey);
        setSessionReady(true);
      } catch {
        // Session not yet registered on-chain — create it
        try {
          const validUntil = new BN(Math.floor(Date.now() / 1000) + 7 * 24 * 3600);
          await (program as any).methods
            .createSession(sessionKp.publicKey, validUntil)
            .accounts({ member: publicKey, room: roomPubkey! })
            .rpc({ commitment: "confirmed" });
          setSessionReady(true);
        } catch (e) {
          // Might already exist (race condition) — treat as fine
          setSessionReady(true);
        }
      }
    })();
  }, [connected, publicKey, room, program, sessionReady, roomKey, roomPubkey]);

  /* ── Seal proposal ──────────────────────────────────────────────── */
  const handleSeal = useCallback(async (amountStr: string) => {
    if (!program || !publicKey || !room || !roomPubkey) throw new Error("Not connected");

    const amount = BigInt(amountStr);
    const salt   = randomSalt();
    const commitment = await computeCommitment(amount, salt);

    const sessionKp  = getOrCreateSessionKey(roomKey);
    const sessionPdaKey = sessionPda(roomPubkey, publicKey);

    storeProposal(roomKey, amountStr, Array.from(salt));

    await (program as any).methods
      .submitBid(Array.from(commitment))
      .accounts({
        signer: sessionKp.publicKey,
        room: roomPubkey,
        roomSession: sessionPdaKey,
      })
      .signers([sessionKp])
      .rpc({ commitment: "confirmed" });

    await fetchRoom();
  }, [program, publicKey, room, roomPubkey, roomKey, fetchRoom]);

  /* ── Reveal proposal ────────────────────────────────────────────── */
  const handleReveal = useCallback(async () => {
    if (!program || !publicKey || !roomPubkey) return;
    const stored = getProposal(roomKey);
    if (!stored) { setActionErr("No stored proposal found. Did you seal from this browser?"); return; }

    setActionBusy(true);
    setActionErr("");
    try {
      await (program as any).methods
        .revealBid(new BN(stored.amount), stored.salt)
        .accounts({ member: publicKey, room: roomPubkey })
        .rpc({ commitment: "confirmed" });
      setActionMsg("Proposal revealed.");
      await fetchRoom();
    } catch (e: any) {
      setActionErr(e?.message ?? "Reveal failed.");
    } finally {
      setActionBusy(false);
    }
  }, [program, publicKey, roomPubkey, roomKey, fetchRoom]);

  /* ── Delegate for settlement ────────────────────────────────────── */
  const handleSettle = useCallback(async () => {
    if (!program || !publicKey || !room || !roomPubkey) return;

    setActionBusy(true);
    setActionErr("");
    try {
      const roomId = room.roomId;
      await (program as any).methods
        .delegateRoomForSettlement(roomId)
        .accounts({ payer: publicKey })
        .rpc({ commitment: "confirmed" });
      setActionMsg("Settlement triggered. Waiting for convergence…");
      setTimeout(fetchRoom, 6000);
    } catch (e: any) {
      setActionErr(e?.message ?? "Settlement failed.");
    } finally {
      setActionBusy(false);
    }
  }, [program, publicKey, room, roomPubkey, fetchRoom]);

  /* ── Undelegate ─────────────────────────────────────────────────── */
  const handleUndelegate = useCallback(async () => {
    if (!program || !publicKey || !room || !roomPubkey) return;

    setActionBusy(true);
    setActionErr("");
    try {
      const roomId = room.roomId;
      await (program as any).methods
        .undelegateRoom(roomId)
        .accounts({ payer: publicKey })
        .rpc({ commitment: "confirmed" });
      setActionMsg("Room converged on base layer.");
      await fetchRoom();
    } catch (e: any) {
      setActionErr(e?.message ?? "Undelegate failed.");
    } finally {
      setActionBusy(false);
    }
  }, [program, publicKey, room, roomPubkey, fetchRoom]);

  /* ── Render helpers ─────────────────────────────────────────────── */
  const memberKey  = publicKey?.toBase58();
  const isMember   = room && memberKey ? room.members.some((m) => m.toBase58() === memberKey) : false;
  const isCreator  = room && memberKey ? room.creator.toBase58() === memberKey : false;
  const hasSealed  = room && memberKey ? room.submissions.some((s) => s.member.toBase58() === memberKey) : false;
  const hasRevealed = room && memberKey ? room.reveals.some((r) => r.member.toBase58() === memberKey) : false;
  const status     = room ? getRoomStatus(room) : null;
  const now        = Math.floor(Date.now() / 1000);
  const sealDeadline   = room ? room.submissionDeadline.toNumber() : 0;
  const revealDeadline = room ? room.revealDeadline.toNumber() : 0;
  const sealingOpen    = status === "submissionOpen" && now < sealDeadline;
  const revealOpen     = now > sealDeadline && now < revealDeadline;
  const canSettle      = now > revealDeadline && status !== "resolved";

  const copyUrl = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  /* ── Render ─────────────────────────────────────────────────────── */
  if (!roomPubkey) {
    return <ErrorScreen msg="Invalid room address." />;
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Nav */}
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 32px", borderBottom: "1px solid var(--border)", position: "sticky",
        top: 0, background: "var(--bg)", zIndex: 20,
      }}>
        <Link href="/" className="display" style={{ fontSize: 18, letterSpacing: "-0.02em" }}>BidLock</Link>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={copyUrl} className="btn-ghost" style={{ padding: "7px 14px", fontSize: 10 }}>
            {copied ? "Copied!" : "Copy Room URL"}
          </button>
          <WalletButton />
        </div>
      </nav>

      <main style={{ flex: 1, maxWidth: 720, width: "100%", margin: "0 auto", padding: "0 24px 60px" }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 80 }}>
            <div className="spinner" style={{ width: 24, height: 24 }} />
          </div>
        ) : errMsg ? (
          <ErrorScreen msg={errMsg} />
        ) : room ? (
          <>
            {/* Room header */}
            <Section style={{ paddingTop: 36 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 6 }}>
                <h1 className="display animate-fade-up" style={{ fontSize: "clamp(28px, 5vw, 44px)", lineHeight: 1.05 }}>
                  {room.poolDescription}
                </h1>
                <StatusBadge status={status!} />
              </div>

              <div className="mono animate-fade-up stagger-1" style={{
                fontSize: 11, color: "var(--text-3)", letterSpacing: "0.08em",
              }}>
                {shortenAddress(roomKey, 6)}
              </div>
            </Section>

            {/* Timers */}
            {status !== "resolved" && (
              <Section>
                <div style={{ display: "flex", gap: 40, flexWrap: "wrap" }}>
                  <CountdownTimer
                    deadline={sealDeadline}
                    label="Sealing closes"
                    onExpire={fetchRoom}
                  />
                  <CountdownTimer
                    deadline={revealDeadline}
                    label="Convergence closes"
                    onExpire={fetchRoom}
                  />
                </div>
              </Section>
            )}

            {/* Participants */}
            <Section>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <Label text="Participants" />
                <span className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>
                  {room.submissions.length}/{room.members.length} sealed
                  {room.reveals.length > 0 && ` · ${room.reveals.filter((r) => r.valid).length} revealed`}
                </span>
              </div>
              <ParticipantGrid room={room} currentMember={publicKey} />
            </Section>

            {/* ── Convergence result ────────────────────────────────── */}
            {status === "resolved" && (
              <Section>
                <ConvergenceReveal room={room} />
              </Section>
            )}

            {/* ── Action panel ──────────────────────────────────────── */}
            {connected && isMember && status !== "resolved" && (
              <Section>
                {sealingOpen && !hasSealed && sessionReady && (
                  <div className="animate-fade-up">
                    <div style={{ marginBottom: 14 }}>
                      <Label text="Your proposal" />
                    </div>
                    <SealCard onSeal={handleSeal} disabled={actionBusy} />
                  </div>
                )}

                {sealingOpen && !hasSealed && !sessionReady && (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, color: "var(--text-3)", fontSize: 13 }}>
                    <div className="spinner" />
                    Setting up your session key…
                  </div>
                )}

                {sealingOpen && hasSealed && (
                  <SealedWaitingMessage />
                )}

                {revealOpen && !hasRevealed && (
                  <div className="animate-fade-up" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <p style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.6 }}>
                      The sealing window has closed. Reveal your proposal to contribute to convergence.
                    </p>
                    <button
                      className="btn-teal"
                      onClick={handleReveal}
                      disabled={actionBusy}
                    >
                      {actionBusy ? <><div className="spinner" /> Revealing…</> : "Reveal Proposal"}
                    </button>
                  </div>
                )}

                {revealOpen && hasRevealed && (
                  <p style={{ fontSize: 14, color: "var(--text-2)" }}>
                    Your proposal is revealed. Waiting for the group to converge…
                  </p>
                )}

                {canSettle && isCreator && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <p style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.6 }}>
                      All windows have closed. Trigger settlement to compute the group answer.
                    </p>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button className="btn-teal" onClick={handleSettle} disabled={actionBusy}>
                        {actionBusy ? <><div className="spinner" /> Working…</> : "Trigger Settlement"}
                      </button>
                      <button className="btn-ghost" onClick={handleUndelegate} disabled={actionBusy}>
                        Commit to Chain
                      </button>
                    </div>
                  </div>
                )}
              </Section>
            )}

            {/* Not a member */}
            {connected && !isMember && (
              <Section>
                <p className="mono" style={{ fontSize: 12, color: "var(--text-3)", letterSpacing: "0.05em" }}>
                  You are not listed as a member of this room. You can observe but not propose.
                </p>
              </Section>
            )}

            {/* Connect prompt */}
            {!connected && (
              <Section style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
                <p style={{ fontSize: 14, color: "var(--text-2)" }}>Connect your wallet to participate.</p>
                <WalletButton />
              </Section>
            )}

            {/* Feedback messages */}
            {(actionMsg || actionErr) && (
              <div className="animate-fade-in" style={{ marginTop: 16 }}>
                {actionMsg && (
                  <p className="mono" style={{ fontSize: 12, color: "var(--teal)", letterSpacing: "0.06em" }}>
                    ◎ {actionMsg}
                  </p>
                )}
                {actionErr && (
                  <p className="mono" style={{
                    fontSize: 12, color: "var(--red)", letterSpacing: "0.06em",
                    padding: "10px 14px", background: "rgba(217,80,80,0.06)",
                    border: "1px solid rgba(217,80,80,0.2)", marginTop: 8,
                  }}>
                    {actionErr}
                  </p>
                )}
              </div>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "submissionOpen") return <span className="badge badge-sealing">● Sealing</span>;
  if (status === "revealOpen")     return <span className="badge badge-revealing">● Revealing</span>;
  if (status === "resolved")       return <span className="badge badge-converged">◉ Converged</span>;
  return <span className="badge badge-sealed">○ Pending</span>;
}

function SealedWaitingMessage() {
  return (
    <div className="card-sealed animate-fade-in" style={{ padding: "20px 22px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <rect x="3" y="9" width="14" height="10" rx="0.5" stroke="var(--gold)" strokeWidth="1.3" />
          <path d="M6.5 9V6.5a3.5 3.5 0 017 0V9" stroke="var(--gold)" strokeWidth="1.3" strokeLinecap="square" />
          <rect x="8.5" y="12" width="3" height="3" rx="1.5" fill="var(--gold)" />
        </svg>
        <div>
          <div className="mono" style={{ fontSize: 11, color: "var(--gold)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
            Proposal sealed
          </div>
          <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 4 }}>
            Waiting for others to seal, then the reveal window opens.
          </div>
        </div>
      </div>
    </div>
  );
}

function ErrorScreen({ msg }: { msg: string }) {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
      <div style={{ textAlign: "center" }}>
        <div className="mono" style={{ fontSize: 11, color: "var(--text-3)", letterSpacing: "0.18em", marginBottom: 12 }}>
          Error
        </div>
        <p style={{ color: "var(--text-2)", marginBottom: 20 }}>{msg}</p>
        <Link href="/" className="btn-ghost" style={{ fontSize: 11 }}>← Back home</Link>
      </div>
    </div>
  );
}
