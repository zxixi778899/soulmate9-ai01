'use client';

/**
 * 离线降级页
 *
 * 当 SW 检测到 network-first 请求失败且无缓存时显示。
 * 不替代主 UI，只是兜底。
 */

export default function OfflineFallback() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        textAlign: 'center',
        background: 'var(--bg, #07070F)',
        color: 'var(--fg, #ffffff)',
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 16 }}>📡</div>
      <h1 style={{ fontSize: 24, marginBottom: 8, fontWeight: 600 }}>You&rsquo;re offline</h1>
      <p style={{ color: '#9ca3af', maxWidth: 360, lineHeight: 1.5 }}>
        SoulMate needs an internet connection to chat, but your saved companions are still
        available.
      </p>
      <button
        onClick={() => location.reload()}
        style={{
          marginTop: 24,
          padding: '12px 24px',
          background: '#ec4899',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Try again
      </button>
    </div>
  );
}
