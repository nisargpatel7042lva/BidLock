import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

/* ── Anchoring visualizer ─────────────────────────────────────────── */
function AnchoringViz() {
  const members = [
    { label: 'Member A', speaks: true, honest: 60, anchored: 60, delay: 0 },
    { label: 'Member B', speaks: false, honest: 85, anchored: 68, delay: 0.15 },
    { label: 'Member C', speaks: false, honest: 45, anchored: 55, delay: 0.3 },
    { label: 'Member D', speaks: false, honest: 90, anchored: 70, delay: 0.45 },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 mb-6">
        <span className="font-mono text-[10px] tracking-widest text-white/30 uppercase">Without BidLock</span>
        <div className="flex-1 h-px bg-white/5" />
      </div>
      {members.map((m, i) => (
        <div key={i} className="flex items-center gap-4">
          <span className="font-mono text-[10px] text-white/30 w-20 shrink-0">{m.label}</span>
          <div className="relative flex-1 h-7 rounded-sm overflow-hidden bg-white/3">
            {/* Honest value (what they actually think) */}
            <motion.div
              className="absolute left-0 top-0 h-full rounded-sm"
              style={{ background: 'rgba(62,206,206,0.15)' }}
              initial={{ width: 0 }}
              whileInView={{ width: `${m.honest}%` }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: m.delay + 0.6, ease: [0.16, 1, 0.3, 1] }}
            />
            {/* Anchored value (what they say after anchoring) */}
            <motion.div
              className="absolute left-0 top-0 h-full rounded-sm"
              style={{
                background: m.speaks
                  ? 'rgba(201,164,74,0.55)'
                  : 'rgba(201,164,74,0.25)',
                borderRight: '1px solid rgba(201,164,74,0.6)',
              }}
              initial={{ width: 0 }}
              whileInView={{ width: `${m.anchored}%` }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: m.delay + 0.2, ease: [0.16, 1, 0.3, 1] }}
            />
            {m.speaks && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                <span className="font-mono text-[9px] text-gold/70 uppercase tracking-wider">speaks first</span>
              </div>
            )}
          </div>
          <span className="font-mono text-[10px] text-white/20 w-8 text-right">{m.anchored}</span>
        </div>
      ))}

      <div className="flex items-center gap-4 pt-1">
        <div className="w-20" />
        <div className="flex items-center gap-4 text-[9px] font-mono text-white/30">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-1.5 rounded-sm bg-teal/40 inline-block" /> Honest value
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-1.5 rounded-sm bg-gold/40 inline-block" /> Stated (anchored)
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── BidLock result ───────────────────────────────────────────────── */
function BidLockResult() {
  const members = [
    { label: 'Member A', honest: 60, delay: 0 },
    { label: 'Member B', honest: 85, delay: 0.1 },
    { label: 'Member C', honest: 45, delay: 0.2 },
    { label: 'Member D', honest: 90, delay: 0.3 },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 mb-6">
        <span className="font-mono text-[10px] tracking-widest text-teal/60 uppercase">With BidLock</span>
        <div className="flex-1 h-px bg-teal/10" />
      </div>
      {members.map((m, i) => (
        <div key={i} className="flex items-center gap-4">
          <span className="font-mono text-[10px] text-white/30 w-20 shrink-0">{m.label}</span>
          <div className="relative flex-1 h-7 rounded-sm overflow-hidden bg-white/3">
            <motion.div
              className="absolute left-0 top-0 h-full rounded-sm"
              style={{ background: 'rgba(62,206,206,0.35)', borderRight: '1px solid rgba(62,206,206,0.5)' }}
              initial={{ width: 0 }}
              whileInView={{ width: `${m.honest}%` }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: m.delay + 0.2, ease: [0.16, 1, 0.3, 1] }}
            />
            <motion.div
              className="absolute right-2 top-1/2 -translate-y-1/2"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: m.delay + 0.8 }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1.5 5.5l2.5 2.5 4.5-5" stroke="#3ECECE" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </motion.div>
          </div>
          <span className="font-mono text-[10px] text-teal/50 w-8 text-right">{m.honest}</span>
        </div>
      ))}
      <div className="flex items-center gap-4 pt-1">
        <div className="w-20" />
        <span className="text-[9px] font-mono text-teal/40">Every proposal = the honest value. No anchoring possible.</span>
      </div>
    </div>
  );
}

/* ── Section ──────────────────────────────────────────────────────── */
export function ProblemSection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section ref={ref} id="protocol" className="bg-black py-32 md:py-44 px-6 overflow-hidden">
      <div className="max-w-6xl mx-auto">
        {/* Label */}
        <motion.span
          className="font-mono text-white/30 text-xs tracking-widest uppercase block mb-8"
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
          transition={{ duration: 0.6 }}
        >
          The problem
        </motion.span>

        {/* Heading */}
        <div className="mb-20">
          <motion.h2
            className="font-serif text-white"
            style={{ fontSize: 'clamp(40px, 7vw, 100px)', lineHeight: 1.0, letterSpacing: '-0.02em' }}
            animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
            transition={{ duration: 0.8, delay: 0.1 }}
          >
            The first voice
          </motion.h2>
          <motion.h2
            className="font-serif"
            style={{ fontSize: 'clamp(40px, 7vw, 100px)', lineHeight: 1.0, letterSpacing: '-0.02em' }}
            animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
            transition={{ duration: 0.8, delay: 0.18 }}
          >
            <em className="italic text-white/25">corrupts</em>
            <span className="text-white"> the vote.</span>
          </motion.h2>
        </div>

        {/* Two column */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24">
          {/* Left — explanation */}
          <motion.div
            animate={inView ? { opacity: 1, x: 0 } : { opacity: 0, x: -30 }}
            transition={{ duration: 0.8, delay: 0.3 }}
          >
            <p className="font-sans text-white/60 text-base md:text-lg leading-relaxed mb-8">
              In any group decision, whoever speaks first sets an anchor. Everyone else
              adjusts toward that number — not toward their honest belief.
            </p>
            <p className="font-sans text-white/40 text-sm md:text-base leading-relaxed mb-8">
              This isn't a human failing — it's cognitive physics. Anchoring bias is
              systematic, measurable, and nearly impossible to resist consciously.
            </p>
            <p className="font-sans text-white/40 text-sm md:text-base leading-relaxed mb-10">
              The result: your group's decision isn't the best answer — it's the most
              influential one. The loudest voice wins, not the most accurate one.
            </p>

            <div className="liquid-glass rounded-2xl p-6">
              <p className="font-mono text-xs tracking-wider text-white/30 uppercase mb-3">BidLock's fix</p>
              <p className="font-sans text-white/70 text-sm leading-relaxed">
                Seal every proposal before any reveal. The commit window closes.
                Then every member reveals simultaneously — when it's too late
                to adjust. The group converges on honest input, not the anchor.
              </p>
            </div>
          </motion.div>

          {/* Right — visualization */}
          <motion.div
            className="space-y-10"
            animate={inView ? { opacity: 1, x: 0 } : { opacity: 0, x: 30 }}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            <AnchoringViz />
            <BidLockResult />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
