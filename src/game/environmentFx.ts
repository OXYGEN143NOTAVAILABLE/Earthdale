import * as THREE from 'three';
import type {
  LivestockEntity,
  SeasonType,
  VillagerEntity,
  WeatherType,
  WildHerdEntity,
} from './types';

export interface CatStateLike {
  x: number;
  y: number;
}

export interface WindSample {
  time: number;
  dirX: number;
  dirZ: number;
  speed: number;
  gust: number;
  swayAmp: number;
  canopyTilt: number;
  bannerFlutter: number;
  waveSpeed: number;
  waveHeight: number;
  cloudShadowFactor: number;
}

export interface FoliageShaderUniforms {
  uWindTime: { value: number };
  uWindDir: { value: THREE.Vector2 };
  uWindStrength: { value: number };
  uCloudShadow: { value: number };
  uInteractors: { value: THREE.Vector4[] };
}

export interface WaterShaderUniforms {
  uWaveTime: { value: number };
  uWindDir: { value: THREE.Vector2 };
  uWaveAmp: { value: number };
  uNightFactor: { value: number };
  uFoamTint: { value: THREE.Color };
}

export const MAX_FOLIAGE_INTERACTORS = 16;

export function createInteractorArray(): THREE.Vector4[] {
  const arr: THREE.Vector4[] = [];
  for (let i = 0; i < MAX_FOLIAGE_INTERACTORS; i++) {
    arr.push(new THREE.Vector4(0, 0, 0.001, 0));
  }
  return arr;
}

export function computeWindState(
  animTimeSec: number,
  weather: WeatherType,
  season: SeasonType,
): WindSample {
  const angle = Math.sin(animTimeSec * 0.045) * 0.65 + (season === 'winter' ? 0.8 : 0.35);
  const dirX = Math.cos(angle);
  const dirZ = Math.sin(angle);

  let weatherMult = 1.0;
  if (weather === 'breeze') weatherMult = 1.62;
  else if (weather === 'rain') weatherMult = 1.88;
  else if (weather === 'snow') weatherMult = 1.24;
  else if (weather === 'mist') weatherMult = 0.52;

  let seasonMult = 1.0;
  if (season === 'autumn') seasonMult = 1.22;
  else if (season === 'winter') seasonMult = 1.15;
  else if (season === 'spring') seasonMult = 1.04;

  // Dual-harmonic travelling gust envelope
  const gustWave =
    0.5 +
    0.32 * Math.sin(animTimeSec * 0.72) +
    0.18 * Math.sin(animTimeSec * 1.95 + 1.3);
  const gust = Math.max(0.25, Math.min(1.85, (0.68 + gustWave * 0.68) * weatherMult * seasonMult));
  const speed = 0.95 * weatherMult * seasonMult;

  // Subtle passing cloud dapple factor (1 = full sun, <1 = cloud passing overhead)
  const cloudMod =
    weather === 'rain' || weather === 'mist'
      ? 0.78
      : 0.92 + 0.08 * Math.sin(animTimeSec * 0.31 + dirX * 0.5);

  return {
    time: animTimeSec,
    dirX,
    dirZ,
    speed,
    gust,
    swayAmp: 0.14 * gust,
    canopyTilt: 0.036 * gust,
    bannerFlutter: 0.22 * gust,
    waveSpeed: 1.35 + speed * 0.55,
    waveHeight: 0.055 * (0.7 + weatherMult * 0.42),
    cloudShadowFactor: cloudMod,
  };
}

export function computeWaveDisplacement(
  wx: number,
  wz: number,
  animTimeSec: number,
  wind: WindSample,
): { dy: number; foam: number } {
  const projA = wx * wind.dirX + wz * wind.dirZ;
  const projB = wx * -wind.dirZ + wz * wind.dirX;
  const t = animTimeSec * wind.waveSpeed;

  const swell1 = Math.sin(projA * 0.36 - t * 1.25) * 0.6;
  const swell2 = Math.cos(projB * 0.52 + t * 0.95 + wx * 0.08) * 0.28;
  const ripple = Math.sin((wx + wz) * 0.92 - t * 1.85) * 0.14;

  const combined = swell1 + swell2 + ripple;
  const dy = combined * wind.waveHeight;
  const foam = Math.max(0, Math.min(1, (combined - 0.35) * 0.95));
  return { dy, foam };
}

export interface ActorInteractorSample {
  x3: number;
  z3: number;
  radius: number;
  weight: number;
}

/**
 * Packs up to `maxSlots` closest actors (villagers, wild animals, livestock, island cat)
 * relative to `(focusX3, focusZ3)` into pre-allocated Vector4 uniforms `(x3, z3, radius, bendWeight)`.
 */
export function packActorFoliageInteractors(
  outSlots: THREE.Vector4[],
  villagers: readonly VillagerEntity[],
  livestock: readonly LivestockEntity[],
  wildHerds: readonly WildHerdEntity[],
  cat: CatStateLike | null,
  focusX3: number,
  focusZ3: number,
  toWorldXFn: (simX: number) => number,
  toWorldZFn: (simY: number) => number,
  movingSpeedMap?: ReadonlyMap<string, number>,
): number {
  const candidates: { distSq: number; x3: number; z3: number; radius: number; weight: number }[] = [];
  const maxDistSq = 78 * 78;

  for (let i = 0; i < villagers.length; i++) {
    const v = villagers[i];
    if (v.state === 'sailing' || v.state === 'gliding' || v.state === 'gondola') continue;
    const x3 = toWorldXFn(v.x);
    const z3 = toWorldZFn(v.y);
    const dx = x3 - focusX3;
    const dz = z3 - focusZ3;
    const distSq = dx * dx + dz * dz;
    if (distSq > maxDistSq) continue;
    const spd = movingSpeedMap?.get(v.id) ?? (v.state === 'walking' ? 1.2 : 0.25);
    const scale = v.lifeStage === 'infant' ? 0.65 : v.lifeStage === 'child' ? 0.85 : 1.08;
    const weight = Math.min(1.15, 0.52 + spd * 0.38);
    candidates.push({ distSq, x3, z3, radius: 1.45 * scale, weight });
  }

  for (let i = 0; i < wildHerds.length; i++) {
    const h = wildHerds[i];
    const x3 = toWorldXFn(h.x);
    const z3 = toWorldZFn(h.y);
    const dx = x3 - focusX3;
    const dz = z3 - focusZ3;
    const distSq = dx * dx + dz * dz;
    if (distSq > maxDistSq) continue;
    const r = h.kind === 'rabbit' ? 0.85 : h.kind === 'deer' ? 1.55 : 1.35;
    candidates.push({ distSq, x3, z3, radius: r, weight: 0.78 });
  }

  for (let i = 0; i < livestock.length; i++) {
    const l = livestock[i];
    const x3 = toWorldXFn(l.x);
    const z3 = toWorldZFn(l.y);
    const dx = x3 - focusX3;
    const dz = z3 - focusZ3;
    const distSq = dx * dx + dz * dz;
    if (distSq > maxDistSq) continue;
    const r = l.kind === 'fowl' ? 0.72 : 1.18;
    candidates.push({ distSq, x3, z3, radius: r, weight: 0.68 });
  }

  if (cat) {
    const x3 = toWorldXFn(cat.x);
    const z3 = toWorldZFn(cat.y);
    const dx = x3 - focusX3;
    const dz = z3 - focusZ3;
    const distSq = dx * dx + dz * dz;
    if (distSq <= maxDistSq) {
      candidates.push({ distSq, x3, z3, radius: 0.9, weight: 0.7 });
    }
  }

  candidates.sort((a, b) => a.distSq - b.distSq);
  const count = Math.min(outSlots.length, candidates.length);
  for (let i = 0; i < outSlots.length; i++) {
    if (i < count) {
      const c = candidates[i];
      outSlots[i].set(c.x3, c.z3, c.radius, c.weight);
    } else {
      outSlots[i].set(0, 0, 0.001, 0);
    }
  }
  return count;
}

/**
 * Computes sun directional light position anchored around the focused target `(tx, ty, tz)`
 * so shadows stay crisp across ALL 8 floating islands regardless of world coordinates.
 */
export function computeAnchoredSunPosition(
  targetX: number,
  targetY: number,
  targetZ: number,
  sunProgress: number,
): { x: number; y: number; z: number } {
  const sunAngle = (sunProgress - 0.5) * Math.PI * 0.76;
  return {
    x: targetX + Math.sin(sunAngle) * 74,
    y: targetY + 38 + Math.cos(sunAngle) * 34,
    z: targetZ + 36,
  };
}

/**
 * Enhances instanced foliage MeshStandardMaterials (grass, flowers, ferns) with:
 * 1) Directional wind gusts + organic micro-flutter
 * 2) Character & wildlife proximity parting / bending
 * 3) Subtle drifting cloud dapple light variation
 */
export function attachFoliageEnvironmentShader(
  mat: THREE.MeshStandardMaterial,
  uniforms: FoliageShaderUniforms,
  ampScale: number,
) {
  mat.customProgramCacheKey = () => `hearthglen_foliage_v2_${ampScale.toFixed(2)}`;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = uniforms.uWindTime;
    shader.uniforms.uWindDir = uniforms.uWindDir;
    shader.uniforms.uWindStrength = uniforms.uWindStrength;
    shader.uniforms.uCloudShadow = uniforms.uCloudShadow;
    shader.uniforms.uInteractors = uniforms.uInteractors;

    const header = `
      uniform float uWindTime;
      uniform vec2 uWindDir;
      uniform float uWindStrength;
      uniform vec4 uInteractors[${MAX_FOLIAGE_INTERACTORS}];
      varying float vCloudMask;
    `;

    shader.vertexShader = `${header}\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       float hFactor = max(0.0, position.y);
       vec3 instWorld = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
       float travel = dot(instWorld.xz, uWindDir) * 0.24 - uWindTime * 1.95;
       float gustWave = 0.65 + 0.35 * sin(travel * 0.55 + instWorld.z * 0.11);
       float swayPhase = uWindTime * 2.35 + instWorld.x * 0.72 + instWorld.z * 0.54;
       float bendAmp = ${ampScale.toFixed(3)} * uWindStrength * gustWave * hFactor;

       transformed.x += (uWindDir.x * (0.55 + 0.45 * sin(swayPhase)) + cos(swayPhase * 1.45) * 0.22) * bendAmp;
       transformed.z += (uWindDir.y * (0.55 + 0.45 * sin(swayPhase)) + sin(swayPhase * 1.35) * 0.22) * bendAmp;
       transformed.y -= abs(sin(swayPhase)) * 0.08 * bendAmp;

       // Character & wildlife proximity interaction: push foliage outward and press slightly down
       vec2 pushXZ = vec2(0.0);
       float pushDown = 0.0;
       for (int i = 0; i < ${MAX_FOLIAGE_INTERACTORS}; i++) {
         vec4 actor = uInteractors[i];
         if (actor.w > 0.01) {
           vec2 diff = instWorld.xz - actor.xy;
           float d = length(diff);
           if (d < actor.z && d > 0.001) {
             float falloff = (1.0 - d / actor.z);
             float strength = falloff * falloff * actor.w;
             pushXZ += normalize(diff) * strength * 0.52;
             pushDown = max(pushDown, strength * 0.24);
           }
         }
       }
       transformed.x += pushXZ.x * hFactor;
       transformed.z += pushXZ.y * hFactor;
       transformed.y = max(0.0, transformed.y - pushDown * hFactor);

       // Subtle travelling cloud dapple mask passed to fragment shader
       float cloudWave = sin(instWorld.x * 0.065 - uWindTime * 0.22) * cos(instWorld.z * 0.055 - uWindTime * 0.16);
       vCloudMask = smoothstep(-0.35, 0.75, cloudWave);`,
    );

    shader.fragmentShader = `
      uniform float uCloudShadow;
      varying float vCloudMask;
      ${shader.fragmentShader}
    `.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
       float dapple = mix(1.0 - 0.16 * uCloudShadow, 1.04, vCloudMask);
       diffuseColor.rgb *= dapple;`,
    );
  };
}

/**
 * Enhances the sky-sea MeshPhysicalMaterial with wave-crest foam highlights and subtle sun shimmer.
 */
export function attachSkySeaSurfaceShader(
  mat: THREE.MeshPhysicalMaterial,
  uniforms: WaterShaderUniforms,
) {
  mat.customProgramCacheKey = () => 'hearthglen_skysea_v1';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWaveTime = uniforms.uWaveTime;
    shader.uniforms.uWindDir = uniforms.uWindDir;
    shader.uniforms.uWaveAmp = uniforms.uWaveAmp;
    shader.uniforms.uNightFactor = uniforms.uNightFactor;
    shader.uniforms.uFoamTint = uniforms.uFoamTint;

    shader.vertexShader = `
      varying vec3 vSeaWorldPos;
      ${shader.vertexShader}
    `.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vSeaWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
    );

    shader.fragmentShader = `
      uniform float uWaveTime;
      uniform vec2 uWindDir;
      uniform float uWaveAmp;
      uniform float uNightFactor;
      uniform vec3 uFoamTint;
      varying vec3 vSeaWorldPos;
      ${shader.fragmentShader}
    `.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
       float crest = clamp((vSeaWorldPos.y / max(0.015, uWaveAmp)) * 0.55 + 0.3, 0.0, 1.0);
       float shimmer = 0.5 + 0.5 * sin(dot(vSeaWorldPos.xz, uWindDir) * 0.9 - uWaveTime * 2.2) * cos(vSeaWorldPos.x * 0.45 + vSeaWorldPos.z * 0.4);
       float foamFactor = smoothstep(0.66, 0.98, crest * 0.72 + shimmer * 0.32) * (1.0 - uNightFactor * 0.48);
       diffuseColor.rgb = mix(diffuseColor.rgb, uFoamTint, foamFactor * 0.34);`,
    );
  };
}
