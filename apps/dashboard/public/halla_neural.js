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
      this.ready = false;
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

      if (this.opts.mode === 'neuron') {
        this._buildNeuronTree();
      } else if (this.opts.mode === 'consult') {
        this._buildConsultIntelligence();
      } else if (this.opts.mode === 'voice') {
        this._buildVoiceWave();
      } else if (this.opts.mode === 'ambient') {
        this._buildAmbientField();
      } else {
        this._buildNetwork();
      }

      this._spawnImpulses();
      window.addEventListener('resize', this._onResize);
      this.ready = true;
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

    _hexStringToNum(hex) {
      if (!hex) return null;
      hex = hex.trim();
      if (hex.startsWith('#')) hex = hex.slice(1);
      if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
      const num = parseInt(hex, 16);
      return Number.isNaN(num) ? null : num;
    }

    _consultTheme() {
      const styles = getComputedStyle(document.documentElement);
      const read = (name, fallback) => {
        const num = this._hexStringToNum(styles.getPropertyValue(name));
        return num != null ? num : fallback;
      };
      return {
        PURPLE: read('--accent', 0x7C3AED),
        ELECTRIC: read('--accent-mid', 0xA855F7),
        RED: read('--brand-red-dark', 0xDC2626),
        METAL: 0x100A1C,
        DEEP: 0x090712,
      };
    }

    _consultSeededRandom(seed) {
      let a = seed;
      return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    /**
     * Procedural "AI Intelligence Network": a semi-spherical node graph with
     * a bright concentrated core, a handful of radial pathways extending
     * outward, and a restrained black/purple/red hierarchy (mostly dim,
     * purple as primary illumination, red as a rare accent only).
     */
    _buildConsultIntelligence() {
      const theme = this._consultTheme();
      const PURPLE = theme.PURPLE;
      const ELECTRIC = theme.ELECTRIC;
      const RED = theme.RED;
      const mobile = isMobile();
      const rng = this._consultSeededRandom(1337);
      const scale = mobile ? 0.72 : 1;
      const sphereRadius = 1.7 * scale;

      this.opts.accent = PURPLE;
      this.opts.glow = ELECTRIC;

      this.camera.position.set(0, 0.08, mobile ? 7.6 : 6.6);
      this.camera.fov = mobile ? 44 : 36;
      this.camera.lookAt(0, 0, 0);
      this.camera.updateProjectionMatrix();

      const TIER_COLORS = {
        dim: 0x3B2166,
        purple: PURPLE,
        magenta: 0xD946EF,
        red: RED,
        highlight: 0xF8FAFC,
      };

      // ~80% dim, ~13% purple/magenta, ~5% red, ~2% highlight — purple stays
      // the dominant illumination; red only ever appears as a rare accent.
      function pickTier(importance) {
        const roll = rng();
        if (importance > 0.82) {
          if (roll < 0.05) return 'highlight';
          if (roll < 0.24) return 'red';
          if (roll < 0.6) return 'magenta';
          return 'purple';
        }
        if (importance > 0.5) {
          if (roll < 0.05) return 'red';
          if (roll < 0.22) return 'magenta';
          if (roll < 0.42) return 'purple';
          return 'dim';
        }
        if (roll < 0.03) return 'red';
        if (roll < 0.1) return 'purple';
        return 'dim';
      }

      const nodePositions = [];
      const nodeTiers = [];
      const clusterOf = [];

      // Main body: volume-filled sphere, denser toward the center.
      const bodyCount = mobile ? 130 : 260;
      for (let i = 0; i < bodyCount; i++) {
        const r = sphereRadius * Math.pow(rng(), 1.8);
        const theta = rng() * Math.PI * 2;
        const phi = Math.acos(2 * rng() - 1);
        const pos = new THREE.Vector3(
          r * Math.sin(phi) * Math.cos(theta),
          r * Math.sin(phi) * Math.sin(theta),
          r * Math.cos(phi) * 0.92
        );
        const importance = Math.max(0, 1 - r / sphereRadius);
        nodePositions.push(pos);
        nodeTiers.push(pickTier(importance));
        clusterOf.push(0);
      }

      // A few larger pathways radiating outward from the core, per the
      // "data -> intelligence -> automation" concept, without any labels.
      const pathwayDirs = [
        new THREE.Vector3(1, 0.35, 0.2),
        new THREE.Vector3(-0.9, -0.3, 0.4),
        new THREE.Vector3(0.3, -0.8, -0.5),
        new THREE.Vector3(-0.4, 0.85, -0.3),
      ];
      const pathwayNodeCount = mobile ? 5 : 8;
      pathwayDirs.forEach(function (dir, pi) {
        const d = dir.clone().normalize();
        for (let i = 1; i <= pathwayNodeCount; i++) {
          const t = i / pathwayNodeCount;
          const r = sphereRadius * (1 + t * 0.9);
          const jitter = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(0.12);
          nodePositions.push(d.clone().multiplyScalar(r).add(jitter));
          nodeTiers.push(t > 0.7 ? 'dim' : rng() < 0.3 ? 'magenta' : 'purple');
          clusterOf.push(1 + pi);
        }
      });

      // Nodes: one InstancedMesh, sized/colored by tier for visual hierarchy.
      const nodeGeo = new THREE.SphereGeometry(1, 8, 8);
      const nodeMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.92 });
      const nodesMesh = new THREE.InstancedMesh(nodeGeo, nodeMat, nodePositions.length);
      nodesMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(nodePositions.length * 3), 3);
      const dummy = new THREE.Object3D();
      const nodeSizes = [];
      nodePositions.forEach(function (pos, i) {
        const tier = nodeTiers[i];
        const size = tier === 'highlight' ? 0.05 + rng() * 0.02
          : tier === 'red' ? 0.04 + rng() * 0.018
          : tier === 'magenta' ? 0.03 + rng() * 0.014
          : 0.016 + rng() * 0.012;
        nodeSizes.push(size);
        dummy.position.copy(pos);
        dummy.scale.setScalar(size);
        dummy.updateMatrix();
        nodesMesh.setMatrixAt(i, dummy.matrix);
        nodesMesh.setColorAt(i, new THREE.Color(TIER_COLORS[tier]));
      });
      nodesMesh.instanceMatrix.needsUpdate = true;
      if (nodesMesh.instanceColor) nodesMesh.instanceColor.needsUpdate = true;
      this.root.add(nodesMesh);
      this.consultNodes = { mesh: nodesMesh, positions: nodePositions, sizes: nodeSizes, tiers: nodeTiers };

      // Connections: nearest-neighbor links within the sphere body, sequential
      // links along each outward pathway, and one bridge tying each pathway
      // back into its nearest body node.
      const edges = [];
      const maxNeighborDist = mobile ? 0.5 : 0.56;
      const seen = {};
      const bodyCount2 = bodyCount;
      for (let i = 0; i < bodyCount2; i++) {
        let linked = 0;
        for (let j = i + 1; j < bodyCount2 && linked < 4; j++) {
          const dist = nodePositions[i].distanceTo(nodePositions[j]);
          if (dist < maxNeighborDist && rng() < 0.45) {
            const key = i + '-' + j;
            if (seen[key]) continue;
            seen[key] = true;
            edges.push({ a: i, b: j });
            linked++;
          }
        }
      }
      for (let ci = 1; ci <= pathwayDirs.length; ci++) {
        const idxs = [];
        for (let idx = 0; idx < clusterOf.length; idx++) {
          if (clusterOf[idx] === ci) idxs.push(idx);
        }
        for (let k = 0; k < idxs.length - 1; k++) {
          edges.push({ a: idxs[k], b: idxs[k + 1] });
        }
        if (idxs.length) {
          let nearest = -1;
          let nearestDist = Infinity;
          for (let bi = 0; bi < bodyCount2; bi++) {
            const dist = nodePositions[bi].distanceTo(nodePositions[idxs[0]]);
            if (dist < nearestDist) {
              nearestDist = dist;
              nearest = bi;
            }
          }
          if (nearest >= 0) edges.push({ a: nearest, b: idxs[0] });
        }
      }

      const linePositions = new Float32Array(edges.length * 6);
      const lineColors = new Float32Array(edges.length * 6);
      const dimColor = new THREE.Color(0x5B21B6).multiplyScalar(0.35);
      edges.forEach(function (edge, i) {
        const a = nodePositions[edge.a];
        const b = nodePositions[edge.b];
        linePositions.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
        lineColors.set([dimColor.r, dimColor.g, dimColor.b, dimColor.r, dimColor.g, dimColor.b], i * 6);
      });
      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
      lineGeo.setAttribute('color', new THREE.BufferAttribute(lineColors, 3));
      const lines = new THREE.LineSegments(
        lineGeo,
        new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false })
      );
      this.root.add(lines);
      this.consultLines = lines;

      // Feed a small, restrained subset of edges into the existing impulse
      // system as data-flow paths (occasional pulses, not a screensaver).
      edges.forEach(function (edge, i) {
        const isPathwayEdge = edge.a >= bodyCount2 || edge.b >= bodyCount2;
        if (!isPathwayEdge && rng() > 0.1) return;
        const a = nodePositions[edge.a];
        const b = nodePositions[edge.b];
        const mid = a.clone().lerp(b, 0.5);
        const curve = new THREE.CatmullRomCurve3([a, mid, b]);
        this.branches.push({ curve, mesh: lines });
      }, this);

      // Concentrated central intelligence core — the one clearly brightest point.
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.09 * scale, 20, 20),
        new THREE.MeshBasicMaterial({ color: 0xF8FAFC, transparent: true, opacity: 0.95 })
      );
      this.root.add(core);
      const coreHalo = new THREE.Mesh(
        new THREE.SphereGeometry(0.22 * scale, 16, 16),
        new THREE.MeshBasicMaterial({ color: ELECTRIC, transparent: true, opacity: 0.16, depthWrite: false })
      );
      this.root.add(coreHalo);
      this.consultCore = core;

      // Subtle orbital rings — thin, low-opacity, barely-there depth cues.
      this.consultRings = [];
      const ringSpecs = mobile
        ? [{ r: sphereRadius * 1.12, tilt: [1.35, 0.2, 0], speed: 0.02 }]
        : [
            { r: sphereRadius * 1.1, tilt: [1.35, 0.2, 0], speed: 0.018 },
            { r: sphereRadius * 1.32, tilt: [1.0, -0.5, 0.3], speed: -0.013 },
          ];
      ringSpecs.forEach(function (spec) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(spec.r, 0.003, 6, 96),
          new THREE.MeshBasicMaterial({ color: PURPLE, transparent: true, opacity: 0.18, depthWrite: false })
        );
        ring.rotation.set(spec.tilt[0], spec.tilt[1], spec.tilt[2]);
        ring.userData.spin = spec.speed;
        this.root.add(ring);
        this.consultRings.push(ring);
      }, this);

      this.root.rotation.x = -0.04;
      this.root.position.x = 0;
      this.root.position.y = 0.2;
      this.root.scale.setScalar(mobile ? 0.92 : 1.08);
    }

    /**
     * Conversational signal for the AI Receptionist hero: a caller's voice
     * waveform that steadies and flows toward a simple phone glyph —
     * "caller -> understood -> action" without any literal text or robot.
     */
    _buildVoiceWave() {
      const mobile = isMobile();
      this.camera.position.set(0, 0, mobile ? 7.5 : 6.5);
      this.camera.lookAt(0, 0, 0);
      this.camera.updateProjectionMatrix();
      const barCount = mobile ? 22 : 34;
      const spread = mobile ? 3.2 : 4.6;
      this.voiceBars = [];
      const barMat = new THREE.MeshBasicMaterial({ color: this.opts.accent, transparent: true, opacity: 0.5 });
      for (let i = 0; i < barCount; i++) {
        const t = i / (barCount - 1);
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1, 0.05), barMat.clone());
        bar.position.x = (t - 0.5) * spread;
        bar.userData.phase = rand(0, Math.PI * 2);
        bar.userData.settle = t; // bars settle into a steady pulse near the phone end (t -> 1)
        this.root.add(bar);
        this.voiceBars.push(bar);
      }

      const phoneGroup = new THREE.Group();
      phoneGroup.position.x = spread / 2 + 0.55;
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.62, 1.05, 0.08),
        new THREE.MeshBasicMaterial({ color: this.opts.accent, transparent: true, opacity: 0.16 })
      );
      phoneGroup.add(body);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.34, 0.37, 32),
        new THREE.MeshBasicMaterial({ color: this.opts.glow, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
      );
      phoneGroup.add(ring);
      this.root.add(phoneGroup);
      this.voicePhone = phoneGroup;
      this.voicePhoneRing = ring;

      this.root.position.y = -0.1;
      this.root.scale.setScalar(mobile ? 0.85 : 1);
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
      const isConsult = this.opts.mode === 'consult';
      const impulseSize = isConsult ? 0.035 : (isNeuron ? 0.1 : 0.06);
      const impulseGeo = new THREE.SphereGeometry(impulseSize, 12, 12);
      const impulseColor = isConsult ? this.opts.glow : ACCENT_BRIGHT;
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
            color: impulseColor,
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
      } else if (this.opts.mode === 'consult') {
        this.root.rotation.y += dt * 0.022;
        const baseX = -0.04 + this.parallaxY * 0.1;
        this.root.rotation.x = baseX;
        this.root.rotation.y += this.parallaxX * dt * 0.08;
        if (this.consultNodes) {
          const nodes = this.consultNodes;
          const dummy = this._consultDummy || (this._consultDummy = new THREE.Object3D());
          for (let i = 0; i < nodes.positions.length; i++) {
            const pulse = 1 + Math.sin(t * 0.8 + i * 0.37) * (nodes.tiers[i] === 'dim' ? 0.05 : 0.15);
            dummy.position.copy(nodes.positions[i]);
            dummy.scale.setScalar(nodes.sizes[i] * pulse);
            dummy.updateMatrix();
            nodes.mesh.setMatrixAt(i, dummy.matrix);
          }
          nodes.mesh.instanceMatrix.needsUpdate = true;
        }
        if (this.consultLines) {
          this.consultLines.material.opacity = 0.5 + Math.sin(t * 0.4) * 0.08;
        }
        if (this.consultCore) {
          const pulse = 1 + Math.sin(t * 1.1) * 0.08;
          this.consultCore.scale.setScalar(pulse);
          this.consultCore.material.opacity = 0.85 + Math.sin(t * 1.1) * 0.1;
        }
        if (this.consultRings) {
          this.consultRings.forEach(function (ring) {
            ring.rotation.z += dt * (ring.userData.spin || 0.015);
          });
        }
      } else if (this.opts.mode === 'voice') {
        if (this.voiceBars) {
          this.voiceBars.forEach(function (bar) {
            const raw = Math.sin(t * 2.2 + bar.userData.phase) * 0.5 + Math.sin(t * 4.1 + bar.userData.phase * 1.7) * 0.2;
            const settle = bar.userData.settle;
            const amplitude = 0.35 + raw * (0.9 - settle * 0.6);
            const height = 0.15 + Math.abs(amplitude);
            bar.scale.y = height;
            bar.material.opacity = 0.25 + settle * 0.35 + Math.abs(raw) * 0.15;
          });
        }
        if (this.voicePhoneRing) {
          this.voicePhoneRing.scale.setScalar(1 + Math.sin(t * 1.4) * 0.06);
          this.voicePhoneRing.material.opacity = 0.4 + Math.sin(t * 1.4) * 0.15;
        }
        this.root.rotation.y = this.parallaxX * 0.15;
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
      if (!document.hidden) {
        if (prefersReducedMotion()) {
          if (this.ready) this.renderer.render(this.scene, this.camera);
        } else {
          this._start();
        }
      }
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

  function sceneReady(scene) {
    return !!(scene && scene.ready && scene.renderer);
  }

  function usesReactConsult3D() {
    const mount = document.getElementById('consultNeuralMount');
    return (
      window.HALLA_EMBEDDED === true &&
      mount &&
      mount.dataset.react3d === 'true' &&
      mount.querySelector('canvas')
    );
  }

  function releaseConsultScene() {
    ['consult', 'consultPage'].forEach(function (key) {
      const scene = scenes.get(key);
      if (!scene) return;
      scene.destroy();
      scenes.delete(key);
    });
  }

  function initScenes() {
    if (typeof THREE === 'undefined') return false;

    if (usesReactConsult3D()) releaseConsultScene();

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
        mode: 'voice',
        parallax: true,
      }));
    }

    if (!usesReactConsult3D()) {
      const consultMount = document.getElementById('consultNeuralMount');
      if (consultMount && !scenes.get('consult')) {
        consultMount.querySelector('.consult-neural-react-stage')?.remove();
        scenes.set('consult', new NeuralPathScene('consultNeuralMount', {
          mode: 'consult',
          parallax: true,
          accent: 0x7C3AED,
          glow: 0xA855F7,
        }));
      }
    }

    return Array.from(scenes.values()).some(sceneReady);
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
    if (prefersReducedMotion()) {
      if (!usesReactConsult3D() && typeof THREE !== 'undefined') {
        initScenes();
        scenes.forEach(function (scene) {
          if (scene && scene.mount && scene.ready) scene.wake();
        });
      }
      return;
    }
    if (initScenes()) return;
    if (retryTimer) return;

    let attempts = 0;
    retryTimer = setInterval(function () {
      attempts += 1;
      if (initScenes() || attempts >= 80) {
        clearInterval(retryTimer);
        retryTimer = null;
      }
    }, 100);
  }

  window.HallaNeural = {
    init,
    releaseConsult: releaseConsultScene,
    refreshForPage(page) {
      init();
      const consultancy = isConsultancyPage(page);
      setConsultNeuralActive(consultancy);

      if (usesReactConsult3D() && consultancy) {
        releaseConsultScene();
      }

      scenes.forEach((scene, key) => {
        if (!scene || !scene.mount || !scene.ready) return;

        if (key === 'site') {
          if (consultancy) scene._stop();
          else scene.wake();
          return;
        }

        if (key === 'consult' || key === 'consultPage') {
          if (usesReactConsult3D()) {
            scene._stop();
            return;
          }
        }

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
