import { useEffect, useRef } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';

export function Cursor() {
  const cursorX = useMotionValue(-100);
  const cursorY = useMotionValue(-100);
  const glowX   = useMotionValue(-100);
  const glowY   = useMotionValue(-100);

  const springConfig = { damping: 28, stiffness: 350, mass: 0.5 };
  const dotX  = useSpring(cursorX, springConfig);
  const dotY  = useSpring(cursorY, springConfig);

  const glowSpring = { damping: 40, stiffness: 160, mass: 1.2 };
  const smoothGlowX = useSpring(glowX, glowSpring);
  const smoothGlowY = useSpring(glowY, glowSpring);

  const isHovering = useRef(false);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      cursorX.set(e.clientX - 6);
      cursorY.set(e.clientY - 6);
      glowX.set(e.clientX - 200);
      glowY.set(e.clientY - 200);
    };

    const enter = () => { isHovering.current = true; };
    const leave = () => { isHovering.current = false; };

    window.addEventListener('mousemove', move);
    document.querySelectorAll('a, button, [data-hover]').forEach(el => {
      el.addEventListener('mouseenter', enter);
      el.addEventListener('mouseleave', leave);
    });

    return () => window.removeEventListener('mousemove', move);
  }, [cursorX, cursorY, glowX, glowY]);

  return (
    <>
      {/* Ambient glow that trails behind */}
      <motion.div
        className="fixed pointer-events-none z-[9998]"
        style={{
          x: smoothGlowX,
          y: smoothGlowY,
          width: 400,
          height: 400,
          background: 'radial-gradient(circle, rgba(201,164,74,0.06) 0%, transparent 70%)',
        }}
      />
      {/* Cursor dot */}
      <motion.div
        className="fixed pointer-events-none z-[9999]"
        style={{
          x: dotX,
          y: dotY,
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: '#C9A44A',
          mixBlendMode: 'screen',
        }}
      />
    </>
  );
}
