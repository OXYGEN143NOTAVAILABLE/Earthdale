import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ISLAND_DEFS } from './catalog';
import { groundHeightAtSim, toWorldX, toWorldZ } from './lowPolyWorld';
import { CULTURES } from './techAndCultures';
import type {
  AirGliderEntity,
  ArrivalCandidate,
  BoatEntity,
  BuildingEntity,
  BuildingType,
  ExploreRuinEntity,
  LivestockEntity,
  SeasonType,
  SkyBridgeEntity,
  SkyCablewayEntity,
  VillagerEntity,
  WeatherType,
  WildHerdEntity,
  WildNodeEntity,
  WorldLandmark,
} from './types';

function mergeNormalizedParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const normalized = parts.map((raw) => {
    const g = raw.index ? raw.toNonIndexed() : raw;
    if (g !== raw) raw.dispose();
    if (g.getAttribute('uv')) g.deleteAttribute('uv');
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    return g;
  });
  const merged = mergeGeometries(normalized, false);
  normalized.forEach((g) => g.dispose());
  return merged ?? new THREE.BufferGeometry();
}

export function createGrassTuftGeometry(): THREE.BufferGeometry {
  const specs: [number, number, number, number, number, number][] = [
    [0.044, 0.48, 0.0, 0.0, 0.09, 0.16],
    [0.038, 0.4, 0.055, 0.025, -0.34, 0.24],
    [0.038, 0.42, -0.055, 0.02, 0.36, -0.2],
    [0.034, 0.34, 0.015, -0.055, -0.22, -0.38],
    [0.032, 0.36, -0.035, -0.04, 0.24, 0.34],
    [0.03, 0.28, 0.06, -0.03, -0.42, -0.18],
  ];
  const parts = specs.map(([r, h, ox, oz, rx, rz]) => {
    const blade = new THREE.ConeGeometry(r, h, 3);
    blade.translate(0, h * 0.5, 0);
    blade.rotateX(rx);
    blade.rotateZ(rz);
    blade.translate(ox, 0, oz);
    return blade;
  });
  return mergeNormalizedParts(parts);
}

export function createFlowerStemGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const stem = new THREE.CylinderGeometry(0.016, 0.024, 0.34, 4);
  stem.translate(0, 0.17, 0);
  parts.push(stem);
  for (const side of [-1, 1]) {
    const leaf = new THREE.ConeGeometry(0.045, 0.19, 3);
    leaf.translate(0, 0.09, 0);
    leaf.rotateZ(side * 0.78);
    leaf.translate(side * 0.025, 0.045, 0);
    parts.push(leaf);
  }
  return mergeNormalizedParts(parts);
}

export function createFlowerBloomGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI * 2;
    const petal = new THREE.ConeGeometry(0.062, 0.125, 4);
    petal.rotateX(Math.PI * 0.44);
    petal.rotateY(ang);
    petal.translate(Math.sin(ang) * 0.062, 0.34, Math.cos(ang) * 0.062);
    parts.push(petal);
  }
  const bud = new THREE.IcosahedronGeometry(0.048, 0);
  bud.translate(0, 0.35, 0);
  parts.push(bud);
  return mergeNormalizedParts(parts);
}

export function createFernBushGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const ang = (i / 7) * Math.PI * 2 + 0.18;
    const frond = new THREE.ConeGeometry(0.082, 0.52, 3);
    frond.translate(0, 0.26, 0);
    frond.rotateX(0.82);
    frond.rotateY(ang);
    parts.push(frond);
  }
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2 + 0.52;
    const inner = new THREE.ConeGeometry(0.062, 0.38, 3);
    inner.translate(0, 0.19, 0);
    inner.rotateX(0.42);
    inner.rotateY(ang);
    parts.push(inner);
  }
  return mergeNormalizedParts(parts);
}

const matCache = new Map<string, THREE.MeshStandardMaterial>();

export function getFlatMaterial(
  color: number | string,
  opts: {
    roughness?: number;
    metalness?: number;
    emissive?: number | string;
    emissiveIntensity?: number;
    transparent?: boolean;
    opacity?: number;
  } = {},
): THREE.MeshStandardMaterial {
  const rough = opts.roughness ?? 0.88;
  const metal = opts.metalness ?? 0.02;
  const envInt = metal > 0.35 ? 0.52 : 0.12;
  const cHex = new THREE.Color(color).getHexString();
  const eHex = opts.emissive !== undefined ? new THREE.Color(opts.emissive).getHexString() : '000000';
  const key = `${cHex}_${rough}_${metal}_${eHex}_${opts.emissiveIntensity ?? 0}_${opts.opacity ?? 1}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      flatShading: true,
      roughness: rough,
      metalness: metal,
      envMapIntensity: envInt,
      emissive: opts.emissive !== undefined ? new THREE.Color(opts.emissive) : new THREE.Color(0x000000),
      emissiveIntensity: opts.emissiveIntensity ?? 0,
      transparent: opts.transparent ?? false,
      opacity: opts.opacity ?? 1,
    });
    matCache.set(key, m);
  }
  return m;
}

export function getClayMaterial(
  color: number | string,
  opts: {
    roughness?: number;
    metalness?: number;
    emissive?: number | string;
    emissiveIntensity?: number;
    transparent?: boolean;
    opacity?: number;
  } = {},
): THREE.MeshStandardMaterial {
  const rough = opts.roughness ?? 0.86;
  const metal = opts.metalness ?? 0.02;
  const envInt = metal > 0.35 ? 0.52 : 0.12;
  const cHex = new THREE.Color(color).getHexString();
  const eHex = opts.emissive !== undefined ? new THREE.Color(opts.emissive).getHexString() : '000000';
  const key = `clay_${cHex}_${rough}_${metal}_${eHex}_${opts.emissiveIntensity ?? 0}_${opts.opacity ?? 1}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      flatShading: false,
      roughness: rough,
      metalness: metal,
      envMapIntensity: envInt,
      emissive: opts.emissive !== undefined ? new THREE.Color(opts.emissive) : new THREE.Color(0x000000),
      emissiveIntensity: opts.emissiveIntensity ?? 0,
      transparent: opts.transparent ?? false,
      opacity: opts.opacity ?? 1,
    });
    matCache.set(key, m);
  }
  return m;
}

function setShadows(group: THREE.Object3D, cast = true, receive = true) {
  group.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      child.castShadow = cast;
      child.receiveShadow = receive;
    }
  });
}

export function createLowPolyTree(
  kind: 'pine' | 'oak' | 'orchard' | 'cedar' | 'lantern',
  scale: number,
  season: SeasonType,
  weather: WeatherType,
): THREE.Group {
  const group = new THREE.Group();
  const snow = weather === 'snow' || season === 'winter';
  const autumn = season === 'autumn' && !snow;
  const trunkMat = getClayMaterial(0x633c26, { roughness: 0.9 });
  const barkDarkMat = getClayMaterial(0x462919, { roughness: 0.94 });
  const twigMat = getClayMaterial(0x884426, { roughness: 0.88 });

  const canopyPivot = new THREE.Group();
  canopyPivot.position.y = 1.25;
  group.add(canopyPivot);
  group.userData.canopyPivot = canopyPivot;

  if (kind === 'pine' || kind === 'cedar') {
    const isCedar = kind === 'cedar';
    const roots = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.6, 0.72, 7), barkDarkMat);
    roots.position.y = 0.04;
    group.add(roots);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.31, isCedar ? 1.85 : 1.52, 7), trunkMat);
    trunk.position.y = isCedar ? 0.96 : 0.8;
    group.add(trunk);

    // Crooked lower reddish-brown forest twigs peeking beneath pine boughs (matching forest clearing art)
    for (let b = 0; b < 4; b++) {
      const ang = b * 1.58 + 0.4;
      const twig = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.056, 0.74 + (b % 2) * 0.2, 5), twigMat);
      twig.position.set(Math.cos(ang) * 0.34, 0.78 + (b % 2) * 0.24, Math.sin(ang) * 0.34);
      twig.rotation.z = -Math.cos(ang) * 0.88;
      twig.rotation.x = Math.sin(ang) * 0.88;
      group.add(twig);

      const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.032, 0.34, 4), twigMat);
      fork.position.set(Math.cos(ang) * 0.62, 0.92 + (b % 2) * 0.24, Math.sin(ang) * 0.62);
      fork.rotation.z = -Math.cos(ang + 0.45) * 0.52;
      fork.rotation.x = Math.sin(ang + 0.45) * 0.52;
      group.add(fork);
    }

    const leafDark = getFlatMaterial(snow ? 0x45635a : autumn ? 0x4b5c2d : isCedar ? 0x213d20 : 0x1f3d1d, { roughness: 0.86 });
    const leafMid = getFlatMaterial(snow ? 0x5c7d73 : autumn ? 0x768535 : isCedar ? 0x355c27 : 0x385e25, { roughness: 0.82 });
    const leafTip = getFlatMaterial(snow ? 0x739188 : autumn ? 0xa3973d : isCedar ? 0x5c852e : 0x6b942d, { roughness: 0.78 });
    const snowMat = getClayMaterial(0xf0f6fa, { roughness: 0.7 });

    const tiers = [
      { r: isCedar ? 1.56 : 1.4, h: 1.44, y: 1.56, mat: leafDark, lobes: 4 },
      { r: isCedar ? 1.32 : 1.18, h: 1.32, y: 2.34, mat: leafMid, lobes: 4 },
      { r: isCedar ? 1.04 : 0.92, h: 1.2, y: 3.06, mat: leafDark, lobes: 3 },
      { r: 0.74, h: 1.06, y: 3.72, mat: leafMid, lobes: 3 },
      { r: 0.46, h: 0.88, y: 4.3, mat: leafTip, lobes: 0 },
    ];
    tiers.forEach((t, idx) => {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(t.r, t.h, 8), t.mat);
      cone.position.y = t.y - 1.25;
      cone.rotation.y = idx * 0.48;
      canopyPivot.add(cone);

      // Asymmetric feathery branch sub-boughs for organic conifer silhouette
      for (let l = 0; l < t.lobes; l++) {
        const lAng = (l / t.lobes) * Math.PI * 2 + idx * 0.85;
        const lobe = new THREE.Mesh(new THREE.ConeGeometry(t.r * 0.48, t.h * 0.72, 6), idx >= 2 ? leafTip : t.mat);
        lobe.position.set(Math.cos(lAng) * t.r * 0.42, t.y - 1.38, Math.sin(lAng) * t.r * 0.42);
        lobe.rotation.z = -Math.cos(lAng) * 0.34;
        lobe.rotation.x = Math.sin(lAng) * 0.34;
        canopyPivot.add(lobe);
      }

      if (snow) {
        const cap = new THREE.Mesh(new THREE.ConeGeometry(t.r * 0.78, t.h * 0.52, 8), snowMat);
        cap.position.y = t.y + t.h * 0.28 - 1.25;
        cap.rotation.y = idx * 0.48;
        canopyPivot.add(cap);
      }
    });
  } else {
    // Gnarled ancient broadleaf oak / orchard tree with fluted buttress roots, twisted trunk & layered leaf clusters
    const rootRing = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.56, 0.54, 7), barkDarkMat);
    rootRing.position.y = 0.22;
    group.add(rootRing);
    for (let r = 0; r < 5; r++) {
      const ang = (r / 5) * Math.PI * 2 + 0.3;
      const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.19, 0.72, 5), barkDarkMat);
      rib.position.set(Math.cos(ang) * 0.32, 0.28, Math.sin(ang) * 0.32);
      rib.rotation.z = -Math.cos(ang) * 0.68;
      rib.rotation.x = Math.sin(ang) * 0.68;
      group.add(rib);
    }

    const trunkLower = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.34, 0.92, 7), trunkMat);
    trunkLower.position.set(0.02, 0.72, 0);
    trunkLower.rotation.z = -0.09;
    group.add(trunkLower);

    const trunkUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 0.88, 7), trunkMat);
    trunkUpper.position.set(-0.04, 1.44, 0.03);
    trunkUpper.rotation.z = 0.14;
    group.add(trunkUpper);

    const branchSpecs: [number, number, number, number, number, number][] = [
      [0.42, 1.82, 0.1, 0.12, 1.06, -0.78],
      [-0.44, 1.72, -0.14, 0.11, 0.96, 0.72],
      [0.06, 1.88, 0.38, 0.1, 0.84, 0.18],
      [-0.12, 1.9, -0.34, 0.09, 0.76, -0.2],
    ];
    for (let bi = 0; bi < branchSpecs.length; bi++) {
      const [bx, by, bz, rTop, len, rz] = branchSpecs[bi];
      const br = new THREE.Mesh(new THREE.CylinderGeometry(rTop * 0.72, rTop * 1.15, len, 6), trunkMat);
      br.position.set(bx, by, bz);
      br.rotation.z = rz;
      if (bi === 2) br.rotation.x = 0.62;
      if (bi === 3) br.rotation.x = -0.58;
      group.add(br);
    }

    let crownColor = 0x45732c;
    let accentColor = 0x679c38;
    let highlightColor = 0x91bf44;
    if (snow) {
      crownColor = 0x869c95;
      accentColor = 0xdbe7ee;
      highlightColor = 0xf1f6fa;
    } else if (season === 'autumn') {
      crownColor = 0xbe612d;
      accentColor = 0xdf8f3c;
      highlightColor = 0xecb24a;
    } else if (season === 'spring' && kind === 'orchard') {
      crownColor = 0x6c9460;
      accentColor = 0xf4b2c4;
      highlightColor = 0xfad4df;
    } else if (kind === 'lantern') {
      crownColor = 0x356857;
      accentColor = 0x4c8d74;
      highlightColor = 0x64a78b;
    }

    const crownMat = getFlatMaterial(crownColor, { roughness: 0.84 });
    const accentMat = getFlatMaterial(accentColor, { roughness: 0.78 });
    const hiMat = getFlatMaterial(highlightColor, { roughness: 0.76 });

    // Layered broad canopy puffs perched on limbs so gnarled bark reads clearly underneath
    const puffs: [number, number, number, number, THREE.MeshStandardMaterial, number][] = [
      [0.02, 2.46, 0.02, 1.06, crownMat, 0.74],
      [-0.78, 2.18, 0.34, 0.78, accentMat, 0.72],
      [0.82, 2.24, -0.26, 0.82, accentMat, 0.72],
      [-0.24, 2.32, -0.68, 0.74, crownMat, 0.74],
      [0.26, 2.28, 0.68, 0.72, accentMat, 0.7],
      [0.32, 2.86, 0.16, 0.68, hiMat, 0.68],
      [-0.36, 2.76, -0.14, 0.62, hiMat, 0.68],
    ];
    for (const [px, py, pz, pr, mat, sy] of puffs) {
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(pr, 1), mat);
      mesh.scale.set(1.08, sy, 1.04);
      mesh.position.set(px, py - 1.25, pz);
      canopyPivot.add(mesh);
    }

    if (kind === 'orchard' && season === 'autumn') {
      const appleMat = getFlatMaterial(0xd9413d, { roughness: 0.4 });
      for (const [ax, ay, az] of [
        [-0.62, 1.98, 0.65],
        [0.58, 2.04, 0.62],
        [0.1, 2.58, 0.72],
      ]) {
        const apple = new THREE.Mesh(new THREE.DodecahedronGeometry(0.13, 0), appleMat);
        apple.position.set(ax, ay - 1.25, az);
        canopyPivot.add(apple);
      }
    }
  }

  group.scale.setScalar(scale * 1.15);
  setShadows(group, true, true);
  return group;
}

export function createWildNodeGroup(
  node: WildNodeEntity,
  season: SeasonType,
  weather: WeatherType,
): THREE.Group {
  const g = new THREE.Group();
  const snow = weather === 'snow' || season === 'winter';

  if (node.kind === 'tree') {
    return createLowPolyTree(node.variant ?? 'oak', node.scale ?? 1.0, season, weather);
  }

  if (node.kind === 'berry_bush') {
    g.userData.isBush = true;
    const bushMat = getFlatMaterial(snow ? 0x678379 : 0x3b7440, { roughness: 0.86 });
    for (const [bx, by, bz, r] of [
      [0, 0.34, 0, 0.42],
      [-0.28, 0.26, 0.18, 0.3],
      [0.26, 0.28, -0.15, 0.32],
    ]) {
      const puff = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), bushMat);
      puff.position.set(bx, by, bz);
      g.add(puff);
    }
    if (node.amount > 2) {
      const berryMat = getFlatMaterial(0xd94158, { roughness: 0.42 });
      for (const [rx, ry, rz] of [
        [-0.22, 0.44, 0.28],
        [0.14, 0.52, 0.26],
        [0.3, 0.36, 0.06],
        [-0.08, 0.55, -0.22],
      ]) {
        const berry = new THREE.Mesh(new THREE.OctahedronGeometry(0.075, 0), berryMat);
        berry.position.set(rx, ry, rz);
        g.add(berry);
      }
    }
  } else if (node.kind === 'branch_pile') {
    const barkMat = getClayMaterial(0x693d24, { roughness: 0.9 });
    const heartMat = getClayMaterial(0xdcb889, { roughness: 0.82 });
    const plankMat = getClayMaterial(0x935330, { roughness: 0.85 });
    // Cut stump + stacked timber planks/branches
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.32, 0.34, 7), barkMat);
    stump.position.set(-0.34, 0.16, 0.14);
    g.add(stump);
    const heart = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.04, 7), heartMat);
    heart.position.set(-0.34, 0.34, 0.14);
    g.add(heart);
    for (let i = 0; i < 4; i++) {
      const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.072, 0.95, 6), i % 2 === 0 ? barkMat : plankMat);
      branch.rotation.z = Math.PI / 2;
      branch.rotation.y = (i - 1.5) * 0.36 + 0.18;
      branch.position.set(0.18, 0.08 + (i > 1 ? 0.09 : 0), (i - 1.5) * 0.08);
      g.add(branch);
    }
  } else if (node.kind === 'flint_pile') {
    const flintMat = getFlatMaterial(0x616975, { roughness: 0.65, metalness: 0.18 });
    const stoneMat = getFlatMaterial(0x8e887d, { roughness: 0.9 });
    for (let i = 0; i < 4; i++) {
      const shard = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.18 + (i % 2) * 0.06, 0),
        i % 2 === 0 ? flintMat : stoneMat,
      );
      shard.position.set(((i % 2) - 0.5) * 0.34, 0.14, (Math.floor(i / 2) - 0.5) * 0.28);
      shard.scale.set(1.2, 0.72, 1.0);
      g.add(shard);
    }
  } else if (node.kind === 'stone_boulder') {
    const stoneMat = getClayMaterial(0x7c7b77, { roughness: 0.92 });
    const stoneLight = getClayMaterial(0x9a9892, { roughness: 0.88 });
    const mossMat = getClayMaterial(snow ? 0xd9e5ee : 0x567f36, { roughness: 0.88 });
    const main = new THREE.Mesh(new THREE.DodecahedronGeometry(0.64, 1), stoneMat);
    main.scale.set(1.26, 0.84, 1.04);
    main.position.y = 0.4;
    g.add(main);
    const side = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42, 1), stoneLight);
    side.position.set(0.5, 0.24, 0.26);
    side.scale.set(1.12, 0.82, 0.95);
    g.add(side);
    const chip = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3, 0), stoneLight);
    chip.position.set(-0.46, 0.18, -0.22);
    g.add(chip);
    const moss = new THREE.Mesh(new THREE.DodecahedronGeometry(0.34, 1), mossMat);
    moss.scale.set(1.18, 0.32, 0.95);
    moss.position.set(-0.08, 0.82, 0.06);
    g.add(moss);
    if (node.scale) g.scale.setScalar(node.scale);
  } else if (node.kind === 'copper_vein' || node.kind === 'iron_vein') {
    const rockMat = getFlatMaterial(0x635d55, { roughness: 0.92 });
    const oreMat = getFlatMaterial(
      node.kind === 'copper_vein' ? 0xd47a3c : 0x7b8ea3,
      { roughness: 0.34, metalness: 0.72 },
    );
    const boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(0.75, 0), rockMat);
    boulder.scale.set(1.25, 0.88, 1.0);
    boulder.position.y = 0.48;
    g.add(boulder);
    for (const [ox, oy, oz] of [
      [-0.36, 0.72, 0.36],
      [0.32, 0.62, 0.32],
      [0.05, 0.92, -0.15],
    ]) {
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), oreMat);
      crystal.position.set(ox, oy, oz);
      crystal.rotation.set(0.4, ox, 0.2);
      g.add(crystal);
    }
  }

  setShadows(g, true, true);
  return g;
}

function hashModelKey(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createSpringPoolGroup(lit: boolean): THREE.Group {
  const g = new THREE.Group();
  const bankMat = getClayMaterial(0x5f7e41, { roughness: 0.94 });
  const rimSandMat = getClayMaterial(0x9a8969, { roughness: 0.94 });

  // Natural mossy & sandy basin shelf cradling the warm spring pool (no blocky boulder ring)
  const outerBank = new THREE.Mesh(new THREE.TorusGeometry(1.92, 0.24, 6, 18), bankMat);
  outerBank.rotation.x = Math.PI / 2;
  outerBank.scale.set(1.0, 0.72, 0.45);
  outerBank.position.y = 0.08;
  g.add(outerBank);

  const innerBank = new THREE.Mesh(new THREE.TorusGeometry(1.76, 0.14, 5, 16), rimSandMat);
  innerBank.rotation.x = Math.PI / 2;
  innerBank.scale.set(1.0, 0.72, 0.4);
  innerBank.position.y = 0.05;
  g.add(innerBank);

  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x5fb4c6,
    flatShading: true,
    roughness: 0.5,
    metalness: 0.02,
    envMapIntensity: 0.14,
    emissive: lit ? 0x2c6f7a : 0x163d44,
    emissiveIntensity: lit ? 0.2 : 0.06,
  });
  const pool = new THREE.Mesh(new THREE.CylinderGeometry(1.82, 1.68, 0.14, 16), waterMat);
  pool.scale.set(1, 1, 0.72);
  pool.position.y = 0.04;
  pool.userData.ownMaterial = true;
  g.add(pool);

  const rippleRing = new THREE.Mesh(
    new THREE.RingGeometry(0.76, 0.9, 16),
    new THREE.MeshBasicMaterial({ color: 0xbef5fc, side: THREE.DoubleSide, transparent: true, opacity: 0.55 }),
  );
  rippleRing.rotation.x = -Math.PI / 2;
  rippleRing.position.y = 0.16;
  rippleRing.userData.ownMaterial = true;
  rippleRing.userData.isRipple = true;
  g.add(rippleRing);

  setShadows(g, false, true);
  return g;
}

export function createSkyBridgeGroup(bridge: SkyBridgeEntity, lit: boolean): THREE.Group {
  const g = new THREE.Group();
  const x1 = toWorldX(bridge.x1);
  const z1 = toWorldZ(bridge.y1);
  const y1 = groundHeightAtSim(bridge.x1, bridge.y1);
  const x2 = toWorldX(bridge.x2);
  const z2 = toWorldZ(bridge.y2);
  const y2 = groundHeightAtSim(bridge.x2, bridge.y2);

  const midX = (x1 + x2) * 0.5;
  const midZ = (z1 + z2) * 0.5;
  const dx = x2 - x1;
  const dz = z2 - z1;
  const horizLen = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz);

  const plankMat = getClayMaterial(bridge.tier === 2 ? 0xa59b8d : 0x8d4e2d, { roughness: 0.84 });
  const trimMat = getClayMaterial(bridge.tier === 2 ? 0xc8beb0 : 0x5f321b, { roughness: 0.82 });
  const stonePierMat = getFlatMaterial(0x736b60, { roughness: 0.94 });
  const ropeMat = getFlatMaterial(0xcab68a, { roughness: 0.9 });
  const lanternMat = getFlatMaterial(lit ? 0xfde047 : 0x9aa6ad, {
    emissive: lit ? 0xf59e0b : 0x000000,
    emissiveIntensity: lit ? 1.45 : 0,
    roughness: 0.3,
  });

  // Always place solid masonry abutments anchored down into both island cliff rims
  for (const [px, py, pz] of [
    [x1, y1, z1],
    [x2, y2, z2],
  ]) {
    const abutment = new THREE.Mesh(new THREE.BoxGeometry(2.15, 1.45, 2.15), stonePierMat);
    abutment.position.set(px, py - 0.52, pz);
    g.add(abutment);
    for (const side of [-0.82, 0.82]) {
      const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 1.05, 5), trimMat);
      stake.position.set(px + side * Math.cos(yaw), py + 0.42, pz - side * Math.sin(yaw));
      g.add(stake);
    }
  }

  const ratio = bridge.built ? 1 : Math.max(0, Math.min(1, bridge.progress));
  if (ratio <= 0.01) {
    for (const [px, py, pz] of [
      [x1, y1, z1],
      [x2, y2, z2],
    ]) {
      const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), ropeMat);
      marker.position.set(px, py + 1.05, pz);
      g.add(marker);
    }
    setShadows(g, true, true);
    return g;
  }

  const spanGroup = new THREE.Group();
  spanGroup.position.set(midX, 0, midZ);
  spanGroup.rotation.y = yaw;

  const segments = Math.max(10, Math.round(horizLen / 1.35));
  const builtSegs = bridge.built ? segments : Math.max(1, Math.floor(segments * ratio));
  const archH = bridge.tier === 2 ? 1.8 : 0.9;
  const upVec = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i <= builtSegs; i++) {
    const t = i / segments;
    const zLocal = (t - 0.5) * horizLen;
    const yLocal = y1 + (y2 - y1) * t + Math.sin(t * Math.PI) * archH;

    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(1.85, bridge.tier === 2 ? 0.34 : 0.2, (horizLen / segments) * 0.94),
      plankMat,
    );
    plank.position.set(0, yLocal, zLocal);
    spanGroup.add(plank);

    if (i % 2 === 0) {
      for (const side of [-0.84, 0.84]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.68, 0.14), trimMat);
        post.position.set(side, yLocal + 0.38, zLocal);
        spanGroup.add(post);
      }
    }
    if (i === 0 || i === segments) {
      const bulb = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), lanternMat);
      bulb.position.set(0.86, yLocal + 0.84, zLocal);
      spanGroup.add(bulb);
    }
  }

  for (const side of [-0.84, 0.84]) {
    for (let i = 0; i < builtSegs; i++) {
      const t0 = i / segments;
      const t1 = (i + 1) / segments;
      const z0 = (t0 - 0.5) * horizLen;
      const z1l = (t1 - 0.5) * horizLen;
      const y0 = y1 + (y2 - y1) * t0 + Math.sin(t0 * Math.PI) * archH + 0.64;
      const y1l = y1 + (y2 - y1) * t1 + Math.sin(t1 * Math.PI) * archH + 0.64;
      const p0 = new THREE.Vector3(side, y0, z0);
      const p1 = new THREE.Vector3(side, y1l, z1l);
      const segVec = p1.clone().sub(p0);
      const segLen = segVec.length();
      if (segLen > 0.01) {
        const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, segLen, 4), ropeMat);
        rail.position.copy(p0).add(p1).multiplyScalar(0.5);
        rail.quaternion.setFromUnitVectors(upVec, segVec.normalize());
        spanGroup.add(rail);
      }
    }
  }

  g.add(spanGroup);
  setShadows(g, true, true);
  return g;
}

export function createMemorialStoneGroup(memId = 'mem'): THREE.Group {
  const g = new THREE.Group();
  const stoneMat = getFlatMaterial(0x7c7b77, { roughness: 0.94 });
  const trimMat = getFlatMaterial(0xa7a299, { roughness: 0.86 });
  const isStatue = hashModelKey(memId) % 2 === 0;
  if (isStatue) {
    // Carved villager guardian statue on stepped stone plinth
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.24, 0.68), stoneMat);
    plinth.position.y = 0.12;
    g.add(plinth);
    const pedestal = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.5, 0.44), trimMat);
    pedestal.position.y = 0.48;
    g.add(pedestal);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.21, 0.56, 7), trimMat);
    body.position.y = 1.0;
    g.add(body);
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 1), trimMat);
    head.position.y = 1.38;
    g.add(head);
    const shield = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.34, 0.08), stoneMat);
    shield.position.set(0.16, 0.96, 0.14);
    g.add(shield);
  } else {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.22, 0.52), stoneMat);
    base.position.y = 0.11;
    g.add(base);
    const stele = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.72, 0.2), trimMat);
    stele.position.y = 0.54;
    g.add(stele);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.22, 4), trimMat);
    cap.position.y = 1.0;
    cap.rotation.y = Math.PI / 4;
    g.add(cap);
  }
  setShadows(g, true, true);
  return g;
}

export function createSuggestionStakeGroup(buildingType: BuildingType): THREE.Group {
  const g = new THREE.Group();
  const woodMat = getFlatMaterial(0x8e643e, { roughness: 0.86 });
  const flagColor =
    buildingType === 'farm_plot' || buildingType === 'pasture'
      ? 0x74c294
      : buildingType === 'watchtower' || buildingType === 'barracks'
        ? 0xe38589
        : 0xfbbf24;
  const flagMat = getFlatMaterial(flagColor, {
    emissive: flagColor,
    emissiveIntensity: 0.45,
    roughness: 0.4,
  });

  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 1.25, 5), woodMat);
  post.position.y = 0.62;
  g.add(post);
  const pennant = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.55, 3), flagMat);
  pennant.rotation.z = -Math.PI / 2;
  pennant.position.set(0.28, 1.08, 0);
  g.add(pennant);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.15, 1.32, 16),
    new THREE.MeshBasicMaterial({ color: flagColor, side: THREE.DoubleSide, transparent: true, opacity: 0.6 }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  ring.userData.ownMaterial = true;
  g.add(ring);

  setShadows(g, true, false);
  return g;
}

function addCropVisuals(b: BuildingEntity, group: THREE.Group, lv: number) {
  const crop = b.cropState;
  if (!crop) return;
  const stage = Math.min(3, Math.floor(crop.growth * 3.99)); // 0..3

  const stalkMat = getFlatMaterial(0x528f43, { roughness: 0.84 });
  const leafMat = getFlatMaterial(0x69ab52, { roughness: 0.8 });

  for (let rx = -1.35; rx <= 1.35; rx += 0.54) {
    for (let rz = -0.62; rz <= 0.62; rz += 0.62) {
      if (crop.cropType === 'turnip') {
        const h = 0.1 + stage * 0.09;
        if (stage >= 2) {
          const bulb = new THREE.Mesh(
            new THREE.DodecahedronGeometry(0.11 + stage * 0.02, 0),
            getFlatMaterial(0xeae0ee, { roughness: 0.72 }),
          );
          bulb.position.set(rx, 0.22, rz);
          group.add(bulb);
        }
        const tops = new THREE.Mesh(new THREE.ConeGeometry(0.15, h + 0.14, 5), leafMat);
        tops.position.set(rx, 0.25 + h * 0.5, rz);
        tops.userData.isCropFoliage = true;
        group.add(tops);
      } else if (crop.cropType === 'wheat') {
        const h = 0.14 + stage * 0.16;
        const mat = stage >= 2 ? getFlatMaterial(stage === 3 ? 0xe5ad3a : 0xa5b449, { roughness: 0.76 }) : stalkMat;
        const sheaf = new THREE.Mesh(new THREE.ConeGeometry(0.14, h, 5), mat);
        sheaf.position.set(rx, 0.2 + h * 0.5, rz);
        sheaf.userData.isCropFoliage = true;
        group.add(sheaf);
      } else if (crop.cropType === 'flax') {
        const h = 0.15 + stage * 0.14;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, h, 4), stalkMat);
        stem.position.set(rx, 0.2 + h * 0.5, rz);
        stem.userData.isCropFoliage = true;
        group.add(stem);
        if (stage >= 2) {
          const bloom = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.11, 0),
            getFlatMaterial(0x5a96dc, { roughness: 0.55 }),
          );
          bloom.position.set(rx, 0.24 + h, rz);
          bloom.userData.isCropFoliage = true;
          group.add(bloom);
        }
      } else if (crop.cropType === 'herbs') {
        const h = 0.12 + stage * 0.1;
        const bush = new THREE.Mesh(new THREE.DodecahedronGeometry(0.14 + stage * 0.03, 0), getFlatMaterial(0x4b9365));
        bush.position.set(rx, 0.22 + h * 0.3, rz);
        bush.userData.isCropFoliage = true;
        group.add(bush);
        if (stage >= 2) {
          const blossom = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.08, 0),
            getFlatMaterial(0xfef08a, { roughness: 0.5 }),
          );
          blossom.position.set(rx, 0.32 + h * 0.5, rz);
          blossom.userData.isCropFoliage = true;
          group.add(blossom);
        }
      } else if (crop.cropType === 'orchard') {
        if (Math.abs(rx) > 0.6 || Math.abs(rx) < 0.2) {
          const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.07, 0.45 + stage * 0.14, 5),
            getFlatMaterial(0x684531),
          );
          trunk.position.set(rx, 0.35 + stage * 0.06, rz);
          group.add(trunk);
          const crown = new THREE.Mesh(
            new THREE.IcosahedronGeometry(0.24 + stage * 0.07, 0),
            getFlatMaterial(stage >= 3 ? 0x579244 : 0x6ba656),
          );
          crown.position.set(rx, 0.65 + stage * 0.15, rz);
          group.add(crown);
          if (stage === 3) {
            const apple = new THREE.Mesh(new THREE.DodecahedronGeometry(0.07, 0), getFlatMaterial(0xd9413d));
            apple.position.set(rx + 0.15, 0.68 + stage * 0.15, rz + 0.15);
            group.add(apple);
          }
        }
      }
    }
  }
  if (lv >= 2) {
    const scare = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.9, 5), getFlatMaterial(0x704a2d));
    scare.position.set(1.55, 0.45, -0.8);
    group.add(scare);
  }
}

export function createLowPolyBuilding(
  b: BuildingEntity,
  isConstructing: boolean,
  constructionRatio: number,
  nightFactor: number,
  season: SeasonType,
  weather: WeatherType,
): THREE.Group {
  const group = new THREE.Group();
  const culture = CULTURES[b.cultureId] ?? CULTURES.hearthfolk;
  const snowRoof = weather === 'snow' || season === 'winter';
  const disrepair = b.disrepair ?? 0;
  const weathered = b.unlocked && disrepair >= 45;
  const abandoned = b.unlocked && disrepair >= 75;
  const lit = !abandoned && (nightFactor > 0.22 || weather === 'rain');

  const winMat = getFlatMaterial(lit ? 0xfde047 : abandoned ? 0x3b4248 : 0x678391, {
    roughness: 0.26,
    metalness: 0.18,
    emissive: lit ? 0xf59e0b : 0x000000,
    emissiveIntensity: lit ? 1.65 : 0,
  });
  const woodMat = getClayMaterial(weathered ? 0x524237 : 0x6b3a21, { roughness: 0.84 });
  const timberLightMat = getClayMaterial(weathered ? 0x7c6858 : 0x935330, { roughness: 0.8 });
  const timberTrimMat = getClayMaterial(weathered ? 0x8e7966 : 0xb06b3f, { roughness: 0.78 });
  const stoneMat = getFlatMaterial(weathered ? 0x6d6a64 : 0x888074, { roughness: 0.94 });
  const stoneLightMat = getFlatMaterial(weathered ? 0x8d887e : 0xb7ad9d, { roughness: 0.88 });
  const ironMat = getFlatMaterial(0x31363d, { roughness: 0.45, metalness: 0.72 });
  const brassMat = getFlatMaterial(weathered ? 0x8c7344 : 0xd8a13e, { roughness: 0.28, metalness: 0.82 });
  const bannerMat = getFlatMaterial(culture.bannerColor, { roughness: 0.65 });
  const roofMat = getFlatMaterial(snowRoof ? 0xeaf1f6 : culture.roofColor, { roughness: 0.7 });
  const emberMat = getFlatMaterial(abandoned ? 0x454341 : 0xfbbf24, {
    emissive: abandoned ? 0x000000 : 0xf97316,
    emissiveIntensity: abandoned ? 0 : 1.75,
    roughness: 0.25,
  });
  const lv = b.level;
  const variant = hashModelKey(b.id) % 3;
  const canvasBlueMat = getFlatMaterial(snowRoof ? 0xd9e6f0 : 0x567794, { roughness: 0.84 });
  const canvasOchreMat = getFlatMaterial(snowRoof ? 0xebe8dc : 0xc99c43, { roughness: 0.82 });
  const canvasTealMat = getFlatMaterial(snowRoof ? 0xd8ebe8 : 0x72a39e, { roughness: 0.84 });
  const canvasCreamMat = getFlatMaterial(snowRoof ? 0xf2f6fa : 0xe5dfd0, { roughness: 0.86 });
  const slateShingleMat = getFlatMaterial(snowRoof ? 0xeaf1f6 : 0x526b82, { roughness: 0.76 });
  const plasterMat = getFlatMaterial(
    culture.archStyle === 'crag_bastion' ? 0xb5aba0 : culture.archStyle === 'mariner_driftwood' ? 0xd7ccb7 : 0xdfd3be,
    { roughness: 0.9 },
  );

  // Reusable small village props inspired by the village prop kit (hanging street lanterns, dovecote, noticeboard)
  const addStreetLantern = (lx: number, ly: number, lz: number, twin = false) => {
    const postBase = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.24, 6), stoneMat);
    postBase.position.set(lx, ly + 0.12, lz);
    group.add(postBase);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.38, 5), woodMat);
    pole.position.set(lx, ly + 0.82, lz);
    group.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(twin ? 0.62 : 0.34, 0.06, 0.06), ironMat);
    arm.position.set(lx + (twin ? 0 : 0.14), ly + 1.46, lz);
    group.add(arm);
    for (const ox of twin ? [-0.26, 0.26] : [0.26]) {
      const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.055, 0.18, 6), winMat);
      lantern.position.set(lx + ox, ly + 1.32, lz);
      group.add(lantern);
    }
  };

  if (!b.unlocked) {
    const stage =
      b.constructionStage ??
      (constructionRatio < 0.25 ? 'foundation' : constructionRatio < 0.5 ? 'framework' : constructionRatio < 0.75 ? 'walls' : 'roof');

    const siteWrap = new THREE.Group();
    siteWrap.userData.isConstructionRig = true;

    // Stage 1 (Foundation): Planked chestnut timber deck + heavy sill beams & corner posts
    const footing = new THREE.Mesh(new THREE.BoxGeometry(2.84, 0.16, 2.24), stoneMat);
    footing.position.y = 0.08;
    siteWrap.add(footing);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.68, 0.09, 2.08), timberLightMat);
    deck.position.y = 0.18;
    siteWrap.add(deck);
    for (let pz = -0.82; pz <= 0.85; pz += 0.41) {
      const plankSeam = new THREE.Mesh(new THREE.BoxGeometry(2.66, 0.03, 0.34), timberTrimMat);
      plankSeam.position.set(0, 0.22, pz);
      siteWrap.add(plankSeam);
    }

    for (const [sx, sz] of [[-1.28, -0.95], [1.28, -0.95], [-1.28, 0.95], [1.28, 0.95]]) {
      const stakeH = stage === 'foundation' ? 0.62 : 1.74;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, stakeH, 0.18), woodMat);
      post.position.set(sx, stakeH * 0.5 + 0.16, sz);
      siteWrap.add(post);
    }

    if (stage === 'framework' || stage === 'walls' || stage === 'roof') {
      for (const sz of [-0.95, 0.95]) {
        const beamX = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.14, 0.18), timberTrimMat);
        beamX.position.set(0, 1.84, sz);
        siteWrap.add(beamX);
      }
      for (const sx of [-1.28, 1.28]) {
        const beamZ = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 2.06), timberTrimMat);
        beamZ.position.set(sx, 1.84, 0);
        siteWrap.add(beamZ);
      }
      for (const dx of [-0.38, 0.38]) {
        const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.48, 0.16), timberTrimMat);
        jamb.position.set(dx, 0.96, 0.95);
        siteWrap.add(jamb);
      }
    }

    if (stage === 'walls' || stage === 'roof') {
      const wallH = stage === 'roof' ? 1.52 : 1.02;
      const backWall = new THREE.Mesh(new THREE.BoxGeometry(2.52, wallH, 0.14), timberLightMat);
      backWall.position.set(0, 0.2 + wallH * 0.5, -0.94);
      siteWrap.add(backWall);
      for (const sx of [-1.24, 1.24]) {
        const sideWall = new THREE.Mesh(new THREE.BoxGeometry(0.14, wallH, 1.82), timberLightMat);
        sideWall.position.set(sx, 0.2 + wallH * 0.5, 0);
        siteWrap.add(sideWall);
      }
      for (const sx of [-0.84, 0.84]) {
        const frontHalf = new THREE.Mesh(new THREE.BoxGeometry(0.76, wallH * 0.86, 0.14), timberLightMat);
        frontHalf.position.set(sx, 0.2 + wallH * 0.43, 0.94);
        siteWrap.add(frontHalf);
      }
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.14, 0.18), timberTrimMat);
      lintel.position.set(0, 1.44, 0.95);
      siteWrap.add(lintel);
    }

    if (stage === 'roof') {
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(2.82, 0.18, 0.18), woodMat);
      ridge.position.set(0, 2.52, 0);
      siteWrap.add(ridge);
      for (const rx of [-1.05, -0.35, 0.35, 1.05]) {
        for (const side of [-1, 1]) {
          const rafter = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 1.5), timberTrimMat);
          rafter.position.set(rx, 2.16, side * 0.54);
          rafter.rotation.x = side * 0.58;
          siteWrap.add(rafter);
        }
      }
      const slopeSheath = new THREE.Mesh(new THREE.BoxGeometry(2.68, 0.08, 1.48), timberLightMat);
      slopeSheath.position.set(0, 2.22, -0.54);
      slopeSheath.rotation.x = -0.58;
      siteWrap.add(slopeSheath);
    }
    group.add(siteWrap);

    if (isConstructing || b.pausedForMaterials || constructionRatio > 0) {
      const barBg = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.2, 0.12), getFlatMaterial(0x14161d, { roughness: 0.6 }));
      barBg.position.set(0, 2.95, 0);
      group.add(barBg);
      const pct = Math.max(0.08, Math.min(1, constructionRatio || (stage === 'framework' ? 0.25 : stage === 'walls' ? 0.5 : stage === 'roof' ? 0.75 : 0.12)));
      const barColor = b.pausedForMaterials ? 0xef4444 : 0xfbbf24;
      const barEmissive = b.pausedForMaterials ? 0xdc2626 : 0xf59e0b;
      const barFill = new THREE.Mesh(
        new THREE.BoxGeometry(2.1 * pct, 0.13, 0.15),
        getFlatMaterial(barColor, { emissive: barEmissive, emissiveIntensity: 1.25, roughness: 0.28 }),
      );
      barFill.position.set(-1.05 + 1.05 * pct, 2.95, 0);
      barFill.userData.isProgressPulse = isConstructing;
      group.add(barFill);
    }

    setShadows(group, true, true);
    return group;
  }

  // Cultural stilt base for Sylvan / Mariner builds
  const stiltBoost =
    culture.archStyle === 'sylvan_stilt' && (b.type === 'cottage' || b.type === 'library' || b.type === 'bakery') ? 0.35 : 0;

  if (b.type === 'bonfire') {
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2;
      const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), stoneMat);
      stone.position.set(Math.cos(ang) * 0.76, 0.13, Math.sin(ang) * 0.76);
      group.add(stone);
    }
    for (let i = 0; i < 4; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.095, 0.88, 5), woodMat);
      log.rotation.z = Math.PI / 2.25;
      log.rotation.y = (i * Math.PI) / 4;
      log.position.y = 0.16;
      group.add(log);
    }
    const upAxis = new THREE.Vector3(0, 1, 0);
    const apex = new THREE.Vector3(0, 1.24, 0);
    for (let i = 0; i < 3; i++) {
      const ang = (i * Math.PI * 2) / 3 + 0.35;
      const foot = new THREE.Vector3(Math.cos(ang) * 0.58, 0.04, Math.sin(ang) * 0.58);
      const dir = apex.clone().sub(foot);
      const legLen = dir.length();
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.032, legLen, 5), ironMat);
      leg.position.copy(foot).add(apex).multiplyScalar(0.5);
      leg.quaternion.setFromUnitVectors(upAxis, dir.normalize());
      group.add(leg);
    }
    const kettle = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), ironMat);
    kettle.position.set(0, 0.76, 0);
    group.add(kettle);
    const outerFlame = new THREE.Mesh(
      new THREE.ConeGeometry(0.35 + lv * 0.05, 0.78 + lv * 0.1, 5),
      getFlatMaterial(0xea580c, { emissive: 0xf97316, emissiveIntensity: 1.85, roughness: 0.28 }),
    );
    outerFlame.position.y = 0.45;
    outerFlame.userData.isFlame = true;
    group.add(outerFlame);
    const innerFlame = new THREE.Mesh(
      new THREE.ConeGeometry(0.2, 0.54, 5),
      getFlatMaterial(0xfef08a, { emissive: 0xfacc15, emissiveIntensity: 2.2, roughness: 0.2 }),
    );
    innerFlame.position.y = 0.39;
    innerFlame.userData.isFlame = true;
    group.add(innerFlame);
    // Wooden village noticeboard beside the hearth
    const boardPost = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.9, 0.09), woodMat);
    boardPost.position.set(-1.18, 0.45, 0.72);
    group.add(boardPost);
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.42, 0.07), timberLightMat);
    board.position.set(-1.18, 0.72, 0.72);
    board.rotation.y = 0.38;
    group.add(board);
    const note = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.08), canvasCreamMat);
    note.position.set(-1.21, 0.72, 0.74);
    note.rotation.y = 0.38;
    group.add(note);
  } else if (b.type === 'lean_to') {
    if (variant === 0) {
      // Striped conical canvas explorer tent (inspired by reference row 3 left)
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        const panel = new THREE.Mesh(
          new THREE.ConeGeometry(1.18, 1.82, 4, 1, false, ang, Math.PI * 0.28),
          i % 2 === 0 ? canvasCreamMat : canvasTealMat,
        );
        panel.position.y = 0.94;
        group.add(panel);
      }
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.25, 5), woodMat);
      mast.position.y = 1.12;
      group.add(mast);
      const pennant = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, 0.04), bannerMat);
      pennant.position.set(0.18, 2.15, 0);
      pennant.userData.isBanner = true;
      group.add(pennant);
      const bed = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.16, 0.68), getFlatMaterial(0x9b7956));
      bed.position.set(0, 0.08, 0.12);
      group.add(bed);
    } else if (variant === 1) {
      // Draped slate-blue canvas market/traveler canopy on timber frame (row 3 col 2)
      for (const [px, pz] of [[-1.02, -0.68], [1.02, -0.68], [-1.02, 0.68], [1.02, 0.68]]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.065, 1.24, 5), woodMat);
        pole.position.set(px, 0.62, pz);
        group.add(pole);
      }
      const canopyTop = new THREE.Mesh(new THREE.BoxGeometry(2.28, 0.12, 1.56), canvasBlueMat);
      canopyTop.position.set(0, 1.24, 0);
      canopyTop.rotation.x = 0.12;
      group.add(canopyTop);
      const sideDrape = new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.95, 0.08), canvasBlueMat);
      sideDrape.position.set(0, 0.72, -0.72);
      group.add(sideDrape);
      const bed = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.18, 0.72), getFlatMaterial(0x9b7956));
      bed.position.set(0, 0.1, 0.08);
      group.add(bed);
    } else {
      for (const [px, pz] of [[-1.0, -0.7], [1.0, -0.7], [-1.0, 0.7], [1.0, 0.7]]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 1.15, 5), woodMat);
        pole.position.set(px, 0.55, pz);
        group.add(pole);
      }
      const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 5), woodMat);
      ridge.rotation.z = Math.PI / 2;
      ridge.position.set(0, 1.22, -0.1);
      group.add(ridge);
      const hideMat = getFlatMaterial(snowRoof ? 0xdde7ef : 0xc2986e, { roughness: 0.85 });
      const tarp = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 1.7), hideMat);
      tarp.position.set(0, 0.92, 0);
      tarp.rotation.x = 0.42;
      group.add(tarp);
      const bed = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.18, 0.75), getFlatMaterial(0x9b7956));
      bed.position.set(0, 0.1, 0.1);
      group.add(bed);
    }
  } else if (b.type === 'cottage') {
    const wScale = 1 + (lv >= 2 ? 0.12 : 0);
    if (stiltBoost > 0) {
      for (const [sx, sz] of [[-1.2, -0.85], [1.2, -0.85], [-1.2, 0.85], [1.2, 0.85]]) {
        const stilt = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, stiltBoost + 0.3, 5), woodMat);
        stilt.position.set(sx, stiltBoost * 0.5, sz);
        group.add(stilt);
      }
    }

    if (variant === 0) {
      // Variant 0: 2-Story Half-Timbered House w/ Exterior Wooden Stairs & Slate Shingle Roof (row 1 col 1)
      const lowerStone = new THREE.Mesh(new THREE.BoxGeometry(2.74 * wScale, 0.92, 2.02), stoneMat);
      lowerStone.position.y = 0.44 + stiltBoost;
      group.add(lowerStone);
      const upperTimber = new THREE.Mesh(new THREE.BoxGeometry(2.96 * wScale, 1.06, 2.2), timberLightMat);
      upperTimber.position.y = 1.42 + stiltBoost;
      group.add(upperTimber);
      // Exposed dark oak framing beams on upper story
      for (const bx of [-1.42 * wScale, 0, 1.42 * wScale]) {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.08, 2.26), woodMat);
        beam.position.set(bx, 1.42 + stiltBoost, 0);
        group.add(beam);
      }
      const roof = new THREE.Mesh(new THREE.ConeGeometry(2.3 * wScale, 1.26, 4), slateShingleMat);
      roof.position.y = 2.54 + stiltBoost;
      roof.rotation.y = Math.PI / 4;
      roof.scale.set(1.16, 1, 0.94);
      group.add(roof);
      // Exterior side staircase & porch landing
      for (let s = 0; s < 5; s++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.28), timberTrimMat);
        step.position.set(-1.58 * wScale, 0.12 + s * 0.18 + stiltBoost, 0.65 - s * 0.24);
        group.add(step);
      }
      const landing = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.12, 0.72), woodMat);
      landing.position.set(-1.62 * wScale, 0.96 + stiltBoost, -0.42);
      group.add(landing);
      const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.38, 1.38, 0.38), stoneLightMat);
      chimney.position.set(0.86, 2.68 + stiltBoost, -0.45);
      group.add(chimney);
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.78, 0.14), woodMat);
      door.position.set(0.28, 0.48 + stiltBoost, 1.02);
      group.add(door);
      for (const wx of [-0.66, 0.66]) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.13), winMat);
        win.position.set(wx, 1.44 + stiltBoost, 1.11);
        group.add(win);
      }
      if (lv >= 2) addStreetLantern(1.72 * wScale, stiltBoost, 0.92, false);
    } else if (variant === 1) {
      // Variant 1: Stone-Plinth Cottage + Attached Open Timber Lean-To Bay (row 1 col 3)
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.2 * wScale, 0.56, 2.1), stoneMat);
      plinth.position.set(-0.42, 0.28 + stiltBoost, 0);
      group.add(plinth);
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.05 * wScale, 1.24, 1.92), plasterMat);
      body.position.set(-0.42, 1.12 + stiltBoost, 0);
      group.add(body);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.75 * wScale, 1.12, 4), roofMat);
      roof.position.set(-0.42, 2.28 + stiltBoost, 0);
      roof.rotation.y = Math.PI / 4;
      group.add(roof);
      // Side open timber bay with barrel
      for (const pz of [-0.78, 0.78]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.32, 5), woodMat);
        post.position.set(1.42, 0.66 + stiltBoost, pz);
        group.add(post);
      }
      const bayRoof = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.1, 1.92), timberLightMat);
      bayRoof.position.set(1.06, 1.36 + stiltBoost, 0);
      bayRoof.rotation.z = -0.22;
      group.add(bayRoof);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.44, 7), timberTrimMat);
      barrel.position.set(1.08, 0.24 + stiltBoost, 0.34);
      group.add(barrel);
      const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.38, 1.32, 0.38), stoneLightMat);
      chimney.position.set(-1.12, 2.38 + stiltBoost, -0.35);
      group.add(chimney);
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.84, 0.14), timberLightMat);
      door.position.set(-0.42, 0.72 + stiltBoost, 0.98);
      group.add(door);
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.14), winMat);
      win.position.set(0.18, 1.14 + stiltBoost, 0.98);
      group.add(win);
    } else {
      // Variant 2: Classic Gables + Porch Beams & Merlons / Dovecote
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(3.08 * wScale, 1.15, 2.34), stoneMat);
      plinth.position.y = -0.24 + stiltBoost;
      group.add(plinth);
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.8 * wScale, 1.44, 2.08), plasterMat);
      body.position.y = 1.02 + stiltBoost;
      group.add(body);
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(2.24 * wScale, culture.archStyle === 'sylvan_stilt' ? 1.65 : 1.32, 4),
        roofMat,
      );
      roof.position.y = 2.4 + stiltBoost;
      roof.rotation.y = Math.PI / 4;
      roof.scale.set(1.16, 1, 0.94);
      group.add(roof);
      if (culture.archStyle === 'crag_bastion') {
        for (const bx of [-1.2, 0, 1.2]) {
          const merlon = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.3), stoneLightMat);
          merlon.position.set(bx, 1.9 + stiltBoost, 1.05);
          group.add(merlon);
        }
      }
      const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.26, 0.42), stoneMat);
      chimney.position.set(-0.75, 2.55 + stiltBoost, -0.35);
      group.add(chimney);
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.14), timberLightMat);
      door.position.set(0, 0.75 + stiltBoost, 1.06);
      group.add(door);
      for (const wx of [-0.8, 0.8]) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.13), winMat);
        win.position.set(wx, 1.1 + stiltBoost, 1.06);
        group.add(win);
      }
    }

    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.44, 0.05), bannerMat);
    flag.position.set(1.38 * wScale, 1.35 + stiltBoost, 1.08);
    flag.userData.isBanner = true;
    group.add(flag);
  } else if (b.type === 'woodshop') {
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.24, 2.2), stoneMat);
    base.position.y = 0.12;
    group.add(base);
    if (variant === 0) {
      // Open-bay timber barn & animated sawmill bench (row 2 col 2)
      const backCabin = new THREE.Mesh(new THREE.BoxGeometry(1.38, 1.32, 1.92), timberLightMat);
      backCabin.position.set(-0.68, 0.86, 0);
      group.add(backCabin);
      for (const pz of [-0.84, 0.84]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.1, 1.44, 5), woodMat);
        post.position.set(1.22, 0.84, pz);
        group.add(post);
      }
      const roof = new THREE.Mesh(new THREE.ConeGeometry(2.15, 0.98, 4), roofMat);
      roof.position.y = 1.98;
      roof.rotation.y = Math.PI / 4;
      roof.scale.set(1.22, 1, 0.92);
      group.add(roof);
      const bench = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.45, 0.48), woodMat);
      bench.position.set(0.62, 0.42, 0.35);
      group.add(bench);
      const saw = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 10), ironMat);
      saw.rotation.x = Math.PI / 2;
      saw.position.set(0.62, 0.68, 0.35);
      saw.userData.isSaw = true;
      group.add(saw);
    } else {
      // Timber shed + ochre side cloth awning over crates (row 2 col 4)
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.32, 1.76), timberLightMat);
      cabin.position.set(-0.26, 0.86, -0.06);
      group.add(cabin);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.78, 0.92, 4), roofMat);
      roof.position.set(-0.26, 1.92, -0.06);
      roof.rotation.y = Math.PI / 4;
      group.add(roof);
      const sideAwning = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.09, 1.65), canvasOchreMat);
      sideAwning.position.set(1.18, 1.34, 0);
      sideAwning.rotation.z = -0.26;
      group.add(sideAwning);
      for (const pz of [-0.68, 0.68]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 1.18, 5), woodMat);
        post.position.set(1.56, 0.68, pz);
        group.add(post);
      }
      const saw = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 10), ironMat);
      saw.rotation.x = Math.PI / 2;
      saw.position.set(1.14, 0.56, 0.15);
      saw.userData.isSaw = true;
      group.add(saw);
    }
    for (let i = 0; i < Math.min(5, 2 + lv); i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 1.05, 6), timberTrimMat);
      log.rotation.z = Math.PI / 2;
      log.position.set(0.32 + (i % 2) * 0.18, 0.34 + Math.floor(i / 2) * 0.22, -0.45);
      group.add(log);
    }
  } else if (b.type === 'quarry') {
    const rockA = new THREE.Mesh(new THREE.DodecahedronGeometry(1.38, 0), stoneMat);
    rockA.position.set(-0.32, 0.92, -0.25);
    rockA.scale.set(1.22, 0.86, 1.0);
    group.add(rockA);
    const rockB = new THREE.Mesh(new THREE.DodecahedronGeometry(0.95, 0), stoneLightMat);
    rockB.position.set(0.78, 0.66, 0.12);
    group.add(rockB);
    const cart = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.36, 0.42), ironMat);
    cart.position.set(-0.25, 0.28, 1.38);
    group.add(cart);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 1.9 + lv * 0.2, 5), woodMat);
    mast.position.set(1.15, 0.95 + lv * 0.1, 0.42);
    group.add(mast);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.12), woodMat);
    arm.position.set(0.6, 1.85 + lv * 0.2, 0.42);
    group.add(arm);
  } else if (b.type === 'farm_plot') {
    const soil = new THREE.Mesh(
      new THREE.BoxGeometry(3.75, 0.2, 2.3),
      getFlatMaterial(b.cropState?.irrigated ? 0x563925 : 0x735238, { roughness: 0.95 }),
    );
    soil.position.y = 0.1;
    group.add(soil);
    for (const fx of [-1.78, 0, 1.78]) {
      for (const fz of [-1.12, 1.12]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.44, 5), woodMat);
        post.position.set(fx, 0.25, fz);
        group.add(post);
      }
    }
    const railN = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.06, 0.06), timberLightMat);
    railN.position.set(0, 0.36, -1.12);
    group.add(railN);
    const railS = railN.clone();
    railS.position.z = 1.12;
    group.add(railS);
    if (lv >= 2) {
      // Corner garden trellis & sage tarp (row 3 col 3)
      for (const tx of [-1.62, -0.82]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.96, 5), woodMat);
        leg.position.set(tx, 0.56, -1.04);
        group.add(leg);
      }
      const tarp = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.07, 0.62), canvasTealMat);
      tarp.position.set(-1.22, 1.05, -0.92);
      tarp.rotation.x = 0.16;
      group.add(tarp);
    }
    addCropVisuals(b, group, lv);
  } else if (b.type === 'pasture') {
    const penMat = getFlatMaterial(0x63984d, { roughness: 0.9 });
    const ground = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.12, 2.85), penMat);
    ground.position.y = 0.06;
    group.add(ground);
    for (const fx of [-2.0, -0.68, 0.68, 2.0]) {
      for (const fz of [-1.38, 1.38]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.54, 5), woodMat);
        post.position.set(fx, 0.28, fz);
        group.add(post);
      }
    }
    for (const fz of [-1.38, 1.38]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(4.05, 0.07, 0.07), timberLightMat);
      rail.position.set(0, 0.42, fz);
      group.add(rail);
    }
    for (const fx of [-2.0, 2.0]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 2.75), timberLightMat);
      side.position.set(fx, 0.42, 0);
      group.add(side);
    }
    const trough = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.24, 0.42), woodMat);
    trough.position.set(-1.1, 0.2, -0.82);
    group.add(trough);
    const hay = new THREE.Mesh(new THREE.DodecahedronGeometry(0.36, 0), getFlatMaterial(0xdcb448, { roughness: 0.85 }));
    hay.position.set(1.25, 0.32, -0.8);
    group.add(hay);
    // Cute blue-roofed wooden dovecote birdhouse on corner post (row 4 col 2)
    const dovePost = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.065, 1.25, 5), woodMat);
    dovePost.position.set(-1.86, 0.65, 1.28);
    group.add(dovePost);
    const doveBox = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.34), timberLightMat);
    doveBox.position.set(-1.86, 1.32, 1.28);
    group.add(doveBox);
    const doveRoof = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.26, 4), canvasBlueMat);
    doveRoof.position.set(-1.86, 1.62, 1.28);
    doveRoof.rotation.y = Math.PI / 4;
    group.add(doveRoof);
  } else if (b.type === 'bakery') {
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.22, 2.25), stoneMat);
    plinth.position.y = 0.11 + stiltBoost;
    group.add(plinth);
    if (variant === 0) {
      // Ochre cloth awning bakehouse stall w/ tall stone hearth & chimney (row 2 col 3)
      const backBody = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.32, 1.45), plasterMat);
      backBody.position.set(-0.24, 0.86 + stiltBoost, -0.22);
      group.add(backBody);
      const stoneHearth = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.38, 1.55), stoneLightMat);
      stoneHearth.position.set(1.06, 0.88 + stiltBoost, -0.05);
      group.add(stoneHearth);
      const tallChimney = new THREE.Mesh(new THREE.BoxGeometry(0.46, 1.15, 0.46), stoneLightMat);
      tallChimney.position.set(1.06, 2.08 + stiltBoost, -0.18);
      group.add(tallChimney);
      const awning = new THREE.Mesh(new THREE.BoxGeometry(2.18, 0.1, 1.05), canvasOchreMat);
      awning.position.set(-0.24, 1.38 + stiltBoost, 0.85);
      awning.rotation.x = 0.34;
      group.add(awning);
      const counter = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.56, 0.46), timberLightMat);
      counter.position.set(-0.24, 0.48 + stiltBoost, 0.78);
      group.add(counter);
      for (const lx of [-0.58, -0.08, 0.42]) {
        const loaf = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), getFlatMaterial(0xd99b43));
        loaf.scale.set(1.25, 0.65, 0.9);
        loaf.position.set(lx, 0.8 + stiltBoost, 0.8);
        group.add(loaf);
      }
      const ember = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 0.16), emberMat);
      ember.position.set(1.06, 0.58 + stiltBoost, 0.72);
      ember.userData.isEmber = true;
      group.add(ember);
    } else {
      // Twin-kiln stone vat & barrel vaulted bakehouse (row 2 col 1)
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.15, 1.24, 1.88), plasterMat);
      body.position.set(0.25, 0.82 + stiltBoost, 0);
      group.add(body);
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.12, 2.25, 6), slateShingleMat);
      roof.rotation.z = Math.PI / 2;
      roof.position.set(0.25, 1.65 + stiltBoost, 0);
      group.add(roof);
      const vatBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.52, 1.08, 8), timberTrimMat);
      vatBarrel.position.set(-1.05, 0.74 + stiltBoost, 0.38);
      group.add(vatBarrel);
      const stoneKiln = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.54, 1.98, 7), stoneLightMat);
      stoneKiln.position.set(-1.12, 1.15 + stiltBoost, -0.42);
      group.add(stoneKiln);
      const ember = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.16), emberMat);
      ember.position.set(0.25, 0.52 + stiltBoost, 0.95);
      ember.userData.isEmber = true;
      group.add(ember);
    }
  } else if (b.type === 'library') {
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.3, 2.4), stoneMat);
    plinth.position.y = 0.15 + stiltBoost;
    group.add(plinth);
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.74, 1.56, 2.15), getFlatMaterial(0xeae2cf));
    body.position.y = 1.08 + stiltBoost;
    group.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.15, 1.24, 4), roofMat);
    roof.position.y = 2.44 + stiltBoost;
    roof.rotation.y = Math.PI / 4;
    group.add(roof);
    const finial = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), brassMat);
    finial.position.y = 3.16 + stiltBoost;
    group.add(finial);
    for (const wx of [-0.75, 0, 0.75]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.56, 0.12), winMat);
      win.position.set(wx, 1.15 + stiltBoost, 1.1);
      group.add(win);
    }
    // Exterior wooden bookcase & reading lectern + twin street lantern (row 4 props)
    const bookcase = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.64, 0.24), woodMat);
    bookcase.position.set(-1.58, 0.5 + stiltBoost, 0.38);
    bookcase.rotation.y = Math.PI / 2;
    group.add(bookcase);
    const lecternPost = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.62, 5), woodMat);
    lecternPost.position.set(0.95, 0.44 + stiltBoost, 1.32);
    group.add(lecternPost);
    const lecternBook = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, 0.24), canvasCreamMat);
    lecternBook.position.set(0.95, 0.76 + stiltBoost, 1.32);
    lecternBook.rotation.x = 0.36;
    group.add(lecternBook);
    addStreetLantern(-1.62, stiltBoost, 1.18, true);

    const banner = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.6, 0.06), bannerMat);
    banner.position.set(1.42, 1.45 + stiltBoost, 1.08);
    banner.userData.isBanner = true;
    group.add(banner);
  } else if (b.type === 'smeltery') {
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.95, 0.28, 2.25), stoneMat);
    base.position.y = 0.14;
    group.add(base);
    if (variant === 0) {
      // Open timber forge awning shed w/ stone smelter hearth & pumping bellows (row 1 col 4)
      for (const [px, pz] of [[-1.24, -0.9], [1.24, -0.9], [-1.24, 0.9], [1.24, 0.9]]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 1.5, 5), woodMat);
        post.position.set(px, 0.88, pz);
        group.add(post);
      }
      const forgeRoof = new THREE.Mesh(new THREE.ConeGeometry(2.25, 0.92, 4), roofMat);
      forgeRoof.position.y = 2.02;
      forgeRoof.rotation.y = Math.PI / 4;
      forgeRoof.scale.set(1.22, 1, 0.92);
      group.add(forgeRoof);
    }
    const furnace = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.94, 1.92, 6), stoneLightMat);
    furnace.position.set(-0.56, 1.16, -0.2);
    group.add(furnace);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.42, 0.25), emberMat);
    glow.position.set(-0.56, 0.58, 0.66);
    glow.userData.isEmber = true;
    group.add(glow);
    const bellows = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.34, 0.36, 6), getFlatMaterial(0x82553a));
    bellows.position.set(0.26, 0.44, -0.18);
    bellows.rotation.z = Math.PI / 4;
    bellows.userData.isBellows = true;
    group.add(bellows);
    const anvil = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.42, 0.34), ironMat);
    anvil.position.set(0.86, 0.46, 0.48);
    group.add(anvil);
    const ingots = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.32), getFlatMaterial(0xd9843b, { metalness: 0.75, roughness: 0.32 }));
    ingots.position.set(0.88, 0.34, -0.45);
    group.add(ingots);
  } else if (b.type === 'dock') {
    const islElev = ISLAND_DEFS[b.islandId]?.elevationY ?? 0.8;
    const isHighCliff = islElev > 2.2;
    const pierDeck = new THREE.Mesh(new THREE.BoxGeometry(3.35, 0.22, 1.58), timberLightMat);
    pierDeck.position.set(0.65, 0.08, 0);
    group.add(pierDeck);
    if (isHighCliff) {
      const anchorBlock = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.8, 1.78), stoneMat);
      anchorBlock.position.set(-0.65, -0.15, 0);
      group.add(anchorBlock);
      const boomMast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 2.25, 5), woodMat);
      boomMast.position.set(0.95, 1.15, 0);
      group.add(boomMast);
      const boomArm = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.12, 0.12), woodMat);
      boomArm.position.set(1.58, 2.08, 0);
      boomArm.rotation.z = 0.14;
      group.add(boomArm);
      const ropeDrop = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.8, 4), getFlatMaterial(0xd2c09a));
      ropeDrop.position.set(2.25, 0.72, 0);
      group.add(ropeDrop);
    } else {
      for (const px of [-0.65, 0.65, 1.95]) {
        for (const pz of [-0.64, 0.64]) {
          const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 1.65, 5), woodMat);
          pile.position.set(px, -0.62, pz);
          group.add(pile);
        }
      }
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.14, 1.25), woodMat);
      ramp.position.set(-1.35, 0.02, 0);
      ramp.rotation.z = -0.14;
      group.add(ramp);
    }
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.38, 0.44), woodMat);
    crate.position.set(0.9, 0.38, -0.28);
    group.add(crate);
    const flagPost = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.45, 5), woodMat);
    flagPost.position.set(-0.65, 0.85, 0.62);
    group.add(flagPost);
    const pennant = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.32, 0.05), bannerMat);
    pennant.position.set(-0.37, 1.38, 0.62);
    pennant.userData.isBanner = true;
    group.add(pennant);
    const bulb = new THREE.Mesh(new THREE.OctahedronGeometry(0.15, 0), winMat);
    bulb.position.set(2.15, 0.76, 0.62);
    group.add(bulb);
  } else if (b.type === 'watchtower') {
    if (variant === 0) {
      // Crenellated stone keep joined with timber guard hall (row 1 col 2)
      const hall = new THREE.Mesh(new THREE.BoxGeometry(1.56, 1.28, 1.72), timberLightMat);
      hall.position.set(-0.68, 0.64, 0.1);
      group.add(hall);
      const hallRoof = new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.86, 4), roofMat);
      hallRoof.position.set(-0.68, 1.7, 0.1);
      hallRoof.rotation.y = Math.PI / 4;
      group.add(hallRoof);
      const tower = new THREE.Mesh(new THREE.BoxGeometry(1.38, 2.72 + lv * 0.25, 1.38), stoneLightMat);
      tower.position.set(0.58, 1.36 + lv * 0.125, -0.05);
      group.add(tower);
      for (const [mx, mz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
        const merlon = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 0.32), stoneMat);
        merlon.position.set(0.58 + mx, 2.86 + lv * 0.25, -0.05 + mz);
        group.add(merlon);
      }
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.42, 0.12), winMat);
      win.position.set(0.58, 1.82, 0.65);
      group.add(win);
      const flag = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.32, 0.05), bannerMat);
      flag.position.set(0.84, 3.25 + lv * 0.25, -0.05);
      flag.userData.isBanner = true;
      group.add(flag);
    } else {
      const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.45, 1.18, 6), stoneMat);
      plinth.position.y = -0.22;
      group.add(plinth);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.84, 1.02, 2.3 + lv * 0.22, 6), stoneLightMat);
      shaft.position.y = 1.48 + lv * 0.11;
      group.add(shaft);
      const deck = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.22, 2.1), woodMat);
      deck.position.y = 2.68 + lv * 0.22;
      group.add(deck);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.68, 1.05, 4), roofMat);
      roof.position.y = 3.45 + lv * 0.22;
      roof.rotation.y = Math.PI / 4;
      group.add(roof);
      const flag = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.34, 0.05), bannerMat);
      flag.position.set(0.32, 4.18 + lv * 0.22, 0);
      flag.userData.isBanner = true;
      group.add(flag);
    }
  } else if (b.type === 'glider_pad') {
    const stoneBase = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.9, 2.3), stoneMat);
    stoneBase.position.y = -0.24;
    group.add(stoneBase);
    const rampDeck = new THREE.Mesh(new THREE.BoxGeometry(3.15, 0.18, 1.85), timberLightMat);
    rampDeck.position.set(0.25, 0.56, 0);
    rampDeck.rotation.z = 0.18;
    group.add(rampDeck);
    for (const [px, pz, h] of [
      [-1.05, -0.78, 0.65],
      [-1.05, 0.78, 0.65],
      [1.35, -0.78, 1.15],
      [1.35, 0.78, 1.15],
    ]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, h, 5), woodMat);
      post.position.set(px, h * 0.5, pz);
      group.add(post);
    }
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.35, 5), woodMat);
    mast.position.set(-1.18, 1.25, -0.82);
    group.add(mast);
    const sock = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.85, 6), bannerMat);
    sock.rotation.z = -Math.PI / 2;
    sock.position.set(-0.72, 2.24, -0.82);
    sock.userData.isWindsock = true;
    group.add(sock);
    const wingMat = getFlatMaterial(culture.sailColor, { roughness: 0.68 });
    const parkedL = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.05, 0.82), wingMat);
    parkedL.position.set(0.35, 0.74, -0.48);
    parkedL.rotation.y = 0.35;
    parkedL.rotation.z = 0.18;
    group.add(parkedL);
    const parkedR = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.05, 0.82), wingMat);
    parkedR.position.set(0.35, 0.74, 0.48);
    parkedR.rotation.y = -0.35;
    parkedR.rotation.z = 0.18;
    group.add(parkedR);
    const bulb = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), winMat);
    bulb.position.set(1.38, 1.32, 0.78);
    group.add(bulb);
  } else if (b.type === 'barracks') {
    if (variant === 0) {
      // Conical striped canvas war pavilion + weapon rack (row 3 col 1)
      const floor = new THREE.Mesh(new THREE.CylinderGeometry(1.65, 1.75, 0.16, 8), timberLightMat);
      floor.position.y = 0.08;
      group.add(floor);
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        const skirtPanel = new THREE.Mesh(
          new THREE.CylinderGeometry(1.15, 1.56, 1.18, 4, 1, false, ang, Math.PI * 0.28),
          i % 2 === 0 ? canvasCreamMat : canvasTealMat,
        );
        skirtPanel.position.y = 0.68;
        group.add(skirtPanel);
        const capPanel = new THREE.Mesh(
          new THREE.ConeGeometry(1.28, 1.05, 4, 1, false, ang, Math.PI * 0.28),
          i % 2 === 0 ? canvasCreamMat : bannerMat,
        );
        capPanel.position.y = 1.78;
        group.add(capPanel);
      }
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.55, 5), woodMat);
      mast.position.y = 1.28;
      group.add(mast);
      const pennant = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.25, 0.05), bannerMat);
      pennant.position.set(0.24, 2.48, 0);
      pennant.userData.isBanner = true;
      group.add(pennant);
      for (const sx of [-0.65, 0.65]) {
        const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.08, 6), bannerMat);
        shield.rotation.x = Math.PI / 2;
        shield.position.set(sx, 0.72, 1.34);
        group.add(shield);
      }
    } else {
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(3.25, 1.15, 2.45), stoneMat);
      plinth.position.y = -0.24;
      group.add(plinth);
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.96, 1.48, 2.15), stoneLightMat);
      body.position.y = 1.04;
      group.add(body);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(2.35, 1.12, 4), roofMat);
      roof.position.y = 2.34;
      roof.rotation.y = Math.PI / 4;
      group.add(roof);
      for (const sx of [-0.95, 0.95]) {
        const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.08, 6), bannerMat);
        shield.rotation.x = Math.PI / 2;
        shield.position.set(sx, 1.15, 1.12);
        group.add(shield);
      }
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.98, 0.14), ironMat);
      door.position.set(0, 0.78, 1.1);
      group.add(door);
      addStreetLantern(1.68, 0, 1.08, false);
    }
  }

  if (isConstructing) {
    const scafMat = getFlatMaterial(0x8f6544, { roughness: 0.88 });
    for (const [sx, sz] of [[-1.6, -1.2], [1.6, -1.2], [-1.6, 1.2], [1.6, 1.2]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.45, 5), scafMat);
      pole.position.set(sx, 1.22, sz);
      group.add(pole);
    }
    const barBg = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.2, 0.12), getFlatMaterial(0x14161d, { roughness: 0.6 }));
    barBg.position.set(0, 3.2, 0);
    group.add(barBg);
    const pct = Math.max(0.08, Math.min(1, constructionRatio));
    const barFill = new THREE.Mesh(
      new THREE.BoxGeometry(2.1 * pct, 0.13, 0.15),
      getFlatMaterial(0xfbbf24, { emissive: 0xf59e0b, emissiveIntensity: 1.35, roughness: 0.28 }),
    );
    barFill.position.set(-1.05 + 1.05 * pct, 3.2, 0);
    barFill.userData.isProgressPulse = true;
    group.add(barFill);
  }

  if (b.unlocked && disrepair >= 45 && !isConstructing) {
    const mossMat = getFlatMaterial(0x526344, { roughness: 0.92 });
    const count = disrepair >= 75 ? 4 : 2;
    for (let i = 0; i < count; i++) {
      const patch = new THREE.Mesh(new THREE.DodecahedronGeometry(0.24, 0), mossMat);
      patch.scale.set(1.2, 0.55, 1.0);
      patch.position.set(-0.95 + i * 0.65, 0.26 + (i % 2) * 0.35, 1.08);
      group.add(patch);
    }
    if (disrepair >= 75) {
      group.rotation.z = 0.045;
    }
  }

  setShadows(group, true, true);
  return group;
}

export function createBoatEntityGroup(boat: BoatEntity): THREE.Group {
  const g = new THREE.Group();
  const culture = CULTURES[boat.cultureId] ?? CULTURES.hearthfolk;
  const woodDark = getFlatMaterial(boat.kind === 'war_galley' ? 0x5c3c27 : 0x7c5032, { roughness: 0.85 });
  const woodLight = getFlatMaterial(0xb4845a, { roughness: 0.82 });
  const sailMat = getFlatMaterial(culture.sailColor, { roughness: 0.72 });
  const bannerMat = getFlatMaterial(culture.bannerColor, { roughness: 0.65 });

  if (boat.kind === 'fishing_skiff') {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.26, 0.64), woodDark);
    hull.position.y = 0.12;
    g.add(hull);
    const bow = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.45, 4), woodDark);
    bow.rotation.z = -Math.PI / 2;
    bow.rotation.x = Math.PI / 4;
    bow.position.set(0.88, 0.15, 0);
    g.add(bow);
    const net = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), getFlatMaterial(0xcab993));
    net.position.set(-0.35, 0.28, 0);
    g.add(net);
    const oar = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.05, 0.08), woodLight);
    oar.position.set(0, 0.3, 0.24);
    oar.rotation.y = 0.25;
    g.add(oar);
  } else if (boat.kind === 'migrant_skiff') {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.32, 0.8), woodDark);
    hull.position.y = 0.15;
    g.add(hull);
    const bow = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.56, 4), woodDark);
    bow.rotation.z = -Math.PI / 2;
    bow.rotation.x = Math.PI / 4;
    bow.position.set(1.06, 0.18, 0);
    g.add(bow);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.065, 1.55, 5), woodLight);
    mast.position.set(0.1, 0.92, 0);
    g.add(mast);
    const sail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.9, 0.92), sailMat);
    sail.position.set(0.16, 1.05, 0);
    sail.rotation.y = 0.22;
    g.add(sail);
    const lantern = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 6, 6),
      getFlatMaterial(0xfde047, { emissive: 0xf59e0b, emissiveIntensity: 1.5, roughness: 0.25 }),
    );
    lantern.position.set(0.95, 0.48, 0);
    g.add(lantern);
  } else if (boat.kind === 'cargo_merchant') {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.42, 1.05), woodDark);
    hull.position.y = 0.2;
    g.add(hull);
    const bow = new THREE.Mesh(new THREE.ConeGeometry(0.52, 0.7, 4), woodDark);
    bow.rotation.z = -Math.PI / 2;
    bow.rotation.x = Math.PI / 4;
    bow.position.set(1.42, 0.24, 0);
    g.add(bow);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.2, 5), woodLight);
    mast.position.set(0.15, 1.25, 0);
    g.add(mast);
    const sail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.35, 1.25), sailMat);
    sail.position.set(0.22, 1.45, 0);
    sail.rotation.y = 0.18;
    g.add(sail);
    for (const cx of [-0.65, -0.25]) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.32, 0.42), woodLight);
      crate.position.set(cx, 0.52, (cx === -0.65 ? -1 : 1) * 0.16);
      g.add(crate);
    }
    const pennant = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.18, 0.05), bannerMat);
    pennant.position.set(0.05, 2.38, 0);
    g.add(pennant);
  } else {
    // War Galley
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.46, 1.15), woodDark);
    hull.position.y = 0.22;
    g.add(hull);
    const prow = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.95, 4), getFlatMaterial(0x3a3e46, { metalness: 0.7 }));
    prow.rotation.z = -Math.PI / 2;
    prow.position.set(1.75, 0.34, 0);
    g.add(prow);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.45, 5), woodLight);
    mast.position.set(0.1, 1.38, 0);
    g.add(mast);
    const sail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.45, 1.38), sailMat);
    sail.position.set(0.18, 1.55, 0);
    g.add(sail);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.34, 1.38), bannerMat);
    stripe.position.set(0.18, 1.55, 0);
    g.add(stripe);
    for (const sx of [-0.75, 0, 0.75]) {
      for (const sz of [-0.6, 0.6]) {
        const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.06, 6), bannerMat);
        shield.rotation.x = Math.PI / 2;
        shield.position.set(sx, 0.44, sz);
        g.add(shield);
      }
    }
  }

  setShadows(g, true, true);
  return g;
}

const EYE_COLORS = [0x9f7d38, 0x8d6e32, 0x627a57, 0x56718a, 0x7c553b];

function buildChibiFaceAndHair(
  headGroup: THREE.Group,
  opts: {
    skinMat: THREE.MeshStandardMaterial;
    hairMat: THREE.MeshStandardMaterial;
    hairStyle: number;
    eyeColor: number;
    isElder?: boolean;
    isInfant?: boolean;
    hasHelmCrest?: boolean;
    plateMat?: THREE.MeshStandardMaterial;
  },
) {
  const { skinMat, hairMat, hairStyle, eyeColor, isElder, isInfant, hasHelmCrest, plateMat } = opts;

  // Smooth chibi head dome
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.275, 22, 16), skinMat);
  head.scale.set(1.06, 0.96, 1.0);
  head.position.set(0, 0.24, 0.005);
  headGroup.add(head);

  // Small rounded ears
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.058, 12, 10), skinMat);
    ear.scale.set(0.56, 0.95, 0.72);
    ear.position.set(side * 0.278, 0.205, -0.01);
    headGroup.add(ear);
  }

  // Subtle sculpted nose bump & faint mouth mark
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), skinMat);
  nose.scale.set(0.85, 0.76, 0.72);
  nose.position.set(0, 0.19, 0.274);
  headGroup.add(nose);

  const mouthMat = getClayMaterial(0xa86f5b, { roughness: 0.7 });
  const mouth = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.036, 6), mouthMat);
  mouth.rotation.z = Math.PI / 2;
  mouth.position.set(0, 0.132, 0.258);
  headGroup.add(mouth);

  // Expressive anime/chibi eyes (sclera, iris, pupil, specular dot, upper lash arc, brow)
  const scleraMat = getClayMaterial(0xfcfbf7, { roughness: 0.42 });
  const irisMat = getClayMaterial(eyeColor, { roughness: 0.45 });
  const pupilMat = getClayMaterial(0x231b16, { roughness: 0.32 });
  const lashMat = getClayMaterial(0x2a2019, { roughness: 0.48 });
  const whiteGlintMat = getClayMaterial(0xffffff, {
    roughness: 0.2,
    emissive: 0xffffff,
    emissiveIntensity: 0.2,
  });

  const eyeY = isInfant ? 0.215 : 0.232;
  const browY = isInfant ? 0.298 : 0.312;

  for (const side of [-1, 1]) {
    const eyeSocket = new THREE.Group();
    eyeSocket.position.set(side * 0.104, eyeY, 0.244);
    eyeSocket.rotation.y = side * 0.22;

    const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.058, 14, 12), scleraMat);
    sclera.scale.set(1.14, 0.74, 0.26);
    eyeSocket.add(sclera);

    const iris = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.015, 16), irisMat);
    iris.rotation.x = Math.PI / 2;
    iris.position.set(-side * 0.004, -0.002, 0.011);
    eyeSocket.add(iris);

    const pupil = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.017, 12), pupilMat);
    pupil.rotation.x = Math.PI / 2;
    pupil.position.set(-side * 0.004, -0.002, 0.013);
    eyeSocket.add(pupil);

    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.0095, 8, 8), whiteGlintMat);
    glint.position.set(-0.014, 0.012, 0.022);
    eyeSocket.add(glint);

    const lash = new THREE.Mesh(new THREE.TorusGeometry(0.059, 0.01, 8, 14, Math.PI * 0.78), lashMat);
    lash.position.set(0, -0.004, 0.011);
    lash.rotation.z = Math.PI * 0.11;
    eyeSocket.add(lash);

    headGroup.add(eyeSocket);

    // Sculpted matching eyebrow
    const browGroup = new THREE.Group();
    browGroup.position.set(side * 0.105, browY, 0.246);
    browGroup.rotation.y = side * 0.2;
    browGroup.rotation.z = -side * 0.06;
    const browBar = new THREE.Mesh(new THREE.CylinderGeometry(0.0135, 0.0135, 0.088, 10), hairMat);
    browBar.rotation.z = Math.PI / 2;
    browGroup.add(browBar);
    for (const endX of [-0.044, 0.044]) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.0135, 8, 8), hairMat);
      cap.position.x = endX;
      browGroup.add(cap);
    }
    headGroup.add(browGroup);
  }

  // Elder spectacles & neatly sculpted beard tuft
  if (isElder && !isInfant) {
    const brassMat = getClayMaterial(0xb08a4f, { roughness: 0.35, metalness: 0.55 });
    for (const side of [-1, 1]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.064, 0.006, 8, 18), brassMat);
      rim.position.set(side * 0.104, eyeY, 0.264);
      rim.rotation.y = side * 0.2;
      headGroup.add(rim);
    }
    const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.08, 6), brassMat);
    bridge.rotation.z = Math.PI / 2;
    bridge.position.set(0, eyeY + 0.01, 0.275);
    headGroup.add(bridge);
  }

  if (isInfant) {
    // Soft curled top tuft for babies
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.11, 10), hairMat);
    tuft.position.set(0.02, 0.51, 0.05);
    tuft.rotation.z = -0.35;
    tuft.rotation.x = 0.28;
    headGroup.add(tuft);
    const tuftBase = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), hairMat);
    tuftBase.scale.set(1.2, 0.75, 1.1);
    tuftBase.position.set(0, 0.475, 0.02);
    headGroup.add(tuftBase);
    return;
  }

  // Main rounded hair cap
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.288, 22, 16), hairMat);
  hairCap.scale.set(1.06, 0.96, 1.03);
  hairCap.position.set(0, 0.272, -0.026);
  headGroup.add(hairCap);

  const style = ((hairStyle % 4) + 4) % 4;
  if (style === 0) {
    // Spiky swept short crop (matches character reference silhouette!)
    const bangSpecs: [number, number, number, number, number, number][] = [
      [-0.17, 0.34, 0.21, 0.048, 0.13, 0.42],
      [-0.105, 0.365, 0.24, 0.052, 0.145, 0.26],
      [-0.032, 0.375, 0.258, 0.055, 0.15, 0.1],
      [0.042, 0.372, 0.255, 0.054, 0.148, -0.14],
      [0.115, 0.358, 0.236, 0.05, 0.138, -0.3],
      [0.18, 0.33, 0.2, 0.046, 0.125, -0.46],
    ];
    for (const [bx, by, bz, r, h, rz] of bangSpecs) {
      const lock = new THREE.Mesh(new THREE.ConeGeometry(r, h, 10), hairMat);
      lock.position.set(bx, by, bz);
      lock.rotation.x = Math.PI * 0.84;
      lock.rotation.z = rz;
      headGroup.add(lock);
    }
    // Sideburns framing cheeks above ears
    for (const side of [-1, 1]) {
      const sideburn = new THREE.Mesh(new THREE.ConeGeometry(0.046, 0.13, 10), hairMat);
      sideburn.position.set(side * 0.265, 0.23, 0.065);
      sideburn.rotation.x = Math.PI * 0.95;
      sideburn.rotation.z = side * 0.18;
      headGroup.add(sideburn);
    }
    // Playful crown & back silhouette tufts
    const topTufts: [number, number, number, number, number][] = [
      [-0.14, 0.49, 0.01, 0.32, 0.46],
      [-0.02, 0.535, -0.02, 0.24, 0.12],
      [0.12, 0.505, 0.0, 0.28, -0.38],
      [-0.18, 0.42, -0.14, -0.45, 0.65],
      [0.17, 0.43, -0.15, -0.48, -0.62],
    ];
    for (const [tx, ty, tz, rx, rz] of topTufts) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.052, 0.13, 10), hairMat);
      spike.position.set(tx, ty, tz);
      spike.rotation.x = rx;
      spike.rotation.z = rz;
      headGroup.add(spike);
    }
  } else if (style === 1) {
    // Smooth pageboy bob with curved swoop bangs
    for (const side of [-1, 1]) {
      const swoop = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 12), hairMat);
      swoop.scale.set(1.15, 0.65, 0.72);
      swoop.position.set(side * 0.105, 0.39, 0.185);
      swoop.rotation.z = -side * 0.28;
      headGroup.add(swoop);

      const curtain = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.12, 0.28, 12), hairMat);
      curtain.scale.set(0.85, 1.0, 1.12);
      curtain.position.set(side * 0.23, 0.18, -0.04);
      curtain.rotation.z = side * 0.14;
      headGroup.add(curtain);
    }
    const backBob = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.27, 0.24, 16), hairMat);
    backBob.scale.set(1.06, 1.0, 0.82);
    backBob.position.set(0, 0.16, -0.09);
    headGroup.add(backBob);
  } else if (style === 2) {
    // Twin sculpted buns / puffs + curved fringe
    for (const bx of [-0.11, 0, 0.11]) {
      const fringe = new THREE.Mesh(new THREE.SphereGeometry(0.088, 12, 10), hairMat);
      fringe.scale.set(1.1, 0.68, 0.75);
      fringe.position.set(bx, 0.395 - Math.abs(bx) * 0.12, 0.205);
      headGroup.add(fringe);
    }
    for (const side of [-1, 1]) {
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.125, 14, 12), hairMat);
      bun.position.set(side * 0.28, 0.42, -0.04);
      headGroup.add(bun);
    }
  } else {
    // Fluffy tousled curls
    const curls: [number, number, number, number][] = [
      [-0.14, 0.39, 0.2, 0.082],
      [-0.04, 0.41, 0.22, 0.09],
      [0.07, 0.405, 0.215, 0.086],
      [0.16, 0.375, 0.185, 0.078],
      [-0.22, 0.31, 0.09, 0.085],
      [0.22, 0.31, 0.09, 0.085],
      [0, 0.51, 0.02, 0.105],
    ];
    for (const [cx, cy, cz, cr] of curls) {
      const curl = new THREE.Mesh(new THREE.SphereGeometry(cr, 12, 10), hairMat);
      curl.position.set(cx, cy, cz);
      headGroup.add(curl);
    }
  }

  // Open-faced knightly browguard circlet for top-tier guards so bangs & eyes remain visible
  if (hasHelmCrest && plateMat) {
    const circlet = new THREE.Mesh(new THREE.TorusGeometry(0.285, 0.026, 8, 22), plateMat);
    circlet.rotation.x = Math.PI * 0.52;
    circlet.position.set(0, 0.39, -0.01);
    headGroup.add(circlet);
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.12, 6), plateMat);
      wing.position.set(side * 0.295, 0.42, 0.0);
      wing.rotation.z = -side * 0.35;
      headGroup.add(wing);
    }
  }
}

export function createLowPolyVillager(v: VillagerEntity): THREE.Group {
  const g = new THREE.Group();
  const isChild = v.lifeStage === 'child';
  const isInfant = v.lifeStage === 'infant';
  const scale = isInfant ? 0.66 : isChild ? 0.8 : 1.0;

  const skinMat = getClayMaterial(v.skinTone, { roughness: 0.8 });
  const hairMat = getClayMaterial(v.hairColor, { roughness: 0.76 });
  const swaddleMat = getClayMaterial(v.cloakColor, { roughness: 0.84 });
  const eyeColor = EYE_COLORS[Math.abs(v.hairStyle + v.name.length) % EYE_COLORS.length];

  if (isInfant) {
    // Articulated crawling / sitting chibi baby with smooth clay head & animated limbs
    const bodyWrap = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), swaddleMat);
    torso.scale.set(1.04, 0.88, 1.32);
    torso.position.set(0, 0.27, -0.03);
    bodyWrap.add(torso);

    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.3, 0.24);
    headGroup.scale.setScalar(0.84);
    buildChibiFaceAndHair(headGroup, {
      skinMat,
      hairMat,
      hairStyle: v.hairStyle,
      eyeColor,
      isInfant: true,
    });
    bodyWrap.add(headGroup);
    g.userData.headGroup = headGroup;

    const armL = new THREE.Group();
    armL.position.set(-0.18, 0.25, 0.14);
    const armLMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.048, 0.22, 10), skinMat);
    armLMesh.position.y = -0.1;
    armL.add(armLMesh);
    const handL = new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 8), skinMat);
    handL.position.y = -0.21;
    armL.add(handL);
    bodyWrap.add(armL);
    g.userData.armL = armL;
    g.userData.shoulderL = armL;

    const armR = new THREE.Group();
    armR.position.set(0.18, 0.25, 0.14);
    const armRMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.048, 0.22, 10), skinMat);
    armRMesh.position.y = -0.1;
    armR.add(armRMesh);
    const handR = new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 8), skinMat);
    handR.position.y = -0.21;
    armR.add(handR);
    bodyWrap.add(armR);
    g.userData.armR = armR;
    g.userData.shoulderR = armR;

    const bootL = new THREE.Group();
    bootL.position.set(-0.13, 0.2, -0.22);
    const legLMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.048, 0.22, 10), skinMat);
    legLMesh.rotation.x = Math.PI * 0.35;
    legLMesh.position.set(0, -0.06, -0.08);
    bootL.add(legLMesh);
    bodyWrap.add(bootL);
    g.userData.bootL = bootL;
    g.userData.hipL = bootL;

    const bootR = new THREE.Group();
    bootR.position.set(0.13, 0.2, -0.22);
    const legRMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.048, 0.22, 10), skinMat);
    legRMesh.rotation.x = Math.PI * 0.35;
    legRMesh.position.set(0, -0.06, -0.08);
    bootR.add(legRMesh);
    bodyWrap.add(bootR);
    g.userData.bootR = bootR;
    g.userData.hipR = bootR;

    g.add(bodyWrap);
    g.userData.bodyWrap = bodyWrap;
    g.userData.isInfant = true;
    g.scale.setScalar(scale);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.38, 0.5, 18),
      new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    ring.visible = false;
    ring.userData.ownMaterial = true;
    g.add(ring);
    g.userData.selectRing = ring;

    setShadows(g, true, true);
    return g;
  }

  const culture = CULTURES[v.cultureId] ?? CULTURES.hearthfolk;
  const clothVariant = hashModelKey(v.id + v.name) % 6;
  const isSoldierArmor =
    v.activeTask === 'guard' ||
    Boolean(v.drafted) ||
    Boolean(v.isStranger && v.gearTier >= 2) ||
    (v.gearTier === 3 && (v.state === 'fighting' || v.state === 'hunting'));

  const baseClothColor =
    v.isStranger
      ? culture.bannerColor
      : v.gearTier === 0 && clothVariant % 2 === 0
        ? 0xa48c6f
        : v.cloakColor;

  const cloakMat = getClayMaterial(baseClothColor, { roughness: 0.84, metalness: 0.02 });
  const shirtMat = getClayMaterial(0xf2e9d8, { roughness: 0.86 });
  const apronMat = getClayMaterial(
    v.activeTask === 'bake' ? 0xf6f0e4 : v.activeTask === 'smelt' ? 0x6f513d : 0xd9cdb6,
    { roughness: 0.85 },
  );
  const shawlMat = getClayMaterial(
    v.gearTier >= 2 ? culture.bannerColor : 0x7b8c74,
    { roughness: 0.85 },
  );
  const plateColor = v.gearTier === 3 ? 0x9aa6b2 : 0x969589;
  const plateMat = getClayMaterial(plateColor, {
    roughness: v.gearTier === 3 ? 0.44 : 0.62,
    metalness: v.gearTier === 3 ? 0.35 : 0.14,
  });
  const bootMat = getClayMaterial(0x5b3c29, { roughness: 0.84 });
  const leatherMat = getClayMaterial(0x6c4832, { roughness: 0.82 });
  const trimMat = getClayMaterial(0xe5d7bc, { roughness: 0.78 });
  const trouserColors = [0x6e5b47, 0x51555e, 0x5c4f41, 0x48584d, 0x746350, 0x4b4752];
  const trouserMat = getClayMaterial(trouserColors[clothVariant % trouserColors.length], { roughness: 0.88 });
  const sleeveMat = clothVariant === 2 || clothVariant === 1 ? shirtMat : cloakMat;
  const steelMat = getClayMaterial(0xc0c9d2, { roughness: 0.32, metalness: 0.68 });
  const goldMat = getClayMaterial(0xe6be63, { roughness: 0.32, metalness: 0.6 });

  // Chibi Lower Body / Legs Rig Hierarchy (hipL/hipR at y=0.38 -> boots rest flush at y=0.0)
  const buildLeg = (side: -1 | 1) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.125, 0.38, 0);

    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.072, 0.14, 14), trouserMat);
    thigh.position.set(0, -0.06, 0);
    thigh.scale.set(1.06, 1.0, 1.08);
    hip.add(thigh);

    const calf = new THREE.Group();
    calf.position.set(0, -0.12, 0);

    if (isSoldierArmor) {
      const kneeDome = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), plateMat);
      kneeDome.scale.set(1.02, 0.85, 0.76);
      kneeDome.position.set(0, 0.0, 0.032);
      calf.add(kneeDome);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.076, 0.09, 0.052, 12), trimMat);
      cuff.position.set(0, -0.056, 0);
      calf.add(cuff);
    } else {
      const knee = new THREE.Mesh(new THREE.SphereGeometry(0.072, 10, 10), trouserMat);
      calf.add(knee);
      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.068, 0.07, 12), trouserMat);
      shin.position.set(0, -0.045, 0);
      calf.add(shin);
    }

    // Smooth flared chibi leather boot
    const footGroup = new THREE.Group();
    footGroup.position.set(0, -0.14, 0);

    const bootCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.086, 0.072, 0.07, 14), bootMat);
    bootCollar.position.set(0, 0.028, 0);
    footGroup.add(bootCollar);

    const bootShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.078, 0.11, 14), bootMat);
    bootShaft.position.set(0, -0.045, 0);
    footGroup.add(bootShaft);

    const toeCap = new THREE.Mesh(new THREE.SphereGeometry(0.076, 14, 10), bootMat);
    toeCap.scale.set(1.06, 0.66, 1.48);
    toeCap.position.set(0, -0.082, 0.045);
    footGroup.add(toeCap);

    const sole = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.082, 0.024, 14), leatherMat);
    sole.scale.set(1.05, 1.0, 1.38);
    sole.position.set(0, -0.106, 0.032);
    footGroup.add(sole);

    calf.add(footGroup);
    hip.add(calf);
    return { hip, calf };
  };

  const legL = buildLeg(-1);
  g.add(legL.hip);
  g.userData.hipL = legL.hip;
  g.userData.calfL = legL.calf;

  const legR = buildLeg(1);
  g.add(legR.hip);
  g.userData.hipR = legR.hip;
  g.userData.calfR = legR.calf;

  const bodyWrap = new THREE.Group();
  const spine = new THREE.Group();
  spine.position.set(0, 0.38, 0);

  const torsoMat = isSoldierArmor ? plateMat : clothVariant === 2 ? shirtMat : cloakMat;

  // Varied everyday hem / flared peasant skirt / tunic tails
  const skirtFlared = !isSoldierArmor && clothVariant === 4;
  const skirt = new THREE.Mesh(
    new THREE.CylinderGeometry(skirtFlared ? 0.21 : 0.205, skirtFlared ? 0.31 : 0.258, skirtFlared ? 0.22 : 0.165, 18),
    isSoldierArmor ? getClayMaterial(0x7c7e74, { roughness: 0.78 }) : clothVariant === 2 ? trouserMat : cloakMat,
  );
  skirt.scale.set(1.08, 1.0, 0.9);
  skirt.position.set(0, skirtFlared ? 0.04 : 0.055, 0);
  spine.add(skirt);
  if (skirtFlared) {
    const hemBand = new THREE.Mesh(new THREE.CylinderGeometry(0.295, 0.315, 0.045, 18), trimMat);
    hemBand.scale.set(1.08, 1.0, 0.9);
    hemBand.position.set(0, -0.05, 0);
    spine.add(hemBand);
  }

  // Broad rounded chibi chest & soft torso belly bulge
  const torsoMain = new THREE.Mesh(new THREE.SphereGeometry(0.236, 20, 14), torsoMat);
  torsoMain.scale.set(1.08, 1.08, 0.9);
  torsoMain.position.set(0, 0.275, 0.008);
  spine.add(torsoMain);

  const upperChest = new THREE.Mesh(new THREE.CylinderGeometry(0.192, 0.226, 0.22, 18), torsoMat);
  upperChest.scale.set(1.1, 1.0, 0.88);
  upperChest.position.set(0, 0.31, 0);
  spine.add(upperChest);

  // Clothing Style Variety Layers (Apron, Buttoned Vest, Shoulder Shawl, Crossbody Satchel)
  if (!isSoldierArmor) {
    if (clothVariant === 1 || v.activeTask === 'bake' || v.activeTask === 'smelt') {
      // Work Apron bib & lower skirt flap
      const bib = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.06), apronMat);
      bib.position.set(0, 0.27, 0.205);
      spine.add(bib);
      const apronSkirt = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.06), apronMat);
      apronSkirt.position.set(0, 0.07, 0.22);
      apronSkirt.rotation.x = -0.14;
      spine.add(apronSkirt);
    } else if (clothVariant === 2) {
      // Sleeveless buttoned vest / jerkin over light shirt
      for (const side of [-1, 1]) {
        const vestSide = new THREE.Mesh(new THREE.CylinderGeometry(0.198, 0.225, 0.28, 12, 1, false, side > 0 ? 0.25 : Math.PI + 0.25, Math.PI * 0.72), cloakMat);
        vestSide.scale.set(1.09, 1.0, 0.9);
        vestSide.position.set(0, 0.28, 0.005);
        spine.add(vestSide);
      }
      for (const by of [0.22, 0.3, 0.38]) {
        const btn = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), trimMat);
        btn.position.set(0, by, 0.218);
        spine.add(btn);
      }
    } else if (clothVariant === 3) {
      // Draped shoulder shawl / capelet pinned with brooch
      const shawl = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.295, 0.18, 16), shawlMat);
      shawl.scale.set(1.12, 1.0, 0.95);
      shawl.position.set(0, 0.38, 0);
      spine.add(shawl);
      const brooch = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), goldMat);
      brooch.position.set(0.04, 0.38, 0.215);
      spine.add(brooch);
    } else if (clothVariant === 5) {
      // Crossbody traveler satchel & hip pouch
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.245, 0.022, 6, 18), leatherMat);
      strap.rotation.y = Math.PI * 0.48;
      strap.rotation.x = 0.55;
      strap.position.set(0, 0.26, 0);
      spine.add(strap);
      const satchel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.16), leatherMat);
      satchel.position.set(0.24, 0.1, -0.04);
      spine.add(satchel);
    }
  }

  // Waist sash or leather belt + buckle
  const beltMat = isSoldierArmor ? leatherMat : clothVariant === 0 ? getClayMaterial(culture.bannerColor, { roughness: 0.82 }) : leatherMat;
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.214, 0.224, 0.058, 18), beltMat);
  belt.scale.set(1.09, 1.0, 0.9);
  belt.position.set(0, 0.148, 0);
  spine.add(belt);

  if (isSoldierArmor || v.gearTier >= 2 || v.isChief) {
    const buckleMat = v.isChief ? goldMat : trimMat;
    const buckleGroup = new THREE.Group();
    buckleGroup.position.set(0, 0.148, 0.202);
    const barTop = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.016, 0.022), buckleMat);
    barTop.position.y = 0.028;
    const barBot = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.016, 0.022), buckleMat);
    barBot.position.y = -0.028;
    const barL = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.072, 0.022), buckleMat);
    barL.position.x = -0.04;
    const barR = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.072, 0.022), buckleMat);
    barR.position.x = 0.04;
    buckleGroup.add(barTop, barBot, barL, barR);
    spine.add(buckleGroup);
  }

  // Neck & cozy common collar / scarf (or sleek guard breastplate collar only for active guards/soldiers)
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.08, 0.14, 12), skinMat);
  neck.position.set(0, 0.47, 0);
  spine.add(neck);

  if (isSoldierArmor) {
    const gorget = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.042, 10, 18), plateMat);
    gorget.rotation.x = Math.PI / 2;
    gorget.position.set(0, 0.435, 0.01);
    spine.add(gorget);
  } else {
    const collarMat = clothVariant === 5 ? shawlMat : shirtMat;
    const cowl = new THREE.Mesh(new THREE.TorusGeometry(0.142, 0.038, 10, 18), collarMat);
    cowl.rotation.x = Math.PI / 2;
    cowl.position.set(0, 0.435, 0.01);
    spine.add(cowl);
    if (clothVariant === 5) {
      const scarfEnd = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.19, 0.036), shawlMat);
      scarfEnd.position.set(0.06, 0.34, 0.21);
      scarfEnd.rotation.z = -0.14;
      spine.add(scarfEnd);
    }
  }

  // Diagonal hip scabbard for blades (always present on belt when owning a sword)
  if (v.weaponType === 'iron_blade' || v.weaponType === 'bronze_blade') {
    const scabbard = new THREE.Group();
    scabbard.position.set(-0.21, 0.07, 0.02);
    scabbard.rotation.z = -0.34;
    scabbard.rotation.x = 0.42;
    const sheath = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.022, 0.46, 10), leatherMat);
    sheath.position.y = -0.14;
    scabbard.add(sheath);
    const chape = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 8), goldMat);
    chape.position.y = -0.37;
    scabbard.add(chape);
    spine.add(scabbard);
  }

  // Back-slung stowed weapon (visible when idle/walking/working with tools so armed villagers don't wave weapons at berries/trees!)
  if (v.weaponType !== 'none') {
    const stowedGroup = new THREE.Group();
    if (v.weaponType === 'bow') {
      stowedGroup.position.set(0, 0.26, -0.22);
      stowedGroup.rotation.z = 0.55;
      const bowArc = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.026, 8, 16, Math.PI), leatherMat);
      bowArc.rotation.z = -Math.PI / 2;
      stowedGroup.add(bowArc);
    } else if (v.weaponType === 'flint_spear') {
      stowedGroup.position.set(0.06, 0.22, -0.22);
      stowedGroup.rotation.z = 0.42;
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 1.08, 8), leatherMat);
      stowedGroup.add(shaft);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.2, 6), getClayMaterial(0x7c858f, { roughness: 0.6 }));
      tip.position.y = 0.62;
      stowedGroup.add(tip);
    } else {
      // Stowed sword hilt poking out of hip scabbard
      stowedGroup.position.set(-0.21, 0.14, -0.02);
      stowedGroup.rotation.z = -0.34;
      stowedGroup.rotation.x = 0.42;
      const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.16, 8), leatherMat);
      hilt.position.y = 0.07;
      stowedGroup.add(hilt);
      const guard = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), trimMat);
      guard.scale.set(1.2, 0.26, 0.55);
      guard.position.y = 0.0;
      stowedGroup.add(guard);
      const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), trimMat);
      pommel.position.y = 0.16;
      stowedGroup.add(pommel);
    }
    spine.add(stowedGroup);
    g.userData.stowedWeaponGroup = stowedGroup;
  }

  // Carried Resource Bundle on chest/cradle (visible during hauling)
  const carriedBundle = new THREE.Group();
  const sack = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16, 1), trimMat);
  sack.scale.set(1.15, 0.85, 0.9);
  carriedBundle.add(sack);
  const rope = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.018, 6, 14), leatherMat);
  rope.rotation.x = Math.PI / 2;
  carriedBundle.add(rope);
  carriedBundle.position.set(0, 0.22, 0.3);
  carriedBundle.visible = false;
  spine.add(carriedBundle);
  g.userData.carriedBundle = carriedBundle;

  // Chibi Shoulders, Soft Rolled Sleeves (or light guard pads for guards) & Rounded Hands
  const buildArm = (side: -1 | 1) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.255, 0.415, 0);

    if (isSoldierArmor) {
      const pauldron = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.65), plateMat);
      pauldron.rotation.z = -side * 0.28;
      pauldron.position.set(side * 0.012, 0.012, 0);
      shoulder.add(pauldron);
    } else {
      const sleeveCap = new THREE.Mesh(new THREE.SphereGeometry(0.086, 12, 10), clothVariant === 0 ? skinMat : sleeveMat);
      shoulder.add(sleeveCap);
    }

    const upperArm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.068, 0.06, 0.16, 12),
      clothVariant === 0 ? skinMat : sleeveMat,
    );
    upperArm.position.set(0, -0.09, 0);
    shoulder.add(upperArm);

    const forearm = new THREE.Group();
    forearm.position.set(0, -0.16, 0);

    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.056, 10, 10), clothVariant === 0 ? skinMat : sleeveMat);
    forearm.add(elbow);

    if (isSoldierArmor) {
      const bracer = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.05, 0.135, 12), plateMat);
      bracer.position.set(0, -0.07, 0);
      forearm.add(bracer);
    } else {
      const rolledCuff = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.018, 6, 12), shirtMat);
      rolledCuff.rotation.x = Math.PI / 2;
      rolledCuff.position.set(0, -0.02, 0);
      forearm.add(rolledCuff);
      const lowerArm = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.046, 0.135, 12), skinMat);
      lowerArm.position.set(0, -0.07, 0);
      forearm.add(lowerArm);
    }

    const handGroup = new THREE.Group();
    handGroup.position.set(0, -0.145, 0);

    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.048, 12, 10), skinMat);
    palm.scale.set(0.92, 0.96, 0.72);
    palm.position.set(0, -0.022, 0);
    handGroup.add(palm);

    for (const fx of [-0.022, 0, 0.022]) {
      const finger = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 8), skinMat);
      finger.scale.set(0.85, 1.55, 0.85);
      finger.position.set(fx, -0.058, 0.004);
      handGroup.add(finger);
    }

    const thumb = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.011, 0.04, 8), skinMat);
    thumb.position.set(-side * 0.036, -0.022, 0.014);
    thumb.rotation.z = -side * 0.65;
    handGroup.add(thumb);

    forearm.add(handGroup);
    shoulder.add(forearm);
    return { shoulder, forearm };
  };

  const armLRig = buildArm(-1);
  spine.add(armLRig.shoulder);
  g.userData.shoulderL = armLRig.shoulder;
  g.userData.forearmL = armLRig.forearm;

  const armRRig = buildArm(1);
  spine.add(armRRig.shoulder);
  g.userData.shoulderR = armRRig.shoulder;
  g.userData.forearmR = armRRig.forearm;

  // Oversized Chibi Clay Head
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.515, 0.01);
  buildChibiFaceAndHair(headGroup, {
    skinMat,
    hairMat,
    hairStyle: v.hairStyle,
    eyeColor,
    isElder: v.lifeStage === 'elder',
    hasHelmCrest: v.gearTier === 3 && (v.activeTask === 'guard' || v.drafted),
    plateMat,
  });

  // Everyday job & style headgear mounted on headGroup so hats move naturally with head nods
  if (v.activeTask === 'farm' || v.activeTask === 'forage' || v.activeTask === 'pasture') {
    const strawMat = getClayMaterial(0xe3c178, { roughness: 0.84 });
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.45, 0.04, 16), strawMat);
    brim.position.set(0, 0.44, -0.01);
    headGroup.add(brim);
    const hatTop = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.27, 0.16, 14), strawMat);
    hatTop.position.set(0, 0.53, -0.01);
    headGroup.add(hatTop);
    const ribbon = new THREE.Mesh(new THREE.CylinderGeometry(0.265, 0.275, 0.045, 14), cloakMat);
    ribbon.position.set(0, 0.47, -0.01);
    headGroup.add(ribbon);
  } else if (v.activeTask === 'bake') {
    const toque = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), shirtMat);
    toque.scale.set(1.05, 0.85, 1.05);
    toque.position.set(0, 0.54, -0.02);
    headGroup.add(toque);
  } else if (clothVariant === 1 && !isSoldierArmor) {
    const kerchief = new THREE.Mesh(
      new THREE.SphereGeometry(0.285, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.42),
      shawlMat,
    );
    kerchief.position.set(0, 0.29, -0.02);
    kerchief.rotation.x = -0.18;
    headGroup.add(kerchief);
  }

  // Chief golden crown circlet perched cleanly above rounded hair dome
  const chiefBadge = new THREE.Group();
  const crown = new THREE.Mesh(
    new THREE.ConeGeometry(0.145, 0.21, 6),
    getClayMaterial(0xfde047, { roughness: 0.24, metalness: 0.72, emissive: 0xd97706, emissiveIntensity: 0.35 }),
  );
  crown.position.y = 0.64;
  chiefBadge.add(crown);
  chiefBadge.visible = v.isChief;
  headGroup.add(chiefBadge);
  g.userData.chiefBadge = chiefBadge;

  // Rain hat sized cleanly for the rounded chibi head (also on headGroup!)
  const rainHat = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.21, 14), getClayMaterial(0xd99b52, { roughness: 0.8 }));
  rainHat.position.set(0, 0.54, -0.01);
  rainHat.visible = false;
  headGroup.add(rainHat);
  g.userData.rainHat = rainHat;

  spine.add(headGroup);
  bodyWrap.add(spine);
  g.userData.spine = spine;
  g.userData.headGroup = headGroup;
  g.userData.bodyWrap = bodyWrap;

  // Hand-socketed Active Drawn Weapons attached to forearmR / forearmL (only visible when drawn in combat/guard/drafted!)
  if (v.weaponType !== 'none') {
    const weaponGroup = new THREE.Group();
    if (v.weaponType === 'bow') {
      weaponGroup.position.set(-0.02, -0.175, 0.025);
      weaponGroup.rotation.x = Math.PI * 0.48;
      const bowArc = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.028, 8, 16, Math.PI), leatherMat);
      bowArc.rotation.z = -Math.PI / 2;
      bowArc.position.set(0, 0.12, 0.08);
      weaponGroup.add(bowArc);
      const string = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.68, 6), trimMat);
      string.position.set(0, 0.12, -0.02);
      weaponGroup.add(string);
      armLRig.forearm.add(weaponGroup);

      const bowArrow = new THREE.Group();
      bowArrow.position.set(0.02, -0.175, 0.03);
      bowArrow.rotation.x = Math.PI * 0.48;
      const arrowShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 6), leatherMat);
      arrowShaft.position.y = 0.24;
      bowArrow.add(arrowShaft);
      const arrowTip = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.09, 5), steelMat);
      arrowTip.position.y = 0.56;
      bowArrow.add(arrowTip);
      bowArrow.visible = false;
      armRRig.forearm.add(bowArrow);
      g.userData.bowArrow = bowArrow;
    } else if (v.weaponType === 'flint_spear') {
      weaponGroup.position.set(0.02, -0.175, 0.03);
      weaponGroup.rotation.x = Math.PI * 0.48;
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 1.24, 10), leatherMat);
      shaft.position.y = 0.26;
      weaponGroup.add(shaft);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.072, 0.24, 8), getClayMaterial(0x7c858f, { roughness: 0.6 }));
      tip.position.y = 0.94;
      weaponGroup.add(tip);
      armRRig.forearm.add(weaponGroup);
    } else {
      weaponGroup.position.set(0.02, -0.175, 0.03);
      weaponGroup.rotation.x = Math.PI * 0.48;
      const bladeMat =
        v.weaponType === 'bronze_blade'
          ? getClayMaterial(0xd9924c, { metalness: 0.62, roughness: 0.34 })
          : steelMat;

      const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.036, 12, 10), trimMat);
      pommel.position.y = -0.05;
      weaponGroup.add(pommel);

      const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.17, 10), leatherMat);
      hilt.position.y = 0.04;
      weaponGroup.add(hilt);

      const collarRing = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.022, 10), trimMat);
      collarRing.position.y = 0.04;
      weaponGroup.add(collarRing);

      const guard = new THREE.Mesh(new THREE.SphereGeometry(0.095, 14, 10), trimMat);
      guard.scale.set(1.22, 0.28, 0.56);
      guard.position.y = 0.135;
      weaponGroup.add(guard);

      const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.046, 0.48, 4), bladeMat);
      blade.scale.set(0.45, 1.0, 1.15);
      blade.position.y = 0.38;
      weaponGroup.add(blade);

      const bladeTip = new THREE.Mesh(new THREE.ConeGeometry(0.034, 0.12, 4), bladeMat);
      bladeTip.scale.set(0.45, 1.0, 1.12);
      bladeTip.position.y = 0.68;
      weaponGroup.add(bladeTip);

      armRRig.forearm.add(weaponGroup);
    }
    weaponGroup.visible = false;
    g.userData.weaponGroup = weaponGroup;
  }

  // Hand-held Construction Hammer
  const hammerGroup = new THREE.Group();
  hammerGroup.position.set(0.02, -0.175, 0.03);
  hammerGroup.rotation.x = Math.PI * 0.48;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.028, 0.42, 10), leatherMat);
  handle.position.y = 0.14;
  hammerGroup.add(handle);
  const headHammer = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.13, 0.25), steelMat);
  headHammer.position.y = 0.34;
  hammerGroup.add(headHammer);
  hammerGroup.visible = false;
  armRRig.forearm.add(hammerGroup);
  g.userData.hammerGroup = hammerGroup;

  // Hand-held Woodcutter Axe
  const axeGroup = new THREE.Group();
  axeGroup.position.set(0.02, -0.175, 0.03);
  axeGroup.rotation.x = Math.PI * 0.48;
  const axeHaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.028, 0.54, 10), leatherMat);
  axeHaft.position.y = 0.2;
  axeGroup.add(axeHaft);
  const axeHead = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.17, 0.23), steelMat);
  axeHead.position.set(0, 0.42, 0.08);
  axeGroup.add(axeHead);
  axeGroup.visible = false;
  armRRig.forearm.add(axeGroup);
  g.userData.axeGroup = axeGroup;

  // Hand-held Stone Pickaxe
  const pickaxeGroup = new THREE.Group();
  pickaxeGroup.position.set(0.02, -0.175, 0.03);
  pickaxeGroup.rotation.x = Math.PI * 0.48;
  const pickHaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.028, 0.54, 10), leatherMat);
  pickHaft.position.y = 0.2;
  pickaxeGroup.add(pickHaft);
  const pickHead = new THREE.Mesh(new THREE.ConeGeometry(0.058, 0.36, 8), steelMat);
  pickHead.rotation.x = Math.PI / 2;
  pickHead.position.set(0, 0.44, 0.02);
  pickaxeGroup.add(pickHead);
  pickaxeGroup.visible = false;
  armRRig.forearm.add(pickaxeGroup);
  g.userData.pickaxeGroup = pickaxeGroup;

  g.add(bodyWrap);
  g.userData.bodyWrap = bodyWrap;
  g.scale.setScalar(scale);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.56, 20),
    new THREE.MeshBasicMaterial({
      color: v.isStranger ? 0xef4444 : 0xf59e0b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: v.isStranger ? 0.85 : 0.92,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.035;
  ring.visible = Boolean(v.isStranger);
  ring.userData.ownMaterial = true;
  g.add(ring);
  g.userData.selectRing = ring;

  setShadows(g, true, true);
  return g;
}

export function createTravelerGateVisitor(candidate: ArrivalCandidate): THREE.Group {
  const g = new THREE.Group();
  const cloakMat = getClayMaterial(candidate.cloakColor, { roughness: 0.82 });
  const skinMat = getClayMaterial(candidate.skinTone, { roughness: 0.8 });
  const hairMat = getClayMaterial(candidate.hairColor, { roughness: 0.78 });
  const leatherMat = getClayMaterial(0x5b3c29, { roughness: 0.82 });
  const trimMat = getClayMaterial(0xe5d7bc, { roughness: 0.76 });

  // Chibi traveler boots & flared travel tunic
  for (const side of [-1, 1]) {
    const boot = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.078, 0.24, 12), leatherMat);
    boot.position.set(side * 0.12, 0.14, 0);
    g.add(boot);
    const toe = new THREE.Mesh(new THREE.SphereGeometry(0.074, 12, 10), leatherMat);
    toe.scale.set(1.05, 0.65, 1.45);
    toe.position.set(side * 0.12, 0.05, 0.04);
    g.add(toe);
  }

  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.22, 16), cloakMat);
  skirt.scale.set(1.08, 1.0, 0.9);
  skirt.position.y = 0.36;
  g.add(skirt);

  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.23, 18, 14), cloakMat);
  torso.scale.set(1.06, 1.05, 0.9);
  torso.position.y = 0.6;
  g.add(torso);

  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.22, 0.06, 16), leatherMat);
  belt.scale.set(1.08, 1.0, 0.9);
  belt.position.y = 0.48;
  g.add(belt);

  const cowl = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.045, 10, 18), trimMat);
  cowl.rotation.x = Math.PI / 2;
  cowl.position.y = 0.79;
  g.add(cowl);

  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.18), leatherMat);
  pack.position.set(0, 0.62, -0.24);
  g.add(pack);

  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.83, 0.01);
  buildChibiFaceAndHair(headGroup, {
    skinMat,
    hairMat,
    hairStyle: candidate.hairStyle,
    eyeColor: EYE_COLORS[candidate.hairStyle % EYE_COLORS.length],
  });
  g.add(headGroup);

  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.47, 0.055, 16), leatherMat);
  brim.position.y = 1.24;
  g.add(brim);
  const hatTop = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.26, 14), leatherMat);
  hatTop.position.y = 1.38;
  g.add(hatTop);

  setShadows(g, true, true);
  return g;
}

export function createLivestockGroup(l: LivestockEntity): THREE.Group {
  const g = new THREE.Group();
  const bodyWrap = new THREE.Group();

  if (l.kind === 'sheep') {
    const woolMat = getFlatMaterial(0xf3eee3, { roughness: 0.92 });
    const faceMat = getFlatMaterial(0x3a342e, { roughness: 0.85 });
    const wool = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), woolMat);
    wool.scale.set(1.25, 0.92, 0.95);
    wool.position.y = 0.32;
    bodyWrap.add(wool);

    const headGroup = new THREE.Group();
    headGroup.position.set(0.28, 0.38, 0);
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 0), faceMat);
    headGroup.add(head);
    bodyWrap.add(headGroup);
    g.userData.headGroup = headGroup;

    for (const [key, lx, lz] of [
      ['legFL', 0.14, -0.1],
      ['legFR', 0.14, 0.1],
      ['legBL', -0.14, -0.1],
      ['legBR', -0.14, 0.1],
    ] as [string, number, number][]) {
      const legPivot = new THREE.Group();
      legPivot.position.set(lx, 0.22, lz);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.032, 0.22, 4), faceMat);
      leg.position.y = -0.11;
      legPivot.add(leg);
      bodyWrap.add(legPivot);
      g.userData[key] = legPivot;
    }
  } else if (l.kind === 'pig') {
    const pigMat = getFlatMaterial(0xe3a89c, { roughness: 0.78 });
    const snoutMat = getFlatMaterial(0xc97b74, { roughness: 0.72 });
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 1), pigMat);
    body.scale.set(1.32, 0.88, 0.9);
    body.position.y = 0.26;
    bodyWrap.add(body);

    const headGroup = new THREE.Group();
    headGroup.position.set(0.26, 0.26, 0);
    const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.12, 6), snoutMat);
    snout.rotation.z = -Math.PI / 2;
    snout.position.set(0.08, 0, 0);
    headGroup.add(snout);
    bodyWrap.add(headGroup);
    g.userData.headGroup = headGroup;

    for (const [key, lx, lz] of [
      ['legFL', 0.14, -0.1],
      ['legFR', 0.14, 0.1],
      ['legBL', -0.14, -0.1],
      ['legBR', -0.14, 0.1],
    ] as [string, number, number][]) {
      const legPivot = new THREE.Group();
      legPivot.position.set(lx, 0.16, lz);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.03, 0.16, 4), pigMat);
      leg.position.y = -0.08;
      legPivot.add(leg);
      bodyWrap.add(legPivot);
      g.userData[key] = legPivot;
    }
  } else {
    // Fowl
    const featherMat = getFlatMaterial(0xd9a14c, { roughness: 0.8 });
    const beakMat = getFlatMaterial(0xf59e0b);
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 0), featherMat);
    body.scale.set(1.25, 0.92, 0.88);
    body.position.y = 0.18;
    bodyWrap.add(body);

    const headGroup = new THREE.Group();
    headGroup.position.set(0.14, 0.28, 0);
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 0), featherMat);
    headGroup.add(head);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 4), beakMat);
    beak.rotation.z = -Math.PI / 2;
    beak.position.set(0.1, -0.01, 0);
    headGroup.add(beak);
    bodyWrap.add(headGroup);
    g.userData.headGroup = headGroup;

    for (const [key, lx, lz] of [
      ['legFL', 0.04, -0.05],
      ['legFR', 0.04, 0.05],
      ['legBL', -0.04, -0.05],
      ['legBR', -0.04, 0.05],
    ] as [string, number, number][]) {
      const legPivot = new THREE.Group();
      legPivot.position.set(lx, 0.12, lz);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.018, 0.12, 4), featherMat);
      leg.position.y = -0.06;
      legPivot.add(leg);
      bodyWrap.add(legPivot);
      g.userData[key] = legPivot;
    }
  }

  g.add(bodyWrap);
  g.userData.bodyWrap = bodyWrap;
  const baseScale = l.kind === 'fowl' ? 0.72 : l.kind === 'pig' ? 0.94 : 1.06;
  g.scale.setScalar(baseScale * (l.scale ?? 1));
  g.userData.entityKind = 'animal';
  g.userData.animalKind = 'livestock';
  g.userData.animalId = l.id;
  setShadows(g, true, false);
  return g;
}

export function createWildHerdGroup(h: WildHerdEntity): THREE.Group {
  const g = new THREE.Group();
  const bodyWrap = new THREE.Group();
  const mat = getClayMaterial(h.color, { roughness: 0.82 });
  const tailMat = getClayMaterial(h.kind === 'rabbit' ? 0xf6f1e6 : h.color, { roughness: 0.85 });

  if (h.kind === 'rabbit') {
    const torso = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), mat);
    torso.scale.set(1.3, 0.9, 0.88);
    torso.position.y = 0.16;
    bodyWrap.add(torso);

    const headGroup = new THREE.Group();
    headGroup.position.set(0.15, 0.23, 0);
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 1), mat);
    headGroup.add(head);
    const earL = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.21, 5), mat);
    earL.position.set(-0.02, 0.14, -0.045);
    headGroup.add(earL);
    const earR = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.21, 5), mat);
    earR.position.set(-0.02, 0.14, 0.045);
    headGroup.add(earR);
    bodyWrap.add(headGroup);
    g.userData.headGroup = headGroup;
    g.userData.earL = earL;
    g.userData.earR = earR;

    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.062, 8, 6), tailMat);
    tail.position.set(-0.19, 0.16, 0);
    bodyWrap.add(tail);
    g.userData.tail = tail;

    for (const [key, lx, lz] of [
      ['legFL', 0.1, -0.06],
      ['legFR', 0.1, 0.06],
      ['legBL', -0.1, -0.07],
      ['legBR', -0.1, 0.07],
    ] as [string, number, number][]) {
      const legPivot = new THREE.Group();
      legPivot.position.set(lx, 0.1, lz);
      const legMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.02, 0.1, 4), mat);
      legMesh.position.y = -0.05;
      legPivot.add(legMesh);
      bodyWrap.add(legPivot);
      g.userData[key] = legPivot;
    }
  } else if (h.kind === 'deer') {
    const legMat = getClayMaterial(0x7c573c, { roughness: 0.85 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.32, 0.28), mat);
    body.position.y = 0.48;
    bodyWrap.add(body);

    for (const [key, lx, lz] of [
      ['legFL', 0.22, -0.1],
      ['legFR', 0.22, 0.1],
      ['legBL', -0.22, -0.1],
      ['legBR', -0.22, 0.1],
    ] as [string, number, number][]) {
      const legPivot = new THREE.Group();
      legPivot.position.set(lx, 0.4, lz);
      const legMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.42, 5), legMat);
      legMesh.position.y = -0.2;
      legPivot.add(legMesh);
      bodyWrap.add(legPivot);
      g.userData[key] = legPivot;
    }

    const headGroup = new THREE.Group();
    headGroup.position.set(0.28, 0.56, 0);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.34, 5), mat);
    neck.position.set(0.06, 0.14, 0);
    neck.rotation.z = -0.32;
    headGroup.add(neck);
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 1), mat);
    head.position.set(0.16, 0.3, 0);
    headGroup.add(head);
    const antlerMat = getClayMaterial(0xd5c09b, { roughness: 0.78 });
    for (const az of [-0.09, 0.09]) {
      const antler = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.32, 4), antlerMat);
      antler.position.set(0.12, 0.5, az);
      antler.rotation.x = az > 0 ? 0.35 : -0.35;
      headGroup.add(antler);
    }
    bodyWrap.add(headGroup);
    g.userData.headGroup = headGroup;

    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 4), tailMat);
    tail.position.set(-0.36, 0.54, 0);
    tail.rotation.z = 0.65;
    bodyWrap.add(tail);
    g.userData.tail = tail;
  } else {
    // Wild Boar with articulated head, tusks, tail & trot legs
    const tuskMat = getClayMaterial(0xf5efe2, { roughness: 0.7 });
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 1), mat);
    body.scale.set(1.4, 0.92, 0.88);
    body.position.y = 0.34;
    bodyWrap.add(body);

    const headGroup = new THREE.Group();
    headGroup.position.set(0.32, 0.34, 0);
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 1), mat);
    head.position.set(0.08, -0.02, 0);
    headGroup.add(head);
    for (const tz of [-0.1, 0.1]) {
      const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.18, 4), tuskMat);
      tusk.rotation.z = -0.7;
      tusk.position.set(0.22, -0.06, tz);
      headGroup.add(tusk);
    }
    bodyWrap.add(headGroup);
    g.userData.headGroup = headGroup;

    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.028, 0.16, 4), mat);
    tail.position.set(-0.44, 0.38, 0);
    tail.rotation.z = 0.72;
    bodyWrap.add(tail);
    g.userData.tail = tail;

    for (const [key, lx, lz] of [
      ['legFL', 0.2, -0.14],
      ['legFR', 0.2, 0.14],
      ['legBL', -0.2, -0.14],
      ['legBR', -0.2, 0.14],
    ] as [string, number, number][]) {
      const legPivot = new THREE.Group();
      legPivot.position.set(lx, 0.22, lz);
      const legMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.22, 5), mat);
      legMesh.position.y = -0.11;
      legPivot.add(legMesh);
      bodyWrap.add(legPivot);
      g.userData[key] = legPivot;
    }
  }

  g.add(bodyWrap);
  g.userData.bodyWrap = bodyWrap;
  const baseScale = h.kind === 'rabbit' ? 0.65 : h.kind === 'deer' ? 1.24 : 1.15;
  g.scale.setScalar(baseScale * (h.scale ?? 1));
  g.userData.entityKind = 'animal';
  g.userData.animalKind = 'wild';
  g.userData.animalId = h.id;
  setShadows(g, true, false);
  return g;
}

export function createCatGroup(): THREE.Group {
  const g = new THREE.Group();
  const bodyWrap = new THREE.Group();
  const mat = getFlatMaterial(0xd98245, { roughness: 0.78 });
  const creamMat = getFlatMaterial(0xf7ead6, { roughness: 0.84 });
  const eyeMat = getFlatMaterial(0x6ee7b7, { emissive: 0x10b981, emissiveIntensity: 0.35 });

  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18, 1), mat);
  body.scale.set(1.48, 0.84, 0.82);
  body.position.set(0, 0.23, 0);
  bodyWrap.add(body);

  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.155, 1), mat);
  head.position.set(0.24, 0.37, 0);
  bodyWrap.add(head);

  for (const ez of [-0.08, 0.08]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.13, 3), mat);
    ear.position.set(0.23, 0.53, ez);
    bodyWrap.add(ear);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.035), eyeMat);
    eye.position.set(0.36, 0.39, ez * 0.7);
    bodyWrap.add(eye);
  }

  for (const [key, lx, lz] of [
    ['legFL', 0.16, -0.09],
    ['legFR', 0.16, 0.09],
    ['legBL', -0.15, -0.09],
    ['legBR', -0.15, 0.09],
  ] as [string, number, number][]) {
    const legPivot = new THREE.Group();
    legPivot.position.set(lx, 0.18, lz);
    const legMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.032, 0.18, 5), mat);
    legMesh.position.y = -0.08;
    legPivot.add(legMesh);
    bodyWrap.add(legPivot);
    g.userData[key] = legPivot;
  }

  const tail = new THREE.Group();
  tail.position.set(-0.24, 0.25, 0);
  const tailSeg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.044, 0.28, 5), mat);
  tailSeg1.position.set(-0.07, 0.11, 0);
  tailSeg1.rotation.z = 0.55;
  tail.add(tailSeg1);
  const tailTip = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.16, 5), creamMat);
  tailTip.position.set(-0.14, 0.26, 0);
  tailTip.rotation.z = -0.2;
  tail.add(tailTip);
  bodyWrap.add(tail);

  g.add(bodyWrap);
  g.userData.bodyWrap = bodyWrap;
  g.userData.tail = tail;
  g.scale.setScalar(0.84);
  g.userData.entityKind = 'animal';
  g.userData.animalKind = 'cat';
  g.userData.animalId = 'cat_hearth';
  setShadows(g, true, false);
  return g;
}

export function createLowPolyCloud(widthScale: number): THREE.Group {
  const g = new THREE.Group();
  const mat = getFlatMaterial(0xfefcf8, { roughness: 0.92, transparent: true, opacity: 0.88 });
  for (const [px, py, pz, r] of [
    [0, 0, 0, 1.32],
    [-1.12, -0.2, 0.2, 0.96],
    [1.12, -0.15, -0.15, 1.02],
  ]) {
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), mat);
    puff.position.set(px, py, pz);
    puff.scale.set(1.22, 0.65, 0.95);
    g.add(puff);
  }
  g.scale.set(widthScale, 0.9, widthScale * 0.85);
  setShadows(g, false, false);
  return g;
}

export function createLandmarkGroup(
  lm: WorldLandmark,
  season: SeasonType,
  weather: WeatherType,
): THREE.Group {
  const g = new THREE.Group();
  const snow = weather === 'snow' || season === 'winter';
  const rockMat = getClayMaterial(snow ? 0x86929c : 0x6f716e, { roughness: 0.92 });
  const rockDarkMat = getClayMaterial(snow ? 0x69747e : 0x525552, { roughness: 0.94 });
  const rockLightMat = getClayMaterial(snow ? 0xa4b0ba : 0x90928d, { roughness: 0.88 });
  const mossMat = getClayMaterial(snow ? 0xd9e5ee : season === 'autumn' ? 0x9b8244 : 0x527d32, { roughness: 0.88 });
  const woodMat = getClayMaterial(0x6b3d24, { roughness: 0.9 });
  const heartWoodMat = getClayMaterial(0xe0c093, { roughness: 0.8 });

  if (lm.kind === 'reed_clump') {
    const reedMat = getFlatMaterial(snow ? 0x98ab9e : 0x4f8a48, { roughness: 0.82 });
    const headMat = getFlatMaterial(0x6e4a2f, { roughness: 0.88 });
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.032, 0.72 + (i % 2) * 0.24, 4), reedMat);
      stalk.position.set(Math.cos(ang) * 0.22, 0.32, Math.sin(ang) * 0.22);
      stalk.rotation.z = Math.cos(ang) * 0.14;
      g.add(stalk);
      if (i % 2 === 0) {
        const cattail = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.22, 5), headMat);
        cattail.position.set(Math.cos(ang) * 0.2, 0.65, Math.sin(ang) * 0.2);
        g.add(cattail);
      }
    }
  } else if (lm.kind === 'driftwood') {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 2.1, 6), woodMat);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = 0.35;
    log.position.set(0, 0.12, 0);
    g.add(log);
    const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.13, 0.9, 5), woodMat);
    fork.rotation.z = 0.92;
    fork.position.set(0.45, 0.32, 0.14);
    g.add(fork);
  } else if (lm.kind === 'ruin_cairn') {
    const floor = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.26, 1.8), rockDarkMat);
    floor.position.y = 0.04;
    g.add(floor);
    for (const [px, h, pz] of [
      [-0.65, 1.25, -0.5],
      [0.65, 0.9, -0.5],
      [-0.65, 0.65, 0.55],
    ]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, h, 5), rockMat);
      col.position.set(px, h * 0.5 + 0.12, pz);
      g.add(col);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.24, 0.36), rockMat);
    lintel.position.set(0, 1.18, -0.5);
    lintel.rotation.z = -0.18;
    g.add(lintel);
  } else if (lm.kind === 'sky_islet') {
    // Drifting mini rock islet floating in sky-sea
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.5, 0.5, 7), mossMat);
    top.position.y = 0.35;
    g.add(top);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(1.55, 2.9, 7), rockDarkMat);
    spire.rotation.x = Math.PI;
    spire.position.y = -1.35;
    g.add(spire);
    const boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0), rockMat);
    boulder.position.set(-0.35, 0.72, 0.25);
    g.add(boulder);
  } else if (lm.kind === 'crystal_spire') {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.12, 0.42, 6), rockDarkMat);
    base.position.y = 0.14;
    g.add(base);
    const crysMat = getFlatMaterial(0x7be0ea, {
      roughness: 0.18,
      metalness: 0.25,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.55,
    });
    const spireMain = new THREE.Mesh(new THREE.OctahedronGeometry(0.62, 0), crysMat);
    spireMain.scale.set(0.75, 2.6, 0.75);
    spireMain.position.y = 1.45;
    g.add(spireMain);
    for (const [ox, oz, s] of [[-0.48, 0.28, 0.52], [0.46, -0.25, 0.48]]) {
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), crysMat);
      shard.scale.set(0.75, 1.8 * s * 2, 0.75);
      shard.position.set(ox, 0.85, oz);
      shard.rotation.z = ox > 0 ? -0.24 : 0.24;
      g.add(shard);
    }
  } else if (lm.kind === 'stump') {
    const roots = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.48, 0.26, 7), woodMat);
    roots.position.y = 0.1;
    g.add(roots);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.46, 7), woodMat);
    trunk.position.y = 0.26;
    g.add(trunk);
    const topRing = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.25, 0.05, 7), heartWoodMat);
    topRing.position.y = 0.5;
    g.add(topRing);
    // Tiny sprouting twig & moss pebble at base
    const sprout = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 4), mossMat);
    sprout.position.set(0.32, 0.24, 0.12);
    sprout.rotation.z = -0.35;
    g.add(sprout);
    const pebble = new THREE.Mesh(new THREE.DodecahedronGeometry(0.14, 0), rockLightMat);
    pebble.position.set(-0.36, 0.08, -0.18);
    g.add(pebble);
  }

  g.scale.setScalar(lm.scale);
  g.rotation.y = lm.rotY;
  setShadows(g, true, true);
  return g;
}

export function createExploreRuinGroup(ruin: ExploreRuinEntity, nightFactor: number): THREE.Group {
  const g = new THREE.Group();
  const isVault = ruin.kind === 'ashen_vault';
  const isFrost = ruin.kind === 'frost_shrine';
  const stoneMat = getFlatMaterial(isVault ? 0x3b3332 : isFrost ? 0x6f8294 : 0x9b9586, { roughness: 0.92 });
  const trimMat = getFlatMaterial(isVault ? 0x5c362e : isFrost ? 0xa3bfd4 : 0xbcb5a4, { roughness: 0.82 });
  const glowHex = isVault ? 0xf97316 : isFrost ? 0x67e8f9 : 0xfde047;
  const ready = ruin.cooldownTimer <= 0.1;

  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.38, 1.65, 0.45, 6), stoneMat);
  base.position.y = 0.08;
  g.add(base);

  const innerRing = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.22, 6), trimMat);
  innerRing.position.y = 0.36;
  g.add(innerRing);

  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const pillar = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, i % 2 === 0 ? 1.85 : 1.42, 0.32),
      i % 2 === 0 ? stoneMat : trimMat,
    );
    pillar.position.set(Math.cos(ang) * 0.92, i % 2 === 0 ? 1.05 : 0.84, Math.sin(ang) * 0.92);
    pillar.rotation.z = i === 1 ? 0.08 : 0;
    g.add(pillar);
  }

  const crystalMat = getFlatMaterial(ready ? glowHex : 0x64748b, {
    emissive: ready ? glowHex : 0x000000,
    emissiveIntensity: ready ? (nightFactor > 0.25 ? 1.5 : 0.85) : 0,
    roughness: 0.22,
    metalness: 0.3,
  });
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), crystalMat);
  crystal.scale.set(0.85, 1.45, 0.85);
  crystal.position.y = 1.68;
  g.add(crystal);
  g.userData.hoverCrystal = crystal;

  setShadows(g, true, true);
  return g;
}

export function createSkyCablewayGroup(cable: SkyCablewayEntity, lit: boolean): THREE.Group {
  const g = new THREE.Group();
  const x1 = toWorldX(cable.x1);
  const z1 = toWorldZ(cable.y1);
  const y1 = groundHeightAtSim(cable.x1, cable.y1);
  const x2 = toWorldX(cable.x2);
  const z2 = toWorldZ(cable.y2);
  const y2 = groundHeightAtSim(cable.x2, cable.y2);

  const woodMat = getFlatMaterial(0x6e4a2f, { roughness: 0.86 });
  const ironMat = getFlatMaterial(0x3a414a, { roughness: 0.45, metalness: 0.72 });
  const brassMat = getFlatMaterial(0xd8a13e, { roughness: 0.35, metalness: 0.75 });
  const ropeMat = getFlatMaterial(0xcab68a, { roughness: 0.85 });
  const lanternMat = getFlatMaterial(lit ? 0xfde047 : 0x9aa6ad, {
    emissive: lit ? 0xf59e0b : 0x000000,
    emissiveIntensity: lit ? 1.4 : 0,
    roughness: 0.3,
  });

  const dx = x2 - x1;
  const dz = z2 - z1;
  const yaw = Math.atan2(dx, dz);

  // Twin cliffside cableway pylon stations
  for (const [px, py, pz] of [
    [x1, y1, z1],
    [x2, y2, z2],
  ]) {
    const pylon = new THREE.Group();
    pylon.position.set(px, py, pz);
    pylon.rotation.y = yaw;

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.9, 2.0), getFlatMaterial(0x736b60, { roughness: 0.94 }));
    plinth.position.y = -0.15;
    pylon.add(plinth);

    for (const sx of [-0.65, 0.65]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 3.0, 5), woodMat);
      post.position.set(sx, 1.5, 0);
      pylon.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.2, 0.24), woodMat);
    beam.position.set(0, 2.9, 0);
    pylon.add(beam);

    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.12, 8), ironMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(0, 2.95, 0);
    pylon.add(wheel);

    const lamp = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), lanternMat);
    lamp.position.set(0.75, 3.18, 0);
    pylon.add(lamp);

    g.add(pylon);
  }

  if (cable.built) {
    const pA = new THREE.Vector3(x1, y1 + 2.95, z1);
    const pB = new THREE.Vector3(x2, y2 + 2.95, z2);
    const dir = pB.clone().sub(pA);
    const len = dir.length();
    if (len > 0.1) {
      const line = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, len, 5), ironMat);
      line.position.copy(pA).add(pB).multiplyScalar(0.5);
      line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      g.add(line);

      const lowerLine = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, len, 4), ropeMat);
      lowerLine.position.copy(pA).add(pB).multiplyScalar(0.5).add(new THREE.Vector3(0, -0.35, 0));
      lowerLine.quaternion.copy(line.quaternion);
      g.add(lowerLine);
    }

    // Hanging animated gondola carriage
    const gondola = new THREE.Group();
    const hanger = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.05, 4), ironMat);
    hanger.position.y = -0.52;
    gondola.add(hanger);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.88, 0.45, 4), brassMat);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = -1.05;
    gondola.add(roof);

    const basket = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.65, 1.15), woodMat);
    basket.position.y = -1.58;
    gondola.add(basket);

    const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), lanternMat);
    beacon.position.set(0, -0.95, 0.58);
    gondola.add(beacon);

    gondola.rotation.y = yaw;
    const t = Math.max(0.03, Math.min(0.97, cable.gondolaT));
    gondola.position.set(
      x1 + (x2 - x1) * t,
      y1 + 2.95 + (y2 - y1) * t - Math.sin(t * Math.PI) * 0.45,
      z1 + (z2 - z1) * t,
    );
    g.add(gondola);
    g.userData.gondola = gondola;
    g.userData.pA = [x1, y1 + 2.95, z1];
    g.userData.pB = [x2, y2 + 2.95, z2];
  }

  setShadows(g, true, true);
  return g;
}

export function createAirGliderGroup(glider: AirGliderEntity): THREE.Group {
  const g = new THREE.Group();
  const woodMat = getFlatMaterial(0x7c5032, { roughness: 0.84 });
  const wingMat = getFlatMaterial(glider.wingColor || '#EFE4CE', { roughness: 0.68 });
  const accentMat = getFlatMaterial(0xd97706, { roughness: 0.65 });

  // Swept V-wings
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.06, 0.92), wingMat);
    wing.position.set(-0.15, 0.14, side * 0.72);
    wing.rotation.y = side * 0.34;
    wing.rotation.x = side * 0.12;
    g.add(wing);
  }
  const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.95, 5), woodMat);
  spine.rotation.z = Math.PI / 2;
  spine.position.set(0, 0.1, 0);
  g.add(spine);

  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.05, 0.75), accentMat);
  tail.position.set(-0.92, 0.16, 0);
  g.add(tail);

  // Pilot clinging below wing frame
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.56, 6), accentMat);
  torso.position.set(0.05, -0.34, 0);
  torso.rotation.z = -0.55;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18, 0), getFlatMaterial(0xf4d5bd));
  head.position.set(0.32, -0.18, 0);
  g.add(head);

  setShadows(g, true, false);
  return g;
}

export function createSkyBirdGroup(): THREE.Group {
  const g = new THREE.Group();
  const bodyMat = getFlatMaterial(0xf8fafc, { roughness: 0.72 });
  const wingMat = getFlatMaterial(0xdbe6f0, { roughness: 0.74 });
  const beakMat = getFlatMaterial(0xf59e0b, { roughness: 0.5 });

  const body = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.62, 5), bodyMat);
  body.rotation.x = Math.PI / 2;
  g.add(body);

  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 4), beakMat);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0, 0.38);
  g.add(beak);

  const wingL = new THREE.Group();
  const wL = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.04, 0.24), wingMat);
  wL.position.set(-0.34, 0, 0);
  wingL.add(wL);
  g.add(wingL);
  g.userData.wingL = wingL;

  const wingR = new THREE.Group();
  const wR = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.04, 0.24), wingMat);
  wR.position.set(0.34, 0, 0);
  wingR.add(wR);
  g.add(wingR);
  g.userData.wingR = wingR;

  setShadows(g, false, false);
  return g;
}




