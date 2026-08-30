/* ================================================
   Halla AI — Consultancy Starfield Backdrop (WebGL/3D)
   A real three.js WebGL scene behind the consultancy
   page: thousands of stars scattered through actual
   3D space, with a slowly orbiting camera. No nodes,
   no graph, no procedural "network" shapes — just a
   deep, real starfield with genuine parallax motion
   (near stars drift past faster than far ones, the
   unmistakable signal of real 3D rather than a flat
   layered illusion).
   Falls back to doing nothing if three.js isn't
   available or the visitor prefers reduced motion.
   © 2025 Halla AI
================================================ */
(function () {
  'use strict';

  const BG = 0x0a0a0c; // must match --consult-ink so the canvas blends with the page

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  class StarfieldScene {
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
      this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 4000);
      this.glowTex = this._makeGlowTexture();

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

    _makeGlowTexture() {
      const THREE = this.THREE;
      const size = 64;
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      const ctx = c.getContext('2d');
      const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.4, 'rgba(255,255,255,0.5)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      return new THREE.CanvasTexture(c);
    }

    _resize() {
      const THREE = this.THREE;
      const w = window.innerWidth || 1200;
      const h = window.innerHeight || 800;
      this.width = w;
      this.height = h;

      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();

      const isTouch = window.matchMedia('(pointer: coarse)').matches;
      const count = isTouch ? 1200 : 2600;
      this._buildStars(count);
    }

    // Stars distributed through a real 3D volume (not on a flat plane or a
    // thin shell) — some near the camera's orbit path, most farther out —
    // so the parallax as the camera moves is genuine depth, not a trick.
    _buildStars(count) {
      const THREE = this.THREE;
      if (this.points) {
        this.scene.remove(this.points);
        this.points.geometry.dispose();
        this.points.material.dispose();
      }

      const radius = 900;
      const positions = new Float32Array(count * 3);
      const sizes = new Float32Array(count);
      const colors = new Float32Array(count * 3);

      for (let i = 0; i < count; i++) {
        const r = radius * (0.15 + Math.pow(Math.random(), 0.5) * 0.85);
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(Math.random() * 2 - 1);
        positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.cos(phi);
        positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

        sizes[i] = Math.random() * 1.6 + 0.5;

        // Mostly neutral white with a subtle warm/cool temperature spread —
        // real starfields aren't uniformly pure white.
        const temp = Math.random();
        const warm = temp < 0.15;
        const cool = temp > 0.85;
        if (warm) {
          colors[i * 3] = 1; colors[i * 3 + 1] = 0.92; colors[i * 3 + 2] = 0.82;
        } else if (cool) {
          colors[i * 3] = 0.85; colors[i * 3 + 1] = 0.9; colors[i * 3 + 2] = 1;
        } else {
          colors[i * 3] = 1; colors[i * 3 + 1] = 1; colors[i * 3 + 2] = 1;
        }
      }

      const phases = new Float32Array(count);
      const speeds = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        phases[i] = Math.random() * Math.PI * 2;
        speeds[i] = 0.6 + Math.random() * 1.4;
      }

      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geom.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
      geom.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
      geom.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
      geom.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));

      // A small custom shader so each star twinkles on its own phase —
      // PointsMaterial only accepts one uniform size/opacity for every
      // point, which would pulse the whole field in lockstep.
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
          uMap: { value: this.glowTex },
        },
        vertexShader: [
          'attribute float aSize;',
          'attribute vec3 aColor;',
          'attribute float aPhase;',
          'attribute float aSpeed;',
          'uniform float uTime;',
          'uniform float uPixelRatio;',
          'varying vec3 vColor;',
          'varying float vTwinkle;',
          'void main() {',
          '  vColor = aColor;',
          '  vTwinkle = 0.55 + 0.45 * sin(uTime * aSpeed + aPhase);',
          '  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);',
          '  gl_PointSize = aSize * uPixelRatio * (260.0 / -mvPosition.z) * (0.7 + vTwinkle * 0.5);',
          '  gl_Position = projectionMatrix * mvPosition;',
          '}',
        ].join('\n'),
        fragmentShader: [
          'varying vec3 vColor;',
          'varying float vTwinkle;',
          'uniform sampler2D uMap;',
          'void main() {',
          '  vec4 tex = texture2D(uMap, gl_PointCoord);',
          '  gl_FragColor = vec4(vColor, tex.a * vTwinkle * 0.95);',
          '}',
        ].join('\n'),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

      this.starMaterial = mat;
      this.points = new THREE.Points(geom, mat);
      this.scene.add(this.points);
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

      // The camera slowly orbits through the star volume rather than
      // sitting still — this is what makes it read as real 3D motion:
      // stars nearer the orbit path sweep past visibly faster than the
      // distant ones, an effect a flat 2D field can't produce honestly.
      const angle = this.t * 0.00035;
      const bob = Math.sin(this.t * 0.0007) * 40;
      this.camera.position.set(
        Math.sin(angle) * 260,
        bob,
        Math.cos(angle) * 260
      );
      this.camera.lookAt(0, 0, 0);

      if (this.points) this.points.rotation.y += 0.00012;
      if (this.starMaterial) this.starMaterial.uniforms.uTime.value = this.t * 0.016;

      this.renderer.render(this.scene, this.camera);
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
    if (!window.THREE) return;
    const mount = document.getElementById('consultCosmicMount');
    if (!mount) return;
    scene = new StarfieldScene('consultCosmicMount');
  }

  window.HallaPlexus = { init };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
