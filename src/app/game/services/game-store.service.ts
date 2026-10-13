import { Injectable, computed, signal } from '@angular/core';
import {
  CacheEvictionStrategy,
  LevelDefinition,
  LevelScoreResult,
  LoadBalancingStrategy,
  NodeType,
  PlacedNode,
  ShardingStrategy,
  TelemetrySnapshot,
  ToolMode,
  WireConnection,
} from '../models/game.models';
import { CAMPAIGN_LEVELS } from '../levels/campaign.levels';
import { NODE_CATALOG } from '../levels/node-catalog';
import { SoundEngine } from '../audio/sound-engine';
import { analyzeTopologyWarnings, ArchitectureWarning } from '../engine/routing-engine';

export interface SceneCommandCallbacks {
  onLoadLevel: (level: LevelDefinition) => void;
  onStartWave: () => void;
  onStopResetWave: () => void;
  onUpgradeNode: (nodeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onUpdateNodeStrategy: (
    nodeId: string,
    lb?: LoadBalancingStrategy,
    cache?: CacheEvictionStrategy,
    shard?: ShardingStrategy
  ) => void;
  onAutoArchitectSolution: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

@Injectable({ providedIn: 'root' })
export class GameStoreService {
  readonly sound = new SoundEngine();

  readonly levels = CAMPAIGN_LEVELS;
  readonly currentLevelIndex = signal<number>(0);
  readonly currentLevel = computed<LevelDefinition>(
    () => this.levels[this.currentLevelIndex()] ?? this.levels[0]
  );

  readonly budget = signal<number>(CAMPAIGN_LEVELS[0].startingBudget);
  readonly toolMode = signal<ToolMode>('select');
  readonly selectedBuildType = signal<NodeType>('app_server');
  readonly selectedNode = signal<PlacedNode | null>(null);
  readonly placedNodes = signal<readonly PlacedNode[]>([]);
  readonly wires = signal<readonly WireConnection[]>([]);

  readonly canUndo = signal<boolean>(false);
  readonly canRedo = signal<boolean>(false);

  readonly isWaveRunning = signal<boolean>(false);
  readonly simSpeed = signal<1 | 2>(1);
  readonly isPaused = signal<boolean>(false);
  readonly isMuted = signal<boolean>(false);

  readonly showBriefingModal = signal<boolean>(true);
  readonly showCodexModal = signal<boolean>(false);
  readonly levelResultModal = signal<LevelScoreResult | null>(null);
  readonly completedLevels = signal<Readonly<Record<number, number>>>({}); // levelId -> stars

  readonly bannerToast = signal<string | null>(null);

  readonly telemetry = signal<TelemetrySnapshot>({
    currentRps: 0,
    incomingRps: 0,
    totalSpawned: 0,
    totalResolved: 0,
    totalBlockedMalicious: 0,
    totalFailed: 0,
    slaPercent: 100,
    p95LatencyMs: 0,
    cacheHitRatio: 0,
    waveElapsedSec: 0,
    waveTotalSec: 26,
    currentSegmentAnnouncement: 'Ready to Deploy Architecture',
    score: 0,
    starsEarned: 3,
  });

  readonly unlockedCatalogItems = computed(() => {
    const level = this.currentLevel();
    return level.unlockedNodes.map((type) => NODE_CATALOG[type]);
  });

  readonly architectureWarnings = computed<readonly ArchitectureWarning[]>(() => {
    const level = this.currentLevel();
    const nodes = this.placedNodes();
    const wires = this.wires();
    const hasMalicious = level.waves.some((w) => w.mix.MALICIOUS > 0);
    const peakRps = Math.max(...level.waves.map((w) => w.rps), 10);
    return analyzeTopologyWarnings(nodes, wires, hasMalicious, peakRps);
  });

  private sceneCallbacks: SceneCommandCallbacks | null = null;
  private toastTimeoutId: ReturnType<typeof setTimeout> | null = null;

  registerSceneCallbacks(cb: SceneCommandCallbacks): void {
    this.sceneCallbacks = cb;
  }

  selectLevel(index: number): void {
    if (index < 0 || index >= this.levels.length) return;
    this.currentLevelIndex.set(index);
    const level = this.levels[index];
    this.budget.set(level.startingBudget);
    this.selectedNode.set(null);
    this.levelResultModal.set(null);
    this.isWaveRunning.set(false);
    this.isPaused.set(false);
    this.toolMode.set('select');
    if (level.unlockedNodes.length > 0) {
      this.selectedBuildType.set(level.unlockedNodes[0]);
    }
    this.showBriefingModal.set(true);
    this.sceneCallbacks?.onLoadLevel(level);
  }

  selectBuildNodeType(type: NodeType): void {
    this.selectedBuildType.set(type);
    this.toolMode.set('build');
    this.selectedNode.set(null);
  }

  setToolMode(mode: ToolMode): void {
    this.toolMode.set(mode);
    if (mode !== 'select') {
      this.selectedNode.set(null);
    }
  }

  startWave(): void {
    if (this.isWaveRunning()) return;
    this.levelResultModal.set(null);
    this.showBriefingModal.set(false);
    this.isPaused.set(false);
    this.isWaveRunning.set(true);
    this.sceneCallbacks?.onStartWave();
  }

  resetWave(): void {
    this.isWaveRunning.set(false);
    this.isPaused.set(false);
    this.levelResultModal.set(null);
    this.sceneCallbacks?.onStopResetWave();
  }

  resetEntireLevel(): void {
    const level = this.currentLevel();
    this.budget.set(level.startingBudget);
    this.selectedNode.set(null);
    this.levelResultModal.set(null);
    this.isWaveRunning.set(false);
    this.isPaused.set(false);
    this.sceneCallbacks?.onLoadLevel(level);
    this.triggerToast('Architecture reset to level starter template.');
  }

  autoArchitectCurrentLevel(): void {
    this.sceneCallbacks?.onAutoArchitectSolution();
  }

  undo(): void {
    if (!this.canUndo()) return;
    this.sceneCallbacks?.onUndo();
  }

  redo(): void {
    if (!this.canRedo()) return;
    this.sceneCallbacks?.onRedo();
  }

  toggleSimSpeed(): void {
    this.simSpeed.update((s) => (s === 1 ? 2 : 1));
  }

  togglePause(): void {
    if (!this.isWaveRunning()) return;
    this.isPaused.update((p) => !p);
  }

  toggleMute(): void {
    const next = !this.isMuted();
    this.isMuted.set(next);
    this.sound.setMuted(next);
  }

  requestUpgradeSelectedNode(): void {
    const node = this.selectedNode();
    if (!node) return;
    this.sceneCallbacks?.onUpgradeNode(node.id);
  }

  requestDeleteSelectedNode(): void {
    const node = this.selectedNode();
    if (!node || node.locked) return;
    this.sceneCallbacks?.onDeleteNode(node.id);
  }

  updateSelectedNodeStrategy(
    lb?: LoadBalancingStrategy,
    cache?: CacheEvictionStrategy,
    shard?: ShardingStrategy
  ): void {
    const node = this.selectedNode();
    if (!node) return;
    this.sceneCallbacks?.onUpdateNodeStrategy(node.id, lb, cache, shard);
  }

  recordLevelCompletion(result: LevelScoreResult): void {
    this.isWaveRunning.set(false);
    this.levelResultModal.set(result);
    if (result.passed) {
      this.sound.playWaveVictory();
      this.completedLevels.update((prev) => ({
        ...prev,
        [result.levelId]: Math.max(prev[result.levelId] ?? 0, result.stars),
      }));
    } else {
      this.sound.playWaveFailed();
    }
  }

  triggerToast(message: string): void {
    this.bannerToast.set(message);
    if (this.toastTimeoutId) {
      clearTimeout(this.toastTimeoutId);
    }
    this.toastTimeoutId = setTimeout(() => {
      this.bannerToast.set(null);
    }, 3600);
  }
}
