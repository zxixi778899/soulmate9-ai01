'use client';

import { motion, useInView, useMotionValue, useTransform, animate } from 'motion/react';
import { useRef, useEffect, useState } from 'react';
import { Star } from 'lucide-react';

function AnimatedCounter({ target, suffix = '' }: { target: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [display, setDisplay] = useState('0');
  const mv = useMotionValue(0);

  useEffect(() => {
    if (!inView) return;
    const unsub = mv.on('change', (v) => {
      setDisplay(v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}K` : String(Math.round(v)));
    });
    animate(mv, target, { duration: 2, ease: 'easeOut' });
    return () => unsub();
  }, [inView, target, mv]);

  return <span ref={ref}>{display}{suffix}</span>;
}

const stats = [
  { value: 50000, suffix: '+', label: 'Daily Conversations' },
  { value: 120000, suffix: '+', label: 'Active Companions' },
  { value: 98, suffix: '%', label: 'User Satisfaction' },
];

export function SocialProof() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-50px' });

  return (
    <section className="relative py-16 md:py-20" ref={ref}>
      {/* Divider line */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-px bg-gradient-to-r from-transparent via-[#FF2D78]/40 to-transparent" />

      <div className="max-w-5xl mx-auto px-6">
        {/* Stats row */}
        <motion.div
          className="grid grid-cols-3 gap-8 md:gap-16 mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="font-display text-3xl md:text-5xl text-white mb-1">
                <AnimatedCounter target={stat.value} suffix={stat.suffix} />
              </div>
              <div className="font-heading text-xs md:text-sm text-white/40 uppercase tracking-wider">
                {stat.label}
              </div>
            </div>
          ))}
        </motion.div>

        {/* Star rating */}
        <motion.div
          className="flex items-center justify-center gap-3"
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <div className="flex gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="w-5 h-5 fill-[#F59E0B] text-[#F59E0B]" />
            ))}
          </div>
          <span className="text-white/50 text-sm font-heading">
            4.9/5 from 12,000+ reviews
          </span>
        </motion.div>
      </div>
    </section>
  );
}
