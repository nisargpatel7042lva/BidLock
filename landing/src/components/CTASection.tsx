import { useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';

/* ── Rotating ring ────────────────────────────────────────────────── */
function RotatingRing() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <motion.div
        className="w-[600px] h-[600px] rounded-full"
        style={{
          border: '1px solid rgba(201,164,74,0.08)',
          boxShadow: '0 0 80px rgba(201,164,74,0.04) inset',
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 80, repeat: Infinity, ease: 'linear' }}
      >
        {/* Ring tick marks */}
        {Array.from({ length: 24 }).map((_, i) => (
          <div
            key={i}
            className="absolute left-1/2 top-0 origin-bottom"
            style={{
              width: 1,
              height: i % 6 === 0 ? 12 : 6,
              background: i % 6 === 0 ? 'rgba(201,164,74,0.3)' : 'rgba(255,255,255,0.08)',
              transform: `translateX(-50%) rotate(${i * 15}deg)`,
              transformOrigin: `0.5px 300px`,
            }}
          />
        ))}
      </motion.div>
      <motion.div
        className="absolute w-[400px] h-[400px] rounded-full"
        style={{ border: '1px solid rgba(62,206,206,0.06)' }}
        animate={{ rotate: -360 }}
        transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  );
}

/* ── Section ──────────────────────────────────────────────────────── */
export function CTASection() {
  const ref  = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-100px' });
  const [room, setRoom] = useState('');
  const APP_URL = 'http://localhost:3000';

  return (
    <section className="bg-black py-32 md:py-48 px-6 relative overflow-hidden" ref={ref}>
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px]"
          style={{ background: 'radial-gradient(circle, rgba(201,164,74,0.05) 0%, transparent 65%)' }} />
      </div>

      <RotatingRing />

      <div className="relative z-10 max-w-3xl mx-auto text-center">
        {/* Label */}
        <motion.span
          className="font-mono text-white/25 text-xs tracking-widest uppercase block mb-8"
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
          transition={{ duration: 0.6 }}
        >
          Get started
        </motion.span>

        {/* Heading */}
        <motion.h2
          className="font-serif text-white mb-6"
          style={{ fontSize: 'clamp(44px, 8vw, 112px)', lineHeight: 0.96, letterSpacing: '-0.02em' }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
          transition={{ duration: 0.9, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        >
          Your next decision<br />
          <em className="italic" style={{
            background: 'linear-gradient(135deg, #C9A44A, #3ECECE)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>deserves truth.</em>
        </motion.h2>

        {/* Sub */}
        <motion.p
          className="font-sans text-white/40 text-base leading-relaxed mb-12 max-w-lg mx-auto"
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.7, delay: 0.2 }}
        >
          Stop letting the loudest voice win. Open a BidLock room in 30 seconds —
          share the URL with your group — seal, reveal, converge.
        </motion.p>

        {/* Room input */}
        <motion.div
          className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto mb-6"
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.7, delay: 0.3 }}
        >
          <div className="liquid-glass rounded-full pl-5 pr-2 py-2 flex-1 flex items-center gap-3">
            <input
              type="text"
              placeholder="Paste a room address…"
              value={room}
              onChange={e => setRoom(e.target.value)}
              className="flex-1 bg-transparent text-white placeholder:text-white/25 text-sm outline-none font-sans"
            />
          </div>
          <motion.a
            href={room ? `${APP_URL}/room/${room}` : `${APP_URL}/create`}
            className="liquid-glass rounded-full px-7 py-3 text-white text-sm font-sans font-medium whitespace-nowrap hover:bg-white/5 transition-colors"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            data-hover
          >
            {room ? 'Enter Room' : 'Create Room'} →
          </motion.a>
        </motion.div>

        {/* Links row */}
        <motion.div
          className="flex items-center justify-center gap-8 mt-10"
          animate={inView ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.7, delay: 0.45 }}
        >
          {[
            { label: 'Read the docs', href: '#' },
            { label: 'View on GitHub', href: '#' },
            { label: 'Solana Explorer', href: `https://explorer.solana.com/address/23zkP27qb2eNg1nxKovh3zTLiLKXccKoRHRH6wukMYEs?cluster=devnet` },
          ].map(link => (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 font-sans text-white/30 text-xs hover:text-white/60 transition-colors"
              data-hover
            >
              {link.label}
              <ArrowUpRight size={10} />
            </a>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
