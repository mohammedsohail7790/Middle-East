/* ================================================
   Halla AI — Consultancy Cosmic Backdrop
   Lightweight 2D canvas background for the whole
   consultancy page: twinkling starfield, a rotating
   gold/indigo spiral vortex (tornado) with the odd
   lightning-bolt flicker, and a thin connecting-node
   network layered on top. Fixed to the viewport so it
   stays visible behind every section while scrolling.
   No dependencies, no WebGL — cheap enough to run
   continuously without hurting scroll/interaction perf.
   © 2025 Halla AI
================================================ */
(function () {
  'use strict';

  const GOLD = 'rgba(198,161,91,';
  const INDIGO = 'rgba(91,98,224,';

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  class CosmicScene {
    constructor(mountId) {
      this.mount = document.getElementById(mountId);
      if (!this.mount) return;

      this.canvas = document.createElement('canvas');
      this.mount.appendChild(this.canvas);
      this.ctx = this.canvas.getContext('2d');
      if (!this.ctx) return;

      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.raf = null;
      this.running = false;
      this.t = 0;
      this.stars = [];
      this.nodes = [];
      this.spiralArms = [];
      this.lightning = null;

      this._onResize = this._resize.bind(this);
      this._onVisibility = () => {
        if (document.hidden) this._stop();
        else this._start();
      };

      this._resize();
      window.addEventListener('resize', this._onResize);
      document.addEventListener('visibilitychange', this._onVisibility);

      this._observe();
    }

    _observe() {
      if (typeof IntersectionObserver === 'undefined') {
        this._start();
        return;
      }
      // Fixed full-viewport layer — visible the instant its page section
      // is display:block, so a near-zero threshold is enough.
      this.io = new IntersectionObserver((entries) => {
        const visible = entries.some((e) => e.isIntersecting);
        if (visible) this._start();
        else this._stop();
      }, { threshold: 0 });
      this.io.observe(this.mount);
    }

    _resize() {
      const w = window.innerWidth || 1200;
      const h = window.innerHeight || 800;
      this.width = w;
      this.height = h;
      this.canvas.width = Math.round(w * this.dpr);
      this.canvas.height = Math.round(h * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      const isTouch = window.matchMedia('(pointer: coarse)').matches;
      const area = w * h;

      const starCount = Math.max(70, Math.min(Math.round(area / 8000), isTouch ? 140 : 260));
      this.stars = Array.from({ length: starCount }, () => this._spawnStar());

      const nodeCount = Math.max(14, Math.min(Math.round(area / 28000), isTouch ? 24 : 44));
      this.linkDist = Math.max(90, Math.min(w, h) * 0.15);
      this.nodes = Array.from({ length: nodeCount }, () => this._spawnNode());

      // Vortex sits anchored near the hero copy, upper-right of the viewport,
      // and scales with viewport size so it reads the same on any screen.
      this.spiralCx = w * 0.78;
      this.spiralCy = Math.min(h * 0.4, 440);
      this.spiralScale = Math.min(w, h) * (isTouch ? 0.32 : 0.42);
      const armCount = 3;
      this.spiralArms = Array.from({ length: armCount }, (_, i) => ({
        offset: (i / armCount) * Math.PI * 2,
        gold: i % 2 === 0,
      }));
    }

    _spawnStar() {
      return {
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        r: Math.random() * 1.2 + 0.3,
        phase: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.02 + 0.008,
      };
    }

    _spawnNode() {
      return {
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        vx: (Math.random() - 0.5) * 0.1,
        vy: (Math.random() - 0.5) * 0.1,
        r: Math.random() * 1.3 + 0.8,
        gold: Math.random() < 0.3,
      };
    }

    _start() {
      if (this.running || !this.ctx) return;
      // The consultancy page may have been display:none (SPA page switch)
      // when this scene was constructed or last resized — re-measure before
      // running, since window.innerWidth/Height stays accurate but our
      // canvas backing store may be stale from before the last resize event.
      if (window.innerWidth !== this.width || window.innerHeight !== this.height) {
        this._resize();
      }
      this.running = true;
      this._tick();
    }

    _stop() {
      this.running = false;
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = null;
    }

    _tick() {
      if (!this.running) return;
      this._step();
      this.raf = requestAnimationFrame(() => this._tick());
    }

    _step() {
      this.t += 1;
      const { ctx, width, height } = this;
      ctx.clearRect(0, 0, width, height);
      this._drawStars();
      this._drawSpiral();
      this._maybeSpawnLightning();
      this._drawLightning();
      this._drawPlexus();
    }

    _drawStars() {
      const { ctx, stars, t } = this;
      for (const s of stars) {
        const tw = 0.5 + 0.5 * Math.sin(t * s.speed + s.phase);
        ctx.beginPath();
        ctx.fillStyle = 'rgba(237,238,242,' + (0.12 + tw * 0.55).toFixed(3) + ')';
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // A slowly rotating logarithmic-ish spiral, stretched into a funnel so it
    // reads as a tornado rather than a flat disc, drawn as glowing strands.
    _drawSpiral() {
      const { ctx, spiralCx, spiralCy, spiralScale, t } = this;
      const rotation = t * 0.0022;
      ctx.save();
      ctx.translate(spiralCx, spiralCy);
      ctx.rotate(rotation);

      for (const arm of this.spiralArms) {
        const color = arm.gold ? GOLD : INDIGO;
        const steps = 90;
        ctx.beginPath();
        for (let i = 0; i <= steps; i++) {
          const p = i / steps;
          const angle = arm.offset + p * Math.PI * 4.2;
          const radius = p * spiralScale;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius * 0.62 - p * spiralScale * 0.18;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        const flicker = 0.55 + 0.45 * Math.sin(t * 0.05 + arm.offset * 3);
        ctx.strokeStyle = color + (0.16 * flicker).toFixed(3) + ')';
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }

      const coreGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, spiralScale * 0.5);
      coreGlow.addColorStop(0, GOLD + '0.16)');
      coreGlow.addColorStop(1, GOLD + '0)');
      ctx.fillStyle = coreGlow;
      ctx.beginPath();
      ctx.arc(0, 0, spiralScale * 0.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // Occasional jagged bolt shot out from the vortex core — the "lightning"
    // accent. Rare and brief on purpose; it's a flourish, not a strobe.
    _maybeSpawnLightning() {
      if (this.lightning) return;
      if (Math.random() >= 0.006) return;

      const angle = Math.random() * Math.PI * 2;
      const len = this.spiralScale * 0.95;
      const segments = 7;
      const pts = [{ x: 0, y: 0 }];
      for (let i = 1; i <= segments; i++) {
        const p = i / segments;
        const r = p * len;
        const jitter = (Math.random() - 0.5) * this.spiralScale * 0.12;
        const x = Math.cos(angle) * r + Math.cos(angle + Math.PI / 2) * jitter;
        const y = Math.sin(angle) * r * 0.62 - p * this.spiralScale * 0.18 + Math.sin(angle + Math.PI / 2) * jitter * 0.6;
        pts.push({ x, y });
      }
      this.lightning = { pts, life: 10, maxLife: 10 };
    }

    _drawLightning() {
      const l = this.lightning;
      if (!l) return;
      const { ctx } = this;
      const alpha = l.life / l.maxLife;

      ctx.save();
      ctx.translate(this.spiralCx, this.spiralCy);
      ctx.rotate(this.t * 0.0022);
      ctx.beginPath();
      l.pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.strokeStyle = 'rgba(237,238,242,' + (alpha * 0.8).toFixed(3) + ')';
      ctx.lineWidth = 1.6;
      ctx.shadowColor = 'rgba(142,147,236,0.8)';
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.restore();

      l.life -= 1;
      if (l.life <= 0) this.lightning = null;
    }

    // Thin connecting-line network drifting slowly over the whole viewport,
    // unchanged in spirit from the original hero-only plexus effect.
    _drawPlexus() {
      const { ctx, width, height, nodes, linkDist } = this;

      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > width) n.vx *= -1;
        if (n.y < 0 || n.y > height) n.vy *= -1;
      }

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist >= linkDist) continue;

          const alpha = (1 - dist / linkDist) * 0.18;
          ctx.strokeStyle = INDIGO + alpha.toFixed(3) + ')';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      for (const n of nodes) {
        const color = n.gold ? GOLD : INDIGO;
        ctx.beginPath();
        ctx.fillStyle = color + '0.75)';
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.fillStyle = color + '0.1)';
        ctx.arc(n.x, n.y, n.r * 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    destroy() {
      this._stop();
      window.removeEventListener('resize', this._onResize);
      document.removeEventListener('visibilitychange', this._onVisibility);
      if (this.io) this.io.disconnect();
      this.mount.textContent = '';
    }
  }

  let scene = null;

  function init() {
    if (prefersReducedMotion()) return;
    if (scene) return;
    const mount = document.getElementById('consultCosmicMount');
    if (!mount) return;
    scene = new CosmicScene('consultCosmicMount');
  }

  window.HallaPlexus = { init };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
