/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { useProgram, useERProgram, getDelegationStatus, makeERProgramAtFqdn } from "@/lib/program";
import { sessionPda, shortenAddress, PROGRAM_ID } from "@/lib/pda";
import { getOrCreateSessionKey, storeProposal, getProposal } from "@/lib/session";
import { computeCommitment, randomSalt } from "@/lib/commitment";
import { getRoomStatus, type RoomAccount } from "@/lib/bidlock_types";
import { friendlyError } from "@/lib/errors";
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
      fontSize: 9, letterSpacing: "0.2em", color: "rgba(255,255,255,0.3)",
      textTransform: "uppercase",
    }}>{text}</span>
  );
}

function Section({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ padding: "24px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", ...style }}>
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
  const wallet    = useWallet();
  const { publicKey, connected } = wallet;
  const program   = useProgram();
  const erProgram = useERProgram();

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

  /* ── Seal proposal — routed through MagicBlock ER ──────────────────── */
  const handleSeal = useCallback(async (amountStr: string) => {
    if (!publicKey || !room || !roomPubkey) throw new Error("Wallet not connected.");

    const amount = BigInt(amountStr);
    const salt   = randomSalt();
    const commitment = await computeCommitment(amount, salt);

    const sessionKp     = getOrCreateSessionKey(roomKey);
    const sessionPdaKey = sessionPda(roomPubkey, publicKey);

    storeProposal(roomKey, amountStr, Array.from(salt));

    // Resolve live ER fqdn via MagicBlock router; fall back to default ER endpoint.
    let submitProgram: any;
    try {
      const { isDelegated, fqdn } = await getDelegationStatus(roomPubkey);
      if (isDelegated && fqdn) {
        submitProgram = makeERProgramAtFqdn(fqdn, wallet) ?? erProgram;
      } else {
        submitProgram = erProgram;
      }
    } catch {
      submitProgram = erProgram;
    }

    if (!submitProgram) throw new Error("ER connection unavailable.");

    try {
      await (submitProgram as any).methods
        .submitBid(Array.from(commitment))
        .accounts({
          signer: sessionKp.publicKey,
          room: roomPubkey,
          roomSession: sessionPdaKey,
        })
        .signers([sessionKp])
        // skipPreflight is required for all ER transactions
        .rpc({ commitment: "confirmed", skipPreflight: true });
    } catch (e) {
      throw new Error(friendlyError(e));
    }

    await fetchRoom();
  }, [publicKey, room, roomPubkey, roomKey, fetchRoom, erProgram, wallet]);

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
      setActionErr(friendlyError(e));
    } finally {
      setActionBusy(false);
    }
  }, [program, publicKey, roomPubkey, roomKey, fetchRoom]);

  /* ── Delegate for settlement — base layer tx ────────────────────── */
  const handleSettle = useCallback(async () => {
    if (!program || !publicKey || !room || !roomPubkey) return;

    setActionBusy(true);
    setActionErr("");
    try {
      const roomId = room.roomId;
      // pda = the room PDA; delegation_program & friends are resolved by Anchor
      await (program as any).methods
        .delegateRoomForSettlement(roomId)
        .accounts({ payer: publicKey, pda: roomPubkey })
        .rpc({ commitment: "confirmed" });
      setActionMsg("Delegated to ER — resolve_room magic action will fire automatically. Click 'Commit to Chain' when ready.");
      setTimeout(fetchRoom, 6000);
    } catch (e: any) {
      setActionErr(friendlyError(e));
    } finally {
      setActionBusy(false);
    }
  }, [program, publicKey, room, roomPubkey, fetchRoom]);

  /* ── Commit + undelegate — ER tx ────────────────────────────────── */
  const handleUndelegate = useCallback(async () => {
    if (!publicKey || !room || !roomPubkey) return;

    setActionBusy(true);
    setActionErr("");
    try {
      const roomId = room.roomId;

      // Resolve live ER fqdn via router for the delegated room account
      let undelegateProgram: any;
      try {
        const { isDelegated, fqdn } = await getDelegationStatus(roomPubkey);
        if (isDelegated && fqdn) {
          undelegateProgram = makeERProgramAtFqdn(fqdn, wallet) ?? erProgram;
        } else {
          undelegateProgram = erProgram;
        }
      } catch {
        undelegateProgram = erProgram;
      }

      if (!undelegateProgram) { setActionErr("ER connection unavailable."); return; }

      await (undelegateProgram as any).methods
        .undelegateRoom(roomId)
        .accounts({ payer: publicKey, room: roomPubkey })
        // skipPreflight required for all ER commit/undelegate transactions
        .rpc({ commitment: "confirmed", skipPreflight: true });

      setActionMsg("Room converged on base layer.");
      await fetchRoom();
    } catch (e: any) {
      setActionErr(friendlyError(e));
    } finally {
      setActionBusy(false);
    }
  }, [publicKey, room, roomPubkey, fetchRoom, erProgram, wallet]);

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

  // Edge case derivations
  const sealingClosed        = now > sealDeadline;
  const noBidsSealed         = sealingClosed && room !== null && room.submissions.length === 0;
  const validReveals         = room ? room.reveals.filter((r) => r.valid) : [];
  const allRevealsInvalid    = canSettle && validReveals.length === 0 && (room?.reveals.length ?? 0) > 0;
  const neverRevealedMembers = room
    ? room.submissions.filter(
        (s) => !room.reveals.some((r) => r.member.toBase58() === s.member.toBase58())
      )
    : [];
  // Detect tie: multiple members share the highest BPS in resolved_split
  const maxBps = room ? Math.max(0, ...room.resolvedSplit.map((s) => s.shareBps)) : 0;
  const topCount = room ? room.resolvedSplit.filter((s) => s.shareBps === maxBps).length : 0;
  const isTie = status === "resolved" && topCount > 1 && maxBps > 0;

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
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#000" }}>
      {/* Nav */}
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)", position: "sticky",
        top: 0, background: "#000", zIndex: 20,
      }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1.5" y="6" width="10" height="6.5" rx="1" stroke="#C9A44A" strokeWidth="1.2"/><path d="M3.5 6V4a3 3 0 016 0v2" stroke="#C9A44A" strokeWidth="1.2" strokeLinecap="round"/><circle cx="6.5" cy="9.5" r="1" fill="#C9A44A"/></svg>
          <span className="display" style={{ fontSize: 17, color: "#fff" }}>BidLock</span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={copyUrl} className="liquid-glass" style={{
            borderRadius: 999, padding: "7px 16px", fontSize: 10, color: copied ? "#3ECECE" : "rgba(255,255,255,0.6)",
            background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit",
            letterSpacing: "0.08em",
          }}>
            {copied ? "Copied ✓" : "Copy Room URL"}
          </button>
          <WalletButton />
        </div>
      </nav>

      <main style={{ flex: 1, maxWidth: 680, width: "100%", margin: "0 auto", padding: "0 24px 60px" }}>
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
                <h1 className="display animate-fade-up" style={{ fontSize: "clamp(28px, 5vw, 44px)", lineHeight: 1.05, color: "#fff" }}>
                  {room.poolDescription}
                </h1>
                <StatusBadge status={status!} />
              </div>

              <div className="mono animate-fade-up stagger-1" style={{
                fontSize: 11, color: "rgba(255,255,255,0.25)", letterSpacing: "0.08em",
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
                <span className="mono" style={{ fontSize: 10, color: "rgba(255,255,255,0.28)" }}>
                  {room.submissions.length}/{room.members.length} sealed
                  {room.reveals.length > 0 && ` · ${validReveals.length} revealed`}
                </span>
              </div>
              <ParticipantGrid room={room} currentMember={publicKey} />

              {/* Never-revealed members callout (after sealing window closes) */}
              {sealingClosed && neverRevealedMembers.length > 0 && status !== "resolved" && (
                <div className="mono animate-fade-in" style={{
                  marginTop: 14, fontSize: 11, color: "var(--text-3)",
                  padding: "10px 14px", border: "1px solid var(--border)",
                  letterSpacing: "0.06em", lineHeight: 1.7,
                }}>
                  {neverRevealedMembers.length === 1
                    ? "1 member sealed but has not yet revealed."
                    : `${neverRevealedMembers.length} members sealed but have not yet revealed.`}{" "}
                  Their proposals will be excluded from convergence.
                </div>
              )}

              {/* Tie-break note */}
              {isTie && (
                <div className="mono animate-fade-in" style={{
                  marginTop: 14, fontSize: 11, color: "var(--gold)",
                  padding: "10px 14px", border: "1px solid rgba(201,164,74,0.25)",
                  letterSpacing: "0.06em",
                }}>
                  Tie detected — multiple proposals converged on the same value. Split is equal among tied members.
                </div>
              )}
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
                  <div className="animate-fade-up" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <p style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", lineHeight: 1.7 }}>
                      The sealing window has closed. Reveal your proposal to contribute to convergence.
                    </p>
                    <button onClick={handleReveal} disabled={actionBusy}
                      style={{ padding: "12px 24px", background: "rgba(62,206,206,0.1)", color: "#3ECECE", border: "1px solid rgba(62,206,206,0.3)", borderRadius: 10, fontSize: 13, cursor: actionBusy ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8, opacity: actionBusy ? 0.6 : 1 }}>
                      {actionBusy ? <><div className="spinner" /> Revealing…</> : "Reveal Proposal →"}
                    </button>
                  </div>
                )}

                {revealOpen && hasRevealed && (
                  <p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", lineHeight: 1.7 }}>
                    Your proposal is revealed. Waiting for the group to converge…
                  </p>
                )}

                {/* Zero bidders — sealing closed with no submissions */}
                {noBidsSealed && (
                  <DeadRoomMessage reason="No proposals were sealed before the sealing window closed. The room cannot converge." />
                )}

                {/* All reveals invalid — cannot settle */}
                {allRevealsInvalid && isCreator && (
                  <DeadRoomMessage reason="Every sealed proposal was revealed with a mismatched commitment. No valid proposals remain — convergence is not possible." />
                )}

                {canSettle && isCreator && !noBidsSealed && !allRevealsInvalid && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <p style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", lineHeight: 1.7 }}>
                      All windows have closed. Trigger settlement to compute the group answer.
                    </p>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button onClick={handleSettle} disabled={actionBusy}
                        style={{ padding: "11px 22px", background: "rgba(62,206,206,0.1)", color: "#3ECECE", border: "1px solid rgba(62,206,206,0.3)", borderRadius: 10, fontSize: 13, cursor: actionBusy ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8 }}>
                        {actionBusy ? <><div className="spinner" /> Working…</> : "Trigger Settlement"}
                      </button>
                      <button onClick={handleUndelegate} disabled={actionBusy}
                        style={{ padding: "11px 22px", background: "transparent", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, fontSize: 13, cursor: actionBusy ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
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
                <p className="mono" style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", letterSpacing: "0.06em" }}>
                  You are not listed as a member of this room. You can observe but not propose.
                </p>
              </Section>
            )}

            {/* Connect prompt */}
            {!connected && (
              <Section style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "flex-start" }}>
                <p style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>Connect your wallet to participate.</p>
                <WalletButton />
              </Section>
            )}

            {/* Feedback messages */}
            {(actionMsg || actionErr) && (
              <div className="animate-fade-in" style={{ marginTop: 16 }}>
                {actionMsg && (
                  <p className="mono" style={{ fontSize: 11, color: "#3ECECE", letterSpacing: "0.06em" }}>◎ {actionMsg}</p>
                )}
                {actionErr && (
                  <p className="mono" style={{ fontSize: 11, color: "#D95050", letterSpacing: "0.06em", padding: "10px 14px", background: "rgba(217,80,80,0.06)", border: "1px solid rgba(217,80,80,0.18)", marginTop: 8, borderRadius: 8 }}>
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
  const styles: Record<string, React.CSSProperties> = {
    submissionOpen: { color: "#C9A44A", background: "rgba(201,164,74,0.08)", border: "1px solid rgba(201,164,74,0.25)" },
    revealOpen:     { color: "#3ECECE", background: "rgba(62,206,206,0.08)",  border: "1px solid rgba(62,206,206,0.25)" },
    resolved:       { color: "#3ECECE", background: "rgba(62,206,206,0.08)",  border: "1px solid #3ECECE" },
    default:        { color: "rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" },
  };
  const labels: Record<string, string> = { submissionOpen: "● Sealing", revealOpen: "● Revealing", resolved: "◉ Converged" };
  const s = styles[status] ?? styles.default;
  return (
    <span className="mono" style={{ ...s, fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", padding: "4px 10px", borderRadius: 4 }}>
      {labels[status] ?? "○ Pending"}
    </span>
  );
}

function SealedWaitingMessage() {
  return (
    <div className="liquid-glass animate-fade-in" style={{ borderRadius: 12, padding: "18px 20px", background: "rgba(201,164,74,0.04)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
          <rect x="3" y="9" width="14" height="10" rx="1" stroke="#C9A44A" strokeWidth="1.3" />
          <path d="M6.5 9V6.5a3.5 3.5 0 017 0V9" stroke="#C9A44A" strokeWidth="1.3" strokeLinecap="round" />
          <rect x="8.5" y="12" width="3" height="3" rx="1.5" fill="#C9A44A" />
        </svg>
        <div>
          <div className="mono" style={{ fontSize: 10, color: "#C9A44A", letterSpacing: "0.14em", textTransform: "uppercase" }}>
            Proposal sealed
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
            Waiting for others to seal, then the reveal window opens.
          </div>
        </div>
      </div>
    </div>
  );
}

function DeadRoomMessage({ reason }: { reason: string }) {
  return (
    <div className="liquid-glass animate-fade-in" style={{ borderRadius: 12, padding: "18px 20px", background: "rgba(217,80,80,0.04)", border: "1px solid rgba(217,80,80,0.18)" }}>
      <div className="mono" style={{ fontSize: 9, letterSpacing: "0.16em", color: "#D95050", textTransform: "uppercase", marginBottom: 8 }}>
        Convergence impossible
      </div>
      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.7 }}>{reason}</p>
    </div>
  );
}

function ErrorScreen({ msg }: { msg: string }) {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 60 }}>
      <div style={{ textAlign: "center" }}>
        <div className="mono" style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 14 }}>Error</div>
        <p style={{ color: "rgba(255,255,255,0.55)", marginBottom: 24, fontSize: 15 }}>{msg}</p>
        <Link href="/" style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", borderBottom: "1px solid rgba(255,255,255,0.15)", paddingBottom: 2 }}>← Back home</Link>
      </div>
    </div>
  );
}
