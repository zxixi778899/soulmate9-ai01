'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, X, Flame, Droplet, Wind, Sun, Moon, Star } from 'lucide-react';
import { GIRLS, type DemoGirl, RARITY_COLORS } from '@/lib/demo-data';
import { NeonGridBackground } from '@/components/discover/NeonGridBackground';
import { cn } from '@/lib/utils';

type Tool = 'portrait' | 'voice' | 'video';

const TOOLS: { key: Tool; label: string; desc: string; icon: any; gradient: string }[] = [
  { key: 'portrait', label: 'Portrait Studio', desc: 'Generate high-res portraits in any scene', icon: Sun,    gradient: 'from-[#ff2e88] to-[#c026d3]' },
  { key: 'voice',    label: 'Voice Studio',    desc: 'Clone her voice or generate audio stories', icon: Wind,   gradient: 'from-[#00e5ff] to-[#3b82f6]' },
  { key: 'video',    label: 'Video Studio',    desc: 'Animate your companion in short clips',     icon: Flame,  gradient: 'from-[#fbbf24] to-[#ff6b35]' },
];

export default function StudioPage() {
  const [activeTool, setActiveTool] = useState<Tool>('portrait');
  const [selectedGirl, setSelectedGirl] = useState<DemoGirl>(GIRLS[0]);
  const [prompt, setPrompt] = useState('A cinematic portrait under the neon rain, looking at the camera');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const generate = () => {
    setGenerating(true);
    setResult(null);
    setTimeout(() => {
      setResult(selectedGirl.portrait);
      setGenerating(false);
    }, 1800);
  };

  return (
    <div className="relative min-h-screen text-white" style={{ fontFamily: "'Poppins', system-ui, sans-serif" }}>
      <NeonGridBackground />

      <section className="relative z-10 pt-6 px-4 sm:px-8">
        <div className="mx-auto max-w-5xl text-center">
          <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.4em] text-[#00e5ff]">
            <Sparkles className="h-3 w-3" /> Studio · Generate · Create
          </div>
          <h1 className="mt-2 text-5xl sm:text-6xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-[#00e5ff] via-[#3b82f6] to-[#ff2e88] bg-clip-text text-transparent">Creator Studio</span>
          </h1>
          <p className="mt-2 text-zinc-400 text-sm">Bring your companions to life · photo · voice · video</p>
        </div>
      </section>

      <section className="relative z-10 mt-8 px-4 sm:px-8">
        <div className="mx-auto max-w-3xl grid grid-cols-3 gap-3">
          {TOOLS.map((tool) => {
            const active = activeTool === tool.key;
            const Icon = tool.icon;
            return (
              <button key={tool.key} onClick={() => { setActiveTool(tool.key); setResult(null); }}
                className={cn('p-4 rounded-2xl border-2 transition-all text-left',
                  active ? 'border-white/[0.18] bg-white/[0.06] shadow-[0_0_28px_rgba(255,46,136,0.2)]'
                        : 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04]')}>
                <div className={cn('h-10 w-10 rounded-xl bg-gradient-to-br flex items-center justify-center mb-2', tool.gradient)}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <div className="font-semibold text-sm">{tool.label}</div>
                <div className="text-[10px] text-zinc-400 mt-0.5 line-clamp-1">{tool.desc}</div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="relative z-10 mt-8 px-4 sm:px-8 pb-20">
        <div className="mx-auto max-w-5xl grid md:grid-cols-2 gap-6">
          <div className="rounded-3xl border border-white/[0.08] bg-[#0e0e12]/80 backdrop-blur-2xl p-5">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-3">Companion</div>
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {GIRLS.slice(0, 8).map((g) => (
                <button key={g.id} onClick={() => { setSelectedGirl(g); setResult(null); }}
                  className={cn('shrink-0 h-14 w-14 rounded-full overflow-hidden border-2 transition-all',
                    selectedGirl.id === g.id ? 'border-[#ff2e88] scale-110 shadow-[0_0_18px_rgba(255,46,136,0.5)]' : 'border-white/10 hover:border-white/30')}>
                  <img src={g.avatar} alt={g.name} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
            <div className="mt-5 text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Prompt</div>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe what you want to generate..."
              className="w-full h-28 p-3 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder-zinc-500 focus:border-[#ff2e88]/40 outline-none resize-none" />
            <button onClick={generate} disabled={generating}
              className="mt-4 w-full h-12 rounded-2xl font-bold tracking-wider text-white text-sm disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #ff2e88, #c026d3)', boxShadow: '0 0 24px rgba(255,46,136,0.4)' }}>
              {generating ? 'GENERATING...' : 'GENERATE'}
            </button>
          </div>
          <div className="rounded-3xl border border-white/[0.08] bg-[#0e0e12]/80 backdrop-blur-2xl p-5 flex flex-col items-center justify-center min-h-[400px]">
            {result ? (
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="relative w-full max-w-sm rounded-2xl overflow-hidden border-2"
                style={{ borderColor: '#ff2e88', boxShadow: '0 0 36px rgba(255,46,136,0.4)' }}>
                <img src={result} alt="Generated" className="w-full aspect-square object-cover" />
                <div className="absolute bottom-2 left-2 right-2 text-center text-xs text-white bg-black/40 backdrop-blur-md rounded-full py-1">
                  {selectedGirl.name} · {activeTool}
                </div>
              </motion.div>
            ) : (
              <div className="text-center text-zinc-500">
                <Sparkles className="h-12 w-12 mx-auto text-zinc-700" />
                <p className="mt-3 text-sm">Output appears here</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}