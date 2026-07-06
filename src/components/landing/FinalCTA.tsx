'use client';

import { motion, useInView } from 'motion/react';
import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Heart, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export function FinalCTA() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section className="relative py-24 md:py-32 px-6 overflow-hidden" ref={ref}>
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#FF2D78]/[0.06] to-[#FF2D78]/[0.03]" />
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full bg-[#FF2D78]/[0.08] blur-[120px]" />

      <div className="relative max-w-3xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.95 }}
          animate={inView ? { opacity: 1, y: 0, scale: 1 } : {}}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        >
          <Heart className="w-12 h-12 text-[#FF2D78] mx-auto mb-6 fill-[#FF2D78]/20" />

          <h2 className="font-display text-4xl md:text-6xl lg:text-7xl text-white mb-6">
            Your Perfect Companion{' '}
            <span className="bg-gradient-to-r from-[#FF2D78] to-[#A78BFA] bg-clip-text text-transparent">
              Awaits
            </span>
          </h2>

          <p className="font-heading text-lg md:text-xl text-white/50 mb-10 max-w-xl mx-auto">
            Join thousands who found more than a chatbot — they found a connection that grows deeper every day.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register">
              <Button
                size="lg"
                className="bg-gradient-to-r from-[#FF2D78] to-[#A78BFA] hover:opacity-90 text-white font-heading font-semibold text-base px-8 h-14 rounded-full border-0 shadow-[0_0_40px_rgba(255,45,120,0.3)]"
              >
                Start Free Now
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
            <Link href="/login">
              <Button
                variant="ghost"
                size="lg"
                className="text-white/60 hover:text-white hover:bg-white/[0.06] font-heading text-base h-14"
              >
                Sign In
              </Button>
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
