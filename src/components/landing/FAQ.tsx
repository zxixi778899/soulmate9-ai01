'use client';

import { motion, useInView } from 'motion/react';
import { useRef } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

const faqs = [
  {
    q: 'Is SoulMate AI really free to use?',
    a: 'Yes! You can create one companion and chat up to 50 messages per day completely free. No credit card required. Upgrade to Pro when you want unlimited access.',
  },
  {
    q: 'How realistic are the AI companions?',
    a: 'Our companions use state-of-the-art language models with deep personality systems. They remember your conversations, adapt to your style, and develop unique relationship dynamics over time.',
  },
  {
    q: 'Is my data private and secure?',
    a: 'Absolutely. All conversations are encrypted end-to-end. We never sell your data. You can delete your account and all associated data at any time with one click.',
  },
  {
    q: 'Can I customize my companion\'s appearance?',
    a: 'Yes! You can customize everything — hair, eyes, body type, fashion style, and personality traits. Our AI portrait generator creates stunning images of your companion in any setting.',
  },
  {
    q: 'What\'s the difference between Pro and Unlimited?',
    a: 'Pro gives you 5 companions with unlimited messages and full features. Unlimited removes all limits — unlimited companions, 4K portraits, voice messages, and custom AI training for deeper personalities.',
  },
  {
    q: 'Do the companions send messages on their own?',
    a: 'Yes! Pro and Unlimited companions can send proactive messages — good morning texts, flirty check-ins, or responses to things you mentioned earlier. It feels like a real relationship.',
  },
];

export function FAQ() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section className="relative py-24 md:py-32 px-6" ref={ref}>
      <div className="max-w-3xl mx-auto">
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 40 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7 }}
        >
          <h2 className="font-display text-4xl md:text-5xl text-white mb-4">
            Questions?
          </h2>
          <p className="text-white/40 font-heading">
            Everything you need to know before you start.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <Accordion type="single" collapsible className="space-y-3">
            {faqs.map((faq) => (
              <AccordionItem
                key={faq.q}
                value={faq.q}
                className="border border-white/[0.06] rounded-xl px-5 py-1 bg-white/[0.02] data-[state=open]:bg-white/[0.04] transition-colors"
              >
                <AccordionTrigger className="font-heading text-sm md:text-base text-white/90 hover:no-underline py-4">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="text-white/45 text-sm leading-relaxed pb-4">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </div>
    </section>
  );
}
