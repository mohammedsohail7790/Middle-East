/* ================================================
   Halla AI — Consultancy Graph Backdrop (WebGL/3D)
   A real 3D node graph rendered with three.js behind
   the whole consultancy page, in the spirit of
   Obsidian's graph view: nodes clustered in 3D space,
   glow-additive points and edges (no flat fills), a
   faint starfield, and a slow orbiting camera. The
   node cluster is offset upward in world space (not by
   tilting the camera) so it reliably renders in the
   upper part of the frame — near the top of the page —
   at every point in the orbit.
   Falls back to doing nothing if three.js isn't
   available or the visitor prefers reduced motion —
   the page underneath is fully designed to work with
   no backdrop at all.
   © 2025 Halla AI
================================================ */
(function () {
  'use strict';

  const BG = 0x0a0a0c; // must match --consult-ink so fog fade reads as fade-to-background
  const ACCENT = 0x6e7bfa; // --consult-accent
  const WHITE = 0xf4f4f5; // --consult-text

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function makeGlowTexture(THREE, hard) {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    if (hard) {
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.2, 'rgba(255,255,255,0.9)');
      g.addColorStop(0.55, 'rgba(255,255,255,0.25)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
    } else {
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(0.4, 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  class GraphScene3D {
    constructor(mountId) {
      this.mount = document.getElementById(mountId);
      if (!this.mount || !window.THREE) return;
      const THREE = window.THREE;
      this.THREE = THREE;

      this.canvas = document.createElement('canvas');
      this.mount.appendChild(this.canvas);

      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.setClearColor(BG, 1);

      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(46, 1, 1, 10000);
      this.glowTexSoft = makeGlowTexture(THREE, false);
      this.glowTexHard = makeGlowTexture(THREE, true);

      this.pulses = [];
      this.t = 0;
      this.running = false;
      this.raf = null;

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
      const THREE = this.THREE;
      const w = window.innerWidth || 1200;
      const h = window.innerHeight || 800;
      this.width = w;
      this.height = h;

      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;

      const isTouch = window.matchMedia('(pointer: coarse)').matches;
      this.worldR = Math.min(w, h) * 0.62;
      this.camDist = this.worldR * 2.4;
      this.camera.near = this.camDist * 0.15;
      this.camera.far = this.camDist * 4;
      this.camera.updateProjectionMatrix();

      this.scene.fog = new THREE.Fog(BG, this.camDist * 0.65, this.camDist * 1.85);

      const nodeCount = Math.max(28, Math.min(Math.round((w * h) / 15000), isTouch ? 44 : 72));
      this._buildGraph(nodeCount);
      this._buildStars(isTouch ? 180 : 340);

      this.introFrame = 0;
    }

    // Nodes seeded into a few loose clusters (like Obsidian's graph settling
    // into related note groups) and wired to their nearest neighbors once —
    // a fixed structure reads as a deliberate graph, not random noise.
    _buildGraph(nodeCount) {
      const THREE = this.THREE;
      if (this.graphGroup) {
        this.scene.remove(this.graphGroup);
        this.nodePoints.geometry.dispose();
        this.nodePoints.material.dispose();
        this.nodeGlow.geometry.dispose();
        this.nodeGlow.material.dispose();
        this.edgeLines.geometry.dispose();
        this.edgeLines.material.dispose();
      }

      this.graphGroup = new THREE.Group();
      // World-space vertical offset, not a camera tilt: everything in this
      // group sits above world Y=0, and since the camera always looks at
      // the origin, the whole graph reliably renders in the upper part of
      // the frame at every point in the orbit — a guaranteed geometric
      // result rather than a hand-tuned camera angle.
      this.graphGroup.position.y = this.worldR * 0.34;
      this.scene.add(this.graphGroup);

      const clusterCount = 3;
      const clusterR = this.worldR * 0.38;
      const spread = this.worldR * 0.34;
      const positions = [];
      for (let i = 0; i < nodeCount; i++) {
        const cluster = i % clusterCount;
        const angle = (cluster / clusterCount) * Math.PI * 2;
        const cx = Math.cos(angle) * clusterR;
        const cz = Math.sin(angle) * clusterR;
        const cy = (Math.random() - 0.5) * this.worldR * 0.22;
        positions.push(new THREE.Vector3(
          cx + (Math.random() - 0.5) * spread,
          cy + (Math.random() - 0.5) * spread,
          cz + (Math.random() - 0.5) * spread
        ));
      }
      this.nodePositions = positions;
      this.nodeVelocities = positions.map(() => new THREE.Vector3(
        (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 0.4
      ));

      // Two layers per node: a tight bright core plus a wider soft halo —
      // reads as a real glow rather than a flat dot, without needing a
      // post-process bloom pass.
      const coreGeom = new THREE.BufferGeometry().setFromPoints(positions);
      const coreMat = new THREE.PointsMaterial({
        size: this.worldR * 0.028,
        map: this.glowTexHard,
        color: new THREE.Color(WHITE).lerp(new THREE.Color(ACCENT), 0.25),
        transparent: true, opacity: 0.95, depthWrite: false,
        blending: THREE.AdditiveBlending, sizeAttenuation: true,
      });
      this.nodePoints = new THREE.Points(coreGeom, coreMat);
      this.graphGroup.add(this.nodePoints);

      const glowGeom = new THREE.BufferGeometry().setFromPoints(positions);
      const glowMat = new THREE.PointsMaterial({
        size: this.worldR * 0.1,
        map: this.glowTexSoft,
        color: ACCENT,
        transparent: true, opacity: 0.35, depthWrite: false,
        blending: THREE.AdditiveBlending, sizeAttenuation: true,
      });
      this.nodeGlow = new THREE.Points(glowGeom, glowMat);
      this.graphGroup.add(this.nodeGlow);

      // Fixed nearest-neighbor adjacency, not a live distance threshold —
      // a threshold re-evaluated every frame flickers edges in and out as
      // nodes drift and reads as messy rather than a real graph.
      const maxPerNode = 3;
      const seen = new Set();
      const edges = [];
      for (let i = 0; i < positions.length; i++) {
        const dists = [];
        for (let j = 0; j < positions.length; j++) {
          if (i === j) continue;
          dists.push({ j, d: positions[i].distanceTo(positions[j]) });
        }
        dists.sort((a, b) => a.d - b.d);
        for (let k = 0; k < Math.min(maxPerNode, dists.length); k++) {
          const j = dists[k].j;
          const key = i < j ? i + '_' + j : j + '_' + i;
          if (seen.has(key)) continue;
          seen.add(key);
          edges.push(i, j);
        }
      }
      this.edgeIndexPairs = edges;

      const edgeGeom = new THREE.BufferGeometry().setFromPoints(positions);
      edgeGeom.setIndex(edges);
      const edgeMat = new THREE.LineBasicMaterial({
        color: ACCENT, transparent: true, opacity: 0.4,
        depthWrite: false, blending: THREE.AdditiveBlending,
      });
      this.edgeLines = new THREE.LineSegments(edgeGeom, edgeMat);
      this.graphGroup.add(this.edgeLines);
    }

    _buildStars(count) {
      const THREE = this.THREE;
      if (this.starPoints) {
        this.scene.remove(this.starPoints);
        this.starPoints.geometry.dispose();
        this.starPoints.material.dispose();
      }

      const positions = [];
      const shellR = this.worldR * 2.6;
      for (let i = 0; i < count; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(Math.random() * 2 - 1);
        const r = shellR * (0.6 + Math.random() * 0.4);
        positions.push(
          r * Math.sin(phi) * Math.cos(theta),
          r * Math.cos(phi) * 0.6,
          r * Math.sin(phi) * Math.sin(theta)
        );
      }
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      const mat = new THREE.PointsMaterial({
        size: this.worldR * 0.012, map: this.glowTexSoft, color: WHITE,
        transparent: true, opacity: 0.55, depthWrite: false,
        blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false,
      });
      this.starPoints = new THREE.Points(geom, mat);
      this.scene.add(this.starPoints);
    }

    _start() {
      if (this.running || !this.renderer) return;
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
      this.introFrame = (this.introFrame || 0) + 1;

      this._orbitCamera();
      this._driftNodes();
      this._maybeSpawnPulse();
      this._stepPulses();

      // Graceful settle-in: fade the whole graph up from nothing over its
      // first ~1.5s instead of popping in already mid-motion.
      const introAlpha = Math.min(1, this.introFrame / 90);
      this.nodePoints.material.opacity = 0.95 * introAlpha;
      this.nodeGlow.material.opacity = 0.35 * introAlpha;
      this.edgeLines.material.opacity = 0.4 * introAlpha;
      this.starPoints.material.opacity = 0.55 * introAlpha;

      this.renderer.render(this.scene, this.camera);
    }

    // A simple, symmetric orbit: the camera circles the world origin at a
    // fixed height and radius. It always looks at the origin — the graph
    // group's own +Y offset (set once in _buildGraph) is what keeps the
    // cluster in the upper frame, not any camera tilt.
    _orbitCamera() {
      const angle = this.t * 0.0011;
      const camY = this.worldR * 0.18;
      this.camera.position.set(
        Math.sin(angle) * this.camDist,
        camY,
        Math.cos(angle) * this.camDist
      );
      this.camera.lookAt(0, 0, 0);
    }

    _driftNodes() {
      const positions = this.nodePositions;
      const velocities = this.nodeVelocities;
      const coreAttr = this.nodePoints.geometry.attributes.position;
      const glowAttr = this.nodeGlow.geometry.attributes.position;
      const edgeAttr = this.edgeLines.geometry.attributes.position;
      const worldR = this.worldR;

      for (let i = 0; i < positions.length; i++) {
        const p = positions[i];
        const v = velocities[i];
        p.addScaledVector(v, 0.02);
        const dist = p.length();
        if (dist > worldR) {
          v.addScaledVector(p.clone().normalize(), -0.012);
        }
        coreAttr.setXYZ(i, p.x, p.y, p.z);
        glowAttr.setXYZ(i, p.x, p.y, p.z);
        edgeAttr.setXYZ(i, p.x, p.y, p.z);
      }
      coreAttr.needsUpdate = true;
      glowAttr.needsUpdate = true;
      edgeAttr.needsUpdate = true;
    }

    // A rare, soft point of light traveling along an active edge — the
    // "signal firing" accent, a real additive-glow sprite, never a flat
    // jagged shape.
    _maybeSpawnPulse() {
      if (this.pulses.length > 2) return;
      if (Math.random() >= 0.008) return;
      const THREE = this.THREE;
      const pairCount = this.edgeIndexPairs.length / 2;
      if (pairCount < 1) return;
      const idx = Math.floor(Math.random() * pairCount) * 2;
      const a = this.edgeIndexPairs[idx];
      const b = this.edgeIndexPairs[idx + 1];

      const mat = new THREE.SpriteMaterial({
        map: this.glowTexHard,
        color: new THREE.Color(WHITE).lerp(new THREE.Color(ACCENT), 0.15),
        transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const sprite = new THREE.Sprite(mat);
      const scale = this.worldR * 0.075;
      sprite.scale.set(scale, scale, scale);
      this.graphGroup.add(sprite);
      this.pulses.push({ a, b, life: 0, maxLife: 70, sprite });
    }

    _stepPulses() {
      this.pulses = this.pulses.filter((pulse) => {
        const a = this.nodePositions[pulse.a];
        const b = this.nodePositions[pulse.b];
        const p = pulse.life / pulse.maxLife;
        pulse.sprite.position.lerpVectors(a, b, p);
        const fade = Math.sin(p * Math.PI);
        pulse.sprite.material.opacity = fade * 0.95;

        pulse.life += 1;
        const done = pulse.life >= pulse.maxLife;
        if (done) {
          this.graphGroup.remove(pulse.sprite);
          pulse.sprite.material.dispose();
        }
        return !done;
      });
    }

    destroy() {
      this._stop();
      window.removeEventListener('resize', this._onResize);
      document.removeEventListener('visibilitychange', this._onVisibility);
      if (this.io) this.io.disconnect();
      this.renderer.dispose();
      this.mount.textContent = '';
    }
  }

  let scene = null;

  function init() {
    if (prefersReducedMotion()) return;
    if (scene) return;
    if (!window.THREE) return; // three.js not loaded (yet, or at all) — no backdrop, page still works fine
    const mount = document.getElementById('consultCosmicMount');
    if (!mount) return;
    scene = new GraphScene3D('consultCosmicMount');
  }

  window.HallaPlexus = { init };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
