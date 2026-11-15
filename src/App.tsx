import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimalInspector, type SelectedAnimalTarget } from './components/AnimalInspector';
import { ArrivalPrompt } from './components/ArrivalPrompt';
import { BottomControlDock } from './components/BottomControlDock';
import { ClimateDrawer } from './components/ClimateDrawer';
import { DevToolsDrawer, type DevActionPayload } from './components/DevToolsDrawer';
import { NpcInspector } from './components/NpcInspector';
import { PauseModal } from './components/PauseModal';
import { RealmLedger } from './components/RealmLedger';
import { SandboxView } from './components/SandboxView';
import { TitleScreen } from './components/TitleScreen';
import { TopBar } from './components/TopBar';
import { ValleyMapDrawer } from './components/ValleyMapDrawer';
import { audioEngine } from './game/audio';
import {
  CURRENT_WORLD_VERSION,
  ISLAND_DEFS,
  ISLAND_ORDER,
  TASKS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from './game/catalog';
import { LowPolyDioramaRenderer } from './game/lowPolyRenderer';
import { groundHeightAtSim } from './game/lowPolyWorld';
import { MultiplayerClient } from './game/multiplayerClient';
import { sanitizeSyncedWorldState } from './game/multiplayerSync';
import {
  applyOfflineProgress,
  applyWorldCommand,
  canControlVillager,
  clearWorldStorage,
  createHudSnapshot,
  createInitialWorld,
  createParticlePool,
  getTaskAvailable,
  loadWorldFromStorage,
  normalizeWorldState,
  saveWorldToStorage,
  stepSimulation,
} from './game/simulation';
import { BUILDING_BLUEPRINTS } from './game/techAndCultures';
import type {
  BorderPolicy,
  BuildingType,
  CameraState,
  ChiefFocus,
  CropType,
  CultureId,
  FpsCap,
  GameMode,
  GamePhase,
  GodCommentKind,
  HudSnapshot,
  IslandId,
  LivestockKind,
  RationMode,
  RoomPlayerPresence,
  RtsOrder,
  SeasonType,
  SettingsState,
  TaskType,
  VillageResources,
  WeatherType,
  WorldCommand,
  WorldState,
} from './game/types';

export default function App() {
  const initialSaved = useMemo(() => loadWorldFromStorage(), []);
  const worldRef = useRef<WorldState>(initialSaved ?? createInitialWorld('whisper_solo'));
  const particlesRef = useRef(createParticlePool());
  const rendererRef = useRef<LowPolyDioramaRenderer | null>(null);
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const lastArrivalCountRef = useRef<number>(worldRef.current.pendingArrivals.length);
  const wasBuildingRef = useRef<boolean>(Boolean(worldRef.current.activeConstruction));

  const mpClientRef = useRef<MultiplayerClient | null>(null);
  const lastPresenceSentRef = useRef<number>(0);

  const cameraRef = useRef<CameraState>({
    x: ISLAND_DEFS.cradle.centerX,
    y: ISLAND_DEFS.cradle.centerY,
    zoom: 0.56,
    yaw: -0.095,
    pitch: 0.72,
    followVillagerId: null,
    focusIslandId: 'cradle',
  });
  const camGoalRef = useRef<{ x: number; y: number; zoom: number } | null>(null);
  const hoveredVillagerIdRef = useRef<string | null>(null);
  const dragRef = useRef<{
    active: boolean;
    moved: boolean;
    startX: number;
    startY: number;
    camStartX: number;
    camStartY: number;
  }>({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    camStartX: 0,
    camStartY: 0,
  });
  const orbitDragRef = useRef<{
    active: boolean;
    moved: boolean;
    button: number;
    startX: number;
    startY: number;
    startYaw: number;
    startPitch: number;
  }>({
    active: false,
    moved: false,
    button: 2,
    startX: 0,
    startY: 0,
    startYaw: -0.095,
    startPitch: 0.72,
  });
  const marqueeRef = useRef<{
    active: boolean;
    moved: boolean;
    startX: number;
    startY: number;
  }>({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
  });

  const initialQuery = useMemo(() => {
    if (typeof window === 'undefined') return { sandbox: false, autostart: false };
    const params = new URLSearchParams(window.location.search);
    return {
      sandbox: params.get('sandbox') === '1',
      autostart: params.get('autostart') === '1',
    };
  }, []);

  const [sandboxOpen, setSandboxOpen] = useState<boolean>(initialQuery.sandbox);
  const [phase, setPhase] = useState<GamePhase>(
    initialQuery.autostart && !initialQuery.sandbox ? 'PLAYING' : 'TITLE_MENU',
  );
  const [hasSavedVillage, setHasSavedVillage] = useState<boolean>(Boolean(initialSaved));
  const [selectedMode, setSelectedMode] = useState<GameMode>(worldRef.current.gameMode);
  const [hud, setHud] = useState<HudSnapshot>(() => createHudSnapshot(worldRef.current));
  const [settings, setSettings] = useState<SettingsState>(() => ({ ...worldRef.current.settings }));
  const [selectedVillagerId, setSelectedVillagerId] = useState<string | null>(
    worldRef.current.villagers[0]?.id ?? null,
  );
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(() =>
    worldRef.current.villagers[0]?.id ? new Set([worldRef.current.villagers[0].id]) : new Set(),
  );
  const [selectedAnimal, setSelectedAnimal] = useState<SelectedAnimalTarget | null>(null);
  const [marqueeBox, setMarqueeBox] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [boxSelectMode, setBoxSelectMode] = useState<boolean>(false);
  const [devDrawerOpen, setDevDrawerOpen] = useState<boolean>(false);
  const [debugShowCollisions, setDebugShowCollisions] = useState<boolean>(false);
  const [inspectorOpen, setInspectorOpen] = useState<boolean>(false);
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [activeDrawer, setActiveDrawer] = useState<'ledger' | 'climate' | 'map' | null>(null);
  const [placingSuggestion, setPlacingSuggestion] = useState<{
    buildingType: BuildingType;
    cropType?: CropType;
    livestockKind?: LivestockKind;
  } | null>(null);
  const [movingVillagerId, setMovingVillagerId] = useState<string | null>(null);

  // Multiplayer room state
  const [mpRoomCode, setMpRoomCode] = useState<string | null>(null);
  const [mpPlayerId, setMpPlayerId] = useState<string | null>(null);
  const [mpPlayers, setMpPlayers] = useState<RoomPlayerPresence[]>([]);
  const [mpConnecting, setMpConnecting] = useState<boolean>(false);
  const [mpError, setMpError] = useState<string | null>(null);

  const [cameraUi, setCameraUi] = useState<{
    camera: CameraState;
    bounds: { sx: number; sy: number; vw: number; vh: number };
  }>({
    camera: {
      x: ISLAND_DEFS.cradle.centerX,
      y: ISLAND_DEFS.cradle.centerY,
      zoom: 0.56,
      yaw: -0.095,
      pitch: 0.72,
      followVillagerId: null,
      focusIslandId: 'cradle',
    },
    bounds: { sx: 260, sy: 200, vw: 1200, vh: 760 },
  });
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);
  const [buildFeedback, setBuildFeedback] = useState<string | null>(null);
  const [arrivalFeedback, setArrivalFeedback] = useState<string | null>(null);
  const [offlineBanner, setOfflineBanner] = useState<string | null>(null);

  const phaseRef = useRef<GamePhase>(phase);
  phaseRef.current = phase;
  const selectedVillagerIdRef = useRef<string | null>(selectedVillagerId);
  selectedVillagerIdRef.current = selectedVillagerId;
  const selectedUnitIdsRef = useRef<Set<string>>(selectedUnitIds);
  selectedUnitIdsRef.current = selectedUnitIds;
  const debugShowCollisionsRef = useRef<boolean>(debugShowCollisions);
  debugShowCollisionsRef.current = debugShowCollisions;
  const mpRoomCodeRef = useRef<string | null>(mpRoomCode);
  mpRoomCodeRef.current = mpRoomCode;
  const mpPlayerIdRef = useRef<string | null>(mpPlayerId);
  mpPlayerIdRef.current = mpPlayerId;
  const mpPlayersRef = useRef<RoomPlayerPresence[]>(mpPlayers);
  mpPlayersRef.current = mpPlayers;
  const pressedKeysRef = useRef<Set<string>>(new Set());

  const isInWorld = phase !== 'TITLE_MENU' && !sandboxOpen;

  const getViewerHomeIsland = useCallback((): IslandId => {
    const me = mpPlayersRef.current.find((p) => p.id === mpPlayerIdRef.current);
    return me?.homeIslandId ?? worldRef.current.localHomeIslandId ?? 'cradle';
  }, []);

  const syncCameraUi = useCallback(() => {
    const mount = canvasMountRef.current;
    const renderer = rendererRef.current;
    const w = mount?.clientWidth || window.innerWidth || 1280;
    const h = mount?.clientHeight || window.innerHeight || 720;
    if (!renderer) return;
    const b = renderer.getCameraBounds(w, h, cameraRef.current);
    setCameraUi({
      camera: { ...cameraRef.current },
      bounds: { sx: b.sx, sy: b.sy, vw: b.vw, vh: b.vh },
    });
  }, []);

  const syncHud = useCallback(() => {
    setHud(createHudSnapshot(worldRef.current, getViewerHomeIsland()));
    setSettings({ ...worldRef.current.settings });
    syncCameraUi();
  }, [getViewerHomeIsland, syncCameraUi]);

  const showTempBanner = useCallback((msg: string) => {
    setOfflineBanner(msg);
    window.setTimeout(() => {
      setOfflineBanner((prev) => (prev === msg ? null : prev));
    }, 5200);
  }, []);

  // Unified Solo + Co-Op Multiplayer Command Dispatcher
  const dispatchCommand = useCallback(
    (cmd: WorldCommand): { ok: boolean; message: string; dispatchedRemote: boolean } => {
      if (mpRoomCodeRef.current && mpClientRef.current?.isConnected()) {
        mpClientRef.current.sendCommand(cmd);
        return { ok: true, message: 'Sent divine decree...', dispatchedRemote: true };
      }
      const res = applyWorldCommand(worldRef.current, cmd, particlesRef.current);
      syncHud();
      return { ok: res.ok, message: res.message, dispatchedRemote: false };
    },
    [syncHud],
  );

  // Offline catch-up when returning to a saved solo archipelago
  const applyCatchUpIfNeeded = useCallback(() => {
    if (mpRoomCodeRef.current) return;
    const world = worldRef.current;
    const elapsed = (Date.now() - world.lastTickTimestamp) / 1000;
    const summary = applyOfflineProgress(world, elapsed);
    world.lastTickTimestamp = Date.now();
    if (summary) {
      showTempBanner(summary);
      syncHud();
    }
  }, [showTempBanner, syncHud]);

  const resetCameraToIsland = useCallback((islandId: IslandId = 'cradle') => {
    const def = ISLAND_DEFS[islandId] ?? ISLAND_DEFS.cradle;
    cameraRef.current = {
      x: def.centerX,
      y: def.centerY,
      zoom: 0.56,
      yaw: -0.095,
      pitch: 0.72,
      followVillagerId: null,
      focusIslandId: islandId,
    };
    camGoalRef.current = null;
  }, []);

  const handleStartVillage = useCallback(() => {
    if (!hasSavedVillage && worldRef.current.gameMode !== selectedMode) {
      worldRef.current = createInitialWorld(selectedMode);
      particlesRef.current = createParticlePool();
      const firstId = worldRef.current.villagers[0]?.id ?? null;
      setSelectedVillagerId(firstId);
      setSelectedUnitIds(firstId ? new Set([firstId]) : new Set());
      setSelectedAnimal(null);
      syncHud();
    } else {
      applyCatchUpIfNeeded();
    }
    setPhase('PLAYING');
    audioEngine.syncSettings(
      worldRef.current.settings.muted,
      worldRef.current.settings.volume,
      worldRef.current.environment.weather,
    );
  }, [hasSavedVillage, selectedMode, applyCatchUpIfNeeded, syncHud]);

  const handleNewVillage = useCallback(
    (mode: GameMode) => {
      clearWorldStorage();
      const fresh = createInitialWorld(mode);
      worldRef.current = fresh;
      particlesRef.current = createParticlePool();
      resetCameraToIsland(fresh.localHomeIslandId ?? 'cradle');
      setSelectedMode(mode);
      setHasSavedVillage(false);
      const firstId = fresh.villagers.find((v) => v.homeIslandId === (fresh.localHomeIslandId ?? 'cradle'))?.id ?? fresh.villagers[0]?.id ?? null;
      setSelectedVillagerId(firstId);
      setSelectedUnitIds(firstId ? new Set([firstId]) : new Set());
      setSelectedAnimal(null);
      setBoxSelectMode(false);
      setInspectorOpen(false);
      setActiveDrawer(null);
      setPlacingSuggestion(null);
      setMovingVillagerId(null);
      setBuildFeedback(null);
      setArrivalFeedback(null);
      setStatusFeedback(null);
      syncHud();
      setPhase('PLAYING');
      audioEngine.syncSettings(fresh.settings.muted, fresh.settings.volume, fresh.environment.weather);
    },
    [resetCameraToIsland, syncHud],
  );

  const ensureMpClient = useCallback(() => {
    if (mpClientRef.current) {
      mpClientRef.current.disconnect();
    }
    const client = new MultiplayerClient({
      onJoined: (roomCode, playerId, players, world) => {
        const localSettings = worldRef.current.settings;
        const normalized = normalizeWorldState(world);
        normalized.settings.fpsCap = localSettings.fpsCap;
        normalized.settings.muted = localSettings.muted;
        normalized.settings.volume = localSettings.volume;
        worldRef.current = normalized;
        particlesRef.current = createParticlePool();
        lastArrivalCountRef.current = normalized.pendingArrivals.length;
        wasBuildingRef.current = Boolean(normalized.activeConstruction);

        mpRoomCodeRef.current = roomCode;
        mpPlayerIdRef.current = playerId;
        mpPlayersRef.current = players;

        const myHome = players.find((p) => p.id === playerId)?.homeIslandId ?? normalized.localHomeIslandId ?? 'cradle';
        const firstOwned =
          normalized.villagers.find((v) => canControlVillager(normalized, v, playerId)) ??
          normalized.villagers[0] ??
          null;

        setMpConnecting(false);
        setMpError(null);
        setMpRoomCode(roomCode);
        setMpPlayerId(playerId);
        setMpPlayers(players);
        setSelectedMode(normalized.gameMode);
        setSelectedVillagerId(firstOwned?.id ?? null);
        setSelectedUnitIds(firstOwned ? new Set([firstOwned.id]) : new Set());
        setSelectedAnimal(null);
        setInspectorOpen(false);
        setActiveDrawer(null);
        setPlacingSuggestion(null);
        setMovingVillagerId(null);
        resetCameraToIsland(myHome);
        setHud(createHudSnapshot(normalized, myHome));
        setSettings({ ...normalized.settings });
        syncCameraUi();
        setPhase('PLAYING');
        audioEngine.syncSettings(
          normalized.settings.muted,
          normalized.settings.volume,
          normalized.environment.weather,
        );
        showTempBanner(`Connected to Co-Op Room ${roomCode} — You guide ${ISLAND_DEFS[myHome]?.name ?? 'Cradle Isle'}`);
      },
      onWorldState: (world, players) => {
        worldRef.current = sanitizeSyncedWorldState(world, worldRef.current.settings);
        mpPlayersRef.current = players;
        setMpPlayers(players);
      },
      onPlayers: (players) => {
        mpPlayersRef.current = players;
        setMpPlayers(players);
      },
      onToast: (message, ok) => {
        audioEngine.playAssignChime(ok);
        showTempBanner(message);
        setStatusFeedback(message);
      },
      onError: (message) => {
        setMpConnecting(false);
        setMpError(message);
      },
      onDisconnect: () => {
        if (mpRoomCodeRef.current) {
          mpRoomCodeRef.current = null;
          mpPlayerIdRef.current = null;
          mpPlayersRef.current = [];
          setMpRoomCode(null);
          setMpPlayerId(null);
          setMpPlayers([]);
          setMpConnecting(false);
          setPhase('TITLE_MENU');
          setMpError('Disconnected from co-op room.');
        }
      },
    });
    mpClientRef.current = client;
    return client;
  }, [resetCameraToIsland, showTempBanner, syncCameraUi]);

  const handleHostMultiplayer = useCallback(
    (playerName: string, playerColor: string, mode: GameMode) => {
      setMpConnecting(true);
      setMpError(null);
      const client = ensureMpClient();
      client.createRoom(playerName, playerColor, mode);
    },
    [ensureMpClient],
  );

  const handleJoinMultiplayer = useCallback(
    (roomCode: string, playerName: string, playerColor: string) => {
      setMpConnecting(true);
      setMpError(null);
      const client = ensureMpClient();
      client.joinRoom(roomCode, playerName, playerColor);
    },
    [ensureMpClient],
  );

  const handleLeaveRoom = useCallback(() => {
    mpRoomCodeRef.current = null;
    mpPlayerIdRef.current = null;
    mpPlayersRef.current = [];
    mpClientRef.current?.disconnect();
    mpClientRef.current = null;
    setMpRoomCode(null);
    setMpPlayerId(null);
    setMpPlayers([]);
    setMpConnecting(false);
    setMpError(null);
    setMovingVillagerId(null);
    setPlacingSuggestion(null);
    const saved = loadWorldFromStorage();
    worldRef.current = saved ?? createInitialWorld(selectedMode);
    setHasSavedVillage(Boolean(saved));
    setPhase('TITLE_MENU');
    syncHud();
  }, [selectedMode, syncHud]);

  useEffect(() => {
    return () => {
      mpClientRef.current?.disconnect();
    };
  }, []);

  // Mount Three.js Low-Poly Diorama & run isolated loop with Eco FPS Throttle & hidden-tab sleep
  useEffect(() => {
    if (!isInWorld || !canvasMountRef.current) return;

    const mount = canvasMountRef.current;
    const lowPoly = new LowPolyDioramaRenderer(mount);
    rendererRef.current = lowPoly;

    let rafId = 0;
    let lastSimTime = performance.now();
    let lastRenderTime = performance.now();
    let lastHudSync = performance.now();
    let animClock = 0;

    const tick = (now: number) => {
      rafId = window.requestAnimationFrame(tick);

      if (document.visibilityState === 'hidden') {
        lastSimTime = now;
        lastRenderTime = now;
        return;
      }

      const world = worldRef.current;
      const baseFrameMs = 1000 / world.settings.fpsCap;
      const minFrameMs = lowPoly.isSoftwareGl ? Math.max(baseFrameMs, 85) : baseFrameMs;

      if (now - lastRenderTime < minFrameMs) {
        return;
      }

      const rawDt = Math.max(0, (now - lastSimTime) / 1000);
      lastSimTime = now;
      lastRenderTime = now;

      if (phaseRef.current === 'PLAYING') {
        const effectiveSpeed = mpRoomCodeRef.current
          ? 1
          : world.settings.simSpeed === 0
            ? 0
            : world.settings.simSpeed;
        const simDt = Math.min(rawDt, 0.05) * effectiveSpeed;
        animClock += simDt;

        // Solo mode runs local simulation; Multiplayer receives authoritative world ticks from server
        if (!mpRoomCodeRef.current) {
          stepSimulation(world, rawDt, particlesRef.current, true);
        }

        audioEngine.syncSettings(world.settings.muted, world.settings.volume, world.environment.weather);

        if (world.pendingArrivals.length > lastArrivalCountRef.current) {
          audioEngine.playArrivalChime();
        }
        lastArrivalCountRef.current = world.pendingArrivals.length;

        const isBuildingNow = Boolean(world.activeConstruction);
        if (wasBuildingRef.current && !isBuildingNow) {
          audioEngine.playBuildChime();
        }
        wasBuildingRef.current = isBuildingNow;

        // Continuous WASD / Arrow camera-relative panning
        const cam = cameraRef.current;
        const keys = pressedKeysRef.current;
        if (keys.size > 0) {
          const fwd = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
          const right = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
          if (fwd !== 0 || right !== 0) {
            cam.followVillagerId = null;
            camGoalRef.current = null;
            const len = Math.hypot(fwd, right) || 1;
            const nf = fwd / len;
            const nr = right / len;
            const speedScale = (keys.has('shift') ? 2 : 1) * (360 / Math.max(0.12, Math.min(1.8, cam.zoom))) * Math.min(0.05, rawDt);
            const sinY = Math.sin(cam.yaw);
            const cosY = Math.cos(cam.yaw);
            const dxSim = (-sinY * nf + cosY * nr) * speedScale;
            const dySim = (-cosY * nf - sinY * nr) * speedScale;
            cam.x = Math.max(260, Math.min(WORLD_WIDTH - 260, cam.x + dxSim));
            cam.y = Math.max(200, Math.min(WORLD_HEIGHT - 200, cam.y + dySim));
          }
        }

        // Exponential-damped camera follow & island focus glide
        if (cam.followVillagerId && !dragRef.current.active) {
          camGoalRef.current = null;
          const followed =
            world.villagers.find((v) => v.id === cam.followVillagerId) ??
            world.clanVillagers.find((v) => v.id === cam.followVillagerId);
          if (followed) {
            const alpha = 1 - Math.exp(-6.5 * rawDt);
            cam.x += (followed.x - cam.x) * alpha;
            cam.y += (followed.y - cam.y) * alpha;
            cam.focusIslandId = followed.islandId;
          } else {
            cam.followVillagerId = null;
          }
        } else if (camGoalRef.current && !dragRef.current.active) {
          const goal = camGoalRef.current;
          const alpha = 1 - Math.exp(-6.2 * rawDt);
          cam.x += (goal.x - cam.x) * alpha;
          cam.y += (goal.y - cam.y) * alpha;
          cam.zoom += (goal.zoom - cam.zoom) * alpha;
          if (
            Math.abs(goal.x - cam.x) < 1.2 &&
            Math.abs(goal.y - cam.y) < 1.2 &&
            Math.abs(goal.zoom - cam.zoom) < 0.005
          ) {
            cam.x = goal.x;
            cam.y = goal.y;
            cam.zoom = goal.zoom;
            camGoalRef.current = null;
          }
        }
      }

      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (w > 0 && h > 0) {
        const peers = mpPlayersRef.current.filter((p) => p.id !== mpPlayerIdRef.current);
        lowPoly.render(
          world,
          particlesRef.current,
          selectedVillagerIdRef.current,
          hoveredVillagerIdRef.current,
          w,
          h,
          cameraRef.current,
          animClock,
          rawDt,
          peers,
          selectedUnitIdsRef.current,
          debugShowCollisionsRef.current,
        );
      }

      // Throttled HUD sync (~250ms)
      if (now - lastHudSync >= 250) {
        lastHudSync = now;
        setHud(createHudSnapshot(world, getViewerHomeIsland()));
        syncCameraUi();
      }
    };

    rafId = window.requestAnimationFrame(tick);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        lastSimTime = performance.now();
        lastRenderTime = performance.now();
        applyCatchUpIfNeeded();
      } else if (!mpRoomCodeRef.current) {
        saveWorldToStorage(worldRef.current);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.cancelAnimationFrame(rafId);
      document.removeEventListener('visibilitychange', handleVisibility);
      lowPoly.dispose();
      rendererRef.current = null;
    };
  }, [isInWorld, applyCatchUpIfNeeded, getViewerHomeIsland, syncCameraUi]);

  // Periodic auto-save every 5s + beforeunload (solo mode only)
  useEffect(() => {
    if (phase === 'TITLE_MENU' || mpRoomCode) return;
    const id = window.setInterval(() => {
      saveWorldToStorage(worldRef.current);
      setHasSavedVillage(true);
    }, 5000);
    const onUnload = () => saveWorldToStorage(worldRef.current);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [phase, mpRoomCode]);

  // Action Handlers
  const handleFocusIsland = useCallback(
    (target: IslandId | 'all') => {
      cameraRef.current.followVillagerId = null;
      cameraRef.current.focusIslandId = target;
      if (target === 'all') {
        camGoalRef.current = { x: WORLD_WIDTH * 0.5, y: WORLD_HEIGHT * 0.5, zoom: 0.1 };
      } else {
        const def = ISLAND_DEFS[target];
        camGoalRef.current = { x: def.centerX, y: def.centerY, zoom: 0.56 };
      }
      if (mpRoomCodeRef.current && mpClientRef.current?.isConnected()) {
        mpClientRef.current.sendPresence(target, cameraRef.current.x, cameraRef.current.y);
      }
      syncCameraUi();
    },
    [syncCameraUi],
  );

  const handleSelectVillager = useCallback(
    (id: string, openDrawer = true, additive = false) => {
      setSelectedAnimal(null);
      setMovingVillagerId(null);
      if (additive) {
        setSelectedUnitIds((prev) => {
          const next = new Set(prev);
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }
          const primary = next.has(id) ? id : (Array.from(next)[0] ?? null);
          setSelectedVillagerId(primary);
          return next;
        });
      } else {
        setSelectedVillagerId(id);
        setSelectedUnitIds(new Set([id]));
      }
      if (openDrawer) {
        setInspectorOpen(true);
        setDevDrawerOpen(false);
        if (activeDrawer === 'climate') setActiveDrawer(null);
      }
      setStatusFeedback(null);
    },
    [activeDrawer],
  );

  const handleFocusVillager = useCallback((id: string) => {
    const world = worldRef.current;
    const v =
      world.villagers.find((item) => item.id === id) ??
      world.clanVillagers.find((item) => item.id === id);
    if (!v) return;
    camGoalRef.current = null;
    cameraRef.current.followVillagerId = v.id;
    cameraRef.current.focusIslandId = v.islandId;
    cameraRef.current.x = v.x;
    cameraRef.current.y = v.y;
    if (cameraRef.current.zoom < 0.55) {
      cameraRef.current.zoom = 0.72;
    }
    setSelectedAnimal(null);
    setSelectedVillagerId(v.id);
    setSelectedUnitIds(new Set([v.id]));
    setInspectorOpen(true);
  }, []);

  const handleCycleVillager = useCallback(
    (dir: 1 | -1) => {
      const world = worldRef.current;
      const owned = world.villagers.filter((v) => canControlVillager(world, v, mpPlayerIdRef.current ?? undefined));
      const list = owned.length > 0 ? owned : world.villagers.length > 0 ? world.villagers : world.clanVillagers;
      if (list.length === 0) return;
      const idx = list.findIndex((v) => v.id === selectedVillagerId);
      const nextIdx = idx === -1 ? 0 : (idx + dir + list.length) % list.length;
      setSelectedVillagerId(list[nextIdx].id);
      setMovingVillagerId(null);
      setStatusFeedback(null);
    },
    [selectedVillagerId],
  );

  const handleChatSelected = useCallback(() => {
    const id = selectedVillagerId ?? worldRef.current.villagers[0]?.id;
    if (!id) return;
    const res = dispatchCommand({ kind: 'chat_villager', villagerId: id });
    if (res.ok) {
      audioEngine.playChatChime();
      setInspectorOpen(true);
      if (activeDrawer === 'climate') setActiveDrawer(null);
    }
  }, [selectedVillagerId, activeDrawer, dispatchCommand]);

  const handleCommentSelected = useCallback(
    (kind: GodCommentKind) => {
      const id = selectedVillagerId ?? worldRef.current.villagers[0]?.id;
      if (!id) return;
      const res = dispatchCommand({ kind: 'god_comment', villagerId: id, comment: kind });
      if (!res.dispatchedRemote) {
        if (res.ok) {
          if (kind === 'praise' || kind === 'encourage_explore') audioEngine.playPetChime();
          else audioEngine.playFeedChime();
        } else {
          audioEngine.playAssignChime(false);
        }
        setStatusFeedback(res.message);
      }
    },
    [selectedVillagerId, dispatchCommand],
  );

  const handleHangOut = useCallback(
    (targetId: string) => {
      const id = selectedVillagerId ?? worldRef.current.villagers[0]?.id;
      if (!id) return;
      const res = dispatchCommand({ kind: 'hang_out', villagerId: id, targetId });
      if (!res.dispatchedRemote) {
        audioEngine.playAssignChime(true);
        setStatusFeedback(res.message);
      }
    },
    [selectedVillagerId, dispatchCommand],
  );

  const handleSuggestTask = useCallback(
    (task: TaskType | null) => {
      const id = selectedVillagerId ?? worldRef.current.villagers[0]?.id;
      if (!id) return;
      const res = dispatchCommand({ kind: 'assign_task', villagerId: id, task });
      if (!res.dispatchedRemote) {
        audioEngine.playAssignChime(res.ok);
        setStatusFeedback(res.message);
      }
    },
    [selectedVillagerId, dispatchCommand],
  );

  const handleSuggestChief = useCallback(() => {
    const id = selectedVillagerId;
    if (!id) return;
    const res = dispatchCommand({ kind: 'set_chief', villagerId: id });
    if (!res.dispatchedRemote) {
      if (res.ok) audioEngine.playChiefFanfare();
      setStatusFeedback(res.message);
    }
  }, [selectedVillagerId, dispatchCommand]);

  const handleChangeChiefFocus = useCallback(
    (focus: ChiefFocus) => {
      const res = dispatchCommand({ kind: 'set_chief_focus', focus });
      if (!res.dispatchedRemote) {
        audioEngine.playAssignChime(true);
      }
    },
    [dispatchCommand],
  );

  const handleUpliftVillager = useCallback(() => {
    const id = selectedVillagerId;
    if (!id) return;
    const res = dispatchCommand({ kind: 'sovereign_uplift_villager', villagerId: id });
    if (!res.dispatchedRemote) {
      audioEngine.playPetChime();
      setStatusFeedback(res.message);
    }
  }, [selectedVillagerId, dispatchCommand]);

  const handleRtsOrderUnits = useCallback(
    (villagerIds: string[], order: RtsOrder | null) => {
      if (villagerIds.length === 0) return;
      const res = dispatchCommand({ kind: 'rts_order_units', villagerIds, order });
      if (!res.dispatchedRemote) {
        audioEngine.playAssignChime(res.ok);
        showTempBanner(res.message);
        setStatusFeedback(res.message);
      }
    },
    [dispatchCommand, showTempBanner],
  );

  const handleToggleDraft = useCallback(
    (villagerIds: string[], drafted?: boolean) => {
      if (villagerIds.length === 0) return;
      const res = dispatchCommand({ kind: 'sovereign_draft_toggle', villagerIds, drafted });
      if (!res.dispatchedRemote) {
        audioEngine.playAssignChime(res.ok);
        showTempBanner(res.message);
        setStatusFeedback(res.message);
      }
    },
    [dispatchCommand, showTempBanner],
  );

  const handleDevAction = useCallback(
    (payload: DevActionPayload) => {
      const res = dispatchCommand({ kind: 'dev_action', ...payload });
      if (!res.dispatchedRemote) {
        audioEngine.playAssignChime(res.ok);
        showTempBanner(res.message);
      }
    },
    [dispatchCommand, showTempBanner],
  );

  const handleRotateCamera = useCallback(
    (deltaYaw: number) => {
      cameraRef.current.yaw += deltaYaw;
      syncCameraUi();
    },
    [syncCameraUi],
  );

  const handleResetCameraYaw = useCallback(() => {
    cameraRef.current.yaw = -0.095;
    cameraRef.current.pitch = 0.72;
    syncCameraUi();
  }, [syncCameraUi]);

  const handleZoomCamera = useCallback(
    (factor: number) => {
      camGoalRef.current = null;
      const nextZoom = Math.max(
        0.06,
        Math.min(3.2, Number((cameraRef.current.zoom * factor).toFixed(3))),
      );
      cameraRef.current.zoom = nextZoom;
      if (nextZoom <= 0.25) {
        cameraRef.current.focusIslandId = 'all';
      }
      syncCameraUi();
    },
    [syncCameraUi],
  );

  const handleSetVillagePolicy = useCallback(
    (islandId: IslandId, rationMode?: RationMode, borderPolicy?: BorderPolicy) => {
      const res = dispatchCommand({ kind: 'set_village_policy', islandId, rationMode, borderPolicy });
      if (!res.dispatchedRemote) {
        audioEngine.playAssignChime(res.ok);
        setBuildFeedback(res.message);
      }
    },
    [dispatchCommand],
  );

  const handleSendCaravan = useCallback(
    (
      fromIslandId: IslandId,
      toIslandId: IslandId,
      resource: keyof VillageResources,
      amount: number,
    ) => {
      const res = dispatchCommand({ kind: 'send_caravan', fromIslandId, toIslandId, resource, amount });
      if (!res.dispatchedRemote) {
        audioEngine.playAssignChime(res.ok);
        setBuildFeedback(res.message);
        showTempBanner(res.message);
      }
    },
    [dispatchCommand, showTempBanner],
  );

  const handleStartPlaceSuggestion = useCallback(
    (buildingType: BuildingType, cropType?: CropType, livestockKind?: LivestockKind) => {
      setMovingVillagerId(null);
      setPlacingSuggestion({ buildingType, cropType, livestockKind });
      setActiveDrawer(null);
      setBuildFeedback(null);
    },
    [],
  );

  const handleSuggestUpgrade = useCallback(
    (buildingId: string) => {
      const res = dispatchCommand({ kind: 'upgrade_building', buildingId });
      if (!res.dispatchedRemote) {
        audioEngine.playAssignChime(res.ok);
        setBuildFeedback(res.message);
        setArrivalFeedback(null);
      }
    },
    [dispatchCommand],
  );

  const handleSuggestTech = useCallback(
    (techId: string) => {
      const res = dispatchCommand({ kind: 'select_tech', techId });
      if (!res.dispatchedRemote) {
        audioEngine.playAssignChime(res.ok);
        setBuildFeedback(res.message);
      }
    },
    [dispatchCommand],
  );

  const handleSuggestDiplomacy = useCallback(
    (cultureId: CultureId, action: 'envoy' | 'gift') => {
      const res = dispatchCommand({ kind: 'diplomacy', cultureId, action });
      if (!res.dispatchedRemote) {
        audioEngine.playAssignChime(res.ok);
        setBuildFeedback(res.message);
      }
    },
    [dispatchCommand],
  );

  const handleAdjustDiplomacy = useCallback(
    (cultureId: CultureId, delta: number) => {
      const res = dispatchCommand({ kind: 'diplomacy', cultureId, action: 'trust_delta', delta });
      if (!res.dispatchedRemote) {
        audioEngine.playAssignChime(res.ok);
        setBuildFeedback(res.message);
      }
    },
    [dispatchCommand],
  );

  const handleCompleteBridge = useCallback(
    (bridgeId: string) => {
      const res = dispatchCommand({ kind: 'sovereign_build_bridge', bridgeId });
      if (!res.dispatchedRemote) {
        audioEngine.playBuildChime();
        setBuildFeedback(res.message);
        showTempBanner(res.message);
      }
    },
    [dispatchCommand, showTempBanner],
  );

  const handleCompleteCableway = useCallback(
    (cableId: string) => {
      const res = dispatchCommand({ kind: 'sovereign_build_cableway', cableId });
      if (!res.dispatchedRemote) {
        audioEngine.playBuildChime();
        setBuildFeedback(res.message);
        showTempBanner(res.message);
      }
    },
    [dispatchCommand, showTempBanner],
  );

  const handleSpawnVillager = useCallback(
    (islandId: IslandId) => {
      const res = dispatchCommand({ kind: 'sovereign_spawn_villager', islandId });
      if (!res.dispatchedRemote) {
        audioEngine.playArrivalChime();
        setBuildFeedback(res.message);
        showTempBanner(res.message);
      }
    },
    [dispatchCommand, showTempBanner],
  );

  const handleUnlockAllTech = useCallback(() => {
    const res = dispatchCommand({ kind: 'sovereign_unlock_all_tech' });
    if (!res.dispatchedRemote) {
      audioEngine.playChiefFanfare();
      setBuildFeedback(res.message);
      showTempBanner(res.message);
    }
  }, [dispatchCommand, showTempBanner]);

  const handleGrantResources = useCallback(() => {
    const res = dispatchCommand({ kind: 'sovereign_grant_resources' });
    if (!res.dispatchedRemote) {
      audioEngine.playBuildChime();
      showTempBanner(res.message);
    }
  }, [dispatchCommand, showTempBanner]);

  const handleSetWeather = useCallback(
    (weather: WeatherType) => {
      const res = dispatchCommand({ kind: 'sovereign_weather', weather });
      if (!res.dispatchedRemote) {
        audioEngine.playAssignChime(res.ok);
        showTempBanner(res.message);
      }
    },
    [dispatchCommand, showTempBanner],
  );

  const handleSetTimePreset = useCallback(
    (timeOfDay: number) => {
      const res = dispatchCommand({ kind: 'sovereign_time', timeOfDay });
      if (!res.dispatchedRemote) {
        audioEngine.playAssignChime(res.ok);
      }
    },
    [dispatchCommand],
  );

  const handleSetSeason = useCallback(
    (season: SeasonType) => {
      const res = dispatchCommand({ kind: 'sovereign_season', season });
      if (!res.dispatchedRemote) {
        audioEngine.playAssignChime(res.ok);
        showTempBanner(res.message);
      }
    },
    [dispatchCommand, showTempBanner],
  );

  const handleTriggerFestival = useCallback(() => {
    const res = dispatchCommand({ kind: 'sovereign_festival' });
    if (!res.dispatchedRemote) {
      audioEngine.playChiefFanfare();
      showTempBanner(res.message);
    }
  }, [dispatchCommand, showTempBanner]);

  const handleToggleMute = useCallback(() => {
    const world = worldRef.current;
    world.settings.muted = !world.settings.muted;
    audioEngine.unlockAndSetMute(world.settings.muted, world.environment.weather);
    syncHud();
  }, [syncHud]);

  const handleChangeSimSpeed = useCallback(
    (speed: 0 | 1 | 2 | 3) => {
      if (mpRoomCodeRef.current) {
        setStatusFeedback('Simulation pace is locked at 1× in multiplayer.');
        return;
      }
      dispatchCommand({ kind: 'set_speed', speed });
    },
    [dispatchCommand],
  );

  const handleSuggestGate = useCallback(
    (arrivalId: string, lean: 'welcome' | 'decline' | 'neutral') => {
      const res = dispatchCommand({ kind: 'suggest_gate', arrivalId, lean });
      if (!res.dispatchedRemote) {
        audioEngine.playAssignChime(res.ok);
        setArrivalFeedback(res.message);
      }
    },
    [dispatchCommand],
  );

  const handleLetVillagerDecide = useCallback(
    (arrivalId: string) => {
      const res = dispatchCommand({ kind: 'resolve_arrival', arrivalId });
      if (!res.dispatchedRemote) {
        if (res.ok) {
          audioEngine.playChatChime();
          setArrivalFeedback(null);
          showTempBanner(res.message);
        } else {
          setArrivalFeedback(res.message);
        }
      }
    },
    [dispatchCommand, showTempBanner],
  );

  const handleDirectDecideArrival = useCallback(
    (arrivalId: string, accept: boolean) => {
      const res = dispatchCommand({ kind: 'resolve_arrival', arrivalId, accept });
      if (!res.dispatchedRemote) {
        audioEngine.playAssignChime(accept);
        setArrivalFeedback(null);
        showTempBanner(res.message);
      }
    },
    [dispatchCommand, showTempBanner],
  );

  // Viewport Drag Pan, Orbit Rotation, Marquee Box Select, RTS Right-Click & 3D Raycast Hit-Testing
  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (phase !== 'PLAYING') return;
      const mount = canvasMountRef.current;
      if (!mount) return;
      const rect = mount.getBoundingClientRect();

      // Right-click or Middle-click: camera orbit (or RTS contextual order on short right-click)
      if (e.button === 2 || e.button === 1) {
        orbitDragRef.current = {
          active: true,
          moved: false,
          button: e.button,
          startX: e.clientX,
          startY: e.clientY,
          startYaw: cameraRef.current.yaw,
          startPitch: cameraRef.current.pitch,
        };
        return;
      }

      if (e.button !== 0) return;

      const world = worldRef.current;
      const isRtsMode = world.gameMode === 'sovereign_sandbox' || world.gameMode === 'shared_siege';
      if (isRtsMode && !movingVillagerId && !placingSuggestion && (boxSelectMode || e.shiftKey)) {
        marqueeRef.current = {
          active: true,
          moved: false,
          startX: e.clientX - rect.left,
          startY: e.clientY - rect.top,
        };
        setMarqueeBox(null);
        return;
      }

      dragRef.current = {
        active: true,
        moved: false,
        startX: e.clientX,
        startY: e.clientY,
        camStartX: cameraRef.current.x,
        camStartY: cameraRef.current.y,
      };
    },
    [phase, boxSelectMode, movingVillagerId, placingSuggestion],
  );

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const mount = canvasMountRef.current;
      const renderer = rendererRef.current;
      if (!mount || !renderer) return;
      const rect = mount.getBoundingClientRect();

      if (orbitDragRef.current.active && phase === 'PLAYING') {
        const dx = e.clientX - orbitDragRef.current.startX;
        const dy = e.clientY - orbitDragRef.current.startY;
        if (Math.hypot(dx, dy) > 4) {
          orbitDragRef.current.moved = true;
          cameraRef.current.yaw = orbitDragRef.current.startYaw - dx * 0.0065;
          cameraRef.current.pitch = Math.max(
            0.22,
            Math.min(1.38, orbitDragRef.current.startPitch + dy * 0.0055),
          );
          syncCameraUi();
        }
        return;
      }

      if (marqueeRef.current.active && phase === 'PLAYING') {
        const curX = e.clientX - rect.left;
        const curY = e.clientY - rect.top;
        if (Math.hypot(curX - marqueeRef.current.startX, curY - marqueeRef.current.startY) > 5) {
          marqueeRef.current.moved = true;
          setMarqueeBox({
            x1: Math.min(marqueeRef.current.startX, curX),
            y1: Math.min(marqueeRef.current.startY, curY),
            x2: Math.max(marqueeRef.current.startX, curX),
            y2: Math.max(marqueeRef.current.startY, curY),
          });
        }
        return;
      }

      if (dragRef.current.active && phase === 'PLAYING') {
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        if (Math.hypot(dx, dy) > 5) {
          dragRef.current.moved = true;
          camGoalRef.current = null;
          cameraRef.current.followVillagerId = null;
          const { pxScale } = renderer.getCameraBounds(rect.width, rect.height, cameraRef.current);
          const yaw = cameraRef.current.yaw;
          const cosY = Math.cos(yaw);
          const sinY = Math.sin(yaw);
          const moveSimX = (-dx * cosY - dy * sinY) / pxScale;
          const moveSimY = (dx * sinY - dy * cosY) / pxScale;
          cameraRef.current.x = Math.max(
            260,
            Math.min(WORLD_WIDTH - 260, dragRef.current.camStartX + moveSimX),
          );
          cameraRef.current.y = Math.max(
            200,
            Math.min(WORLD_HEIGHT - 200, dragRef.current.camStartY + moveSimY),
          );
        }
        return;
      }

      if (phase === 'PLAYING') {
        const hit = renderer.hitTestWorld(
          e.clientX - rect.left,
          e.clientY - rect.top,
          rect.width,
          rect.height,
        );
        hoveredVillagerIdRef.current = hit?.kind === 'villager' ? hit.id : null;

        if (mpRoomCodeRef.current && mpClientRef.current?.isConnected() && hit?.kind === 'island') {
          const now = performance.now();
          if (now - lastPresenceSentRef.current >= 120) {
            lastPresenceSentRef.current = now;
            mpClientRef.current.sendPresence(cameraRef.current.focusIslandId, hit.simX, hit.simY);
          }
        }

        if (placingSuggestion || movingVillagerId) {
          mount.style.cursor = hit?.kind === 'island' ? 'crosshair' : 'not-allowed';
        } else if (boxSelectMode) {
          mount.style.cursor = 'crosshair';
        } else {
          mount.style.cursor = hit ? 'pointer' : 'grab';
        }
      }
    },
    [phase, placingSuggestion, movingVillagerId, boxSelectMode, syncCameraUi],
  );

  const handleCanvasMouseUp = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const mount = canvasMountRef.current;
      const renderer = rendererRef.current;

      if (e.button === 2 || e.button === 1) {
        const wasOrbitDragged = orbitDragRef.current.moved;
        orbitDragRef.current.active = false;
        if (wasOrbitDragged || e.button !== 2 || phase !== 'PLAYING' || !mount || !renderer) return;

        if (movingVillagerId) {
          setMovingVillagerId(null);
          return;
        }
        if (placingSuggestion) {
          setPlacingSuggestion(null);
          return;
        }

        const world = worldRef.current;
        const isRtsMode = world.gameMode === 'sovereign_sandbox' || world.gameMode === 'shared_siege';
        const unitIds = Array.from(selectedUnitIdsRef.current).filter((id) => {
          const v = world.villagers.find((item) => item.id === id);
          return Boolean(v && canControlVillager(world, v, mpPlayerIdRef.current ?? undefined));
        });
        if (!isRtsMode || unitIds.length === 0) return;

        const rect = mount.getBoundingClientRect();
        const hit = renderer.hitTestWorld(
          e.clientX - rect.left,
          e.clientY - rect.top,
          rect.width,
          rect.height,
        );
        if (!hit) return;

        const firstUnit = world.villagers.find((v) => v.id === unitIds[0]);
        if (hit.kind === 'raider') {
          const r = world.raiders.find((item) => item.id === hit.id);
          handleRtsOrderUnits(unitIds, {
            kind: 'attack',
            targetId: hit.id,
            islandId: r?.islandId ?? firstUnit?.islandId ?? 'cradle',
            x: r?.x ?? firstUnit?.x ?? ISLAND_DEFS.cradle.centerX,
            y: r?.y ?? firstUnit?.y ?? ISLAND_DEFS.cradle.centerY,
          });
        } else if (hit.kind === 'animal' && hit.animalKind === 'wild') {
          const h = world.wildHerds.find((item) => item.id === hit.id);
          if (h) {
            handleRtsOrderUnits(unitIds, {
              kind: 'attack',
              targetId: h.id,
              islandId: h.islandId,
              x: h.x,
              y: h.y,
            });
          }
        } else if (hit.kind === 'wild_node') {
          const n = world.wildNodes.find((item) => item.id === hit.id);
          if (n) {
            handleRtsOrderUnits(unitIds, {
              kind: 'gather',
              targetId: n.id,
              islandId: n.islandId,
              x: n.x,
              y: n.y,
            });
          }
        } else if (hit.kind === 'building') {
          const b = world.buildings.find((item) => item.id === hit.id);
          if (b) {
            handleRtsOrderUnits(unitIds, {
              kind: b.unlocked ? 'move' : 'build',
              targetId: b.id,
              islandId: b.islandId,
              x: b.x,
              y: b.y,
            });
          }
        } else if (hit.kind === 'island') {
          handleRtsOrderUnits(unitIds, {
            kind: 'move',
            islandId: hit.id,
            x: hit.simX,
            y: hit.simY,
          });
        }
        return;
      }

      if (marqueeRef.current.active) {
        const wasMarquee = marqueeRef.current.moved;
        const startX = marqueeRef.current.startX;
        const startY = marqueeRef.current.startY;
        marqueeRef.current.active = false;
        marqueeRef.current.moved = false;
        setMarqueeBox(null);

        if (wasMarquee && mount && renderer && phase === 'PLAYING') {
          const rect = mount.getBoundingClientRect();
          const curX = e.clientX - rect.left;
          const curY = e.clientY - rect.top;
          const minX = Math.min(startX, curX);
          const maxX = Math.max(startX, curX);
          const minY = Math.min(startY, curY);
          const maxY = Math.max(startY, curY);

          const captured: string[] = [];
          for (const v of worldRef.current.villagers) {
            if (v.lifeStage === 'infant') continue;
            if (!canControlVillager(worldRef.current, v, mpPlayerIdRef.current ?? undefined)) continue;
            const elev = groundHeightAtSim(v.x, v.y, worldRef.current.bridges);
            const pt = renderer.projectSimToScreen(v.x, v.y, elev, rect.width, rect.height);
            if (pt.visible && pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY) {
              captured.push(v.id);
            }
          }

          if (captured.length > 0) {
            setSelectedAnimal(null);
            setSelectedUnitIds(new Set(captured));
            setSelectedVillagerId(captured[0]);
            setInspectorOpen(captured.length === 1);
            if (captured.length > 1) {
              showTempBanner(`Selected ${captured.length} units — Right-click to Move, Attack, Gather, or Build.`);
            }
          }
          setBoxSelectMode(false);
          return;
        }
        setBoxSelectMode(false);
      }

      const wasDragged = dragRef.current.moved;
      dragRef.current.active = false;
      if (wasDragged) return;

      if (phase !== 'PLAYING') return;
      if (!mount || !renderer) return;
      const rect = mount.getBoundingClientRect();
      const hit = renderer.hitTestWorld(
        e.clientX - rect.left,
        e.clientY - rect.top,
        rect.width,
        rect.height,
      );

      if (movingVillagerId) {
        if (hit?.kind === 'island') {
          const res = dispatchCommand({
            kind: 'move_villager',
            villagerId: movingVillagerId,
            islandId: hit.id,
            x: hit.simX,
            y: hit.simY,
          });
          if (!res.dispatchedRemote) {
            audioEngine.playAssignChime(res.ok);
            setStatusFeedback(res.message);
            showTempBanner(res.message);
          }
          if (res.ok) {
            setMovingVillagerId(null);
          }
        } else {
          showTempBanner('Click directly on an island plateau to move the villager there.');
        }
        return;
      }

      if (placingSuggestion) {
        if (hit?.kind === 'island') {
          const res = dispatchCommand({
            kind: 'place_building',
            buildingType: placingSuggestion.buildingType,
            islandId: hit.id,
            x: hit.simX,
            y: hit.simY,
            cropType: placingSuggestion.cropType,
            livestockKind: placingSuggestion.livestockKind,
          });
          if (!res.dispatchedRemote) {
            audioEngine.playAssignChime(res.ok);
            setBuildFeedback(res.message);
            showTempBanner(res.message);
          }
          if (res.ok) {
            setPlacingSuggestion(null);
          }
        } else {
          showTempBanner('Click directly on a floating island plateau to place a structure.');
        }
        return;
      }

      if (!hit) {
        setInspectorOpen(false);
        setSelectedAnimal(null);
        return;
      }
      if (hit.kind === 'animal') {
        setInspectorOpen(false);
        setDevDrawerOpen(false);
        setSelectedAnimal({ animalKind: hit.animalKind, id: hit.id });
      } else if (hit.kind === 'villager') {
        setSelectedAnimal(null);
        if (!e.shiftKey && selectedVillagerId === hit.id && inspectorOpen && selectedUnitIds.size <= 1) {
          handleCommentSelected('praise');
        } else {
          handleSelectVillager(hit.id, true, e.shiftKey);
        }
      } else if (hit.kind === 'building') {
        setSelectedAnimal(null);
        setActiveDrawer('ledger');
      }
    },
    [
      phase,
      movingVillagerId,
      placingSuggestion,
      selectedVillagerId,
      selectedUnitIds,
      inspectorOpen,
      dispatchCommand,
      handleCommentSelected,
      handleSelectVillager,
      handleRtsOrderUnits,
      showTempBanner,
    ],
  );

  const handleCanvasWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (phase !== 'PLAYING') return;
      camGoalRef.current = null;
      const factor = e.deltaY > 0 ? 0.88 : 1.14;
      const nextZoom = Math.max(
        0.06,
        Math.min(3.2, Number((cameraRef.current.zoom * factor).toFixed(3))),
      );
      cameraRef.current.zoom = nextZoom;

      if (nextZoom <= 0.25) {
        cameraRef.current.focusIslandId = 'all';
      } else if (cameraRef.current.focusIslandId === 'all') {
        let nearest: IslandId = 'cradle';
        let bestDist = Infinity;
        for (const id of ISLAND_ORDER) {
          const def = ISLAND_DEFS[id];
          const d = Math.hypot(cameraRef.current.x - def.centerX, cameraRef.current.y - def.centerY);
          if (d < bestDist) {
            bestDist = d;
            nearest = id;
          }
        }
        cameraRef.current.focusIslandId = nearest;
      }
      syncCameraUi();
    },
    [phase, syncCameraUi],
  );

  const handleJumpCamera = useCallback(
    (wx: number, wy: number) => {
      camGoalRef.current = null;
      cameraRef.current.followVillagerId = null;
      cameraRef.current.x = Math.max(260, Math.min(WORLD_WIDTH - 260, wx));
      cameraRef.current.y = Math.max(200, Math.min(WORLD_HEIGHT - 200, wy));
      syncCameraUi();
    },
    [syncCameraUi],
  );

  const handleResetCamera = useCallback(() => {
    handleFocusIsland(getViewerHomeIsland());
  }, [getViewerHomeIsland, handleFocusIsland]);

  // Keyboard Shortcuts & Smooth WASD/Arrow Camera Panning
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const lower = e.key.toLowerCase();
      if (
        phase === 'PLAYING' &&
        (lower === 'w' ||
          lower === 'a' ||
          lower === 's' ||
          lower === 'd' ||
          lower === 'arrowup' ||
          lower === 'arrowdown' ||
          lower === 'arrowleft' ||
          lower === 'arrowright' ||
          lower === 'shift')
      ) {
        pressedKeysRef.current.add(lower);
        if (lower.startsWith('arrow')) e.preventDefault();
      }

      if (tag === 'BUTTON') return;

      if (phase === 'TITLE_MENU') {
        if ((e.key === 'Enter' || e.key === ' ') && !mpConnecting) {
          e.preventDefault();
          handleStartVillage();
        }
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        if (movingVillagerId) {
          setMovingVillagerId(null);
        } else if (placingSuggestion) {
          setPlacingSuggestion(null);
        } else if (boxSelectMode) {
          setBoxSelectMode(false);
          setMarqueeBox(null);
        } else if (phase === 'PAUSED') {
          setPhase('PLAYING');
        } else if (activeDrawer || inspectorOpen || selectedAnimal || devDrawerOpen) {
          setActiveDrawer(null);
          setInspectorOpen(false);
          setSelectedAnimal(null);
          setDevDrawerOpen(false);
        } else {
          setPhase('PAUSED');
        }
        return;
      }

      if (phase !== 'PLAYING') return;

      const key = lower;
      if (e.key === ' ') {
        e.preventDefault();
        if (!mpRoomCodeRef.current) {
          handleChangeSimSpeed(worldRef.current.settings.simSpeed === 0 ? 1 : 0);
        }
        return;
      }
      if (key === 'm') {
        e.preventDefault();
        handleToggleMute();
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        handleCycleVillager(e.shiftKey ? -1 : 1);
      } else if (e.key === ']') {
        handleCycleVillager(1);
      } else if (e.key === '[') {
        handleCycleVillager(-1);
      } else if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        handleZoomCamera(1.18);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        handleZoomCamera(0.84);
      } else if (e.key === 'Home' || e.key === '0') {
        handleResetCamera();
      } else if (key === 'q') {
        handleRotateCamera(-0.24);
      } else if (key === 'e' && !e.shiftKey) {
        handleRotateCamera(0.24);
      } else if (key === 'e' && e.shiftKey) {
        handleCommentSelected('encourage_explore');
      } else if (key === 'i') {
        setInspectorOpen((v) => !v);
      } else if (key === 'h') {
        setDockCollapsed((v) => !v);
      } else if (key === 't') {
        handleChatSelected();
      } else if (key === 'p') {
        handleCommentSelected('praise');
      } else if (key === 'f') {
        handleCommentSelected('remind_eat');
      } else if (key === 'x') {
        handleSuggestTask(null);
      } else if (key === 'b' || key === 'l') {
        setActiveDrawer((d) => (d === 'ledger' ? null : 'ledger'));
      } else if (key === 'g') {
        setActiveDrawer((d) => (d === 'map' ? null : 'map'));
      } else if (key === 'c') {
        setActiveDrawer((d) => {
          const next = d === 'climate' ? null : 'climate';
          if (next === 'climate') setInspectorOpen(false);
          return next;
        });
      } else if (/^[1-9]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        const task = TASKS[idx];
        if (task) handleSuggestTask(task.id);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      pressedKeysRef.current.delete(e.key.toLowerCase());
    };

    const onBlur = () => {
      pressedKeysRef.current.clear();
      dragRef.current.active = false;
      orbitDragRef.current.active = false;
      marqueeRef.current.active = false;
      setMarqueeBox(null);
      if (!mpRoomCodeRef.current) {
        saveWorldToStorage(worldRef.current);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [
    phase,
    mpConnecting,
    activeDrawer,
    inspectorOpen,
    selectedAnimal,
    devDrawerOpen,
    boxSelectMode,
    movingVillagerId,
    placingSuggestion,
    handleStartVillage,
    handleChangeSimSpeed,
    handleToggleMute,
    handleCycleVillager,
    handleChatSelected,
    handleCommentSelected,
    handleSuggestTask,
    handleResetCamera,
    handleRotateCamera,
    handleZoomCamera,
  ]);

  const ownedVillagers = useMemo(
    () =>
      hud.villagers.filter((v) =>
        canControlVillager(worldRef.current, v, mpPlayerId ?? undefined),
      ),
    [hud.villagers, mpPlayerId],
  );

  const selectedVillager = useMemo(() => {
    const all = [...hud.villagers, ...hud.clanVillagers];
    return all.find((v) => v.id === selectedVillagerId) ?? ownedVillagers[0] ?? hud.villagers[0] ?? hud.clanVillagers[0] ?? null;
  }, [hud.villagers, hud.clanVillagers, ownedVillagers, selectedVillagerId]);

  const canControlSelected = useMemo(
    () =>
      Boolean(
        selectedVillager &&
          canControlVillager(worldRef.current, selectedVillager, mpPlayerId ?? undefined),
      ),
    [selectedVillager, mpPlayerId],
  );

  const taskAvailability = useMemo(() => {
    const map = {} as Record<TaskType, boolean>;
    for (const t of TASKS) {
      map[t.id] = getTaskAvailable(worldRef.current, t.id, hud.localHomeIslandId);
    }
    return map;
  }, [hud.buildings, hud.unlockedTechIds, hud.localHomeIslandId]);

  const peerPresences = useMemo(
    () => mpPlayers.filter((p) => p.id !== mpPlayerId),
    [mpPlayers, mpPlayerId],
  );

  if (sandboxOpen) {
    return (
      <SandboxView
        onBackToTitle={() => {
          setSandboxOpen(false);
          setPhase('TITLE_MENU');
        }}
      />
    );
  }

  if (phase === 'TITLE_MENU') {
    return (
      <TitleScreen
        hasSavedVillage={hasSavedVillage}
        savedDay={hud.environment.dayCount}
        savedPopulation={hud.populationCount}
        selectedMode={selectedMode}
        onSelectMode={setSelectedMode}
        onStart={handleStartVillage}
        onNewVillage={handleNewVillage}
        onHostMultiplayer={handleHostMultiplayer}
        onJoinMultiplayer={handleJoinMultiplayer}
        onOpenSandbox={() => setSandboxOpen(true)}
        mpConnecting={mpConnecting}
        mpError={mpError}
      />
    );
  }

  const nextArrival = hud.pendingArrivals[0] ?? null;

  return (
    <main className="relative w-full h-full overflow-hidden bg-[#161D2E]">
      {/* Full-viewport 3D Low-Poly Archipelago mount */}
      <div
        ref={canvasMountRef}
        onContextMenu={(e) => e.preventDefault()}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={() => {
          dragRef.current.active = false;
          orbitDragRef.current.active = false;
          marqueeRef.current.active = false;
          setMarqueeBox(null);
          hoveredVillagerIdRef.current = null;
        }}
        onWheel={handleCanvasWheel}
        className="block w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* RTS Marquee Selection Overlay */}
      {marqueeBox && (
        <div
          className="pointer-events-none fixed z-30 border border-[#FDE68A] bg-[#D69635]/20"
          style={{
            left: marqueeBox.x1,
            top: marqueeBox.y1,
            width: Math.max(1, marqueeBox.x2 - marqueeBox.x1),
            height: Math.max(1, marqueeBox.y2 - marqueeBox.y1),
          }}
        />
      )}

      {/* Non-occluding Game HUD overlay */}
      <div className="pointer-events-none fixed inset-0 z-20">
        <TopBar
          hud={hud}
          muted={settings.muted}
          simSpeed={settings.simSpeed}
          activeDrawer={activeDrawer}
          devToolsOpen={devDrawerOpen}
          mpRoomCode={mpRoomCode}
          mpPlayers={mpPlayers}
          onToggleDrawer={(drawer) => {
            setActiveDrawer((curr) => {
              const next = curr === drawer ? null : drawer;
              if (next === 'climate') setInspectorOpen(false);
              return next;
            });
          }}
          onToggleDevTools={() => {
            setDevDrawerOpen((open) => {
              const next = !open;
              if (next) {
                setInspectorOpen(false);
                setSelectedAnimal(null);
              }
              return next;
            });
          }}
          onChangeSimSpeed={handleChangeSimSpeed}
          onToggleMute={handleToggleMute}
          onGrantResources={handleGrantResources}
          onPause={() => setPhase('PAUSED')}
        />

        {movingVillagerId && (
          <div className="pointer-events-auto kingdom-frame fixed top-14 left-1/2 -translate-x-1/2 z-30 rounded px-3.5 py-1.5 flex items-center gap-3 text-[11px] text-[#F3EAD6]">
            <span>
              Click any island plateau to move{' '}
              <strong className="text-[#E5AF47]">
                {selectedVillager?.name.split(' ')[0] ?? 'Villager'}
              </strong>
            </span>
            <button
              type="button"
              onClick={() => setMovingVillagerId(null)}
              className="px-2 py-0.5 rounded-sm bg-[#2D3546] hover:bg-[#3A4357] text-[#E38589] font-semibold cursor-pointer"
            >
              Cancel (Esc)
            </button>
          </div>
        )}

        {placingSuggestion && !movingVillagerId && (
          <div className="pointer-events-auto kingdom-frame fixed top-14 left-1/2 -translate-x-1/2 z-30 rounded px-3.5 py-1.5 flex items-center gap-3 text-[11px] text-[#F3EAD6]">
            <span>
              Click any island plateau to {hud.gameMode === 'sovereign_sandbox' ? 'place' : 'stake'}{' '}
              <strong className="text-[#E5AF47]">
                {BUILDING_BLUEPRINTS[placingSuggestion.buildingType].name}
              </strong>
            </span>
            <button
              type="button"
              onClick={() => setPlacingSuggestion(null)}
              className="px-2 py-0.5 rounded-sm bg-[#2D3546] hover:bg-[#3A4357] text-[#E38589] font-semibold cursor-pointer"
            >
              Cancel (Esc)
            </button>
          </div>
        )}

        {offlineBanner && !placingSuggestion && !movingVillagerId && (
          <div className="pointer-events-auto kingdom-frame fixed top-14 left-1/2 -translate-x-1/2 z-30 rounded px-3.5 py-1.5 text-[11px] font-medium text-[#F3EAD6]">
            {offlineBanner}
          </div>
        )}

        {activeDrawer === 'ledger' && (
          <RealmLedger
            hud={hud}
            gameMode={hud.gameMode}
            feedback={buildFeedback}
            placingType={placingSuggestion?.buildingType ?? null}
            onStartPlaceSuggestion={handleStartPlaceSuggestion}
            onCancelPlaceSuggestion={() => setPlacingSuggestion(null)}
            onSuggestUpgrade={handleSuggestUpgrade}
            onSuggestTech={handleSuggestTech}
            onSuggestDiplomacy={handleSuggestDiplomacy}
            onAdjustDiplomacy={handleAdjustDiplomacy}
            onSetVillagePolicy={handleSetVillagePolicy}
            onSendCaravan={handleSendCaravan}
            onCompleteBridge={handleCompleteBridge}
            onCompleteCableway={handleCompleteCableway}
            onSpawnVillager={handleSpawnVillager}
            onUnlockAllTech={handleUnlockAllTech}
            onFocusIsland={(islandId) => handleFocusIsland(islandId)}
            onInspectVillager={handleFocusVillager}
            onClose={() => setActiveDrawer(null)}
          />
        )}

        {activeDrawer === 'map' && (
          <ValleyMapDrawer
            islands={hud.islands}
            bridges={hud.bridges}
            cableways={hud.cableways}
            gliders={hud.gliders}
            exploreRuins={hud.exploreRuins}
            buildings={hud.buildings}
            villagers={hud.villagers}
            clanVillagers={hud.clanVillagers}
            raiders={hud.raiders}
            boats={hud.boats}
            memorials={hud.memorials}
            peers={peerPresences}
            selectedVillagerId={selectedVillagerId}
            camera={cameraUi.camera}
            viewportBounds={cameraUi.bounds}
            onJumpTo={handleJumpCamera}
            onFocusIsland={handleFocusIsland}
            onClose={() => setActiveDrawer(null)}
          />
        )}

        {activeDrawer === 'climate' && (
          <ClimateDrawer
            environment={hud.environment}
            gameMode={hud.gameMode}
            onSetWeather={handleSetWeather}
            onSetTimePreset={handleSetTimePreset}
            onSetSeason={handleSetSeason}
            onTriggerFestival={handleTriggerFestival}
            onClose={() => setActiveDrawer(null)}
          />
        )}

        {devDrawerOpen && (
          <DevToolsDrawer
            selectedVillager={selectedVillager}
            debugShowCollisions={debugShowCollisions}
            onToggleDebugCollisions={() => setDebugShowCollisions((v) => !v)}
            onDevAction={handleDevAction}
            onClose={() => setDevDrawerOpen(false)}
          />
        )}

        {!devDrawerOpen && selectedAnimal && activeDrawer !== 'climate' && (
          <AnimalInspector
            target={selectedAnimal}
            livestock={hud.livestock}
            wildHerds={hud.wildHerds}
            catPosition={{ x: worldRef.current.catX, y: worldRef.current.catY }}
            gameMode={hud.gameMode}
            selectedRtsCount={
              Array.from(selectedUnitIds).filter((id) => hud.villagers.some((v) => v.id === id)).length
            }
            onOrderHuntAttack={(targetId, islandId, x, y) => {
              const unitIds = Array.from(selectedUnitIds).filter((id) =>
                hud.villagers.some((v) => v.id === id),
              );
              handleRtsOrderUnits(unitIds, { kind: 'attack', targetId, islandId, x, y });
            }}
            onClose={() => setSelectedAnimal(null)}
          />
        )}

        {!devDrawerOpen && !selectedAnimal && inspectorOpen && selectedVillager && activeDrawer !== 'climate' && (
          <NpcInspector
            villager={selectedVillager}
            allVillagers={[...hud.villagers, ...hud.clanVillagers]}
            gameMode={hud.gameMode}
            canControl={canControlSelected}
            chiefFocus={hud.chiefFocus}
            taskAvailability={taskAvailability}
            statusFeedback={statusFeedback}
            isMovingCommand={movingVillagerId === selectedVillager.id}
            onToggleMoveCommand={() => {
              setPlacingSuggestion(null);
              setMovingVillagerId((curr) => (curr === selectedVillager.id ? null : selectedVillager.id));
            }}
            onUpliftVillager={handleUpliftVillager}
            onToggleDraft={() => handleToggleDraft([selectedVillager.id])}
            onHoldPosition={() =>
              handleRtsOrderUnits([selectedVillager.id], {
                kind: 'hold',
                islandId: selectedVillager.islandId,
                x: selectedVillager.x,
                y: selectedVillager.y,
                holdPosition: true,
              })
            }
            onClearRtsOrder={() => handleRtsOrderUnits([selectedVillager.id], null)}
            onClose={() => {
              setInspectorOpen(false);
              setMovingVillagerId(null);
            }}
            onChat={handleChatSelected}
            onComment={handleCommentSelected}
            onHangOut={handleHangOut}
            onSuggestTask={handleSuggestTask}
            onSuggestChief={handleSuggestChief}
            onChangeChiefFocus={handleChangeChiefFocus}
          />
        )}

        <BottomControlDock
          villagers={ownedVillagers}
          totalBeds={hud.totalHousingBeds}
          homeIslandId={hud.localHomeIslandId}
          islands={hud.islands}
          focusIslandId={cameraUi.camera.focusIslandId}
          selectedVillagerId={selectedVillager?.id ?? null}
          selectedUnitIds={selectedUnitIds}
          gameMode={hud.gameMode}
          boxSelectMode={boxSelectMode}
          collapsed={dockCollapsed}
          onToggleCollapse={() => setDockCollapsed((c) => !c)}
          onFocusIsland={handleFocusIsland}
          onSelectVillager={(id, additive) => handleSelectVillager(id, true, additive)}
          onFocusVillager={handleFocusVillager}
          onChatSelected={handleChatSelected}
          onCommentSelected={handleCommentSelected}
          onToggleBoxSelect={() => setBoxSelectMode((b) => !b)}
          onDraftSelected={() => {
            const unitIds = Array.from(selectedUnitIds).filter((id) =>
              ownedVillagers.some((v) => v.id === id),
            );
            if (unitIds.length > 0) handleToggleDraft(unitIds);
          }}
          onRotateCamera={handleRotateCamera}
          onResetCameraYaw={handleResetCameraYaw}
          onZoomIn={() => handleZoomCamera(1.22)}
          onZoomOut={() => handleZoomCamera(0.82)}
        />

        {nextArrival && (
          <ArrivalPrompt
            candidate={nextArrival}
            gameMode={hud.gameMode}
            bedsFull={hud.populationCount >= hud.totalHousingBeds}
            totalBeds={hud.totalHousingBeds}
            population={hud.populationCount}
            feedback={arrivalFeedback}
            onSuggestGate={handleSuggestGate}
            onLetVillagerDecide={handleLetVillagerDecide}
            onDirectDecide={handleDirectDecideArrival}
          />
        )}
      </div>

      {phase === 'PAUSED' && (
        <PauseModal
          settings={settings}
          chronicle={hud.chronicle}
          mpRoomCode={mpRoomCode}
          onLeaveRoom={handleLeaveRoom}
          onResume={() => setPhase('PLAYING')}
          onChangeSimSpeed={(sp) => handleChangeSimSpeed(sp)}
          onChangeFpsCap={(fps: FpsCap) => {
            worldRef.current.settings.fpsCap = fps;
            syncHud();
          }}
          onExportSave={() => JSON.stringify(worldRef.current, null, 2)}
          onImportSave={(json) => {
            if (mpRoomCodeRef.current) return false;
            try {
              const parsed = JSON.parse(json) as WorldState;
              if (!parsed || parsed.version !== CURRENT_WORLD_VERSION || !Array.isArray(parsed.villagers)) {
                return false;
              }
              const normalized = normalizeWorldState(parsed);
              worldRef.current = normalized;
              saveWorldToStorage(normalized);
              setSelectedMode(normalized.gameMode);
              setSelectedVillagerId(normalized.villagers[0]?.id ?? null);
              syncHud();
              return true;
            } catch {
              return false;
            }
          }}
          onResetVillage={() => handleNewVillage(hud.gameMode)}
        />
      )}
    </main>
  );
}
