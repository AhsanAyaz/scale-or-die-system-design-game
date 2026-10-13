import {
  CacheEvictionStrategy,
  LoadBalancingStrategy,
  NodeType,
  PacketType,
  PlacedNode,
  WireConnection,
} from '../models/game.models';
import { NODE_CATALOG } from '../levels/node-catalog';

export interface NodeProcessOutcome {
  readonly action: 'resolve' | 'block_malicious' | 'forward' | 'drop';
  readonly reasonLabel: string;
  readonly targetNodeId?: string;
  readonly addedLatencyMs: number;
  readonly isCacheHit?: boolean;
}

export interface ArchitectureWarning {
  readonly code: 'SPLIT_BRAIN_PRIMARY_DB' | 'DISCONNECTED_INGRESS' | 'UNPROTECTED_DDOS' | 'SINGLE_POINT_BOTTLENECK';
  readonly severity: 'critical' | 'warning';
  readonly title: string;
  readonly explanation: string;
}

/**
 * Inspects the current topology and returns real-world system design anti-pattern warnings!
 */
export function analyzeTopologyWarnings(
  nodes: readonly PlacedNode[],
  wires: readonly WireConnection[],
  hasMaliciousTraffic: boolean,
  peakRps: number
): ArchitectureWarning[] {
  const warnings: ArchitectureWarning[] = [];
  const nodesById = new Map<string, PlacedNode>(nodes.map((n) => [n.id, n]));

  // 1. Check for Split-Brain Multiple Primary SQL Databases!
  const primaryDbs = nodes.filter((n) => n.type === 'sql_db');
  if (primaryDbs.length > 1) {
    warnings.push({
      code: 'SPLIT_BRAIN_PRIMARY_DB',
      severity: 'critical',
      title: 'Split-Brain Anti-Pattern: Multiple Primary SQL DBs!',
      explanation:
        'Round-robining writes across 2 unsharded Primary SQL DBs causes Split-Brain data corruption (User A writes to DB-1, then reads stale/missing data from DB-2!). Scale a single Primary DB vertically (Upgrade Tier), or use Read Replicas / DB Shards.',
    });
  }

  // 2. Check if any compute node routes to multiple Primary SQL DBs
  for (const node of nodes) {
    const outgoing = wires
      .filter((w) => w.fromNodeId === node.id)
      .map((w) => nodesById.get(w.toNodeId))
      .filter((n): n is PlacedNode => !!n);
    const connectedPrimaries = outgoing.filter((n) => n.type === 'sql_db');
    if (connectedPrimaries.length > 1 && !warnings.some((w) => w.code === 'SPLIT_BRAIN_PRIMARY_DB')) {
      warnings.push({
        code: 'SPLIT_BRAIN_PRIMARY_DB',
        severity: 'critical',
        title: 'Split-Brain Routing to Multiple Primary DBs!',
        explanation:
          'A node is wired to multiple unsharded Primary SQL databases. Writes and reads will hit inconsistent masters!',
      });
    }
  }

  // 3. Check if Ingress has no outgoing wire
  const ingressNodes = nodes.filter((n) => n.type === 'ingress');
  for (const ing of ingressNodes) {
    const hasOut = wires.some((w) => w.fromNodeId === ing.id);
    if (!hasOut) {
      warnings.push({
        code: 'DISCONNECTED_INGRESS',
        severity: 'warning',
        title: `${ing.label} is not wired!`,
        explanation: 'Incoming requests at this Ingress portal have no downstream data pipe.',
      });
    }
  }

  // 4. Check if DDoS wave has no WAF
  if (hasMaliciousTraffic && !nodes.some((n) => n.type === 'waf')) {
    warnings.push({
      code: 'UNPROTECTED_DDOS',
      severity: 'critical',
      title: 'No WAF Shield Against DDoS Traffic!',
      explanation:
        'This level contains malicious DDoS floods. Place an API Gateway / WAF after Ingress to scrub bot packets.',
    });
  }

  // 5. Check if total DB/Storage capacity is below peak wave RPS (when no cache is present)
  const hasCache = nodes.some((n) => n.type === 'redis_cache');
  const storageNodes = nodes.filter(
    (n) => n.type === 'sql_db' || n.type === 'read_replica' || n.type === 'db_shard'
  );
  const totalStorageRps = storageNodes.reduce((sum, n) => sum + n.maxCapacity, 0);
  if (storageNodes.length > 0 && !hasCache && totalStorageRps < peakRps) {
    warnings.push({
      code: 'SINGLE_POINT_BOTTLENECK',
      severity: 'warning',
      title: `Storage Capacity (${totalStorageRps} RPS) < Peak Wave (${peakRps} RPS)`,
      explanation:
        'Your database tier maxes out below peak wave traffic! Click your Database or App Server to Upgrade its Hardware Tier (Vertical Scaling) or add caching/replicas.',
    });
  }

  return warnings;
}

/**
 * Pure, unit-testable routing and system design rules engine.
 */
export function evaluatePacketAtNode(
  node: PlacedNode,
  packetType: PacketType,
  packetHashKey: number,
  outgoingWires: readonly WireConnection[],
  nodesById: ReadonlyMap<string, PlacedNode>,
  randomRoll: number // 0.0 to 1.0
): NodeProcessOutcome {
  // Check capacity / queue overflow first (except ingress)
  if (node.type !== 'ingress') {
    const floodPenalty = packetType === 'MALICIOUS' && node.type !== 'waf' ? 2.5 : 1;
    if (node.queueDepth + floodPenalty > node.maxQueue) {
      return {
        action: 'drop',
        reasonLabel: '503 Queue Overflow!',
        addedLatencyMs: node.latencyMs * 2,
      };
    }
  }

  // 1. WAF / API Gateway
  if (node.type === 'waf') {
    if (packetType === 'MALICIOUS') {
      return {
        action: 'block_malicious',
        reasonLabel: '403 DDoS Scrubbed',
        addedLatencyMs: node.latencyMs,
      };
    }
    return routeDownstream(node, packetType, packetHashKey, outgoingWires, nodesById, node.latencyMs);
  }

  // If a malicious packet reaches a non-WAF compute/storage node, it causes severe congestion and fails
  if (
    packetType === 'MALICIOUS' &&
    node.type !== 'ingress' &&
    node.type !== 'load_balancer' &&
    node.type !== 'cdn'
  ) {
    return {
      action: 'drop',
      reasonLabel: 'DDoS Poisoned CPU!',
      addedLatencyMs: node.latencyMs * 3,
    };
  }

  // 2. CDN Edge Node
  if (node.type === 'cdn') {
    if (packetType === 'STATIC') {
      return {
        action: 'resolve',
        reasonLabel: '200 Edge Hit (3ms)',
        addedLatencyMs: node.latencyMs,
        isCacheHit: true,
      };
    }
    return routeDownstream(node, packetType, packetHashKey, outgoingWires, nodesById, node.latencyMs);
  }

  // 3. Redis In-Memory Cache
  if (node.type === 'redis_cache') {
    if (packetType === 'GET') {
      const hitThreshold = getCacheHitThreshold(node.cacheStrategy, node.tier);
      if (randomRoll <= hitThreshold) {
        return {
          action: 'resolve',
          reasonLabel: '200 Redis HIT (2ms)',
          addedLatencyMs: node.latencyMs,
          isCacheHit: true,
        };
      }
      // Cache Miss -> forward to DB
      return routeDownstream(
        node,
        packetType,
        packetHashKey,
        outgoingWires,
        nodesById,
        node.latencyMs + 4,
        'Cache Miss → DB'
      );
    }
    // POST / ASYNC / STATIC pass through Redis to downstream DB
    return routeDownstream(node, packetType, packetHashKey, outgoingWires, nodesById, node.latencyMs);
  }

  // 4. Primary SQL Database
  if (node.type === 'sql_db') {
    // Check if there are multiple Primary SQL DBs in the topology (Split-Brain anti-pattern!)
    let primaryCount = 0;
    for (const n of nodesById.values()) {
      if (n.type === 'sql_db') primaryCount++;
    }
    if (primaryCount > 1 && randomRoll < 0.45) {
      return {
        action: 'drop',
        reasonLabel: '409 Split-Brain DB Conflict!',
        addedLatencyMs: node.latencyMs + 25,
      };
    }

    const heavyPenalty = packetType === 'STATIC' ? 22 : packetType === 'ASYNC' ? 16 : 0;
    return {
      action: 'resolve',
      reasonLabel: packetType === 'POST' ? '201 SQL Commit' : '200 SQL Select',
      addedLatencyMs: node.latencyMs + heavyPenalty,
    };
  }

  // 5. Read Replica Database
  if (node.type === 'read_replica') {
    if (packetType === 'GET' || packetType === 'STATIC') {
      return {
        action: 'resolve',
        reasonLabel: '200 Replica Read',
        addedLatencyMs: node.latencyMs,
      };
    }
    // If someone sent a POST/ASYNC write to a Read Replica, try forwarding if wired, else error
    if (outgoingWires.length > 0) {
      return routeDownstream(
        node,
        packetType,
        packetHashKey,
        outgoingWires,
        nodesById,
        node.latencyMs + 10
      );
    }
    return {
      action: 'drop',
      reasonLabel: 'Read-Only Replica Error!',
      addedLatencyMs: node.latencyMs,
    };
  }

  // 6. Sharded DB Partition
  if (node.type === 'db_shard') {
    return {
      action: 'resolve',
      reasonLabel: packetType === 'POST' ? '201 Shard Write' : '200 Shard Read',
      addedLatencyMs: node.latencyMs,
    };
  }

  // 7. Ingress / Load Balancer / App Server / Message Queue forward downstream
  const extraLatency =
    node.type === 'app_server' && packetType === 'STATIC'
      ? 18 // Serving static video from App Server without CDN is slow!
      : node.type === 'app_server' && packetType === 'ASYNC'
        ? 14
        : 0;

  return routeDownstream(
    node,
    packetType,
    packetHashKey,
    outgoingWires,
    nodesById,
    node.latencyMs + extraLatency
  );
}

export function getCacheHitThreshold(strategy: CacheEvictionStrategy, tier: number): number {
  const tierBonus = (tier - 1) * 0.03;
  switch (strategy) {
    case 'write_through_92':
      return Math.min(0.96, 0.9 + tierBonus);
    case 'aggressive_ttl':
      return Math.min(0.95, 0.88 + tierBonus);
    case 'lru_85':
    default:
      return Math.min(0.94, 0.84 + tierBonus);
  }
}

function routeDownstream(
  node: PlacedNode,
  packetType: PacketType,
  packetHashKey: number,
  outgoingWires: readonly WireConnection[],
  nodesById: ReadonlyMap<string, PlacedNode>,
  addedLatencyMs: number,
  customReason = 'Routed'
): NodeProcessOutcome {
  if (outgoingWires.length === 0) {
    return {
      action: 'drop',
      reasonLabel: '502 No Downstream Wire!',
      addedLatencyMs,
    };
  }

  const candidates: PlacedNode[] = [];
  for (const w of outgoingWires) {
    const target = nodesById.get(w.toNodeId);
    if (target) {
      candidates.push(target);
    }
  }

  if (candidates.length === 0) {
    return {
      action: 'drop',
      reasonLabel: '502 Broken Route!',
      addedLatencyMs,
    };
  }

  // Smart packet-type affinity routing when an App Server or Load Balancer is wired to heterogeneous targets
  // e.g., App Server wired to Redis (for GET), Kafka MQ (for ASYNC), Read Replica (for GET), Primary DB (for POST)
  const filtered = filterCompatibleTargets(candidates, packetType);
  const pool = filtered.length > 0 ? filtered : candidates;

  const chosen = selectTargetByStrategy(node, pool, packetHashKey);
  return {
    action: 'forward',
    reasonLabel: customReason,
    targetNodeId: chosen.id,
    addedLatencyMs,
  };
}

function filterCompatibleTargets(
  candidates: readonly PlacedNode[],
  packetType: PacketType
): PlacedNode[] {
  if (candidates.length <= 1) {
    return [...candidates];
  }

  // If packet is ASYNC and there is a Message Queue connected, strongly prefer the Message Queue
  if (packetType === 'ASYNC') {
    const mqs = candidates.filter((c) => c.type === 'message_queue');
    if (mqs.length > 0) return mqs;
  }

  // If packet is GET and there is a Redis Cache or Read Replica connected, prefer those over Primary SQL
  if (packetType === 'GET') {
    const caches = candidates.filter((c) => c.type === 'redis_cache');
    if (caches.length > 0) return caches;
    const replicas = candidates.filter((c) => c.type === 'read_replica' || c.type === 'db_shard');
    if (replicas.length > 0) return replicas;
  }

  // If packet is POST, avoid Read Replicas and Redis-only dead ends if a Primary DB / Shard / MQ is available
  if (packetType === 'POST') {
    const writeTargets = candidates.filter(
      (c) =>
        c.type === 'db_shard' ||
        c.type === 'sql_db' ||
        c.type === 'message_queue' ||
        c.type === 'app_server' ||
        c.type === 'load_balancer' ||
        c.type === 'cdn' ||
        c.type === 'waf'
    );
    if (writeTargets.length > 0) return writeTargets;
  }

  return [...candidates];
}

function selectTargetByStrategy(
  sourceNode: PlacedNode,
  pool: readonly PlacedNode[],
  packetHashKey: number
): PlacedNode {
  if (pool.length === 1) {
    return pool[0];
  }

  // If all targets are DB shards, use shard strategy
  const allShards = pool.every((n) => n.type === 'db_shard');
  if (allShards) {
    const idx = Math.abs(packetHashKey) % pool.length;
    return pool[idx];
  }

  const strategy: LoadBalancingStrategy = sourceNode.lbStrategy || 'round_robin';
  if (strategy === 'least_connections') {
    let best = pool[0];
    let bestRatio = (best.currentLoad + best.queueDepth) / Math.max(1, best.maxCapacity);
    for (let i = 1; i < pool.length; i++) {
      const candidate = pool[i];
      const ratio =
        (candidate.currentLoad + candidate.queueDepth) / Math.max(1, candidate.maxCapacity);
      if (ratio < bestRatio) {
        best = candidate;
        bestRatio = ratio;
      }
    }
    return best;
  }

  if (strategy === 'ip_hash') {
    const idx = Math.abs(packetHashKey) % pool.length;
    return pool[idx];
  }

  // Default: Round Robin
  const idx = sourceNode.roundRobinIndex % pool.length;
  sourceNode.roundRobinIndex = (sourceNode.roundRobinIndex + 1) % 100000;
  return pool[idx];
}

export function computeNodeStatsForTier(
  type: NodeType,
  tier: number
): { maxCapacity: number; maxQueue: number; latencyMs: number; upgradeCost: number } {
  const catalog = NODE_CATALOG[type];
  const capacityMultiplier = tier === 1 ? 1 : tier === 2 ? 1.75 : 2.65;
  const latencyMultiplier = tier === 1 ? 1 : tier === 2 ? 0.78 : 0.58;
  const queueMultiplier = tier === 1 ? 1 : tier === 2 ? 1.5 : 2.2;

  return {
    maxCapacity: Math.round(catalog.baseCapacityRps * capacityMultiplier),
    maxQueue: Math.round(catalog.maxQueueSize * queueMultiplier),
    latencyMs: Math.max(1, Math.round(catalog.baseLatencyMs * latencyMultiplier)),
    upgradeCost: Math.round(catalog.upgradeCostBase * tier),
  };
}
