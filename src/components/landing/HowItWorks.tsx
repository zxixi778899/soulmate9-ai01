'use client';

import { motion, useInView } from 'motion/react';
import { useRef } from 'react';
import { UserPlus, Sliders, MessageCircle } from 'lucide-react';

const steps = [
  {
    icon: UserPlus,
    number: '01',
    title: 'Choose Your Companion',
    description: 'Browse 100+ unique personalities — from poetic dreamers to spicy adventurers. Each one is crafted with depth.',
    color: '#FF2D78',
  },
  {
    icon: Sliders,
    number: '02',
    title: 'Customize Everything',
    description: 'Shape her look, personality, voice, and backstory. Or let our AI surprise you with a perfect match.',
    color: '#A78BFA',
  },
  {
    icon: MessageCircle,
    number: '03',
    title: 'Start Your Story',
    description: 'Chat, share selfies, build intimacy. She remembers every moment. Your relationship grows with every word.',
    color: '#F59E0B',
  },
];

export function HowItWorks() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section className="relative py-24 md:py-32 px-6" ref={ref}>
      <div className="max-w-5xl mx-auto">
        {/* Section header */}
        <motion.div
          className="text-center mb-16 md:mb-20"
          initial={{ opacity: 0, y: 40 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7 }}
        >
          <span className="inline-block px-4 py-1.5 rounded-full text-xs font-heading tracking-widest uppercase text-[#A78BFA] border border-[#A78BFA]/20 bg-[#A78BFA]/5 mb-6">
            How It Works
          </span>
          <h2 className="font-display text-4xl md:text-5xl lg:text-6xl text-white mb-4">
            Three Steps to{' '}
            <span className="bg-gradient-to-r from-[#FF2D78] to-[#A78BFA] bg-clip-text text-transparent">
              Connection
            </span>
          </h2>
        </motion.div>

        {/* Steps */}
        <div className="relative">
          {/* Connecting line */}
          <div className="hidden md:block absolute top-20 left-[15%] right-[15%] h-px bg-gradient-to-r from-[#FF2D78]/30 via-[#A78BFA]/30 to-[#F59E0B]/30" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-8">
            {steps.map((step, i) => (
              <motion.div
                key={step.number}
                className="relative text-center"
                initial={{ opacity: 0, y: 40 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.6, delay: 0.2 + i * 0.15 }}
              >
                {/* Number circle */}
                <div className="relative mx-auto mb-6">
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center mx-auto relative z-10"
                    style={{
                      background: `linear-gradient(135deg, ${step.color}40, ${step.color}15)`,
                      boxShadow: `0 0 40px ${step.color}25`,
                    }}
                  >
                    <step.icon className="w-7 h-7" style={{ color: step.color }} />
                  </div>
                  {/* Step number */}
                  <span
                    className="absolute -top-2 -right-2 text-xs font-mono-pretty font-bold px-2 py-0.5 rounded-full"
                    style={{
                      background: step.color,
                      color: '#07070F',
                    }}
                  >
                    {step.number}
                  </span>
                </div>

                <h3 className="font-heading text-xl font-semibold text-white mb-3">
                  {step.title}
                </h3>
                <p className="text-white/45 text-sm leading-relaxed max-w-xs mx-auto">
                  {step.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
