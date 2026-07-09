/**
 * SoulMate9 — GoLove AI Visual Specification
 *
 * Brand: 粉紫对角渐变 (137.55deg #D05BF8 → #FF18A0)
 * Surface: 深色基底 + 药丸按钮 + 玻璃发光
 * Voice: Your fantasy. Your rules. No limits.
 */

export const DESIGN_TOKENS = {
  colors: {
    // Background
    void: '#04020C',
    bg: '#0F0E0F',
    bgDeep: '#04020C',
    card: '#0B0B0B',
    elevated: '#141414',
    surface: '#1A1A1A',
    borderSubtle: '#2A2A2A',

    // Brand — Pink + Violet
    pink: '#FF18A0',
    pinkDeep: '#E81B9D',
    magenta: '#E81B9D',
    purple: '#D05BF8',
    violet: '#805BF8',
    purpleDeep: '#8313E4',

    // Accent
    success: '#35F692',
    danger: '#E61F5E',
    warn: '#EAE71F',

    // Text
    text: '#FAF7FF', // 微紫白 (key!)
    textSecondary: 'rgba(255,255,255,0.7)',
    textMuted: '#9CA3AF',
    textDim: 'rgba(255,255,255,0.4)',
  },

  // Gradients — purple top-left → pink bottom-right
  gradients: {
    primary: 'linear-gradient(137.55deg, #D05BF8 16.35%, #FF18A0 83.31%)',
    primary135: 'linear-gradient(135deg, #D05BF8, #FF18A0)',
    primaryTricolor: 'linear-gradient(135deg, #E081C3, #FF18A0, #D05BF8)',
    vertical: 'linear-gradient(#8313E4, #FF18A0)',
    soft: 'linear-gradient(135deg, rgba(208,91,248,0.08), rgba(255,24,160,0.08))',
    glowBorder: 'linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04) 44%, rgba(255,24,160,0.12))',
    cardOverlay: 'linear-gradient(180deg, rgba(208,91,248,0) 56.76%, #E81B9D 100%)',
    darkBackdrop: 'radial-gradient(ellipse at top, rgba(208,91,248,0.15), transparent 60%), radial-gradient(ellipse at bottom right, rgba(255,24,160,0.10), transparent 60%), linear-gradient(180deg, #0F0E0F 0%, #04020C 100%)',
  },

  // Glow / shadow
  glow: {
    pink: '0 0 24px rgba(255, 24, 160, 0.40)',
    pinkStrong: '0 0 40px rgba(255, 24, 160, 0.55)',
    purple: '0 0 24px rgba(208, 91, 248, 0.40)',
    combined: '0 0 24px rgba(255, 24, 160, 0.40), 0 0 48px rgba(208, 91, 248, 0.25)',
  },
  shadow: {
    sm: '0 3px 3px rgba(0,0,0,0.12)',
    md: '0 4px 4px rgba(0,0,0,0.15)',
    lg: '0 8px 24px rgba(0,0,0,0.4)',
  },

  // Shape — pills dominate!
  radius: {
    pill: '9999px',
    card: '16px',
    panel: '24px',
    hero: '32px',
  },

  // Typography — Poppins
  fontFamily: {
    sans: "'Poppins', ui-sans-serif, system-ui, sans-serif",
    display: "'Poppins', sans-serif",
    heading: "'Poppins', sans-serif",
    mono: "'Space Grotesk', ui-monospace, monospace",
  },

  // Spacing scale
  spacing: {
    panel: 'p-5 sm:p-6',
    section: 'py-12 sm:py-20',
    container: 'mx-auto max-w-7xl px-4 sm:px-6 lg:px-8',
  },
} as const;

// Helper: combine brand gradient into CSS background
export const brandGrad = `linear-gradient(137.55deg, #D05BF8 16.35%, #FF18A0 83.31%)`;
export const brandGlow = '0 0 24px rgba(255, 24, 160, 0.40)';