/* ================================================
   Halla AI — Consultancy Graph Backdrop
   Lightweight 2D canvas background for the whole
   consultancy page: a faint starfield behind an
   Obsidian-style node graph rendered in pseudo-3D
   (perspective projection, depth-of-field, a slow
   orbiting camera) with glow-gradient edges — no flat
   fills — and the occasional signal pulse traveling
   along a link. No dependencies, no WebGL — cheap
   enough to run continuously without hurting
   scroll/interaction perf.
   © 2025 Halla AI
================================================ */
(function () {
  'use strict';

  const ACCENT = [110, 123, 250]; // --consult-accent
  const WHITE = [244, 244, 245]; // --consult-text

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function rgba(rgb, a) {
    return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + a.toFixed(3) + ')';
  }

  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  class GraphScene {
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
      this.pulses = [];
      this.rotY = 0;
      this.rotX = 0.18; // slight permanent tilt so the graph reads as 3D, not flat

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

      const starCount = Math.max(50, Math.min(Math.round(area / 11000), isTouch ? 90 : 170));
      this.stars = Array.from({ length: starCount }, () => this._spawnStar());

      // World-space radius the node cloud occupies; camera distance and focal
      // length are derived from it so the graph always fills a comfortable
      // portion of the viewport regardless of screen size.
      this.worldR = Math.min(w, h) * 0.62;
      this.focal = this.worldR * 2.1;
      this.camZ = this.worldR * 2.7;

      const nodeCount = Math.max(26, Math.min(Math.round(area / 15000), isTouch ? 46 : 78));
      this.nodes = Array.from({ length: nodeCount }, () => this._spawnNode());
      this.linkDist = this.worldR * 0.62;
    }

    _spawnStar() {
      return {
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        r: Math.random() * 1.1 + 0.3,
        phase: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.02 + 0.008,
      };
    }

    // Nodes seeded in a handful of loose clusters (like Obsidian's graph
    // settling into related note groups) rather than uniform noise — reads
    // far more like a real knowledge graph than a random point cloud.
    _spawnNode() {
      const clusterCount = 4;
      const cluster = Math.floor(Math.random() * clusterCount);
      const clusterAngle = (cluster / clusterCount) * Math.PI * 2;
      const clusterR = this.worldR * 0.42;
      const cx = Math.cos(clusterAngle) * clusterR;
      const cy = (Math.random() - 0.5) * this.worldR * 0.3;
      const cz = Math.sin(clusterAngle) * clusterR;
      const spread = this.worldR * 0.4;

      return {
        x: cx + (Math.random() - 0.5) * spread,
        y: cy + (Math.random() - 0.5) * spread,
        z: cz + (Math.random() - 0.5) * spread,
        vx: (Math.random() - 0.5) * 0.06,
        vy: (Math.random() - 0.5) * 0.06,
        vz: (Math.random() - 0.5) * 0.06,
        r: Math.random() * 1.3 + 1.1,
      };
    }

    _start() {
      if (this.running || !this.ctx) return;
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

    // Perspective-projects a 3D world point (already camera-relative) to 2D
    // screen space, returning null if it's behind the camera.
    _project(x, y, z) {
      const rz = z + this.camZ;
      if (rz <= 1) return null;
      const scale = this.focal / rz;
      return {
        x: this.width / 2 + x * scale,
        y: this.height / 2 + y * scale,
        scale,
        depth: rz,
      };
    }

    _rotate(n) {
      // Slow yaw around Y plus the fixed slight pitch around X.
      const cosY = Math.cos(this.rotY);
      const sinY = Math.sin(this.rotY);
      let x = n.x * cosY - n.z * sinY;
      let z = n.x * sinY + n.z * cosY;
      const y0 = n.y;

      const cosX = Math.cos(this.rotX);
      const sinX = Math.sin(this.rotX);
      const y = y0 * cosX - z * sinX;
      z = y0 * sinX + z * cosX;

      return { x, y, z };
    }

    _step() {
      this.t += 1;
      this.rotY = this.t * 0.00065;
      const { ctx, width, height } = this;
      ctx.clearRect(0, 0, width, height);
      this._drawStars();
      this._stepGraph();
    }

    _drawStars() {
      const { ctx, stars, t } = this;
      for (const s of stars) {
        const tw = 0.5 + 0.5 * Math.sin(t * s.speed + s.phase);
        ctx.beginPath();
        ctx.fillStyle = rgba(WHITE, 0.08 + tw * 0.35);
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    _stepGraph() {
      const { ctx, nodes, linkDist, worldR } = this;

      // Drift nodes gently within the world sphere, reflecting off its
      // boundary so the cloud stays coherent instead of dispersing.
      for (const n of nodes) {
        n.x += n.vx; n.y += n.vy; n.z += n.vz;
        const dist = Math.hypot(n.x, n.y, n.z);
        if (dist > worldR) {
          n.vx -= (n.x / dist) * 0.02;
          n.vy -= (n.y / dist) * 0.02;
          n.vz -= (n.z / dist) * 0.02;
        }
      }

      const projected = nodes.map((n) => {
        const r = this._rotate(n);
        const p = this._project(r.x, r.y, r.z);
        return p ? { n, r, p } : null;
      });

      // Depth-of-field cue: nodes/edges nearer the camera render sharper and
      // brighter, farther ones fade and blur slightly — the "3D" read.
      const depths = projected.filter(Boolean).map((o) => o.p.depth);
      const minD = Math.min.apply(null, depths);
      const maxD = Math.max.apply(null, depths);
      const depthT = (d) => (maxD > minD ? 1 - (d - minD) / (maxD - minD) : 1);

      this._drawEdges(projected, linkDist, depthT);
      this._stepPulses(projected, depthT);
      this._drawNodes(projected, depthT);
    }

    _drawEdges(projected, linkDist, depthT) {
      const { ctx } = this;
      for (let i = 0; i < projected.length; i++) {
        const a = projected[i];
        if (!a) continue;
        for (let j = i + 1; j < projected.length; j++) {
          const b = projected[j];
          if (!b) continue;
          const dx = a.r.x - b.r.x;
          const dy = a.r.y - b.r.y;
          const dz = a.r.z - b.r.z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist >= linkDist) continue;

          const closeness = 1 - dist / linkDist;
          const depth = (depthT(a.p.depth) + depthT(b.p.depth)) / 2;
          const alpha = closeness * (0.05 + depth * 0.14);
          if (alpha <= 0.004) continue;

          // A soft glow stroke rather than a flat line: a wider, dimmer
          // pass under a thin, brighter core.
          ctx.strokeStyle = rgba(ACCENT, alpha * 0.6);
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(a.p.x, a.p.y);
          ctx.lineTo(b.p.x, b.p.y);
          ctx.stroke();

          ctx.strokeStyle = rgba(mix(ACCENT, WHITE, 0.3), alpha);
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(a.p.x, a.p.y);
          ctx.lineTo(b.p.x, b.p.y);
          ctx.stroke();

          if (Math.random() < 0.00025) {
            this.pulses.push({ a: i, b: j, life: 0, maxLife: 70 });
          }
        }
      }
    }

    // A rare, soft point of light traveling along an active edge — the
    // "signal firing" accent, built from a real gradient dot, never a flat
    // jagged shape.
    _stepPulses(projected, depthT) {
      const { ctx } = this;
      this.pulses = this.pulses.filter((pulse) => {
        const a = projected[pulse.a];
        const b = projected[pulse.b];
        if (!a || !b) return false;

        const p = pulse.life / pulse.maxLife;
        const x = a.p.x + (b.p.x - a.p.x) * p;
        const y = a.p.y + (b.p.y - a.p.y) * p;
        const depth = (depthT(a.p.depth) + depthT(b.p.depth)) / 2;
        const fade = Math.sin(p * Math.PI); // ramps up then back down
        const radius = (2.2 + depth * 2.4) * fade;

        const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 4);
        glow.addColorStop(0, rgba(mix(ACCENT, WHITE, 0.55), 0.9 * fade));
        glow.addColorStop(0.4, rgba(ACCENT, 0.35 * fade));
        glow.addColorStop(1, rgba(ACCENT, 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, radius * 4, 0, Math.PI * 2);
        ctx.fill();

        pulse.life += 1;
        return pulse.life < pulse.maxLife;
      });
    }

    _drawNodes(projected, depthT) {
      const { ctx } = this;
      for (const o of projected) {
        if (!o) continue;
        const depth = depthT(o.p.depth);
        const radius = o.n.r * (0.6 + depth * 0.9);
        const alpha = 0.35 + depth * 0.5;

        // Radial-gradient node — a bright core fading to nothing, never a
        // flat filled circle.
        const glow = ctx.createRadialGradient(o.p.x, o.p.y, 0, o.p.x, o.p.y, radius * 3.4);
        glow.addColorStop(0, rgba(mix(ACCENT, WHITE, 0.45), alpha));
        glow.addColorStop(0.35, rgba(ACCENT, alpha * 0.32));
        glow.addColorStop(1, rgba(ACCENT, 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(o.p.x, o.p.y, radius * 3.4, 0, Math.PI * 2);
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
    scene = new GraphScene('consultCosmicMount');
  }

  window.HallaPlexus = { init };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
