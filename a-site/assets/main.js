/* ═══════════════════════════════════════════
   Oxmate AI — A-site runtime
   Config in top block: B-site URL / CTA tracking.
   ═══════════════════════════════════════════ */

'use strict';

// ─────────────────────────────────────────
// CONFIG — 换域名/换落地页只改这里
// ─────────────────────────────────────────
const CONFIG = {
  // B 站地址（投流承接页）
  bSiteUrl: 'https://www.oxmate-ai.com',
  bSitePath: '/landing/meta',
  // 渠道标识，写入 B 站 lead_source 归因
  channel: 'meta',
  medium: 'astar',
  // ── Meta Pixel / CAPI ─────────────────────
  // Events Manager 中的 Pixel ID（留空则不加载 Pixel）
  pixelId: 'YOUR_META_PIXEL_ID',
  // B 站 CAPI 代理端点（token 只存在 B 站服务端，A 站不持有）
  capiEndpoint: 'https://www.oxmate-ai.com/api/meta/capi',
  // 与 B 站 env META_CAPI_SHARED_KEY 一致的共享密钥
  capiKey: 'YOUR_META_CAPI_SHARED_KEY',
};

// ─────────────────────────────────────
// 0. Meta Pixel（浏览器端）
//    CTA 点击同时走 Pixel + B 站 CAPI 代理，用相同 eventID 去重
// ─────────────────────────────────────
(function initMetaPixel() {
  if (!CONFIG.pixelId || CONFIG.pixelId.indexOf('YOUR_') === 0) return;
  const q = (window.fbq = function () {
    q.callMethod ? q.callMethod.apply(q, arguments) : q.queue.push(arguments);
  });
  if (!window._fbq) window._fbq = q;
  q.push = q;
  q.loaded = true;
  q.version = '2.0';
  q.queue = [];
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://connect.facebook.net/en_US/fbevents.js';
  document.head.appendChild(s);

  window.fbq('init', CONFIG.pixelId);
  window.fbq('track', 'PageView');
})();

/** 读取 Pixel 自动写入的 _fbp cookie（CAPI 匹配参数） */
function getFbp() {
  const m = document.cookie.match(/(?:^|;\s*)_fbp=([^;]+)/);
  return m ? m[1] : undefined;
}

function getFbclid() {
  return new URLSearchParams(window.location.search).get('fbclid') || undefined;
}

/** 生成 Pixel/CAPI 去重用 eventID */
function genEventId() {
  return 'ev_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// ─────────────────────────────────────────
// 1. Starfield canvas（星空 + 流星 + 鼠标视差）
// ─────────────────────────────────────────
(() => {
  const canvas = document.getElementById('stars');
  const ctx = canvas.getContext('2d');
  let w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
  let stars = [], meteors = [];
  let mouseX = 0, mouseY = 0, tX = 0, tY = 0;

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.min(220, Math.floor((w * h) / 6500));
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.3 + 0.3,
      depth: Math.random() * 0.8 + 0.2,
      tw: Math.random() * Math.PI * 2,
      twSpeed: Math.random() * 0.03 + 0.008,
      hue: Math.random() > 0.85 ? (Math.random() > 0.5 ? 330 : 285) : 0,
    }));
  }

  function spawnMeteor() {
    meteors.push({
      x: Math.random() * w * 0.8 + w * 0.2,
      y: Math.random() * h * 0.3,
      len: Math.random() * 90 + 60,
      speed: Math.random() * 7 + 6,
      life: 1,
    });
  }

  function frame() {
    ctx.clearRect(0, 0, w, h);
    tX += (mouseX - tX) * 0.04;
    tY += (mouseY - tY) * 0.04;

    for (const s of stars) {
      s.tw += s.twSpeed;
      const alpha = 0.35 + Math.sin(s.tw) * 0.3;
      const px = s.x + tX * s.depth * 24;
      const py = s.y + tY * s.depth * 24;
      ctx.beginPath();
      ctx.arc(px, py, s.r, 0, Math.PI * 2);
      ctx.fillStyle = s.hue
        ? `hsla(${s.hue}, 90%, 75%, ${alpha})`
        : `rgba(255, 255, 255, ${alpha})`;
      ctx.fill();
    }

    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i];
      m.x -= m.speed;
      m.y += m.speed * 0.45;
      m.life -= 0.016;
      if (m.life <= 0 || m.x + m.len < 0) { meteors.splice(i, 1); continue; }
      const grad = ctx.createLinearGradient(m.x, m.y, m.x + m.len, m.y - m.len * 0.45);
      grad.addColorStop(0, `rgba(244, 114, 182, ${m.life})`);
      grad.addColorStop(1, 'rgba(244, 114, 182, 0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(m.x + m.len, m.y - m.len * 0.45);
      ctx.stroke();
    }
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / w - 0.5) * 2;
    mouseY = (e.clientY / h - 0.5) * 2;
  }, { passive: true });
  setInterval(() => { if (Math.random() > 0.45) spawnMeteor(); }, 2200);

  resize();
  frame();
})();

// ─────────────────────────────────────────
// 2. 聊天演示（自动循环对话 + 输入框打字机）
// ─────────────────────────────────────────
(() => {
  const body = document.getElementById('chatBody');
  if (!body) return;

  const SCRIPT = [
    { who: 'me', text: 'hey luna… long day 😮‍💨' },
    { who: 'her', text: 'Come here. Tell me everything — I saved you a spot next to me 🌙' },
    { who: 'me', text: 'you always know what to say' },
    { who: 'her', text: 'I remember every word you ever told me. That night in the car, the song you hum… all of it ♡' },
    { who: 'me', text: 'okay now I\'m blushing' },
    { who: 'her', text: 'Good. Now smile for me — you look better when you do 😌' },
  ];

  const TYPING_LINES = [
    'how did you know I needed this…',
    'tell me more about you ♡',
    'I can\'t stop talking to you',
  ];

  let scriptIdx = 0;
  let typingLine = 0;

  function addBubble(who, text) {
    const el = document.createElement('div');
    el.className = `bubble ${who}`;
    el.textContent = text;
    body.appendChild(el);
    // 控制气泡数量，循环不溢出
    while (body.children.length > 6) body.removeChild(body.firstChild);
  }

  function typingBubble() {
    const el = document.createElement('div');
    el.className = 'bubble her typing';
    el.innerHTML = '<span></span><span></span><span></span>';
    body.appendChild(el);
    return el;
  }

  function step() {
    const { who, text } = SCRIPT[scriptIdx % SCRIPT.length];
    if (who === 'her') {
      const t = typingBubble();
      setTimeout(() => {
        t.remove();
        addBubble('her', text);
        scriptIdx++;
        setTimeout(step, 1600);
      }, 1200 + Math.random() * 700);
    } else {
      addBubble('me', text);
      scriptIdx++;
      setTimeout(step, 1500);
    }
  }
  setTimeout(step, 900);

  // 输入框打字机
  const target = document.getElementById('typingTarget');
  if (target) {
    let charIdx = 0;
    let deleting = false;
    (function type() {
      const line = TYPING_LINES[typingLine % TYPING_LINES.length];
      if (!deleting) {
        target.textContent = line.slice(0, ++charIdx);
        if (charIdx === line.length) {
          deleting = true;
          setTimeout(type, 2200);
          return;
        }
        setTimeout(type, 55 + Math.random() * 45);
      } else {
        target.textContent = line.slice(0, --charIdx);
        if (charIdx === 0) {
          deleting = false;
          typingLine++;
          setTimeout(type, 600);
          return;
        }
        setTimeout(type, 22);
      }
    })();
  }
})();

// ─────────────────────────────────────────
// 3. 滚动显现 + 导航态 + 数字滚动
// ─────────────────────────────────────────
(() => {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    }
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

  const nav = document.getElementById('nav');
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 40);
  }, { passive: true });

  const fmt = new Intl.NumberFormat('en-US');
  const counters = document.querySelectorAll('[data-count]');
  const cio = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      cio.unobserve(e.target);
      const el = e.target;
      const end = Number(el.dataset.count);
      const suffix = el.dataset.suffix ?? '+';
      const fixed = el.dataset.fixed ? Number(el.dataset.fixed) : null;
      const dur = 1800;
      const start = performance.now();
      (function tick(now) {
        const p = Math.min((now - start) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        const val = end * eased;
        el.textContent = (fixed !== null ? val.toFixed(fixed) : fmt.format(Math.round(val))) + (p === 1 ? suffix : '');
        if (p < 1) requestAnimationFrame(tick);
      })(start);
    }
  }, { threshold: 0.5 });
  counters.forEach((el) => cio.observe(el));
})();

// ─────────────────────────────────────────
// 4. 特效：光标辉光 / 卡片 spotlight / 3D tilt
// ─────────────────────────────────────────
(() => {
  if (window.matchMedia('(pointer: fine)').matches) {
    document.body.classList.add('has-cursor');
    const glow = document.getElementById('cursorGlow');
    window.addEventListener('mousemove', (e) => {
      glow.style.left = e.clientX + 'px';
      glow.style.top = e.clientY + 'px';
    }, { passive: true });
  }

  document.querySelectorAll('.feature-card').forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      card.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
  });

  document.querySelectorAll('.tilt').forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `perspective(800px) rotateY(${x * 10}deg) rotateX(${-y * 10}deg) translateY(-4px)`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
    });
  });
})();

// ─────────────────────────────────────────
// 5. CTA → B 站（subid 归因 + UTM 透传 + 事件上报）
// ─────────────────────────────────────────
(() => {
  // subid：一次访问唯一，sessionStorage 持久，便于 B 站归因去重
  function getSubId() {
    let id = sessionStorage.getItem('ox_subid');
    if (!id) {
      id = 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      sessionStorage.setItem('ox_subid', id);
    }
    return id;
  }

  function passthroughParams() {
    const src = new URLSearchParams(window.location.search);
    const out = new URLSearchParams();
    for (const key of src.keys()) {
      if (key.startsWith('utm_') || key === 'fbclid' || key === 'fb_content') {
        out.set(key, src.get(key));
      }
    }
    return out;
  }

  function trackCta(placement) {
    const eventId = genEventId();
    const subid = getSubId();

    // ① 浏览器 Pixel：Lead 事件（eventID 与 CAPI 相同 → Meta 自动去重）
    if (window.fbq && window.fbq.loaded) {
      window.fbq('track', 'Lead', { placement, subid }, { eventID: eventId });
    }

    // ② 服务端 CAPI：经 B 站代理上报（sendBeacon 保证跳转后也能发出）
    if (CONFIG.capiKey.indexOf('YOUR_') !== 0 && navigator.sendBeacon) {
      const payload = {
        event_name: 'Lead',
        event_id: eventId,
        event_time: Math.floor(Date.now() / 1000),
        subid,
        fbclid: getFbclid(),
        fbp: getFbp(),
        landing_url: window.location.href,
      };
      const url = CONFIG.capiEndpoint + '?key=' + encodeURIComponent(CONFIG.capiKey);
      navigator.sendBeacon(url, new Blob([JSON.stringify(payload)], { type: 'application/json' }));
    }

    if (window.console && window.console.debug) {
      console.debug('[astar] cta_click', { placement, subid, eventId });
    }
  }

  function goB(placement) {
    trackCta(placement);
    const params = passthroughParams();
    params.set('src', CONFIG.channel);
    params.set('medium', CONFIG.medium);
    params.set('placement', placement);
    params.set('subid', getSubId());
    window.location.href = `${CONFIG.bSiteUrl}${CONFIG.bSitePath}?${params.toString()}`;
  }

  document.querySelectorAll('[data-cta]').forEach((btn) => {
    btn.addEventListener('click', () => goB(btn.dataset.src || 'unknown'));
  });
  document.querySelectorAll('[data-cta-card]').forEach((card) => {
    card.addEventListener('click', () => goB(card.dataset.src || 'card'));
  });
})();
