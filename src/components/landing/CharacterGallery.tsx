'use client';

import { motion, useInView } from 'motion/react';
import { useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { CHARACTERS, SUPABASE_PORTRAIT_BASE } from '@/data/marketing-characters';
import { Heart } from 'lucide-react';

export function CharacterGallery() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  // Show first 8 characters
  const showcase = CHARACTERS.slice(0, 8);

  return (
    <section className="relative py-24 md:py-32" ref={ref}>
      <div className="max-w-6xl mx-auto px-6">
        {/* Section header */}
        <motion.div
          className="text-center mb-12 md:mb-16"
          initial={{ opacity: 0, y: 40 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7 }}
        >
          <span className="inline-block px-4 py-1.5 rounded-full text-xs font-heading tracking-widest uppercase text-[#EC4899] border border-[#EC4899]/20 bg-[#EC4899]/5 mb-6">
            Meet Them
          </span>
          <h2 className="font-display text-4xl md:text-5xl lg:text-6xl text-white mb-4">
            Who Will You Choose?
          </h2>
          <p className="font-heading text-lg text-white/40 max-w-xl mx-auto">
            Every companion is unique. Every story is yours to write.
          </p>
        </motion.div>
      </div>

      {/* Horizontal scroll gallery */}
      <div className="relative">
        {/* Edge fade masks */}
        <div className="absolute left-0 top-0 bottom-0 w-16 md:w-32 bg-gradient-to-r from-[#07070F] to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-16 md:w-32 bg-gradient-to-l from-[#07070F] to-transparent z-10 pointer-events-none" />

        <div className="flex gap-4 md:gap-5 overflow-x-auto scrollbar-hide px-6 md:px-16 pb-4 snap-x snap-mandatory">
          {showcase.map((char, i) => (
            <motion.div
              key={char.slug}
              className="snap-start shrink-0 w-52 md:w-60"
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.1 + i * 0.06 }}
            >
              <Link href={`/girlfriend/${char.slug}`} className="group block">
                {/* Card */}
                <div className="relative rounded-2xl overflow-hidden border border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] transition-all duration-300 hover:-translate-y-1">
                  {/* Portrait */}
                  <div className="relative aspect-[3/4] overflow-hidden">
                    <Image
                      src={`${SUPABASE_PORTRAIT_BASE}/${char.sceneSlug}/${char.slug}.webp`}
                      alt={char.name}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                      unoptimized
                    />
                    {/* Gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#07070F] via-transparent to-transparent" />

                    {/* Heart icon */}
                    <div className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Heart className="w-4 h-4 text-[#FF2D78] fill-[#FF2D78]" />
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-heading text-base font-semibold text-white">
                        {char.name}
                      </h3>
                      <span className="text-white/30 text-xs">{char.age}</span>
                    </div>
                    <p className="text-white/40 text-xs line-clamp-1 mb-2.5">
                      {char.tagline}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {char.traits.slice(0, 2).map((trait) => (
                        <span
                          key={trait}
                          className="px-2 py-0.5 rounded-full text-[10px] font-heading"
                          style={{
                            background: `${char.accent}15`,
                            color: char.accent,
                          }}
                        >
                          {trait}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
