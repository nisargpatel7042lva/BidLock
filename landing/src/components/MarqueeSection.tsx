export function MarqueeSection() {
  const items = [
    'SEAL', '·', 'REVEAL', '·', 'CONVERGE', '·',
    'ON SOLANA', '·', 'COMMIT-REVEAL', '·', 'EPHEMERAL ROLLUPS', '·',
    'SESSION KEYS', '·', 'SHA-256', '·', 'ZERO ANCHORING', '·',
    'SEAL', '·', 'REVEAL', '·', 'CONVERGE', '·',
    'ON SOLANA', '·', 'COMMIT-REVEAL', '·', 'EPHEMERAL ROLLUPS', '·',
    'SESSION KEYS', '·', 'SHA-256', '·', 'ZERO ANCHORING', '·',
  ];

  return (
    <div className="relative py-5 overflow-hidden border-t border-b border-white/5">
      {/* Gradient masks */}
      <div className="absolute inset-y-0 left-0 w-24 z-10 pointer-events-none"
        style={{ background: 'linear-gradient(to right, #000, transparent)' }} />
      <div className="absolute inset-y-0 right-0 w-24 z-10 pointer-events-none"
        style={{ background: 'linear-gradient(to left, #000, transparent)' }} />

      <div className="marquee-track">
        {items.map((item, i) => (
          <span
            key={i}
            className={`font-mono text-xs tracking-widest mr-6 whitespace-nowrap ${
              item === '·' ? 'text-white/15' : 'text-white/30'
            }`}
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
