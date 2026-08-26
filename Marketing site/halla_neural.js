/* ================================================
   Halla AI — Neural Path 3D (Three.js)
   Brain-neuron style background for hero sections
   © 2025 Halla AI
================================================ */
(function () {
  'use strict';

  const ACCENT = 0x0d9488;
  const ACCENT_GLOW = 0x2dd4bf;
  const ACCENT_BRIGHT = 0x5eead4;

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
        autoStart: false,
        parallax: false,
      }, options);

      this.running = false;
      this.visible = false;
      this.impulses = [];
      this.branches = [];
      this.clock = new THREE.Clock();
      this.raf = null;
      this.targetRotX = 0;
      this.targetRotY = 0;
      this.parallaxX = 0;
      this.parallaxY = 0;

      this._build();
      this._observe();
      if (this.opts.autoStart) {
        this.visible = true;
        this._start();
      }
      if (this.opts.parallax) this._bindParallax();
      document.addEventListener('visibilitychange', this._onVisibility);
    }

    _getMountSize() {
      let w = this.mount.clientWidth;
      let h = this.mount.clientHeight;
      if (this.opts.mode === 'ambient' || this.opts.fullViewport) {
        return { w: window.innerWidth, h: window.innerHeight };
      }
      if (!w || !h) {
        w = window.innerWidth;
        h = Math.max(480, Math.round(window.innerHeight * 0.72));
      }
      return { w, h };
    }

    _build() {
      const size = this._getMountSize();
      const w = size.w;
      const h = size.h;

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
      const isNeuron = this.opts.mode === 'neuron' || this.opts.mode === 'consult' || this.opts.mode === 'ambient';
      this.camera.position.set(
        isNeuron ? 2.5 : 0,
        isNeuron ? 0.2 : 0,
        isMobile()
          ? (this.opts.mode === 'ambient' ? 32 : isNeuron ? 22 : 28)
          : (this.opts.mode === 'ambient' ? 24 : isNeuron ? 15 : 22)
      );

      const ambient = new THREE.AmbientLight(0xffffff, isNeuron ? 0.65 : 0.55);
      const key = new THREE.PointLight(this.opts.glow, isNeuron ? 1.8 : 1.2, 100);
      key.position.set(6, 8, 12);
      const rim = new THREE.PointLight(this.opts.accent, isNeuron ? 1.0 : 0.6, 80);
      rim.position.set(-8, -4, 6);
      const fill = new THREE.PointLight(ACCENT_BRIGHT, 0.45, 60);
      fill.position.set(0, -6, 8);
      this.scene.add(ambient, key, rim, fill);

      this.root = new THREE.Group();
      this.scene.add(this.root);

      if (this.opts.mode === 'neuron' || this.opts.mode === 'consult') {
        this._buildNeuronTree();
      } else if (this.opts.mode === 'ambient') {
        this._buildAmbientField();
      } else {
        this._buildNetwork();
      }

      this._spawnImpulses();
      window.addEventListener('resize', this._onResize);
    }

    _somaMaterial(intensity) {
      const isNeuron = this.opts.mode !== 'network';
      return new THREE.MeshPhysicalMaterial({
        color: this.opts.accent,
        emissive: this.opts.glow,
        emissiveIntensity: intensity != null ? intensity : (isNeuron ? 0.85 : 0.4),
        metalness: 0.25,
        roughness: 0.22,
        transparent: true,
        opacity: 0.96,
      });
    }

    _branchMaterial() {
      const isNeuron = this.opts.mode !== 'network';
      const isConsult = this.opts.mode === 'consult';
      return new THREE.MeshBasicMaterial({
        color: isNeuron ? this.opts.glow : this.opts.accent,
        transparent: true,
        opacity: isConsult ? 0.68 : (isNeuron ? 0.52 : 0.18),
      });
    }

    _glowHalo(radius, parent, position) {
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 20, 20),
        new THREE.MeshBasicMaterial({
          color: this.opts.glow,
          transparent: true,
          opacity: 0.14,
          depthWrite: false,
        })
      );
      halo.position.copy(position);
      parent.add(halo);
      return halo;
    }

    _buildNeuronTree() {
      const isConsult = this.opts.mode === 'consult';
      const depth = isConsult ? (isMobile() ? 4 : 5) : (isMobile() ? 3 : 4);
      const branchesPerLevel = isConsult
        ? (isMobile() ? [8, 7, 5, 4, 3] : [10, 8, 6, 5, 4, 3])
        : (isMobile() ? [6, 5, 4, 3] : [8, 7, 5, 4, 3]);
      const somaRadius = isConsult
        ? (isMobile() ? 0.95 : 1.28)
        : (isMobile() ? 0.78 : 1.05);
      const soma = new THREE.Mesh(
        new THREE.SphereGeometry(somaRadius, 32, 32),
        this._somaMaterial(isConsult ? 1.15 : 1.0)
      );
      soma.position.set(isConsult ? 2.1 : 1.8, isConsult ? -0.05 : -0.2, 0);
      this.root.add(soma);
      this._glowHalo(isConsult ? (isMobile() ? 1.65 : 2.15) : (isMobile() ? 1.35 : 1.75), this.root, soma.position);
      const branchLen = isConsult ? 6.0 : 5.2;
      this._addBranches(soma.position, new THREE.Vector3(0.15, 1, 0.1), 0, depth, branchesPerLevel, branchLen, this.root);
      this._addBranches(soma.position, new THREE.Vector3(-0.4, -0.75, 0.25), 0, depth - 1, branchesPerLevel, branchLen * 0.78, this.root);
      this._addBranches(soma.position, new THREE.Vector3(0.5, 0.2, -0.8), 0, depth - 1, branchesPerLevel, branchLen * 0.68, this.root);
      if (isConsult) {
        this._addBranches(soma.position, new THREE.Vector3(-0.65, 0.55, 0.45), 0, depth - 2, branchesPerLevel, branchLen * 0.55, this.root);
      }
      this.root.rotation.x = isConsult ? -0.1 : -0.14;
      this.root.rotation.z = isConsult ? 0.04 : 0.06;
      this.root.position.x = isConsult ? 1.2 : 0.8;
      this.root.scale.setScalar(isConsult ? (isMobile() ? 1.05 : 1.22) : (isMobile() ? 0.92 : 1.08));
    }

    _buildAmbientField() {
      const clusters = isMobile()
        ? [
            { pos: [3.5, 0, -1], scale: 1.0 },
            { pos: [-4.5, -1.5, -3], scale: 0.72 },
          ]
        : [
            { pos: [5.5, 0.5, -1], scale: 1.15 },
            { pos: [-6, -1.2, -4], scale: 0.85 },
            { pos: [1.5, 2.8, -5], scale: 0.65 },
          ];

      const depth = isMobile() ? 2 : 3;
      const branchesPerLevel = [5, 4, 3];

      clusters.forEach((cluster) => {
        const group = new THREE.Group();
        group.position.set(cluster.pos[0], cluster.pos[1], cluster.pos[2]);
        group.scale.setScalar(cluster.scale);
        this.root.add(group);

        const soma = new THREE.Mesh(
          new THREE.SphereGeometry(0.62, 24, 24),
          this._somaMaterial(0.7)
        );
        group.add(soma);
        this._glowHalo(1.1, group, soma.position);
        this._addBranches(
          soma.position,
          new THREE.Vector3(rand(-0.2, 0.2), 1, rand(-0.2, 0.2)),
          0,
          depth,
          branchesPerLevel,
          4.4,
          group
        );
      });

      this.root.rotation.x = -0.1;
      this.root.position.y = -0.5;
    }

    _addBranches(origin, direction, level, maxLevel, counts, length, parent) {
      if (level >= maxLevel) return;
      const count = counts[level] || 3;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + rand(-0.3, 0.3);
        const tilt = rand(0.35, 0.85);
        const dir = direction.clone()
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), angle)
          .applyAxisAngle(new THREE.Vector3(1, 0, 0), tilt * (level % 2 === 0 ? 1 : -1))
          .normalize();

        const segLen = length * rand(0.55, 0.95) * (1 - level * 0.16);
        const end = origin.clone().add(dir.clone().multiplyScalar(segLen));

        const curve = new THREE.CatmullRomCurve3([
          origin.clone(),
          origin.clone().lerp(end, 0.35).add(new THREE.Vector3(rand(-0.4, 0.4), rand(-0.3, 0.3), rand(-0.4, 0.4))),
          end.clone(),
        ]);

        const tube = new THREE.TubeGeometry(curve, 18, 0.035 + (maxLevel - level) * 0.014, 8, false);
        const mesh = new THREE.Mesh(tube, this._branchMaterial());
        parent.add(mesh);
        this.branches.push({ curve, mesh });

        if (level < maxLevel - 1) {
          const nodeSize = 0.1 + (maxLevel - level) * 0.045;
          const node = new THREE.Mesh(
            new THREE.SphereGeometry(nodeSize, 14, 14),
            this._somaMaterial(0.55 + level * 0.08)
          );
          node.position.copy(end);
          parent.add(node);
          if (level >= maxLevel - 2) {
            this._glowHalo(nodeSize * 2.2, parent, end);
          }
          this._addBranches(end, dir, level + 1, maxLevel, counts, length * 0.72, parent);
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
          this._somaMaterial(0.4)
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
      const isNeuron = this.opts.mode !== 'network';
      const impulseSize = isNeuron ? 0.1 : 0.06;
      const impulseGeo = new THREE.SphereGeometry(impulseSize, 12, 12);
      const max = isNeuron
        ? (this.opts.mode === 'ambient'
          ? (isMobile() ? 14 : 24)
          : this.opts.mode === 'consult'
            ? (isMobile() ? 20 : 36)
            : (isMobile() ? 14 : 26))
        : (isMobile() ? 6 : 12);

      for (let i = 0; i < max; i++) {
        const mesh = new THREE.Mesh(
          impulseGeo,
          new THREE.MeshBasicMaterial({
            color: ACCENT_BRIGHT,
            transparent: true,
            opacity: 0.95,
          })
        );
        mesh.visible = false;
        this.root.add(mesh);
        this.impulses.push({
          mesh,
          t: Math.random(),
          speed: rand(0.14, 0.36),
          branch: null,
        });
      }
    }

    _assignImpulse(imp) {
      if (!this.branches.length) return;
      imp.branch = this.branches[(Math.random() * this.branches.length) | 0];
      imp.t = 0;
      imp.speed = rand(0.12, 0.38);
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
        const pulse = 0.4 + Math.sin(imp.t * Math.PI) * 0.55;
        imp.mesh.material.opacity = pulse;
        const scale = 0.7 + pulse * 0.8;
        imp.mesh.scale.setScalar(scale);
        imp.mesh.visible = true;
      });
    }

    _bindParallax() {
      this._onMouseMove = (e) => {
        this.parallaxX = (e.clientX / window.innerWidth - 0.5) * 0.45;
        this.parallaxY = (e.clientY / window.innerHeight - 0.5) * 0.28;
      };
      window.addEventListener('mousemove', this._onMouseMove, { passive: true });
    }

    _frame = () => {
      if (!this.running) return;
      const dt = Math.min(this.clock.getDelta(), 0.05);
      const t = this.clock.elapsedTime;

      if (this.opts.mode === 'ambient') {
        this.root.rotation.y = t * 0.04;
        this.root.rotation.x = -0.08 + Math.sin(t * 0.1) * 0.04;
      } else {
        this.root.rotation.y += dt * 0.06;
        const baseX = -0.16 + Math.sin(t * 0.15) * 0.05;
        this.root.rotation.x = baseX + this.parallaxY;
        this.root.rotation.y += this.parallaxX * dt * 2;
      }

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
      const size = this._getMountSize();
      const w = size.w;
      const h = size.h;
      if (!w || !h) return;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };

    _onVisibility = () => {
      if (document.hidden) this._stop();
      else if (this.visible || this.opts.autoStart) this._start();
    };

    _observe() {
      if (this.opts.autoStart) return;
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          this.visible = entry.isIntersecting;
          if (this.visible) this._onResize();
          if (this.visible && !document.hidden) this._start();
          else if (!this.opts.autoStart) this._stop();
        });
      }, { threshold: 0.02 });
      io.observe(this.mount);
    }

    wake() {
      this._onResize();
      this.visible = true;
      if (!document.hidden) this._start();
    }

    destroy() {
      this._stop();
      window.removeEventListener('resize', this._onResize);
      document.removeEventListener('visibilitychange', this._onVisibility);
      if (this._onMouseMove) window.removeEventListener('mousemove', this._onMouseMove);
      if (this.renderer) {
        this.renderer.dispose();
        this.mount.innerHTML = '';
      }
    }
  }

  function initScenes() {
    if (prefersReducedMotion() || typeof THREE === 'undefined') return false;

    const siteMount = document.getElementById('siteNeuralMount');
    if (siteMount && !scenes.get('site')) {
      scenes.set('site', new NeuralPathScene('siteNeuralMount', {
        mode: 'ambient',
        autoStart: true,
      }));
    }

    const heroMount = document.getElementById('heroNeuralMount');
    if (heroMount && !scenes.get('hero')) {
      scenes.set('hero', new NeuralPathScene('heroNeuralMount', {
        mode: 'neuron',
        parallax: true,
      }));
    }

    const consultMount = document.getElementById('consultNeuralMount');
    if (consultMount && !scenes.get('consult')) {
      scenes.set('consult', new NeuralPathScene('consultNeuralMount', {
        mode: 'consult',
        parallax: true,
      }));
    }

    const consultPageMount = document.getElementById('consultPageNeuralMount');
    if (consultPageMount && !scenes.get('consultPage')) {
      scenes.set('consultPage', new NeuralPathScene('consultPageNeuralMount', {
        mode: 'consult',
        parallax: true,
        fullViewport: true,
        autoStart: false,
      }));
    }

    return scenes.size > 0;
  }

  const CONSULTANCY_PAGES = new Set([
    'consultancy', 'svc-operations', 'svc-acquisition', 'svc-brand', 'consult-signup',
  ]);

  function isConsultancyPage(page) {
    return CONSULTANCY_PAGES.has(page);
  }

  function setConsultNeuralActive(active) {
    document.body.classList.toggle('consult-neural-active', active);
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
      const consultancy = isConsultancyPage(page);
      setConsultNeuralActive(consultancy);

      scenes.forEach((scene, key) => {
        if (!scene || !scene.mount) return;

        if (key === 'consultPage') {
          if (consultancy) scene.wake();
          else scene._stop();
          return;
        }

        if (scene.opts && scene.opts.autoStart) {
          scene.wake();
          return;
        }

        const pageEl = scene.mount.closest('.page');
        if (key === 'consult' && consultancy) {
          scene.wake();
          return;
        }
        if (pageEl && pageEl.classList.contains('active')) {
          scene.wake();
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
