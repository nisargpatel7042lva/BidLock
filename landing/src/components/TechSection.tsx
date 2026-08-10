import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

/* ── Architecture diagram ────────────────────────────────────────── */
function ArchDiagram() {
  return (
    <div className="relative w-full py-10">
      {/* Base layer */}
      <motion.div
        className="liquid-glass rounded-2xl p-5 mb-4"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, delay: 0.3 }}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="font-mono text-[10px] tracking-widest text-white/40 uppercase">Solana Base Layer · devnet</span>
          <span className="font-mono text-[9px] text-white/20">~400ms confirmation</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Room PDA', sub: 'commitments + result', color: 'rgba(255,255,255,0.08)' },
            { label: 'RoomSession PDA', sub: 'session key + expiry', color: 'rgba(255,255,255,0.08)' },
            { label: 'Reveals', sub: 'after reveal window', color: 'rgba(255,255,255,0.08)' },
          ].map(item => (
            <div key={item.label} className="rounded-lg p-3" style={{ background: item.color }}>
              <div className="font-mono text-[10px] text-white/60 mb-1">{item.label}</div>
              <div className="font-mono text-[9px] text-white/25">{item.sub}</div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Arrows */}
      <div className="flex justify-center items-center gap-16 mb-4">
        <motion.div
          className="flex flex-col items-center gap-1"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.6 }}
        >
          <svg width="24" height="32" viewBox="0 0 24 32" fill="none">
            <path d="M12 0v28M5 21l7 8 7-8" stroke="rgba(201,164,74,0.5)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="font-mono text-[8px] text-gold/40 uppercase tracking-wider">delegate</span>
        </motion.div>
        <motion.div
          className="flex flex-col items-center gap-1"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.7 }}
        >
          <svg width="24" height="32" viewBox="0 0 24 32" fill="none">
            <path d="M12 32V4M5 11l7-8 7 8" stroke="rgba(62,206,206,0.5)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="font-mono text-[8px] text-teal/40 uppercase tracking-wider">undelegate</span>
        </motion.div>
      </div>

      {/* ER layer */}
      <motion.div
        className="liquid-glass rounded-2xl p-5"
        style={{ background: 'rgba(62,206,206,0.03)' }}
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, delay: 0.5 }}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="font-mono text-[10px] tracking-widest text-teal/50 uppercase">MagicBlock Ephemeral Rollup · devnet.magicblock.app</span>
          <span className="font-mono text-[9px] text-teal/30">&lt;400ms</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Room (copy)', sub: 'during delegation', color: 'rgba(62,206,206,0.06)' },
            { label: 'submit_bid', sub: 'session key signs', color: 'rgba(62,206,206,0.06)' },
            { label: 'resolve_room', sub: 'ClearText actions', color: 'rgba(62,206,206,0.06)' },
          ].map(item => (
            <div key={item.label} className="rounded-lg p-3" style={{ background: item.color }}>
              <div className="font-mono text-[10px] text-teal/60 mb-1">{item.label}</div>
              <div className="font-mono text-[9px] text-white/20">{item.sub}</div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

/* ── Feature chips ────────────────────────────────────────────────── */
type Feat = { label: string; detail: string; color: string };

function FeatureChip({ feat, index }: { feat: Feat; index: number }) {
  return (
    <motion.div
      className="liquid-glass rounded-2xl p-5 hover-lift"
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, delay: index * 0.1, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="font-mono text-xs mb-2" style={{ color: feat.color }}>{feat.label}</div>
      <p className="font-sans text-white/40 text-xs leading-relaxed">{feat.detail}</p>
    </motion.div>
  );
}

/* ── Section ──────────────────────────────────────────────────────── */
export function TechSection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-100px' });

  const features: Feat[] = [
    {
      label: 'Session Keys',
      detail: 'Per-room ephemeral keypairs registered on-chain. Main wallet stays offline during ER submission. Scope-enforced by PDA seeds — a session for room A cannot sign for room B.',
      color: '#C9A44A',
    },
    {
      label: 'SHA-256 Commitment',
      detail: 'sha256(amount_le8 || salt_32) computed in-browser via SubtleCrypto. Verified on-chain by the Rust sha2 crate. Salt stored in localStorage — known only to the committer.',
      color: '#3ECECE',
    },
    {
      label: 'Ephemeral Rollups',
      detail: 'Commitments land in the MagicBlock ER in <400ms. The room is delegated for settlement, resolveRoom runs on-chain, and undelegateRoom commits the result back to Solana.',
      color: 'rgba(255,255,255,0.5)',
    },
    {
      label: 'ClearText Actions',
      detail: 'Post-delegation magic actions zero out raw bid amounts before undelegation. The base layer sees only the convergence result — never the individual proposals.',
      color: '#C9A44A',
    },
    {
      label: 'Private ER (PER)',
      detail: 'The access-control feature enables private BidStore ephemeral accounts. Private proposals exist only inside the ER and are never written to base layer even transiently.',
      color: '#3ECECE',
    },
    {
      label: '21 Rust Tests',
      detail: 'LiteSVM 0.10.0 unit tests cover create_room (3), submit_bid (7), reveal_bid (6), resolve_room (5). Every error code path is tested. All 21 pass.',
      color: 'rgba(255,255,255,0.5)',
    },
  ];

  return (
    <section id="about" className="bg-black py-28 md:py-40 px-6 overflow-hidden">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-16 md:mb-20" ref={ref}>
          <motion.span
            className="font-mono text-white/30 text-xs tracking-widest uppercase block mb-6"
            animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
            transition={{ duration: 0.6 }}
          >
            Architecture
          </motion.span>

          <motion.h2
            className="font-serif text-white mb-6"
            style={{ fontSize: 'clamp(36px, 6vw, 88px)', lineHeight: 1.0, letterSpacing: '-0.02em' }}
            animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
            transition={{ duration: 0.8, delay: 0.1 }}
          >
            Built on{' '}
            <em className="italic text-white/30">cryptographic</em>
            <br />
            truth.
          </motion.h2>

          <motion.p
            className="font-sans text-white/40 text-base leading-relaxed max-w-xl"
            animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.7, delay: 0.2 }}
          >
            Anchored to Solana's base layer for permanence. Accelerated by MagicBlock
            Ephemeral Rollups for speed. Every commitment, session, and reveal is
            verifiable on-chain. No trust assumptions. No oracles. No admin keys.
          </motion.p>
        </div>

        {/* Two-column: arch diagram + features */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 mb-16">
          {/* Left: diagram */}
          <motion.div
            animate={inView ? { opacity: 1, x: 0 } : { opacity: 0, x: -30 }}
            transition={{ duration: 0.8, delay: 0.3 }}
          >
            <p className="font-mono text-[10px] tracking-widest text-white/25 uppercase mb-4">
              Two-layer architecture
            </p>
            <ArchDiagram />
          </motion.div>

          {/* Right: text explanation */}
          <motion.div
            className="flex flex-col justify-center"
            animate={inView ? { opacity: 1, x: 0 } : { opacity: 0, x: 30 }}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            <div className="space-y-6">
              {[
                {
                  step: '①',
                  text: 'create_room and create_session execute on the Solana base layer. The room account and session token are permanent, tamper-evident records.',
                },
                {
                  step: '②',
                  text: 'submit_bid routes to the MagicBlock ER via the session key. The commitment is recorded in <400ms without touching base layer fees.',
                },
                {
                  step: '③',
                  text: 'reveal_bid goes back to base layer — the verify step needs to read the commitment stored there after undelegation. Cryptographic proof is permanent.',
                },
                {
                  step: '④',
                  text: 'resolveRoom runs inside the ER. ClearText magic actions erase raw amounts. undelegateRoom writes only the convergence result to base layer forever.',
                },
              ].map((item, i) => (
                <div key={i} className="flex gap-4">
                  <span className="font-mono text-white/15 text-sm shrink-0 mt-0.5">{item.step}</span>
                  <p className="font-sans text-white/50 text-sm leading-relaxed">{item.text}</p>
                </div>
              ))}
            </div>

            {/* Program ID */}
            <div className="mt-8 liquid-glass rounded-xl p-4">
              <p className="font-mono text-[9px] text-white/25 uppercase tracking-widest mb-2">Program ID · devnet</p>
              <p className="font-mono text-[11px] text-white/50 break-all">
                23zkP27qb2eNg1nxKovh3zTLiLKXccKoRHRH6wukMYEs
              </p>
            </div>
          </motion.div>
        </div>

        {/* Feature grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((feat, i) => (
            <FeatureChip key={feat.label} feat={feat} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
