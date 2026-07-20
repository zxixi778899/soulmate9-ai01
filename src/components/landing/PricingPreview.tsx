'use client';

import { motion, useInView } from 'motion/react';
import { useRef } from 'react';
import { Check, Crown, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

const plans = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Get a taste of companionship',
    features: [
      '3 companions',
      '40 messages / day',
      '3 AI images / day',
      '3 voice / day',
      'Intimacy up to Level 3',
      'Basic personality',
      'Standard portraits',
    ],
    cta: 'Start Free',
    color: '#8B8BA3',
    highlighted: false,
    icon: Zap,
  },
  {
    name: 'Basic',
    price: '$9.99',
    period: '/ month',
    description: 'A meaningful connection',
    features: [
      '8 companions',
      '150 messages / day',
      '5 AI images / day',
      '15 voice / day',
      'Intimacy up to Level 5',
      'Standard memory depth',
      'Standard outfits',
    ],
    cta: 'Go Basic',
    color: '#38bdf8',
    highlighted: false,
    icon: Zap,
  },
  {
    name: 'Pro',
    price: '$19.99',
    period: '/ month',
    description: 'The full experience',
    features: [
      '15 companions',
      '300 messages / day',
      'Full intimacy levels',
      'Advanced AI personality',
      '10 AI images / day',
      '40 voice / day',
      'HD portrait generation',
      'Proactive messages',
      'Priority support',
    ],
    cta: 'Go Pro',
    color: '#FF2D78',
    highlighted: true,
    icon: Crown,
  },
  {
    name: 'Unlimited',
    price: '$29.99',
    period: '/ month',
    description: 'No limits, no boundaries',
    features: [
      'Unlimited companions',
      'Unlimited messages',
      '50 AI images / day',
      'Exclusive personality models',
      '4K portrait generation',
      'Voice messages',
      'Video generation',
      'VIP support',
    ],
    cta: 'Go Unlimited',
    color: '#A78BFA',
    highlighted: false,
    icon: Crown,
  },
];

export function PricingPreview() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section className="relative py-24 md:py-32 px-6" ref={ref} id="pricing">
      <div className="max-w-5xl mx-auto">
        {/* Section header */}
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 40 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7 }}
        >
          <span className="inline-block px-4 py-1.5 rounded-full text-xs font-heading tracking-widest uppercase text-[#F59E0B] border border-[#F59E0B]/20 bg-[#F59E0B]/5 mb-6">
            Pricing
          </span>
          <h2 className="font-display text-4xl md:text-5xl lg:text-6xl text-white mb-4">
            Choose Your Level
          </h2>
          <p className="font-heading text-lg text-white/40">
            Start free. Upgrade when you&apos;re ready to go deeper.
          </p>
        </motion.div>

        {/* Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-6">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.name}
              className={`relative rounded-2xl border p-6 md:p-8 ${
                plan.highlighted
                  ? 'border-[#FF2D78]/30 bg-gradient-to-b from-[#FF2D78]/[0.08] to-transparent'
                  : 'border-white/[0.06] bg-white/[0.02]'
              }`}
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.1 + i * 0.1 }}
            >
              {/* Popular badge */}
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-[#FF2D78] to-[#A78BFA] text-white text-xs font-heading font-semibold">
                  Most Popular
                </div>
              )}

              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <plan.icon className="w-5 h-5" style={{ color: plan.color }} />
                  <h3 className="font-heading text-lg font-semibold text-white">{plan.name}</h3>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="font-display text-4xl text-white">{plan.price}</span>
                  <span className="text-white/40 text-sm">{plan.period}</span>
                </div>
                <p className="text-white/40 text-sm mt-2">{plan.description}</p>
              </div>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feat) => (
                  <li key={feat} className="flex items-start gap-2.5 text-sm">
                    <Check className="w-4 h-4 mt-0.5 shrink-0" style={{ color: plan.color }} />
                    <span className="text-white/60">{feat}</span>
                  </li>
                ))}
              </ul>

              <Link href="/pricing">
                <Button
                  className={`w-full font-heading font-semibold ${
                    plan.highlighted
                      ? 'bg-gradient-to-r from-[#FF2D78] to-[#A78BFA] hover:opacity-90 text-white border-0'
                      : 'bg-white/[0.06] hover:bg-white/[0.1] text-white border border-white/[0.08]'
                  }`}
                  variant={plan.highlighted ? 'default' : 'outline'}
                  size="lg"
                >
                  {plan.cta}
                </Button>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
