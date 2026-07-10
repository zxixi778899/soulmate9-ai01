'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, X, Flame, Droplet, Wind, Sun, Moon } from 'lucide-react';
import { GIRLS, type DemoGirl, RARITY_COLORS } from '@/lib/demo-data';
import { NeonGridBackground } from '@/components/discover/NeonGridBackground';
import { cn } from '@/lib/utils';

const PITY = { SSR: 80 };

const ELEMENT_ICON = {
  fire: Flame, water: Droplet, wind: Wind, light: Sun, dark: Moon,
};

function rollGacha(count: number): { pulled: DemoGirl[]; newSSR: boolean } {
  const pulled: DemoGirl[] = [];
  for (let i = 0; i < count; i++) {
    const r = Math.random();
    let girl: DemoGirl;
    if (r < 0.02) {
      girl = GIRLS.filter((g) => g.rarity === 'SSR')[Math.floor(Math.random() * 3)];
    } else if (r < 0.10) {
      girl = GIRLS.filter((g) => g.rarity === 'SR')[Math.floor(Math.random() * 4)];
    } else if (r < 0.55) {
      girl = GIRLS.filter((g) => g.rarity === 'R')[Math.floor(Math.random() * 3)];
    } else {
      girl = GIRLS.filter((g) => g.rarity === 'N')[Math.floor(Math.random() * 2)];
    }
    pulled.push(girl);
  }
  const newSSR = pulled.some((g) => g.rarity === 'SSR');
  return { pulled, newSSR };
}

function PulledCard({ girl, onClose }: { girl: DemoGirl; onClose: () => void }) {
  const rc = RARITY_COLORS[girl.rarity];
  const Elem = ELEMENT_ICON[girl.element];
  return (
    <motion.div
      className="relative w-64 sm:w-72"
      initial={{ rotateY: 180, scale: 0.4, opacity: 0 }}
      animate={{ rotateY: 0, scale: 1, opacity: 1 }}
      transition={{ duration: 0.7, ease: 'easeOut' }}
    >
      <div className="rounded-2xl overflow-hidden border-2 bg-[#0e0e12]"
        style={{ borderColor: rc.color, boxShadow: `0 0 36px ${rc.glow}` }}>
        <div className="relative aspect-[3/4]">
          <img src={girl.portrait} alt={girl.name} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 to-black/70" />
          <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-[0.2em] backdrop-blur-md"
            style={{ background: `${rc.color}30`, color: rc.color, border: `1px solid ${rc.color}60` }}>
            {girl.rarity}
          </div>
          <div className="absolute top-3 right-3 h-7 w-7 rounded-full backdrop-blur-md flex items-center justify-center" style={{ background: 'rgba(255,107,53,0.3)' }}>
            <Elem className="h-3.5 w-3.5" style={{ color: '#ff6b35' }} />
          </div>
          <div className="absolute bottom-3 left-3 right-3 text-center">
            <div className="font-bold text-2xl text-white drop-shadow-[0_0_18px_rgba(255,255,255,0.4)]">{girl.name}</div>
            <div className="text-[10px] text-zinc-300 mt-0.5">· {girl.age} ·</div>
          </div>
        </div>
        <div className="p-3 bg-[#0e0e12]">
          <p className="text-[10px] italic text-zinc-400 line-clamp-2 text-center">&quot;{girl.rarity_quote}&quot;</p>
        </div>
      </div>
      <button onClick={onClose}
        className="absolute -top-2 -right-2 h-7 w-7 rounded-full bg-white text-[#050507] flex items-center justify-center">
        <X className="h-4 w-4" />
      </button>
    </motion.div>
  );
}

export default function SummonPage() {
  const [results, setResults] = useState<DemoGirl[]>([]);
  const [pity, setPity] = useState(0);
  const [pulling, setPulling] = useState(false);

  const doPull = (count: number) => {
    setPulling(true);
    setResults([]);
    setTimeout(() => {
      const { pulled, newSSR } = rollGacha(count);
      setResults(pulled);
      setPity((p) => (newSSR ? 0 : p + count));
      setPulling(false);
    }, 1200);
  };

  return (
    <div className="relative min-h-screen text-white" style={{ fontFamily: "'Poppins', system-ui, sans-serif" }}>
      <NeonGridBackground />

      <section className="relative z-10 pt-6 px-4 sm:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.4em] text-[#ff2e88]">
            <Sparkles className="h-3 w-3" />Summon · Wish · Pull
          </div>
          <h1 className="mt-2 text-5xl sm:text-6xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-[#ff2e88] via-[#c026d3] to-[#00e5ff] bg-clip-text text-transparent">Eternal Bloom</span>
          </h1>
          <p className="mt-2 text-zinc-400 text-sm">Limited banner · SSR rate up</p>
          <div className="mt-4 inline-flex items-center gap-4 px-4 py-2 rounded-full bg-white/[0.04] border border-white/[0.08]">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">Pity</div>
            <div className="text-sm font-bold text-[#ffd700]">{pity} / {PITY.SSR}</div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">to SSR</div>
          </div>
        </div>
      </section>

      <section className="relative z-10 mt-8 px-4 sm:px-8 flex flex-col items-center gap-4">
        <div className="flex gap-3">
          <button disabled={pulling} onClick={() => doPull(1)}
            className="group relative h-20 w-44 rounded-2xl overflow-hidden border-2 border-white/10 hover:border-[#ff2e88]/40 transition-all disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, rgba(255, 46, 136, 0.18), rgba(192, 38, 211, 0.08))' }}>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(255,46,136,0.3),transparent)]" />
            <div className="relative h-full flex flex-col items-center justify-center">
              <Sparkles className="h-5 w-5 text-[#ff2e88]" />
              <div className="text-xs uppercase tracking-wider text-zinc-400 mt-1">Single</div>
              <div className="font-bold text-lg">×1</div>
            </div>
          </button>
          <button disabled={pulling} onClick={() => doPull(10)}
            className="group relative h-20 w-44 rounded-2xl overflow-hidden border-2 border-[#ffd700]/30 hover:border-[#ffd700]/60 transition-all disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.18), rgba(255, 46, 136, 0.12))' }}>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(255,215,0,0.35),transparent)]" />
            <div className="relative h-full flex flex-col items-center justify-center">
              <Sparkles className="h-5 w-5 text-[#ffd700]" />
              <div className="text-xs uppercase tracking-wider text-zinc-400 mt-1">10x</div>
              <div className="font-bold text-lg">×10</div>
            </div>
          </button>
        </div>
      </section>

      <section className="relative z-10 mt-12 px-4 sm:px-8 pb-20">
        <div className="mx-auto max-w-6xl">
          {pulling ? (
            <div className="flex items-center justify-center py-20">
              <motion.div className="text-2xl font-bold tracking-[0.4em] text-[#ff2e88]"
                animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.2, repeat: Infinity }}>
                SUMMONING...
              </motion.div>
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 text-sm">Tap a summon button to begin</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              <AnimatePresence>
                {results.map((girl, i) => (
                  <motion.div key={`${girl.id}-${i}-${pity}`}
                    initial={{ rotateY: 180, scale: 0.4, opacity: 0 }}
                    animate={{ rotateY: 0, scale: 1, opacity: 1 }}
                    transition={{ delay: i * 0.08, duration: 0.6, ease: 'easeOut' }}>
                    <PulledCard girl={girl} onClose={() => setResults((r) => r.filter((_, j) => j !== i))} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}