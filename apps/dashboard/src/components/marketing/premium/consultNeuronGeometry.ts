import * as THREE from "three";

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export function buildConsultNeuron(mobile = false) {
  const curves: THREE.CatmullRomCurve3[] = [];
  const depth = mobile ? 4 : 5;
  const branchesPerLevel = mobile ? [8, 7, 5, 4, 3] : [10, 8, 6, 5, 4, 3];

  function addBranches(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    level: number,
    maxLevel: number,
    length: number,
  ) {
    if (level >= maxLevel) return;
    const count = branchesPerLevel[level] || 3;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + rand(-0.3, 0.3);
      const tilt = rand(0.35, 0.85);
      const dir = direction
        .clone()
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), angle)
        .applyAxisAngle(
          new THREE.Vector3(1, 0, 0),
          tilt * (level % 2 === 0 ? 1 : -1),
        )
        .normalize();

      const segLen = length * rand(0.55, 0.95) * (1 - level * 0.16);
      const end = origin.clone().add(dir.clone().multiplyScalar(segLen));
      curves.push(
        new THREE.CatmullRomCurve3([
          origin.clone(),
          origin
            .clone()
            .lerp(end, 0.35)
            .add(new THREE.Vector3(rand(-0.4, 0.4), rand(-0.3, 0.3), rand(-0.4, 0.4))),
          end.clone(),
        ]),
      );

      if (level < maxLevel - 1) {
        addBranches(end, dir, level + 1, maxLevel, length * 0.72);
      }
    }
  }

  const somaPos = new THREE.Vector3(2.1, -0.05, 0);
  addBranches(somaPos, new THREE.Vector3(0.15, 1, 0.1), 0, depth, 6.0);
  addBranches(somaPos, new THREE.Vector3(-0.4, -0.75, 0.25), 0, depth - 1, 4.7);
  addBranches(somaPos, new THREE.Vector3(0.5, 0.2, -0.8), 0, depth - 1, 4.1);
  addBranches(somaPos, new THREE.Vector3(-0.65, 0.55, 0.45), 0, depth - 2, 3.3);

  return { curves, somaPos, somaRadius: mobile ? 0.95 : 1.28 };
}
