import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';

const APP_URL = 'http://localhost:3000';

export function Navbar() {
  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className="fixed top-0 left-0 right-0 z-50 px-6 py-5"
    >
      <nav className="liquid-glass rounded-full max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
        {/* Left */}
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 flex items-center justify-center">
            <Lock size={16} className="text-gold" strokeWidth={1.5} />
          </div>
          <span className="font-serif text-white text-lg tracking-tight">BidLock</span>
          <div className="hidden md:flex items-center gap-7 ml-8">
            {['Protocol', 'How it works', 'About'].map(link => (
              <a
                key={link}
                href={`#${link.toLowerCase().replace(/\s+/g, '-')}`}
                className="text-white/60 hover:text-white text-sm font-sans transition-colors duration-200"
              >
                {link}
              </a>
            ))}
          </div>
        </div>

        {/* Right */}
        <div className="flex items-center gap-3">
          <a
            href={APP_URL}
            className="hidden md:block text-white/70 hover:text-white text-sm font-sans transition-colors duration-200"
          >
            Enter Room
          </a>
          <a
            href={`${APP_URL}/create`}
            className="liquid-glass rounded-full px-6 py-2 text-white text-sm font-sans font-medium hover:bg-white/5 transition-colors duration-200"
          >
            Create Room →
          </a>
        </div>
      </nav>
    </motion.header>
  );
}
