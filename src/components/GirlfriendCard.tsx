'use client';

import { motion, useMotionValue, useTransform } from 'motion/react';
import { useRef } from 'react';

interface Girl {
  id: string;
  name: string;
  avatar: string;
  tagline: string;
  tags: string[];
  intimacy: number;
  rarity: 'R' | 'SR' | 'SSR';
}

export default function GirlfriendCard({ girl, onSelect }: { girl: Girl; onSelect: (girl: Girl) => void }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useTransform(y, [-200, 200], [18, -18]);
  const rotateY = useTransform(x, [-200, 200], [-18, 18]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const mx = (e.clientX - rect.left - rect.width / 2) * 0.9;
    const my = (e.clientY - rect.top - rect.height / 2) * 0.9;
    x.set(mx);
    y.set(my);
  };
  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  const rarityStyles = {
    R: 'border-blue-400/70',
    SR: 'border-purple-500/80',
    SSR: 'border-rose-500 shadow-[0_0_30px_#ff0088]',
  }[girl.rarity];

  return (
    <motion.div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
      whileHover={{ scale: 1.04 }}
      className={`relative w-full max-w-[280px] h-[420px] rounded-3xl overflow-hidden border-2 bg-zinc-950/95 backdrop-blur-xl cursor-pointer group ${rarityStyles}`}
      onClick={() => onSelect(girl)}
    >
      <div className="relative h-80 overflow-hidden">
        <img src={girl.avatar} alt={girl.name} className="w-full h-full object-cover transition-all duration-1000 group-hover:scale-110" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/40 to-black/90" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_40%_25%,rgba(255,180,220,0.45)_0%,transparent_65%)] group-hover:opacity-90 transition-all" />
      </div>

      <div className="p-5 space-y-3">
        <div className="flex justify-between items-start">
          <h3 className="text-2xl font-bold tracking-tighter text-white">OOXX • {girl.name}</h3>
          <span className={`text-xs px-3 py-1 rounded-full font-mono ${girl.rarity === 'SSR' ? 'text-rose-400' : 'text-purple-400'}`}>{girl.rarity}</span>
        </div>
        <p className="text-sm text-rose-300/90 line-clamp-2">{girl.tagline}</p>
        <div className="flex flex-wrap gap-1.5">
          {girl.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="text-[10px] px-2.5 py-0.5 bg-white/10 rounded-full text-zinc-300">{tag}</span>
          ))}
        </div>
        <div className="pt-2">
          <div className="flex justify-between text-xs mb-1 text-zinc-400">
            <span>亲密度</span>
            <span className="text-rose-400 font-medium">{girl.intimacy}%</span>
          </div>
          <div className="h-1.5 bg-zinc-900 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-rose-500 via-fuchsia-500 to-purple-500"
              initial={{ width: '30%' }}
              animate={{ width: `${girl.intimacy}%` }}
              transition={{ duration: 0.6 }}
            />
          </div>
        </div>
      </div>

      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 w-[86%]">
        <button
          onClick={(e) => { e.stopPropagation(); onSelect(girl); }}
          className="w-full py-3 text-sm font-semibold tracking-[2px] rounded-2xl bg-gradient-to-r from-rose-600 via-purple-600 to-fuchsia-600 hover:brightness-110 active:scale-95 shadow-2xl shadow-rose-500/50 transition-all"
        >
          UNLEASH DESIRE
        </button>
      </div>
    </motion.div>
  );
}