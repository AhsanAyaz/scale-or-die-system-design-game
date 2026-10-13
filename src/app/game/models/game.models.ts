export type NodeType =
  | 'ingress'
  | 'waf'
  | 'load_balancer'
  | 'cdn'
  | 'app_server'
  | 'redis_cache'
  | 'message_queue'
  | 'sql_db'
  | 'read_replica'
  | 'db_shard';

export type PacketType = 'GET' | 'POST' | 'STATIC' | 'ASYNC' | 'MALICIOUS';

export type LoadBalancingStrategy = 'round_robin' | 'least_connections' | 'ip_hash';
export type CacheEvictionStrategy = 'lru_85' | 'write_through_92' | 'aggressive_ttl';
export type ShardingStrategy = 'consistent_hash' | 'range_key' | 'modulo_hash';

export type ToolMode = 'select' | 'build' | 'wire' | 'delete';

export interface NodeCatalogItem {
  readonly type: NodeType;
  readonly name: string;
  readonly shortLabel: string;
  readonly category: 'Edge & Network' | 'Compute & Async' | 'Caching & Storage';
  readonly cost: number;
  readonly upgradeCostBase: number;
  readonly baseCapacityRps: number;
  readonly baseLatencyMs: number;
  readonly maxQueueSize: number;
  readonly colorHex: string;
  readonly accentNumber: number;
  readonly description: string;
  readonly systemDesignTip: string;
  readonly spriteKey: string;
  readonly canPlace: boolean;
}

export interface PlacedNode {
  readonly id: string;
  readonly type: NodeType;
  readonly gridX: number;
  readonly gridY: number;
  worldX: number;
  worldY: number;
  readonly locked?: boolean;
  tier: number;
  label: string;
  lbStrategy: LoadBalancingStrategy;
  cacheStrategy: CacheEvictionStrategy;
  shardStrategy: ShardingStrategy;
  currentLoad: number;
  maxCapacity: number;
  queueDepth: number;
  maxQueue: number;
  latencyMs: number;
  health: number; // 0 to 100
  isOverloaded: boolean;
  totalProcessed: number;
  totalDropped: number;
  cacheHits: number;
  cacheMisses: number;
  roundRobinIndex: number;
}

export interface WireConnection {
  readonly id: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  activePackets: number;
  totalRouted: number;
}

export interface WaveTrafficMix {
  readonly GET: number;      // Weight 0-100
  readonly POST: number;     // Weight 0-100
  readonly STATIC: number;   // Weight 0-100
  readonly ASYNC: number;    // Weight 0-100
  readonly MALICIOUS: number;// Weight 0-100
}

export interface WaveSegment {
  readonly durationSec: number;
  readonly rps: number;
  readonly announcement: string;
  readonly mix: WaveTrafficMix;
}

export interface StarterNodePlacement {
  readonly id: string;
  readonly type: NodeType;
  readonly gridX: number;
  readonly gridY: number;
  readonly tier?: number;
  readonly locked?: boolean;
  readonly label?: string;
}

export interface StarterWirePlacement {
  readonly fromId: string;
  readonly toId: string;
}

export interface LevelDefinition {
  readonly id: number;
  readonly slug: string;
  readonly title: string;
  readonly subtitle: string;
  readonly conceptBadge: string;
  readonly scenarioBriefing: string;
  readonly architecturalLesson: string;
  readonly realWorldAnalogy: string;
  readonly startingBudget: number;
  readonly targetSlaPercent: number;
  readonly targetLatencyMs: number;
  readonly unlockedNodes: readonly NodeType[];
  readonly starterNodes: readonly StarterNodePlacement[];
  readonly starterWires: readonly StarterWirePlacement[];
  readonly waves: readonly WaveSegment[];
  readonly hints: readonly string[];
  readonly isInfiniteSandbox?: boolean;
}

export interface TelemetrySnapshot {
  readonly currentRps: number;
  readonly incomingRps: number;
  readonly totalSpawned: number;
  readonly totalResolved: number;
  readonly totalBlockedMalicious: number;
  readonly totalFailed: number;
  readonly slaPercent: number;
  readonly p95LatencyMs: number;
  readonly cacheHitRatio: number;
  readonly waveElapsedSec: number;
  readonly waveTotalSec: number;
  readonly currentSegmentAnnouncement: string;
  readonly score: number;
  readonly starsEarned: number;
}

export interface LevelScoreResult {
  readonly levelId: number;
  readonly passed: boolean;
  readonly stars: number;
  readonly slaPercent: number;
  readonly p95LatencyMs: number;
  readonly budgetRemaining: number;
  readonly totalResolved: number;
  readonly totalFailed: number;
  readonly totalBlockedMalicious: number;
  readonly score: number;
  readonly feedbackSummary: string;
}
