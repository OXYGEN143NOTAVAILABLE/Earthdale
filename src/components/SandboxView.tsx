import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  Brain,
  Compass,
  FastForward,
  Footprints,
  Hammer,
  Package,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Settings2,
  ShieldAlert,
  StepForward,
  Trees,
  Users,
} from 'lucide-react';
import {
  KNOWLEDGE_CATEGORIES,
  RELATIONSHIP_STAGE_META,
  SANDBOX_SCENARIO_META,
  createSandboxWorld,
  defaultConfigForScenario,
  runSandboxToCompletion,
  setSandboxBridge,
  stepSandbox,
  type SandboxConfig,
  type SandboxEventCategory,
  type SandboxScenarioId,
  type SandboxWorld,
} from '../game/sandbox';

interface SandboxViewProps {
  onBackToTitle: () => void;
}

type InspectorTab = 'npc' | 'world' | 'social' | 'config';

const EVENT_CATEGORIES: { id: 'all' | SandboxEventCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'introductions', label: 'Intro' },
  { id: 'conversations', label: 'Chats' },
  { id: 'friendships', label: 'Bonds' },
  { id: 'cooperation', label: 'Co-op' },
  { id: 'conflicts', label: 'Conflict' },
  { id: 'governance', label: 'Gov' },
  { id: 'migration', label: 'Migration' },
  { id: 'construction', label: 'Build' },
  { id: 'learning', label: 'Learn' },
];

export function SandboxView({ onBackToTitle }: SandboxViewProps) {
  const initialWorld = useMemo(() => createSandboxWorld(defaultConfigForScenario('default')), []);
  const worldRef = useRef<SandboxWorld>(initialWorld);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [scenarioId, setScenarioId] = useState<SandboxScenarioId>('default');
  const [configDraft, setConfigDraft] = useState<SandboxConfig>(() => ({ ...initialWorld.config }));
  const [running, setRunning] = useState<boolean>(true);
  const [speed, setSpeed] = useState<1 | 2 | 5 | 10>(1);
  const [showPaths, setShowPaths] = useState<boolean>(true);
  const [showCollisions, setShowCollisions] = useState<boolean>(true);
  const [selectedVillagerId, setSelectedVillagerId] = useState<string>(initialWorld.villagers[0]?.id ?? '');
  const [activeTab, setActiveTab] = useState<InspectorTab>('npc');
  const [eventFilter, setEventFilter] = useState<'all' | SandboxEventCategory>('all');
  const [, setTickRevision] = useState<number>(0);

  const runningRef = useRef(running);
  runningRef.current = running;
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const showPathsRef = useRef(showPaths);
  showPathsRef.current = showPaths;
  const showCollisionsRef = useRef(showCollisions);
  showCollisionsRef.current = showCollisions;
  const selectedIdRef = useRef(selectedVillagerId);
  selectedIdRef.current = selectedVillagerId;

  const drawSandbox = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = worldRef.current;
    const cw = canvas.width;
    const ch = canvas.height;
    const sx = cw / w.width;
    const sy = ch / w.height;

    ctx.save();
    ctx.clearRect(0, 0, cw, ch);

    // 1. Flat walkable terrain grid + water depths + bridge
    const cellW = w.cellSize * sx;
    const cellH = w.cellSize * sy;
    for (let r = 0; r < w.gridRows; r++) {
      for (let c = 0; c < w.gridCols; c++) {
        const kind = w.terrainGrid[r * w.gridCols + c];
        if (kind === 'deep_water') {
          ctx.fillStyle = '#183C59';
        } else if (kind === 'shallow_water') {
          ctx.fillStyle = '#3E8299';
        } else if (kind === 'bridge') {
          ctx.fillStyle = '#9C6B3B';
        } else {
          ctx.fillStyle = (r + c) % 2 === 0 ? '#4B6745' : '#4E6B48';
        }
        ctx.fillRect(c * cellW, r * cellH, Math.ceil(cellW + 0.5), Math.ceil(cellH + 0.5));
      }
    }

    // Subtle bridge railings & water label
    if (w.config.hasBridgeOverDeepWater) {
      const bx1 = (w.pond.cx - w.pond.shallowRadiusX) * sx;
      const bx2 = (w.pond.cx + w.pond.shallowRadiusX) * sx;
      const byTop = (w.pond.bridgeY - w.pond.bridgeHalfHeight) * sy;
      const byBot = (w.pond.bridgeY + w.pond.bridgeHalfHeight) * sy;
      ctx.strokeStyle = '#E5AF47';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bx1, byTop);
      ctx.lineTo(bx2, byTop);
      ctx.moveTo(bx1, byBot);
      ctx.lineTo(bx2, byBot);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(220, 238, 250, 0.72)';
    ctx.font = '600 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('DEEP WATER', w.pond.cx * sx, (w.pond.cy - 28) * sy);

    // 2. Resource nodes with finite quantity badges
    for (const n of w.nodes) {
      const nx = n.x * sx;
      const ny = n.y * sy;
      const nr = n.radius * sx;
      const depleted = n.amount <= 0;

      ctx.save();
      ctx.globalAlpha = depleted ? 0.36 : 1;
      if (n.kind === 'stone_boulder') {
        ctx.fillStyle = depleted ? '#4D5259' : '#7B848F';
        ctx.beginPath();
        ctx.arc(nx, ny, nr, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#252B33';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else if (n.kind === 'twig') {
        ctx.strokeStyle = '#8F643E';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(nx - nr * 0.7, ny + nr * 0.3);
        ctx.lineTo(nx + nr * 0.7, ny - nr * 0.3);
        ctx.moveTo(nx - nr * 0.3, ny - nr * 0.5);
        ctx.lineTo(nx + nr * 0.4, ny + nr * 0.5);
        ctx.stroke();
      } else if (n.kind === 'berry_bush') {
        ctx.fillStyle = '#33623A';
        ctx.beginPath();
        ctx.arc(nx, ny, nr, 0, Math.PI * 2);
        ctx.fill();
        if (!depleted) {
          ctx.fillStyle = '#E05263';
          ctx.beginPath();
          ctx.arc(nx - 4, ny - 3, 2.5, 0, Math.PI * 2);
          ctx.arc(nx + 4, ny + 2, 2.5, 0, Math.PI * 2);
          ctx.arc(nx + 1, ny - 5, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // Trees (small/medium/large)
        ctx.fillStyle = '#5D3E25';
        ctx.fillRect(nx - 3, ny - 2, 6, 8);
        ctx.fillStyle = depleted ? '#46513E' : n.kind === 'large_tree' ? '#265336' : '#316842';
        ctx.beginPath();
        ctx.arc(nx, ny - 3, nr, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#183622';
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
      ctx.restore();

      ctx.fillStyle = depleted ? '#E38589' : '#FAF6EE';
      ctx.font = '600 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(depleted ? '0' : `${n.amount}`, nx, ny + nr + 11);
    }

    // 3. Buildings with visible staged construction states
    for (const b of w.buildings) {
      const bx = b.x * sx;
      const by = b.y * sy;
      const br = b.radius * sx;

      ctx.save();
      if (b.kind === 'campfire') {
        ctx.fillStyle = '#3E3631';
        ctx.beginPath();
        ctx.arc(bx, by, br * 0.72, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#F59E0B';
        ctx.beginPath();
        ctx.arc(bx, by, br * 0.42, 0, Math.PI * 2);
        ctx.fill();
      } else if (b.kind === 'stockpile') {
        ctx.fillStyle = '#755336';
        ctx.fillRect(bx - br * 0.8, by - br * 0.55, br * 1.6, br * 1.1);
        ctx.strokeStyle = '#E5AF47';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(bx - br * 0.8, by - br * 0.55, br * 1.6, br * 1.1);
      } else if (b.kind === 'dock') {
        ctx.fillStyle = '#8B623D';
        ctx.fillRect(bx - br * 0.9, by - br * 0.4, br * 1.8, br * 0.8);
        ctx.strokeStyle = '#F3EAD6';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(bx - br * 0.9, by - br * 0.4, br * 1.8, br * 0.8);
      } else {
        // Shelter / Hut / Longhouse with stage rendering
        ctx.strokeStyle = b.stage === 'complete' ? '#E5AF47' : '#A8D8EA';
        ctx.lineWidth = b.stage === 'complete' ? 2 : 1.5;
        if (b.stage === 'foundation') {
          ctx.setLineDash([4, 3]);
          ctx.strokeRect(bx - br * 0.8, by - br * 0.65, br * 1.6, br * 1.3);
        } else if (b.stage === 'framework') {
          ctx.strokeRect(bx - br * 0.8, by - br * 0.65, br * 1.6, br * 1.3);
          ctx.beginPath();
          ctx.moveTo(bx - br * 0.8, by - br * 0.65);
          ctx.lineTo(bx + br * 0.8, by + br * 0.65);
          ctx.stroke();
        } else if (b.stage === 'walls') {
          ctx.fillStyle = 'rgba(130, 96, 62, 0.72)';
          ctx.fillRect(bx - br * 0.8, by - br * 0.65, br * 1.6, br * 1.3);
          ctx.strokeRect(bx - br * 0.8, by - br * 0.65, br * 1.6, br * 1.3);
        } else {
          ctx.fillStyle = b.stage === 'complete' ? '#9E6142' : '#7D573F';
          ctx.fillRect(bx - br * 0.82, by - br * 0.65, br * 1.64, br * 1.3);
          ctx.strokeRect(bx - br * 0.82, by - br * 0.65, br * 1.64, br * 1.3);
          // Roof ridge
          ctx.strokeStyle = '#FDE68A';
          ctx.beginPath();
          ctx.moveTo(bx - br * 0.82, by);
          ctx.lineTo(bx + br * 0.82, by);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        if (b.stage !== 'complete') {
          ctx.fillStyle = '#141822';
          ctx.fillRect(bx - 22, by - br - 11, 44, 6);
          ctx.fillStyle = b.pausedForMaterials ? '#E38589' : '#8CE0AC';
          ctx.fillRect(bx - 22, by - br - 11, 44 * (b.progress / 100), 6);
        }
      }
      ctx.restore();

      ctx.fillStyle = '#F3EAD6';
      ctx.font = '500 10px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        b.stage === 'complete' ? b.name : `${b.name} (${b.stage})`,
        bx,
        by + br + 12,
      );
    }

    // 4. Boats (Scenario H)
    for (const boat of w.boats) {
      const bx = boat.x * sx;
      const by = boat.y * sy;
      ctx.save();
      ctx.fillStyle = '#A97748';
      ctx.strokeStyle = '#FDE68A';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(bx - 16, by);
      ctx.lineTo(bx + 16, by - 7);
      ctx.lineTo(bx + 16, by + 7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#FAF6EE';
      ctx.font = '600 9.5px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${boat.name} (${boat.state})`, bx, by - 12);
      ctx.restore();
    }

    // 5. Animals
    for (const a of w.animals) {
      const ax = a.x * sx;
      const ay = a.y * sy;
      const ar = Math.max(4, a.radius * sx);
      ctx.save();
      ctx.fillStyle =
        a.species === 'boar'
          ? '#6E473B'
          : a.species === 'deer'
            ? '#B6804E'
            : a.species === 'sheep'
              ? '#EDE6DA'
              : '#C9B29A';
      ctx.beginPath();
      ctx.arc(ax, ay, ar, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1D222D';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = '#DCE6F5';
      ctx.font = '500 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${a.species[0].toUpperCase()}:${a.state}`, ax, ay - ar - 4);
      ctx.restore();
    }

    // 6. Villagers + optional A* paths & collision rings
    for (const v of w.villagers) {
      const vx = v.x * sx;
      const vy = v.y * sy;
      const vr = v.radius * sx;
      const isSelected = v.id === selectedIdRef.current;

      if (showPathsRef.current && v.path.length > 0 && !v.banished) {
        ctx.save();
        ctx.strokeStyle = isSelected ? '#FDE68A' : 'rgba(253, 230, 138, 0.35)';
        ctx.lineWidth = isSelected ? 2 : 1.1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(vx, vy);
        for (const wp of v.path) {
          ctx.lineTo(wp.x * sx, wp.y * sy);
        }
        ctx.stroke();
        ctx.restore();
      }

      if (showCollisionsRef.current) {
        ctx.save();
        ctx.strokeStyle =
          v.collision.stuckTimer > 0.3
            ? '#EF4444'
            : v.collision.blockedBy
              ? '#F59E0B'
              : 'rgba(140, 224, 172, 0.45)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(vx, vy, vr + 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      if (isSelected) {
        ctx.save();
        ctx.strokeStyle = '#FDE047';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(vx, vy, vr + 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      ctx.save();
      ctx.globalAlpha = v.banished ? 0.55 : 1;
      ctx.fillStyle = v.cloakColor;
      ctx.beginPath();
      ctx.arc(vx, vy, vr, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#181C26';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      // Head dot
      ctx.fillStyle = '#F5D6BA';
      ctx.beginPath();
      ctx.arc(vx + v.facing * 2, vy - 2, vr * 0.42, 0, Math.PI * 2);
      ctx.fill();

      // Inventory pack indicator
      const packCount = v.inventory.wood + v.inventory.stone + v.inventory.food;
      if (packCount > 0) {
        ctx.fillStyle = '#E5AF47';
        ctx.fillRect(vx - 6, vy - vr - 7, 12, 4);
      }
      ctx.restore();

      const labelText = isSelected
        ? `${v.name.split(' ')[0]} · ${v.banished ? 'banished' : v.activity}`
        : v.name.split(' ')[0];
      ctx.font = '600 10px "Plus Jakarta Sans", sans-serif';
      const tw = ctx.measureText(labelText).width + 8;
      ctx.fillStyle = 'rgba(14, 18, 28, 0.78)';
      ctx.fillRect(vx - tw * 0.5, vy + vr + 3, tw, 13);
      ctx.fillStyle = isSelected ? '#FDE68A' : '#FAF6EE';
      ctx.textAlign = 'center';
      ctx.fillText(labelText, vx, vy + vr + 12.5);
    }

    ctx.restore();
  }, []);

  // Main isolated animation/simulation loop (zero idle CPU when paused)
  useEffect(() => {
    drawSandbox();
  }, [drawSandbox, selectedVillagerId, showPaths, showCollisions, running]);

  useEffect(() => {
    if (!running) return;
    let rafId = 0;
    let lastNow = performance.now();
    let lastReactSync = performance.now();

    const tick = (now: number) => {
      if (!runningRef.current || worldRef.current.completed) {
        drawSandbox();
        setRunning(false);
        setTickRevision((n) => n + 1);
        return;
      }

      const rawDt = Math.min(0.05, Math.max(0, (now - lastNow) / 1000));
      lastNow = now;

      const subSteps = speedRef.current;
      const stepDt = Math.min(0.1, rawDt);
      for (let i = 0; i < subSteps; i++) {
        stepSandbox(worldRef.current, stepDt);
      }

      drawSandbox();

      if (now - lastReactSync >= 200) {
        lastReactSync = now;
        setTickRevision((n) => n + 1);
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [drawSandbox, running]);

  const handleLoadScenario = useCallback(
    (id: SandboxScenarioId) => {
      const cfg = defaultConfigForScenario(id);
      const fresh = createSandboxWorld(cfg);
      worldRef.current = fresh;
      setScenarioId(id);
      setConfigDraft({ ...fresh.config });
      setSelectedVillagerId(fresh.villagers[0]?.id ?? '');
      setRunning(true);
      setTickRevision((n) => n + 1);
      drawSandbox();
    },
    [drawSandbox],
  );

  const handleApplyConfig = useCallback(() => {
    const fresh = createSandboxWorld(configDraft);
    worldRef.current = fresh;
    setSelectedVillagerId(fresh.villagers[0]?.id ?? '');
    setRunning(true);
    setTickRevision((n) => n + 1);
    drawSandbox();
  }, [configDraft, drawSandbox]);

  const handleStepOneSecond = useCallback(() => {
    setRunning(false);
    for (let i = 0; i < 4; i++) {
      stepSandbox(worldRef.current, 0.25);
    }
    drawSandbox();
    setTickRevision((n) => n + 1);
  }, [drawSandbox]);

  const handleRunFullDuration = useCallback(() => {
    setRunning(false);
    runSandboxToCompletion(worldRef.current, 0.25);
    drawSandbox();
    setTickRevision((n) => n + 1);
  }, [drawSandbox]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const wx = ((e.clientX - rect.left) / rect.width) * worldRef.current.width;
    const wy = ((e.clientY - rect.top) / rect.height) * worldRef.current.height;

    let bestId = '';
    let bestDist = 42;
    for (const v of worldRef.current.villagers) {
      const d = Math.hypot(v.x - wx, v.y - wy);
      if (d < bestDist) {
        bestDist = d;
        bestId = v.id;
      }
    }
    if (bestId) {
      setSelectedVillagerId(bestId);
      setActiveTab('npc');
    }
  }, []);

  const world = worldRef.current;
  const selectedVillager =
    world.villagers.find((v) => v.id === selectedVillagerId) ?? world.villagers[0] ?? null;

  const filteredEvents = world.events.filter(
    (ev) => eventFilter === 'all' || ev.category === eventFilter,
  );

  return (
    <div className="w-full h-full flex flex-col bg-[#111622] text-[#F3EAD6] overflow-hidden">
      {/* Top Sandbox Toolbar */}
      <header className="shrink-0 kingdom-frame border-x-0 border-t-0 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onBackToTitle}
            className="px-2.5 py-1 rounded-sm bg-[#1D2433] hover:bg-[#2A3347] border border-[#8E6B35]/50 text-[#F3EAD6] font-semibold flex items-center gap-1 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-[#E5AF47]" />
            <span>Title</span>
          </button>

          <h1
            className="text-sm font-semibold text-[#FDE68A] tracking-wide"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Hearthglen Simulation Sandbox
          </h1>

          <select
            aria-label="Sandbox Scenario Preset"
            value={scenarioId}
            onChange={(e) => handleLoadScenario(e.target.value as SandboxScenarioId)}
            className="px-2 py-1 rounded-sm bg-[#141A26] border border-[#8E6B35]/50 text-[#F7EFDD] text-[11px] font-medium"
          >
            {SANDBOX_SCENARIO_META.map((sc) => (
              <option key={sc.id} value={sc.id}>
                {sc.label}
              </option>
            ))}
          </select>
        </div>

        {/* Simulation Playback & Telemetry Summary */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setRunning((r) => !r)}
            className={`px-2.5 py-1 rounded-sm font-semibold flex items-center gap-1 cursor-pointer border ${
              running
                ? 'bg-[#2C3A2F] border-[#589674] text-[#8CE0AC]'
                : 'bg-[#D69635] border-[#FDE68A] text-[#14161D]'
            }`}
          >
            {running ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{running ? 'Pause' : 'Play'}</span>
          </button>

          {([1, 2, 5, 10] as const).map((sp) => (
            <button
              key={sp}
              type="button"
              onClick={() => setSpeed(sp)}
              className={`px-2 py-1 rounded-sm font-mono text-[11px] cursor-pointer border ${
                speed === sp
                  ? 'bg-[#D69635] text-[#14161D] border-[#FDE68A] font-bold'
                  : 'bg-[#19202D] text-[#C8BCA6] border-[#8E6B35]/35 hover:text-[#F7EFDD]'
              }`}
            >
              {sp}×
            </button>
          ))}

          <button
            type="button"
            onClick={handleStepOneSecond}
            className="px-2 py-1 rounded-sm bg-[#1B2230] hover:bg-[#263044] border border-[#8E6B35]/40 text-[#DCE6F5] flex items-center gap-1 cursor-pointer"
            title="Step simulation by 1 second"
          >
            <StepForward className="w-3.5 h-3.5 text-[#A8D8EA]" />
            <span>+1s</span>
          </button>

          <button
            type="button"
            onClick={handleRunFullDuration}
            className="px-2 py-1 rounded-sm bg-[#1F2C27] hover:bg-[#2B3D36] border border-[#589674]/50 text-[#8CE0AC] flex items-center gap-1 cursor-pointer"
            title="Run headless to configured duration"
          >
            <FastForward className="w-3.5 h-3.5" />
            <span>Run All</span>
          </button>

          <button
            type="button"
            onClick={() => handleLoadScenario(scenarioId)}
            className="px-2 py-1 rounded-sm bg-[#1B2230] hover:bg-[#263044] border border-[#8E6B35]/40 text-[#F3EAD6] flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#E5AF47]" />
            <span>Reset</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSandboxBridge(worldRef.current, !worldRef.current.config.hasBridgeOverDeepWater);
              setConfigDraft({ ...worldRef.current.config });
              drawSandbox();
              setTickRevision((n) => n + 1);
            }}
            className={`px-2 py-1 rounded-sm border font-medium cursor-pointer ${
              world.config.hasBridgeOverDeepWater
                ? 'bg-[#293529] border-[#74C294]/60 text-[#8CE0AC]'
                : 'bg-[#362228] border-[#E38589]/60 text-[#FDE2E3]'
            }`}
          >
            Bridge: {world.config.hasBridgeOverDeepWater ? 'Open' : 'Closed'}
          </button>

          <button
            type="button"
            onClick={() => setShowPaths((v) => !v)}
            className={`px-2 py-1 rounded-sm border cursor-pointer ${
              showPaths ? 'bg-[#252E40] border-[#E5AF47]/60 text-[#FDE68A]' : 'bg-[#171C27] border-[#8E6B35]/30 text-[#9EB1C2]'
            }`}
          >
            Paths
          </button>

          <button
            type="button"
            onClick={() => setShowCollisions((v) => !v)}
            className={`px-2 py-1 rounded-sm border cursor-pointer ${
              showCollisions ? 'bg-[#252E40] border-[#E5AF47]/60 text-[#FDE68A]' : 'bg-[#171C27] border-[#8E6B35]/30 text-[#9EB1C2]'
            }`}
          >
            Colliders
          </button>
        </div>

        {/* Live Counters */}
        <div className="flex items-center gap-3 font-mono text-[11px] tabular-nums text-[#D8CEBA]">
          <span>
            t = <strong className="text-[#FDE68A]">{world.timeSec.toFixed(1)}s</strong>
            {world.config.durationSeconds > 0 ? ` / ${world.config.durationSeconds}s` : ''}
          </span>
          <span>Pop: {world.villagers.filter((v) => !v.banished).length}</span>
          <span>Wood: {world.stockpile.wood}</span>
          <span>Stone: {world.stockpile.stone}</span>
          <span>Food: {world.stockpile.food}</span>
        </div>
      </header>

      {/* Main Split Workspace */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        {/* Flat Terrain Canvas Area */}
        <div className="flex-1 min-w-0 min-h-0 p-3 flex flex-col items-center justify-center bg-[#0D111B]">
          <div className="w-full max-w-[1040px] aspect-[1200/760] rounded border border-[#8E6B35]/55 shadow-2xl overflow-hidden bg-[#16202C] relative">
            <canvas
              ref={canvasRef}
              width={960}
              height={608}
              onClick={handleCanvasClick}
              className="w-full h-full block cursor-pointer"
            />
            <div className="pointer-events-none absolute bottom-2 left-2 px-2 py-1 rounded-sm bg-[#141923]/85 border border-[#8E6B35]/40 text-[10px] text-[#D8CEBA]">
              {SANDBOX_SCENARIO_META.find((s) => s.id === scenarioId)?.summary} — Click any villager to inspect.
            </div>
            {world.completed && (
              <div className="pointer-events-none absolute top-2 right-2 px-2.5 py-1 rounded-sm bg-[#1F2E24]/95 border border-[#74C294] text-[11px] font-semibold text-[#8CE0AC]">
                Run Complete ({world.timeSec.toFixed(0)}s)
              </div>
            )}
          </div>
        </div>

        {/* Developer Inspector Panel */}
        <aside
          aria-label="Sandbox Developer Inspector"
          className="w-full lg:w-[410px] shrink-0 kingdom-frame border-y-0 border-r-0 flex flex-col min-h-0"
        >
          {/* Inspector Tabs */}
          <div className="shrink-0 grid grid-cols-4 gap-1 p-2 border-b border-[#8E6B35]/40 bg-[#141923]">
            {[
              { id: 'npc' as const, label: 'NPC Brain', icon: Brain },
              { id: 'world' as const, label: 'Resources', icon: Trees },
              { id: 'social' as const, label: 'Social Log', icon: Users },
              { id: 'config' as const, label: 'Config', icon: Settings2 },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-1.5 px-1.5 rounded-sm text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer border ${
                    active
                      ? 'bg-[#D69635] text-[#14161D] border-[#FDE68A]'
                      : 'bg-[#1B2230] text-[#C8BCA6] border-[#8E6B35]/30 hover:text-[#F7EFDD]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3 text-[11px]">
            {activeTab === 'npc' && selectedVillager && (
              <>
                {/* Villager Selector */}
                <div className="flex items-center gap-2">
                  <select
                    aria-label="Select Villager to Inspect"
                    value={selectedVillager.id}
                    onChange={(e) => setSelectedVillagerId(e.target.value)}
                    className="flex-1 px-2 py-1.5 rounded-sm bg-[#131823] border border-[#8E6B35]/45 text-[#F7EFDD] font-semibold text-xs"
                  >
                    {world.villagers.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} — {v.personality.archetype}
                        {v.banished ? ' (Banished)' : ''}
                      </option>
                    ))}
                  </select>
                  <span className="px-2 py-1 rounded-sm bg-[#1D2434] border border-[#8E6B35]/40 font-mono text-[10px]">
                    Rep {selectedVillager.reputation}
                  </span>
                </div>

                {/* Activity, Goal & Long-term Goal */}
                <section className="p-2.5 rounded-sm bg-[#171D2A] border border-[#8E6B35]/35 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#FDE68A] flex items-center gap-1">
                      <Activity className="w-3.5 h-3.5" />
                      <span>Activity &amp; Goals</span>
                    </span>
                    <span className="px-1.5 py-0.5 rounded-sm bg-[#232D40] text-[#A8D8EA] font-mono uppercase text-[10px]">
                      {selectedVillager.activity}
                    </span>
                  </div>
                  <p>
                    <strong className="text-[#D8CEBA]">Goal:</strong> {selectedVillager.currentGoal}
                  </p>
                  <p>
                    <strong className="text-[#D8CEBA]">Long-Term:</strong> {selectedVillager.longTermGoal}
                  </p>
                  <p className="text-[10px] text-[#9EB1C2]">
                    Personality ({selectedVillager.personality.archetype}): Soc{' '}
                    {Math.round(selectedVillager.personality.sociability * 100)}% · Cur{' '}
                    {Math.round(selectedVillager.personality.curiosity * 100)}% · Ind{' '}
                    {Math.round(selectedVillager.personality.industriousness * 100)}% · Hon{' '}
                    {Math.round(selectedVillager.personality.honesty * 100)}% · Gen{' '}
                    {Math.round(selectedVillager.personality.generosity * 100)}%
                  </p>
                </section>

                {/* Needs */}
                <section className="p-2.5 rounded-sm bg-[#171D2A] border border-[#8E6B35]/35 space-y-1">
                  <h3 className="font-semibold text-[#FDE68A] mb-1">Immediate Needs</h3>
                  {(
                    [
                      ['Hunger', selectedVillager.needs.hunger, '#C98A54'],
                      ['Energy', selectedVillager.needs.energy, '#65B386'],
                      ['Social', selectedVillager.needs.social, '#5EA7C4'],
                      ['Warmth', selectedVillager.needs.warmth, '#F59E0B'],
                      ['Safety', selectedVillager.needs.safety, '#A8D8EA'],
                      ['Mood', selectedVillager.needs.mood, '#E5AF47'],
                    ] as const
                  ).map(([lbl, val, col]) => (
                    <div key={lbl} className="flex items-center gap-2">
                      <span className="w-12 text-[#B4A995]">{lbl}</span>
                      <div className="flex-1 h-1.5 bg-[#252D3D] rounded-full overflow-hidden">
                        <div
                          className="h-full"
                          style={{ width: `${Math.round(val)}%`, backgroundColor: col }}
                        />
                      </div>
                      <span className="w-8 text-right font-mono tabular-nums">{Math.round(val)}%</span>
                    </div>
                  ))}
                </section>

                {/* Current Decision & Candidate Scoring */}
                <section className="p-2.5 rounded-sm bg-[#171D2A] border border-[#8E6B35]/35 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-[#FDE68A]">Decision Breakdown</h3>
                    <span className="font-mono text-[10px] text-[#9EB1C2]">
                      @{selectedVillager.decision.evaluatedAtSec}s
                    </span>
                  </div>
                  <p className="text-[#8CE0AC] font-medium">
                    Chosen: <strong>{selectedVillager.decision.chosenAction}</strong> —{' '}
                    {selectedVillager.decision.chosenReason}
                  </p>
                  <p className="text-[10px] text-[#B4A995]">{selectedVillager.decision.validationNote}</p>
                  <div className="space-y-0.5 pt-1">
                    {selectedVillager.decision.candidates.map((cand) => (
                      <div
                        key={cand.action}
                        className="flex items-center justify-between gap-2 text-[10px] px-1.5 py-0.5 rounded-sm bg-[#131823]"
                      >
                        <span className={cand.valid ? 'text-[#F3EAD6]' : 'text-[#E38589] line-through'}>
                          {cand.action}
                        </span>
                        <span className="text-[#9EB1C2] truncate flex-1 text-right">{cand.reason}</span>
                        <span className="font-mono text-[#FDE68A] w-9 text-right">{cand.score}</span>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Inventory */}
                <section className="p-2.5 rounded-sm bg-[#171D2A] border border-[#8E6B35]/35">
                  <h3 className="font-semibold text-[#FDE68A] flex items-center gap-1 mb-1">
                    <Package className="w-3.5 h-3.5" />
                    <span>
                      Personal Inventory (
                      {selectedVillager.inventory.wood +
                        selectedVillager.inventory.stone +
                        selectedVillager.inventory.food}
                      /{selectedVillager.inventory.capacity})
                    </span>
                  </h3>
                  <div className="grid grid-cols-3 gap-1.5 font-mono text-center">
                    <div className="p-1 rounded-sm bg-[#131823]">Wood: {selectedVillager.inventory.wood}</div>
                    <div className="p-1 rounded-sm bg-[#131823]">Stone: {selectedVillager.inventory.stone}</div>
                    <div className="p-1 rounded-sm bg-[#131823]">Food: {selectedVillager.inventory.food}</div>
                  </div>
                </section>

                {/* Path & Collision State */}
                <section className="p-2.5 rounded-sm bg-[#171D2A] border border-[#8E6B35]/35 space-y-1">
                  <h3 className="font-semibold text-[#FDE68A] flex items-center gap-1">
                    <Footprints className="w-3.5 h-3.5" />
                    <span>Navigation &amp; Collision State</span>
                  </h3>
                  <div className="grid grid-cols-2 gap-1 text-[10.5px] font-mono">
                    <div>
                      Pos: ({Math.round(selectedVillager.x)}, {Math.round(selectedVillager.y)})
                    </div>
                    <div>
                      Dest:{' '}
                      {selectedVillager.targetX !== null
                        ? `(${Math.round(selectedVillager.targetX)}, ${Math.round(selectedVillager.targetY ?? 0)})`
                        : 'none'}
                    </div>
                    <div>Waypoints: {selectedVillager.path.length}</div>
                    <div>Terrain: {selectedVillager.collision.terrainUnderfoot}</div>
                    <div>Speed: {selectedVillager.collision.speed.toFixed(1)} u/s</div>
                    <div>Stuck: {selectedVillager.collision.stuckTimer.toFixed(2)}s</div>
                    <div>Detour: {selectedVillager.collision.detourActive ? 'active' : 'off'}</div>
                    <div>Blocked: {selectedVillager.collision.blockedBy ?? 'clear'}</div>
                  </div>
                </section>

                {/* Knowledge & Skills */}
                <section className="p-2.5 rounded-sm bg-[#171D2A] border border-[#8E6B35]/35 space-y-1.5">
                  <h3 className="font-semibold text-[#FDE68A] flex items-center gap-1">
                    <Compass className="w-3.5 h-3.5" />
                    <span>Knowledge Domains &amp; Skills</span>
                  </h3>
                  <div className="grid grid-cols-2 gap-1 text-[10px]">
                    {KNOWLEDGE_CATEGORIES.map((cat) => (
                      <div key={cat.id} className="flex items-center justify-between px-1.5 py-0.5 rounded-sm bg-[#131823]">
                        <span className="text-[#C8BCA6]">{cat.label}</span>
                        <span className="font-mono text-[#A8D8EA]">
                          {selectedVillager.knowledge[cat.id].toFixed(1)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-[#9EB1C2] font-mono">
                    Skills: Wood {selectedVillager.skills.woodcraft} · Stone {selectedVillager.skills.stonecraft} ·
                    Masonry {selectedVillager.skills.masonry} · Forage {selectedVillager.skills.foraging}
                  </p>
                </section>

                {/* Relationships */}
                <section className="p-2.5 rounded-sm bg-[#171D2A] border border-[#8E6B35]/35 space-y-1">
                  <h3 className="font-semibold text-[#FDE68A]">Relationships</h3>
                  <div className="space-y-1">
                    {Object.values(selectedVillager.relationships).map((rel) => {
                      const peer = world.villagers.find((p) => p.id === rel.peerId);
                      const meta = RELATIONSHIP_STAGE_META[rel.stage];
                      return (
                        <div
                          key={rel.peerId}
                          className="flex items-center justify-between px-1.5 py-0.5 rounded-sm bg-[#131823] text-[10.5px]"
                        >
                          <span>{peer?.name ?? rel.peerId}</span>
                          <span className="font-mono">
                            <span style={{ color: meta.color }}>{meta.label}</span> ({rel.score}) ·{' '}
                            {rel.conversations} chats
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>

                {/* Recent Memories */}
                <section className="p-2.5 rounded-sm bg-[#171D2A] border border-[#8E6B35]/35 space-y-1">
                  <h3 className="font-semibold text-[#FDE68A]">Recent Memories ({selectedVillager.memories.length})</h3>
                  <div className="space-y-1">
                    {selectedVillager.memories.slice(0, 8).map((m) => (
                      <div key={m.id} className="px-1.5 py-1 rounded-sm bg-[#131823] text-[10.5px]">
                        <div className="flex justify-between text-[9.5px] font-mono text-[#9EB1C2]">
                          <span>t={m.timeSec}s</span>
                          <span>Imp {m.importance}/10</span>
                        </div>
                        <p
                          className={
                            m.sentiment === 'negative'
                              ? 'text-[#E38589]'
                              : m.sentiment === 'positive'
                                ? 'text-[#8CE0AC]'
                                : 'text-[#D8CEBA]'
                          }
                        >
                          {m.summary}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}

            {activeTab === 'world' && (
              <>
                <section className="p-2.5 rounded-sm bg-[#171D2A] border border-[#8E6B35]/35 space-y-1 font-mono text-[10.5px]">
                  <h3 className="font-sans font-semibold text-[#FDE68A] text-xs mb-1">
                    Simulation Metrics &amp; Stockpile
                  </h3>
                  <div className="grid grid-cols-2 gap-1">
                    <div>Wood Stockpile: {world.stockpile.wood}</div>
                    <div>Stone Stockpile: {world.stockpile.stone}</div>
                    <div>Food Stockpile: {world.stockpile.food}</div>
                    <div>A* Paths Run: {world.metrics.totalPathComputations}</div>
                    <div>Blocked Actions: {world.metrics.totalActionRejections}</div>
                    <div>Total Gathered: {world.metrics.totalResourcesGathered}</div>
                    <div>Peak Overlap Pairs: {world.metrics.peakOverlapPairs}</div>
                    <div>Houses Built: {world.metrics.housesConstructedCount}</div>
                  </div>
                </section>

                <section className="p-2.5 rounded-sm bg-[#171D2A] border border-[#8E6B35]/35 space-y-1.5">
                  <h3 className="font-semibold text-[#FDE68A] flex items-center gap-1">
                    <Hammer className="w-3.5 h-3.5" />
                    <span>Structures ({world.buildings.length})</span>
                  </h3>
                  {world.buildings.map((b) => (
                    <div key={b.id} className="p-1.5 rounded-sm bg-[#131823] text-[10.5px] space-y-0.5">
                      <div className="flex justify-between font-semibold">
                        <span>{b.name}</span>
                        <span className="font-mono text-[#8CE0AC]">
                          {b.stage} ({Math.round(b.progress)}%)
                        </span>
                      </div>
                      <div className="text-[10px] text-[#9EB1C2] font-mono">
                        Beds: {b.beds} · Mats: W {b.deliveredWood}/{b.requiredWood}, S {b.deliveredStone}/
                        {b.requiredStone}
                        {b.pausedForMaterials ? ' · PAUSED (need mats)' : ''}
                      </div>
                    </div>
                  ))}
                </section>

                <section className="p-2.5 rounded-sm bg-[#171D2A] border border-[#8E6B35]/35 space-y-1">
                  <h3 className="font-semibold text-[#FDE68A]">Finite Resource Nodes ({world.nodes.length})</h3>
                  {world.nodes.map((n) => (
                    <div
                      key={n.id}
                      className="flex items-center justify-between px-1.5 py-0.5 rounded-sm bg-[#131823] text-[10.5px]"
                    >
                      <span className={n.amount === 0 ? 'text-[#E38589] line-through' : 'text-[#F3EAD6]'}>
                        {n.label} ({n.yieldType})
                      </span>
                      <span className="font-mono">
                        {n.amount}/{n.maxAmount} {n.renewable ? '· ren' : '· finite'}
                      </span>
                    </div>
                  ))}
                </section>

                <section className="p-2.5 rounded-sm bg-[#171D2A] border border-[#8E6B35]/35 space-y-1">
                  <h3 className="font-semibold text-[#FDE68A]">Wildlife ({world.animals.length})</h3>
                  {world.animals.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between px-1.5 py-0.5 rounded-sm bg-[#131823] text-[10.5px] font-mono"
                    >
                      <span className="capitalize">
                        {a.species} ({a.state})
                      </span>
                      <span>
                        H:{Math.round(a.hunger)} E:{Math.round(a.energy)} · {a.terrainUnderfoot}
                      </span>
                    </div>
                  ))}
                </section>
              </>
            )}

            {activeTab === 'social' && (
              <>
                <div className="flex flex-wrap gap-1">
                  {EVENT_CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setEventFilter(cat.id)}
                      className={`px-2 py-0.5 rounded-sm text-[10px] font-semibold cursor-pointer border ${
                        eventFilter === cat.id
                          ? 'bg-[#D69635] text-[#14161D] border-[#FDE68A]'
                          : 'bg-[#19202D] text-[#C8BCA6] border-[#8E6B35]/30'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                <div className="space-y-1.5">
                  {filteredEvents.map((ev) => (
                    <div
                      key={ev.id}
                      className={`p-2 rounded-sm border text-[10.5px] space-y-0.5 ${
                        ev.significance === 'major'
                          ? 'bg-[#251E18] border-[#E5AF47]/60'
                          : 'bg-[#171D2A] border-[#8E6B35]/30'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[#F7EFDD]">{ev.title}</span>
                        <span className="font-mono text-[9.5px] text-[#9EB1C2]">
                          t={ev.timeSec}s · {ev.category}
                        </span>
                      </div>
                      <p className="text-[#D8CEBA] leading-snug">{ev.description}</p>
                      {(ev.relationshipDelta || ev.consequence) && (
                        <p className="text-[10px] font-mono text-[#8CE0AC]">
                          {ev.relationshipDelta} {ev.consequence ? `· ${ev.consequence}` : ''}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {activeTab === 'config' && (
              <div className="space-y-2.5">
                <p className="text-[10.5px] text-[#B4A995]">
                  Configure duration, starting population, initial materials, and deterministic seed, then restart the sandbox.
                </p>

                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ['Duration (s)', 'durationSeconds', 0, 1200],
                      ['Initial Pop', 'initialPopulation', 1, 16],
                      ['Initial Wood', 'initialWood', 0, 100],
                      ['Initial Twigs', 'initialTwigs', 0, 12],
                      ['Initial Stone', 'initialStone', 0, 100],
                      ['Initial Food', 'initialFood', 0, 100],
                      ['Seed', 'seed', 1, 99999],
                    ] as const
                  ).map(([label, key, min, max]) => (
                    <label key={key} className="block">
                      <span className="text-[10px] text-[#B4A995] block mb-0.5">{label}</span>
                      <input
                        type="number"
                        min={min}
                        max={max}
                        value={configDraft[key]}
                        onChange={(e) =>
                          setConfigDraft((prev) => ({
                            ...prev,
                            [key]: Math.max(min, Math.min(max, Number(e.target.value) || 0)),
                          }))
                        }
                        className="w-full px-2 py-1 rounded-sm bg-[#131823] border border-[#8E6B35]/45 text-[#F7EFDD] font-mono text-xs"
                      />
                    </label>
                  ))}
                </div>

                <label className="flex items-center gap-2 text-xs text-[#F3EAD6] pt-1">
                  <input
                    type="checkbox"
                    checked={configDraft.hasBridgeOverDeepWater}
                    onChange={(e) =>
                      setConfigDraft((prev) => ({ ...prev, hasBridgeOverDeepWater: e.target.checked }))
                    }
                  />
                  <span>Bridge over deep water pond</span>
                </label>

                <button
                  type="button"
                  onClick={handleApplyConfig}
                  className="w-full py-2 rounded-sm bg-[#D69635] hover:bg-[#E5A746] text-[#14161D] font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Apply Config &amp; Restart Sandbox</span>
                </button>

                <div className="p-2 rounded-sm bg-[#171D2A] border border-[#8E6B35]/35 space-y-1">
                  <h4 className="font-semibold text-[#FDE68A] flex items-center gap-1">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>Active Community Rules</span>
                  </h4>
                  <ul className="list-disc list-inside text-[10.5px] text-[#D8CEBA] space-y-0.5">
                    {world.rules.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
