/**
 * SoulMate9 — Glassmorphism Premium Design System
 *
 * Aesthetic: Dark frosted glass + nebula gradients + luminous accents
 * Inspired by: Cyberpunk luxury hotel UI, Apple Vision Pro glassmorphism
 */

export const DESIGN_TOKENS = {
  // Core palette
  colors: {
    // Deep cosmic base
    void: '#050509',
    abyss: '#0A0A14',
    surface: 'rgba(255, 255, 255, 0.04)',
    surfaceHover: 'rgba(255, 255, 255, 0.07)',
    surfaceActive: 'rgba(255, 255, 255, 0.1)',
    // Glass tints
    glassLight: 'rgba(255, 255, 255, 0.08)',
    glassMedium: 'rgba(255, 255, 255, 0.05)',
    glassHeavy: 'rgba(255, 255, 255, 0.12)',
    glassBorder: 'rgba(255, 255, 255, 0.1)',
    glassBorderStrong: 'rgba(255, 255, 255, 0.18)',
    // Neon accents
    neonRose: '#FF2D78',
    neonPink: '#FF6BA6',
    neonViolet: '#A855F7',
    neonBlue: '#3B82F6',
    neonCyan: '#06B6D4',
    neonGold: '#FBBF24',
    // Text
    text: '#F0F0F5',
    textMuted: '#A1A1AA',
    textDim: '#6B7280',
  },

  // Gradient nebula backgrounds
  gradients: {
    nebulaHero: `
      radial-gradient(ellipse 80% 60% at 20% 0%, rgba(255, 45, 120, 0.25) 0%, transparent 50%),
      radial-gradient(ellipse 70% 50% at 80% 30%, rgba(168, 85, 247, 0.22) 0%, transparent 55%),
      radial-gradient(ellipse 60% 40% at 50% 70%, rgba(59, 130, 246, 0.15) 0%, transparent 60%),
      radial-gradient(ellipse 80% 50% at 90% 90%, rgba(6, 182, 212, 0.12) 0%, transparent 60%),
      linear-gradient(180deg, #050509 0%, #0A0A14 60%, #050509 100%)
    `,
    nebulaSubtle: `
      radial-gradient(ellipse 60% 40% at 30% 20%, rgba(255, 45, 120, 0.08) 0%, transparent 60%),
      radial-gradient(ellipse 50% 30% at 80% 80%, rgba(168, 85, 247, 0.06) 0%, transparent 60%)
    `,
    auroraLine: 'linear-gradient(90deg, #FF2D78 0%, #A855F7 50%, #3B82F6 100%)',
    auroraLineSoft: 'linear-gradient(90deg, rgba(255, 45, 120, 0.8) 0%, rgba(168, 85, 247, 0.8) 50%, rgba(59, 130, 246, 0.8) 100%)',
    glassSurface: 'linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%)',
  },

  // Glassmorphism effect
  glass: {
    base: 'backdrop-blur-2xl bg-white/[0.04] border border-white/[0.08]',
    hover: 'hover:bg-white/[0.07] hover:border-white/[0.15] hover:shadow-[0_8px_32px_rgba(255,45,120,0.1)]',
    active: 'bg-white/[0.1] border-white/[0.2] shadow-[0_8px_32px_rgba(255,45,120,0.15)]',
    panel: 'backdrop-blur-3xl bg-black/40 border border-white/[0.06]',
    elevated: 'backdrop-blur-2xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] border border-white/[0.1] shadow-[0_8px_32px_rgba(0,0,0,0.4)]',
  },

  // Spacing
  spacing: {
    panel: 'p-5 sm:p-6',
    section: 'py-8 sm:py-12',
    gap: 'gap-3 sm:gap-4',
  },

  // Radius
  radius: {
    sm: 'rounded-xl',
    md: 'rounded-2xl',
    lg: 'rounded-3xl',
    full: 'rounded-full',
  },

  // Animation
  animation: {
    shimmer: 'animate-[shimmer_3s_ease-in-out_infinite]',
    float: 'animate-[float_6s_ease-in-out_infinite]',
    glow: 'animate-[glow_2s_ease-in-out_infinite_alternate]',
  },

  // Shadows
  shadow: {
    glowRose: 'shadow-[0_0_24px_rgba(255,45,120,0.35)]',
    glowViolet: 'shadow-[0_0_24px_rgba(168,85,247,0.35)]',
    glowCyan: 'shadow-[0_0_24px_rgba(6,182,212,0.35)]',
    card: 'shadow-[0_4px_24px_rgba(0,0,0,0.4)]',
    elev: 'shadow-[0_16px_48px_rgba(0,0,0,0.5),0_2px_8px_rgba(255,45,120,0.08)]',
  },
} as const;