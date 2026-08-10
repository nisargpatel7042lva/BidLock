import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

/* ── Hex particle canvas ──────────────────────────────────────────── */
function HexCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const HEX = '0123456789abcdef';

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    type P = { x: number; y: number; ch: string; op: number; spd: number; gold: boolean; size: number };
    const particles: P[] = Array.from({ length: 110 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      ch: HEX[Math.floor(Math.random() * 16)],
      op: Math.random() * 0.18 + 0.03,
      spd: Math.random() * 0.25 + 0.08,
      gold: Math.random() > 0.65,
      size: Math.random() > 0.8 ? 14 : 11,
    }));

    let raf: number;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        ctx.font = `${p.size}px "JetBrains Mono", monospace`;
        ctx.fillStyle = p.gold
          ? `rgba(201,164,74,${p.op})`
          : `rgba(255,255,255,${p.op * 0.5})`;
        ctx.fillText(p.ch, p.x, p.y);
        p.y -= p.spd;
        if (Math.random() > 0.985) p.ch = HEX[Math.floor(Math.random() * 16)];
        if (p.y < -20) { p.y = canvas.height + 20; p.x = Math.random() * canvas.width; }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();

    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);

  return <canvas ref={ref} className="absolute inset-0 w-full h-full opacity-60" />;
}

/* ── Live sealed/reveal demo card ────────────────────────────────── */
const DEMO_AMOUNT = '8,500';
const DEMO_HASH   = 'a3f9bc2d...e7c1';

type DemoPhase = 'sealed' | 'revealing' | 'revealed';

function DemoCard() {
  const [phase, setPhase] = useState<DemoPhase>('sealed');

  const cycle = useCallback(() => {
    setPhase('revealing');
    setTimeout(() => setPhase('revealed'), 900);
    setTimeout(() => setPhase('sealed'), 3200);
  }, []);

  useEffect(() => {
    const t = setTimeout(cycle, 2200);
    const id = setInterval(cycle, 5600);
    return () => { clearTimeout(t); clearInterval(id); };
  }, [cycle]);

  const isSealed = phase === 'sealed';

  return (
    <motion.div
      className="liquid-glass rounded-2xl p-5 w-64 select-none"
      style={{ background: isSealed ? 'rgba(201,164,74,0.04)' : 'rgba(62,206,206,0.04)' }}
      animate={{ boxShadow: isSealed
        ? '0 0 0 1px rgba(201,164,74,0.18), 0 0 40px rgba(201,164,74,0.06)'
        : '0 0 0 1px rgba(62,206,206,0.18), 0 0 40px rgba(62,206,206,0.06)',
      }}
      transition={{ duration: 0.6 }}
    >
      {/* Status badge */}
      <div className="flex items-center gap-2 mb-4">
        <motion.div
          className="w-1.5 h-1.5 rounded-full"
          animate={{ backgroundColor: isSealed ? '#C9A44A' : '#3ECECE' }}
          transition={{ duration: 0.4 }}
        />
        <motion.span
          className="font-mono text-[10px] tracking-widest uppercase"
          animate={{ color: isSealed ? '#C9A44A' : '#3ECECE' }}
          transition={{ duration: 0.4 }}
        >
          {phase === 'revealing' ? 'Verifying…' : isSealed ? 'Proposal sealed' : 'Revealed'}
        </motion.span>
      </div>

      {/* Amount row */}
      <div className="flex items-baseline justify-between mb-3">
        <span className="font-sans text-white/40 text-xs">Proposal</span>
        <AnimatePresence mode="wait">
          {isSealed ? (
            <motion.span
              key="hidden"
              className="font-mono text-gold text-sm tracking-wider animate-pulse-gold"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              ● ● ● ● ●
            </motion.span>
          ) : (
            <motion.span
              key="revealed"
              className="font-mono text-teal text-sm"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
            >
              {DEMO_AMOUNT}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Hash row */}
      <div className="flex items-center justify-between pt-3 border-t border-white/5">
        <span className="font-sans text-white/40 text-xs">sha256 commitment</span>
        <span className="font-mono text-white/30 text-[10px]">{DEMO_HASH}</span>
      </div>

      {/* Verification tick */}
      <AnimatePresence>
        {!isSealed && (
          <motion.div
            className="mt-3 flex items-center gap-1.5"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 0.3 }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="#3ECECE" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="font-mono text-teal text-[10px] tracking-wider">Commitment verified</span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ── Hero section ─────────────────────────────────────────────────── */
export function HeroSection() {
  const [email, setEmail] = useState('');
  const APP_URL = 'http://localhost:3000';

  return (
    <section className="relative min-h-screen flex flex-col overflow-hidden noise">
      {/* Ambient gradients */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] rounded-full"
          style={{ background: 'radial-gradient(ellipse, rgba(201,164,74,0.07) 0%, transparent 65%)' }} />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px]"
          style={{ background: 'radial-gradient(ellipse, rgba(62,206,206,0.04) 0%, transparent 70%)' }} />
      </div>

      {/* Hex particles */}
      <HexCanvas />

      {/* Content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 pt-32 pb-20 text-center"
        style={{ transform: 'translateY(-4%)' }}>

        {/* Eyebrow label */}
        <motion.div
          className="liquid-glass rounded-full px-4 py-1.5 mb-10 flex items-center gap-2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
          <span className="font-mono text-[10px] tracking-widest text-white/60 uppercase">
            Commit-reveal protocol · Solana + MagicBlock
          </span>
        </motion.div>

        {/* Main heading — two-part with italic convergence */}
        <div className="mb-8 overflow-hidden">
          <motion.h1
            className="font-serif leading-[0.95] tracking-tight whitespace-nowrap"
            style={{ fontSize: 'clamp(56px, 10vw, 148px)' }}
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
          >
            <span className="text-white">Propose in secret.</span>
          </motion.h1>
          <motion.h1
            className="font-serif leading-[0.95] tracking-tight whitespace-nowrap"
            style={{ fontSize: 'clamp(56px, 10vw, 148px)' }}
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.22 }}
          >
            <em className="italic" style={{
              background: 'linear-gradient(135deg, #C9A44A 0%, #F0CF80 45%, #3ECECE 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>Reveal together.</em>
          </motion.h1>
        </div>

        {/* Demo card floating right of center */}
        <motion.div
          className="mb-10"
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.38 }}
        >
          <DemoCard />
        </motion.div>

        {/* Subtitle */}
        <motion.p
          className="font-sans text-white/50 text-base md:text-lg leading-relaxed max-w-xl mb-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.5 }}
        >
          Every group member seals their proposal behind a cryptographic commitment.
          No one sees anyone else's input until the reveal window opens.
          Then the group{' '}
          <em className="italic text-teal" style={{ WebkitTextFillColor: '#3ECECE' }}>converges</em>{' '}
          on truth — on Solana.
        </motion.p>

        {/* Email / room input */}
        <motion.div
          className="liquid-glass rounded-full pl-6 pr-2 py-2 flex items-center gap-3 max-w-md w-full mb-5"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.6 }}
        >
          <input
            type="text"
            placeholder="Paste room address or enter email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="flex-1 bg-transparent text-white placeholder:text-white/30 text-sm outline-none font-sans"
          />
          <a
            href={email.startsWith('http') || email.length === 44
              ? `${APP_URL}/room/${email}`
              : `${APP_URL}/create`}
            className="bg-white rounded-full p-2.5 text-black hover:bg-white/90 transition-colors"
          >
            <ArrowRight size={16} strokeWidth={2} />
          </a>
        </motion.div>

        {/* Secondary CTA */}
        <motion.a
          href={`${APP_URL}/create`}
          className="liquid-glass rounded-full px-8 py-3 text-white text-sm font-sans font-medium hover:bg-white/5 transition-colors"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.72 }}
          data-hover
        >
          Create your first room →
        </motion.a>
      </div>

      {/* Scroll hint */}
      <motion.div
        className="relative z-10 flex justify-center pb-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4 }}
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className="flex flex-col items-center gap-1"
        >
          <span className="font-mono text-white/20 text-[9px] tracking-widest uppercase">Scroll</span>
          <div className="w-px h-8" style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.2), transparent)' }} />
        </motion.div>
      </motion.div>
    </section>
  );
}
