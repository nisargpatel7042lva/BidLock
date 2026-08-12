/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { useProgram, useERProgram, getDelegationStatus, makeERProgramAtFqdn, IS_LOCALNET } from "@/lib/program";
import { sessionPda, shortenAddress } from "@/lib/pda";
import { getOrCreateSessionKey, getSessionKey, storeProposal, getProposal } from "@/lib/session";
import { computeCommitment, randomSalt } from "@/lib/commitment";
import { getRoomStatus, type RoomAccount } from "@/lib/bidlock_types";
import { friendlyError } from "@/lib/errors";
import { ParticipantGrid } from "@/components/ParticipantGrid";
import { CountdownTimer } from "@/components/CountdownTimer";
import { ConvergenceReveal } from "@/components/ConvergenceReveal";

const WalletButton = dynamic(
  () => import("@/components/WalletButton").then((m) => m.WalletButton),
  { ssr: false }
);

/* ── tiny shared bits ─────────────────────────────────────────────── */
function Mono({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <span className="mono" style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", ...style }}>{children}</span>;
}

/* ── Phase stepper ────────────────────────────────────────────────── */
function PhaseStepper({ phase }: { phase: "seal" | "reveal" | "settle" | "done" }) {
  const steps = [
    { key: "seal",   label: "Seal" },
    { key: "reveal", label: "Reveal" },
    { key: "settle", label: "Converge" },
    { key: "done",   label: "Done" },
  ];
  const idx = steps.findIndex(s => s.key === phase);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 32 }}>
      {steps.map((s, i) => {
        const past    = i < idx;
        const current = i === idx;
        return (
          <div key={s.key} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : 0 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                background: current ? "#C9A44A" : past ? "rgba(62,206,206,0.2)" : "rgba(255,255,255,0.06)",
                border: current ? "2px solid #C9A44A" : past ? "2px solid rgba(62,206,206,0.4)" : "2px solid rgba(255,255,255,0.1)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, color: current ? "#000" : past ? "#3ECECE" : "rgba(255,255,255,0.25)",
                fontWeight: 700, fontFamily: "var(--font-mono)",
                flexShrink: 0,
              }}>
                {past ? "✓" : i + 1}
              </div>
              <Mono style={{ color: current ? "#C9A44A" : past ? "rgba(62,206,206,0.6)" : "rgba(255,255,255,0.2)", fontSize: 9 }}>
                {s.label}
              </Mono>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 1, background: past ? "rgba(62,206,206,0.25)" : "rgba(255,255,255,0.06)", margin: "0 8px", marginBottom: 24 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Main page ────────────────────────────────────────────────────── */
export default function RoomPage({ params }: { params: Promise<{ roomKey: string }> }) {
  const { roomKey } = use(params);
  const wallet              = useWallet();
  const { publicKey, connected } = wallet;
  const program             = useProgram();
  const erProgram           = useERProgram();

  const [room, setRoom]               = useState<RoomAccount | null>(null);
  const [loading, setLoading]         = useState(true);
  const [errMsg, setErrMsg]           = useState("");
  const [actionMsg, setActionMsg]     = useState("");
  const [actionErr, setActionErr]     = useState("");
  const [actionBusy, setActionBusy]   = useState(false);
  const [sessionReady, setSessionReady]       = useState(false);
  const [sessionMismatch, setSessionMismatch] = useState(false);
  const [sessionBusy, setSessionBusy]         = useState(false);
  const [copied, setCopied]           = useState(false);
  const [proposalAmt, setProposalAmt] = useState("");
  const [sealBusy, setSealBusy]       = useState(false);
  const [sealErr, setSealErr]         = useState("");
  const [sealDone, setSealDone]       = useState(false);

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
    } catch {
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

  /* ── Check if session already exists and keypair matches local storage ── */
  useEffect(() => {
    if (!connected || !publicKey || !room || !program || sessionReady || sessionMismatch) return;
    const isMember = room.members.some(m => m.toBase58() === publicKey.toBase58());
    if (!isMember) return;

    const sessionPdaKey = sessionPda(roomPubkey!, publicKey);
    (program as any).account.roomSession.fetch(sessionPdaKey)
      .then((onChainSession: any) => {
        const localKp = getSessionKey(roomKey);
        if (localKp && onChainSession.sessionKey.toBase58() === localKp.publicKey.toBase58()) {
          setSessionReady(true);
        } else {
          // PDA exists but local keypair is different — different device registered it
          setSessionMismatch(true);
        }
      })
      .catch(() => { /* session PDA not yet created — user clicks to create */ });
  }, [connected, publicKey, room, program, sessionReady, sessionMismatch, roomPubkey, roomKey]);

  /* ── Explicit session creation (user clicks, gets one wallet prompt) ── */
  const handleSetupSession = useCallback(async () => {
    if (!program || !publicKey || !roomPubkey) return;
    setSessionBusy(true);
    setActionErr("");
    try {
      const sessionKp  = getOrCreateSessionKey(roomKey);
      const validUntil = new BN(Math.floor(Date.now() / 1000) + 7 * 24 * 3600);
      await (program as any).methods
        .createSession(sessionKp.publicKey, validUntil)
        .accounts({ member: publicKey, room: roomPubkey })
        .rpc({ commitment: "confirmed", skipPreflight: true });
      setSessionReady(true);
      setSessionMismatch(false);
    } catch (e: any) {
      const msg = String((e as any)?.message ?? e);
      // Anchor throws "already in use" when init account already exists
      if (msg.includes("already in use") || msg.includes("already been processed") || msg.includes("0x0")) {
        setSessionReady(true);
        setSessionMismatch(false);
      } else {
        setActionErr(friendlyError(e));
      }
    } finally {
      setSessionBusy(false);
    }
  }, [program, publicKey, roomPubkey, roomKey]);

  /* ── Direct resolve (localnet only — skips ER delegation) ────────── */
  const handleDirectResolve = useCallback(async () => {
    if (!program || !publicKey || !roomPubkey) return;
    setActionBusy(true); setActionErr("");
    try {
      await (program as any).methods
        .resolveRoom()
        .accounts({ room: roomPubkey })
        .rpc({ commitment: "confirmed", skipPreflight: true });
      setActionMsg("Room resolved on-chain.");
      await fetchRoom();
    } catch (e: any) {
      setActionErr(friendlyError(e));
    } finally {
      setActionBusy(false);
    }
  }, [program, publicKey, roomPubkey, fetchRoom]);

  /* ── Open submission (creator, status === "created") ───────────── */
  const handleOpenSubmission = useCallback(async () => {
    if (!program || !publicKey || !roomPubkey) return;
    setActionBusy(true); setActionErr("");
    try {
      await (program as any).methods
        .openSubmission()
        .accounts({ room: roomPubkey })
        .rpc({ commitment: "confirmed", skipPreflight: true });
      setActionMsg("Sealing window is now open — share the room URL with your group.");
      await fetchRoom();
    } catch (e: any) {
      setActionErr(friendlyError(e));
    } finally {
      setActionBusy(false);
    }
  }, [program, publicKey, roomPubkey, fetchRoom]);

  /* ── Seal proposal ──────────────────────────────────────────────── */
  const handleSeal = useCallback(async () => {
    if (!publicKey || !room || !roomPubkey) return;
    const raw = proposalAmt.trim();
    if (!raw || Number(raw) <= 0) { setSealErr("Enter a value greater than zero."); return; }

    setSealErr("");
    setSealBusy(true);

    try {
      const amount     = BigInt(raw);
      const salt       = randomSalt();
      const commitment = await computeCommitment(amount, salt);

      const sessionKp     = getOrCreateSessionKey(roomKey);
      const sessionPdaKey = sessionPda(roomPubkey, publicKey);
      storeProposal(roomKey, raw, Array.from(salt));

      // Route through MagicBlock ER — session key signs, no wallet popup
      let submitProgram: any = erProgram;
      try {
        const { isDelegated, fqdn } = await getDelegationStatus(roomPubkey);
        if (isDelegated && fqdn) submitProgram = makeERProgramAtFqdn(fqdn, wallet) ?? erProgram;
      } catch { /* fall back to erProgram */ }

      if (!submitProgram) throw new Error("ER connection unavailable.");

      await (submitProgram as any).methods
        .submitBid(Array.from(commitment))
        .accounts({ signer: sessionKp.publicKey, room: roomPubkey, roomSession: sessionPdaKey })
        .signers([sessionKp])
        .rpc({ commitment: "confirmed", skipPreflight: true });

      setSealDone(true);
      await fetchRoom();
    } catch (e: any) {
      setSealErr(friendlyError(e));
    } finally {
      setSealBusy(false);
    }
  }, [publicKey, room, roomPubkey, roomKey, proposalAmt, erProgram, wallet, fetchRoom]);

  /* ── Reveal ─────────────────────────────────────────────────────── */
  const handleReveal = useCallback(async () => {
    if (!program || !publicKey || !roomPubkey) return;
    const stored = getProposal(roomKey);
    if (!stored) { setActionErr("No stored proposal found. Did you seal from this browser?"); return; }

    setActionBusy(true); setActionErr("");
    try {
      await (program as any).methods
        .revealBid(new BN(stored.amount), stored.salt)
        .accounts({ member: publicKey, room: roomPubkey })
        .rpc({ commitment: "confirmed", skipPreflight: true });
      setActionMsg("Proposal revealed successfully.");
      await fetchRoom();
    } catch (e: any) {
      setActionErr(friendlyError(e));
    } finally {
      setActionBusy(false);
    }
  }, [program, publicKey, roomPubkey, roomKey, fetchRoom]);

  /* ── Settle (delegate → ER resolves via magic action) ───────────── */
  const handleSettle = useCallback(async () => {
    if (!program || !publicKey || !room || !roomPubkey) return;
    setActionBusy(true); setActionErr("");
    try {
      await (program as any).methods
        .delegateRoomForSettlement(room.roomId)
        .accounts({ payer: publicKey, pda: roomPubkey })
        .rpc({ commitment: "confirmed", skipPreflight: true });
      setActionMsg("Computing result on ER… click 'Commit to Chain' once done.");
      setTimeout(fetchRoom, 6000);
    } catch (e: any) {
      setActionErr(friendlyError(e));
    } finally {
      setActionBusy(false);
    }
  }, [program, publicKey, room, roomPubkey, fetchRoom]);

  /* ── Commit + undelegate ────────────────────────────────────────── */
  const handleCommit = useCallback(async () => {
    if (!publicKey || !room || !roomPubkey) return;
    setActionBusy(true); setActionErr("");
    try {
      let commitProgram: any = erProgram;
      try {
        const { isDelegated, fqdn } = await getDelegationStatus(roomPubkey);
        if (isDelegated && fqdn) commitProgram = makeERProgramAtFqdn(fqdn, wallet) ?? erProgram;
      } catch { /* fall back */ }

      if (!commitProgram) { setActionErr("ER connection unavailable."); return; }

      await (commitProgram as any).methods
        .undelegateRoom(room.roomId)
        .accounts({ payer: publicKey, room: roomPubkey })
        .rpc({ commitment: "confirmed", skipPreflight: true });

      setActionMsg("Converged result committed to Solana.");
      await fetchRoom();
    } catch (e: any) {
      setActionErr(friendlyError(e));
    } finally {
      setActionBusy(false);
    }
  }, [publicKey, room, roomPubkey, erProgram, wallet, fetchRoom]);

  /* ── Derived state ──────────────────────────────────────────────── */
  const memberKey    = publicKey?.toBase58();
  const isMember     = room && memberKey ? room.members.some(m => m.toBase58() === memberKey) : false;
  const isCreator    = room && memberKey ? room.creator.toBase58() === memberKey : false;
  const hasSealed    = room && memberKey ? room.submissions.some(s => s.member.toBase58() === memberKey) : false;
  const hasRevealed  = room && memberKey ? room.reveals.some(r => r.member.toBase58() === memberKey) : false;
  const status       = room ? getRoomStatus(room) : null;
  const now          = Math.floor(Date.now() / 1000);
  const sealDeadline   = room ? room.submissionDeadline.toNumber() : 0;
  const revealDeadline = room ? room.revealDeadline.toNumber() : 0;
  const sealingOpen    = status === "submissionOpen" && now < sealDeadline;
  const revealOpen     = now > sealDeadline && now < revealDeadline;
  const canSettle      = now > revealDeadline && status !== "resolved";
  const validReveals   = room ? room.reveals.filter(r => r.valid) : [];
  const maxBps  = room ? Math.max(0, ...room.resolvedSplit.map(s => s.shareBps)) : 0;
  const isTie   = status === "resolved" && room!.resolvedSplit.filter(s => s.shareBps === maxBps).length > 1 && maxBps > 0;
  const neverRevealedMembers = room
    ? room.submissions.filter(s => !room.reveals.some(r => r.member.toBase58() === s.member.toBase58()))
    : [];

  const currentPhase: "seal" | "reveal" | "settle" | "done" =
    status === "resolved" ? "done" :
    canSettle ? "settle" :
    revealOpen ? "reveal" : "seal";

  if (!roomPubkey) return <FullError msg="Invalid room address." />;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#000" }}>
      {/* ── Nav ─────────────────────────────────────────────────────── */}
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 24px", borderBottom: "1px solid rgba(255,255,255,0.07)",
        position: "sticky", top: 0, background: "#000", zIndex: 100,
      }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <rect x="1.5" y="6" width="10" height="6.5" rx="1" stroke="#C9A44A" strokeWidth="1.2"/>
            <path d="M3.5 6V4a3 3 0 016 0v2" stroke="#C9A44A" strokeWidth="1.2" strokeLinecap="round"/>
            <circle cx="6.5" cy="9.5" r="1" fill="#C9A44A"/>
          </svg>
          <span className="display" style={{ fontSize: 17, color: "#fff" }}>BidLock</span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => { navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
            style={{ fontSize: 11, color: copied ? "#3ECECE" : "rgba(255,255,255,0.45)", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.06em" }}>
            {copied ? "Copied ✓" : "Copy Room URL"}
          </button>
          <WalletButton />
        </div>
      </nav>

      <main style={{ flex: 1, maxWidth: 700, width: "100%", margin: "0 auto", padding: "40px 24px 80px" }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", paddingTop: 80 }}>
            <div className="spinner" style={{ width: 24, height: 24 }} />
          </div>
        ) : errMsg ? (
          <FullError msg={errMsg} />
        ) : room ? (
          <>
            {/* ── Room header ─────────────────────────────────────── */}
            <div style={{ marginBottom: 28 }}>
              <h1 className="display" style={{ fontSize: "clamp(26px,5vw,42px)", color: "#fff", lineHeight: 1.08, marginBottom: 10 }}>
                {room.poolDescription}
              </h1>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <StatusBadge status={status!} />
                <span className="mono" style={{ fontSize: 10, color: "rgba(255,255,255,0.22)" }}>
                  {shortenAddress(roomKey, 6)}
                </span>
              </div>
            </div>

            {/* ── Phase stepper ───────────────────────────────────── */}
            {<PhaseStepper phase={currentPhase} />}

            {/* ── Timers ──────────────────────────────────────────── */}
            {status !== "resolved" && (
              <div style={{ display: "flex", gap: 32, marginBottom: 28, flexWrap: "wrap" }}>
                <CountdownTimer deadline={sealDeadline}   label="Sealing closes"     onExpire={fetchRoom} />
                <CountdownTimer deadline={revealDeadline} label="Convergence closes" onExpire={fetchRoom} />
              </div>
            )}

            {/* ── Participants ─────────────────────────────────────── */}
            <div style={{ marginBottom: 28, padding: "20px 0", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <Mono style={{ color: "rgba(255,255,255,0.35)" }}>Participants</Mono>
                <Mono style={{ color: "rgba(255,255,255,0.25)", fontSize: 9 }}>
                  {room.submissions.length}/{room.members.length} sealed
                  {room.reveals.length > 0 && ` · ${validReveals.length} revealed`}
                </Mono>
              </div>
              <ParticipantGrid room={room} currentMember={publicKey} />

              {now > sealDeadline && neverRevealedMembers.length > 0 && status !== "resolved" && (
                <p className="mono" style={{ marginTop: 12, fontSize: 10, color: "rgba(255,255,255,0.25)", letterSpacing: "0.06em", lineHeight: 1.7 }}>
                  {neverRevealedMembers.length} member{neverRevealedMembers.length > 1 ? "s" : ""} sealed but haven't revealed — excluded from convergence.
                </p>
              )}
              {isTie && (
                <p className="mono" style={{ marginTop: 12, fontSize: 10, color: "#C9A44A", letterSpacing: "0.06em" }}>
                  Tie — multiple proposals share the same value. Split is equal among them.
                </p>
              )}
            </div>

            {/* ── Convergence result ───────────────────────────────── */}
            {status === "resolved" && (
              <div style={{ marginBottom: 28, padding: "20px 0", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                <ConvergenceReveal room={room} />
              </div>
            )}

            {/* ══════════════════════════════════════════════════════
                ACTION PANEL — this is where users do things
            ══════════════════════════════════════════════════════ */}
            {!connected ? (
              <ActionCard accent="#C9A44A">
                <p style={{ fontSize: 15, color: "#fff", marginBottom: 6, fontWeight: 500 }}>Connect your wallet to participate</p>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 20, lineHeight: 1.6 }}>
                  You need a wallet to seal your proposal, reveal it, and contribute to convergence.
                </p>
                <WalletButton />
              </ActionCard>
            ) : !isMember ? (
              <ActionCard accent="rgba(255,255,255,0.1)">
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>
                  Your wallet is not listed as a member of this room. You can observe but cannot propose.
                </p>
              </ActionCard>
            ) : status === "resolved" ? null :

            /* ── PHASE: NOT YET OPEN (creator must open) ── */
            status === "created" ? (
              isCreator ? (
                <ActionCard accent="#C9A44A">
                  <Mono style={{ color: "#C9A44A", display: "block", marginBottom: 10 }}>Creator action — open sealing</Mono>
                  <p style={{ fontSize: 15, color: "#fff", fontWeight: 500, marginBottom: 8 }}>Room is ready</p>
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.7, marginBottom: 20 }}>
                    Click to open the sealing window. Once open, all members can seal their proposals.
                    Share the room URL with your group after opening.
                  </p>
                  <button
                    onClick={handleOpenSubmission}
                    disabled={actionBusy}
                    style={{
                      padding: "12px 28px", background: "#C9A44A", color: "#000",
                      border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600,
                      cursor: actionBusy ? "not-allowed" : "pointer", fontFamily: "inherit",
                      display: "flex", alignItems: "center", gap: 8,
                    }}>
                    {actionBusy ? <><div className="spinner" style={{ borderTopColor: "#000" }} /> Opening…</> : "Open Sealing Window →"}
                  </button>
                  {actionErr && <ErrMsg msg={actionErr} />}
                </ActionCard>
              ) : (
                <ActionCard accent="rgba(255,255,255,0.06)">
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>
                    The room creator hasn't opened the sealing window yet. Check back soon.
                  </p>
                </ActionCard>
              )
            ) : (

              /* ── PHASE: SEALING ── */
              sealingOpen ? (
                hasSealed ? (
                  <ActionCard accent="rgba(201,164,74,0.15)">
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                        <rect x="3" y="10" width="16" height="11" rx="1.5" stroke="#C9A44A" strokeWidth="1.4"/>
                        <path d="M7 10V7.5a4 4 0 018 0V10" stroke="#C9A44A" strokeWidth="1.4" strokeLinecap="round"/>
                        <circle cx="11" cy="15.5" r="1.5" fill="#C9A44A"/>
                      </svg>
                      <div>
                        <p style={{ fontSize: 14, color: "#fff", fontWeight: 500 }}>Your proposal is sealed</p>
                        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>
                          Hidden until the reveal window opens. Waiting for other members…
                        </p>
                      </div>
                    </div>
                  </ActionCard>
                ) : sessionMismatch ? (
                  <ActionCard accent="rgba(217,80,80,0.3)" borderColor="rgba(217,80,80,0.2)">
                    <Mono style={{ color: "#D95050", display: "block", marginBottom: 10 }}>Session key mismatch</Mono>
                    <p style={{ fontSize: 14, color: "#fff", fontWeight: 500, marginBottom: 8 }}>Different device detected</p>
                    <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.7, marginBottom: 16 }}>
                      A session key for this room was registered from a different browser or device. Open this room on the same browser you used to authorize your session key, or ask the creator to invite a fresh wallet address.
                    </p>
                    <button
                      onClick={handleSetupSession}
                      disabled={sessionBusy}
                      style={{
                        padding: "10px 22px", background: "rgba(217,80,80,0.15)",
                        color: "#D95050", border: "1px solid rgba(217,80,80,0.3)", borderRadius: 8,
                        fontSize: 12, fontWeight: 600, cursor: sessionBusy ? "not-allowed" : "pointer",
                        fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8,
                      }}>
                      {sessionBusy ? <><div className="spinner" style={{ borderTopColor: "#D95050" }} /> Retrying…</> : "Re-register Session Key →"}
                    </button>
                    {actionErr && <ErrMsg msg={actionErr} />}
                  </ActionCard>
                ) : !sessionReady ? (
                  /* Session not set up yet */
                  <ActionCard accent="#C9A44A">
                    <Mono style={{ color: "#C9A44A", display: "block", marginBottom: 10 }}>Step 1 of 3 — Authorize session key</Mono>
                    <p style={{ fontSize: 15, color: "#fff", fontWeight: 500, marginBottom: 8 }}>One wallet confirmation required</p>
                    <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.7, marginBottom: 20 }}>
                      BidLock registers a short-lived session key for this room so your main wallet stays offline while sealing.
                      This is a <strong style={{ color: "rgba(255,255,255,0.8)" }}>one-time setup per room</strong> — it will not repeat.
                    </p>
                    <button
                      onClick={handleSetupSession}
                      disabled={sessionBusy}
                      style={{
                        padding: "12px 28px", background: "#C9A44A", color: "#000",
                        border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600,
                        cursor: sessionBusy ? "not-allowed" : "pointer", fontFamily: "inherit",
                        display: "flex", alignItems: "center", gap: 8, opacity: sessionBusy ? 0.7 : 1,
                      }}>
                      {sessionBusy ? <><div className="spinner" style={{ borderTopColor: "#000" }} /> Authorizing…</> : "Authorize Session Key →"}
                    </button>
                    {actionErr && <ErrMsg msg={actionErr} />}
                  </ActionCard>
                ) : (
                  /* Ready to seal */
                  <ActionCard accent="#C9A44A">
                    <Mono style={{ color: "#C9A44A", display: "block", marginBottom: 10 }}>Step 2 of 3 — Seal your proposal</Mono>
                    <p style={{ fontSize: 15, color: "#fff", fontWeight: 500, marginBottom: 4 }}>Enter your proposal</p>
                    <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 20, lineHeight: 1.6 }}>
                      Your value is hashed in the browser — no one sees it until the reveal window opens.
                      <strong style={{ color: "rgba(255,255,255,0.7)" }}> No wallet confirmation needed</strong> — the session key signs automatically.
                    </p>

                    <div style={{ marginBottom: 12 }}>
                      <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 8, fontFamily: "var(--font-mono)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                        Your proposal value
                      </label>
                      <div style={{ display: "flex", gap: 10 }}>
                        <input
                          type="number"
                          placeholder="e.g. 5000"
                          value={proposalAmt}
                          onChange={e => { setProposalAmt(e.target.value); setSealErr(""); }}
                          onKeyDown={e => e.key === "Enter" && handleSeal()}
                          disabled={sealBusy}
                          style={{
                            flex: 1, padding: "14px 16px", background: "rgba(255,255,255,0.05)",
                            border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8,
                            fontSize: 20, color: "#fff", fontFamily: "var(--font-mono)",
                            outline: "none", fontVariantNumeric: "tabular-nums",
                          }}
                        />
                        <button
                          onClick={handleSeal}
                          disabled={sealBusy || !proposalAmt}
                          style={{
                            padding: "14px 24px", background: sealBusy ? "rgba(201,164,74,0.5)" : "#C9A44A",
                            color: "#000", border: "none", borderRadius: 8, fontSize: 13,
                            fontWeight: 600, cursor: sealBusy || !proposalAmt ? "not-allowed" : "pointer",
                            fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8,
                            whiteSpace: "nowrap",
                          }}>
                          {sealBusy ? <><div className="spinner" style={{ borderTopColor: "#000" }} /> Sealing…</> : "Seal →"}
                        </button>
                      </div>
                    </div>

                    {sealErr && <ErrMsg msg={sealErr} />}
                  </ActionCard>
                )
              ) :

              /* ── PHASE: REVEAL ── */
              revealOpen ? (
                hasRevealed ? (
                  <ActionCard accent="rgba(62,206,206,0.15)">
                    <p style={{ fontSize: 14, color: "#3ECECE", fontWeight: 500, marginBottom: 4 }}>✓ Proposal revealed</p>
                    <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}>
                      Waiting for the group to converge…
                    </p>
                  </ActionCard>
                ) : !hasSealed ? (
                  <ActionCard accent="rgba(255,255,255,0.06)">
                    <p style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>
                      You didn't seal a proposal before the window closed. You cannot participate in this round's convergence.
                    </p>
                  </ActionCard>
                ) : (
                  <ActionCard accent="#3ECECE">
                    <Mono style={{ color: "#3ECECE", display: "block", marginBottom: 10 }}>Step 3 of 3 — Reveal your proposal</Mono>
                    <p style={{ fontSize: 15, color: "#fff", fontWeight: 500, marginBottom: 8 }}>The sealing window has closed</p>
                    <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.7, marginBottom: 20 }}>
                      Click reveal to submit your original proposal. The on-chain program verifies your commitment hash matches —
                      then includes you in convergence.{" "}
                      <strong style={{ color: "rgba(255,255,255,0.7)" }}>One wallet confirmation.</strong>
                    </p>
                    <button
                      onClick={handleReveal}
                      disabled={actionBusy}
                      style={{
                        padding: "12px 28px", background: "#3ECECE", color: "#000",
                        border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600,
                        cursor: actionBusy ? "not-allowed" : "pointer", fontFamily: "inherit",
                        display: "flex", alignItems: "center", gap: 8,
                      }}>
                      {actionBusy ? <><div className="spinner" style={{ borderTopColor: "#000" }} /> Revealing…</> : "Reveal Proposal →"}
                    </button>
                    {actionErr && <ErrMsg msg={actionErr} />}
                  </ActionCard>
                )
              ) :

              /* ── PHASE: SETTLE ── */
              canSettle ? (
                room.submissions.length === 0 ? (
                  <ActionCard accent="rgba(217,80,80,0.15)" borderColor="rgba(217,80,80,0.2)">
                    <p style={{ fontSize: 13, color: "#D95050", marginBottom: 6, fontWeight: 500 }}>Room expired with no proposals</p>
                    <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}>No one sealed a proposal before the window closed. Convergence is not possible.</p>
                  </ActionCard>
                ) : canSettle && validReveals.length === 0 && room.reveals.length > 0 ? (
                  <ActionCard accent="rgba(217,80,80,0.15)" borderColor="rgba(217,80,80,0.2)">
                    <p style={{ fontSize: 13, color: "#D95050", marginBottom: 6, fontWeight: 500 }}>All reveals were invalid</p>
                    <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}>Every commitment hash failed verification. No valid proposals remain — convergence not possible.</p>
                  </ActionCard>
                ) : isCreator ? (
                  IS_LOCALNET ? (
                  <ActionCard accent="#C9A44A">
                    <Mono style={{ color: "#C9A44A", display: "block", marginBottom: 10 }}>Creator action — resolve room</Mono>
                    <p style={{ fontSize: 15, color: "#fff", fontWeight: 500, marginBottom: 8 }}>All windows have closed</p>
                    <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.7, marginBottom: 20 }}>
                      Compute convergence and write the final result on-chain.
                    </p>
                    <button onClick={handleDirectResolve} disabled={actionBusy}
                      style={{
                        padding: "12px 28px", background: "#C9A44A",
                        color: "#000", border: "none", borderRadius: 8,
                        fontSize: 13, fontWeight: 600, cursor: actionBusy ? "not-allowed" : "pointer",
                        fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8,
                      }}>
                      {actionBusy ? <><div className="spinner" style={{ borderTopColor: "#000" }} /> Resolving…</> : "Resolve Room →"}
                    </button>
                    {actionErr && <ErrMsg msg={actionErr} />}
                  </ActionCard>
                  ) : (
                  <ActionCard accent="rgba(255,255,255,0.08)">
                    <Mono style={{ color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 10 }}>Creator actions — settlement</Mono>
                    <p style={{ fontSize: 15, color: "#fff", fontWeight: 500, marginBottom: 8 }}>All windows have closed</p>
                    <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.7, marginBottom: 20 }}>
                      Trigger settlement to compute the group's convergence result on the ER. Then commit it permanently to Solana.
                    </p>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button onClick={handleSettle} disabled={actionBusy}
                        style={{
                          padding: "12px 24px", background: "rgba(255,255,255,0.08)",
                          color: "#fff", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 8,
                          fontSize: 13, fontWeight: 500, cursor: actionBusy ? "not-allowed" : "pointer",
                          fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8,
                        }}>
                        {actionBusy ? <><div className="spinner" /> Computing…</> : "1. Compute Result"}
                      </button>
                      <button onClick={handleCommit} disabled={actionBusy}
                        style={{
                          padding: "12px 24px", background: "#C9A44A",
                          color: "#000", border: "none", borderRadius: 8,
                          fontSize: 13, fontWeight: 600, cursor: actionBusy ? "not-allowed" : "pointer",
                          fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8,
                        }}>
                        {actionBusy ? <><div className="spinner" style={{ borderTopColor: "#000" }} /> Committing…</> : "2. Commit to Chain →"}
                      </button>
                    </div>
                    {actionErr && <ErrMsg msg={actionErr} />}
                  </ActionCard>
                  )
                ) : (
                  <ActionCard accent="rgba(255,255,255,0.06)">
                    <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>
                      All windows have closed. Waiting for the room creator to trigger settlement…
                    </p>
                  </ActionCard>
                )
              ) : null
            )
            }

            {/* ── Feedback ─────────────────────────────────────────── */}
            {actionMsg && (
              <div style={{ marginTop: 16, padding: "12px 16px", background: "rgba(62,206,206,0.06)", borderRadius: 8, border: "1px solid rgba(62,206,206,0.18)" }}>
                <p className="mono" style={{ fontSize: 11, color: "#3ECECE", letterSpacing: "0.06em" }}>◎ {actionMsg}</p>
              </div>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}

/* ── Sub-components ───────────────────────────────────────────────── */

function ActionCard({ children, accent = "#C9A44A", borderColor }: {
  children: React.ReactNode;
  accent?: string;
  borderColor?: string;
}) {
  return (
    <div style={{
      borderTop: "1px solid rgba(255,255,255,0.07)",
      paddingTop: 28, marginBottom: 0,
    }}>
      <Mono style={{ color: "rgba(255,255,255,0.3)", display: "block", marginBottom: 18 }}>Your action</Mono>
      <div style={{
        background: "rgba(255,255,255,0.02)",
        border: `1px solid ${borderColor ?? (accent === "#C9A44A" ? "rgba(201,164,74,0.2)" : accent === "#3ECECE" ? "rgba(62,206,206,0.2)" : "rgba(255,255,255,0.08)")}`,
        borderRadius: 12,
        padding: "24px 22px",
        borderLeft: `3px solid ${accent}`,
      }}>
        {children}
      </div>
    </div>
  );
}

function ErrMsg({ msg }: { msg: string }) {
  return (
    <div style={{ marginTop: 14, padding: "10px 14px", background: "rgba(217,80,80,0.06)", border: "1px solid rgba(217,80,80,0.2)", borderRadius: 8 }}>
      <p className="mono" style={{ fontSize: 11, color: "#D95050", letterSpacing: "0.05em" }}>{msg}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; bg: string; border: string; label: string }> = {
    submissionOpen: { color: "#C9A44A", bg: "rgba(201,164,74,0.08)", border: "rgba(201,164,74,0.25)", label: "● Sealing open" },
    revealOpen:     { color: "#3ECECE", bg: "rgba(62,206,206,0.08)",  border: "rgba(62,206,206,0.25)",  label: "● Reveal open" },
    resolved:       { color: "#3ECECE", bg: "rgba(62,206,206,0.08)",  border: "#3ECECE",               label: "◉ Converged" },
  };
  const s = map[status] ?? { color: "rgba(255,255,255,0.35)", bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.1)", label: "○ Pending" };
  return (
    <span className="mono" style={{
      fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase",
      padding: "4px 10px", borderRadius: 4,
      color: s.color, background: s.bg, border: `1px solid ${s.border}`,
    }}>
      {s.label}
    </span>
  );
}

function FullError({ msg }: { msg: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
      <div style={{ textAlign: "center" }}>
        <Mono style={{ color: "rgba(255,255,255,0.2)", display: "block", marginBottom: 14 }}>Error</Mono>
        <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 15, marginBottom: 24 }}>{msg}</p>
        <Link href="/" style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", borderBottom: "1px solid rgba(255,255,255,0.15)", paddingBottom: 2 }}>← Back home</Link>
      </div>
    </div>
  );
}
