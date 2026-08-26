/* ================================================
   Halla AI — Neural Path 3D (Three.js)
   Brain-neuron style background for hero sections
   © 2025 Halla AI
================================================ */
(function () {
  'use strict';

  const ACCENT = 0x0d9488;
  const ACCENT_GLOW = 0x2dd4bf;
  const BG_FADE = 0xf9fafb;

  const scenes = new Map();

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function isMobile() {
    return window.innerWidth < 768 || window.matchMedia('(pointer: coarse)').matches;
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  class NeuralPathScene {
    constructor(mountId, options) {
      this.mount = document.getElementById(mountId);
      if (!this.mount || typeof THREE === 'undefined') return;

      this.opts = Object.assign({
        mode: 'network',
        accent: ACCENT,
        glow: ACCENT_GLOW,
        opacity: 0.85,
      }, options);

      this.running = false;
      this.visible = false;
      this.impulses = [];
      this.branches = [];
      this.clock = new THREE.Clock();
      this.raf = null;

      this._build();
      this._observe();
      document.addEventListener('visibilitychange', this._onVisibility);
    }

    _build() {
      const w = this.mount.clientWidth || 800;
      const h = this.mount.clientHeight || 600;

      this.renderer = new THREE.WebGLRenderer({
        antialias: !isMobile(),
        alpha: true,
        powerPreference: 'high-performance',
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile() ? 1.5 : 2));
      this.renderer.setSize(w, h);
      this.renderer.setClearColor(0x000000, 0);
      this.mount.appendChild(this.renderer.domElement);

      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(48, w / h, 0.1, 200);
      const isNeuron = this.opts.mode === 'neuron';
      this.camera.position.set(
        isNeuron ? 3.5 : 0,
        isNeuron ? 0.5 : 0,
        isMobile() ? (isNeuron ? 24 : 28) : (isNeuron ? 17 : 22)
      );

      const ambient = new THREE.AmbientLight(0xffffff, 0.55);
      const key = new THREE.PointLight(this.opts.glow, 1.2, 80);
      key.position.set(6, 8, 12);
      const rim = new THREE.PointLight(this.opts.accent, 0.6, 60);
      rim.position.set(-8, -4, 6);
      this.scene.add(ambient, key, rim);

      this.root = new THREE.Group();
      this.scene.add(this.root);

      if (this.opts.mode === 'neuron') {
        this._buildNeuronTree();
      } else {
        this._buildNetwork();
      }

      this._spawnImpulses();
      window.addEventListener('resize', this._onResize);
    }

    _somaMaterial() {
      const isNeuron = this.opts.mode === 'neuron';
      return new THREE.MeshPhysicalMaterial({
        color: this.opts.accent,
        emissive: this.opts.glow,
        emissiveIntensity: isNeuron ? 0.62 : 0.4,
        metalness: 0.2,
        roughness: 0.28,
        transparent: true,
        opacity: 0.95,
      });
    }

    _branchMaterial() {
      const isNeuron = this.opts.mode === 'neuron';
      return new THREE.MeshBasicMaterial({
        color: isNeuron ? this.opts.glow : this.opts.accent,
        transparent: true,
        opacity: isNeuron ? 0.38 : 0.18,
      });
    }

    _buildNeuronTree() {
      const depth = isMobile() ? 3 : 4;
      const branchesPerLevel = isMobile() ? [6, 5, 4, 3] : [7, 6, 5, 4, 3];
      const soma = new THREE.Mesh(
        new THREE.SphereGeometry(isMobile() ? 0.65 : 0.88, 28, 28),
        this._somaMaterial()
      );
      soma.position.set(2.2, -0.4, 0);
      this.root.add(soma);
      this._addBranches(soma.position, new THREE.Vector3(0.2, 1, 0), 0, depth, branchesPerLevel, 4.8);
      this._addBranches(soma.position, new THREE.Vector3(-0.3, -0.8, 0.2), 0, depth - 1, branchesPerLevel, 3.6);
      this.root.rotation.x = -0.18;
      this.root.rotation.z = 0.08;
      this.root.position.x = 1.2;
    }

    _addBranches(origin, direction, level, maxLevel, counts, length) {
      if (level >= maxLevel) return;
      const count = counts[level] || 3;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + rand(-0.3, 0.3);
        const tilt = rand(0.35, 0.85);
        const dir = direction.clone()
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), angle)
          .applyAxisAngle(new THREE.Vector3(1, 0, 0), tilt * (level % 2 === 0 ? 1 : -1))
          .normalize();

        const segLen = length * rand(0.55, 0.95) * (1 - level * 0.18);
        const end = origin.clone().add(dir.clone().multiplyScalar(segLen));

        const curve = new THREE.CatmullRomCurve3([
          origin.clone(),
          origin.clone().lerp(end, 0.35).add(new THREE.Vector3(rand(-0.4, 0.4), rand(-0.3, 0.3), rand(-0.4, 0.4))),
          end.clone(),
        ]);

        const tube = new THREE.TubeGeometry(curve, 16, 0.03 + (maxLevel - level) * 0.012, 6, false);
        const mesh = new THREE.Mesh(tube, this._branchMaterial());
        this.root.add(mesh);
        this.branches.push({ curve, mesh });

        if (level < maxLevel - 1) {
          const node = new THREE.Mesh(
            new THREE.SphereGeometry(0.08 + (maxLevel - level) * 0.04, 12, 12),
            this._somaMaterial()
          );
          node.position.copy(end);
          this.root.add(node);
          this._addBranches(end, dir, level + 1, maxLevel, counts, length * 0.72);
        }
      }
    }

    _buildNetwork() {
      const count = isMobile() ? 28 : 42;
      const spread = isMobile() ? 9 : 11;
      const nodes = [];

      for (let i = 0; i < count; i++) {
        const pos = new THREE.Vector3(
          rand(-spread, spread),
          rand(-spread * 0.55, spread * 0.55),
          rand(-4, 4)
        );
        const size = rand(0.06, 0.14);
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(size, 14, 14),
          this._somaMaterial()
        );
        mesh.position.copy(pos);
        this.root.add(mesh);
        nodes.push(pos);
      }

      const linkMat = new THREE.LineBasicMaterial({
        color: this.opts.accent,
        transparent: true,
        opacity: 0.12,
      });
      const maxDist = isMobile() ? 4.2 : 5.2;

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dist = nodes[i].distanceTo(nodes[j]);
          if (dist < maxDist) {
            const geo = new THREE.BufferGeometry().setFromPoints([nodes[i], nodes[j]]);
            const line = new THREE.Line(geo, linkMat);
            this.root.add(line);
            const mid = nodes[i].clone().lerp(nodes[j], 0.5);
            const curve = new THREE.CatmullRomCurve3([nodes[i], mid, nodes[j]]);
            this.branches.push({ curve, mesh: line });
          }
        }
      }
    }

    _spawnImpulses() {
      const impulseGeo = new THREE.SphereGeometry(0.06, 10, 10);
      const impulseMat = new THREE.MeshBasicMaterial({
        color: this.opts.glow,
        transparent: true,
        opacity: 0.95,
      });
      const isNeuron = this.opts.mode === 'neuron';
      const max = isNeuron ? (isMobile() ? 10 : 20) : (isMobile() ? 6 : 12);
      for (let i = 0; i < max; i++) {
        const mesh = new THREE.Mesh(impulseGeo, impulseMat.clone());
        mesh.visible = false;
        this.root.add(mesh);
        this.impulses.push({
          mesh,
          t: Math.random(),
          speed: rand(0.12, 0.28),
          branch: null,
        });
      }
    }

    _assignImpulse(imp) {
      if (!this.branches.length) return;
      imp.branch = this.branches[(Math.random() * this.branches.length) | 0];
      imp.t = 0;
      imp.speed = rand(0.1, 0.32);
      imp.mesh.visible = true;
    }

    _tickImpulses(dt) {
      this.impulses.forEach((imp) => {
        if (!imp.branch) {
          this._assignImpulse(imp);
          return;
        }
        imp.t += imp.speed * dt;
        if (imp.t >= 1) {
          imp.mesh.visible = false;
          imp.branch = null;
          return;
        }
        const pt = imp.branch.curve.getPoint(imp.t);
        imp.mesh.position.copy(pt);
        imp.mesh.material.opacity = 0.35 + Math.sin(imp.t * Math.PI) * 0.6;
        imp.mesh.visible = true;
      });
    }

    _frame = () => {
      if (!this.running) return;
      const dt = Math.min(this.clock.getDelta(), 0.05);
      this.root.rotation.y += dt * 0.08;
      this.root.rotation.x = -0.2 + Math.sin(this.clock.elapsedTime * 0.15) * 0.06;
      this._tickImpulses(dt);
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(this._frame);
    };

    _start() {
      if (this.running || prefersReducedMotion()) return;
      this.running = true;
      this.clock.start();
      this._frame();
    }

    _stop() {
      this.running = false;
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = null;
    }

    _onResize = () => {
      if (!this.mount || !this.renderer) return;
      const w = this.mount.clientWidth;
      const h = this.mount.clientHeight;
      if (!w || !h) return;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };

    _onVisibility = () => {
      if (document.hidden) this._stop();
      else if (this.visible) this._start();
    };

    _observe() {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          this.visible = entry.isIntersecting;
          if (this.visible && !document.hidden) this._start();
          else this._stop();
        });
      }, { threshold: 0.05 });
      io.observe(this.mount);
    }

    destroy() {
      this._stop();
      window.removeEventListener('resize', this._onResize);
      document.removeEventListener('visibilitychange', this._onVisibility);
      if (this.renderer) {
        this.renderer.dispose();
        this.mount.innerHTML = '';
      }
    }
  }

  function initScenes() {
    if (prefersReducedMotion() || typeof THREE === 'undefined') return false;

    const heroMount = document.getElementById('heroNeuralMount');
    if (heroMount && !scenes.get('hero')) {
      scenes.set('hero', new NeuralPathScene('heroNeuralMount', { mode: 'network' }));
    }
    const consultMount = document.getElementById('consultNeuralMount');
    if (consultMount && !scenes.get('consult')) {
      scenes.set('consult', new NeuralPathScene('consultNeuralMount', { mode: 'neuron' }));
    }
    return scenes.size > 0;
  }

  let retryTimer = null;

  function init() {
    if (initScenes()) return;
    if (prefersReducedMotion()) return;
    if (retryTimer) return;

    let attempts = 0;
    retryTimer = setInterval(function () {
      attempts += 1;
      if (initScenes() || attempts >= 60) {
        clearInterval(retryTimer);
        retryTimer = null;
      }
    }, 100);
  }

  window.HallaNeural = {
    init,
    refreshForPage(page) {
      init();
      scenes.forEach((scene) => {
        if (!scene || !scene.mount) return;
        scene._onResize();
        const pageEl = scene.mount.closest('.page');
        if (pageEl && pageEl.classList.contains('active')) {
          scene.visible = true;
          if (!document.hidden) scene._start();
        }
      });
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
