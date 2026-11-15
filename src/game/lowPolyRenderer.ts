import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ISLAND_DEFS, ISLAND_ORDER, WORLD_HEIGHT, WORLD_SCALE, WORLD_WIDTH } from './catalog';
import {
  createAirGliderGroup,
  createBoatEntityGroup,
  createCatGroup,
  createExploreRuinGroup,
  createFernBushGeometry,
  createFlowerBloomGeometry,
  createFlowerStemGeometry,
  createGrassTuftGeometry,
  createLandmarkGroup,
  createLivestockGroup,
  createLowPolyBuilding,
  createLowPolyCloud,
  createLowPolyVillager,
  createMemorialStoneGroup,
  createSkyBirdGroup,
  createSkyBridgeGroup,
  createSkyCablewayGroup,
  createSpringPoolGroup,
  createSuggestionStakeGroup,
  createTravelerGateVisitor,
  createWildHerdGroup,
  createWildNodeGroup,
} from './lowPolyModels';
import {
  attachFoliageEnvironmentShader,
  attachSkySeaSurfaceShader,
  computeAnchoredSunPosition,
  computeWaveDisplacement,
  computeWindState,
  createInteractorArray,
  packActorFoliageInteractors,
  type FoliageShaderUniforms,
  type WaterShaderUniforms,
  type WindSample,
} from './environmentFx';
import {
  buildArchipelagoFoliageScatter,
  buildArchipelagoLandmarks,
  buildFloatingIslandGeometry,
  buildIslandRiversGeometry,
  buildSkySeaGeometry,
  buildWaterfallGeometry,
  groundHeightAtSim,
  toSimX,
  toSimY,
  toWorldX,
  toWorldZ,
} from './lowPolyWorld';
import type {
  CameraState,
  IslandId,
  Particle,
  RoomPlayerPresence,
  SeasonType,
  WeatherType,
  WorldState,
} from './types';

function dampAngle(current: number, target: number, alpha: number): number {
  let diff = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * alpha;
}

function detectSoftwareWebGL(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    let software = false;
    if (ext) {
      const name = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
      software = /SwiftShader|llvmpipe|Software|Mesa OffScreen/i.test(name);
    }
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return software;
  } catch {
    return true;
  }
}

function disposeGroupGeometries(obj: THREE.Object3D) {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry) {
      mesh.geometry.dispose();
    }
    if (mesh.isMesh && mesh.userData?.ownMaterial && mesh.material) {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => m.dispose());
      } else {
        mesh.material.dispose();
      }
    }
    const sprite = child as THREE.Sprite;
    if (sprite.isSprite && sprite.material) {
      sprite.material.dispose();
    }
  });
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
    grad.addColorStop(0, 'rgba(12, 16, 22, 0.44)');
    grad.addColorStop(0.55, 'rgba(12, 16, 22, 0.2)');
    grad.addColorStop(1, 'rgba(12, 16, 22, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createTerrainDetailTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#f2f3ee';
    ctx.fillRect(0, 0, size, size);
    // Deterministic seeded soft moss mottling + fine blade flecks wrapped seamlessly at edges
    let seed = 1337;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 240; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const r = 10 + rand() * 24;
      const shade = rand() > 0.45 ? 'rgba(255,255,250,0.08)' : 'rgba(182,192,168,0.11)';
      for (const ox of [-size, 0, size]) {
        for (const oy of [-size, 0, size]) {
          ctx.fillStyle = shade;
          ctx.beginPath();
          ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    for (let i = 0; i < 950; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const len = 3 + rand() * 5;
      const ang = (rand() - 0.5) * 0.7 - Math.PI * 0.5;
      ctx.strokeStyle = rand() > 0.5 ? 'rgba(255,255,244,0.14)' : 'rgba(170,184,154,0.14)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, Math.max(1, maxAnisotropy));
  return tex;
}

function createSunbeamTexture(): THREE.CanvasTexture {
  const w = 128;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      const v = y / (h - 1);
      // Brighter near top canopy gap, soft fade toward ground
      const vertFade = Math.sin(Math.min(1, Math.max(0, v)) * Math.PI) * (1 - v * 0.55);
      for (let x = 0; x < w; x++) {
        const u = (x / (w - 1)) * 2 - 1;
        const beamProfile = Math.exp(-u * u * 5.2);
        const alpha = Math.max(0, Math.min(255, Math.round(beamProfile * vertFade * 210)));
        const idx = (y * w + x) * 4;
        img.data[idx] = 255;
        img.data[idx + 1] = 236;
        img.data[idx + 2] = 178;
        img.data[idx + 3] = alpha;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface AtmosphereSample {
  zenithHex: number;
  horizonHex: number;
  sunHex: number;
  rimHex: number;
  hemiSkyHex: number;
  hemiGroundHex: number;
  sunIntensity: number;
  hemiIntensity: number;
  nightFactor: number;
  sunProgress: number;
}

const ATMO_KEYS: {
  t: number;
  zenith: number;
  horizon: number;
  sun: number;
  rim: number;
  hemiSky: number;
  hemiGround: number;
  night: number;
}[] = [
  { t: 0.0, zenith: 0x0e162b, horizon: 0x203254, sun: 0x7a96cf, rim: 0x3b588c, hemiSky: 0x2c426e, hemiGround: 0x1a262c, night: 1.0 },
  { t: 0.24, zenith: 0x6f8dbd, horizon: 0xf0be9c, sun: 0xffc688, rim: 0x8fb2d9, hemiSky: 0xf0be9c, hemiGround: 0x455832, night: 0.25 },
  { t: 0.48, zenith: 0x5ca4d6, horizon: 0xd9ecdf, sun: 0xffe9bf, rim: 0x9ed3cb, hemiSky: 0xcbe8d6, hemiGround: 0x314a22, night: 0.0 },
  { t: 0.68, zenith: 0x7692b8, horizon: 0xf2c58a, sun: 0xffc16e, rim: 0xa29cc4, hemiSky: 0xf4cfa0, hemiGround: 0x444c26, night: 0.08 },
  { t: 0.8, zenith: 0x2a3158, horizon: 0xc26e5a, sun: 0xe38e6c, rim: 0x5d6799, hemiSky: 0x6c6894, hemiGround: 0x2a3338, night: 0.72 },
  { t: 1.0, zenith: 0x0e162b, horizon: 0x203254, sun: 0x7a96cf, rim: 0x3b588c, hemiSky: 0x2c426e, hemiGround: 0x1a262c, night: 1.0 },
];

const _colA = new THREE.Color();
const _colB = new THREE.Color();

function sampleAtmosphere(timeOfDay: number, weather: WeatherType, season: SeasonType): AtmosphereSample {
  const t = ((timeOfDay % 1) + 1) % 1;
  let k0 = ATMO_KEYS[0];
  let k1 = ATMO_KEYS[ATMO_KEYS.length - 1];
  for (let i = 0; i < ATMO_KEYS.length - 1; i++) {
    if (t >= ATMO_KEYS[i].t && t <= ATMO_KEYS[i + 1].t) {
      k0 = ATMO_KEYS[i];
      k1 = ATMO_KEYS[i + 1];
      break;
    }
  }
  const u = (t - k0.t) / Math.max(0.0001, k1.t - k0.t);
  const mixHex = (a: number, b: number) => _colA.setHex(a).lerp(_colB.setHex(b), u).getHex();

  let zenithHex = mixHex(k0.zenith, k1.zenith);
  let horizonHex = mixHex(k0.horizon, k1.horizon);
  const sunHex = mixHex(k0.sun, k1.sun);
  const rimHex = mixHex(k0.rim, k1.rim);
  const hemiSkyHex = mixHex(k0.hemiSky, k1.hemiSky);
  const hemiGroundHex = mixHex(k0.hemiGround, k1.hemiGround);
  const nightFactor = k0.night + (k1.night - k0.night) * u;

  if (weather === 'rain' || weather === 'mist') {
    _colA.setHex(zenithHex).lerp(_colB.setHex(0x5d6c7a), 0.45);
    zenithHex = _colA.getHex();
    _colA.setHex(horizonHex).lerp(_colB.setHex(0x788796), 0.5);
    horizonHex = _colA.getHex();
  } else if (season === 'winter' || weather === 'snow') {
    _colA.setHex(horizonHex).lerp(_colB.setHex(0xc8d8e6), nightFactor < 0.5 ? 0.25 : 0.12);
    horizonHex = _colA.getHex();
  }

  const sunIntensity = (1 - nightFactor * 0.72) * (weather === 'rain' ? 0.72 : 1.0) * 1.48;
  const hemiIntensity = (1 - nightFactor * 0.5) * 0.68;
  const sunProgress = t >= 0.2 && t <= 0.82 ? (t - 0.2) / 0.62 : 0.5;

  return {
    zenithHex,
    horizonHex,
    sunHex,
    rimHex,
    hemiSkyHex,
    hemiGroundHex,
    sunIntensity,
    hemiIntensity,
    nightFactor,
    sunProgress,
  };
}

export type WorldHitResult =
  | { kind: 'villager'; id: string }
  | { kind: 'raider'; id: string }
  | { kind: 'building'; id: string }
  | { kind: 'animal'; animalKind: 'livestock' | 'wild' | 'cat'; id: string }
  | { kind: 'wild_node'; id: string }
  | { kind: 'island'; id: IslandId; simX: number; simY: number };

export class LowPolyDioramaRenderer {
  public readonly isSoftwareGl: boolean;
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private envRT: THREE.WebGLRenderTarget | null = null;

  private hemiLight: THREE.HemisphereLight;
  private sunLight: THREE.DirectionalLight;
  private rimLight: THREE.DirectionalLight;
  private bonfireLight: THREE.PointLight;
  private fog: THREE.FogExp2;

  private skyDome: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;

  private islandsGroup = new THREE.Group();
  private islandMeshes = new Map<IslandId, THREE.Mesh>();
  private terrainMat: THREE.MeshStandardMaterial;
  private islandsKey = '';

  private waterMesh: THREE.Mesh;
  private waterBaseY: Float32Array;
  private waterMat: THREE.MeshPhysicalMaterial;

  private waterfallsGroup = new THREE.Group();
  private fallMat: THREE.MeshStandardMaterial;
  private waterFallsKey = '';
  private springsGroup = new THREE.Group();
  private springsKey = '';

  private landmarksGroup = new THREE.Group();
  private landmarksKey = '';

  private bridgesGroup = new THREE.Group();
  private bridgesKey = '';

  private cablewaysGroup = new THREE.Group();
  private cablewayCache = new Map<string, { key: string; group: THREE.Group }>();

  private glidersGroup = new THREE.Group();
  private gliderCache = new Map<string, { key: string; group: THREE.Group }>();

  private exploreRuinsGroup = new THREE.Group();
  private exploreRuinCache = new Map<string, { key: string; group: THREE.Group }>();

  private projectileMesh: THREE.InstancedMesh;
  private readonly maxProjectiles = 64;

  private skyBirdsGroup = new THREE.Group();
  private skyBirdStates: { mesh: THREE.Group; centerX: number; centerZ: number; baseY: number; radius: number; angle: number; speed: number; phase: number }[] = [];

  private wildNodesGroup = new THREE.Group();
  private wildNodeCache = new Map<string, { key: string; group: THREE.Group }>();

  private suggestionsGroup = new THREE.Group();
  private suggestionCache = new Map<string, THREE.Group>();

  private memorialsGroup = new THREE.Group();
  private memorialCache = new Map<string, THREE.Group>();

  private buildingsGroup = new THREE.Group();
  private buildingCache = new Map<string, { key: string; group: THREE.Group }>();

  private villagersGroup = new THREE.Group();
  private villagerCache = new Map<
    string,
    {
      key: string;
      group: THREE.Group;
      lastBubbleText: string | null;
      prevX: number;
      prevY: number;
      yaw: number;
      walkPhase: number;
      walkWeight: number;
      gy: number;
    }
  >();

  private gateTravelersGroup = new THREE.Group();
  private gateTravelerCache = new Map<string, { group: THREE.Group; lastStatus: string }>();

  private livestockGroup = new THREE.Group();
  private livestockCache = new Map<
    string,
    { group: THREE.Group; prevX: number; prevY: number; yaw: number; phase: number; moveWeight: number; gy: number }
  >();

  private wildHerdsGroup = new THREE.Group();
  private wildHerdCache = new Map<
    string,
    { group: THREE.Group; prevX: number; prevY: number; yaw: number; phase: number; moveWeight: number; gy: number }
  >();

  private boatsGroup = new THREE.Group();
  private boatCache = new Map<string, { key: string; group: THREE.Group }>();

  private cloudsGroup = new THREE.Group();
  private cloudStates: { mesh: THREE.Group; wx: number; wz: number; y3: number; speed: number }[] = [];

  private grassMesh: THREE.InstancedMesh;
  private flowerStemMesh: THREE.InstancedMesh;
  private flowerBloomMesh: THREE.InstancedMesh;
  private fernMesh: THREE.InstancedMesh;
  private scatterKey = '';
  private foliageUniforms: FoliageShaderUniforms = {
    uWindTime: { value: 0 },
    uWindDir: { value: new THREE.Vector2(1, 0.3) },
    uWindStrength: { value: 1 },
    uCloudShadow: { value: 0.55 },
    uInteractors: { value: createInteractorArray() },
  };
  private waterUniforms: WaterShaderUniforms = {
    uWaveTime: { value: 0 },
    uWindDir: { value: new THREE.Vector2(1, 0.3) },
    uWaveAmp: { value: 0.06 },
    uNightFactor: { value: 0 },
    uFoamTint: { value: new THREE.Color(0xeef9ff) },
  };
  private actorSpeedMap = new Map<string, number>();

  private contactShadowTex: THREE.CanvasTexture;
  private contactShadowMat: THREE.MeshBasicMaterial;
  private terrainDetailTex: THREE.CanvasTexture;
  private sunbeamTex: THREE.CanvasTexture;
  private sunbeamMat: THREE.MeshBasicMaterial;
  private sunbeamsGroup = new THREE.Group();

  private peerMarkersGroup = new THREE.Group();
  private peerMarkerCache = new Map<string, THREE.Group>();

  private debugCollisionsGroup = new THREE.Group();
  private debugCollisionsEnabled = false;

  private catGroup: THREE.Group;
  private catState = {
    prevX: toWorldX(ISLAND_DEFS.cradle.centerX - 42),
    prevY: toWorldZ(ISLAND_DEFS.cradle.centerY + 34),
    yaw: Math.PI * 0.2,
    walkPhase: 0,
    walkWeight: 0,
    gy: 0.9,
  };
  private celestialOrb: THREE.Mesh;
  private starsPoints: THREE.Points;
  private starsMat: THREE.PointsMaterial;

  private particleMesh: THREE.InstancedMesh;
  private readonly maxParticles = 450;

  private thoughtTextures = new Map<string, THREE.CanvasTexture>();

  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();
  private readonly tmpVec = new THREE.Vector3();
  private readonly tmpTarget = new THREE.Vector3();
  private readonly tmpColor = new THREE.Color();
  private readonly tmpDummy = new THREE.Object3D();

  private lastW = 0;
  private lastH = 0;
  private disposed = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.isSoftwareGl = detectSoftwareWebGL();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.94;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xd4ebf5);
    this.fog = new THREE.FogExp2(0xd4ebf5, 0.0022);
    this.scene.fog = this.fog;

    try {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const roomEnv = new RoomEnvironment();
      this.envRT = pmrem.fromScene(roomEnv, 0.04);
      this.scene.environment = this.envRT.texture;
      this.scene.environmentIntensity = 0.16;
      roomEnv.dispose();
      pmrem.dispose();
    } catch {
      // Safe fallback
    }

    const w = container.clientWidth || 1280;
    const h = container.clientHeight || 720;
    this.camera = new THREE.PerspectiveCamera(36, w / Math.max(1, h), 0.25, 1650);

    // Sky gradient dome
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uZenith: { value: new THREE.Color(0x5fa7da) },
        uHorizon: { value: new THREE.Color(0xd4ebf5) },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 uZenith;
        uniform vec3 uHorizon;
        varying vec3 vWorldPos;
        void main() {
          float h = clamp(normalize(vWorldPos).y * 1.85, 0.0, 1.0);
          vec3 col = mix(uHorizon, uZenith, pow(h, 0.65));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.skyDome = new THREE.Mesh(new THREE.SphereGeometry(960, 16, 12), this.skyMat);
    this.scene.add(this.skyDome);

    if (!this.isSoftwareGl) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.12, 0.35, 0.98);
      this.composer.addPass(this.bloomPass);
      this.composer.addPass(new OutputPass());
    }

    this.resize(w, h);

    this.hemiLight = new THREE.HemisphereLight(0xbde4f4, 0x627c4d, 0.68);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff5dc, 1.48);
    this.sunLight.position.set(40, 62, 32);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.left = -118;
    this.sunLight.shadow.camera.right = 118;
    this.sunLight.shadow.camera.top = 92;
    this.sunLight.shadow.camera.bottom = -92;
    this.sunLight.shadow.camera.near = 6;
    this.sunLight.shadow.camera.far = 260;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.rimLight = new THREE.DirectionalLight(0x9fd0ea, 0.28);
    this.rimLight.position.set(-48, 24, -44);
    this.scene.add(this.rimLight);

    this.bonfireLight = new THREE.PointLight(0xff9c42, 0, 26, 1.5);
    this.bonfireLight.position.set(toWorldX(ISLAND_DEFS.cradle.centerX), 2.5, toWorldZ(ISLAND_DEFS.cradle.centerY));
    this.scene.add(this.bonfireLight);

    this.terrainDetailTex = createTerrainDetailTexture(this.renderer.capabilities.getMaxAnisotropy());
    this.terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: this.terrainDetailTex,
      flatShading: false,
      roughness: 0.98,
      metalness: 0.0,
      envMapIntensity: 0.08,
    });

    // Vast Sky-Sea Water Plane (soft satin turquoise, free of mirror glare)
    const waterGeom = buildSkySeaGeometry();
    const wPos = waterGeom.attributes.position as THREE.BufferAttribute;
    this.waterBaseY = new Float32Array(wPos.count);
    for (let i = 0; i < wPos.count; i++) {
      this.waterBaseY[i] = wPos.getY(i);
    }
    this.waterMat = new THREE.MeshPhysicalMaterial({
      color: 0x3b96ba,
      flatShading: true,
      roughness: 0.44,
      metalness: 0.03,
      clearcoat: 0.1,
      clearcoatRoughness: 0.55,
      reflectivity: 0.22,
      envMapIntensity: 0.2,
      transparent: true,
      opacity: 0.92,
    });
    attachSkySeaSurfaceShader(this.waterMat, this.waterUniforms);
    this.waterMesh = new THREE.Mesh(waterGeom, this.waterMat);
    this.waterMesh.receiveShadow = true;
    this.scene.add(this.waterMesh);

    // Waterfalls, carved island rivers & inland ponds (vertex-colored for estuary foam, rebuilt per worldSeed)
    this.fallMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      flatShading: true,
      roughness: 0.48,
      metalness: 0.02,
      envMapIntensity: 0.14,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
    });
    this.scene.add(this.waterfallsGroup);

    this.contactShadowTex = createContactShadowTexture();
    this.contactShadowMat = new THREE.MeshBasicMaterial({
      map: this.contactShadowTex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    this.scene.add(this.islandsGroup);
    this.scene.add(this.springsGroup);
    this.scene.add(this.landmarksGroup);
    this.scene.add(this.exploreRuinsGroup);
    this.scene.add(this.bridgesGroup);
    this.scene.add(this.cablewaysGroup);
    this.scene.add(this.wildNodesGroup);
    this.scene.add(this.suggestionsGroup);
    this.scene.add(this.memorialsGroup);
    this.scene.add(this.buildingsGroup);
    this.scene.add(this.villagersGroup);
    this.scene.add(this.glidersGroup);
    this.scene.add(this.gateTravelersGroup);
    this.scene.add(this.livestockGroup);
    this.scene.add(this.wildHerdsGroup);
    this.scene.add(this.boatsGroup);
    this.scene.add(this.cloudsGroup);
    this.scene.add(this.skyBirdsGroup);
    this.scene.add(this.peerMarkersGroup);
    this.scene.add(this.debugCollisionsGroup);

    this.sunbeamTex = createSunbeamTexture();
    this.sunbeamMat = new THREE.MeshBasicMaterial({
      map: this.sunbeamTex,
      color: 0xffe6a3,
      transparent: true,
      opacity: 0.14,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    const beamOffsets: [number, number, number, number, number][] = [
      [14, 15, -10, 15, 38],
      [21, 16, -4, 18, 42],
      [9, 14, 4, 13, 34],
      [18, 17, 10, 16, 40],
      [4, 15, -14, 14, 36],
    ];
    for (let i = 0; i < beamOffsets.length; i++) {
      const [bx, by, bz, bw, bh] = beamOffsets[i];
      const beam = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), this.sunbeamMat);
      beam.position.set(bx, by, bz);
      beam.rotation.z = 0.42;
      beam.rotation.y = -0.35 + i * 0.22;
      beam.renderOrder = 4;
      this.sunbeamsGroup.add(beam);
    }
    this.scene.add(this.sunbeamsGroup);

    // Instanced Archipelago Foliage with GPU Wind Sway, Actor Parting & Cloud Dapple (pre-allocated capacity for any worldSeed)
    const grassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: false, roughness: 0.95, envMapIntensity: 0.1 });
    attachFoliageEnvironmentShader(grassMat, this.foliageUniforms, 0.17);
    this.grassMesh = new THREE.InstancedMesh(createGrassTuftGeometry(), grassMat, 10000);
    this.grassMesh.count = 0;
    this.grassMesh.receiveShadow = true;
    this.scene.add(this.grassMesh);

    const flowerStemMat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: false, roughness: 0.94, envMapIntensity: 0.1 });
    attachFoliageEnvironmentShader(flowerStemMat, this.foliageUniforms, 0.13);
    this.flowerStemMesh = new THREE.InstancedMesh(createFlowerStemGeometry(), flowerStemMat, 2600);
    this.flowerStemMesh.count = 0;
    this.scene.add(this.flowerStemMesh);

    const flowerBloomMat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: false, roughness: 0.88, envMapIntensity: 0.14 });
    attachFoliageEnvironmentShader(flowerBloomMat, this.foliageUniforms, 0.13);
    this.flowerBloomMesh = new THREE.InstancedMesh(createFlowerBloomGeometry(), flowerBloomMat, 2600);
    this.flowerBloomMesh.count = 0;
    this.scene.add(this.flowerBloomMesh);

    const fernMat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: false, roughness: 0.94, envMapIntensity: 0.1 });
    attachFoliageEnvironmentShader(fernMat, this.foliageUniforms, 0.12);
    this.fernMesh = new THREE.InstancedMesh(createFernBushGeometry(), fernMat, 2600);
    this.fernMesh.count = 0;
    this.fernMesh.receiveShadow = true;
    this.scene.add(this.fernMesh);

    this.catGroup = createCatGroup();
    this.scene.add(this.catGroup);

    this.celestialOrb = new THREE.Mesh(
      new THREE.IcosahedronGeometry(3.4, 1),
      new THREE.MeshBasicMaterial({ color: 0xfff3c4, fog: false }),
    );
    this.scene.add(this.celestialOrb);

    const starCount = 200;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPositions[i * 3] = ((i * 53) % 240) - 120;
      starPositions[i * 3 + 1] = 28 + ((i * 19) % 34);
      starPositions[i * 3 + 2] = -60 - ((i * 17) % 60);
    }
    const starGeom = new THREE.BufferGeometry();
    starGeom.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    this.starsMat = new THREE.PointsMaterial({
      color: 0xfef9e7,
      size: 0.55,
      transparent: true,
      opacity: 0,
      fog: false,
    });
    this.starsPoints = new THREE.Points(starGeom, this.starsMat);
    this.scene.add(this.starsPoints);

    for (let i = 0; i < 28; i++) {
      const cloud = createLowPolyCloud(1.8 + (i % 3) * 0.75);
      const wx = -420 + i * 31;
      const wz = -220 + (i % 7) * 66;
      const y3 = 23.5 + (i % 4) * 4.2;
      cloud.position.set(wx, y3, wz);
      this.cloudsGroup.add(cloud);
      this.cloudStates.push({ mesh: cloud, wx, wz, y3, speed: 0.65 + (i % 3) * 0.25 });
    }

    // Soaring sky-bird flock circling above islands
    for (let i = 0; i < 14; i++) {
      const isl = ISLAND_DEFS[ISLAND_ORDER[i % ISLAND_ORDER.length]];
      const bird = createSkyBirdGroup();
      const angle = (i * 1.45) % (Math.PI * 2);
      const radius = 14 + (i % 3) * 7.5;
      const baseY = isl.elevationY + 9.5 + (i % 4) * 1.8;
      this.skyBirdsGroup.add(bird);
      this.skyBirdStates.push({
        mesh: bird,
        centerX: toWorldX(isl.centerX),
        centerZ: toWorldZ(isl.centerY),
        baseY,
        radius,
        angle,
        speed: (i % 2 === 0 ? 1 : -1) * (0.28 + (i % 3) * 0.08),
        phase: i * 0.9,
      });
    }

    const projGeom = new THREE.ConeGeometry(0.11, 0.72, 4);
    projGeom.rotateX(Math.PI / 2);
    const projMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.projectileMesh = new THREE.InstancedMesh(projGeom, projMat, this.maxProjectiles);
    this.projectileMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.projectileMesh.frustumCulled = false;
    this.projectileMesh.count = 0;
    this.scene.add(this.projectileMesh);

    const partGeom = new THREE.OctahedronGeometry(0.15, 0);
    const partMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.particleMesh = new THREE.InstancedMesh(partGeom, partMat, this.maxParticles);
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleMesh.frustumCulled = false;
    this.particleMesh.count = 0;
    this.scene.add(this.particleMesh);
  }

  public resize(width: number, height: number) {
    if (this.disposed || width <= 0 || height <= 0) return;
    if (width === this.lastW && height === this.lastH) return;
    this.lastW = width;
    this.lastH = height;
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    if (this.composer) this.composer.setSize(width, height);
    if (this.bloomPass) this.bloomPass.resolution.set(width, height);
  }

  public getCameraBounds(viewW: number, viewH: number, camera: CameraState) {
    const aspect = viewW / Math.max(1, viewH);
    const clampedZoom = Math.max(0.06, Math.min(3.2, camera.zoom));
    const baseVh = 540 / clampedZoom;
    const vh = Math.max(120, Math.min(WORLD_HEIGHT, Math.round(baseVh)));
    const vw = Math.max(180, Math.min(WORLD_WIDTH, Math.round(vh * aspect)));
    const pxScale = viewW / Math.max(1, vw);

    const halfW = vw * 0.5;
    const halfH = vh * 0.5;
    const cx = Math.max(halfW, Math.min(WORLD_WIDTH - halfW, camera.x));
    const cy = Math.max(halfH, Math.min(WORLD_HEIGHT - halfH, camera.y));

    const sx = Math.max(0, Math.min(WORLD_WIDTH - vw, Math.round(cx - halfW)));
    const sy = Math.max(0, Math.min(WORLD_HEIGHT - vh, Math.round(cy - halfH)));

    return { vw, vh, sx, sy, pxScale };
  }

  private ensureWaterAndFalls(worldSeed: number, season: SeasonType) {
    const key = `${worldSeed}_${season}`;
    if (this.waterFallsKey === key) return;
    this.waterFallsKey = key;

    while (this.waterfallsGroup.children.length > 0) {
      const child = this.waterfallsGroup.children[0];
      this.waterfallsGroup.remove(child);
      disposeGroupGeometries(child);
    }

    for (const id of ISLAND_ORDER) {
      const def = ISLAND_DEFS[id];
      if (def.hasWaterfall) {
        const wf = new THREE.Mesh(buildWaterfallGeometry(def), this.fallMat);
        this.waterfallsGroup.add(wf);
      }
      const riverGeo = buildIslandRiversGeometry(def);
      if (riverGeo) {
        const riverMesh = new THREE.Mesh(riverGeo, this.fallMat);
        riverMesh.receiveShadow = true;
        this.waterfallsGroup.add(riverMesh);
      }
    }

    for (let i = 0; i < this.skyBirdStates.length; i++) {
      const isl = ISLAND_DEFS[ISLAND_ORDER[i % ISLAND_ORDER.length]];
      this.skyBirdStates[i].centerX = toWorldX(isl.centerX);
      this.skyBirdStates[i].centerZ = toWorldZ(isl.centerY);
      this.skyBirdStates[i].baseY = isl.elevationY + 9.5 + (i % 4) * 1.8;
    }
  }

  private ensureIslands(worldSeed: number, season: SeasonType, weather: WeatherType) {
    const key = `${worldSeed}_${season}_${weather}`;
    if (this.islandsKey === key && this.islandMeshes.size === ISLAND_ORDER.length) return;
    this.islandsKey = key;

    while (this.islandsGroup.children.length > 0) {
      const child = this.islandsGroup.children[0];
      this.islandsGroup.remove(child);
      disposeGroupGeometries(child);
    }
    this.islandMeshes.clear();

    for (const id of ISLAND_ORDER) {
      const def = ISLAND_DEFS[id];
      const geom = buildFloatingIslandGeometry(def, season, weather);
      const mesh = new THREE.Mesh(geom, this.terrainMat);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      mesh.userData.islandId = id;
      this.islandsGroup.add(mesh);
      this.islandMeshes.set(id, mesh);
    }
  }

  private ensureSprings(worldSeed: number, lit: boolean) {
    const key = `${worldSeed}_${lit}`;
    if (this.springsKey === key) return;
    this.springsKey = key;

    while (this.springsGroup.children.length > 0) {
      const child = this.springsGroup.children[0];
      this.springsGroup.remove(child);
      disposeGroupGeometries(child);
    }

    for (const id of ISLAND_ORDER) {
      const def = ISLAND_DEFS[id];
      if (!def.hasSpring || !def.springOffset) continue;
      const sx = def.centerX + def.springOffset.dx;
      const sy = def.centerY + def.springOffset.dy;
      const spring = createSpringPoolGroup(lit);
      spring.position.set(toWorldX(sx), groundHeightAtSim(sx, sy) - 0.06, toWorldZ(sy));
      this.springsGroup.add(spring);
    }
  }

  private ensureLandmarks(worldSeed: number, season: SeasonType, weather: WeatherType) {
    const key = `${worldSeed}_${season}_${weather}`;
    if (this.landmarksKey === key) return;
    this.landmarksKey = key;

    while (this.landmarksGroup.children.length > 0) {
      const child = this.landmarksGroup.children[0];
      this.landmarksGroup.remove(child);
      disposeGroupGeometries(child);
    }

    const landmarks = buildArchipelagoLandmarks();
    for (const lm of landmarks) {
      const grp = createLandmarkGroup(lm, season, weather);
      const y3 = lm.islandId === 'sea' ? 0 : groundHeightAtSim(lm.x, lm.y) - 0.05;
      grp.position.set(toWorldX(lm.x), y3, toWorldZ(lm.y));
      this.landmarksGroup.add(grp);
    }
  }

  private ensureScatter(worldSeed: number, season: SeasonType, weather: WeatherType) {
    const key = `${worldSeed}_${season}_${weather}`;
    if (this.scatterKey === key) return;
    this.scatterKey = key;

    const scatter = buildArchipelagoFoliageScatter();
    const snow = weather === 'snow' || season === 'winter';
    const isAutumn = season === 'autumn' && !snow;

    const grassPalette = snow
      ? [0xcad6e0, 0xdce6ee, 0xb2c2cf, 0xc3d1dc, 0xa8b8c7]
      : isAutumn
        ? [0xb59c48, 0xc98b3c, 0x8e994b, 0x9b823c, 0x6f7432]
        : [0x76a12c, 0x92bc3a, 0x456f25, 0x628c2b, 0x365b21];
    const flowerPalette = snow
      ? [0xeef4f8, 0xcde0ec, 0xf8fafc, 0xdce8f0]
      : season === 'spring'
        ? [0xfef08a, 0xf8fafc, 0xf9b4c4, 0xfde047]
        : isAutumn
          ? [0xf59e0b, 0xd97706, 0xfbbf24, 0xfef08a]
          : [0xfde047, 0xf8fafc, 0xfef08a, 0xfacc15];
    const fernPalette = snow
      ? [0x9eb3b8, 0xb8cad0, 0x8ea4a9]
      : isAutumn
        ? [0x94803e, 0xa87639, 0x766432]
        : [0x335d22, 0x457329, 0x2a4e1d];
    const stemPalette = snow ? [0x8ea3a6, 0xa3b7ba] : [0x467427, 0x5c8b30];

    const grassCount = Math.min(scatter.grassTufts.length, this.grassMesh.instanceMatrix.count);
    for (let idx = 0; idx < grassCount; idx++) {
      const pt = scatter.grassTufts[idx];
      this.tmpDummy.position.set(pt.x3, pt.y3, pt.z3);
      this.tmpDummy.rotation.set(0, pt.rotY, 0);
      this.tmpDummy.scale.setScalar(pt.scale);
      this.tmpDummy.updateMatrix();
      this.grassMesh.setMatrixAt(idx, this.tmpDummy.matrix);
      this.tmpColor.setHex(grassPalette[pt.colorIndex % grassPalette.length]);
      this.grassMesh.setColorAt(idx, this.tmpColor);
    }
    this.grassMesh.count = grassCount;
    this.grassMesh.instanceMatrix.needsUpdate = true;
    if (this.grassMesh.instanceColor) this.grassMesh.instanceColor.needsUpdate = true;
    this.grassMesh.computeBoundingSphere();

    const flowerCount = Math.min(scatter.wildflowers.length, this.flowerStemMesh.instanceMatrix.count);
    for (let idx = 0; idx < flowerCount; idx++) {
      const pt = scatter.wildflowers[idx];
      this.tmpDummy.position.set(pt.x3, pt.y3, pt.z3);
      this.tmpDummy.rotation.set(0, pt.rotY, 0);
      this.tmpDummy.scale.setScalar(pt.scale);
      this.tmpDummy.updateMatrix();
      this.flowerStemMesh.setMatrixAt(idx, this.tmpDummy.matrix);
      this.tmpColor.setHex(stemPalette[idx % stemPalette.length]);
      this.flowerStemMesh.setColorAt(idx, this.tmpColor);

      this.flowerBloomMesh.setMatrixAt(idx, this.tmpDummy.matrix);
      this.tmpColor.setHex(flowerPalette[pt.colorIndex % flowerPalette.length]);
      this.flowerBloomMesh.setColorAt(idx, this.tmpColor);
    }
    this.flowerStemMesh.count = flowerCount;
    this.flowerStemMesh.instanceMatrix.needsUpdate = true;
    if (this.flowerStemMesh.instanceColor) this.flowerStemMesh.instanceColor.needsUpdate = true;
    this.flowerStemMesh.computeBoundingSphere();

    this.flowerBloomMesh.count = flowerCount;
    this.flowerBloomMesh.instanceMatrix.needsUpdate = true;
    if (this.flowerBloomMesh.instanceColor) this.flowerBloomMesh.instanceColor.needsUpdate = true;
    this.flowerBloomMesh.computeBoundingSphere();

    const fernCount = Math.min(scatter.ferns.length, this.fernMesh.instanceMatrix.count);
    for (let idx = 0; idx < fernCount; idx++) {
      const pt = scatter.ferns[idx];
      this.tmpDummy.position.set(pt.x3, pt.y3, pt.z3);
      this.tmpDummy.rotation.set(0, pt.rotY, 0);
      this.tmpDummy.scale.setScalar(pt.scale * 1.12);
      this.tmpDummy.updateMatrix();
      this.fernMesh.setMatrixAt(idx, this.tmpDummy.matrix);
      this.tmpColor.setHex(fernPalette[pt.colorIndex % fernPalette.length]);
      this.fernMesh.setColorAt(idx, this.tmpColor);
    }
    this.fernMesh.count = fernCount;
    this.fernMesh.instanceMatrix.needsUpdate = true;
    if (this.fernMesh.instanceColor) this.fernMesh.instanceColor.needsUpdate = true;
    this.fernMesh.computeBoundingSphere();
  }

  private syncBridges(world: WorldState, lit: boolean) {
    const key = `${lit}_${world.bridges.map((b) => `${b.built ? 1 : 0}:${Math.round(b.progress * 20)}`).join('|')}`;
    if (this.bridgesKey === key) return;
    this.bridgesKey = key;

    while (this.bridgesGroup.children.length > 0) {
      const child = this.bridgesGroup.children[0];
      this.bridgesGroup.remove(child);
      disposeGroupGeometries(child);
    }
    for (const br of world.bridges) {
      this.bridgesGroup.add(createSkyBridgeGroup(br, lit));
    }
  }

  private syncCableways(world: WorldState, lit: boolean) {
    const activeIds = new Set<string>();
    for (const cable of world.cableways) {
      activeIds.add(cable.id);
      const key = `${cable.built ? 1 : 0}_${lit}`;
      let entry = this.cablewayCache.get(cable.id);
      if (!entry || entry.key !== key) {
        if (entry) {
          this.cablewaysGroup.remove(entry.group);
          disposeGroupGeometries(entry.group);
        }
        const group = createSkyCablewayGroup(cable, lit);
        this.cablewaysGroup.add(group);
        entry = { key, group };
        this.cablewayCache.set(cable.id, entry);
      }
      const gondola = entry.group.userData.gondola as THREE.Object3D | undefined;
      const pA = entry.group.userData.pA as [number, number, number] | undefined;
      const pB = entry.group.userData.pB as [number, number, number] | undefined;
      if (gondola && pA && pB) {
        const t = Math.max(0.03, Math.min(0.97, cable.gondolaT));
        gondola.position.set(
          pA[0] + (pB[0] - pA[0]) * t,
          pA[1] + (pB[1] - pA[1]) * t - Math.sin(t * Math.PI) * 0.45,
          pA[2] + (pB[2] - pA[2]) * t,
        );
      }
    }
    for (const [id, entry] of this.cablewayCache.entries()) {
      if (!activeIds.has(id)) {
        this.cablewaysGroup.remove(entry.group);
        disposeGroupGeometries(entry.group);
        this.cablewayCache.delete(id);
      }
    }
  }

  private syncExploreRuins(world: WorldState, nightFactor: number, animTimeSec: number) {
    const activeIds = new Set<string>();
    for (const ruin of world.exploreRuins) {
      activeIds.add(ruin.id);
      const ready = ruin.cooldownTimer <= 0.1;
      const lit = nightFactor > 0.25;
      const key = `${ruin.kind}_${ready}_${lit}`;
      let entry = this.exploreRuinCache.get(ruin.id);
      if (!entry || entry.key !== key) {
        if (entry) {
          this.exploreRuinsGroup.remove(entry.group);
          disposeGroupGeometries(entry.group);
        }
        const group = createExploreRuinGroup(ruin, nightFactor);
        group.position.set(toWorldX(ruin.x), groundHeightAtSim(ruin.x, ruin.y), toWorldZ(ruin.y));
        this.exploreRuinsGroup.add(group);
        entry = { key, group };
        this.exploreRuinCache.set(ruin.id, entry);
      }
      const crystal = entry.group.userData.hoverCrystal as THREE.Object3D | undefined;
      if (crystal) {
        crystal.rotation.y = animTimeSec * (ready ? 1.4 : 0.35);
        crystal.position.y = 1.68 + Math.sin(animTimeSec * 2.3 + ruin.x * 0.02) * (ready ? 0.16 : 0.03);
      }
    }
    for (const [id, entry] of this.exploreRuinCache.entries()) {
      if (!activeIds.has(id)) {
        this.exploreRuinsGroup.remove(entry.group);
        disposeGroupGeometries(entry.group);
        this.exploreRuinCache.delete(id);
      }
    }
  }

  private syncGliders(world: WorldState, animTimeSec: number) {
    const activeIds = new Set<string>();
    for (const gl of world.gliders) {
      activeIds.add(gl.id);
      const key = `${gl.wingColor}`;
      let entry = this.gliderCache.get(gl.id);
      if (!entry || entry.key !== key) {
        if (entry) {
          this.glidersGroup.remove(entry.group);
          disposeGroupGeometries(entry.group);
        }
        const group = createAirGliderGroup(gl);
        this.glidersGroup.add(group);
        entry = { key, group };
        this.gliderCache.set(gl.id, entry);
      }
      const startY = groundHeightAtSim(gl.startX, gl.startY) + 1.4;
      const endY = groundHeightAtSim(gl.endX, gl.endY) + 1.0;
      const t = Math.max(0, Math.min(1, gl.progress));
      const y3 = startY + (endY - startY) * t + Math.sin(t * Math.PI) * gl.altitudeBoost;
      entry.group.position.set(toWorldX(gl.x), y3, toWorldZ(gl.y));
      entry.group.rotation.y = gl.yaw;
      entry.group.rotation.z = Math.sin(animTimeSec * 2.6 + gl.x * 0.02) * 0.14;
      entry.group.rotation.x = Math.cos(t * Math.PI) * -0.18;
    }
    for (const [id, entry] of this.gliderCache.entries()) {
      if (!activeIds.has(id)) {
        this.glidersGroup.remove(entry.group);
        disposeGroupGeometries(entry.group);
        this.gliderCache.delete(id);
      }
    }
  }

  private syncProjectiles(world: WorldState) {
    let idx = 0;
    for (let i = 0; i < world.projectiles.length && idx < this.maxProjectiles; i++) {
      const pr = world.projectiles[i];
      const t = Math.max(0, Math.min(1, pr.progress));
      const sx = pr.fromX + (pr.toX - pr.fromX) * t;
      const sy = pr.fromY + (pr.toY - pr.fromY) * t;
      const x3 = toWorldX(sx);
      const z3 = toWorldZ(sy);
      const arc = Math.sin(t * Math.PI) * 2.2;
      const y3 = pr.fromElev + (pr.toElev - pr.fromElev) * t + 1.0 + arc;
      const yaw = Math.atan2(toWorldX(pr.toX) - toWorldX(pr.fromX), toWorldZ(pr.toY) - toWorldZ(pr.fromY));
      this.tmpDummy.position.set(x3, y3, z3);
      this.tmpDummy.rotation.set(Math.cos(t * Math.PI) * -0.25, yaw, 0);
      this.tmpDummy.scale.setScalar(pr.kind === 'ember_bolt' ? 1.45 : 1.0);
      this.tmpDummy.updateMatrix();
      this.projectileMesh.setMatrixAt(idx, this.tmpDummy.matrix);
      this.tmpColor.setHex(pr.kind === 'ember_bolt' ? 0xf97316 : 0xfef3c7);
      this.projectileMesh.setColorAt(idx, this.tmpColor);
      idx++;
    }
    this.projectileMesh.count = idx;
    this.projectileMesh.instanceMatrix.needsUpdate = true;
    if (this.projectileMesh.instanceColor) this.projectileMesh.instanceColor.needsUpdate = true;
  }

  private syncWildNodes(world: WorldState, wind: WindSample, animTimeSec: number) {
    const activeIds = new Set<string>();
    const { season, weather } = world.environment;
    const interactors = this.foliageUniforms.uInteractors.value;

    for (const node of world.wildNodes) {
      if (node.amount <= 0.05) continue;
      activeIds.add(node.id);
      const hasStock = node.amount > 2 ? 1 : 0;
      const key = `${node.kind}_${hasStock}_${season}_${weather}`;
      let entry = this.wildNodeCache.get(node.id);
      if (!entry || entry.key !== key) {
        if (entry) {
          this.wildNodesGroup.remove(entry.group);
          disposeGroupGeometries(entry.group);
        }
        const group = createWildNodeGroup(node, season, weather);
        group.userData.entityKind = 'wild_node';
        group.userData.entityId = node.id;
        group.position.set(toWorldX(node.x), groundHeightAtSim(node.x, node.y), toWorldZ(node.y));
        this.wildNodesGroup.add(group);
        entry = { key, group };
        this.wildNodeCache.set(node.id, entry);
      }

      const wx = entry.group.position.x;
      const wz = entry.group.position.z;
      const canopy = entry.group.userData.canopyPivot as THREE.Object3D | undefined;
      if (canopy) {
        const gustWave = 0.65 + 0.35 * Math.sin(animTimeSec * 1.6 + wx * 0.18 + wz * 0.14);
        const micro = Math.sin(animTimeSec * 2.4 + wx * 0.65 + wz * 0.45) * 0.018 * wind.gust;
        let rustle = 0;
        for (let i = 0; i < interactors.length; i++) {
          const slot = interactors[i];
          if (slot.w <= 0.02) continue;
          const dx = wx - slot.x;
          const dz = wz - slot.y;
          const distSq = dx * dx + dz * dz;
          const maxR = slot.z + 0.9;
          if (distSq < maxR * maxR) {
            const strength = (1 - Math.sqrt(distSq) / maxR) * slot.w;
            if (strength > rustle) rustle = strength;
          }
        }
        const rustleOsc = rustle > 0.01 ? Math.sin(animTimeSec * 10.5 + wx * 1.4) * 0.055 * rustle : 0;
        canopy.rotation.z = -(wind.dirX * wind.canopyTilt * gustWave + micro + rustleOsc);
        canopy.rotation.x = wind.dirZ * wind.canopyTilt * gustWave + micro * 0.7;
      } else if (entry.group.userData.isBush) {
        const bushWave = Math.sin(animTimeSec * 2.5 + wx * 0.7 + wz * 0.5) * 0.032 * wind.gust;
        let pushX = 0;
        let pushZ = 0;
        for (let i = 0; i < interactors.length; i++) {
          const slot = interactors[i];
          if (slot.w <= 0.02) continue;
          const dx = wx - slot.x;
          const dz = wz - slot.y;
          const distSq = dx * dx + dz * dz;
          const maxR = slot.z + 0.65;
          if (distSq < maxR * maxR && distSq > 0.0001) {
            const dist = Math.sqrt(distSq);
            const strength = (1 - dist / maxR) * slot.w * 0.22;
            pushX += (dx / dist) * strength;
            pushZ += (dz / dist) * strength;
          }
        }
        entry.group.rotation.z = -(wind.dirX * 0.04 * wind.gust + bushWave + pushX);
        entry.group.rotation.x = wind.dirZ * 0.04 * wind.gust + bushWave * 0.6 + pushZ;
      }
    }

    for (const [id, entry] of this.wildNodeCache.entries()) {
      if (!activeIds.has(id)) {
        this.wildNodesGroup.remove(entry.group);
        disposeGroupGeometries(entry.group);
        this.wildNodeCache.delete(id);
      }
    }
  }

  private syncPlacedSuggestions(world: WorldState, animTimeSec: number) {
    const activeIds = new Set<string>();
    for (const s of world.placedSuggestions) {
      activeIds.add(s.id);
      let group = this.suggestionCache.get(s.id);
      if (!group) {
        group = createSuggestionStakeGroup(s.buildingType);
        group.position.set(toWorldX(s.x), groundHeightAtSim(s.x, s.y), toWorldZ(s.y));
        this.suggestionsGroup.add(group);
        this.suggestionCache.set(s.id, group);
      }
      group.rotation.y = animTimeSec * 0.65;
    }
    for (const [id, group] of this.suggestionCache.entries()) {
      if (!activeIds.has(id)) {
        this.suggestionsGroup.remove(group);
        disposeGroupGeometries(group);
        this.suggestionCache.delete(id);
      }
    }
  }

  private syncMemorials(world: WorldState) {
    const activeIds = new Set<string>();
    for (const m of world.memorials) {
      activeIds.add(m.id);
      if (!this.memorialCache.has(m.id)) {
        const group = createMemorialStoneGroup(m.id);
        group.position.set(toWorldX(m.x), groundHeightAtSim(m.x, m.y), toWorldZ(m.y));
        this.memorialsGroup.add(group);
        this.memorialCache.set(m.id, group);
      }
    }
    for (const [id, group] of this.memorialCache.entries()) {
      if (!activeIds.has(id)) {
        this.memorialsGroup.remove(group);
        disposeGroupGeometries(group);
        this.memorialCache.delete(id);
      }
    }
  }

  private getThoughtTexture(text: string): THREE.CanvasTexture {
    const cached = this.thoughtTextures.get(text);
    if (cached) return cached;

    if (this.thoughtTextures.size >= 48) {
      const oldest = this.thoughtTextures.keys().next().value;
      if (oldest) {
        this.thoughtTextures.get(oldest)?.dispose();
        this.thoughtTextures.delete(oldest);
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.font = 'bold 24px Inter, sans-serif';
      const pad = 18;
      const metrics = ctx.measureText(text);
      const bw = Math.min(244, Math.max(68, metrics.width + pad * 2));
      const bx = (256 - bw) * 0.5;

      ctx.fillStyle = 'rgba(250, 246, 238, 0.95)';
      ctx.strokeStyle = 'rgba(28, 35, 49, 0.85)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(bx, 10, bw, 40, 12);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#1C2331';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 128, 30, bw - 16);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.thoughtTextures.set(text, tex);
    return tex;
  }

  private syncBuildings(world: WorldState, nightFactor: number, animTimeSec: number, wind: WindSample) {
    const { season, weather } = world.environment;
    const ac = world.activeConstruction;
    const activeIds = new Set<string>();
    const interactors = this.foliageUniforms.uInteractors.value;
    const windAngle = Math.atan2(wind.dirX, wind.dirZ);

    for (const b of world.buildings) {
      activeIds.add(b.id);
      const isConstructing = Boolean(ac && ac.buildingId === b.id);
      const ratio = isConstructing && ac ? ac.progress / Math.max(0.1, ac.duration) : 0;
      const ratioStep = isConstructing ? Math.round(ratio * 20) / 20 : 0;
      const lit = nightFactor > 0.22 || weather === 'rain';
      const disrepairTier = (b.disrepair ?? 0) >= 75 ? 2 : (b.disrepair ?? 0) >= 45 ? 1 : 0;
      const cropStage = b.cropState ? `${b.cropState.cropType}_${Math.floor(b.cropState.growth * 3.99)}` : '';
      const buildStage = b.constructionStage ?? '';
      const pausedFlag = Boolean(b.pausedForMaterials);
      const key = `${b.type}_${b.cultureId}_${b.unlocked}_${b.level}_${disrepairTier}_${isConstructing}_${ratioStep}_${buildStage}_${pausedFlag}_${lit}_${season}_${weather}_${cropStage}`;

      let entry = this.buildingCache.get(b.id);
      if (!entry || entry.key !== key) {
        if (entry) {
          this.buildingsGroup.remove(entry.group);
          disposeGroupGeometries(entry.group);
        }
        const group = createLowPolyBuilding(b, isConstructing, ratio, nightFactor, season, weather);
        const gy = groundHeightAtSim(b.x, b.y, world.bridges);
        group.position.set(toWorldX(b.x), gy, toWorldZ(b.y));
        if (b.type === 'dock') {
          const def = ISLAND_DEFS[b.islandId];
          group.rotation.y = Math.atan2(-(def.dockSpot.seaY - def.dockSpot.y), def.dockSpot.seaX - def.dockSpot.x);
        }
        group.userData.entityKind = 'building';
        group.userData.entityId = b.id;

        const cShadow = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 3.1), this.contactShadowMat);
        cShadow.rotation.x = -Math.PI / 2;
        cShadow.position.y = 0.03;
        group.add(cShadow);

        this.buildingsGroup.add(group);
        entry = { key, group };
        this.buildingCache.set(b.id, entry);
      }

      const bWx = entry.group.position.x;
      const bWz = entry.group.position.z;
      const children = entry.group.children;
      for (let i = 0; i < children.length; i++) {
        const c = children[i];
        if (c.userData.isConstructionRig) {
          if (isConstructing) {
            const pulse = Math.max(0, Math.sin(animTimeSec * 8.4 + bWx * 0.3));
            c.scale.set(1 + pulse * 0.014, 1 - pulse * 0.018, 1 + pulse * 0.014);
            c.rotation.z = Math.sin(animTimeSec * 16.8 + bWz) * 0.008 * pulse;
          } else {
            c.scale.set(1, 1, 1);
            c.rotation.z = 0;
          }
        } else if (c.userData.isProgressPulse) {
          const pScale = 1 + Math.sin(animTimeSec * 5.2) * 0.08;
          c.scale.set(1, pScale, 1);
        } else if (c.userData.isFlame) {
          c.scale.set(
            1 + Math.sin(animTimeSec * 10 + b.x * 0.1) * 0.12,
            0.9 + Math.cos(animTimeSec * 12 + b.y * 0.1) * 0.18,
            1,
          );
        } else if (c.userData.isEmber) {
          const flicker = 0.92 + Math.sin(animTimeSec * 9.5 + bWx) * 0.12;
          c.scale.set(flicker, 0.9 + Math.cos(animTimeSec * 11.2 + bWz) * 0.14, 1);
        } else if (c.userData.isBellows) {
          const pump = 0.84 + Math.sin(animTimeSec * 4.4 + bWx * 0.4) * 0.18;
          c.scale.set(1, pump, 1);
        } else if (c.userData.isSaw) {
          c.rotation.z = animTimeSec * 9.5;
          c.position.y = 0.68 + Math.sin(animTimeSec * 6.5 + bWx) * 0.04;
        } else if (c.userData.isBanner) {
          const flutter = Math.sin(animTimeSec * 5.8 + bWx * 0.7 + i * 0.9) * wind.bannerFlutter;
          c.rotation.y = flutter;
          c.rotation.z = wind.dirX * 0.06 * wind.gust + flutter * 0.25;
        } else if (c.userData.isWindsock) {
          const flutter = Math.sin(animTimeSec * 7.5 + bWx) * wind.bannerFlutter * 0.55;
          c.rotation.y = windAngle - entry.group.rotation.y + flutter * 0.35;
          c.rotation.x = flutter * 0.25;
        } else if (c.userData.isCropFoliage) {
          const worldX = bWx + c.position.x;
          const worldZ = bWz + c.position.z;
          const cropWave = Math.sin(animTimeSec * 2.6 + worldX * 1.1 + worldZ * 0.9) * 0.065 * wind.gust;
          let pushX = 0;
          let pushZ = 0;
          for (let j = 0; j < interactors.length; j++) {
            const slot = interactors[j];
            if (slot.w <= 0.02) continue;
            const dx = worldX - slot.x;
            const dz = worldZ - slot.y;
            const distSq = dx * dx + dz * dz;
            const maxR = slot.z * 0.9;
            if (distSq < maxR * maxR && distSq > 0.0001) {
              const dist = Math.sqrt(distSq);
              const strength = (1 - dist / maxR) * slot.w * 0.28;
              pushX += (dx / dist) * strength;
              pushZ += (dz / dist) * strength;
            }
          }
          c.rotation.z = -(wind.dirX * 0.08 * wind.gust + cropWave + pushX);
          c.rotation.x = wind.dirZ * 0.08 * wind.gust + cropWave * 0.65 + pushZ;
        }
      }
    }

    // Animate spring fountain water ripples
    const springGroups = this.springsGroup.children;
    for (let s = 0; s < springGroups.length; s++) {
      const sg = springGroups[s];
      for (let k = 0; k < sg.children.length; k++) {
        const part = sg.children[k];
        if (part.userData.isRipple) {
          const t = (animTimeSec * 0.65 + s * 0.37) % 1;
          part.scale.setScalar(0.85 + t * 0.95);
          const mat = (part as THREE.Mesh).material as THREE.MeshBasicMaterial;
          if (mat) mat.opacity = (1 - t) * 0.55;
        }
      }
    }

    for (const [id, entry] of this.buildingCache.entries()) {
      if (!activeIds.has(id)) {
        this.buildingsGroup.remove(entry.group);
        disposeGroupGeometries(entry.group);
        this.buildingCache.delete(id);
      }
    }
  }

  private syncPeople(
    world: WorldState,
    selectedVillagerId: string | null,
    selectedUnitIds: Set<string>,
    hoveredVillagerId: string | null,
    animTimeSec: number,
    dt: number,
  ) {
    const activeIds = new Set<string>();
    const weather = world.environment.weather;
    const yawAlpha = 1 - Math.exp(-10.5 * dt);
    const weightAlpha = 1 - Math.exp(-11 * dt);
    const heightAlpha = 1 - Math.exp(-16 * dt);

    const allPeople = [...world.villagers, ...world.clanVillagers, ...world.raiders];

    for (const v of allPeople) {
      activeIds.add(v.id);
      const isSoldierArmorKey =
        v.activeTask === 'guard' ||
        Boolean(v.drafted) ||
        Boolean(v.isStranger && v.gearTier >= 2) ||
        (v.gearTier === 3 && (v.state === 'fighting' || v.state === 'hunting'));
      const taskOutfitTag =
        v.activeTask === 'farm' || v.activeTask === 'forage' || v.activeTask === 'pasture'
          ? 'straw'
          : v.activeTask === 'bake'
            ? 'bake'
            : v.activeTask === 'smelt'
              ? 'apron'
              : 'plain';
      const key = `chibi2_${v.lifeStage}_${v.cloakColor}_${v.hairColor}_${v.skinTone}_${v.hairStyle}_${v.cultureId}_${v.gearTier}_${v.weaponType}_${Boolean(v.isStranger)}_${isSoldierArmorKey}_${taskOutfitTag}`;
      let entry = this.villagerCache.get(v.id);

      if (!entry || entry.key !== key) {
        if (entry) {
          this.villagersGroup.remove(entry.group);
          disposeGroupGeometries(entry.group);
        }
        const group = createLowPolyVillager(v);
        group.userData.entityKind = v.isStranger ? 'raider' : v.isNativeClan ? 'clan_villager' : 'villager';
        group.userData.entityId = v.id;

        const shadowDisc = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), this.contactShadowMat);
        shadowDisc.rotation.x = -Math.PI / 2;
        shadowDisc.position.y = 0.025;
        group.add(shadowDisc);

        const hitGeo = new THREE.CylinderGeometry(0.62, 0.62, 1.75, 6);
        const hitMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
        const hitMesh = new THREE.Mesh(hitGeo, hitMat);
        hitMesh.position.y = 0.85;
        hitMesh.userData.ownMaterial = true;
        group.add(hitMesh);

        const wx = toWorldX(v.x);
        const wz = toWorldZ(v.y);
        const startGy = groundHeightAtSim(v.x, v.y, world.bridges);
        this.villagersGroup.add(group);
        entry = {
          key,
          group,
          lastBubbleText: null,
          prevX: wx,
          prevY: wz,
          yaw: v.facing >= 0 ? Math.PI * 0.35 : -Math.PI * 0.35,
          walkPhase: v.animPhase,
          walkWeight: 0,
          gy: startGy,
        };
        this.villagerCache.set(v.id, entry);
      }

      const g = entry.group;
      if ((v.state === 'sailing' && v.voyageBoatId) || v.state === 'gliding' || v.state === 'gondola') {
        g.visible = false;
        continue;
      }
      g.visible = true;

      const wx = toWorldX(v.x);
      const wz = toWorldZ(v.y);
      const dx = wx - entry.prevX;
      const dz = wz - entry.prevY;
      entry.prevX = wx;
      entry.prevY = wz;

      const stepDist = Math.hypot(dx, dz);
      const speedWorld = stepDist / Math.max(0.008, dt);
      this.actorSpeedMap.set(v.id, speedWorld);
      const moving = speedWorld > 0.12;
      entry.walkWeight += ((moving ? 1 : 0) - entry.walkWeight) * weightAlpha;
      if (moving) entry.walkPhase += Math.min(0.65, stepDist * 4.4);

      const targetGy = groundHeightAtSim(v.x, v.y, world.bridges) + 0.04;
      entry.gy += (targetGy - entry.gy) * heightAlpha;

      const isSoaking = v.state === 'soaking' && !moving;
      const isSleeping = v.state === 'sleeping' && !moving;
      const poseOffsetY = isSoaking ? -0.34 : isSleeping ? -0.24 : 0;
      g.position.set(wx, entry.gy + poseOffsetY, wz);

      const targetYaw =
        stepDist > 0.0025 ? Math.atan2(dx, dz) : v.facing >= 0 ? Math.PI * 0.35 : -Math.PI * 0.35;
      entry.yaw = dampAngle(entry.yaw, targetYaw, yawAlpha);
      g.rotation.y = entry.yaw;

      const hipL = g.userData.hipL as THREE.Object3D | undefined;
      const calfL = g.userData.calfL as THREE.Object3D | undefined;
      const hipR = g.userData.hipR as THREE.Object3D | undefined;
      const calfR = g.userData.calfR as THREE.Object3D | undefined;
      const shoulderL = g.userData.shoulderL as THREE.Object3D | undefined;
      const forearmL = g.userData.forearmL as THREE.Object3D | undefined;
      const shoulderR = g.userData.shoulderR as THREE.Object3D | undefined;
      const forearmR = g.userData.forearmR as THREE.Object3D | undefined;
      const headGroup = g.userData.headGroup as THREE.Object3D | undefined;
      const spine =
        (g.userData.spine as THREE.Object3D | undefined) ??
        (g.userData.bodyWrap?.children?.find(
          (c: THREE.Object3D) => c !== headGroup && c !== g.userData.chiefBadge,
        ) as THREE.Object3D | undefined);
      const bodyWrap = g.userData.bodyWrap as THREE.Object3D | undefined;

      const w = entry.walkWeight;
      const swing = Math.sin(entry.walkPhase) * 0.62 * w;
      const kneeBendL = Math.max(0, Math.sin(entry.walkPhase)) * 0.75 * w;
      const kneeBendR = Math.max(0, -Math.sin(entry.walkPhase)) * 0.75 * w;
      const stepBob = Math.abs(Math.sin(entry.walkPhase)) * 0.052 * w;
      const breath = Math.sin(animTimeSec * 2.1 + v.x * 0.1) * 0.016;

      const isInfant = v.lifeStage === 'infant';
      const isAxeWork = !moving && v.state === 'working' && v.activeTask === 'chop';
      const isPickWork = !moving && v.state === 'working' && (v.activeTask === 'quarry' || v.activeTask === 'gather_stone');
      const isGatherWork = !moving && v.state === 'working' && (v.activeTask === 'forage' || v.activeTask === 'farm');
      const isStationWork =
        !moving &&
        v.state === 'working' &&
        (v.activeTask === 'bake' || v.activeTask === 'smelt' || v.activeTask === 'pasture');
      const isCombat = !moving && (v.state === 'fighting' || v.state === 'hunting');
      const isBuild = !moving && v.state === 'building';
      const isStudy = !moving && (v.state === 'inspecting' || (v.state === 'working' && v.activeTask === 'study'));
      const isSocial = !moving && v.state === 'socializing';
      const isFestival = !moving && v.state === 'festival';
      const isEating = !moving && v.state === 'eating';
      const isResting = !moving && (v.state === 'resting' || v.state === 'sheltering');
      const isHauling = (v.carriedAmount ?? 0) > 0.1 && moving && !isInfant;
      const isGuardReady =
        !isBuild &&
        !isAxeWork &&
        !isPickWork &&
        !isGatherWork &&
        !isStationWork &&
        !isEating &&
        !isSleeping &&
        !isSoaking &&
        !isStudy &&
        !isSocial &&
        (isCombat || v.activeTask === 'guard' || Boolean(v.drafted) || Boolean(v.isStranger));

      if (isInfant) {
        const crawl = Math.sin(animTimeSec * 5.2 + v.animPhase);
        const wiggle = Math.sin(animTimeSec * 3.1 + v.animPhase);
        if (hipL) hipL.rotation.x = moving ? crawl * 0.55 : wiggle * 0.22;
        if (hipR) hipR.rotation.x = moving ? -crawl * 0.55 : -wiggle * 0.22;
        if (shoulderL && shoulderR) {
          shoulderL.rotation.x = moving ? -0.45 - crawl * 0.5 : -0.65 + wiggle * 0.45;
          shoulderR.rotation.x = moving ? -0.45 + crawl * 0.5 : -0.65 - wiggle * 0.45;
        }
        if (headGroup) {
          headGroup.rotation.z = wiggle * 0.14;
          headGroup.rotation.x = Math.sin(animTimeSec * 2.4) * 0.08;
        }
        if (bodyWrap) {
          bodyWrap.position.y = Math.abs(crawl) * 0.045 * (moving ? 1 : 0.35);
          bodyWrap.rotation.x = moving ? 0.22 : 0.04;
          bodyWrap.rotation.z = wiggle * 0.07;
        }
      } else {
        // Reset secondary rotations cleanly before applying state animation
        let spineRotX = w * 0.12;
        let spineRotY = 0;
        let spineRotZ = 0;
        let headRotX = 0;
        let headRotY = 0;
        let headRotZ = 0;
        let bodyY = stepBob + breath;
        let legDip = 0;

        if (shoulderL && shoulderR) {
          shoulderL.rotation.set(0, 0, 0);
          shoulderR.rotation.set(0, 0, 0);
          if (forearmL) forearmL.rotation.set(-0.28, 0, 0);
          if (forearmR) forearmR.rotation.set(-0.28, 0, 0);

          if (isCombat && v.weaponType === 'bow') {
            // Aimed archery cycle: steady left brace arm + smooth draw back & crisp release recoil
            const cycle = (animTimeSec * 1.35 + v.animPhase) % 1;
            const draw = cycle < 0.72 ? cycle / 0.72 : Math.max(0, 1 - (cycle - 0.72) * 5.2);
            spineRotY = 0.48;
            headRotY = -0.36;
            shoulderL.rotation.set(-1.52, 0.22, -0.1);
            if (forearmL) forearmL.rotation.set(-0.18, 0, 0);
            shoulderR.rotation.set(-1.42 + draw * 0.48, -0.25, 0.12);
            if (forearmR) forearmR.rotation.set(-0.45 - draw * 0.95, 0, 0);
          } else if (isCombat && v.weaponType === 'flint_spear') {
            // Two-handed braced spear thrust lunge
            const thrustWave = Math.sin(animTimeSec * 7.8 + v.animPhase);
            const lunge = Math.max(0, thrustWave);
            spineRotY = 0.26 - lunge * 0.28;
            spineRotX = 0.12 + lunge * 0.16;
            shoulderL.rotation.set(-1.02 - lunge * 0.28, 0.28, 0);
            if (forearmL) forearmL.rotation.set(-0.65 + lunge * 0.42, 0, 0);
            shoulderR.rotation.set(-1.12 - lunge * 0.48, -0.18, 0);
            if (forearmR) forearmR.rotation.set(-0.78 + lunge * 0.62, 0, 0);
          } else if (isCombat) {
            // Arming blade guard stance + diagonal slash with torso twist
            const s = Math.sin(animTimeSec * 8.4 + v.animPhase);
            spineRotY = s * 0.34;
            spineRotX = 0.1 + Math.max(0, s) * 0.12;
            shoulderL.rotation.set(-0.64 + s * 0.18, 0, 0.14);
            shoulderR.rotation.set(-1.35 + s * 0.95, -0.24 * s, -0.22);
            if (forearmR) forearmR.rotation.set(-0.85 + s * 0.48, 0, 0);
          } else if (isBuild) {
            // Snappy overhead hammer-strike cadence with knee dip & brace arm
            const t = animTimeSec * 7.6 + v.animPhase;
            const lift = Math.sin(t);
            const impact = Math.max(0, -lift);
            legDip = impact * 0.14;
            bodyY -= impact * 0.04;
            spineRotX = 0.14 + impact * 0.14;
            shoulderL.rotation.set(-0.72, 0.2, 0);
            shoulderR.rotation.set(-1.45 + lift * 0.85, 0, -0.12);
            if (forearmR) forearmR.rotation.set(-0.75 + lift * 0.45, 0, 0);
            headRotX = 0.14 + impact * 0.08;
          } else if (isAxeWork) {
            // Side-angled woodcutter chop w/ torso twist
            const chop = Math.sin(animTimeSec * 7.2 + v.animPhase);
            spineRotY = chop * 0.38;
            spineRotX = 0.18;
            shoulderL.rotation.set(-0.88 + chop * 0.36, 0.25, 0.14);
            shoulderR.rotation.set(-1.12 + chop * 0.72, -0.2, -0.28);
            if (forearmR) forearmR.rotation.set(-0.7 + chop * 0.48, 0, 0);
            headRotX = 0.15;
          } else if (isPickWork) {
            // Heavy double-arm overhead pickaxe strike
            const slam = Math.sin(animTimeSec * 7.4 + v.animPhase);
            const impact = Math.max(0, -slam);
            legDip = impact * 0.18;
            spineRotX = 0.2 + impact * 0.16;
            shoulderL.rotation.set(-1.05 + slam * 0.52, 0.22, 0);
            shoulderR.rotation.set(-1.32 + slam * 0.88, -0.15, 0);
            if (forearmR) forearmR.rotation.set(-0.85 + slam * 0.55, 0, 0);
            headRotX = 0.18;
          } else if (isGatherWork) {
            // Deep crouched soil/berry gathering
            const pick = Math.sin(animTimeSec * 5.2 + v.animPhase);
            legDip = 0.24;
            bodyY -= 0.04;
            spineRotX = 0.42 + pick * 0.06;
            shoulderL.rotation.set(-0.98 + pick * 0.32, 0, 0);
            shoulderR.rotation.set(-0.98 - pick * 0.32, 0, 0);
            if (forearmL) forearmL.rotation.x = -0.55;
            if (forearmR) forearmR.rotation.x = -0.55;
            headRotX = 0.22;
          } else if (isStationWork) {
            // Rhythmic kneading / smithing / tending workbench motion
            const work = Math.sin(animTimeSec * 5.8 + v.animPhase);
            spineRotX = 0.16;
            shoulderL.rotation.set(-0.82 + work * 0.22, 0.16, 0);
            shoulderR.rotation.set(-0.82 - work * 0.22, -0.16, 0);
            if (forearmL) forearmL.rotation.x = -0.68 - work * 0.18;
            if (forearmR) forearmR.rotation.x = -0.68 + work * 0.18;
            headRotX = 0.14;
          } else if (isEating) {
            // Lifting bite to mouth & happy chewing nod
            const bite = Math.max(0, Math.sin(animTimeSec * 4.4 + v.animPhase));
            shoulderL.rotation.set(-0.42, 0, 0);
            shoulderR.rotation.set(-0.95 - bite * 0.35, -0.25, 0);
            if (forearmR) forearmR.rotation.x = -1.15 - bite * 0.25;
            headRotX = 0.1 + Math.sin(animTimeSec * 9.5) * 0.06;
          } else if (isFestival) {
            // Joyful rhythmic hop & raised-arm dance sway
            const hop = Math.abs(Math.sin(animTimeSec * 5.4 + v.animPhase));
            const sway = Math.sin(animTimeSec * 2.7 + v.animPhase);
            bodyY += hop * 0.14;
            spineRotZ = sway * 0.1;
            shoulderL.rotation.set(-1.35 + sway * 0.3, 0, 0.38);
            shoulderR.rotation.set(-1.35 - sway * 0.3, 0, -0.38);
            headRotZ = -sway * 0.12;
          } else if (isStudy) {
            const tilt = Math.sin(animTimeSec * 2.3 + v.animPhase);
            spineRotX = 0.12;
            shoulderL.rotation.set(-0.55 + tilt * 0.12, 0.18, 0);
            shoulderR.rotation.set(-1.05, -0.28, 0);
            if (forearmR) forearmR.rotation.x = -1.2;
            headRotX = 0.18 + tilt * 0.06;
            headRotZ = tilt * 0.08;
          } else if (isSocial) {
            const gesture = Math.sin(animTimeSec * 3.8 + v.animPhase);
            shoulderL.rotation.set(-0.52 + gesture * 0.28, 0.12, 0.08);
            shoulderR.rotation.set(-0.68 - gesture * 0.32, -0.12, -0.08);
            if (forearmL) forearmL.rotation.x = -0.65;
            if (forearmR) forearmR.rotation.x = -0.75;
            headRotX = Math.sin(animTimeSec * 3.1 + v.animPhase) * 0.1;
            headRotY = Math.cos(animTimeSec * 1.9 + v.animPhase) * 0.18;
          } else if (isSoaking) {
            legDip = 0.95;
            shoulderL.rotation.set(-0.35, 0, 0.42);
            shoulderR.rotation.set(-0.35, 0, -0.42);
            headRotX = -0.14;
          } else if (isSleeping) {
            bodyY = -0.04;
            spineRotX = 0.28;
            shoulderL.rotation.set(-0.55, 0, 0.12);
            shoulderR.rotation.set(-0.55, 0, -0.12);
            headRotZ = 0.22;
          } else if (isHauling) {
            // Arms cradle front cargo sack while walking
            shoulderL.rotation.set(-0.78, 0.24, 0);
            shoulderR.rotation.set(-0.78, -0.24, 0);
            if (forearmL) forearmL.rotation.x = -0.72;
            if (forearmR) forearmR.rotation.x = -0.72;
            spineRotX = 0.16;
          } else if (isGuardReady && v.weaponType !== 'none') {
            // Weapon held at the ready while patrolling or standing watch
            shoulderL.rotation.set(-swing * 0.65 - 0.15, 0, 0.08);
            shoulderR.rotation.set(swing * 0.35 - 0.58, -0.12, -0.08);
            if (forearmR) forearmR.rotation.x = -0.58;
            if (isResting) headRotY = Math.sin(animTimeSec * 1.1 + v.animPhase) * 0.25;
          } else {
            shoulderL.rotation.x = -swing * 0.85;
            shoulderR.rotation.x = swing * 0.85;
            if (forearmL) forearmL.rotation.x = -0.3 + Math.abs(swing) * 0.2;
            if (forearmR) forearmR.rotation.x = -0.3 + Math.abs(swing) * 0.2;
            if (isResting) headRotY = Math.sin(animTimeSec * 1.05 + v.animPhase) * 0.22;
          }
        }

        if (hipL) hipL.rotation.x = isSleeping ? -0.75 : isSoaking ? -1.1 : swing - legDip;
        if (calfL) calfL.rotation.x = isSleeping ? 0.2 : isSoaking ? 0.85 : kneeBendL + legDip * 1.4;
        if (hipR) hipR.rotation.x = isSleeping ? -0.75 : isSoaking ? -1.1 : -swing - legDip;
        if (calfR) calfR.rotation.x = isSleeping ? 0.2 : isSoaking ? 0.85 : kneeBendR + legDip * 1.4;

        if (headGroup) {
          headGroup.rotation.set(headRotX, headRotY, headRotZ);
        }
        if (spine) {
          spine.rotation.set(spineRotX, spineRotY, spineRotZ);
        }
        if (bodyWrap) {
          bodyWrap.position.y = bodyY;
        }
      }

      const s = v.bounceScale || 1;
      const baseScale = v.lifeStage === 'infant' ? 0.66 : v.lifeStage === 'child' ? 0.8 : 1.0;
      g.scale.set(baseScale * s, baseScale * s, baseScale * s);

      const chiefBadge = g.userData.chiefBadge as THREE.Object3D | undefined;
      if (chiefBadge) chiefBadge.visible = v.isChief;

      const hammerGroup = g.userData.hammerGroup as THREE.Object3D | undefined;
      const axeGroup = g.userData.axeGroup as THREE.Object3D | undefined;
      const pickaxeGroup = g.userData.pickaxeGroup as THREE.Object3D | undefined;
      const weaponGroup = g.userData.weaponGroup as THREE.Object3D | undefined;
      const stowedWeaponGroup = g.userData.stowedWeaponGroup as THREE.Object3D | undefined;
      const bowArrow = g.userData.bowArrow as THREE.Object3D | undefined;
      const carriedBundle = g.userData.carriedBundle as THREE.Object3D | undefined;

      if (hammerGroup) hammerGroup.visible = isBuild;
      if (axeGroup) axeGroup.visible = isAxeWork;
      if (pickaxeGroup) pickaxeGroup.visible = isPickWork;
      if (weaponGroup) weaponGroup.visible = isGuardReady;
      if (stowedWeaponGroup) stowedWeaponGroup.visible = !isGuardReady;
      if (bowArrow) bowArrow.visible = isCombat && v.weaponType === 'bow';
      if (carriedBundle) carriedBundle.visible = isHauling;

      const rainHat = g.userData.rainHat as THREE.Object3D | undefined;
      if (rainHat) {
        rainHat.visible = weather === 'rain' && v.state !== 'sheltering' && v.state !== 'sleeping' && v.state !== 'soaking';
      }

      const selectRing = g.userData.selectRing as THREE.Mesh | undefined;
      if (selectRing) {
        const isSel = v.id === selectedVillagerId || selectedUnitIds.has(v.id);
        const isHov = v.id === hoveredVillagerId;
        const isPerimeter = v.visitStatus === 'at_perimeter' || v.visitStatus === 'parleying';
        selectRing.visible = isSel || isHov || Boolean(v.isStranger) || isPerimeter;
        if (selectRing.visible) {
          const pulse = isSel ? 1.08 + Math.sin(animTimeSec * 4) * 0.08 : 0.94;
          selectRing.scale.setScalar(pulse);
          (selectRing.material as THREE.MeshBasicMaterial).color.setHex(
            v.isStranger
              ? 0xef4444
              : isPerimeter
                ? 0xfbbf24
                : isSel
                  ? v.drafted
                    ? 0x38bdf8
                    : 0xf59e0b
                  : 0xfef3c7,
          );
        }
      }

      let bubble = g.userData.bubbleSprite as THREE.Sprite | undefined;
      if (v.thoughtBubble) {
        if (!bubble) {
          const spMat = new THREE.SpriteMaterial({
            map: this.getThoughtTexture(v.thoughtBubble),
            transparent: true,
            depthTest: false,
          });
          bubble = new THREE.Sprite(spMat);
          bubble.position.set(0, 2.04, 0);
          bubble.scale.set(2.4, 0.6, 1);
          g.add(bubble);
          g.userData.bubbleSprite = bubble;
          entry.lastBubbleText = v.thoughtBubble;
        } else if (entry.lastBubbleText !== v.thoughtBubble) {
          bubble.material.map = this.getThoughtTexture(v.thoughtBubble);
          bubble.material.needsUpdate = true;
          entry.lastBubbleText = v.thoughtBubble;
        }
        bubble.visible = true;
        bubble.position.y = 2.04 + Math.sin(animTimeSec * 2.8) * 0.06;
      } else if (bubble) {
        bubble.visible = false;
      }
    }

    for (const [id, entry] of this.villagerCache.entries()) {
      if (!activeIds.has(id)) {
        this.villagersGroup.remove(entry.group);
        disposeGroupGeometries(entry.group);
        this.villagerCache.delete(id);
        this.actorSpeedMap.delete(id);
      }
    }
  }

  private syncGateTravelers(world: WorldState, animTimeSec: number) {
    const activeIds = new Set<string>();
    const travelers = world.pendingArrivals.filter((a) => a.kind === 'traveler');
    const cradleDock = ISLAND_DEFS.cradle.dockSpot;

    travelers.forEach((cand, idx) => {
      activeIds.add(cand.id);
      const statusText =
        cand.decisionVerdict === 'talking'
          ? 'At the shore...'
          : cand.decisionVerdict === 'recommend_welcome'
            ? 'Looks kind!'
            : 'Uncertain...';

      let entry = this.gateTravelerCache.get(cand.id);
      if (!entry) {
        const group = createTravelerGateVisitor(cand);
        const shadowDisc = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), this.contactShadowMat);
        shadowDisc.rotation.x = -Math.PI / 2;
        shadowDisc.position.y = 0.025;
        group.add(shadowDisc);
        this.gateTravelersGroup.add(group);
        entry = { group, lastStatus: '' };
        this.gateTravelerCache.set(cand.id, entry);
      }

      const simX = cradleDock.x - 16 - idx * 14;
      const simY = cradleDock.y + (idx % 2) * 10;
      const gy = groundHeightAtSim(simX, simY);
      entry.group.position.set(toWorldX(simX), gy + Math.sin(animTimeSec * 2.4 + idx) * 0.025, toWorldZ(simY));
      entry.group.rotation.y = -Math.PI * 0.45;

      let bubble = entry.group.userData.bubbleSprite as THREE.Sprite | undefined;
      if (!bubble) {
        const spMat = new THREE.SpriteMaterial({
          map: this.getThoughtTexture(statusText),
          transparent: true,
          depthTest: false,
        });
        bubble = new THREE.Sprite(spMat);
        bubble.position.set(0, 2.05, 0);
        bubble.scale.set(2.3, 0.58, 1);
        entry.group.add(bubble);
        entry.group.userData.bubbleSprite = bubble;
        entry.lastStatus = statusText;
      } else if (entry.lastStatus !== statusText) {
        bubble.material.map = this.getThoughtTexture(statusText);
        bubble.material.needsUpdate = true;
        entry.lastStatus = statusText;
      }
      bubble.position.y = 2.05 + Math.sin(animTimeSec * 2.6) * 0.05;
    });

    for (const [id, entry] of this.gateTravelerCache.entries()) {
      if (!activeIds.has(id)) {
        this.gateTravelersGroup.remove(entry.group);
        disposeGroupGeometries(entry.group);
        this.gateTravelerCache.delete(id);
      }
    }
  }

  private syncAnimalsAndBoats(world: WorldState, animTimeSec: number, dt: number) {
    const yawAlpha = 1 - Math.exp(-9.5 * dt);
    const weightAlpha = 1 - Math.exp(-10 * dt);
    const heightAlpha = 1 - Math.exp(-16 * dt);

    // Livestock
    const activeStock = new Set<string>();
    for (const l of world.livestock) {
      activeStock.add(l.id);
      let entry = this.livestockCache.get(l.id);
      const wx = toWorldX(l.x);
      const wz = toWorldZ(l.y);
      if (!entry) {
        const group = createLivestockGroup(l);
        this.livestockGroup.add(group);
        entry = {
          group,
          prevX: wx,
          prevY: wz,
          yaw: 0,
          phase: (this.livestockCache.size * 1.1) % (Math.PI * 2),
          moveWeight: 0,
          gy: groundHeightAtSim(l.x, l.y),
        };
        this.livestockCache.set(l.id, entry);
      }
      const dx = wx - entry.prevX;
      const dz = wz - entry.prevY;
      entry.prevX = wx;
      entry.prevY = wz;
      const stepDist = Math.hypot(dx, dz);
      const moving = stepDist / Math.max(0.008, dt) > 0.08;
      entry.moveWeight += ((moving ? 1 : 0) - entry.moveWeight) * weightAlpha;
      if (moving) entry.phase += Math.min(0.8, stepDist * 6.0);
      entry.yaw = dampAngle(entry.yaw, stepDist > 0.002 ? Math.atan2(-dz, dx) : l.facing >= 0 ? 0 : Math.PI, yawAlpha);
      entry.gy += (groundHeightAtSim(l.x, l.y) - entry.gy) * heightAlpha;

      const bob = Math.abs(Math.sin(entry.phase)) * 0.06 * entry.moveWeight;
      entry.group.position.set(wx, entry.gy + bob, wz);
      entry.group.rotation.y = entry.yaw;

      // Articulate animal legs and head
      const g = entry.group;
      const legFL = g.userData.legFL as THREE.Object3D | undefined;
      const legFR = g.userData.legFR as THREE.Object3D | undefined;
      const legBL = g.userData.legBL as THREE.Object3D | undefined;
      const legBR = g.userData.legBR as THREE.Object3D | undefined;
      const headGroup = g.userData.headGroup as THREE.Object3D | undefined;

      const trot = Math.sin(entry.phase) * 0.55 * entry.moveWeight;
      if (legFL) legFL.rotation.z = trot;
      if (legBR) legBR.rotation.z = trot;
      if (legFR) legFR.rotation.z = -trot;
      if (legBL) legBL.rotation.z = -trot;
      if (headGroup) {
        // Pitch head forward/down to graze when stationary (+x is animal forward, so negative Z pitches down)
        headGroup.rotation.z = moving
          ? Math.sin(entry.phase) * 0.08
          : -0.35 + Math.sin(animTimeSec * 2.2 + l.x * 0.1) * 0.16;
      }
    }
    for (const [id, entry] of this.livestockCache.entries()) {
      if (!activeStock.has(id)) {
        this.livestockGroup.remove(entry.group);
        disposeGroupGeometries(entry.group);
        this.livestockCache.delete(id);
      }
    }

    // Wild Herds (articulated leg trots, rabbit bounds, grazing/drinking dips, resting tucks, boar charges)
    const activeHerds = new Set<string>();
    for (const h of world.wildHerds) {
      activeHerds.add(h.id);
      let entry = this.wildHerdCache.get(h.id);
      const wx = toWorldX(h.x);
      const wz = toWorldZ(h.y);
      if (!entry) {
        const group = createWildHerdGroup(h);
        this.wildHerdsGroup.add(group);
        entry = {
          group,
          prevX: wx,
          prevY: wz,
          yaw: 0,
          phase: (this.wildHerdCache.size * 1.4) % (Math.PI * 2),
          moveWeight: 0,
          gy: groundHeightAtSim(h.x, h.y),
        };
        this.wildHerdCache.set(h.id, entry);
      }
      const dx = wx - entry.prevX;
      const dz = wz - entry.prevY;
      entry.prevX = wx;
      entry.prevY = wz;
      const stepDist = Math.hypot(dx, dz);
      const moving = stepDist / Math.max(0.008, dt) > 0.08;
      entry.moveWeight += ((moving ? 1 : 0) - entry.moveWeight) * weightAlpha;
      const paceMult = h.behaviorState === 'fleeing' || h.behaviorState === 'fighting' ? 1.45 : 1.0;
      if (moving) entry.phase += Math.min(0.95, stepDist * 6.5 * paceMult);
      entry.yaw = dampAngle(entry.yaw, stepDist > 0.002 ? Math.atan2(-dz, dx) : h.facing >= 0 ? 0 : Math.PI, yawAlpha);
      entry.gy += (groundHeightAtSim(h.x, h.y) - entry.gy) * heightAlpha;

      const isResting = h.behaviorState === 'resting' && !moving;
      const isGrazing = (h.behaviorState === 'grazing' || h.behaviorState === 'drinking') && !moving;
      const isFighting = h.behaviorState === 'fighting';
      const isMating = h.behaviorState === 'mating';

      let hopY = 0;
      if (h.kind === 'rabbit') {
        hopY = Math.max(0, Math.sin(entry.phase)) * (h.behaviorState === 'fleeing' ? 0.24 : 0.16) * entry.moveWeight;
        if (isMating && !moving) hopY += Math.max(0, Math.sin(animTimeSec * 6.5 + h.x)) * 0.09;
      } else {
        hopY = Math.abs(Math.sin(entry.phase)) * 0.055 * entry.moveWeight;
      }
      const restDrop = isResting ? (h.kind === 'deer' ? -0.18 : -0.09) : 0;
      entry.group.position.set(wx, entry.gy + hopY + restDrop, wz);
      entry.group.rotation.y = entry.yaw;

      const g = entry.group;
      const bodyWrap = g.userData.bodyWrap as THREE.Object3D | undefined;
      const headGroup = g.userData.headGroup as THREE.Object3D | undefined;
      const legFL = g.userData.legFL as THREE.Object3D | undefined;
      const legFR = g.userData.legFR as THREE.Object3D | undefined;
      const legBL = g.userData.legBL as THREE.Object3D | undefined;
      const legBR = g.userData.legBR as THREE.Object3D | undefined;
      const earL = g.userData.earL as THREE.Object3D | undefined;
      const earR = g.userData.earR as THREE.Object3D | undefined;
      const tail = g.userData.tail as THREE.Object3D | undefined;

      if (h.kind === 'rabbit') {
        const bound = Math.sin(entry.phase) * entry.moveWeight;
        if (bodyWrap) bodyWrap.rotation.z = bound * 0.22;
        if (legFL) legFL.rotation.z = bound * 0.72;
        if (legFR) legFR.rotation.z = bound * 0.72;
        if (legBL) legBL.rotation.z = -bound * 0.85;
        if (legBR) legBR.rotation.z = -bound * 0.85;
        if (earL && earR) {
          const earTwitch = Math.sin(animTimeSec * 5.2 + h.y) * 0.18;
          earL.rotation.z = h.behaviorState === 'fleeing' ? 0.45 : -0.1 + earTwitch;
          earR.rotation.z = h.behaviorState === 'fleeing' ? 0.45 : -0.1 - earTwitch * 0.7;
        }
      } else {
        const trot = Math.sin(entry.phase) * (h.behaviorState === 'fleeing' ? 0.72 : 0.56) * entry.moveWeight;
        if (legFL) legFL.rotation.z = isResting ? 0.75 : trot;
        if (legBR) legBR.rotation.z = isResting ? -0.75 : trot;
        if (legFR) legFR.rotation.z = isResting ? 0.75 : -trot;
        if (legBL) legBL.rotation.z = isResting ? -0.75 : -trot;
        if (bodyWrap) {
          bodyWrap.rotation.z = isFighting ? Math.sin(animTimeSec * 9.5) * 0.14 : 0;
          bodyWrap.position.x = isFighting ? Math.max(0, Math.sin(animTimeSec * 9.5)) * 0.14 : 0;
        }
      }

      if (headGroup) {
        if (isGrazing) {
          headGroup.rotation.z = -0.52 + Math.sin(animTimeSec * 3.4 + h.x * 0.2) * 0.16;
          headGroup.rotation.y = Math.sin(animTimeSec * 1.4 + h.y) * 0.18;
        } else if (isFighting) {
          headGroup.rotation.z = -0.34 + Math.sin(animTimeSec * 9.5) * 0.24;
          headGroup.rotation.y = 0;
        } else if (isResting) {
          headGroup.rotation.z = -0.14;
          headGroup.rotation.y = Math.sin(animTimeSec * 1.1 + h.x) * 0.22;
        } else {
          headGroup.rotation.z = Math.sin(entry.phase) * 0.08 * entry.moveWeight + Math.sin(animTimeSec * 2 + h.x) * 0.04;
          headGroup.rotation.y = !moving ? Math.sin(animTimeSec * 1.5 + h.x) * 0.25 : 0;
        }
      }

      if (tail) {
        tail.rotation.x = Math.sin(animTimeSec * (isMating ? 8.5 : 3.2) + h.y) * 0.24;
      }
    }
    for (const [id, entry] of this.wildHerdCache.entries()) {
      if (!activeHerds.has(id)) {
        this.wildHerdsGroup.remove(entry.group);
        disposeGroupGeometries(entry.group);
        this.wildHerdCache.delete(id);
      }
    }

    // Varied Fleet Boats
    const activeBoats = new Set<string>();
    for (const boat of world.boats) {
      activeBoats.add(boat.id);
      const key = `${boat.kind}_${boat.cultureId}`;
      let entry = this.boatCache.get(boat.id);
      if (!entry || entry.key !== key) {
        if (entry) {
          this.boatsGroup.remove(entry.group);
          disposeGroupGeometries(entry.group);
        }
        const group = createBoatEntityGroup(boat);
        this.boatsGroup.add(group);
        entry = { key, group };
        this.boatCache.set(boat.id, entry);
      }
      const bob = Math.sin(animTimeSec * 2.1 + boat.x * 0.05) * 0.045;
      entry.group.position.set(toWorldX(boat.x), 0.02 + bob, toWorldZ(boat.y));
      entry.group.rotation.y = boat.yaw;
      entry.group.rotation.z = Math.sin(animTimeSec * 1.6 + boat.y * 0.03) * 0.04;
    }
    for (const [id, entry] of this.boatCache.entries()) {
      if (!activeBoats.has(id)) {
        this.boatsGroup.remove(entry.group);
        disposeGroupGeometries(entry.group);
        this.boatCache.delete(id);
      }
    }

    // Island Cat
    const catWx = toWorldX(world.catX);
    const catWz = toWorldZ(world.catY);
    const cdx = catWx - this.catState.prevX;
    const cdz = catWz - this.catState.prevY;
    this.catState.prevX = catWx;
    this.catState.prevY = catWz;
    const catStepDist = Math.hypot(cdx, cdz);
    const catMoving = catStepDist / Math.max(0.008, dt) > 0.1;
    this.catState.walkWeight += ((catMoving ? 1 : 0) - this.catState.walkWeight) * weightAlpha;
    if (catMoving) this.catState.walkPhase += Math.min(0.65, catStepDist * 6.8);
    this.catState.yaw = dampAngle(
      this.catState.yaw,
      catStepDist > 0.002 ? Math.atan2(-cdz, cdx) : world.catFacing >= 0 ? 0 : Math.PI,
      yawAlpha,
    );
    this.catState.gy += (groundHeightAtSim(world.catX, world.catY) - this.catState.gy) * heightAlpha;

    const cw = this.catState.walkWeight;
    const catBob = Math.abs(Math.sin(this.catState.walkPhase)) * 0.04 * cw;
    this.catGroup.position.set(catWx, this.catState.gy + catBob, catWz);
    this.catGroup.rotation.y = this.catState.yaw;

    const trot = Math.sin(this.catState.walkPhase) * 0.52 * cw;
    const legFL = this.catGroup.userData.legFL as THREE.Object3D | undefined;
    const legFR = this.catGroup.userData.legFR as THREE.Object3D | undefined;
    const legBL = this.catGroup.userData.legBL as THREE.Object3D | undefined;
    const legBR = this.catGroup.userData.legBR as THREE.Object3D | undefined;
    if (legFL) legFL.rotation.z = trot;
    if (legBR) legBR.rotation.z = trot;
    if (legFR) legFR.rotation.z = -trot;
    if (legBL) legBL.rotation.z = -trot;

    const tail = this.catGroup.userData.tail as THREE.Object3D | undefined;
    if (tail) {
      tail.rotation.x = Math.sin(animTimeSec * 3.8) * 0.34;
    }
  }

  private syncParticles(particles: Particle[], world: WorldState) {
    let idx = 0;
    for (let i = 0; i < particles.length && idx < this.maxParticles; i++) {
      const p = particles[i];
      if (!p.active) continue;

      const ratio = Math.max(0, Math.min(1, p.life / Math.max(0.01, p.maxLife)));
      const age = Math.max(0, p.maxLife - p.life);
      const x3 = toWorldX(p.x);
      let z3 = toWorldZ(p.y);
      let y3 = groundHeightAtSim(p.x, p.y, world.bridges);

      if (p.kind === 'rain') {
        z3 = toWorldZ(p.y);
        y3 = Math.max(0.15, ratio * 22);
        this.tmpDummy.scale.set(0.08, 1.55, 0.08);
        this.tmpDummy.rotation.set(0, 0, -0.14);
      } else if (p.kind === 'snow') {
        z3 = toWorldZ(p.y);
        y3 = Math.max(0.18, ratio * 18);
        this.tmpDummy.scale.setScalar(0.55);
        this.tmpDummy.rotation.set(p.phase, p.phase * 0.7, 0);
      } else if (p.kind === 'smoke' || p.kind === 'steam') {
        y3 += (p.kind === 'smoke' ? 2.2 : 0.4) + age * 1.3;
        this.tmpDummy.scale.setScalar(Math.max(0.18, (0.45 + age * 0.4) * ratio));
        this.tmpDummy.rotation.set(0, p.phase, 0);
      } else if (p.kind === 'blood') {
        y3 += 0.9 + Math.sin(ratio * Math.PI) * 0.65;
        this.tmpDummy.scale.setScalar(0.55 * ratio);
        this.tmpDummy.rotation.set(p.phase, p.phase, 0);
      } else {
        y3 += 1.45 + age * 1.15;
        this.tmpDummy.scale.setScalar(0.7 * Math.min(1, ratio * 1.8));
        this.tmpDummy.rotation.set(0, p.phase, 0);
      }

      this.tmpDummy.position.set(x3, y3, z3);
      this.tmpDummy.updateMatrix();
      this.particleMesh.setMatrixAt(idx, this.tmpDummy.matrix);
      this.tmpColor.set(p.color || '#FFFFFF');
      this.particleMesh.setColorAt(idx, this.tmpColor);
      idx++;
    }

    this.particleMesh.count = idx;
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) {
      this.particleMesh.instanceColor.needsUpdate = true;
    }
  }

  private syncPeerMarkers(peers: RoomPlayerPresence[], world: WorldState, animTimeSec: number) {
    const activeIds = new Set<string>();
    for (const p of peers) {
      activeIds.add(p.id);
      let grp = this.peerMarkerCache.get(p.id);
      if (!grp) {
        grp = new THREE.Group();
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.9, 1.28, 24),
          new THREE.MeshBasicMaterial({ color: p.color, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.25;
        grp.add(ring);
        const beacon = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.45, 0),
          new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.85 }),
        );
        beacon.position.y = 2.6;
        grp.add(beacon);
        this.peerMarkersGroup.add(grp);
        this.peerMarkerCache.set(p.id, grp);
      }
      const gy = groundHeightAtSim(p.cursorSimX, p.cursorSimY, world.bridges);
      grp.position.set(toWorldX(p.cursorSimX), Math.max(0.2, gy), toWorldZ(p.cursorSimY));
      grp.children[0].scale.setScalar(1 + Math.sin(animTimeSec * 4) * 0.08);
      grp.children[1].rotation.y = animTimeSec * 2;
    }
    for (const [id, grp] of this.peerMarkerCache.entries()) {
      if (!activeIds.has(id)) {
        this.peerMarkersGroup.remove(grp);
        disposeGroupGeometries(grp);
        this.peerMarkerCache.delete(id);
      }
    }
  }

  private syncDebugCollisions(world: WorldState, enabled: boolean) {
    if (!enabled) {
      if (this.debugCollisionsEnabled) {
        this.debugCollisionsEnabled = false;
        this.debugCollisionsGroup.visible = false;
      }
      return;
    }
    this.debugCollisionsEnabled = true;
    this.debugCollisionsGroup.visible = true;
    while (this.debugCollisionsGroup.children.length > 0) {
      const child = this.debugCollisionsGroup.children[0];
      this.debugCollisionsGroup.remove(child);
      disposeGroupGeometries(child);
    }

    const addRing = (sx: number, sy: number, radiusSim: number, hex: number) => {
      const r3 = radiusSim * WORLD_SCALE;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(Math.max(0.25, r3 - 0.14), r3, 20),
        new THREE.MeshBasicMaterial({ color: hex, side: THREE.DoubleSide, transparent: true, opacity: 0.72 }),
      );
      ring.userData.ownMaterial = true;
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(toWorldX(sx), groundHeightAtSim(sx, sy, world.bridges) + 0.18, toWorldZ(sy));
      this.debugCollisionsGroup.add(ring);
    };

    for (const b of world.buildings) {
      addRing(b.x, b.y, 44, 0x38bdf8);
    }
    for (const n of world.wildNodes) {
      if (n.kind === 'tree' || n.kind === 'stone_boulder') addRing(n.x, n.y, 18, 0x84cc16);
    }
    for (const v of [...world.villagers, ...world.raiders]) {
      addRing(v.x, v.y, 12, v.isStranger ? 0xef4444 : 0xf59e0b);
      const wps = v.stuckState?.waypoints;
      if (wps && wps.length > 0) {
        const pts: THREE.Vector3[] = [
          new THREE.Vector3(toWorldX(v.x), groundHeightAtSim(v.x, v.y, world.bridges) + 0.34, toWorldZ(v.y)),
        ];
        for (const wp of wps) {
          pts.push(new THREE.Vector3(toWorldX(wp.x), groundHeightAtSim(wp.x, wp.y, world.bridges) + 0.34, toWorldZ(wp.y)));
        }
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({ color: v.isStranger ? 0xf87171 : 0xfef08a, transparent: true, opacity: 0.85 });
        const line = new THREE.Line(geo, mat);
        line.userData.ownMaterial = true;
        this.debugCollisionsGroup.add(line);
      }
    }
  }

  public projectSimToScreen(
    simX: number,
    simY: number,
    elevY: number,
    viewW: number,
    viewH: number,
  ): { x: number; y: number; visible: boolean } {
    this.tmpVec.set(toWorldX(simX), elevY + 0.6, toWorldZ(simY)).project(this.camera);
    const visible = this.tmpVec.z >= -1 && this.tmpVec.z <= 1;
    return {
      x: (this.tmpVec.x * 0.5 + 0.5) * viewW,
      y: (-this.tmpVec.y * 0.5 + 0.5) * viewH,
      visible,
    };
  }

  public render(
    world: WorldState,
    particles: Particle[],
    selectedVillagerId: string | null,
    hoveredVillagerId: string | null,
    viewW: number,
    viewH: number,
    cameraState: CameraState,
    animTimeSec: number,
    rawDt = 0.033,
    peers: RoomPlayerPresence[] = [],
    selectedUnitIds?: Set<string>,
    debugShowCollisions = false,
  ) {
    if (this.disposed) return;
    this.resize(viewW, viewH);

    const dt = Math.max(0.008, Math.min(0.1, rawDt));
    const { season, weather, timeOfDay, festivalActive } = world.environment;
    const wind = computeWindState(animTimeSec, weather, season);

    const atmo = sampleAtmosphere(timeOfDay, weather, season);
    const lampsLit = atmo.nightFactor > 0.25 || weather === 'rain' || festivalActive;
    const isRuinedMood = world.villageTrajectory === 'ruined' || world.villageTrajectory === 'ruin_risk';

    // Update GPU foliage & ocean uniforms
    this.foliageUniforms.uWindTime.value = animTimeSec;
    this.foliageUniforms.uWindDir.value.set(wind.dirX, wind.dirZ);
    this.foliageUniforms.uWindStrength.value = wind.gust;
    this.foliageUniforms.uCloudShadow.value = Math.max(0.25, Math.min(1, 1.38 - wind.cloudShadowFactor));

    this.waterUniforms.uWaveTime.value = animTimeSec * wind.waveSpeed;
    this.waterUniforms.uWindDir.value.set(wind.dirX, wind.dirZ);
    this.waterUniforms.uWaveAmp.value = wind.waveHeight;
    this.waterUniforms.uNightFactor.value = atmo.nightFactor;
    this.waterUniforms.uFoamTint.value.setHex(
      season === 'winter' ? 0xf1f5f9 : atmo.nightFactor > 0.5 ? 0x9ecae1 : 0xeef9ff,
    );

    if (isRuinedMood) {
      _colA.setHex(atmo.horizonHex).lerp(_colB.setHex(0x555b66), 0.35);
      (this.scene.background as THREE.Color).copy(_colA);
      this.fog.color.copy(_colA);
      this.skyMat.uniforms.uHorizon.value.copy(_colA);
      _colA.setHex(atmo.zenithHex).lerp(_colB.setHex(0x3a404c), 0.35);
      this.skyMat.uniforms.uZenith.value.copy(_colA);
      this.fog.density = weather === 'mist' ? 0.0014 : 0.00068;
    } else {
      (this.scene.background as THREE.Color).setHex(atmo.horizonHex);
      this.skyMat.uniforms.uZenith.value.setHex(atmo.zenithHex);
      this.skyMat.uniforms.uHorizon.value.setHex(atmo.horizonHex);
      this.fog.color.setHex(atmo.horizonHex);
      this.fog.density = weather === 'mist' ? 0.00125 : 0.00048;
    }

    // Focus world target (needed early so shadows, bonfire point light, and actor foliage radius stay centered)
    const clampedX = Math.max(260, Math.min(WORLD_WIDTH - 260, cameraState.x));
    const clampedY = Math.max(200, Math.min(WORLD_HEIGHT - 200, cameraState.y));
    const tx = toWorldX(clampedX);
    const tz = toWorldZ(clampedY);
    const focusElev =
      cameraState.focusIslandId !== 'all' ? ISLAND_DEFS[cameraState.focusIslandId].elevationY : 1.4;
    const ty = focusElev + 0.5;

    this.hemiLight.color.setHex(atmo.hemiSkyHex);
    this.hemiLight.groundColor.setHex(atmo.hemiGroundHex);
    this.hemiLight.intensity = atmo.hemiIntensity * (isRuinedMood ? 0.85 : 1);

    const sunPos = computeAnchoredSunPosition(tx, ty, tz, atmo.sunProgress);
    this.sunLight.position.set(sunPos.x, sunPos.y, sunPos.z);
    this.sunLight.target.position.set(tx, ty - 0.5, tz);
    this.sunLight.target.updateMatrixWorld();
    this.sunLight.color.setHex(atmo.sunHex);
    this.sunLight.intensity = atmo.sunIntensity * wind.cloudShadowFactor * (isRuinedMood ? 0.82 : 1);

    this.rimLight.color.setHex(atmo.rimHex);
    this.rimLight.intensity = 0.22 + (1 - atmo.nightFactor) * 0.12;

    // Anchor subtle warm forest sunbeams above the focused island clearing
    const weatherBeamMult = weather === 'rain' ? 0 : weather === 'mist' ? 0.55 : 1.0;
    const beamAlpha = Math.max(0, 1 - atmo.nightFactor * 1.45) * weatherBeamMult * (isRuinedMood ? 0.18 : 0.08) * wind.cloudShadowFactor;
    this.sunbeamsGroup.visible = beamAlpha > 0.01 && !this.isSoftwareGl;
    if (this.sunbeamsGroup.visible) {
      this.sunbeamsGroup.position.set(tx, ty - 0.5, tz);
      this.sunbeamMat.opacity = beamAlpha;
      this.sunbeamMat.color.setHex(atmo.sunHex);
    }

    const sunAngle = (atmo.sunProgress - 0.5) * Math.PI * 0.72;
    this.celestialOrb.position.set(Math.sin(sunAngle) * 280, 76 + Math.cos(sunAngle) * 38, -320);
    (this.celestialOrb.material as THREE.MeshBasicMaterial).color.setHex(
      atmo.nightFactor > 0.5 ? 0xeef2f7 : 0xfff3c4,
    );
    this.starsMat.opacity = Math.max(0, (atmo.nightFactor - 0.26) * 1.4);
    this.starsPoints.visible = this.starsMat.opacity > 0.02;

    // Anchor warm bonfire PointLight to the nearest active bonfire to the focused island
    let bestFireDist = Infinity;
    let bestFireX = tx;
    let bestFireY = 2.5;
    let bestFireZ = tz;
    for (let i = 0; i < world.buildings.length; i++) {
      const b = world.buildings[i];
      if (!b.unlocked || (b.type !== 'bonfire' && b.type !== 'smeltery')) continue;
      const bx = toWorldX(b.x);
      const bz = toWorldZ(b.y);
      const dSq = (bx - tx) * (bx - tx) + (bz - tz) * (bz - tz);
      if (dSq < bestFireDist) {
        bestFireDist = dSq;
        bestFireX = bx;
        bestFireY = groundHeightAtSim(b.x, b.y, world.bridges) + 1.4;
        bestFireZ = bz;
      }
    }
    if (bestFireDist < Infinity) {
      const flicker = 0.88 + Math.sin(animTimeSec * 8.5 + bestFireX) * 0.12;
      this.bonfireLight.position.set(bestFireX, bestFireY, bestFireZ);
      this.bonfireLight.intensity = 4.6 * Math.max(0.26, atmo.nightFactor) * flicker;
    } else {
      this.bonfireLight.intensity = 0;
    }

    // Wind-driven multi-wave Sky-Sea swells
    this.waterMat.color.setHex(season === 'winter' ? 0x5c96b2 : atmo.nightFactor > 0.55 ? 0x24526e : 0x3b96ba);
    const wPos = this.waterMesh.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < wPos.count; i++) {
      const wx = wPos.getX(i);
      const wz = wPos.getZ(i);
      const disp = computeWaveDisplacement(wx, wz, animTimeSec, wind);
      wPos.setY(i, this.waterBaseY[i] + disp.dy);
    }
    wPos.needsUpdate = true;
    this.waterMesh.geometry.computeVertexNormals();

    // Wind-aligned cloud drift
    this.cloudsGroup.visible = weather !== 'rain';
    if (this.cloudsGroup.visible) {
      const cloudMult = dt * (world.settings.simSpeed || 1) * wind.speed;
      for (const c of this.cloudStates) {
        c.wx += wind.dirX * c.speed * cloudMult;
        c.wz += wind.dirZ * c.speed * cloudMult;
        if (c.wx > 420) c.wx -= 840;
        else if (c.wx < -420) c.wx += 840;
        if (c.wz > 260) c.wz -= 520;
        else if (c.wz < -260) c.wz += 520;
        c.mesh.position.set(c.wx, c.y3, c.wz);
      }
    }

    // Soaring sky-bird flock animation (gently banks with wind)
    const birdSimMult = world.settings.simSpeed === 0 ? 0.2 : 1;
    for (const b of this.skyBirdStates) {
      b.angle += b.speed * dt * birdSimMult;
      const bx = b.centerX + Math.cos(b.angle) * b.radius + wind.dirX * Math.sin(animTimeSec * 0.4) * 1.1;
      const bz = b.centerZ + Math.sin(b.angle) * b.radius + wind.dirZ * Math.sin(animTimeSec * 0.4) * 1.1;
      const by = b.baseY + Math.sin(animTimeSec * 0.9 + b.phase) * 0.7;
      b.mesh.position.set(bx, by, bz);
      const tangentYaw = Math.atan2(-Math.sin(b.angle) * b.speed, Math.cos(b.angle) * b.speed);
      b.mesh.rotation.y = tangentYaw;
      b.mesh.rotation.z = b.speed > 0 ? -0.18 : 0.18;
      const flap = Math.sin(animTimeSec * 7.2 + b.phase) * 0.55;
      const wingL = b.mesh.userData.wingL as THREE.Object3D | undefined;
      const wingR = b.mesh.userData.wingR as THREE.Object3D | undefined;
      if (wingL) wingL.rotation.z = flap;
      if (wingR) wingR.rotation.z = -flap;
    }

    const worldSeed = world.worldSeed ?? 104729;
    this.ensureIslands(worldSeed, season, weather);
    this.ensureWaterAndFalls(worldSeed, season);
    this.ensureSprings(worldSeed, lampsLit);
    this.ensureLandmarks(worldSeed, season, weather);
    this.ensureScatter(worldSeed, season, weather);
    this.syncExploreRuins(world, atmo.nightFactor, animTimeSec);
    this.syncBridges(world, lampsLit);
    this.syncCableways(world, lampsLit);

    // Sync moving actors first so actorSpeedMap & foliage interactors are fresh for both instanced & node foliage
    this.syncPeople(world, selectedVillagerId, selectedUnitIds ?? new Set(), hoveredVillagerId, animTimeSec, dt);
    this.syncAnimalsAndBoats(world, animTimeSec, dt);
    packActorFoliageInteractors(
      this.foliageUniforms.uInteractors.value,
      world.villagers,
      world.livestock,
      world.wildHerds,
      { x: world.catX, y: world.catY },
      tx,
      tz,
      toWorldX,
      toWorldZ,
      this.actorSpeedMap,
    );

    this.syncWildNodes(world, wind, animTimeSec);
    this.syncPlacedSuggestions(world, animTimeSec);
    this.syncMemorials(world);
    this.syncBuildings(world, atmo.nightFactor, animTimeSec, wind);
    this.syncGliders(world, animTimeSec);
    this.syncGateTravelers(world, animTimeSec);
    this.syncProjectiles(world);
    this.syncParticles(particles, world);
    this.syncPeerMarkers(peers, world, animTimeSec);
    this.syncDebugCollisions(world, debugShowCollisions);

    const clampedZoom = Math.max(0.06, Math.min(3.2, cameraState.zoom));
    const yaw = Number.isFinite(cameraState.yaw) ? cameraState.yaw : -0.095;
    const pitch = Math.max(0.22, Math.min(1.38, Number.isFinite(cameraState.pitch) ? cameraState.pitch : 0.72));
    const orbitRadius = Math.max(5.5, 48.2 / clampedZoom);
    const horiz = orbitRadius * Math.cos(pitch);
    const vert = orbitRadius * Math.sin(pitch);

    this.tmpTarget.set(tx, ty, tz);
    this.tmpVec.set(tx + Math.sin(yaw) * horiz, ty + vert, tz + Math.cos(yaw) * horiz);
    this.camera.position.copy(this.tmpVec);
    this.camera.lookAt(this.tmpTarget);
    this.camera.updateMatrixWorld();

    if (this.composer && !this.isSoftwareGl) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  public hitTestWorld(
    localX: number,
    localY: number,
    viewW: number,
    viewH: number,
  ): WorldHitResult | null {
    if (this.disposed || viewW <= 0 || viewH <= 0) return null;
    this.pointerNdc.set((localX / viewW) * 2 - 1, -(localY / viewH) * 2 + 1);
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);

    const resolvePersonOrBuilding = (obj: THREE.Object3D | null): WorldHitResult | null => {
      let curr: THREE.Object3D | null = obj;
      while (curr) {
        if (curr.userData?.entityKind && curr.userData?.entityId) {
          if (curr.userData.entityKind === 'building') {
            return { kind: 'building', id: String(curr.userData.entityId) };
          }
          if (curr.userData.entityKind === 'raider') {
            return { kind: 'raider', id: String(curr.userData.entityId) };
          }
          if (curr.userData.entityKind === 'villager' || curr.userData.entityKind === 'clan_villager') {
            return { kind: 'villager', id: String(curr.userData.entityId) };
          }
        }
        curr = curr.parent;
      }
      return null;
    };

    const resolveAnimal = (obj: THREE.Object3D | null): WorldHitResult | null => {
      let curr: THREE.Object3D | null = obj;
      while (curr) {
        if (curr.userData?.entityKind === 'animal' && curr.userData?.animalId) {
          return {
            kind: 'animal',
            animalKind: (curr.userData.animalKind as 'livestock' | 'wild' | 'cat') ?? 'wild',
            id: String(curr.userData.animalId),
          };
        }
        curr = curr.parent;
      }
      return null;
    };

    const vHits = this.raycaster.intersectObjects(this.villagersGroup.children, true);
    for (const hit of vHits) {
      const entity = resolvePersonOrBuilding(hit.object);
      if (entity) return entity;
    }

    const aHits = this.raycaster.intersectObjects(
      [...this.livestockGroup.children, ...this.wildHerdsGroup.children, this.catGroup],
      true,
    );
    for (const hit of aHits) {
      const animal = resolveAnimal(hit.object);
      if (animal) return animal;
    }

    const bHits = this.raycaster.intersectObjects(this.buildingsGroup.children, true);
    for (const hit of bHits) {
      const entity = resolvePersonOrBuilding(hit.object);
      if (entity) return entity;
    }

    const nHits = this.raycaster.intersectObjects(this.wildNodesGroup.children, true);
    for (const hit of nHits) {
      let curr: THREE.Object3D | null = hit.object;
      while (curr) {
        if (curr.userData?.entityKind === 'wild_node' && curr.userData?.entityId) {
          return { kind: 'wild_node', id: String(curr.userData.entityId) };
        }
        curr = curr.parent;
      }
    }

    const iHits = this.raycaster.intersectObjects(this.islandsGroup.children, false);
    if (iHits.length > 0) {
      const hit = iHits[0];
      const islandId = hit.object.userData?.islandId as IslandId | undefined;
      if (islandId) {
        return {
          kind: 'island',
          id: islandId,
          simX: toSimX(hit.point.x),
          simY: toSimY(hit.point.z),
        };
      }
    }

    return null;
  }

  public dispose() {
    if (this.disposed) return;
    this.disposed = true;

    this.terrainMat.dispose();
    this.waterMesh.geometry.dispose();
    this.waterMat.dispose();
    this.fallMat.dispose();
    this.skyDome.geometry.dispose();
    this.skyMat.dispose();

    this.grassMesh.geometry.dispose();
    (this.grassMesh.material as THREE.Material).dispose();
    this.flowerStemMesh.geometry.dispose();
    (this.flowerStemMesh.material as THREE.Material).dispose();
    this.flowerBloomMesh.geometry.dispose();
    (this.flowerBloomMesh.material as THREE.Material).dispose();
    this.fernMesh.geometry.dispose();
    (this.fernMesh.material as THREE.Material).dispose();

    this.contactShadowTex.dispose();
    this.contactShadowMat.dispose();
    this.terrainDetailTex.dispose();
    this.sunbeamTex.dispose();
    this.sunbeamMat.dispose();

    disposeGroupGeometries(this.islandsGroup);
    disposeGroupGeometries(this.sunbeamsGroup);
    disposeGroupGeometries(this.waterfallsGroup);
    disposeGroupGeometries(this.springsGroup);
    disposeGroupGeometries(this.landmarksGroup);
    disposeGroupGeometries(this.exploreRuinsGroup);
    disposeGroupGeometries(this.bridgesGroup);
    disposeGroupGeometries(this.cablewaysGroup);
    disposeGroupGeometries(this.wildNodesGroup);
    disposeGroupGeometries(this.suggestionsGroup);
    disposeGroupGeometries(this.memorialsGroup);
    disposeGroupGeometries(this.buildingsGroup);
    disposeGroupGeometries(this.villagersGroup);
    disposeGroupGeometries(this.glidersGroup);
    disposeGroupGeometries(this.gateTravelersGroup);
    disposeGroupGeometries(this.livestockGroup);
    disposeGroupGeometries(this.wildHerdsGroup);
    disposeGroupGeometries(this.boatsGroup);
    disposeGroupGeometries(this.cloudsGroup);
    disposeGroupGeometries(this.skyBirdsGroup);
    disposeGroupGeometries(this.peerMarkersGroup);
    disposeGroupGeometries(this.debugCollisionsGroup);
    disposeGroupGeometries(this.catGroup);

    this.celestialOrb.geometry.dispose();
    (this.celestialOrb.material as THREE.Material).dispose();
    this.starsPoints.geometry.dispose();
    this.starsMat.dispose();
    this.projectileMesh.geometry.dispose();
    (this.projectileMesh.material as THREE.Material).dispose();
    this.particleMesh.geometry.dispose();
    (this.particleMesh.material as THREE.Material).dispose();

    for (const tex of this.thoughtTextures.values()) tex.dispose();
    this.thoughtTextures.clear();

    if (this.envRT) {
      this.envRT.dispose();
      this.envRT = null;
    }
    if (this.composer) {
      this.composer.dispose();
      this.composer = null;
    }

    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}

export { WORLD_SCALE };
