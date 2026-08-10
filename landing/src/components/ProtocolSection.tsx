import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

/* ── Animated SVGs for each phase ────────────────────────────────── */
function LockAnimation() {
  return (
    <motion.svg width="48" height="48" viewBox="0 0 48 48" fill="none"
      xmlns="http://www.w3.org/2000/svg">
      <motion.rect x="8" y="22" width="32" height="22" rx="2"
        stroke="#C9A44A" strokeWidth="1.5"
        initial={{ pathLength: 0, opacity: 0 }}
        whileInView={{ pathLength: 1, opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, delay: 0.2 }}
      />
      <motion.path d="M15 22V15a9 9 0 0118 0v7"
        stroke="#C9A44A" strokeWidth="1.5" strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }}
        whileInView={{ pathLength: 1, opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 0.4 }}
      />
      <motion.circle cx="24" cy="33" r="3"
        fill="#C9A44A"
        initial={{ scale: 0 }}
        whileInView={{ scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.3, delay: 0.9, type: 'spring' }}
      />
    </motion.svg>
  );
}

function RevealAnimation() {
  return (
    <motion.svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <motion.circle cx="24" cy="24" r="14"
        stroke="#3ECECE" strokeWidth="1.5"
        strokeDasharray="4 3"
        animate={{ rotate: 360 }}
        transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
      />
      {[0, 60, 120, 180, 240, 300].map((angle, i) => (
        <motion.line key={i}
          x1="24" y1="24"
          x2={24 + 10 * Math.cos((angle * Math.PI) / 180)}
          y2={24 + 10 * Math.sin((angle * Math.PI) / 180)}
          stroke="#3ECECE" strokeWidth="1.5" strokeLinecap="round"
          initial={{ opacity: 0, pathLength: 0 }}
          whileInView={{ opacity: 1, pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.1 * i + 0.4 }}
        />
      ))}
      <motion.circle cx="24" cy="24" r="3"
        fill="#3ECECE"
        initial={{ scale: 0 }}
        whileInView={{ scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4, delay: 0.2, type: 'spring' }}
      />
    </motion.svg>
  );
}

function ConvergeAnimation() {
  const points = [
    { x: 10, y: 12 }, { x: 38, y: 10 }, { x: 8, y: 36 }, { x: 40, y: 38 },
  ];

  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      {points.map((p, i) => (
        <motion.circle key={i}
          cx={p.x} cy={p.y} r="3"
          fill="white" opacity={0.4}
          initial={{ cx: p.x, cy: p.y }}
          whileInView={{ cx: 24, cy: 24 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: i * 0.1 + 0.3, ease: [0.16, 1, 0.3, 1] }}
        />
      ))}
      <motion.circle cx="24" cy="24" r="5"
        fill="white"
        initial={{ scale: 0, opacity: 0 }}
        whileInView={{ scale: 1, opacity: 1 }}
        viewport={{ once: true }}
        transition={{ delay: 0.9, duration: 0.4, type: 'spring' }}
      />
      <motion.circle cx="24" cy="24" r="10"
        stroke="white" strokeWidth="1"
        opacity={0.15}
        initial={{ scale: 0 }}
        whileInView={{ scale: 1 }}
        viewport={{ once: true }}
        transition={{ delay: 1.1, duration: 0.5 }}
      />
    </svg>
  );
}

/* ── Phase card ───────────────────────────────────────────────────── */
type Phase = {
  num: string;
  label: string;
  title: string;
  body: string;
  detail: string;
  color: string;
  icon: React.ReactNode;
};

function PhaseCard({ phase, index }: { phase: Phase; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <motion.div
      ref={ref}
      className="liquid-glass rounded-3xl p-8 md:p-10 hover-lift group"
      style={{
        background: `rgba(${phase.color === 'gold' ? '201,164,74' : phase.color === 'teal' ? '62,206,206' : '255,255,255'},0.025)`,
      }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
      transition={{ duration: 0.8, delay: index * 0.15, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Number + icon row */}
      <div className="flex items-start justify-between mb-8">
        <span className="font-mono text-white/10 text-6xl font-bold leading-none select-none">
          {phase.num}
        </span>
        <div className="mt-2">{phase.icon}</div>
      </div>

      {/* Label */}
      <div className="mb-3">
        <span className="font-mono text-[10px] tracking-widest uppercase"
          style={{ color: phase.color === 'gold' ? '#C9A44A' : phase.color === 'teal' ? '#3ECECE' : 'rgba(255,255,255,0.5)' }}>
          {phase.label}
        </span>
      </div>

      {/* Title */}
      <h3 className="font-serif text-white text-3xl md:text-4xl leading-tight tracking-tight mb-4">
        {phase.title}
      </h3>

      {/* Body */}
      <p className="font-sans text-white/50 text-sm leading-relaxed mb-6">
        {phase.body}
      </p>

      {/* Detail box */}
      <div className="border-t border-white/5 pt-6">
        <p className="font-mono text-[11px] text-white/25 leading-relaxed">
          {phase.detail}
        </p>
      </div>
    </motion.div>
  );
}

/* ── Section ──────────────────────────────────────────────────────── */
export function ProtocolSection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-100px' });

  const phases: Phase[] = [
    {
      num: '01',
      label: 'Phase one · Seal',
      title: 'Your proposal, locked in cryptographic silence.',
      body: 'Enter your proposal. BidLock computes sha256(amount ‖ random_salt) in your browser and submits the 32-byte commitment to the Ephemeral Rollup via a session key. Your number never touches the base layer.',
      detail: 'sha256(amount_le8 || salt_32) · Commitment: 32 bytes · Session key signs via MagicBlock ER · Confirmed in <400ms',
      color: 'gold',
      icon: <LockAnimation />,
    },
    {
      num: '02',
      label: 'Phase two · Reveal',
      title: 'When the window closes, everyone opens at once.',
      body: 'The sealing window closes. Now the reveal window opens. Every member submits their amount and salt. The on-chain program re-computes the hash and verifies it matches. No take-backs. No adjustments. No anchoring.',
      detail: 'revealBid(amount, salt) · On-chain hash verification · Invalid reveals get valid = false · Excluded from convergence',
      color: 'teal',
      icon: <RevealAnimation />,
    },
    {
      num: '03',
      label: 'Phase three · Converge',
      title: "The group's honest input becomes the group's fair outcome.",
      body: 'Every valid reveal is weighted and normalized into basis-point shares. The program settles inside the Ephemeral Rollup, clears raw amounts for privacy, then commits the convergence result back to Solana base layer — permanently.',
      detail: 'resolveRoom() on ER · resolvedSplit[]: MemberSplit { shareBps } · Amounts cleared via ClearText magic actions · undelegateRoom commits to base layer',
      color: 'white',
      icon: <ConvergeAnimation />,
    },
  ];

  return (
    <section id="how-it-works" className="bg-black py-28 md:py-40 px-6 overflow-hidden">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-16 md:mb-20">
          <motion.span
            className="font-mono text-white/30 text-xs tracking-widest uppercase block mb-6"
            animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
            transition={{ duration: 0.6 }}
            ref={ref}
          >
            The protocol
          </motion.span>

          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <motion.h2
              className="font-serif text-white"
              style={{ fontSize: 'clamp(36px, 6vw, 88px)', lineHeight: 1.0, letterSpacing: '-0.02em' }}
              animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
              transition={{ duration: 0.8, delay: 0.1 }}
            >
              Three steps.{' '}
              <em className="italic text-white/30">One honest</em>
              <br />
              convergence.
            </motion.h2>

            <motion.p
              className="font-sans text-white/40 text-sm leading-relaxed max-w-xs md:text-right"
              animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              transition={{ duration: 0.7, delay: 0.2 }}
            >
              The protocol is sequential and enforced on-chain.
              No step can be skipped or reordered.
            </motion.p>
          </div>
        </div>

        {/* Phase cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6">
          {phases.map((phase, i) => (
            <PhaseCard key={phase.num} phase={phase} index={i} />
          ))}
        </div>

        {/* Connecting line hint */}
        <div className="hidden md:flex items-center justify-center gap-4 mt-10 opacity-20">
          <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, transparent, rgba(201,164,74,0.6), rgba(62,206,206,0.6), transparent)' }} />
        </div>
      </div>
    </section>
  );
}
