/* Escenas pixel art generadas por código (sin imágenes). Cada escena tiene:
   - build(): capas estáticas (fondo y primer plano), se pintan una vez y se cachean
   - tick(): animación entre fondo y primer plano (p. ej. peces bajo los nenúfares)
   - top():  animación por encima de todo (luciérnagas, lluvia…)
   Todo se dibuja en un lienzo de 224×100 y se escala con image-rendering: pixelated. */
(function () {
  'use strict';
  const W = 224, H = 100;
  const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function mk() { const c = document.createElement('canvas'); c.width = W; c.height = H; return [c, c.getContext('2d')]; }
  const P = (c, x, y, col, w = 1, h = 1) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); };
  const pick = (R, arr) => arr[(R() * arr.length) | 0];

  // degradado vertical con tramado ordenado (aspecto pixel art)
  function grad(c, stops, y0 = 0, h = H, x0 = 0, w = W) {
    const n = stops.length - 1;
    for (let y = 0; y < h; y++) {
      const p = h <= 1 ? 0 : (y / (h - 1)) * n;
      const i = Math.min(n - 1, Math.floor(p));
      const f = p - i;
      for (let x = 0; x < w; x++) {
        c.fillStyle = f * 16 > BAYER[(y0 + y) & 3][(x0 + x) & 3] + 0.5 ? stops[i + 1] : stops[i];
        c.fillRect(x0 + x, y0 + y, 1, 1);
      }
    }
  }
  function disc(c, cx, cy, r, col) {
    cx = Math.round(cx); cy = Math.round(cy); r = Math.round(r);
    for (let y = -r; y <= r; y++) {
      const half = Math.floor(Math.sqrt(Math.max(0, r * r + r * 0.6 - y * y)));
      if (half >= 0) P(c, cx - half, cy + y, col, half * 2 + 1, 1);
    }
  }
  function ridgeY(x, base, amp, s, f, sharp) {
    let v;
    if (sharp) v = 1 - Math.abs(Math.sin(x * f + s)) * 1.4 + Math.sin(x * f * 3.7 + s) * 0.15;
    else v = Math.sin(x * f + s) * 0.6 + Math.sin(x * f * 2.3 + s * 1.7) * 0.3 + Math.sin(x * f * 5.1 + s * 0.3) * 0.1;
    return Math.round(base - amp * v);
  }
  function ridge(c, base, amp, s, col, f = 0.05, sharp = false, cap = null) {
    const ys = [];
    for (let x = 0; x < W; x++) {
      const y = ridgeY(x, base, amp, s, f, sharp);
      ys.push(y);
      P(c, x, y, col, 1, H - y);
      if (cap && y < base - amp * 0.5) P(c, x, y, cap, 1, 2 + ((x * 7) % 3 === 0 ? 1 : 0));
    }
    return ys;
  }
  function pine(c, x, by, h, col) {
    for (let i = 0; i < h; i++) {
      const w = Math.max(0, Math.floor(i * 0.36) - (i % 4 === 3 ? 1 : 0));
      P(c, x - w, by - h + i, col, 2 * w + 1, 1);
    }
    P(c, x, by, col, 1, 3);
  }
  function starsInit(R, n, maxY) { const s = []; for (let i = 0; i < n; i++) s.push([(R() * W) | 0, (R() * maxY) | 0, R()]); return s; }
  function drawStars(c, stars) { for (const [x, y, b] of stars) P(c, x, y, b > 0.85 ? '#ffffff' : b > 0.5 ? '#aab8ec' : '#5e6aa8'); }
  function twinkle(c, stars, t) {
    for (let i = 0; i < stars.length; i += 4) {
      const [x, y] = stars[i];
      const v = Math.sin(t * 2.2 + i * 1.7);
      if (v > 0.6) P(c, x, y, '#ffffff');
      else if (v < -0.6) P(c, x, y, '#2a2f5a');
    }
  }
  function glow(c, x, y, r, col, a) {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = a; c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); c.globalAlpha = 1;
  }
  function birds(c, t, n, y0, col) {
    for (let i = 0; i < n; i++) {
      const x = ((t * (7 + i) + i * 61) % (W + 30)) - 15;
      const y = y0 + i * 5 + Math.sin(t * 1.6 + i) * 2;
      const up = Math.floor(t * 4 + i) % 2;
      P(c, x - 2, y - up, col); P(c, x - 1, y, col); P(c, x, y + 1, col); P(c, x + 1, y, col); P(c, x + 2, y - up, col);
    }
  }
  function cloud(c, x, y, s, col) {
    disc(c, x, y, 3 * s, col); disc(c, x + 5 * s, y - 2 * s, 4 * s, col); disc(c, x + 11 * s, y, 3 * s, col);
    P(c, x - 3 * s, y + 1, col, 17 * s, 3 * s);
  }

  const SCENES = {
    // ---------------- Tareas: noche tranquila ----------------
    noche: {
      init: R => ({ stars: starsInit(R, 80, 60) }),
      build(b, f, R, st) {
        grad(b, ['#090e2a', '#121842', '#1f2456', '#33306c', '#4d3b74'], 0, 72);
        drawStars(b, st.stars);
        glow(b, 176, 18, 26, 'rgba(240,230,200,.35)', 1);
        disc(b, 176, 18, 7, '#f3ead0'); P(b, 173, 15, '#dcd1ad', 2, 2); P(b, 178, 21, '#dcd1ad', 2, 1); P(b, 180, 16, '#e4dab8', 1, 1);
        ridge(b, 66, 6, 1.3, '#232c56', 0.04);
        ridge(b, 74, 5, 2.6, '#18213f', 0.05);
        const ys = ridge(f, 82, 5, 4.1, '#0f1730', 0.035);
        const hx = 46, gy = Math.max(...ys.slice(hx - 1, hx + 18)) + 1;
        P(f, hx, gy - 10, '#0c1326', 16, 10);
        for (let i = 0; i < 7; i++) P(f, hx - 1 + i, gy - 11 - i, '#0a101f', 18 - 2 * i, 1);
        P(f, hx + 11, gy - 17, '#0a101f', 2, 4);
        st.win = [[hx + 3, gy - 7], [hx + 10, gy - 7]];
        for (const [x, y] of st.win) P(f, x, y, '#ffcf70', 3, 3);
        P(f, hx + 7, gy - 5, '#1b2238', 2, 5);
        for (let k = 0; k < 7; k++) { const x = 8 + k * 5 + ((R() * 3) | 0); pine(f, x, ys[x] + 1, 8 + ((R() * 9) | 0), '#0a1122'); }
        for (let k = 0; k < 5; k++) { const x = 120 + k * 18 + ((R() * 8) | 0); pine(f, x, ys[x] + 1, 6 + ((R() * 7) | 0), '#0a1122'); }
        for (let i = 0; i < 160; i++) P(f, R() * W, 92 + R() * 8, pick(R, ['#0a1020', '#0d1528', '#111b30']), 1, 2);
      },
      top(c, t, st) {
        twinkle(c, st.stars, t);
        const ph = (t % 9) / 9;
        if (ph < 0.1) {
          const k = ph / 0.1, x = 40 + k * 100, y = 6 + k * 24;
          for (let i = 0; i < 7; i++) P(c, x - i * 2, y - i * 0.5, i < 2 ? '#ffffff' : i < 4 ? '#c8d0ff' : '#6a72b8');
        }
        if (st.win) for (const [x, y] of st.win) glow(c, x + 1.5, y + 1.5, 9, 'rgba(255,200,110,.9)', 0.18 + 0.05 * Math.sin(t * 5 + x));
      },
    },

    // ---------------- Contenido: estanque con kois ----------------
    estanque: {
      build(b, f, R) {
        grad(b, ['#0b1f2e', '#0e2737', '#113049', '#0d2536'], 0, H);
        for (let i = 0; i < 300; i++) P(b, R() * W, R() * H, R() < 0.5 ? '#0a1c29' : '#16405a', 1 + ((R() * 3) | 0), 1);
        for (let k = 0; k < 16; k++) {
          let x = R() * W, y = R() * H, a = R() * 6.28;
          const col = R() < 0.5 ? '#4a1a26' : '#5c2230';
          for (let s = 0; s < 46; s++) { a += (R() - 0.5) * 0.7; x += Math.cos(a); y += Math.sin(a) * 0.8; P(b, x, y, col); }
        }
        for (let i = 0; i < 12; i++) P(b, R() * W, R() * H, '#b8343a', 3, 1);
        const greens = ['#1c8638', '#26a244', '#32bd53', '#15682b', '#3bd15e'];
        for (let i = 0; i < 70; i++) {
          const x = (150 + R() * 74) | 0, top = (4 + R() * 40) | 0, bot = top + 14 + ((R() * 30) | 0), col = pick(R, greens);
          for (let y = top; y < bot; y++) P(f, x + Math.round(Math.sin(y * 0.15 + i) * 0.6), y, col);
        }
        for (let i = 0; i < 34; i++) P(f, 152 + R() * 70, 4 + R() * 38, R() < 0.5 ? '#2f6bff' : '#4d8dff', 2, 2);
        for (let i = 0; i < 44; i++) {
          const cx = R() * W, cy = R() * H;
          if (cx > 95 && cx < 150 && cy > 30 && cy < 70 && R() < 0.75) continue;
          const r = 2 + ((R() * 5) | 0), col = pick(R, greens);
          disc(f, cx, cy, r, col);
          P(f, cx - r / 2, cy - r / 2, '#56e07a', 2, 1);
          for (let k = 1; k <= r; k++) P(f, cx + k, cy + k * 0.3, '#0e2737');
          if (R() < 0.3) { P(f, cx - 1, cy - 1, '#f4f7f0', 3, 3); P(f, cx - 2, cy, '#f4f7f0', 5, 1); P(f, cx, cy - 2, '#f4f7f0', 1, 5); P(f, cx, cy, '#f6d96a'); }
        }
      },
      tick(c, t) {
        const fish = [
          { cx: 92, cy: 48, ax: 60, ay: 24, w: 0.16, ph: 0, pal: ['#f2eee6', '#d8382c'] },
          { cx: 110, cy: 56, ax: 72, ay: 20, w: 0.12, ph: 2.1, pal: ['#e8a028', '#f6c45a'] },
          { cx: 84, cy: 40, ax: 50, ay: 26, w: 0.2, ph: 4.2, pal: ['#d43a2c', '#f2eee6'] },
        ];
        const prof = [1, 2, 2.5, 3, 3.5, 3.5, 3.5, 3, 3, 2.5, 2, 1.5, 1, 1, 0.5, 0.5];
        for (const F of fish) {
          const T = t * F.w + F.ph;
          const x = F.cx + F.ax * Math.sin(T), y = F.cy + F.ay * Math.sin(T * 1.7);
          let dx = F.ax * Math.cos(T), dy = F.ay * 1.7 * Math.cos(T * 1.7);
          const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
          const nx = -dy, ny = dx, len = prof.length + 4;
          for (let k = 0; k < len; k += 0.5) {
            const wig = Math.sin(t * 7 - k * 0.5) * (k / len) * 1.6;
            const px = x - dx * k + nx * wig, py = y - dy * k + ny * wig;
            const tail = k >= prof.length;
            const w = tail ? (k - prof.length) * 0.9 + 0.5 : prof[Math.floor(k)];
            for (let j = -w; j <= w; j += 0.5) {
              if (tail && Math.abs(j) < w - 1.2) continue;
              const patch = Math.sin(k * 0.8 + F.ph * 3) * Math.cos(j * 1.2 + k * 0.35) > 0.15;
              P(c, px + nx * j, py + ny * j, tail ? F.pal[1] : patch ? F.pal[1] : F.pal[0]);
            }
          }
          P(c, x - dx * 2 + nx * 1.5, y - dy * 2 + ny * 1.5, '#101418');
          P(c, x - dx * 2 - nx * 1.5, y - dy * 2 - ny * 1.5, '#101418');
        }
        for (let i = 0; i < 3; i++) {
          const per = 4 + i, ph = ((t + i * 1.7) % per) / per;
          const cx = (i * 67 + Math.floor((t + i * 1.7) / per) * 41) % 140 + 10, cy = (i * 29 + Math.floor((t + i) / per) * 23) % 80 + 10;
          const r = ph * 10;
          if (ph < 0.9) for (let a = 0; a < 6.28; a += 0.3) P(c, cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.6, ph < 0.5 ? '#2f6a88' : '#1f4a62');
        }
      },
    },

    // ---------------- Formación: bosque con niebla ----------------
    bosque: {
      build(b, f, R) {
        grad(b, ['#163a4a', '#1f5466', '#2c707c', '#4c9694', '#76b6aa'], 0, H);
        for (let i = 0; i < 26; i++) P(b, R() * W, 0, '#4e8d8f', 2 + ((R() * 2) | 0), H);
        b.globalAlpha = 0.08;
        for (let i = 0; i < 5; i++) { const x0 = 10 + R() * 190; for (let y = 0; y < H; y++) P(b, x0 + y * 0.45, y, '#eafff4', 7, 1); }
        b.globalAlpha = 1;
        for (let i = 0; i < 10; i++) { const x = (R() * W) | 0, w = 3 + ((R() * 3) | 0); P(b, x, 0, '#2a5c62', w, H); P(b, x, 0, '#376e74', 1, H); }
        b.globalAlpha = 0.28; P(b, 0, 66, '#b4e0d4', W, 3); P(b, 0, 70, '#b4e0d4', W, 5); b.globalAlpha = 1;
        ridge(f, 88, 3, 2, '#14383c', 0.06);
        for (const [x, w] of [[4, 11], [64, 7], [190, 13], [140, 6]]) {
          P(f, x, 0, '#0f282d', w, H); P(f, x + 1, 0, '#1b3d42', 1, H);
          P(f, x - 3, H - 7, '#0f282d', w + 6, 7); P(f, x - 5, H - 3, '#0f282d', w + 10, 3);
        }
        for (let i = 0; i < 46; i++) { const x = (R() * W) | 0, l = 4 + ((R() * 18) | 0); for (let y = 0; y < l; y++) P(f, x + Math.round(Math.sin(y * 0.4 + i) * 0.5), y, R() < 0.5 ? '#5f9e88' : '#4a8a76'); }
        for (let i = 0; i < 160; i++) P(f, R() * W, 86 + R() * 14, pick(R, ['#1f5a4a', '#2a6e58', '#184838', '#348066']), 1 + ((R() * 3) | 0), 1);
      },
      tick(c, t) {
        for (let i = 0; i < 34; i++) {
          const x = (i * 53 + Math.sin(t * 0.5 + i) * 6 + 400) % W;
          const y = H - ((t * (3 + (i % 3)) + i * 17) % (H + 10));
          P(c, x, y, i % 3 ? '#d8f6e4' : '#fff6c8');
        }
      },
    },

    // ---------------- Aprender: montañas al amanecer ----------------
    montanas: {
      build(b, f, R) {
        grad(b, ['#241e4a', '#463264', '#8a4e78', '#d47478', '#f2a682', '#f8cc96'], 0, 76);
        disc(b, 112, 62, 12, '#ffe2aa'); disc(b, 112, 62, 9, '#fff1cc');
        ridge(f, 58, 22, 1.1, '#8a6a9c', 0.045, true, '#efe2f2');
        ridge(f, 70, 15, 3.3, '#5c4680', 0.06, true, '#8e78aa');
        const ys = ridge(f, 84, 7, 5.2, '#33285a', 0.05);
        for (let k = 0; k < 26; k++) { const x = (R() * W) | 0; pine(f, x, ys[x] + 2, 5 + ((R() * 8) | 0), '#1c1638'); }
        P(f, 0, 94, '#16112c', W, 6);
      },
      tick(c, t) {
        for (let i = 0; i < 4; i++) {
          const x = ((t * (1.5 + i * 0.4) + i * 70) % (W + 50)) - 30;
          cloud(c, x, 14 + i * 8, 1, i % 2 ? '#f4c2b0' : '#e8a8a8');
        }
      },
      top(c, t) { birds(c, t, 3, 24, '#2a1f3a'); },
    },

    // ---------------- Ventas: pradera con farol ----------------
    pradera: {
      build(b, f, R) {
        grad(b, ['#13301f', '#1a3e27', '#21502f'], 0, 64);
        grad(b, ['#7cc4e4', '#a8dcf0', '#c8ecf8'], 0, 54, 142, 32);
        P(b, 136, 50, '#4f88a8', 44, 8);
        const g = ['#164a2a', '#1f5a33', '#2a6e3e', '#367f48', '#0f3820', '#4a8f50'];
        for (let i = 0; i < 160; i++) {
          const x = R() * W, y = R() * 50, r = 2 + ((R() * 5) | 0);
          if (x + r > 138 && x - r < 178) continue;
          disc(b, x, y, r, pick(R, g)); P(b, x - r / 2, y - r / 2, '#5aa860', 2, 1);
        }
        for (let i = 0; i < 6; i++) disc(b, 132 + R() * 56, 52 + R() * 6, 2 + R() * 3, '#4a5a68');
        P(f, 0, 76, '#1f6f2e', W, 24);
        const gg = ['#1f6f2e', '#2f8f3a', '#46b04a', '#5cc456', '#185a26', '#3a9f40'];
        for (let i = 0; i < 1100; i++) { const x = (R() * W) | 0, y = (54 + R() * 34 + Math.sin(x * 0.05) * 3) | 0; P(f, x, y, pick(R, gg), 1, 4 + ((R() * 10) | 0)); }
        for (let i = 0; i < 80; i++) { const x = R() * W, y = 58 + R() * 40; const col = R() < 0.7 ? '#f2c230' : '#e8803a'; P(f, x, y, col, 2, 2); P(f, x + 1, y + 1, '#9a5a10'); }
        const lx = 84, ly = 50;
        P(f, lx + 2, ly - 4, '#2a2420', 3, 1); P(f, lx + 1, ly - 3, '#2a2420', 1, 2); P(f, lx + 5, ly - 3, '#2a2420', 1, 2);
        P(f, lx - 1, ly - 1, '#3a302a', 9, 2); P(f, lx, ly + 1, '#2a2522', 7, 10); P(f, lx + 1, ly + 2, '#ffcf66', 5, 7);
        P(f, lx + 3, ly + 2, '#2a2522', 1, 7); P(f, lx - 1, ly + 11, '#3a302a', 9, 2);
      },
      tick(c, t) {
        for (let i = 0; i < 16; i++) { const x = 143 + ((i * 2.3) % 30); const y = ((t * 32 + i * 13) % 62) - 8; P(c, x, y, '#f2fbff', 1, 5); }
      },
      top(c, t) {
        glow(c, 87.5, 56, 26, 'rgba(255,205,110,1)', 0.16 + 0.05 * Math.sin(t * 9) * Math.sin(t * 3.1));
        for (let i = 0; i < 16; i++) {
          const x = (i * 37 + t * 4 * ((i % 3) + 1)) % W, y = 34 + 22 * Math.sin(t * 0.6 + i * 1.3);
          if (Math.sin(t * 2 + i * 2.1) > -0.2) { glow(c, x, y, 3, 'rgba(230,240,120,1)', 0.35); P(c, x, y, '#fff6a8'); }
        }
      },
    },

    // ---------------- Bandeja: mar de noche con faro ----------------
    mar: {
      init: R => ({ stars: starsInit(R, 50, 50) }),
      build(b, f, R, st) {
        grad(b, ['#071426', '#0c2240', '#163a5c', '#2a5a78'], 0, 58);
        drawStars(b, st.stars);
        glow(b, 50, 18, 22, 'rgba(240,235,210,.35)', 1);
        disc(b, 50, 18, 6, '#f2ecd0'); P(b, 48, 16, '#d8d0b0', 2, 2);
        grad(b, ['#173e58', '#0f2c44', '#0a2034', '#071828'], 58, 42);
        P(b, 0, 58, '#4a7a90', W, 1);
        for (let x = 150; x < W; x++) { const y = Math.round(54 - Math.sin(((x - 150) / 74) * Math.PI) * 6 - (x > 175 && x < 196 ? 3 : 0)); P(f, x, y, '#081420', 1, 66 - y); }
        for (let y = 26; y < 48; y++) { const w = 4 + Math.floor((y - 26) / 8); P(f, 186 - Math.floor(w / 2), y, ((y >> 2) & 1) ? '#c8423a' : '#e8e2d8', w, 1); }
        P(f, 183, 21, '#2a2a3a', 7, 1); P(f, 184, 22, '#ffe08a', 5, 4); P(f, 183, 26, '#2a2a3a', 7, 1); P(f, 185, 19, '#2a2a3a', 3, 2);
        for (let i = 0; i < 5; i++) disc(f, 6 + i * 9 + R() * 4, 96 + R() * 3, 4 + R() * 4, '#06121c');
      },
      tick(c, t) {
        for (let y = 60; y < 100; y += 2) {
          const w = 3 + Math.round((Math.sin(t * 3 + y) + 1) * 2) + (100 - y) / 10;
          c.globalAlpha = 0.35 + (100 - y) / 100;
          P(c, 50 - w / 2 + Math.sin(t * 2 + y * 0.5) * 2, y, '#e2dab0', w, 1);
        }
        c.globalAlpha = 1;
        for (let i = 0; i < 44; i++) { const x = (i * 29 + t * (4 + (i % 3) * 2)) % (W + 10) - 5, y = 61 + ((i * 7) % 38); P(c, x, y, i % 4 ? '#2c6282' : '#4a88a6', 3 + (i % 4), 1); }
      },
      top(c, t) {
        const a = t * 0.9, s = Math.cos(a);
        if (s < 0.2) {
          c.globalAlpha = 0.14 * Math.min(1, (0.2 - s) * 3); c.fillStyle = '#fff2b0';
          c.beginPath(); c.moveTo(186.5, 24); c.lineTo(186.5 + Math.cos(a) * 200 - 0, 24 + Math.sin(a) * 30 - 6); c.lineTo(186.5 + Math.cos(a) * 200, 24 + Math.sin(a) * 30 + 6); c.closePath(); c.fill();
          c.globalAlpha = 1;
        }
        glow(c, 186.5, 24, 8, 'rgba(255,230,140,1)', 0.35 + 0.15 * Math.sin(t * 4));
      },
    },

    // ---------------- Finanzas: atardecer ----------------
    atardecer: {
      build(b, f) {
        grad(b, ['#2a1640', '#5a2458', '#a83a5a', '#e4604a', '#f49a48', '#f8cc6a'], 0, 70);
        disc(b, 112, 60, 18, '#ffe9a8');
        for (let k = 1; k < 6; k++) P(b, 92, 60 + k * 3, '#ee7a4e', 41, 1 + (k > 2 ? 1 : 0));
        ridge(f, 68, 4, 1, '#7a2a52', 0.03);
        ridge(f, 78, 6, 2.2, '#541d46', 0.04);
        ridge(f, 90, 5, 3.4, '#2e1030', 0.05);
        for (const [x, h] of [[30, 12], [168, 16], [200, 9]]) { P(f, x, 90 - h, '#1e0a22', 3, h); P(f, x - 3, 90 - h + 4, '#1e0a22', 3, 2); P(f, x - 3, 90 - h + 1, '#1e0a22', 1, 4); P(f, x + 3, 90 - h + 6, '#1e0a22', 3, 2); P(f, x + 5, 90 - h + 3, '#1e0a22', 1, 4); }
      },
      tick(c, t) {
        for (let i = 0; i < 5; i++) {
          const x = ((t * (2 + i * 0.5) + i * 60) % (W + 40)) - 30, y = 12 + i * 7;
          P(c, x, y, '#d8708a', 22, 2); P(c, x + 5, y - 1, '#e88a96', 12, 1); P(c, x + 2, y + 2, '#b85a7e', 16, 1);
        }
      },
      top(c, t) { birds(c, t, 4, 20, '#3a1430'); },
    },

    // ---------------- La IA: aurora ----------------
    aurora: {
      init: R => ({ stars: starsInit(R, 90, 70) }),
      build(b, f, R, st) {
        grad(b, ['#040816', '#081230', '#0c1a3e', '#12264c'], 0, H);
        drawStars(b, st.stars);
        ridge(f, 72, 14, 0.7, '#0a1226', 0.05, true, '#1c2a48');
        const ys = ridge(f, 88, 3, 2.4, '#060c18', 0.06);
        for (let k = 0; k < 40; k++) { const x = (R() * W) | 0; pine(f, x, ys[x] + 2, 6 + ((R() * 12) | 0), '#050a14'); }
      },
      tick(c, t) {
        for (let x = 0; x < W; x++) {
          const yc = 24 + 8 * Math.sin(x * 0.045 + t * 0.5) + 4 * Math.sin(x * 0.11 - t * 0.8);
          const h = 14 + 7 * Math.sin(x * 0.07 + t * 0.3);
          const col = x > 150 + 20 * Math.sin(t * 0.2) ? '#7a5ae0' : x % 7 === 0 ? '#6ae0b8' : '#2fc88a';
          const curtain = 0.55 + 0.45 * Math.sin(x * 0.3 + t * 1.3) * Math.sin(x * 0.13 - t * 0.4);
          for (let k = 0; k < h; k++) {
            const a = Math.pow(1 - k / h, 1.6) * 16 * curtain;
            if (BAYER[k & 3][x & 3] < a * 0.5) P(c, x, yc + k, k < 1 ? '#b8ffe0' : col);
          }
        }
      },
      top(c, t, st) { twinkle(c, st.stars, t); },
    },

    // ---------------- Decidir: ciudad bajo la lluvia ----------------
    lluvia: {
      build(b, f, R) {
        grad(b, ['#141528', '#1c1f38', '#262948', '#32355a'], 0, H);
        for (let x = 0; x < W;) { const w = 8 + ((R() * 14) | 0), h = 30 + ((R() * 34) | 0); P(b, x, H - h, '#20223c', w, h); for (let i = 0; i < 6; i++) P(b, x + 2 + R() * (w - 4), H - h + 3 + R() * (h - 6), '#3a3c62', 1, 1); x += w + 1; }
        for (let x = -4; x < W;) {
          const w = 12 + ((R() * 18) | 0), h = 22 + ((R() * 40) | 0);
          P(f, x, H - h, '#0e0f1e', w, h);
          if (R() < 0.4) P(f, x + (w >> 1), H - h - 6, '#0e0f1e', 1, 6);
          for (let yy = H - h + 3; yy < H - 4; yy += 4) for (let xx = x + 2; xx < x + w - 2; xx += 3) {
            const r = R(); if (r < 0.32) P(f, xx, yy, r < 0.04 ? '#7fd0ff' : '#ffcf6a', 2, 2);
          }
          x += w + 2;
        }
      },
      top(c, t) {
        c.globalAlpha = 0.55;
        for (let i = 0; i < 110; i++) {
          const y = ((t * 95 + i * 23.7) % (H + 12)) - 8, x = ((i * 41.3) % (W + 30)) - y * 0.28;
          P(c, x, y, '#9aa8d8', 1, 3);
        }
        c.globalAlpha = 1;
        const ph = t % 11;
        if (ph < 0.12 || (ph > 0.24 && ph < 0.3)) { c.globalAlpha = 0.16; P(c, 0, 0, '#dfe6ff', W, H); c.globalAlpha = 1; }
      },
    },

    // ---------------- Aprendido: cueva de cristales ----------------
    cristales: {
      init(R) {
        const pals = [['#7a5af0', '#b8a8ff'], ['#46c8f0', '#b0f0ff'], ['#e06ac8', '#ffc0ee'], ['#5ae0b0', '#c0ffe8']];
        const cr = [];
        for (let i = 0; i < 13; i++) cr.push({ x: 10 + i * 16 + R() * 8, base: 86 + R() * 8, h: 16 + R() * 34, w: 4 + R() * 6, pal: pick(R, pals), lean: (R() - 0.5) * 0.4 });
        return { cr, sp: starsInit(R, 16, 80) };
      },
      build(b, f, R, st) {
        grad(b, ['#0d0a1a', '#161228', '#1f1838', '#140f24'], 0, H);
        for (let i = 0; i < 40; i++) disc(b, R() * W, R() * H, 3 + R() * 8, pick(R, ['#191430', '#120e22', '#1d1736']));
        for (let x = 0; x < W; x++) { const y = 8 + Math.round(6 * Math.sin(x * 0.07) + 3 * Math.sin(x * 0.21)); P(b, x, 0, '#0a0814', 1, y); if (x % 9 === 0) P(b, x, y, '#0a0814', 1, 3 + (x % 5)); }
        ridge(f, 90, 4, 1.7, '#0b0918', 0.05);
        for (const k of st.cr) {
          for (let i = 0; i < k.h; i++) {
            const w = Math.max(1, Math.round(k.w * Math.pow(1 - i / k.h, 0.6)));
            const x = k.x + k.lean * i - w / 2;
            P(f, x, k.base - i, k.pal[0], w, 1);
            P(f, x, k.base - i, k.pal[1], 1, 1);
          }
        }
      },
      top(c, t, st) {
        st.cr.forEach((k, i) => glow(c, k.x + k.lean * k.h * 0.5, k.base - k.h * 0.45, k.h * 0.9, k.pal[0], 0.1 + 0.07 * Math.sin(t * 1.4 + i)));
        st.sp.forEach(([x, y], i) => { if (Math.sin(t * 2.5 + i * 2.3) > 0.7) { P(c, x, y, '#ffffff'); P(c, x - 1, y, '#a898ff'); P(c, x + 1, y, '#a898ff'); P(c, x, y - 1, '#a898ff'); P(c, x, y + 1, '#a898ff'); } });
      },
    },
  };

  // ---------------- LeAn3D: taller con impresora 3D (colores del AMS) ----------------
  SCENES.taller = {
    init: () => ({ ams: ['#f4ee2a', '#6f5034', '#f55a74', '#a4aaac'] }),
    build(b, f, R, st) {
      grad(b, ['#15131d', '#1b1826', '#221d2e', '#2a2236'], 0, 78);
      for (let y = 8; y < 74; y += 5) for (let x = 6 + (y % 10 ? 2 : 0); x < 70; x += 5) P(b, x, y, '#2c2638');
      // estante con piezas impresas
      P(b, 150, 24, '#4a3526', 68, 3); P(b, 150, 27, '#2e2118', 68, 1);
      [[154, 6, 8], [164, 4, 12], [172, 7, 6], [183, 5, 10], [192, 6, 7], [202, 4, 13], [209, 6, 9]].forEach(([x, w, h], i) => {
        const c = st.ams[i % 4]; P(b, x, 24 - h, c, w, h); P(b, x, 24 - h, '#ffffff22', 1, h);
      });
      P(b, 150, 50, '#4a3526', 68, 3); P(b, 150, 53, '#2e2118', 68, 1);
      // AMS lite: 4 bobinas
      st.ams.forEach((c, i) => { const x = 158 + i * 15; disc(b, x, 42, 6, '#2a2a30'); disc(b, x, 42, 5, c); disc(b, x, 42, 2, '#1a1a20'); P(b, x - 1, 36, '#ffffff55', 2, 1); });
      P(b, 152, 48, '#d8dade', 60, 2);
      // mesa
      P(b, 0, 78, '#4a3526', W, 3); P(b, 0, 81, '#2a1e16', W, H - 81);
      for (let x = 0; x < W; x += 9) P(b, x, 81, '#22180f', 1, H - 81);
      // impresora (tipo A1): base, columna y cama
      P(b, 64, 70, '#d9dbe0', 74, 8); P(b, 64, 77, '#a9acb3', 74, 1);
      P(b, 70, 72, '#1c1f26', 10, 4); P(b, 71, 73, '#7fd6a4', 3, 1); P(b, 75, 73, '#7fd6a4', 4, 1);
      P(b, 134, 14, '#2b2e35', 5, 56); P(b, 135, 14, '#3e424b', 1, 56); P(b, 131, 12, '#d9dbe0', 11, 3);
      P(b, 76, 66, '#3a3e47', 52, 3); P(b, 76, 66, '#5a5f6b', 52, 1);
      // cable de filamento
      for (let k = 0; k < 40; k++) P(b, 150 - k * 0.6, 40 - Math.sin(k / 12) * 18, '#8a8f99');
      for (let i = 0; i < 70; i++) P(b, R() * W, 82 + R() * 18, '#3a2a1e');
    },
    tick(c, t, st) {
      const per = 36, k = (t % per) / per, ciclo = Math.floor(t / per);
      const col = st.ams[ciclo % 4], col2 = st.ams[(ciclo + 2) % 4];
      const capas = Math.floor(Math.min(1, k / 0.9) * 26);
      const ancho = y => Math.round(7 + 4 * Math.sin(y * 0.22 + 1) + (y < 3 ? 2 : 0));
      for (let y = 0; y < capas; y++) {
        const w = ancho(y);
        P(c, 102 - w, 65 - y, (y >> 2) % 2 ? col : col2, w * 2, 1);
        P(c, 102 - w, 65 - y, '#ffffff30', 1, 1);
      }
      const gy = 65 - capas - 8;
      P(c, 74, gy, '#34373f', 62, 3); P(c, 74, gy, '#4c515c', 62, 1);
      const w = ancho(Math.max(0, capas - 1));
      const hx = Math.round(102 + Math.sin(t * 5) * (w + 1)) - 4;
      P(c, hx, gy - 4, '#e6e7ea', 9, 9); P(c, hx + 1, gy - 3, '#2b2e35', 7, 3); P(c, hx + 2, gy - 2, '#f4b68c', 2, 1);
      P(c, hx + 4, gy + 5, '#ffb070', 1, 2);
      if (k < 0.9) glow(c, hx + 4.5, gy + 7, 5, 'rgba(255,170,90,1)', 0.35);
      if (k >= 0.9 && Math.floor(t * 4) % 2) P(c, 71, 73, '#f4ee2a', 3, 1);
    },
    top(c, t) {
      for (let i = 0; i < 14; i++) {
        const x = (i * 47 + t * 3 * (1 + i % 3)) % W, y = 10 + ((i * 29 + t * 2) % 60);
        if (Math.sin(t + i) > 0) P(c, x, y, '#ffffff22');
      }
    },
  };

  // ---------------- Powerlifting: rack con barra y discos ----------------
  SCENES.gimnasio = {
    build(b, f, R) {
      grad(b, ['#101318', '#151a21', '#1b212a', '#202733'], 0, 80);
      for (let y = 6; y < 78; y += 8) P(b, 0, y, '#181d25', W, 1);
      for (let y = 6; y < 78; y += 8) for (let x = (y / 8) % 2 ? 0 : 12; x < W; x += 24) P(b, x, y, '#181d25', 1, 8);
      // neón
      P(b, 20, 12, '#ff4f8b', 38, 2); P(b, 20, 12, '#ffb3cf', 38, 1);
      P(b, 170, 12, '#4fd0ff', 34, 2); P(b, 170, 12, '#c4f0ff', 34, 1);
      // suelo de goma
      P(b, 0, 80, '#0d0f13', W, H - 80);
      for (let x = 0; x < W; x += 28) P(b, x, 80, '#171a20', 1, H - 80);
      P(b, 54, 80, '#3a2c20', 116, 18); P(b, 54, 80, '#4a3828', 116, 1); // plataforma de madera
      // rack
      for (const x of [74, 146]) {
        P(f, x, 18, '#2f343d', 5, 64); P(f, x + 1, 18, '#454b56', 1, 64);
        for (let y = 22; y < 78; y += 4) P(f, x + 2, y, '#14171c');
        P(f, x - 3, 44, '#c33a3a', 4, 3);
      }
      P(f, 72, 16, '#2f343d', 81, 3);
      // barra
      P(f, 40, 43, '#c9ccd2', 144, 2); P(f, 40, 43, '#eceef2', 144, 1);
      const discos = [['#d23a3a', 26], ['#2f5fd0', 23], ['#e8c440', 19], ['#3aa65a', 15], ['#e8e8e8', 10]];
      discos.forEach(([c, h], i) => {
        for (const side of [-1, 1]) {
          const x = side < 0 ? 62 - i * 5 : 158 + i * 5;
          P(f, x, 44 - h / 2, c, 4, h); P(f, x, 44 - h / 2, '#ffffff40', 1, h); P(f, x + 3, 44 - h / 2, '#00000040', 1, h);
        }
      });
      P(f, 66, 41, '#9aa0aa', 3, 6); P(f, 156, 41, '#9aa0aa', 3, 6);
      // banco y mancuernas
      P(f, 186, 70, '#2a2e36', 26, 4); P(f, 190, 74, '#1b1e24', 3, 8); P(f, 206, 74, '#1b1e24', 3, 8);
      for (let i = 0; i < 4; i++) { P(f, 10 + i * 10, 84, '#2a2e36', 6, 2); P(f, 9 + i * 10, 83, '#1f2228', 2, 4); P(f, 15 + i * 10, 83, '#1f2228', 2, 4); }
      // tiza
      P(f, 112, 86, '#8a8f99', 12, 6); P(f, 113, 85, '#f0f0f0', 10, 2);
    },
    tick(c, t) {
      const flick = Math.sin(t * 13) > 0.92 ? 0.05 : 0.22;
      glow(c, 39, 13, 28, 'rgba(255,79,139,1)', flick);
      glow(c, 187, 13, 26, 'rgba(79,208,255,1)', 0.2);
    },
    top(c, t) {
      for (let i = 0; i < 26; i++) {
        const x = (i * 37 + Math.sin(t * 0.4 + i) * 8 + 300) % W;
        const y = 86 - ((t * (2 + (i % 4)) + i * 13) % 70);
        P(c, x, y, i % 3 ? '#e8ecf244' : '#ffffff88');
      }
    },
  };

  // ---------------- motor ----------------
  const cache = new Map();
  function layers(type, seed) {
    const key = type + ':' + seed;
    if (cache.has(key)) return cache.get(key);
    const def = SCENES[type] || SCENES.noche;
    const [bg, b] = mk(), [fg, f] = mk();
    const st = def.init ? def.init(rng(seed * 7 + 3)) : {};
    def.build(b, f, rng(seed), st);
    const L = { bg, fg, st, def };
    cache.set(key, L);
    return L;
  }
  function drawFrame(ctx, L, t) {
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(L.bg, 0, 0);
    if (L.def.tick) L.def.tick(ctx, t, L.st);
    ctx.drawImage(L.fg, 0, 0);
    if (L.def.top) L.def.top(ctx, t, L.st);
    ctx.globalAlpha = 1;
  }
  const mounted = new Set();
  function mount(canvas) {
    canvas.width = W; canvas.height = H;
    const m = { canvas, ctx: canvas.getContext('2d'), L: layers(canvas.dataset.scene, Number(canvas.dataset.seed || 7)), anim: canvas.dataset.anim !== '0' && !reduce };
    canvas._scene = m;
    drawFrame(m.ctx, m.L, performance.now() / 1000);
    mounted.add(m);
  }
  let last = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    if (document.hidden || now - last < 1000 / 14) return;
    last = now;
    const t = now / 1000;
    for (const m of mounted) {
      if (!m.canvas.isConnected) { mounted.delete(m); continue; }
      if (m.anim) drawFrame(m.ctx, m.L, t);
    }
  }
  requestAnimationFrame(loop);

  window.Scenes = {
    W, H, types: Object.keys(SCENES),
    hydrate(root) { root.querySelectorAll('canvas[data-scene]').forEach(c => { if (!c._scene) mount(c); }); },
    animate(canvas, on) { if (canvas && canvas._scene) canvas._scene.anim = !!on && !reduce; },
    paint(canvas, type, seed) {
      if (canvas.width !== W) { canvas.width = W; canvas.height = H; }
      drawFrame(canvas.getContext('2d'), layers(type, Number(seed || 7)), performance.now() / 1000);
    },
  };
})();
