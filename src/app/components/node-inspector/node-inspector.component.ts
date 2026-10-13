import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GameStoreService } from '../../game/services/game-store.service';
import { NODE_CATALOG } from '../../game/levels/node-catalog';
import { computeNodeStatsForTier } from '../../game/engine/routing-engine';
import {
  CacheEvictionStrategy,
  LoadBalancingStrategy,
  ShardingStrategy,
} from '../../game/models/game.models';

@Component({
  selector: 'app-node-inspector',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.selectedNode(); as node) {
      <aside class="inspector-panel">
        <!-- Fixed Header -->
        <div class="inspector-header">
          <img
            class="inspector-sprite"
            [src]="'assets/sprites/' + catalog().spriteKey + '.png'"
            [alt]="catalog().name"
          />
          <div class="inspector-titles">
            <span class="node-category">{{ catalog().category }}</span>
            <h3 class="node-title">{{ node.label }}</h3>
            <span class="tier-pill">Tier {{ node.tier }} / 3 • {{ catalog().name }}</span>
          </div>
          <button
            type="button"
            class="close-btn"
            (click)="store.selectedNode.set(null)"
            aria-label="Close Inspector"
          >
            ✕
          </button>
        </div>

        <!-- Scrollable Body -->
        <div class="inspector-body">
          <p class="node-desc">{{ catalog().description }}</p>

          <!-- Real-Time Node Telemetry -->
          <div class="stats-grid">
            <div class="stat-box">
              <span class="stat-label">MAX CAPACITY</span>
              <span class="stat-val">{{ node.maxCapacity }} RPS</span>
            </div>
            <div class="stat-box">
              <span class="stat-label">NODE LATENCY</span>
              <span class="stat-val cyan">{{ node.latencyMs }} ms</span>
            </div>
            <div class="stat-box">
              <span class="stat-label">QUEUE BUFFER</span>
              <span class="stat-val">{{ round(node.queueDepth) }} / {{ node.maxQueue }}</span>
            </div>
            <div class="stat-box">
              <span class="stat-label">PROCESSED / DROP</span>
              <span class="stat-val">
                <span class="ok">{{ node.totalProcessed }}</span> /
                <span class="err">{{ node.totalDropped }}</span>
              </span>
            </div>
          </div>

          @if (node.type === 'redis_cache') {
            <div class="strategy-section">
              <label class="strategy-label">CACHE EVICTION & WRITE POLICY</label>
              <div class="strategy-buttons">
                <button
                  type="button"
                  class="strat-btn"
                  [class.active]="node.cacheStrategy === 'lru_85'"
                  (click)="setCacheStrategy('lru_85')"
                >
                  LRU Cache-Aside (84%+ Hit)
                </button>
                <button
                  type="button"
                  class="strat-btn"
                  [class.active]="node.cacheStrategy === 'write_through_92'"
                  (click)="setCacheStrategy('write_through_92')"
                >
                  Write-Through (92%+ Hit)
                </button>
                <button
                  type="button"
                  class="strat-btn"
                  [class.active]="node.cacheStrategy === 'aggressive_ttl'"
                  (click)="setCacheStrategy('aggressive_ttl')"
                >
                  Extended TTL (88%+ Hit)
                </button>
              </div>
            </div>
          }

          @if (
            node.type === 'load_balancer' ||
            node.type === 'app_server' ||
            node.type === 'cdn' ||
            node.type === 'waf'
          ) {
            <div class="strategy-section">
              <label class="strategy-label">DOWNSTREAM ROUTING ALGORITHM</label>
              <div class="strategy-buttons">
                <button
                  type="button"
                  class="strat-btn"
                  [class.active]="node.lbStrategy === 'round_robin'"
                  (click)="setLbStrategy('round_robin')"
                >
                  Round Robin
                </button>
                <button
                  type="button"
                  class="strat-btn"
                  [class.active]="node.lbStrategy === 'least_connections'"
                  (click)="setLbStrategy('least_connections')"
                >
                  Least Connections
                </button>
                <button
                  type="button"
                  class="strat-btn"
                  [class.active]="node.lbStrategy === 'ip_hash'"
                  (click)="setLbStrategy('ip_hash')"
                >
                  Consistent IP Hash
                </button>
              </div>
            </div>
          }

          <div class="tip-box">
            <strong>💡 Architect Tip:</strong> {{ catalog().systemDesignTip }}
          </div>
        </div>

        <!-- Sticky Bottom Actions (Never Clipped!) -->
        <div class="inspector-actions">
          @if (node.type !== 'ingress' && node.tier < 3) {
            <button
              type="button"
              class="upgrade-btn"
              [disabled]="store.budget() < upgradeCost()"
              (click)="store.requestUpgradeSelectedNode()"
            >
              ⬆ Upgrade to Tier {{ node.tier + 1 }} (\${{ upgradeCost() }})
            </button>
          } @else if (node.tier >= 3) {
            <div class="max-tier-banner">★ MAXIMUM HARDWARE TIER REACHED</div>
          }

          <div class="secondary-actions">
            <button
              type="button"
              class="wire-from-btn"
              (click)="store.setToolMode('wire')"
            >
              ⚡ Wire Downstream
            </button>

            @if (!node.locked && node.type !== 'ingress') {
              <button
                type="button"
                class="decommission-btn"
                (click)="store.requestDeleteSelectedNode()"
              >
                🗑️ Decommission
              </button>
            }
          </div>
        </div>
      </aside>
    }
  `,
  styles: `
    .inspector-panel {
      position: absolute;
      top: 10px;
      bottom: 10px;
      right: 12px;
      width: 300px;
      max-height: calc(100% - 20px);
      background: rgba(11, 17, 32, 0.96);
      border: 1px solid rgba(56, 189, 248, 0.38);
      border-radius: 13px;
      padding: 12px;
      color: #f8fafc;
      box-shadow: 0 14px 36px rgba(0, 0, 0, 0.72);
      backdrop-filter: blur(14px);
      z-index: 25;
      display: flex;
      flex-direction: column;
      gap: 9px;
      overflow: hidden;
    }
    .inspector-header {
      display: flex;
      align-items: center;
      gap: 9px;
      flex-shrink: 0;
    }
    .inspector-sprite {
      width: 44px;
      height: 44px;
      object-fit: contain;
      background: rgba(15, 23, 42, 0.9);
      border: 1px solid #334155;
      border-radius: 9px;
      padding: 3px;
    }
    .inspector-titles {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 1px;
      min-width: 0;
    }
    .node-category {
      font-size: 8.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #38bdf8;
    }
    .node-title {
      margin: 0;
      font-size: 14px;
      font-weight: 800;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .tier-pill {
      font-size: 10.5px;
      color: #94a3b8;
    }
    .close-btn {
      background: transparent;
      border: none;
      color: #94a3b8;
      font-size: 15px;
      cursor: pointer;
    }
    .inspector-body {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding-right: 3px;
      scrollbar-width: thin;
      scrollbar-color: #334155 transparent;
    }
    .node-desc {
      margin: 0;
      font-size: 11px;
      line-height: 1.4;
      color: #cbd5e1;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }
    .stat-box {
      background: rgba(15, 23, 42, 0.9);
      border: 1px solid #1e293b;
      border-radius: 7px;
      padding: 5px 8px;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .stat-label {
      font-size: 8.5px;
      font-weight: 700;
      color: #64748b;
    }
    .stat-val {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11.5px;
      font-weight: 700;
    }
    .stat-val.cyan {
      color: #00f2fe;
    }
    .ok {
      color: #10b981;
    }
    .err {
      color: #ff4b5c;
    }
    .strategy-section {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .strategy-label {
      font-size: 8.5px;
      font-weight: 700;
      letter-spacing: 0.05em;
      color: #94a3b8;
    }
    .strategy-buttons {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .strat-btn {
      background: #0f172a;
      color: #cbd5e1;
      border: 1px solid #334155;
      border-radius: 6px;
      padding: 4px 8px;
      font-size: 10.5px;
      font-weight: 600;
      text-align: left;
      cursor: pointer;
    }
    .strat-btn.active {
      background: rgba(0, 242, 254, 0.14);
      border-color: #00f2fe;
      color: #00f2fe;
    }
    .tip-box {
      background: rgba(56, 189, 248, 0.08);
      border-left: 3px solid #38bdf8;
      padding: 6px 8px;
      border-radius: 4px;
      font-size: 10.5px;
      line-height: 1.38;
      color: #bae6fd;
    }
    .inspector-actions {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding-top: 6px;
      border-top: 1px solid rgba(51, 65, 85, 0.65);
      flex-shrink: 0;
    }
    .upgrade-btn {
      width: 100%;
      padding: 8px;
      border: none;
      border-radius: 7px;
      background: linear-gradient(135deg, #10b981, #059669);
      color: #022c22;
      font-size: 11.5px;
      font-weight: 800;
      cursor: pointer;
    }
    .upgrade-btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    .max-tier-banner {
      text-align: center;
      font-size: 10.5px;
      font-weight: 700;
      color: #fbbf24;
      padding: 5px;
      background: rgba(251, 191, 36, 0.12);
      border-radius: 6px;
    }
    .secondary-actions {
      display: flex;
      gap: 6px;
    }
    .wire-from-btn,
    .decommission-btn {
      flex: 1;
      padding: 6px;
      border-radius: 6px;
      font-size: 10.5px;
      font-weight: 700;
      cursor: pointer;
      border: 1px solid #334155;
      background: #1e293b;
      color: #e2e8f0;
    }
    .decommission-btn {
      border-color: rgba(255, 75, 92, 0.45);
      color: #fda4af;
    }
  `,
})
export class NodeInspectorComponent {
  readonly store = inject(GameStoreService);

  readonly catalog = computed(() => {
    const node = this.store.selectedNode();
    return NODE_CATALOG[node?.type ?? 'app_server'];
  });

  readonly upgradeCost = computed(() => {
    const node = this.store.selectedNode();
    if (!node) return 0;
    return computeNodeStatsForTier(node.type, node.tier).upgradeCost;
  });

  round(val: number): number {
    return Math.round(val);
  }

  setLbStrategy(strategy: LoadBalancingStrategy): void {
    this.store.updateSelectedNodeStrategy(strategy, undefined, undefined);
  }

  setCacheStrategy(strategy: CacheEvictionStrategy): void {
    this.store.updateSelectedNodeStrategy(undefined, strategy, undefined);
  }

  setShardStrategy(strategy: ShardingStrategy): void {
    this.store.updateSelectedNodeStrategy(undefined, undefined, strategy);
  }
}
