import * as Phaser from 'phaser';
import {
  CacheEvictionStrategy,
  LevelDefinition,
  LoadBalancingStrategy,
  NodeType,
  PacketType,
  PlacedNode,
  ShardingStrategy,
  StarterNodePlacement,
  WireConnection,
} from '../models/game.models';
import { NODE_CATALOG, PACKET_VISUALS } from '../levels/node-catalog';
import { computeNodeStatsForTier, evaluatePacketAtNode } from '../engine/routing-engine';
import { GameStoreService } from '../services/game-store.service';

interface ActivePacket {
  id: string;
  type: PacketType;
  hashKey: number;
  currentNodeId: string;
  targetNodeId: string;
  wireId: string;
  progress: number; // 0 to 1 along wire
  speed: number;
  accumulatedLatencyMs: number;
  hops: number;
  sprite: Phaser.GameObjects.Sprite;
  glow: Phaser.GameObjects.Arc;
}

interface NodeVisualGroup {
  container: Phaser.GameObjects.Container;
  basePlate: Phaser.GameObjects.Graphics;
  sprite: Phaser.GameObjects.Sprite;
  labelText: Phaser.GameObjects.Text;
  tierBadge: Phaser.GameObjects.Text;
  metricsText: Phaser.GameObjects.Text;
  loadBarBg: Phaser.GameObjects.Rectangle;
  loadBarFill: Phaser.GameObjects.Rectangle;
  statusLed: Phaser.GameObjects.Arc;
  selectionRing: Phaser.GameObjects.Arc;
}

interface ArchitectureSnapshot {
  budget: number;
  nodes: Array<{
    id: string;
    type: NodeType;
    gridX: number;
    gridY: number;
    locked?: boolean;
    tier: number;
    label: string;
    lbStrategy: LoadBalancingStrategy;
    cacheStrategy: CacheEvictionStrategy;
    shardStrategy: ShardingStrategy;
  }>;
  wires: Array<{
    id: string;
    fromNodeId: string;
    toNodeId: string;
  }>;
}

export class ArchitectureScene extends Phaser.Scene {
  private readonly store: GameStoreService;

  private readonly gridCols = 13;
  private readonly gridRows = 7;
  private cellWidth = 104;
  private cellHeight = 96;
  private gridOriginX = 95;
  private gridOriginY = 105;

  private gridGraphics!: Phaser.GameObjects.Graphics;
  private wireGraphics!: Phaser.GameObjects.Graphics;
  private hoverGraphics!: Phaser.GameObjects.Graphics;
  private dragWireGraphics!: Phaser.GameObjects.Graphics;

  private nodesMap = new Map<string, PlacedNode>();
  private nodeVisuals = new Map<string, NodeVisualGroup>();
  private wiresList: WireConnection[] = [];
  private activePackets: ActivePacket[] = [];

  private undoStack: ArchitectureSnapshot[] = [];
  private redoStack: ArchitectureSnapshot[] = [];

  private hoveredGrid: { col: number; row: number } | null = null;
  private wireStartNodeId: string | null = null;

  private waveTimeElapsedSec = 0;
  private spawnAccumulator = 0;
  private dashOffset = 0;
  private telemetryTimer = 0;

  private totalSpawned = 0;
  private totalResolved = 0;
  private totalBlockedMalicious = 0;
  private totalFailed = 0;
  private totalCacheHits = 0;
  private totalCacheLookups = 0;
  private latencySamples: number[] = [];
  private recentRpsCount = 0;

  private nodeCounter = 100;
  private packetCounter = 1;

  constructor(store: GameStoreService) {
    super({ key: 'ArchitectureScene' });
    this.store = store;
  }

  preload(): void {
    const nodeSprites: Array<[string, string]> = [
      ['node_ingress', 'assets/sprites/node_ingress.png'],
      ['node_waf', 'assets/sprites/node_waf.png'],
      ['node_lb', 'assets/sprites/node_lb.png'],
      ['node_cdn', 'assets/sprites/node_cdn.png'],
      ['node_app', 'assets/sprites/node_app.png'],
      ['node_redis', 'assets/sprites/node_redis.png'],
      ['node_mq', 'assets/sprites/node_mq.png'],
      ['node_sql', 'assets/sprites/node_sql.png'],
      ['node_shard', 'assets/sprites/node_shard.png'],
      ['node_replica', 'assets/sprites/node_replica.png'],
    ];

    const packetSprites: Array<[string, string]> = [
      ['packet_get', 'assets/sprites/packet_get.png'],
      ['packet_post', 'assets/sprites/packet_post.png'],
      ['packet_static', 'assets/sprites/packet_static.png'],
      ['packet_async', 'assets/sprites/packet_async.png'],
      ['packet_ddos', 'assets/sprites/packet_ddos.png'],
    ];

    for (const [key, url] of [...nodeSprites, ...packetSprites]) {
      this.load.image(key, url);
    }
  }

  create(): void {
    this.recalculateGridGeometry();

    this.gridGraphics = this.add.graphics().setDepth(1);
    this.wireGraphics = this.add.graphics().setDepth(5);
    this.hoverGraphics = this.add.graphics().setDepth(4);
    this.dragWireGraphics = this.add.graphics().setDepth(25);

    this.drawCyberGrid();
    this.setupInputHandlers();
    this.setupKeyboardShortcuts();

    this.scale.on('resize', () => {
      this.recalculateGridGeometry();
      this.drawCyberGrid();
      this.repositionAllNodes();
    });

    this.store.registerSceneCallbacks({
      onLoadLevel: (lvl) => this.loadLevel(lvl),
      onStartWave: () => this.startWaveSimulation(),
      onStopResetWave: () => this.resetWaveSimulation(),
      onUpgradeNode: (id) => this.upgradeNodeById(id),
      onDeleteNode: (id) => this.deleteNodeById(id),
      onUpdateNodeStrategy: (id, lb, cache, shard) =>
        this.updateNodeStrategy(id, lb, cache, shard),
      onAutoArchitectSolution: () => this.applyOptimalArchitectureForCurrentLevel(),
      onUndo: () => this.performUndo(),
      onRedo: () => this.performRedo(),
    });

    this.loadLevel(this.store.currentLevel());
  }

  override update(_time: number, deltaMs: number): void {
    const dtRaw = Math.min(deltaMs / 1000, 0.1);
    const speedMultiplier = this.store.isPaused() ? 0 : this.store.simSpeed();
    const dt = dtRaw * speedMultiplier;

    this.dashOffset = (this.dashOffset + dtRaw * 48) % 24;
    this.renderWires();

    // Gently decay node instantaneous load and queue depth over time
    for (const node of this.nodesMap.values()) {
      const drainRate = node.maxCapacity * dt;
      node.currentLoad = Math.max(0, node.currentLoad - drainRate * 0.95);
      if (node.queueDepth > 0) {
        const queueDrain = Math.min(node.queueDepth, node.maxCapacity * dt * 0.85);
        node.queueDepth = Math.max(0, node.queueDepth - queueDrain);
      }
      node.isOverloaded = node.queueDepth > node.maxQueue * 0.8;
      this.updateNodeVisualTelemetry(node);
    }

    if (!this.store.isWaveRunning() || this.store.isPaused()) {
      return;
    }

    this.updateWaveSpawner(dt);
    this.updateActivePackets(dt);

    this.telemetryTimer += dtRaw;
    if (this.telemetryTimer >= 0.25) {
      this.publishTelemetrySnapshot(this.telemetryTimer);
      this.telemetryTimer = 0;
    }
  }

  private captureSnapshot(): ArchitectureSnapshot {
    return {
      budget: this.store.budget(),
      nodes: Array.from(this.nodesMap.values()).map((n) => ({
        id: n.id,
        type: n.type,
        gridX: n.gridX,
        gridY: n.gridY,
        locked: n.locked,
        tier: n.tier,
        label: n.label,
        lbStrategy: n.lbStrategy,
        cacheStrategy: n.cacheStrategy,
        shardStrategy: n.shardStrategy,
      })),
      wires: this.wiresList.map((w) => ({
        id: w.id,
        fromNodeId: w.fromNodeId,
        toNodeId: w.toNodeId,
      })),
    };
  }

  private recordUndoStep(): void {
    this.undoStack.push(this.captureSnapshot());
    if (this.undoStack.length > 40) {
      this.undoStack.shift();
    }
    this.redoStack = [];
    this.syncUndoRedoSignals();
  }

  private syncUndoRedoSignals(): void {
    this.store.canUndo.set(this.undoStack.length > 0);
    this.store.canRedo.set(this.redoStack.length > 0);
  }

  private restoreSnapshot(snap: ArchitectureSnapshot): void {
    const prevSelectedId = this.store.selectedNode()?.id;
    this.clearAllEntities();
    this.store.budget.set(snap.budget);

    for (const n of snap.nodes) {
      const placed = this.spawnNodeInternal({
        id: n.id,
        type: n.type,
        gridX: n.gridX,
        gridY: n.gridY,
        locked: n.locked,
        tier: n.tier,
        label: n.label,
      });
      placed.lbStrategy = n.lbStrategy;
      placed.cacheStrategy = n.cacheStrategy;
      placed.shardStrategy = n.shardStrategy;
    }

    for (const w of snap.wires) {
      this.connectNodesWithWire(w.fromNodeId, w.toNodeId, true, false);
    }

    if (prevSelectedId && this.nodesMap.has(prevSelectedId)) {
      this.selectNode(this.nodesMap.get(prevSelectedId)!);
    } else {
      this.selectNode(null);
    }

    this.syncStoreTopology();
    this.renderWires();
  }

  private performUndo(): void {
    if (this.undoStack.length === 0) return;
    const current = this.captureSnapshot();
    const previous = this.undoStack.pop()!;
    this.redoStack.push(current);
    this.restoreSnapshot(previous);
    this.syncUndoRedoSignals();
    this.store.sound.playWireConnect();
    this.store.triggerToast('Undid last action (Ctrl+Z)');
  }

  private performRedo(): void {
    if (this.redoStack.length === 0) return;
    const current = this.captureSnapshot();
    const next = this.redoStack.pop()!;
    this.undoStack.push(current);
    this.restoreSnapshot(next);
    this.syncUndoRedoSignals();
    this.store.sound.playWireConnect();
    this.store.triggerToast('Redid action (Ctrl+Y)');
  }

  private recalculateGridGeometry(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const usableW = Math.max(760, w - 90);
    const usableH = Math.max(420, h - 105);
    this.cellWidth = Math.floor(usableW / this.gridCols);
    this.cellHeight = Math.floor(usableH / this.gridRows);
    this.gridOriginX =
      Math.floor((w - this.cellWidth * this.gridCols) / 2) + Math.floor(this.cellWidth / 2);
    this.gridOriginY =
      Math.floor((h - this.cellHeight * this.gridRows) / 2) + Math.floor(this.cellHeight / 2) + 8;
  }

  private gridToWorld(col: number, row: number): { x: number; y: number } {
    return {
      x: this.gridOriginX + col * this.cellWidth,
      y: this.gridOriginY + row * this.cellHeight,
    };
  }

  private worldToGrid(x: number, y: number): { col: number; row: number } | null {
    const col = Math.round((x - this.gridOriginX) / this.cellWidth);
    const row = Math.round((y - this.gridOriginY) / this.cellHeight);
    if (col < 0 || col >= this.gridCols || row < 0 || row >= this.gridRows) {
      return null;
    }
    return { col, row };
  }

  private drawCyberGrid(): void {
    this.gridGraphics.clear();
    const w = this.scale.width;
    const h = this.scale.height;

    // Deep cyber slate background gradient aura
    this.gridGraphics.fillStyle(0x070b14, 1);
    this.gridGraphics.fillRect(0, 0, w, h);

    // Subtle column zone shading (Edge -> Compute -> Cache/Queue -> Storage)
    const zones: Array<{ startCol: number; endCol: number; color: number; label: string }> = [
      { startCol: 0, endCol: 3, color: 0x0ea5e9, label: 'EDGE & INGRESS ZONE' },
      { startCol: 4, endCol: 7, color: 0x3b82f6, label: 'STATELESS COMPUTE ZONE' },
      { startCol: 8, endCol: 9, color: 0x10b981, label: 'CACHE & ASYNC BUFFER' },
      { startCol: 10, endCol: 12, color: 0xa855f7, label: 'DURABLE STORAGE ZONE' },
    ];

    for (const zone of zones) {
      const topLeft = this.gridToWorld(zone.startCol, 0);
      const bottomRight = this.gridToWorld(zone.endCol, this.gridRows - 1);
      const rectX = topLeft.x - this.cellWidth * 0.46;
      const rectY = topLeft.y - this.cellHeight * 0.46;
      const rectW = bottomRight.x - topLeft.x + this.cellWidth * 0.92;
      const rectH = bottomRight.y - topLeft.y + this.cellHeight * 0.92;

      this.gridGraphics.fillStyle(zone.color, 0.03);
      this.gridGraphics.fillRoundedRect(rectX, rectY, rectW, rectH, 12);
      this.gridGraphics.lineStyle(1, zone.color, 0.14);
      this.gridGraphics.strokeRoundedRect(rectX, rectY, rectW, rectH, 12);
    }

    // Individual grid cells
    for (let r = 0; r < this.gridRows; r++) {
      for (let c = 0; c < this.gridCols; c++) {
        const pos = this.gridToWorld(c, r);
        const cw = this.cellWidth * 0.88;
        const ch = this.cellHeight * 0.88;
        this.gridGraphics.lineStyle(1, 0x1e293b, 0.65);
        this.gridGraphics.strokeRoundedRect(pos.x - cw / 2, pos.y - ch / 2, cw, ch, 8);

        // Corner tech dots
        this.gridGraphics.fillStyle(0x334155, 0.6);
        this.gridGraphics.fillCircle(pos.x, pos.y, 1.5);
      }
    }
  }

  private setupInputHandlers(): void {
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      const cell = this.worldToGrid(pointer.x, pointer.y);
      this.hoveredGrid = cell;
      this.renderHoverHighlight(pointer);
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) {
        this.wireStartNodeId = null;
        this.dragWireGraphics.clear();
        this.store.setToolMode('select');
        return;
      }

      const cell = this.worldToGrid(pointer.x, pointer.y);
      if (!cell) return;

      const clickedNode = this.findNodeAtGrid(cell.col, cell.row);
      const mode = this.store.toolMode();

      if (mode === 'delete') {
        if (clickedNode) {
          this.deleteNodeById(clickedNode.id);
        } else {
          // Check if user clicked near a wire to delete it
          const wire = this.findWireNearPoint(pointer.x, pointer.y);
          if (wire) {
            this.removeWire(wire.id);
          }
        }
        return;
      }

      if (mode === 'wire') {
        if (!clickedNode) {
          this.wireStartNodeId = null;
          this.dragWireGraphics.clear();
          return;
        }
        if (!this.wireStartNodeId) {
          this.wireStartNodeId = clickedNode.id;
          this.selectNode(clickedNode);
        } else if (this.wireStartNodeId === clickedNode.id) {
          this.wireStartNodeId = null;
          this.dragWireGraphics.clear();
        } else {
          this.connectNodesWithWire(this.wireStartNodeId, clickedNode.id, false, true);
          this.wireStartNodeId = clickedNode.id; // Chain wiring convenience!
          this.dragWireGraphics.clear();
        }
        return;
      }

      if (mode === 'build') {
        if (clickedNode) {
          this.selectNode(clickedNode);
          return;
        }
        this.tryPlaceNodeAt(this.store.selectedBuildType(), cell.col, cell.row);
        return;
      }

      // Default 'select' mode
      if (clickedNode) {
        this.selectNode(clickedNode);
      } else {
        this.selectNode(null);
      }
    });
  }

  private setupKeyboardShortcuts(): void {
    this.input.keyboard?.on('keydown-W', () => this.store.setToolMode('wire'));
    this.input.keyboard?.on('keydown-S', () => this.store.setToolMode('select'));
    this.input.keyboard?.on('keydown-B', () => this.store.setToolMode('build'));
    this.input.keyboard?.on('keydown-X', () => this.store.setToolMode('delete'));
    this.input.keyboard?.on('keydown-Z', (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        if (event.shiftKey) {
          this.performRedo();
        } else {
          this.performUndo();
        }
      }
    });
    this.input.keyboard?.on('keydown-Y', (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        this.performRedo();
      }
    });
    this.input.keyboard?.on('keydown-ESC', () => {
      this.wireStartNodeId = null;
      this.dragWireGraphics.clear();
      this.store.setToolMode('select');
    });
  }

  private renderHoverHighlight(pointer: Phaser.Input.Pointer): void {
    this.hoverGraphics.clear();
    this.dragWireGraphics.clear();

    if (this.store.toolMode() === 'wire' && this.wireStartNodeId) {
      const fromNode = this.nodesMap.get(this.wireStartNodeId);
      if (fromNode) {
        this.dragWireGraphics.lineStyle(3, 0x00f2fe, 0.85);
        this.dragWireGraphics.beginPath();
        this.dragWireGraphics.moveTo(fromNode.worldX, fromNode.worldY);
        this.dragWireGraphics.lineTo(pointer.x, pointer.y);
        this.dragWireGraphics.strokePath();
      }
    }

    if (!this.hoveredGrid) return;
    const pos = this.gridToWorld(this.hoveredGrid.col, this.hoveredGrid.row);
    const cw = this.cellWidth * 0.88;
    const ch = this.cellHeight * 0.88;

    const existing = this.findNodeAtGrid(this.hoveredGrid.col, this.hoveredGrid.row);
    const mode = this.store.toolMode();

    let color = 0x38bdf8;
    if (mode === 'build') {
      const cost = NODE_CATALOG[this.store.selectedBuildType()].cost;
      color = !existing && this.store.budget() >= cost ? 0x10b981 : 0xff4b5c;
    } else if (mode === 'delete') {
      color = 0xff4b5c;
    } else if (mode === 'wire') {
      color = 0x00f2fe;
    }

    this.hoverGraphics.lineStyle(2, color, 0.8);
    this.hoverGraphics.strokeRoundedRect(pos.x - cw / 2, pos.y - ch / 2, cw, ch, 10);
    this.hoverGraphics.fillStyle(color, 0.08);
    this.hoverGraphics.fillRoundedRect(pos.x - cw / 2, pos.y - ch / 2, cw, ch, 10);
  }

  private loadLevel(level: LevelDefinition): void {
    this.clearAllEntities();
    this.undoStack = [];
    this.redoStack = [];
    this.syncUndoRedoSignals();
    this.resetMetrics(level);

    for (const starter of level.starterNodes) {
      this.spawnNodeInternal(starter);
    }

    for (const wire of level.starterWires) {
      this.connectNodesWithWire(wire.fromId, wire.toId, true, false);
    }

    this.syncStoreTopology();
    this.renderWires();
  }

  private clearAllEntities(): void {
    for (const pkt of this.activePackets) {
      pkt.sprite.destroy();
      pkt.glow.destroy();
    }
    this.activePackets = [];

    for (const vis of this.nodeVisuals.values()) {
      vis.container.destroy();
    }
    this.nodeVisuals.clear();
    this.nodesMap.clear();
    this.wiresList = [];
    this.wireStartNodeId = null;
    this.dragWireGraphics?.clear();
  }

  private resetMetrics(level: LevelDefinition): void {
    this.waveTimeElapsedSec = 0;
    this.spawnAccumulator = 0;
    this.totalSpawned = 0;
    this.totalResolved = 0;
    this.totalBlockedMalicious = 0;
    this.totalFailed = 0;
    this.totalCacheHits = 0;
    this.totalCacheLookups = 0;
    this.latencySamples = [];
    this.recentRpsCount = 0;

    const totalSec = level.waves.reduce((acc, w) => acc + w.durationSec, 0);
    this.store.telemetry.set({
      currentRps: 0,
      incomingRps: level.waves[0]?.rps ?? 0,
      totalSpawned: 0,
      totalResolved: 0,
      totalBlockedMalicious: 0,
      totalFailed: 0,
      slaPercent: 100,
      p95LatencyMs: 0,
      cacheHitRatio: 0,
      waveElapsedSec: 0,
      waveTotalSec: totalSec,
      currentSegmentAnnouncement: level.waves[0]?.announcement ?? 'Ready',
      score: 0,
      starsEarned: 3,
    });
  }

  private spawnNodeInternal(placement: StarterNodePlacement): PlacedNode {
    const catalog = NODE_CATALOG[placement.type];
    const tier = placement.tier ?? 1;
    const stats = computeNodeStatsForTier(placement.type, tier);
    const pos = this.gridToWorld(placement.gridX, placement.gridY);

    const node: PlacedNode = {
      id: placement.id,
      type: placement.type,
      gridX: placement.gridX,
      gridY: placement.gridY,
      worldX: pos.x,
      worldY: pos.y,
      locked: placement.locked ?? false,
      tier,
      label: placement.label ?? `${catalog.shortLabel}-${++this.nodeCounter % 100}`,
      lbStrategy: 'round_robin',
      cacheStrategy: 'lru_85',
      shardStrategy: 'consistent_hash',
      currentLoad: 0,
      maxCapacity: stats.maxCapacity,
      queueDepth: 0,
      maxQueue: stats.maxQueue,
      latencyMs: stats.latencyMs,
      health: 100,
      isOverloaded: false,
      totalProcessed: 0,
      totalDropped: 0,
      cacheHits: 0,
      cacheMisses: 0,
      roundRobinIndex: 0,
    };

    this.nodesMap.set(node.id, node);
    this.createNodeVisual(node);
    return node;
  }

  private createNodeVisual(node: PlacedNode): void {
    const catalog = NODE_CATALOG[node.type];
    const container = this.add.container(node.worldX, node.worldY).setDepth(10);

    const selectionRing = this.add.circle(0, 0, 44, catalog.accentNumber, 0);
    selectionRing.setStrokeStyle(2.5, 0x00f2fe, 0);

    const basePlate = this.add.graphics();
    this.drawNodeBasePlate(basePlate, catalog.accentNumber, node.tier);

    const sprite = this.add.sprite(0, -4, catalog.spriteKey);
    sprite.setDisplaySize(64, 64);

    // Subtle floating idle animation
    this.tweens.add({
      targets: sprite,
      y: -7,
      duration: 1400 + Math.random() * 400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const labelText = this.add
      .text(0, 31, node.label, {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#f8fafc',
        stroke: '#020617',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0.5);

    const tierBadge = this.add
      .text(26, -34, `T${node.tier}`, {
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: '10px',
        fontStyle: 'bold',
        color: '#020617',
        backgroundColor: catalog.colorHex,
        padding: { x: 4, y: 1 },
      })
      .setOrigin(0.5, 0.5);

    const metricsText = this.add
      .text(0, -40, `${node.maxCapacity} RPS`, {
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: '9px',
        color: '#94a3b8',
        stroke: '#020617',
        strokeThickness: 2,
      })
      .setOrigin(0.5, 0.5);

    const loadBarBg = this.add.rectangle(0, 42, 62, 5, 0x1e293b, 0.9);
    const loadBarFill = this.add.rectangle(-31, 42, 0, 5, 0x10b981, 1).setOrigin(0, 0.5);

    const statusLed = this.add.circle(-28, -34, 4.5, 0x10b981, 1);
    statusLed.setStrokeStyle(1.5, 0x020617, 1);

    container.add([
      selectionRing,
      basePlate,
      sprite,
      loadBarBg,
      loadBarFill,
      labelText,
      tierBadge,
      metricsText,
      statusLed,
    ]);

    this.nodeVisuals.set(node.id, {
      container,
      basePlate,
      sprite,
      labelText,
      tierBadge,
      metricsText,
      loadBarBg,
      loadBarFill,
      statusLed,
      selectionRing,
    });
  }

  private drawNodeBasePlate(
    g: Phaser.GameObjects.Graphics,
    accentColor: number,
    tier: number
  ): void {
    g.clear();
    g.fillStyle(0x0f172a, 0.92);
    g.fillRoundedRect(-36, -34, 72, 68, 12);
    g.lineStyle(tier >= 3 ? 2.5 : 1.5, accentColor, tier >= 2 ? 0.9 : 0.55);
    g.strokeRoundedRect(-36, -34, 72, 68, 12);
  }

  private updateNodeVisualTelemetry(node: PlacedNode): void {
    const vis = this.nodeVisuals.get(node.id);
    if (!vis) return;

    const loadRatio = Math.min(
      1,
      (node.currentLoad + node.queueDepth * 0.6) / Math.max(1, node.maxCapacity)
    );
    vis.loadBarFill.width = Math.max(2, loadRatio * 62);

    if (loadRatio > 0.85 || node.isOverloaded) {
      vis.loadBarFill.setFillStyle(0xff4b5c);
      vis.statusLed.setFillStyle(0xff4b5c);
    } else if (loadRatio > 0.55) {
      vis.loadBarFill.setFillStyle(0xfbbf24);
      vis.statusLed.setFillStyle(0xfbbf24);
    } else {
      vis.loadBarFill.setFillStyle(0x10b981);
      vis.statusLed.setFillStyle(0x10b981);
    }

    if (node.type === 'redis_cache' && node.cacheHits + node.cacheMisses > 0) {
      const hitPct = Math.round((node.cacheHits / (node.cacheHits + node.cacheMisses)) * 100);
      vis.metricsText.setText(`HIT ${hitPct}% | ${node.maxCapacity} RPS`);
    } else {
      const qLabel = node.queueDepth >= 1 ? `Q:${Math.round(node.queueDepth)} ` : '';
      vis.metricsText.setText(`${qLabel}${node.maxCapacity} RPS`);
    }
  }

  private repositionAllNodes(): void {
    for (const node of this.nodesMap.values()) {
      const pos = this.gridToWorld(node.gridX, node.gridY);
      node.worldX = pos.x;
      node.worldY = pos.y;
      const vis = this.nodeVisuals.get(node.id);
      if (vis) {
        vis.container.setPosition(pos.x, pos.y);
      }
    }
  }

  private tryPlaceNodeAt(type: NodeType, col: number, row: number): void {
    const catalog = NODE_CATALOG[type];
    if (!catalog.canPlace) return;

    if (this.findNodeAtGrid(col, row)) {
      this.store.triggerToast('Grid cell is already occupied!');
      return;
    }

    if (this.store.budget() < catalog.cost) {
      this.store.triggerToast(`Insufficient Cloud Budget! Need $${catalog.cost}.`);
      return;
    }

    this.recordUndoStep();
    this.store.budget.update((b) => b - catalog.cost);
    const placed = this.spawnNodeInternal({
      id: `node_${++this.nodeCounter}`,
      type,
      gridX: col,
      gridY: row,
      tier: 1,
    });

    this.store.sound.playPlaceNode();
    this.spawnFloatingText(placed.worldX, placed.worldY - 30, `-$${catalog.cost}`, '#38bdf8');
    this.selectNode(placed);
    this.syncStoreTopology();
  }

  private connectNodesWithWire(
    fromId: string,
    toId: string,
    silent = false,
    recordHistory = true
  ): void {
    if (fromId === toId) return;
    const fromNode = this.nodesMap.get(fromId);
    const toNode = this.nodesMap.get(toId);
    if (!fromNode || !toNode) return;

    if (toNode.type === 'ingress') {
      if (!silent) this.store.triggerToast('Cannot route traffic back into Internet Ingress!');
      return;
    }

    const exists = this.wiresList.some((w) => w.fromNodeId === fromId && w.toNodeId === toId);
    if (exists) {
      if (!silent) this.store.triggerToast('Nodes are already connected!');
      return;
    }

    // Prevent immediate 2-node loop
    const reverseExists = this.wiresList.some(
      (w) => w.fromNodeId === toId && w.toNodeId === fromId
    );
    if (reverseExists) {
      if (!silent) this.store.triggerToast('Circular wire loop prevented!');
      return;
    }

    if (recordHistory) {
      this.recordUndoStep();
    }

    this.wiresList.push({
      id: `wire_${fromId}_${toId}`,
      fromNodeId: fromId,
      toNodeId: toId,
      activePackets: 0,
      totalRouted: 0,
    });

    if (!silent) {
      this.store.sound.playWireConnect();
      this.spawnFloatingText(toNode.worldX, toNode.worldY - 28, 'LINKED ⚡', '#00f2fe');
    }
    this.syncStoreTopology();
  }

  private removeWire(wireId: string): void {
    this.recordUndoStep();
    this.wiresList = this.wiresList.filter((w) => w.id !== wireId);
    this.syncStoreTopology();
  }

  private upgradeNodeById(nodeId: string): void {
    const node = this.nodesMap.get(nodeId);
    if (!node || node.type === 'ingress') return;
    if (node.tier >= 3) {
      this.store.triggerToast('Node is already at Maximum Tier (Tier 3)!');
      return;
    }

    const stats = computeNodeStatsForTier(node.type, node.tier);
    const cost = stats.upgradeCost;
    if (this.store.budget() < cost) {
      this.store.triggerToast(`Need $${cost} to upgrade to Tier ${node.tier + 1}!`);
      return;
    }

    this.recordUndoStep();
    this.store.budget.update((b) => b - cost);
    node.tier += 1;
    const nextStats = computeNodeStatsForTier(node.type, node.tier);
    node.maxCapacity = nextStats.maxCapacity;
    node.maxQueue = nextStats.maxQueue;
    node.latencyMs = nextStats.latencyMs;

    const vis = this.nodeVisuals.get(node.id);
    if (vis) {
      vis.tierBadge.setText(`T${node.tier}`);
      this.drawNodeBasePlate(vis.basePlate, NODE_CATALOG[node.type].accentNumber, node.tier);
      this.tweens.add({
        targets: vis.container,
        scaleX: 1.16,
        scaleY: 1.16,
        duration: 140,
        yoyo: true,
      });
    }

    this.store.sound.playUpgrade();
    this.spawnFloatingText(node.worldX, node.worldY - 35, `TIER ${node.tier} UPGRADE!`, '#10b981');
    this.selectNode({ ...node });
    this.syncStoreTopology();
  }

  private deleteNodeById(nodeId: string): void {
    const node = this.nodesMap.get(nodeId);
    if (!node) return;
    if (node.locked || node.type === 'ingress') {
      this.store.triggerToast('This core infrastructure node is locked for this level.');
      return;
    }

    this.recordUndoStep();
    const catalog = NODE_CATALOG[node.type];
    const refund = Math.round(catalog.cost * 0.75);
    this.store.budget.update((b) => b + refund);

    const vis = this.nodeVisuals.get(nodeId);
    if (vis) {
      vis.container.destroy();
      this.nodeVisuals.delete(nodeId);
    }
    this.nodesMap.delete(nodeId);
    this.wiresList = this.wiresList.filter(
      (w) => w.fromNodeId !== nodeId && w.toNodeId !== nodeId
    );

    this.spawnFloatingText(node.worldX, node.worldY, `+$${refund} Refund`, '#fbbf24');
    if (this.store.selectedNode()?.id === nodeId) {
      this.selectNode(null);
    }
    this.syncStoreTopology();
  }

  private updateNodeStrategy(
    nodeId: string,
    lb?: LoadBalancingStrategy,
    cache?: CacheEvictionStrategy,
    shard?: ShardingStrategy
  ): void {
    const node = this.nodesMap.get(nodeId);
    if (!node) return;
    this.recordUndoStep();
    if (lb) node.lbStrategy = lb;
    if (cache) node.cacheStrategy = cache;
    if (shard) node.shardStrategy = shard;
    this.selectNode({ ...node });
    this.syncStoreTopology();
  }

  private selectNode(node: PlacedNode | null): void {
    for (const [id, vis] of this.nodeVisuals.entries()) {
      const isSelected = node?.id === id;
      vis.selectionRing.setStrokeStyle(2.5, 0x00f2fe, isSelected ? 0.95 : 0);
      vis.selectionRing.setFillStyle(0x00f2fe, isSelected ? 0.12 : 0);
    }
    this.store.selectedNode.set(node ? { ...node } : null);
  }

  private renderWires(): void {
    this.wireGraphics.clear();

    for (const wire of this.wiresList) {
      const from = this.nodesMap.get(wire.fromNodeId);
      const to = this.nodesMap.get(wire.toNodeId);
      if (!from || !to) continue;

      // Outer pipe casing
      this.wireGraphics.lineStyle(5, 0x1e293b, 0.9);
      this.wireGraphics.beginPath();
      this.wireGraphics.moveTo(from.worldX, from.worldY);
      this.wireGraphics.lineTo(to.worldX, to.worldY);
      this.wireGraphics.strokePath();

      // Inner glowing fiber core
      const isBusy = wire.activePackets > 0;
      this.wireGraphics.lineStyle(2, isBusy ? 0x00f2fe : 0x38bdf8, isBusy ? 0.85 : 0.45);
      this.wireGraphics.beginPath();
      this.wireGraphics.moveTo(from.worldX, from.worldY);
      this.wireGraphics.lineTo(to.worldX, to.worldY);
      this.wireGraphics.strokePath();

      // Animated directional energy pulses along the wire
      const dx = to.worldX - from.worldX;
      const dy = to.worldY - from.worldY;
      const dist = Math.hypot(dx, dy);
      if (dist > 10) {
        const steps = Math.max(2, Math.floor(dist / 28));
        for (let i = 0; i < steps; i++) {
          const t = (i / steps + this.dashOffset / 24 / steps) % 1;
          const px = from.worldX + dx * t;
          const py = from.worldY + dy * t;
          this.wireGraphics.fillStyle(0x00f2fe, 0.75);
          this.wireGraphics.fillCircle(px, py, 2.2);
        }
      }
    }
  }

  private startWaveSimulation(): void {
    this.resetMetrics(this.store.currentLevel());
    for (const node of this.nodesMap.values()) {
      node.currentLoad = 0;
      node.queueDepth = 0;
      node.totalProcessed = 0;
      node.totalDropped = 0;
      node.cacheHits = 0;
      node.cacheMisses = 0;
    }
  }

  private resetWaveSimulation(): void {
    for (const pkt of this.activePackets) {
      pkt.sprite.destroy();
      pkt.glow.destroy();
    }
    this.activePackets = [];
    this.resetMetrics(this.store.currentLevel());
    for (const node of this.nodesMap.values()) {
      node.currentLoad = 0;
      node.queueDepth = 0;
      this.updateNodeVisualTelemetry(node);
    }
  }

  private updateWaveSpawner(dt: number): void {
    const level = this.store.currentLevel();
    const totalWaveDuration = level.waves.reduce((acc, w) => acc + w.durationSec, 0);

    this.waveTimeElapsedSec += dt;

    // Determine active segment
    let cursor = 0;
    let currentSegment = level.waves[level.waves.length - 1];
    for (const seg of level.waves) {
      if (this.waveTimeElapsedSec <= cursor + seg.durationSec) {
        currentSegment = seg;
        break;
      }
      cursor += seg.durationSec;
    }

    if (this.waveTimeElapsedSec < totalWaveDuration || level.isInfiniteSandbox) {
      const effectiveRps = level.isInfiniteSandbox
        ? currentSegment.rps * (1 + Math.max(0, this.waveTimeElapsedSec - totalWaveDuration) * 0.03)
        : currentSegment.rps;

      this.spawnAccumulator += effectiveRps * dt;
      while (this.spawnAccumulator >= 1) {
        this.spawnAccumulator -= 1;
        this.spawnPacketFromIngress(currentSegment.mix);
      }
    } else if (this.activePackets.length === 0) {
      // Wave finished and all in-flight packets drained!
      this.completeWaveEvaluation();
    }
  }

  private spawnPacketFromIngress(mix: {
    GET: number;
    POST: number;
    STATIC: number;
    ASYNC: number;
    MALICIOUS: number;
  }): void {
    const ingressNodes = Array.from(this.nodesMap.values()).filter((n) => n.type === 'ingress');
    if (ingressNodes.length === 0) return;

    const ingress = ingressNodes[this.totalSpawned % ingressNodes.length];
    const packetType = this.rollPacketType(mix);
    this.totalSpawned++;
    this.recentRpsCount++;

    const outgoing = this.wiresList.filter((w) => w.fromNodeId === ingress.id);
    const outcome = evaluatePacketAtNode(
      ingress,
      packetType,
      this.packetCounter,
      outgoing,
      this.nodesMap,
      Math.random()
    );

    if (outcome.action !== 'forward' || !outcome.targetNodeId) {
      this.recordPacketDrop(ingress, 'No Route from Ingress!');
      return;
    }

    this.launchPacketOnWire(
      packetType,
      ingress.id,
      outcome.targetNodeId,
      outcome.addedLatencyMs,
      1
    );
  }

  private rollPacketType(mix: {
    GET: number;
    POST: number;
    STATIC: number;
    ASYNC: number;
    MALICIOUS: number;
  }): PacketType {
    const total = mix.GET + mix.POST + mix.STATIC + mix.ASYNC + mix.MALICIOUS;
    let roll = Math.random() * Math.max(1, total);
    if ((roll -= mix.GET) <= 0) return 'GET';
    if ((roll -= mix.POST) <= 0) return 'POST';
    if ((roll -= mix.STATIC) <= 0) return 'STATIC';
    if ((roll -= mix.ASYNC) <= 0) return 'ASYNC';
    return 'MALICIOUS';
  }

  private launchPacketOnWire(
    type: PacketType,
    fromNodeId: string,
    toNodeId: string,
    accumulatedLatencyMs: number,
    hops: number,
    existingHashKey?: number
  ): void {
    const fromNode = this.nodesMap.get(fromNodeId);
    const toNode = this.nodesMap.get(toNodeId);
    if (!fromNode || !toNode) return;

    const visual = PACKET_VISUALS[type];
    const glow = this.add
      .circle(fromNode.worldX, fromNode.worldY, 12, visual.colorNum, 0.25)
      .setDepth(15);
    const sprite = this.add
      .sprite(fromNode.worldX, fromNode.worldY, visual.spriteKey)
      .setDepth(16);
    sprite.setDisplaySize(24, 24);

    const wire = this.wiresList.find((w) => w.fromNodeId === fromNodeId && w.toNodeId === toNodeId);
    if (wire) {
      wire.activePackets++;
      wire.totalRouted++;
    }

    this.activePackets.push({
      id: `pkt_${++this.packetCounter}`,
      type,
      hashKey: existingHashKey ?? this.packetCounter,
      currentNodeId: fromNodeId,
      targetNodeId: toNodeId,
      wireId: wire?.id ?? '',
      progress: 0,
      speed: visual.baseSpeed,
      accumulatedLatencyMs,
      hops,
      sprite,
      glow,
    });
  }

  private updateActivePackets(dt: number): void {
    const remaining: ActivePacket[] = [];

    for (const pkt of this.activePackets) {
      const fromNode = this.nodesMap.get(pkt.currentNodeId);
      const toNode = this.nodesMap.get(pkt.targetNodeId);

      if (!fromNode || !toNode) {
        pkt.sprite.destroy();
        pkt.glow.destroy();
        continue;
      }

      const dist = Math.max(
        40,
        Math.hypot(toNode.worldX - fromNode.worldX, toNode.worldY - fromNode.worldY)
      );
      pkt.progress += (pkt.speed * dt) / dist;

      const x = Phaser.Math.Linear(fromNode.worldX, toNode.worldX, Math.min(1, pkt.progress));
      const y = Phaser.Math.Linear(fromNode.worldY, toNode.worldY, Math.min(1, pkt.progress));
      pkt.sprite.setPosition(x, y);
      pkt.glow.setPosition(x, y);

      if (pkt.progress >= 1) {
        // Arrived at target node!
        const wire = this.wiresList.find((w) => w.id === pkt.wireId);
        if (wire && wire.activePackets > 0) {
          wire.activePackets--;
        }
        pkt.sprite.destroy();
        pkt.glow.destroy();
        this.handlePacketArrival(pkt, toNode);
      } else {
        remaining.push(pkt);
      }
    }

    this.activePackets = remaining;
  }

  private handlePacketArrival(pkt: ActivePacket, node: PlacedNode): void {
    if (pkt.hops > 9) {
      this.recordPacketDrop(node, '508 Loop Detected / TTL Exceeded!');
      return;
    }

    // Increment load on target node
    node.currentLoad += 1;
    if (node.currentLoad > node.maxCapacity * 0.75) {
      // Message queues absorb burst load gently into their large buffer
      const queueAdder = node.type === 'message_queue' ? 0.35 : 0.75;
      node.queueDepth += queueAdder;
    }

    const outgoing = this.wiresList.filter((w) => w.fromNodeId === node.id);
    const outcome = evaluatePacketAtNode(
      node,
      pkt.type,
      pkt.hashKey,
      outgoing,
      this.nodesMap,
      Math.random()
    );

    const totalLatency = pkt.accumulatedLatencyMs + outcome.addedLatencyMs;

    if (node.type === 'redis_cache' && pkt.type === 'GET') {
      this.totalCacheLookups++;
      if (outcome.isCacheHit) {
        node.cacheHits++;
        this.totalCacheHits++;
      } else {
        node.cacheMisses++;
      }
    }

    if (outcome.action === 'resolve') {
      node.totalProcessed++;
      this.totalResolved++;
      this.latencySamples.push(totalLatency);
      if (outcome.isCacheHit) {
        this.store.sound.playCacheHit();
        this.spawnParticleBurst(node.worldX, node.worldY, 0x00f2fe, 5);
        if (Math.random() < 0.35) {
          this.spawnFloatingText(node.worldX, node.worldY - 26, outcome.reasonLabel, '#00f2fe');
        }
      } else {
        this.store.sound.playPacketResolved();
        this.spawnParticleBurst(node.worldX, node.worldY, 0x10b981, 5);
        if (Math.random() < 0.25) {
          this.spawnFloatingText(node.worldX, node.worldY - 26, outcome.reasonLabel, '#34d399');
        }
      }
      return;
    }

    if (outcome.action === 'block_malicious') {
      node.totalProcessed++;
      this.totalBlockedMalicious++;
      this.store.sound.playWafBlock();
      this.spawnParticleBurst(node.worldX, node.worldY, 0xff4b5c, 6);
      if (Math.random() < 0.4) {
        this.spawnFloatingText(node.worldX, node.worldY - 26, '🛡️ 403 DDoS Blocked', '#fb7185');
      }
      return;
    }

    if (outcome.action === 'forward' && outcome.targetNodeId) {
      node.totalProcessed++;
      this.launchPacketOnWire(
        pkt.type,
        node.id,
        outcome.targetNodeId,
        totalLatency,
        pkt.hops + 1,
        pkt.hashKey
      );
      return;
    }

    // Dropped / 503 Error!
    this.recordPacketDrop(node, outcome.reasonLabel);
  }

  private recordPacketDrop(node: PlacedNode, reason: string): void {
    node.totalDropped++;
    this.totalFailed++;
    this.store.sound.playPacketDropped();
    this.spawnParticleBurst(node.worldX, node.worldY, 0xff3366, 8);
    this.cameras.main.shake(90, 0.0025);
    if (Math.random() < 0.65) {
      this.spawnFloatingText(node.worldX, node.worldY - 28, `❌ ${reason}`, '#ff4b5c');
    }
  }

  private spawnParticleBurst(x: number, y: number, color: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const dist = 18 + Math.random() * 18;
      const dot = this.add.circle(x, y, 3, color, 0.9).setDepth(20);
      this.tweens.add({
        targets: dot,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        scale: 0.2,
        duration: 280,
        onComplete: () => dot.destroy(),
      });
    }
  }

  private spawnFloatingText(x: number, y: number, text: string, color: string): void {
    const label = this.add
      .text(x, y, text, {
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: '10px',
        fontStyle: 'bold',
        color,
        stroke: '#020617',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0.5)
      .setDepth(30);

    this.tweens.add({
      targets: label,
      y: y - 24,
      alpha: 0,
      duration: 850,
      ease: 'Cubic.easeOut',
      onComplete: () => label.destroy(),
    });
  }

  private publishTelemetrySnapshot(windowSec: number): void {
    const level = this.store.currentLevel();
    const totalCompleted = this.totalResolved + this.totalBlockedMalicious + this.totalFailed;
    const sla =
      totalCompleted === 0
        ? 100
        : Number(
            (((this.totalResolved + this.totalBlockedMalicious) / totalCompleted) * 100).toFixed(1)
          );

    let p95 = 0;
    if (this.latencySamples.length > 0) {
      const sorted = [...this.latencySamples].sort((a, b) => a - b);
      const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
      p95 = Math.round(sorted[idx]);
    }

    const cacheHitRatio =
      this.totalCacheLookups === 0
        ? 0
        : Math.round((this.totalCacheHits / this.totalCacheLookups) * 100);

    let cursor = 0;
    let activeAnnouncement = level.waves[level.waves.length - 1]?.announcement ?? '';
    let incomingRps = 0;
    for (const seg of level.waves) {
      if (this.waveTimeElapsedSec <= cursor + seg.durationSec) {
        activeAnnouncement = seg.announcement;
        incomingRps = seg.rps;
        break;
      }
      cursor += seg.durationSec;
    }

    const totalWaveDuration = level.waves.reduce((acc, w) => acc + w.durationSec, 0);
    const currentRps = Math.round(this.recentRpsCount / Math.max(0.1, windowSec));
    this.recentRpsCount = 0;

    const score = Math.max(
      0,
      Math.round(
        (this.totalResolved + this.totalBlockedMalicious) * 15 -
          this.totalFailed * 40 +
          this.store.budget() * 0.5
      )
    );

    this.store.telemetry.set({
      currentRps,
      incomingRps,
      totalSpawned: this.totalSpawned,
      totalResolved: this.totalResolved,
      totalBlockedMalicious: this.totalBlockedMalicious,
      totalFailed: this.totalFailed,
      slaPercent: sla,
      p95LatencyMs: p95,
      cacheHitRatio,
      waveElapsedSec: Math.min(totalWaveDuration, Math.round(this.waveTimeElapsedSec)),
      waveTotalSec: totalWaveDuration,
      currentSegmentAnnouncement: activeAnnouncement,
      score,
      starsEarned: this.computeStars(sla, p95, level),
    });

    if (this.store.selectedNode()) {
      const fresh = this.nodesMap.get(this.store.selectedNode()!.id);
      if (fresh) {
        this.store.selectedNode.set({ ...fresh });
      }
    }
  }

  private computeStars(sla: number, p95: number, level: LevelDefinition): number {
    if (sla < level.targetSlaPercent) return 0;
    let stars = 1;
    if (sla >= Math.min(99, level.targetSlaPercent + 1.5)) stars++;
    if (p95 <= level.targetLatencyMs || p95 === 0) stars++;
    return stars;
  }

  private completeWaveEvaluation(): void {
    this.publishTelemetrySnapshot(0.25);
    const snap = this.store.telemetry();
    const level = this.store.currentLevel();

    const primaryDbCount = Array.from(this.nodesMap.values()).filter((n) => n.type === 'sql_db').length;
    const hasSplitBrain = primaryDbCount > 1;

    const passed =
      snap.slaPercent >= level.targetSlaPercent && snap.totalResolved > 0 && !hasSplitBrain;
    const stars = passed ? Math.max(1, snap.starsEarned) : 0;

    let feedbackSummary = '';
    if (hasSplitBrain) {
      feedbackSummary =
        '🚨 Split-Brain Outage! You placed multiple unsharded Primary SQL Databases. Round-robining writes across 2 Primary DBs causes data corruption (409 Split-Brain Conflicts). Use ONE Primary SQL DB and upgrade its Tier (Vertical Scaling), or use Read Replicas / DB Shards!';
    } else if (passed && stars === 3) {
      feedbackSummary =
        'Flawless Principal Architecture! High availability and ultra-low P95 latency achieved within budget.';
    } else if (passed) {
      feedbackSummary = `SLA Target met (${snap.slaPercent}%), but P95 latency (${snap.p95LatencyMs}ms) can be improved with caching or higher node tiers.`;
    } else {
      feedbackSummary = `SLA dropped to ${snap.slaPercent}% (Target: ${level.targetSlaPercent}%). Check the level hints to eliminate bottlenecks and single points of failure!`;
    }

    this.store.recordLevelCompletion({
      levelId: level.id,
      passed,
      stars,
      slaPercent: snap.slaPercent,
      p95LatencyMs: snap.p95LatencyMs,
      budgetRemaining: this.store.budget(),
      totalResolved: snap.totalResolved,
      totalFailed: snap.totalFailed,
      totalBlockedMalicious: snap.totalBlockedMalicious,
      score: snap.score,
      feedbackSummary,
    });
  }

  /**
   * One-click "Auto-Architect Blueprint" helper so players (or demo viewers) can see a reference solution for any level.
   */
  private applyOptimalArchitectureForCurrentLevel(): void {
    this.recordUndoStep();
    const level = this.store.currentLevel();
    this.store.budget.set(level.startingBudget);
    this.clearAllEntities();
    this.resetMetrics(level);

    const place = (p: StarterNodePlacement) => this.spawnNodeInternal(p);
    const wire = (fromId: string, toId: string) =>
      this.connectNodesWithWire(fromId, toId, true, false);

    if (level.id === 1) {
      place({
        id: 'n_ingress_1',
        type: 'ingress',
        gridX: 1,
        gridY: 3,
        locked: true,
        label: 'DNS Ingress',
      });
      place({ id: 'n_app_1', type: 'app_server', gridX: 5, gridY: 3, tier: 2, label: 'App-01' });
      place({ id: 'n_db_1', type: 'sql_db', gridX: 9, gridY: 3, tier: 2, label: 'Primary-SQL' });
      wire('n_ingress_1', 'n_app_1');
      wire('n_app_1', 'n_db_1');
      this.store.budget.set(140);
    } else if (level.id === 2) {
      place({
        id: 'n_ingress_1',
        type: 'ingress',
        gridX: 1,
        gridY: 3,
        locked: true,
        label: 'Global Ingress',
      });
      place({
        id: 'n_lb_1',
        type: 'load_balancer',
        gridX: 3,
        gridY: 3,
        tier: 2,
        label: 'ALB-Edge',
      });
      place({ id: 'n_app_1', type: 'app_server', gridX: 6, gridY: 1, tier: 2, label: 'App-North' });
      place({
        id: 'n_app_2',
        type: 'app_server',
        gridX: 6,
        gridY: 3,
        tier: 2,
        label: 'App-Center',
      });
      place({ id: 'n_app_3', type: 'app_server', gridX: 6, gridY: 5, tier: 2, label: 'App-South' });
      place({ id: 'n_db_1', type: 'sql_db', gridX: 10, gridY: 3, tier: 3, label: 'Primary-SQL' });
      wire('n_ingress_1', 'n_lb_1');
      wire('n_lb_1', 'n_app_1');
      wire('n_lb_1', 'n_app_2');
      wire('n_lb_1', 'n_app_3');
      wire('n_app_1', 'n_db_1');
      wire('n_app_2', 'n_db_1');
      wire('n_app_3', 'n_db_1');
      this.store.budget.set(110);
    } else if (level.id === 3) {
      place({
        id: 'n_ingress_1',
        type: 'ingress',
        gridX: 1,
        gridY: 3,
        locked: true,
        label: 'Global Ingress',
      });
      place({
        id: 'n_lb_1',
        type: 'load_balancer',
        gridX: 3,
        gridY: 3,
        tier: 2,
        label: 'Nginx-LB',
      });
      place({ id: 'n_app_1', type: 'app_server', gridX: 5, gridY: 2, tier: 2, label: 'App-01' });
      place({ id: 'n_app_2', type: 'app_server', gridX: 5, gridY: 4, tier: 2, label: 'App-02' });
      place({
        id: 'n_redis_1',
        type: 'redis_cache',
        gridX: 8,
        gridY: 3,
        tier: 2,
        label: 'Redis-RAM',
      });
      place({ id: 'n_db_1', type: 'sql_db', gridX: 10, gridY: 3, tier: 2, label: 'Primary-SQL' });
      wire('n_ingress_1', 'n_lb_1');
      wire('n_lb_1', 'n_app_1');
      wire('n_lb_1', 'n_app_2');
      wire('n_app_1', 'n_redis_1');
      wire('n_app_2', 'n_redis_1');
      wire('n_redis_1', 'n_db_1');
      this.store.budget.set(180);
    } else if (level.id === 4) {
      place({
        id: 'n_ingress_1',
        type: 'ingress',
        gridX: 1,
        gridY: 3,
        locked: true,
        label: 'Global DNS',
      });
      place({ id: 'n_cdn_1', type: 'cdn', gridX: 3, gridY: 3, tier: 2, label: 'CloudFront-CDN' });
      place({
        id: 'n_lb_1',
        type: 'load_balancer',
        gridX: 5,
        gridY: 3,
        tier: 2,
        label: 'ALB-Origin',
      });
      place({ id: 'n_app_1', type: 'app_server', gridX: 7, gridY: 2, tier: 2, label: 'App-01' });
      place({ id: 'n_app_2', type: 'app_server', gridX: 7, gridY: 4, tier: 2, label: 'App-02' });
      place({
        id: 'n_redis_1',
        type: 'redis_cache',
        gridX: 9,
        gridY: 2,
        tier: 2,
        label: 'Redis-Edge',
      });
      place({
        id: 'n_db_1',
        type: 'sql_db',
        gridX: 11,
        gridY: 2,
        tier: 2,
        label: 'Primary-Write-DB',
      });
      place({
        id: 'n_rep_1',
        type: 'read_replica',
        gridX: 11,
        gridY: 4,
        tier: 2,
        label: 'Read-Replica-1',
      });
      wire('n_ingress_1', 'n_cdn_1');
      wire('n_cdn_1', 'n_lb_1');
      wire('n_lb_1', 'n_app_1');
      wire('n_lb_1', 'n_app_2');
      wire('n_app_1', 'n_redis_1');
      wire('n_app_2', 'n_redis_1');
      wire('n_app_1', 'n_db_1');
      wire('n_app_2', 'n_db_1');
      wire('n_redis_1', 'n_rep_1');
      this.store.budget.set(190);
    } else if (level.id === 5) {
      place({
        id: 'n_ingress_1',
        type: 'ingress',
        gridX: 1,
        gridY: 3,
        locked: true,
        label: 'Checkout Ingress',
      });
      place({
        id: 'n_lb_1',
        type: 'load_balancer',
        gridX: 3,
        gridY: 3,
        tier: 2,
        label: 'Edge-LB',
      });
      place({
        id: 'n_app_1',
        type: 'app_server',
        gridX: 5,
        gridY: 2,
        tier: 3,
        label: 'Checkout-API-1',
      });
      place({
        id: 'n_app_2',
        type: 'app_server',
        gridX: 5,
        gridY: 4,
        tier: 3,
        label: 'Checkout-API-2',
      });
      place({
        id: 'n_mq_1',
        type: 'message_queue',
        gridX: 8,
        gridY: 2,
        tier: 2,
        label: 'Kafka-Broker',
      });
      place({
        id: 'n_redis_1',
        type: 'redis_cache',
        gridX: 8,
        gridY: 4,
        tier: 2,
        label: 'Redis-Cache',
      });
      place({ id: 'n_db_1', type: 'sql_db', gridX: 11, gridY: 3, tier: 3, label: 'Orders-SQL' });
      wire('n_ingress_1', 'n_lb_1');
      wire('n_lb_1', 'n_app_1');
      wire('n_lb_1', 'n_app_2');
      wire('n_app_1', 'n_mq_1');
      wire('n_app_2', 'n_mq_1');
      wire('n_app_1', 'n_redis_1');
      wire('n_app_2', 'n_redis_1');
      wire('n_mq_1', 'n_db_1');
      wire('n_redis_1', 'n_db_1');
      this.store.budget.set(220);
    } else if (level.id === 6) {
      place({
        id: 'n_ingress_1',
        type: 'ingress',
        gridX: 1,
        gridY: 3,
        locked: true,
        label: 'Telemetry Ingress',
      });
      place({
        id: 'n_lb_1',
        type: 'load_balancer',
        gridX: 3,
        gridY: 3,
        tier: 3,
        label: 'Ingress-LB',
      });
      place({
        id: 'n_app_1',
        type: 'app_server',
        gridX: 5,
        gridY: 1,
        tier: 3,
        label: 'Ingest-App-1',
      });
      place({
        id: 'n_app_2',
        type: 'app_server',
        gridX: 5,
        gridY: 3,
        tier: 3,
        label: 'Ingest-App-2',
      });
      place({
        id: 'n_app_3',
        type: 'app_server',
        gridX: 5,
        gridY: 5,
        tier: 3,
        label: 'Ingest-App-3',
      });
      place({
        id: 'n_lb_2',
        type: 'load_balancer',
        gridX: 8,
        gridY: 3,
        tier: 3,
        label: 'Shard-Router',
      });
      place({
        id: 'n_shard_1',
        type: 'db_shard',
        gridX: 11,
        gridY: 1,
        tier: 2,
        label: 'Shard-Alpha',
      });
      place({
        id: 'n_shard_2',
        type: 'db_shard',
        gridX: 11,
        gridY: 3,
        tier: 2,
        label: 'Shard-Beta',
      });
      place({
        id: 'n_shard_3',
        type: 'db_shard',
        gridX: 11,
        gridY: 5,
        tier: 2,
        label: 'Shard-Gamma',
      });
      wire('n_ingress_1', 'n_lb_1');
      wire('n_lb_1', 'n_app_1');
      wire('n_lb_1', 'n_app_2');
      wire('n_lb_1', 'n_app_3');
      wire('n_app_1', 'n_lb_2');
      wire('n_app_2', 'n_lb_2');
      wire('n_app_3', 'n_lb_2');
      wire('n_lb_2', 'n_shard_1');
      wire('n_lb_2', 'n_shard_2');
      wire('n_lb_2', 'n_shard_3');
      this.store.budget.set(250);
    } else {
      // Level 7 & 8 Planet Scale reference topology
      place({
        id: 'n_ingress_1',
        type: 'ingress',
        gridX: 1,
        gridY: 2,
        locked: true,
        label: 'US-East Ingress',
      });
      place({
        id: 'n_ingress_2',
        type: 'ingress',
        gridX: 1,
        gridY: 4,
        locked: true,
        label: 'EU-West Ingress',
      });
      place({ id: 'n_waf_1', type: 'waf', gridX: 3, gridY: 2, tier: 3, label: 'WAF-Shield-1' });
      place({ id: 'n_waf_2', type: 'waf', gridX: 3, gridY: 4, tier: 3, label: 'WAF-Shield-2' });
      place({ id: 'n_cdn_1', type: 'cdn', gridX: 5, gridY: 3, tier: 3, label: 'Global-CDN' });
      place({
        id: 'n_app_1',
        type: 'app_server',
        gridX: 7,
        gridY: 1,
        tier: 3,
        label: 'Core-App-1',
      });
      place({
        id: 'n_app_2',
        type: 'app_server',
        gridX: 7,
        gridY: 3,
        tier: 3,
        label: 'Core-App-2',
      });
      place({
        id: 'n_app_3',
        type: 'app_server',
        gridX: 7,
        gridY: 5,
        tier: 3,
        label: 'Core-App-3',
      });
      place({
        id: 'n_redis_1',
        type: 'redis_cache',
        gridX: 9,
        gridY: 2,
        tier: 3,
        label: 'Redis-Cluster',
      });
      place({
        id: 'n_mq_1',
        type: 'message_queue',
        gridX: 9,
        gridY: 4,
        tier: 3,
        label: 'Kafka-Mesh',
      });
      place({ id: 'n_shard_1', type: 'db_shard', gridX: 11, gridY: 2, tier: 3, label: 'Shard-01' });
      place({ id: 'n_shard_2', type: 'db_shard', gridX: 11, gridY: 4, tier: 3, label: 'Shard-02' });

      wire('n_ingress_1', 'n_waf_1');
      wire('n_ingress_2', 'n_waf_2');
      wire('n_waf_1', 'n_cdn_1');
      wire('n_waf_2', 'n_cdn_1');
      wire('n_cdn_1', 'n_app_1');
      wire('n_cdn_1', 'n_app_2');
      wire('n_cdn_1', 'n_app_3');
      wire('n_app_1', 'n_redis_1');
      wire('n_app_2', 'n_redis_1');
      wire('n_app_3', 'n_redis_1');
      wire('n_app_1', 'n_mq_1');
      wire('n_app_2', 'n_mq_1');
      wire('n_app_3', 'n_mq_1');
      wire('n_redis_1', 'n_shard_1');
      wire('n_redis_1', 'n_shard_2');
      wire('n_mq_1', 'n_shard_1');
      wire('n_mq_1', 'n_shard_2');
      this.store.budget.set(340);
    }

    this.store.sound.playUpgrade();
    this.syncStoreTopology();
    this.store.triggerToast('Reference Blueprint Deployed! Click "LAUNCH WAVE" to test it.');
  }

  private findNodeAtGrid(col: number, row: number): PlacedNode | undefined {
    for (const node of this.nodesMap.values()) {
      if (node.gridX === col && node.gridY === row) {
        return node;
      }
    }
    return undefined;
  }

  private findWireNearPoint(px: number, py: number): WireConnection | undefined {
    for (const wire of this.wiresList) {
      const from = this.nodesMap.get(wire.fromNodeId);
      const to = this.nodesMap.get(wire.toNodeId);
      if (!from || !to) continue;
      const dist = Phaser.Math.Distance.BetweenPoints(
        { x: px, y: py },
        { x: (from.worldX + to.worldX) / 2, y: (from.worldY + to.worldY) / 2 }
      );
      if (dist < 35) return wire;
    }
    return undefined;
  }

  private syncStoreTopology(): void {
    this.store.placedNodes.set(Array.from(this.nodesMap.values()));
    this.store.wires.set([...this.wiresList]);
  }
}
