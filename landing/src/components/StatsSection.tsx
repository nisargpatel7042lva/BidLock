import { useRef, useEffect, useState } from 'react';
import { motion, useInView } from 'framer-motion';

function CountUp({ to, suffix = '', duration = 1600 }: { to: number; suffix?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [val, setVal] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(eased * to));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [inView, to, duration]);

  return <span ref={ref}>{val}{suffix}</span>;
}

type Stat = { value: number; suffix: string; label: string; sub: string; color: string };

export function StatsSection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  const stats: Stat[] = [
    { value: 21,   suffix: '',   label: 'Rust unit tests', sub: 'All passing. LiteSVM 0.10.0.', color: '#C9A44A' },
    { value: 400,  suffix: 'ms', label: 'ER confirmation', sub: 'MagicBlock devnet commitment time.', color: '#3ECECE' },
    { value: 32,   suffix: 'B',  label: 'Commitment size', sub: 'SHA-256 digest. 32 bytes on-chain.', color: 'rgba(255,255,255,0.7)' },
    { value: 10,   suffix: '',   label: 'Max members', sub: 'Per room. Configurable via MAX_MEMBERS.', color: '#C9A44A' },
    { value: 100,  suffix: '%',  label: 'On-chain verifiable', sub: 'Every commitment is tamper-evident.', color: '#3ECECE' },
    { value: 0,    suffix: '',   label: 'Admin keys', sub: 'No upgrade authority. No oracles. No trust.', color: 'rgba(255,255,255,0.7)' },
  ];

  return (
    <section className="bg-black py-20 md:py-28 px-6 overflow-hidden">
      <div className="max-w-6xl mx-auto" ref={ref}>
        {/* Label */}
        <motion.div
          className="flex items-center gap-4 mb-12"
          animate={inView ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.6 }}
        >
          <span className="font-mono text-white/20 text-xs tracking-widest uppercase">By the numbers</span>
          <div className="flex-1 h-px bg-white/5" />
        </motion.div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-px bg-white/5 rounded-2xl overflow-hidden">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              className="bg-black p-8 md:p-10"
              animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              transition={{ duration: 0.6, delay: i * 0.08 }}
            >
              <div
                className="font-serif mb-3"
                style={{
                  fontSize: 'clamp(44px, 6vw, 72px)',
                  lineHeight: 1,
                  color: stat.color,
                  letterSpacing: '-0.02em',
                }}
              >
                <CountUp to={stat.value} suffix={stat.suffix} />
              </div>
              <div className="font-sans text-white text-sm font-medium mb-1">{stat.label}</div>
              <div className="font-mono text-white/25 text-[10px] leading-relaxed">{stat.sub}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
