import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrivalPrompt } from './components/ArrivalPrompt';
import { BottomControlDock } from './components/BottomControlDock';
import { ClimateDrawer } from './components/ClimateDrawer';
import { NpcInspector } from './components/NpcInspector';
import { PauseModal } from './components/PauseModal';
import { RealmLedger } from './components/RealmLedger';
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
import { MultiplayerClient } from './game/multiplayerClient';
import {
  applyOfflineProgress,
  applyWorldCommand,
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
  RoomPlayerPresence,
  SeasonType,
  SettingsState,
  TaskType,
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

  const [phase, setPhase] = useState<GamePhase>('TITLE_MENU');
  const [hasSavedVillage, setHasSavedVillage] = useState<boolean>(Boolean(initialSaved));
  const [selectedMode, setSelectedMode] = useState<GameMode>(worldRef.current.gameMode);
  const [hud, setHud] = useState<HudSnapshot>(() => createHudSnapshot(worldRef.current));
  const [settings, setSettings] = useState<SettingsState>(() => ({ ...worldRef.current.settings }));
  const [selectedVillagerId, setSelectedVillagerId] = useState<string | null>(
    worldRef.current.villagers[0]?.id ?? null,
  );
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
  const mpRoomCodeRef = useRef<string | null>(mpRoomCode);
  mpRoomCodeRef.current = mpRoomCode;
  const mpPlayerIdRef = useRef<string | null>(mpPlayerId);
  mpPlayerIdRef.current = mpPlayerId;
  const mpPlayersRef = useRef<RoomPlayerPresence[]>(mpPlayers);
  mpPlayersRef.current = mpPlayers;

  const isInWorld = phase !== 'TITLE_MENU';

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
    setHud(createHudSnapshot(worldRef.current));
    setSettings({ ...worldRef.current.settings });
    syncCameraUi();
  }, [syncCameraUi]);

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

  const resetCameraToCradle = useCallback(() => {
    cameraRef.current = {
      x: ISLAND_DEFS.cradle.centerX,
      y: ISLAND_DEFS.cradle.centerY,
      zoom: 0.56,
      followVillagerId: null,
      focusIslandId: 'cradle',
    };
    camGoalRef.current = null;
  }, []);

  const handleStartVillage = useCallback(() => {
    if (!hasSavedVillage && worldRef.current.gameMode !== selectedMode) {
      worldRef.current = createInitialWorld(selectedMode);
      particlesRef.current = createParticlePool();
      setSelectedVillagerId(worldRef.current.villagers[0]?.id ?? null);
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
      resetCameraToCradle();
      setSelectedMode(mode);
      setHasSavedVillage(false);
      setSelectedVillagerId(fresh.villagers[0]?.id ?? null);
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
    [resetCameraToCradle, syncHud],
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

        setMpConnecting(false);
        setMpError(null);
        setMpRoomCode(roomCode);
        setMpPlayerId(playerId);
        setMpPlayers(players);
        setSelectedMode(normalized.gameMode);
        setSelectedVillagerId(normalized.villagers[0]?.id ?? null);
        setInspectorOpen(false);
        setActiveDrawer(null);
        setPlacingSuggestion(null);
        setMovingVillagerId(null);
        resetCameraToCradle();
        syncHud();
        setPhase('PLAYING');
        audioEngine.syncSettings(
          normalized.settings.muted,
          normalized.settings.volume,
          normalized.environment.weather,
        );
        showTempBanner(`Connected to Co-Op Room ${roomCode}`);
      },
      onWorldState: (world, players) => {
        const localSettings = worldRef.current.settings;
        world.settings.fpsCap = localSettings.fpsCap;
        world.settings.muted = localSettings.muted;
        world.settings.volume = localSettings.volume;
        worldRef.current = world;
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
  }, [resetCameraToCradle, showTempBanner, syncHud]);

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
        const simDt = Math.min(rawDt, 0.05) * (world.settings.simSpeed === 0 ? 0 : world.settings.simSpeed);
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

        // Exponential-damped camera follow & island focus glide
        const cam = cameraRef.current;
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
        );
      }

      // Throttled HUD sync (~250ms)
      if (now - lastHudSync >= 250) {
        lastHudSync = now;
        setHud(createHudSnapshot(world));
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
  }, [isInWorld, applyCatchUpIfNeeded, syncCameraUi]);

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
        camGoalRef.current = { x: WORLD_WIDTH * 0.5, y: WORLD_HEIGHT * 0.5, zoom: 0.13 };
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
    (id: string, openDrawer = true) => {
      setSelectedVillagerId(id);
      setMovingVillagerId(null);
      if (openDrawer) {
        setInspectorOpen(true);
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
    setSelectedVillagerId(v.id);
    setInspectorOpen(true);
  }, []);

  const handleCycleVillager = useCallback(
    (dir: 1 | -1) => {
      const world = worldRef.current;
      const list = world.villagers.length > 0 ? world.villagers : world.clanVillagers;
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

  // Viewport Drag Pan, Zoom & 3D Raycast Hit-Testing
  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (phase !== 'PLAYING') return;
      if (e.button !== 0) return;
      dragRef.current = {
        active: true,
        moved: false,
        startX: e.clientX,
        startY: e.clientY,
        camStartX: cameraRef.current.x,
        camStartY: cameraRef.current.y,
      };
    },
    [phase],
  );

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const mount = canvasMountRef.current;
      const renderer = rendererRef.current;
      if (!mount || !renderer) return;
      const rect = mount.getBoundingClientRect();

      if (dragRef.current.active && phase === 'PLAYING') {
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        if (Math.hypot(dx, dy) > 5) {
          dragRef.current.moved = true;
          camGoalRef.current = null;
          cameraRef.current.followVillagerId = null;
          const { pxScale } = renderer.getCameraBounds(rect.width, rect.height, cameraRef.current);
          cameraRef.current.x = Math.max(
            260,
            Math.min(WORLD_WIDTH - 260, dragRef.current.camStartX - dx / pxScale),
          );
          cameraRef.current.y = Math.max(
            200,
            Math.min(WORLD_HEIGHT - 200, dragRef.current.camStartY - dy / pxScale),
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
        } else {
          mount.style.cursor = hit ? 'pointer' : 'grab';
        }
      }
    },
    [phase, placingSuggestion, movingVillagerId],
  );

  const handleCanvasMouseUp = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const wasDragged = dragRef.current.moved;
      dragRef.current.active = false;
      if (wasDragged) return;

      if (phase !== 'PLAYING') return;
      const mount = canvasMountRef.current;
      const renderer = rendererRef.current;
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
        return;
      }
      if (hit.kind === 'villager') {
        if (selectedVillagerId === hit.id && inspectorOpen) {
          handleCommentSelected('praise');
        } else {
          handleSelectVillager(hit.id, true);
        }
      } else if (hit.kind === 'building') {
        setActiveDrawer('ledger');
      }
    },
    [
      phase,
      movingVillagerId,
      placingSuggestion,
      selectedVillagerId,
      inspectorOpen,
      dispatchCommand,
      handleCommentSelected,
      handleSelectVillager,
      showTempBanner,
    ],
  );

  const handleCanvasWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (phase !== 'PLAYING') return;
      camGoalRef.current = null;
      const step = cameraRef.current.zoom < 0.4 ? 0.04 : 0.08;
      const delta = e.deltaY > 0 ? -step : step;
      const nextZoom = Math.max(
        0.11,
        Math.min(1.55, Number((cameraRef.current.zoom + delta).toFixed(2))),
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
    handleFocusIsland('cradle');
  }, [handleFocusIsland]);

  // Keyboard Shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;

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
        } else if (phase === 'PAUSED') {
          setPhase('PLAYING');
        } else if (activeDrawer || inspectorOpen) {
          setActiveDrawer(null);
          setInspectorOpen(false);
        } else {
          setPhase('PAUSED');
        }
        return;
      }

      if (phase !== 'PLAYING') return;

      const key = e.key.toLowerCase();
      if (e.key === ' ') {
        e.preventDefault();
        handleChangeSimSpeed(worldRef.current.settings.simSpeed === 0 ? 1 : 0);
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
      } else if (e.key === 'ArrowRight') {
        handleCycleVillager(1);
      } else if (e.key === 'ArrowLeft') {
        handleCycleVillager(-1);
      } else if (e.key === 'Home' || e.key === '0') {
        handleResetCamera();
      } else if (key === 'i') {
        setInspectorOpen((v) => !v);
      } else if (key === 'h') {
        setDockCollapsed((v) => !v);
      } else if (key === 't') {
        handleChatSelected();
      } else if (key === 'p') {
        handleCommentSelected('praise');
      } else if (key === 'e') {
        handleCommentSelected('encourage_explore');
      } else if (key === 'f') {
        handleCommentSelected('remind_eat');
      } else if (key === 'a') {
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

    const onBlur = () => {
      dragRef.current.active = false;
      if (!mpRoomCodeRef.current) {
        saveWorldToStorage(worldRef.current);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('blur', onBlur);
    };
  }, [
    phase,
    mpConnecting,
    activeDrawer,
    inspectorOpen,
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
  ]);

  const selectedVillager = useMemo(() => {
    const all = [...hud.villagers, ...hud.clanVillagers];
    return all.find((v) => v.id === selectedVillagerId) ?? hud.villagers[0] ?? hud.clanVillagers[0] ?? null;
  }, [hud.villagers, hud.clanVillagers, selectedVillagerId]);

  const taskAvailability = useMemo(() => {
    const map = {} as Record<TaskType, boolean>;
    for (const t of TASKS) {
      map[t.id] = getTaskAvailable(worldRef.current, t.id);
    }
    return map;
  }, [hud.buildings, hud.unlockedTechIds]);

  const peerPresences = useMemo(
    () => mpPlayers.filter((p) => p.id !== mpPlayerId),
    [mpPlayers, mpPlayerId],
  );

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
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={() => {
          dragRef.current.active = false;
          hoveredVillagerIdRef.current = null;
        }}
        onWheel={handleCanvasWheel}
        className="block w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* Non-occluding Game HUD overlay */}
      <div className="pointer-events-none fixed inset-0 z-20">
        <TopBar
          hud={hud}
          muted={settings.muted}
          simSpeed={settings.simSpeed}
          activeDrawer={activeDrawer}
          mpRoomCode={mpRoomCode}
          mpPlayers={mpPlayers}
          onToggleDrawer={(drawer) => {
            setActiveDrawer((curr) => {
              const next = curr === drawer ? null : drawer;
              if (next === 'climate') setInspectorOpen(false);
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
            onCompleteBridge={handleCompleteBridge}
            onSpawnVillager={handleSpawnVillager}
            onUnlockAllTech={handleUnlockAllTech}
            onFocusIsland={(islandId) => handleFocusIsland(islandId)}
            onClose={() => setActiveDrawer(null)}
          />
        )}

        {activeDrawer === 'map' && (
          <ValleyMapDrawer
            islands={hud.islands}
            bridges={hud.bridges}
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

        {inspectorOpen && selectedVillager && activeDrawer !== 'climate' && (
          <NpcInspector
            villager={selectedVillager}
            allVillagers={[...hud.villagers, ...hud.clanVillagers]}
            gameMode={hud.gameMode}
            chiefFocus={hud.chiefFocus}
            taskAvailability={taskAvailability}
            statusFeedback={statusFeedback}
            isMovingCommand={movingVillagerId === selectedVillager.id}
            onToggleMoveCommand={() => {
              setPlacingSuggestion(null);
              setMovingVillagerId((curr) => (curr === selectedVillager.id ? null : selectedVillager.id));
            }}
            onUpliftVillager={handleUpliftVillager}
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
          villagers={hud.villagers}
          totalBeds={hud.totalHousingBeds}
          islands={hud.islands}
          focusIslandId={cameraUi.camera.focusIslandId}
          selectedVillagerId={selectedVillager?.id ?? null}
          collapsed={dockCollapsed}
          onToggleCollapse={() => setDockCollapsed((c) => !c)}
          onFocusIsland={handleFocusIsland}
          onSelectVillager={(id) => handleSelectVillager(id, true)}
          onFocusVillager={handleFocusVillager}
          onChatSelected={handleChatSelected}
          onCommentSelected={handleCommentSelected}
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
