import { describe, expect, it } from 'vitest';
import {
  analyzeTopologyWarnings,
  computeNodeStatsForTier,
  evaluatePacketAtNode,
} from './game/engine/routing-engine';
import { PlacedNode, WireConnection } from './game/models/game.models';

function createMockNode(overrides: Partial<PlacedNode> & { id: string; type: PlacedNode['type'] }): PlacedNode {
  const stats = computeNodeStatsForTier(overrides.type, overrides.tier ?? 1);
  return {
    id: overrides.id,
    type: overrides.type,
    gridX: 0,
    gridY: 0,
    worldX: 0,
    worldY: 0,
    tier: overrides.tier ?? 1,
    label: overrides.label ?? overrides.id,
    lbStrategy: overrides.lbStrategy ?? 'round_robin',
    cacheStrategy: overrides.cacheStrategy ?? 'lru_85',
    shardStrategy: overrides.shardStrategy ?? 'consistent_hash',
    currentLoad: overrides.currentLoad ?? 0,
    maxCapacity: overrides.maxCapacity ?? stats.maxCapacity,
    queueDepth: overrides.queueDepth ?? 0,
    maxQueue: overrides.maxQueue ?? stats.maxQueue,
    latencyMs: overrides.latencyMs ?? stats.latencyMs,
    health: 100,
    isOverloaded: false,
    totalProcessed: 0,
    totalDropped: 0,
    cacheHits: 0,
    cacheMisses: 0,
    roundRobinIndex: 0,
  };
}

describe('System Design Routing & Simulation Engine', () => {
  it('scrubs MALICIOUS DDoS packets at a WAF node with 403 block', () => {
    const waf = createMockNode({ id: 'waf_1', type: 'waf' });
    const app = createMockNode({ id: 'app_1', type: 'app_server' });
    const nodes = new Map<string, PlacedNode>([
      [waf.id, waf],
      [app.id, app],
    ]);
    const wires: WireConnection[] = [
      { id: 'w1', fromNodeId: waf.id, toNodeId: app.id, activePackets: 0, totalRouted: 0 },
    ];

    const ddosResult = evaluatePacketAtNode(waf, 'MALICIOUS', 1, wires, nodes, 0.5);
    expect(ddosResult.action).toBe('block_malicious');

    const getResult = evaluatePacketAtNode(waf, 'GET', 2, wires, nodes, 0.5);
    expect(getResult.action).toBe('forward');
    expect(getResult.targetNodeId).toBe('app_1');
  });

  it('resolves STATIC packets at CDN Edge and forwards dynamic GET/POST to origin', () => {
    const cdn = createMockNode({ id: 'cdn_1', type: 'cdn' });
    const lb = createMockNode({ id: 'lb_1', type: 'load_balancer' });
    const nodes = new Map<string, PlacedNode>([
      [cdn.id, cdn],
      [lb.id, lb],
    ]);
    const wires: WireConnection[] = [
      { id: 'w1', fromNodeId: cdn.id, toNodeId: lb.id, activePackets: 0, totalRouted: 0 },
    ];

    const staticOutcome = evaluatePacketAtNode(cdn, 'STATIC', 10, wires, nodes, 0.5);
    expect(staticOutcome.action).toBe('resolve');
    expect(staticOutcome.isCacheHit).toBe(true);

    const postOutcome = evaluatePacketAtNode(cdn, 'POST', 11, wires, nodes, 0.5);
    expect(postOutcome.action).toBe('forward');
    expect(postOutcome.targetNodeId).toBe('lb_1');
  });

  it('handles Redis Cache Hits in memory and routes Cache Misses to SQL DB', () => {
    const redis = createMockNode({ id: 'redis_1', type: 'redis_cache' });
    const db = createMockNode({ id: 'db_1', type: 'sql_db' });
    const nodes = new Map<string, PlacedNode>([
      [redis.id, redis],
      [db.id, db],
    ]);
    const wires: WireConnection[] = [
      { id: 'w1', fromNodeId: redis.id, toNodeId: db.id, activePackets: 0, totalRouted: 0 },
    ];

    const hitOutcome = evaluatePacketAtNode(redis, 'GET', 1, wires, nodes, 0.2);
    expect(hitOutcome.action).toBe('resolve');
    expect(hitOutcome.isCacheHit).toBe(true);

    const missOutcome = evaluatePacketAtNode(redis, 'GET', 2, wires, nodes, 0.99);
    expect(missOutcome.action).toBe('forward');
    expect(missOutcome.targetNodeId).toBe('db_1');
  });

  it('distributes traffic across App Servers using Round Robin and Least Connections', () => {
    const lb = createMockNode({ id: 'lb_1', type: 'load_balancer', lbStrategy: 'round_robin' });
    const app1 = createMockNode({ id: 'app_1', type: 'app_server', currentLoad: 12 });
    const app2 = createMockNode({ id: 'app_2', type: 'app_server', currentLoad: 1 });
    const nodes = new Map<string, PlacedNode>([
      [lb.id, lb],
      [app1.id, app1],
      [app2.id, app2],
    ]);
    const wires: WireConnection[] = [
      { id: 'w1', fromNodeId: lb.id, toNodeId: app1.id, activePackets: 0, totalRouted: 0 },
      { id: 'w2', fromNodeId: lb.id, toNodeId: app2.id, activePackets: 0, totalRouted: 0 },
    ];

    const r1 = evaluatePacketAtNode(lb, 'GET', 1, wires, nodes, 0.5);
    const r2 = evaluatePacketAtNode(lb, 'GET', 2, wires, nodes, 0.5);
    expect(r1.targetNodeId).toBe('app_1');
    expect(r2.targetNodeId).toBe('app_2');

    // Switch to Least Connections -> should pick app_2 (currentLoad = 1)
    lb.lbStrategy = 'least_connections';
    const r3 = evaluatePacketAtNode(lb, 'GET', 3, wires, nodes, 0.5);
    expect(r3.targetNodeId).toBe('app_2');
  });

  it('rejects POST writes on an unwired Read Replica DB while fulfilling GET reads', () => {
    const replica = createMockNode({ id: 'rep_1', type: 'read_replica' });
    const nodes = new Map<string, PlacedNode>([[replica.id, replica]]);

    const readRes = evaluatePacketAtNode(replica, 'GET', 1, [], nodes, 0.5);
    expect(readRes.action).toBe('resolve');

    const writeRes = evaluatePacketAtNode(replica, 'POST', 2, [], nodes, 0.5);
    expect(writeRes.action).toBe('drop');
  });

  it('detects Split-Brain anti-pattern when multiple unsharded Primary SQL DBs are placed', () => {
    const db1 = createMockNode({ id: 'db_1', type: 'sql_db' });
    const db2 = createMockNode({ id: 'db_2', type: 'sql_db' });
    const nodes = new Map<string, PlacedNode>([
      [db1.id, db1],
      [db2.id, db2],
    ]);

    const warnings = analyzeTopologyWarnings([db1, db2], [], false, 15);
    expect(warnings.some((w) => w.code === 'SPLIT_BRAIN_PRIMARY_DB')).toBe(true);

    // Low randomRoll triggers 409 Split-Brain DB Conflict
    const conflictOutcome = evaluatePacketAtNode(db1, 'POST', 1, [], nodes, 0.2);
    expect(conflictOutcome.action).toBe('drop');
    expect(conflictOutcome.reasonLabel).toContain('Split-Brain');
  });
});
