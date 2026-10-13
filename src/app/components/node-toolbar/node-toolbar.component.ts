import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { GameStoreService } from '../../game/services/game-store.service';

@Component({
  selector: 'app-node-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <footer class="dock-container">
      <!-- Left: Cursor, Wire Routing & Undo/Redo Tools -->
      <div class="mode-tools">
        <button
          type="button"
          class="tool-btn"
          [class.active]="store.toolMode() === 'select'"
          (click)="store.setToolMode('select')"
          title="Select & Inspect Node (Shortcut: S)"
        >
          <span class="tool-icon">🖱️</span>
          <span class="tool-name">Inspect (S)</span>
        </button>

        <button
          type="button"
          class="tool-btn wire-btn"
          [class.active]="store.toolMode() === 'wire'"
          (click)="store.setToolMode('wire')"
          title="Connect Data Pipes Between Nodes (Shortcut: W)"
        >
          <span class="tool-icon">⚡</span>
          <span class="tool-name">Wire Pipe (W)</span>
        </button>

        <button
          type="button"
          class="tool-btn delete-btn"
          [class.active]="store.toolMode() === 'delete'"
          (click)="store.setToolMode('delete')"
          title="Decommission Node or Cut Wire (Shortcut: X)"
        >
          <span class="tool-icon">🗑️</span>
          <span class="tool-name">Remove (X)</span>
        </button>

        <button
          type="button"
          class="tool-btn"
          [disabled]="!store.canUndo()"
          (click)="store.undo()"
          title="Undo Last Change (Shortcut: Ctrl+Z)"
        >
          <span class="tool-icon">↶</span>
          <span class="tool-name">Undo</span>
        </button>

        <button
          type="button"
          class="tool-btn"
          [disabled]="!store.canRedo()"
          (click)="store.redo()"
          title="Redo Change (Shortcut: Ctrl+Y)"
        >
          <span class="tool-icon">↷</span>
          <span class="tool-name">Redo</span>
        </button>

        <button
          type="button"
          class="tool-btn"
          (click)="store.resetEntireLevel()"
          title="Reset Level Topology"
        >
          <span class="tool-icon">↺</span>
          <span class="tool-name">Reset Grid</span>
        </button>
      </div>

      <div class="divider"></div>

      <!-- Right: Unlocked Cloud Infrastructure Palette -->
      <div class="node-palette">
        @for (item of store.unlockedCatalogItems(); track item.type) {
          <button
            type="button"
            class="node-card"
            [class.active]="
              store.toolMode() === 'build' && store.selectedBuildType() === item.type
            "
            [class.unaffordable]="store.budget() < item.cost"
            [style.border-color]="
              store.toolMode() === 'build' && store.selectedBuildType() === item.type
                ? item.colorHex
                : ''
            "
            (click)="store.selectBuildNodeType(item.type)"
          >
            <img
              class="node-thumb"
              [src]="'assets/sprites/' + item.spriteKey + '.png'"
              [alt]="item.name"
            />
            <div class="node-meta">
              <div class="node-title-row">
                <span class="node-short">{{ item.shortLabel }}</span>
                <span class="node-cost">\${{ item.cost }}</span>
              </div>
              <div class="node-stats">
                <span>{{ item.baseCapacityRps }} RPS</span>
                <span>•</span>
                <span>{{ item.baseLatencyMs }}ms</span>
              </div>
            </div>
          </button>
        }
      </div>
    </footer>
  `,
  styles: `
    .dock-container {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 6px 14px;
      background: rgba(9, 14, 26, 0.96);
      border-top: 1px solid rgba(56, 189, 248, 0.24);
      backdrop-filter: blur(12px);
      z-index: 30;
    }
    .mode-tools {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }
    .tool-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      min-width: 66px;
      padding: 6px 8px;
      background: #0f172a;
      color: #cbd5e1;
      border: 1px solid #334155;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .tool-btn:hover:not(:disabled) {
      border-color: #38bdf8;
      color: #f8fafc;
    }
    .tool-btn:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }
    .tool-btn.active {
      background: rgba(0, 242, 254, 0.15);
      border-color: #00f2fe;
      color: #00f2fe;
      box-shadow: 0 0 14px rgba(0, 242, 254, 0.25);
    }
    .wire-btn.active {
      background: rgba(16, 185, 129, 0.18);
      border-color: #10b981;
      color: #34d399;
    }
    .delete-btn.active {
      background: rgba(255, 75, 92, 0.18);
      border-color: #ff4b5c;
      color: #ff4b5c;
    }
    .tool-icon {
      font-size: 14px;
      line-height: 1;
    }
    .tool-name {
      font-size: 9.5px;
      font-weight: 700;
      letter-spacing: 0.02em;
      white-space: nowrap;
    }
    .divider {
      width: 1px;
      height: 40px;
      background: #334155;
      flex-shrink: 0;
    }
    .node-palette {
      display: flex;
      align-items: center;
      gap: 7px;
      overflow-x: auto;
      padding-bottom: 2px;
    }
    .node-card {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 10px;
      background: #0f172a;
      border: 1.5px solid #334155;
      border-radius: 9px;
      cursor: pointer;
      transition: all 0.15s ease;
      text-align: left;
      flex-shrink: 0;
    }
    .node-card:hover {
      transform: translateY(-2px);
      border-color: #64748b;
    }
    .node-card.active {
      background: rgba(30, 41, 59, 0.95);
      box-shadow: 0 0 16px rgba(56, 189, 248, 0.35);
    }
    .node-card.unaffordable {
      opacity: 0.52;
    }
    .node-thumb {
      width: 34px;
      height: 34px;
      object-fit: contain;
      filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.6));
    }
    .node-meta {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .node-title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .node-short {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10.5px;
      font-weight: 800;
      color: #f8fafc;
    }
    .node-cost {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10.5px;
      font-weight: 700;
      color: #fbbf24;
    }
    .node-stats {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 9.5px;
      color: #94a3b8;
    }
  `,
})
export class NodeToolbarComponent {
  readonly store = inject(GameStoreService);
}
