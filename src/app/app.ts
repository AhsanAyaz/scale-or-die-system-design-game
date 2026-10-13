import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
   inject,
  viewChild,
} from '@angular/core';
import * as Phaser from 'phaser';
import { GameStoreService } from './game/services/game-store.service';
import { ArchitectureScene } from './game/scenes/architecture.scene';
import { HudHeaderComponent } from './components/hud-header/hud-header.component';
import { NodeToolbarComponent } from './components/node-toolbar/node-toolbar.component';
import { NodeInspectorComponent } from './components/node-inspector/node-inspector.component';
import { LevelModalComponent } from './components/level-modal/level-modal.component';

@Component({
  selector: 'app-root',
  imports: [
    HudHeaderComponent,
    NodeToolbarComponent,
    NodeInspectorComponent,
    LevelModalComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="game-shell">
      <app-hud-header />

      <main class="canvas-stage">
        <div #phaserContainer class="phaser-viewport"></div>

        <!-- Floating Helper Banner -->
        @if (store.bannerToast(); as toast) {
          <div class="toast-pill">{{ toast }}</div>
        }

        <!-- Live Architecture Anti-Pattern & Bottleneck Linter -->
        @if (store.architectureWarnings().length > 0) {
          <div class="linter-stack">
            @for (warn of store.architectureWarnings(); track warn.code) {
              <div class="linter-card" [class.critical]="warn.severity === 'critical'">
                <div class="linter-title">
                  <span>{{ warn.severity === 'critical' ? '🚨' : '⚠️' }}</span>
                  <strong>{{ warn.title }}</strong>
                </div>
                <p class="linter-desc">{{ warn.explanation }}</p>
              </div>
            }
          </div>
        }

        <!-- Quick Hint Overlay in Bottom-Left of Canvas -->
        <div class="quick-guide">
          <span><strong>Tip:</strong> Click dock node to <b>Build</b> • Press <b>W</b> to <b>Wire</b> • Click node to <b>Upgrade</b> • <b>Ctrl+Z / Ctrl+Y</b> Undo/Redo</span>
        </div>

        <app-node-inspector />
      </main>

      <app-node-toolbar />
      <app-level-modal />
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      background: #070b14;
      color: #f8fafc;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
    }
    .game-shell {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
    }
    .canvas-stage {
      position: relative;
      flex: 1;
      width: 100%;
      overflow: hidden;
      background: #070b14;
    }
    .phaser-viewport {
      width: 100%;
      height: 100%;
    }
    .toast-pill {
      position: absolute;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(15, 23, 42, 0.95);
      border: 1px solid #00f2fe;
      color: #f8fafc;
      padding: 8px 18px;
      border-radius: 999px;
      font-size: 12.5px;
      font-weight: 700;
      box-shadow: 0 8px 25px rgba(0, 242, 254, 0.25);
      z-index: 40;
      pointer-events: none;
    }
    .linter-stack {
      position: absolute;
      top: 12px;
      left: 16px;
      max-width: 390px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      z-index: 22;
      pointer-events: none;
    }
    .linter-card {
      background: rgba(15, 23, 42, 0.92);
      border: 1px solid rgba(251, 191, 36, 0.55);
      border-left: 4px solid #fbbf24;
      border-radius: 9px;
      padding: 8px 11px;
      backdrop-filter: blur(8px);
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.55);
    }
    .linter-card.critical {
      border-color: rgba(255, 75, 92, 0.75);
      border-left: 4px solid #ff4b5c;
      background: rgba(38, 10, 18, 0.92);
    }
    .linter-title {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11.5px;
      color: #fde68a;
    }
    .linter-card.critical .linter-title {
      color: #fda4af;
    }
    .linter-desc {
      margin: 4px 0 0;
      font-size: 10.5px;
      line-height: 1.38;
      color: #cbd5e1;
    }
    .quick-guide {
      position: absolute;
      bottom: 12px;
      left: 16px;
      background: rgba(15, 23, 42, 0.82);
      border: 1px solid rgba(51, 65, 85, 0.75);
      color: #94a3b8;
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 11px;
      pointer-events: none;
      z-index: 20;
    }
    .quick-guide strong,
    .quick-guide b {
      color: #e2e8f0;
    }
  `,
})
export class App implements AfterViewInit, OnDestroy {
  readonly store = inject(GameStoreService);
  readonly phaserContainer = viewChild.required<ElementRef<HTMLDivElement>>('phaserContainer');

  private phaserGame: Phaser.Game | null = null;

  ngAfterViewInit(): void {
    const container = this.phaserContainer().nativeElement;
    const scene = new ArchitectureScene(this.store);

    this.phaserGame = new Phaser.Game({
      type: Phaser.AUTO,
      parent: container,
      width: container.clientWidth || 1280,
      height: container.clientHeight || 680,
      backgroundColor: '#070b14',
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      fps: {
        target: 60,
        forceSetTimeOut: false,
      },
      scene: [scene],
    });

    // Prevent browser context menu on right-click inside canvas
    container.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  ngOnDestroy(): void {
    this.phaserGame?.destroy(true);
    this.phaserGame = null;
  }
}
