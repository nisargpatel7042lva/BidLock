import { Lock } from 'lucide-react';

export function Footer() {
  const APP_URL = 'http://localhost:3000';

  return (
    <footer className="bg-black border-t border-white/5 px-6 py-12">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row items-start justify-between gap-10 mb-12">
          {/* Brand */}
          <div className="max-w-xs">
            <div className="flex items-center gap-2 mb-4">
              <Lock size={14} className="text-gold" strokeWidth={1.5} />
              <span className="font-serif text-white text-base tracking-tight">BidLock</span>
            </div>
            <p className="font-sans text-white/30 text-xs leading-relaxed">
              Commit-reveal coordination protocol on Solana.
              Seal every proposal. Reveal simultaneously. Converge honestly.
            </p>
            <p className="font-mono text-white/15 text-[10px] mt-4">
              Program: 23zkP27qb2eN…kMYEs
            </p>
          </div>

          {/* Links */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-8">
            <div>
              <p className="font-mono text-white/20 text-[10px] tracking-widest uppercase mb-4">Product</p>
              <ul className="space-y-2">
                {[
                  { label: 'Create Room', href: `${APP_URL}/create` },
                  { label: 'Enter Room', href: APP_URL },
                  { label: 'Protocol', href: '#protocol' },
                ].map(link => (
                  <li key={link.label}>
                    <a href={link.href} className="font-sans text-white/40 text-xs hover:text-white/70 transition-colors">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="font-mono text-white/20 text-[10px] tracking-widest uppercase mb-4">Technical</p>
              <ul className="space-y-2">
                {[
                  { label: 'Architecture', href: '#about' },
                  { label: 'How it works', href: '#how-it-works' },
                  { label: 'MagicBlock ER', href: 'https://magicblock.gg' },
                ].map(link => (
                  <li key={link.label}>
                    <a href={link.href} className="font-sans text-white/40 text-xs hover:text-white/70 transition-colors">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="font-mono text-white/20 text-[10px] tracking-widest uppercase mb-4">Resources</p>
              <ul className="space-y-2">
                {[
                  { label: 'GitHub', href: '#' },
                  { label: 'Solana Explorer', href: `https://explorer.solana.com/address/23zkP27qb2eNg1nxKovh3zTLiLKXccKoRHRH6wukMYEs?cluster=devnet` },
                  { label: 'Demo Script', href: '#' },
                ].map(link => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-sans text-white/40 text-xs hover:text-white/70 transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-8 border-t border-white/5">
          <p className="font-mono text-white/15 text-[10px]">
            © 2025 BidLock. MIT License.
          </p>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-white/15">Built on</span>
            <span className="font-mono text-[10px] text-white/30">Solana</span>
            <span className="font-mono text-[10px] text-white/15">+</span>
            <span className="font-mono text-[10px] text-white/30">MagicBlock</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
