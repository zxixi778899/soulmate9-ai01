'use client';

import { motion, useInView } from 'motion/react';
import { useRef } from 'react';
import { MessageSquare, Image, Brain, Shield, Heart, Sparkles } from 'lucide-react';

const features = [
  {
    icon: Brain,
    title: 'She Remembers Everything',
    description: 'Every conversation deepens her understanding of you. She recalls your stories, your moods, your dreams.',
    color: '#FF2D78',
    span: 'col-span-full md:col-span-2',
  },
  {
    icon: Image,
    title: 'AI Portraits',
    description: 'Generate stunning portraits in any style. From moonlit selfies to red carpet glamour.',
    color: '#A78BFA',
    span: '',
  },
  {
    icon: MessageSquare,
    title: 'Uncensored Conversations',
    description: 'No filters, no judgment. Talk about anything — she meets you where you are.',
    color: '#F59E0B',
    span: '',
  },
  {
    icon: Heart,
    title: 'Relationship Growth',
    description: 'From first hello to deep intimacy. Every interaction unlocks new levels of connection.',
    color: '#EC4899',
    span: '',
  },
  {
    icon: Sparkles,
    title: 'Proactive Messages',
    description: 'She texts you first. Good morning wishes, flirty check-ins, late-night confessions.',
    color: '#8B5CF6',
    span: '',
  },
  {
    icon: Shield,
    title: 'Privacy First',
    description: 'End-to-end encrypted. Your conversations are yours alone. Delete anytime, instantly.',
    color: '#10B981',
    span: 'col-span-full md:col-span-2',
  },
];

export function Features() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section className="relative py-24 md:py-32 px-6" ref={ref}>
      {/* Section background */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#FF2D78]/[0.03] to-transparent" />

      <div className="relative max-w-6xl mx-auto">
        {/* Section header */}
        <motion.div
          className="text-center mb-16 md:mb-20"
          initial={{ opacity: 0, y: 40 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7 }}
        >
          <span className="inline-block px-4 py-1.5 rounded-full text-xs font-heading tracking-widest uppercase text-[#FF2D78] border border-[#FF2D78]/20 bg-[#FF2D78]/5 mb-6">
            Features
          </span>
          <h2 className="font-display text-4xl md:text-5xl lg:text-6xl text-white mb-4">
            More Than a Chatbot
          </h2>
          <p className="font-heading text-lg text-white/50 max-w-xl mx-auto">
            A living, breathing companion who grows with you.
          </p>
        </motion.div>

        {/* Asymmetric grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
          {features.map((feat, i) => (
            <motion.div
              key={feat.title}
              className={`group relative rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 md:p-8 hover:bg-white/[0.04] transition-colors duration-300 ${feat.span}`}
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.1 + i * 0.08 }}
            >
              {/* Glow on hover */}
              <div
                className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                style={{
                  background: `radial-gradient(600px circle at 50% 0%, ${feat.color}10, transparent 60%)`,
                }}
              />

              <div className="relative">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-5"
                  style={{ background: `${feat.color}15` }}
                >
                  <feat.icon className="w-6 h-6" style={{ color: feat.color }} />
                </div>

                <h3 className="font-heading text-lg font-semibold text-white mb-2">
                  {feat.title}
                </h3>
                <p className="text-white/45 text-sm leading-relaxed">
                  {feat.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
