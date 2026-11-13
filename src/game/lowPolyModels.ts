import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ISLAND_DEFS } from './catalog';
import { groundHeightAtSim, toWorldX, toWorldZ } from './lowPolyWorld';
import { CULTURES } from './techAndCultures';
import type {
  ArrivalCandidate,
  BoatEntity,
  BuildingEntity,
  BuildingType,
  LivestockEntity,
  SeasonType,
  SkyBridgeEntity,
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
    [0.04, 0.44, 0.0, 0.0, 0.08, 0.2],
    [0.035, 0.36, 0.04, 0.02, -0.32, 0.25],
    [0.034, 0.38, -0.04, 0.02, 0.34, -0.18],
    [0.03, 0.31, 0.01, -0.04, -0.18, -0.36],
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
  const stem = new THREE.CylinderGeometry(0.014, 0.022, 0.32, 4);
  stem.translate(0, 0.16, 0);
  parts.push(stem);
  for (const side of [-1, 1]) {
    const leaf = new THREE.ConeGeometry(0.04, 0.17, 3);
    leaf.translate(0, 0.08, 0);
    leaf.rotateZ(side * 0.72);
    leaf.translate(side * 0.02, 0.04, 0);
    parts.push(leaf);
  }
  return mergeNormalizedParts(parts);
}

export function createFlowerBloomGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI * 2;
    const petal = new THREE.ConeGeometry(0.054, 0.115, 3);
    petal.rotateX(Math.PI * 0.42);
    petal.rotateY(ang);
    petal.translate(Math.sin(ang) * 0.056, 0.325, Math.cos(ang) * 0.056);
    parts.push(petal);
  }
  const bud = new THREE.IcosahedronGeometry(0.045, 0);
  bud.translate(0, 0.33, 0);
  parts.push(bud);
  return mergeNormalizedParts(parts);
}

export function createFernBushGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI * 2 + 0.22;
    const frond = new THREE.ConeGeometry(0.075, 0.46, 3);
    frond.translate(0, 0.23, 0);
    frond.rotateX(0.74);
    frond.rotateY(ang);
    parts.push(frond);
  }
  for (let i = 0; i < 3; i++) {
    const ang = (i / 3) * Math.PI * 2 + 0.65;
    const inner = new THREE.ConeGeometry(0.058, 0.36, 3);
    inner.translate(0, 0.18, 0);
    inner.rotateX(0.38);
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
  const cHex = new THREE.Color(color).getHexString();
  const eHex = opts.emissive !== undefined ? new THREE.Color(opts.emissive).getHexString() : '000000';
  const key = `${cHex}_${opts.roughness ?? 0.82}_${opts.metalness ?? 0.04}_${eHex}_${opts.emissiveIntensity ?? 0}_${opts.opacity ?? 1}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      flatShading: true,
      roughness: opts.roughness ?? 0.82,
      metalness: opts.metalness ?? 0.04,
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
  const trunkMat = getFlatMaterial(0x684531, { roughness: 0.92 });
  const barkDarkMat = getFlatMaterial(0x4d3323, { roughness: 0.94 });

  if (kind === 'pine' || kind === 'cedar') {
    const isCedar = kind === 'cedar';
    const roots = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.42, 0.48, 6), barkDarkMat);
    roots.position.y = 0.02;
    group.add(roots);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.23, isCedar ? 1.1 : 0.9, 6), trunkMat);
    trunk.position.y = isCedar ? 0.62 : 0.52;
    group.add(trunk);

    const leafDark = getFlatMaterial(snow ? 0x45635a : isCedar ? 0x2a5443 : 0x2f593c, { roughness: 0.86 });
    const leafLit = getFlatMaterial(snow ? 0x5c7d73 : isCedar ? 0x3b7157 : 0x3e714c, { roughness: 0.82 });
    const snowMat = getFlatMaterial(0xf0f6fa, { roughness: 0.7 });

    const tiers = [
      { r: isCedar ? 1.18 : 1.04, h: 1.15, y: 1.28, mat: leafDark },
      { r: isCedar ? 0.92 : 0.82, h: 1.05, y: 1.95, mat: leafLit },
      { r: 0.62, h: 0.92, y: 2.55, mat: leafDark },
      { r: 0.36, h: 0.72, y: 3.06, mat: leafLit },
    ];
    tiers.forEach((t, idx) => {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(t.r, t.h, 7), t.mat);
      cone.position.y = t.y;
      cone.rotation.y = idx * 0.45;
      group.add(cone);

      if (snow) {
        const cap = new THREE.Mesh(new THREE.ConeGeometry(t.r * 0.78, t.h * 0.52, 7), snowMat);
        cap.position.y = t.y + t.h * 0.28;
        cap.rotation.y = idx * 0.45;
        group.add(cap);
      }
    });
  } else {
    const roots = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.4, 0.44, 6), barkDarkMat);
    roots.position.y = 0.01;
    group.add(roots);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.25, 1.08, 6), trunkMat);
    trunk.position.y = 0.58;
    group.add(trunk);

    const branchA = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 0.66, 5), trunkMat);
    branchA.position.set(0.24, 1.02, 0.06);
    branchA.rotation.z = -0.62;
    group.add(branchA);

    let crownColor = 0x4c7e45;
    let accentColor = 0x6ca65b;
    let highlightColor = 0x82bb6a;
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

    const puffs: [number, number, number, number, THREE.MeshStandardMaterial][] = [
      [0, 1.66, 0, 0.88, crownMat],
      [-0.48, 1.48, 0.24, 0.6, accentMat],
      [0.48, 1.54, -0.2, 0.64, accentMat],
      [0.14, 2.06, 0.12, 0.54, hiMat],
    ];
    for (const [px, py, pz, pr, mat] of puffs) {
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(pr, 1), mat);
      mesh.position.set(px, py, pz);
      group.add(mesh);
    }

    if (kind === 'orchard' && season === 'autumn') {
      const appleMat = getFlatMaterial(0xd9413d, { roughness: 0.4 });
      for (const [ax, ay, az] of [
        [-0.46, 1.38, 0.5],
        [0.44, 1.45, 0.46],
        [0.08, 1.88, 0.54],
      ]) {
        const apple = new THREE.Mesh(new THREE.DodecahedronGeometry(0.11, 0), appleMat);
        apple.position.set(ax, ay, az);
        group.add(apple);
      }
    }
  }

  group.scale.setScalar(scale);
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
    const barkMat = getFlatMaterial(0x704a2d, { roughness: 0.9 });
    const lightMat = getFlatMaterial(0xa4754d, { roughness: 0.85 });
    for (let i = 0; i < 4; i++) {
      const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.95, 5), i % 2 === 0 ? barkMat : lightMat);
      branch.rotation.z = Math.PI / 2;
      branch.rotation.y = (i - 1.5) * 0.42;
      branch.position.set(0, 0.08 + (i > 1 ? 0.09 : 0), (i - 1.5) * 0.08);
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

export function createSpringPoolGroup(lit: boolean): THREE.Group {
  const g = new THREE.Group();
  const rockMat = getFlatMaterial(0x827a6f, { roughness: 0.92 });
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42 + (i % 3) * 0.1, 0), rockMat);
    rock.position.set(Math.cos(ang) * 1.95, 0.18, Math.sin(ang) * 1.32);
    rock.scale.set(1.15, 0.68, 1.0);
    g.add(rock);
  }
  const pool = new THREE.Mesh(
    new THREE.CylinderGeometry(1.85, 1.72, 0.16, 12),
    new THREE.MeshPhysicalMaterial({
      color: 0x6ec9d6,
      flatShading: true,
      roughness: 0.08,
      metalness: 0.12,
      clearcoat: 1.0,
      emissive: lit ? 0x3b8a96 : 0x255e66,
      emissiveIntensity: lit ? 0.35 : 0.14,
    }),
  );
  pool.scale.set(1, 1, 0.7);
  pool.position.y = 0.06;
  pool.userData.ownMaterial = true;
  g.add(pool);
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

  const plankMat = getFlatMaterial(bridge.tier === 2 ? 0xa59b8d : 0x9b6e46, { roughness: 0.88 });
  const trimMat = getFlatMaterial(bridge.tier === 2 ? 0xc8beb0 : 0x6e4a2f, { roughness: 0.84 });
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

export function createMemorialStoneGroup(): THREE.Group {
  const g = new THREE.Group();
  const stoneMat = getFlatMaterial(0x7c7b77, { roughness: 0.94 });
  const trimMat = getFlatMaterial(0x9e9b93, { roughness: 0.88 });
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
        group.add(tops);
      } else if (crop.cropType === 'wheat') {
        const h = 0.14 + stage * 0.16;
        const mat = stage >= 2 ? getFlatMaterial(stage === 3 ? 0xe5ad3a : 0xa5b449, { roughness: 0.76 }) : stalkMat;
        const sheaf = new THREE.Mesh(new THREE.ConeGeometry(0.14, h, 5), mat);
        sheaf.position.set(rx, 0.2 + h * 0.5, rz);
        group.add(sheaf);
      } else if (crop.cropType === 'flax') {
        const h = 0.15 + stage * 0.14;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, h, 4), stalkMat);
        stem.position.set(rx, 0.2 + h * 0.5, rz);
        group.add(stem);
        if (stage >= 2) {
          const bloom = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.11, 0),
            getFlatMaterial(0x5a96dc, { roughness: 0.55 }),
          );
          bloom.position.set(rx, 0.24 + h, rz);
          group.add(bloom);
        }
      } else if (crop.cropType === 'herbs') {
        const h = 0.12 + stage * 0.1;
        const bush = new THREE.Mesh(new THREE.DodecahedronGeometry(0.14 + stage * 0.03, 0), getFlatMaterial(0x4b9365));
        bush.position.set(rx, 0.22 + h * 0.3, rz);
        group.add(bush);
        if (stage >= 2) {
          const blossom = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.08, 0),
            getFlatMaterial(0xfef08a, { roughness: 0.5 }),
          );
          blossom.position.set(rx, 0.32 + h * 0.5, rz);
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
  const woodMat = getFlatMaterial(weathered ? 0x524237 : 0x6b472f, { roughness: 0.88 });
  const timberLightMat = getFlatMaterial(weathered ? 0x7c6858 : 0xa4754d, { roughness: 0.84 });
  const stoneMat = getFlatMaterial(weathered ? 0x6d6a64 : 0x888074, { roughness: 0.94 });
  const stoneLightMat = getFlatMaterial(weathered ? 0x8d887e : 0xb7ad9d, { roughness: 0.88 });
  const ironMat = getFlatMaterial(0x363a40, { roughness: 0.45, metalness: 0.72 });
  const brassMat = getFlatMaterial(weathered ? 0x8c7344 : 0xd8a13e, { roughness: 0.28, metalness: 0.82 });
  const bannerMat = getFlatMaterial(culture.bannerColor, { roughness: 0.65 });
  const roofMat = getFlatMaterial(snowRoof ? 0xeaf1f6 : culture.roofColor, { roughness: 0.7 });
  const emberMat = getFlatMaterial(abandoned ? 0x454341 : 0xfbbf24, {
    emissive: abandoned ? 0x000000 : 0xf97316,
    emissiveIntensity: abandoned ? 0 : 1.75,
    roughness: 0.25,
  });
  const lv = b.level;

  if (!b.unlocked) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.9, 5), woodMat);
    post.position.y = 0.45;
    group.add(post);
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.48, 0.12), getFlatMaterial(0xe8dbc3, { roughness: 0.78 }));
    board.position.y = 0.76;
    group.add(board);
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
  } else if (b.type === 'lean_to') {
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
  } else if (b.type === 'cottage') {
    const wScale = 1 + (lv >= 2 ? 0.12 : 0);
    const wallColor = culture.archStyle === 'crag_bastion' ? 0xb5aba0 : culture.archStyle === 'mariner_driftwood' ? 0xcfc4b0 : 0xf4e8d3;
    const wallMat = getFlatMaterial(wallColor, { roughness: 0.9 });

    if (stiltBoost > 0) {
      for (const [sx, sz] of [[-1.2, -0.85], [1.2, -0.85], [-1.2, 0.85], [1.2, 0.85]]) {
        const stilt = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, stiltBoost + 0.3, 5), woodMat);
        stilt.position.set(sx, stiltBoost * 0.5, sz);
        group.add(stilt);
      }
    }

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(3.05 * wScale, 0.52, 2.3), stoneMat);
    plinth.position.y = 0.04 + stiltBoost;
    group.add(plinth);
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.8 * wScale, 1.44, 2.08), wallMat);
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

    // Culture pennant banner
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.44, 0.05), bannerMat);
    flag.position.set(1.38 * wScale, 1.35 + stiltBoost, 1.08);
    group.add(flag);
  } else if (b.type === 'woodshop') {
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.22, 2.15), timberLightMat);
    base.position.y = 0.11;
    group.add(base);
    for (const [px, pz] of [[-1.12, -0.82], [1.12, -0.82], [-1.12, 0.82], [1.12, 0.82]]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.38, 5), woodMat);
      post.position.set(px, 0.8, pz);
      group.add(post);
    }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.05, 0.98, 4), roofMat);
    roof.position.y = 1.92;
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(1.18, 1, 0.92);
    group.add(roof);
    const plank = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.08, 0.28), getFlatMaterial(0xd6a674));
    plank.position.set(0.35, 0.62, 0.55);
    plank.rotation.y = 0.15;
    group.add(plank);
    for (let i = 0; i < Math.min(5, 2 + lv); i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.15, 6), timberLightMat);
      log.rotation.z = Math.PI / 2;
      log.position.set(-0.45 + (i % 2) * 0.2, 0.36 + Math.floor(i / 2) * 0.24, -0.2);
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
    // Hay bale + feeding trough
    const trough = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.24, 0.42), woodMat);
    trough.position.set(-1.1, 0.2, -0.82);
    group.add(trough);
    const hay = new THREE.Mesh(new THREE.DodecahedronGeometry(0.36, 0), getFlatMaterial(0xdcb448, { roughness: 0.85 }));
    hay.position.set(1.25, 0.32, -0.8);
    group.add(hay);
  } else if (b.type === 'bakery') {
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.22, 2.2), stoneMat);
    plinth.position.y = 0.11 + stiltBoost;
    group.add(plinth);
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.36, 2.02), getFlatMaterial(0xf1e5cf));
    body.position.y = 0.84 + stiltBoost;
    group.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.05, 1.15, 4), roofMat);
    roof.position.y = 2.02 + stiltBoost;
    roof.rotation.y = Math.PI / 4;
    group.add(roof);
    const oven = new THREE.Mesh(new THREE.IcosahedronGeometry(0.56, 0), getFlatMaterial(0x9a694e));
    oven.position.set(1.36, 0.5 + stiltBoost, 0.25);
    group.add(oven);
    const ember = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.32, 0.14), emberMat);
    ember.position.set(1.36, 0.34 + stiltBoost, 0.74);
    group.add(ember);
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.44, 0.1), winMat);
    win.position.set(-0.6, 0.94 + stiltBoost, 1.03);
    group.add(win);
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
    const banner = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.6, 0.06), bannerMat);
    banner.position.set(1.42, 1.45 + stiltBoost, 1.08);
    group.add(banner);
  } else if (b.type === 'smeltery') {
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.28, 2.2), stoneMat);
    base.position.y = 0.14;
    group.add(base);
    const furnace = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.96, 1.85, 6), stoneLightMat);
    furnace.position.set(-0.5, 1.12, -0.2);
    group.add(furnace);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.42, 0.25), emberMat);
    glow.position.set(-0.5, 0.58, 0.66);
    group.add(glow);
    const anvil = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.42, 0.34), ironMat);
    anvil.position.set(0.82, 0.46, 0.48);
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
      // Cantilevered sky-cliff crane jetty for high highland islands
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
    group.add(pennant);
    const bulb = new THREE.Mesh(new THREE.OctahedronGeometry(0.15, 0), winMat);
    bulb.position.set(2.15, 0.76, 0.62);
    group.add(bulb);
  } else if (b.type === 'watchtower') {
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.38, 0.56, 6), stoneMat);
    plinth.position.y = 0.08;
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
    group.add(flag);
  } else if (b.type === 'barracks') {
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.52, 2.4), stoneMat);
    plinth.position.y = 0.04;
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

export function createLowPolyVillager(v: VillagerEntity): THREE.Group {
  const g = new THREE.Group();
  const isChild = v.lifeStage === 'child';
  const isInfant = v.lifeStage === 'infant';
  const scale = isInfant ? 0.62 : isChild ? 0.8 : 1.0;

  if (isInfant) {
    const cradle = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.28, 0.42), getFlatMaterial(0x7c5438));
    cradle.position.y = 0.14;
    g.add(cradle);
    const swaddle = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), getFlatMaterial(v.cloakColor));
    swaddle.position.y = 0.34;
    g.add(swaddle);
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), getFlatMaterial(v.skinTone));
    head.position.set(0.12, 0.48, 0);
    g.add(head);
    setShadows(g, true, true);
    return g;
  }

  const culture = CULTURES[v.cultureId] ?? CULTURES.hearthfolk;
  // Gear tier 0: bare primitive hide/leaf wraps; 1: dyed cloth tunic; 2: wool winter cloak; 3: bronze/iron armor
  const tunicColor =
    v.gearTier === 0 ? 0x8f7455 : v.isStranger ? culture.bannerColor : v.cloakColor;
  const cloakMat = getFlatMaterial(tunicColor, {
    roughness: v.gearTier === 3 ? 0.45 : 0.82,
    metalness: v.gearTier === 3 ? 0.55 : 0.04,
  });
  const skinMat = getFlatMaterial(v.skinTone, { roughness: 0.74 });
  const hairMat = getFlatMaterial(v.hairColor, { roughness: 0.84 });
  const bootMat = getFlatMaterial(0x3e2d22, { roughness: 0.9 });
  const eyeMat = getFlatMaterial(0x1f242c, { roughness: 0.4 });
  const armorMat = getFlatMaterial(0x8ea0b2, { roughness: 0.35, metalness: 0.75 });
  const woolMat = getFlatMaterial(0xf0eadc, { roughness: 0.88 });

  const trouserMat = getFlatMaterial(v.gearTier === 0 ? 0x6b563e : 0x4f4438, { roughness: 0.88 });
  const bootL = new THREE.Group();
  bootL.position.set(-0.11, 0.28, 0);
  const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.052, 0.18, 5), trouserMat);
  legL.position.set(0, -0.09, 0);
  bootL.add(legL);
  const bootLMesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.22), bootMat);
  bootLMesh.position.set(0, -0.22, 0.03);
  bootL.add(bootLMesh);
  g.add(bootL);
  g.userData.bootL = bootL;

  const bootR = new THREE.Group();
  bootR.position.set(0.11, 0.28, 0);
  const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.052, 0.18, 5), trouserMat);
  legR.position.set(0, -0.09, 0);
  bootR.add(legR);
  const bootRMesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.22), bootMat);
  bootRMesh.position.set(0, -0.22, 0.03);
  bootR.add(bootRMesh);
  g.add(bootR);
  g.userData.bootR = bootR;

  const bodyWrap = new THREE.Group();
  const tunic = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.3, 0.58, 7), cloakMat);
  tunic.position.y = 0.51;
  bodyWrap.add(tunic);

  // Gear tier 2 wool shoulder mantle or tier 3 metal pauldrons
  if (v.gearTier >= 2) {
    const mantle = new THREE.Mesh(
      new THREE.TorusGeometry(0.22, 0.065, 4, 7),
      v.gearTier === 3 ? armorMat : woolMat,
    );
    mantle.rotation.x = Math.PI / 2;
    mantle.position.y = 0.77;
    bodyWrap.add(mantle);
  }
  if (v.gearTier >= 1) {
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.07, 7), getFlatMaterial(culture.bannerColor));
    belt.position.y = 0.44;
    bodyWrap.add(belt);
  }

  const armL = new THREE.Group();
  armL.position.set(-0.23, 0.74, 0);
  const armLMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.052, 0.38, 5), v.gearTier === 0 ? skinMat : cloakMat);
  armLMesh.position.set(0, -0.17, 0);
  armLMesh.rotation.z = -0.14;
  armL.add(armLMesh);
  const handL = new THREE.Mesh(new THREE.IcosahedronGeometry(0.052, 0), skinMat);
  handL.position.set(-0.04, -0.36, 0);
  armL.add(handL);
  bodyWrap.add(armL);
  g.userData.armL = armL;

  const armR = new THREE.Group();
  armR.position.set(0.23, 0.74, 0);
  const armRMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.052, 0.38, 5), v.gearTier === 0 ? skinMat : cloakMat);
  armRMesh.position.set(0, -0.17, 0);
  armRMesh.rotation.z = 0.14;
  armR.add(armRMesh);
  const handR = new THREE.Mesh(new THREE.IcosahedronGeometry(0.052, 0), skinMat);
  handR.position.set(0.04, -0.36, 0);
  armR.add(handR);
  bodyWrap.add(armR);
  g.userData.armR = armR;

  const headGroup = new THREE.Group();
  headGroup.position.y = 0.96;
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 1), skinMat);
  headGroup.add(head);
  for (const ex of [-0.08, 0.08]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.04), eyeMat);
    eye.position.set(ex, 0, 0.21);
    headGroup.add(eye);
  }
  const hair = new THREE.Mesh(new THREE.IcosahedronGeometry(0.25, 1), hairMat);
  hair.position.set(0, 0.07, -0.03);
  hair.scale.set(1.06, 0.82, 1.06);
  headGroup.add(hair);

  if (v.gearTier === 3) {
    const helm = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.24, 6), armorMat);
    helm.position.y = 0.22;
    headGroup.add(helm);
  }

  bodyWrap.add(headGroup);
  g.userData.headGroup = headGroup;

  // Chief sash & golden crown circlet
  const chiefBadge = new THREE.Group();
  const crown = new THREE.Mesh(
    new THREE.ConeGeometry(0.14, 0.2, 5),
    getFlatMaterial(0xfde047, { roughness: 0.22, metalness: 0.82, emissive: 0xd97706, emissiveIntensity: 0.35 }),
  );
  crown.position.y = 1.28;
  chiefBadge.add(crown);
  chiefBadge.visible = v.isChief;
  bodyWrap.add(chiefBadge);
  g.userData.chiefBadge = chiefBadge;

  // Visible Weapon Mesh based on v.weaponType
  if (v.weaponType !== 'none') {
    const weaponGroup = new THREE.Group();
    weaponGroup.position.set(0.3, 0.56, 0.16);
    if (v.weaponType === 'flint_spear') {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.25, 5), bootMat);
      shaft.position.y = 0.28;
      weaponGroup.add(shaft);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 4), getFlatMaterial(0x555d66));
      tip.position.y = 0.96;
      weaponGroup.add(tip);
    } else if (v.weaponType === 'bow') {
      const bowArc = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.028, 4, 8, Math.PI), bootMat);
      bowArc.rotation.z = -Math.PI / 2;
      bowArc.position.set(0.05, 0.25, 0);
      weaponGroup.add(bowArc);
    } else {
      const bladeColor = v.weaponType === 'bronze_blade' ? 0xd88c42 : 0xa5b4c4;
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.65, 0.12),
        getFlatMaterial(bladeColor, { metalness: 0.78, roughness: 0.28 }),
      );
      blade.position.y = 0.38;
      weaponGroup.add(blade);
    }
    bodyWrap.add(weaponGroup);
    g.userData.weaponGroup = weaponGroup;
  }

  // Construction hammer
  const hammerGroup = new THREE.Group();
  hammerGroup.position.set(-0.28, 0.64, 0.18);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.42, 5), bootMat);
  handle.position.y = 0.16;
  hammerGroup.add(handle);
  const headHammer = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.26), armorMat);
  headHammer.position.y = 0.36;
  hammerGroup.add(headHammer);
  hammerGroup.visible = false;
  bodyWrap.add(hammerGroup);
  g.userData.hammerGroup = hammerGroup;

  // Rain hat
  const rainHat = new THREE.Mesh(new THREE.ConeGeometry(0.44, 0.24, 6), getFlatMaterial(0xd99b52));
  rainHat.position.y = 1.24;
  rainHat.visible = false;
  bodyWrap.add(rainHat);
  g.userData.rainHat = rainHat;

  g.add(bodyWrap);
  g.userData.bodyWrap = bodyWrap;
  g.scale.setScalar(scale);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.56, 14),
    new THREE.MeshBasicMaterial({
      color: v.isStranger ? 0xef4444 : 0xf59e0b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: v.isStranger ? 0.85 : 0.92,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  ring.visible = Boolean(v.isStranger);
  ring.userData.ownMaterial = true;
  g.add(ring);
  g.userData.selectRing = ring;

  setShadows(g, true, true);
  return g;
}

export function createTravelerGateVisitor(candidate: ArrivalCandidate): THREE.Group {
  const g = new THREE.Group();
  const cloakMat = getFlatMaterial(candidate.cloakColor);
  const skinMat = getFlatMaterial(candidate.skinTone);
  const leatherMat = getFlatMaterial(0x4b3525);
  const tunic = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.32, 0.66, 7), cloakMat);
  tunic.position.y = 0.48;
  g.add(tunic);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.38, 0.2), leatherMat);
  pack.position.set(0, 0.56, -0.25);
  g.add(pack);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 1), skinMat);
  head.position.y = 0.96;
  g.add(head);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.44, 0.06, 8), leatherMat);
  brim.position.y = 1.15;
  g.add(brim);
  const hatTop = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.28, 7), leatherMat);
  hatTop.position.y = 1.3;
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
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 0), faceMat);
    head.position.set(0.28, 0.38, 0);
    bodyWrap.add(head);
    for (const [lx, lz] of [[-0.14, -0.1], [-0.14, 0.1], [0.14, -0.1], [0.14, 0.1]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.032, 0.22, 4), faceMat);
      leg.position.set(lx, 0.11, lz);
      bodyWrap.add(leg);
    }
  } else if (l.kind === 'pig') {
    const pigMat = getFlatMaterial(0xe3a89c, { roughness: 0.78 });
    const snoutMat = getFlatMaterial(0xc97b74, { roughness: 0.72 });
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 1), pigMat);
    body.scale.set(1.32, 0.88, 0.9);
    body.position.y = 0.26;
    bodyWrap.add(body);
    const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.12, 6), snoutMat);
    snout.rotation.z = -Math.PI / 2;
    snout.position.set(0.32, 0.25, 0);
    bodyWrap.add(snout);
    for (const [lx, lz] of [[-0.14, -0.1], [-0.14, 0.1], [0.14, -0.1], [0.14, 0.1]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.03, 0.16, 4), pigMat);
      leg.position.set(lx, 0.08, lz);
      bodyWrap.add(leg);
    }
  } else {
    // Fowl
    const featherMat = getFlatMaterial(0xd9a14c, { roughness: 0.8 });
    const beakMat = getFlatMaterial(0xf59e0b);
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 0), featherMat);
    body.scale.set(1.25, 0.92, 0.88);
    body.position.y = 0.18;
    bodyWrap.add(body);
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 0), featherMat);
    head.position.set(0.14, 0.28, 0);
    bodyWrap.add(head);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 4), beakMat);
    beak.rotation.z = -Math.PI / 2;
    beak.position.set(0.24, 0.27, 0);
    bodyWrap.add(beak);
  }

  g.add(bodyWrap);
  g.userData.bodyWrap = bodyWrap;
  setShadows(g, true, false);
  return g;
}

export function createWildHerdGroup(h: WildHerdEntity): THREE.Group {
  const g = new THREE.Group();
  const bodyWrap = new THREE.Group();
  const mat = getFlatMaterial(h.color, { roughness: 0.82 });

  if (h.kind === 'rabbit') {
    const torso = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), mat);
    torso.scale.set(1.3, 0.9, 0.88);
    torso.position.y = 0.16;
    bodyWrap.add(torso);
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 0), mat);
    head.position.set(0.14, 0.24, 0);
    bodyWrap.add(head);
    for (const ez of [-0.05, 0.05]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.22, 4), mat);
      ear.position.set(0.12, 0.38, ez);
      bodyWrap.add(ear);
    }
  } else if (h.kind === 'deer') {
    const legMat = getFlatMaterial(0x7c573c);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.32, 0.28), mat);
    body.position.y = 0.48;
    bodyWrap.add(body);
    for (const [lx, lz] of [[-0.22, -0.1], [-0.22, 0.1], [0.22, -0.1], [0.22, 0.1]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.42, 4), legMat);
      leg.position.set(lx, 0.21, lz);
      bodyWrap.add(leg);
    }
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.34, 5), mat);
    neck.position.set(0.32, 0.68, 0);
    neck.rotation.z = -0.32;
    bodyWrap.add(neck);
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 0), mat);
    head.position.set(0.42, 0.84, 0);
    bodyWrap.add(head);
    const antlerMat = getFlatMaterial(0xd5c09b);
    for (const az of [-0.09, 0.09]) {
      const antler = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.32, 4), antlerMat);
      antler.position.set(0.38, 1.05, az);
      antler.rotation.x = az > 0 ? 0.35 : -0.35;
      bodyWrap.add(antler);
    }
  } else {
    // Wild Boar with tusks
    const tuskMat = getFlatMaterial(0xf5efe2);
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 1), mat);
    body.scale.set(1.4, 0.92, 0.88);
    body.position.y = 0.34;
    bodyWrap.add(body);
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), mat);
    head.position.set(0.38, 0.32, 0);
    bodyWrap.add(head);
    for (const tz of [-0.1, 0.1]) {
      const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.18, 4), tuskMat);
      tusk.rotation.z = -0.7;
      tusk.position.set(0.52, 0.28, tz);
      bodyWrap.add(tusk);
    }
    for (const [lx, lz] of [[-0.2, -0.14], [-0.2, 0.14], [0.2, -0.14], [0.2, 0.14]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.22, 4), mat);
      leg.position.set(lx, 0.11, lz);
      bodyWrap.add(leg);
    }
  }

  g.add(bodyWrap);
  g.userData.bodyWrap = bodyWrap;
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
  const rockMat = getFlatMaterial(snow ? 0x86929c : 0x6f675d, { roughness: 0.94 });
  const rockDarkMat = getFlatMaterial(snow ? 0x69747e : 0x524c44, { roughness: 0.95 });
  const mossMat = getFlatMaterial(snow ? 0xd9e5ee : season === 'autumn' ? 0x9b8244 : 0x4f8449, { roughness: 0.88 });
  const woodMat = getFlatMaterial(0x7d5839, { roughness: 0.9 });

  if (lm.kind === 'cliff_boulder') {
    const main = new THREE.Mesh(new THREE.DodecahedronGeometry(0.95, 0), rockMat);
    main.scale.set(1.25, 0.82, 1.0);
    main.position.y = 0.42;
    g.add(main);
    const side = new THREE.Mesh(new THREE.DodecahedronGeometry(0.62, 0), rockDarkMat);
    side.position.set(0.68, 0.24, 0.35);
    g.add(side);
    const cap = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0), mossMat);
    cap.scale.set(1.2, 0.42, 0.95);
    cap.position.set(-0.08, 0.84, 0);
    g.add(cap);
  } else if (lm.kind === 'monolith') {
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.95, 0.34, 6), rockDarkMat);
    plinth.position.y = 0.05;
    g.add(plinth);
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.48, 2.25, 5), rockMat);
    pillar.position.y = 1.15;
    pillar.rotation.z = 0.05;
    g.add(pillar);
    const cap = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), mossMat);
    cap.position.set(0.05, 2.38, 0);
    g.add(cap);
  } else if (lm.kind === 'reed_clump') {
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
  }

  g.scale.setScalar(lm.scale);
  g.rotation.y = lm.rotY;
  setShadows(g, true, true);
  return g;
}

