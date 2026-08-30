/* ================================================
   Halla AI — Consultancy Plexus Network
   Lightweight 2D canvas background: glowing nodes,
   thin connecting lines, gentle mouse-follow parallax.
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

  class PlexusScene {
    constructor(mountId) {
      this.mount = document.getElementById(mountId);
      if (!this.mount) return;

      this.canvas = document.createElement('canvas');
      this.mount.appendChild(this.canvas);
      this.ctx = this.canvas.getContext('2d');
      if (!this.ctx) return;

      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.mouse = { x: -9999, y: -9999, active: false };
      this.raf = null;
      this.running = false;
      this.nodes = [];

      this._onResize = this._resize.bind(this);
      this._onMouseMove = this._onMove.bind(this);
      this._onMouseLeave = () => { this.mouse.active = false; };
      this._onVisibility = () => {
        if (document.hidden) this._stop();
        else this._start();
      };

      this._resize();
      window.addEventListener('resize', this._onResize);
      this.mount.addEventListener('mousemove', this._onMouseMove);
      this.mount.addEventListener('mouseleave', this._onMouseLeave);
      document.addEventListener('visibilitychange', this._onVisibility);

      this._observe();
    }

    _observe() {
      if (typeof IntersectionObserver === 'undefined') {
        this._start();
        return;
      }
      this.io = new IntersectionObserver((entries) => {
        const visible = entries.some((e) => e.isIntersecting);
        if (visible) this._start();
        else this._stop();
      }, { threshold: 0.05 });
      this.io.observe(this.mount);
    }

    _resize() {
      const w = this.mount.clientWidth || 800;
      const h = this.mount.clientHeight || 500;
      this.width = w;
      this.height = h;
      this.canvas.width = Math.round(w * this.dpr);
      this.canvas.height = Math.round(h * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      // Density scales with viewport area, clamped for very large/small screens
      // and halved on touch devices where the parallax has no payoff anyway.
      const isTouch = window.matchMedia('(pointer: coarse)').matches;
      const area = w * h;
      const target = Math.round(area / (isTouch ? 26000 : 15000));
      const count = Math.max(18, Math.min(target, isTouch ? 40 : 80));

      this.linkDist = Math.max(90, Math.min(w, h) * 0.16);
      this.nodes = Array.from({ length: count }, () => this._spawnNode());
    }

    _spawnNode() {
      return {
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        vx: (Math.random() - 0.5) * 0.12,
        vy: (Math.random() - 0.5) * 0.12,
        r: Math.random() * 1.4 + 0.9,
        gold: Math.random() < 0.32,
      };
    }

    _onMove(e) {
      const rect = this.mount.getBoundingClientRect();
      this.mouse.x = e.clientX - rect.left;
      this.mouse.y = e.clientY - rect.top;
      this.mouse.active = true;
    }

    _start() {
      if (this.running || !this.ctx) return;
      // The hero may have been display:none (SPA page switch) when this
      // scene was constructed or last resized — re-measure before running.
      if (this.mount.clientWidth !== this.width || this.mount.clientHeight !== this.height) {
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
      const { ctx, width, height, nodes, mouse, linkDist } = this;
      ctx.clearRect(0, 0, width, height);

      // Drift + a gentle push away from the cursor — "the network reacts to you"
      // without ever feeling like a game (max displacement is intentionally small).
      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > width) n.vx *= -1;
        if (n.y < 0 || n.y > height) n.vy *= -1;

        if (mouse.active) {
          const dx = n.x - mouse.x;
          const dy = n.y - mouse.y;
          const dist = Math.hypot(dx, dy);
          const radius = 140;
          if (dist < radius && dist > 0.01) {
            const force = (1 - dist / radius) * 0.6;
            n.x += (dx / dist) * force;
            n.y += (dy / dist) * force;
          }
        }
      }

      // Links — brighter and thicker the closer two nodes are, brighter still
      // near the cursor so proximity to the mouse reads as "activating" the mesh.
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist >= linkDist) continue;

          let alpha = (1 - dist / linkDist) * 0.22;
          if (mouse.active) {
            const mdx = (a.x + b.x) / 2 - mouse.x;
            const mdy = (a.y + b.y) / 2 - mouse.y;
            const mdist = Math.hypot(mdx, mdy);
            if (mdist < 180) alpha += (1 - mdist / 180) * 0.28;
          }

          ctx.strokeStyle = INDIGO + Math.min(alpha, 0.5).toFixed(3) + ')';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      // Nodes on top, gold minority for accent variation.
      for (const n of nodes) {
        const color = n.gold ? GOLD : INDIGO;
        ctx.beginPath();
        ctx.fillStyle = color + '0.85)';
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();

        // Soft glow halo, cheap: one extra larger low-alpha circle per node.
        ctx.beginPath();
        ctx.fillStyle = color + '0.12)';
        ctx.arc(n.x, n.y, n.r * 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    destroy() {
      this._stop();
      window.removeEventListener('resize', this._onResize);
      this.mount.removeEventListener('mousemove', this._onMouseMove);
      this.mount.removeEventListener('mouseleave', this._onMouseLeave);
      document.removeEventListener('visibilitychange', this._onVisibility);
      if (this.io) this.io.disconnect();
      this.mount.textContent = '';
    }
  }

  let scene = null;

  function init() {
    if (prefersReducedMotion()) return;
    if (scene) return;
    const mount = document.getElementById('consultPlexusMount');
    if (!mount) return;
    scene = new PlexusScene('consultPlexusMount');
  }

  window.HallaPlexus = { init };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
