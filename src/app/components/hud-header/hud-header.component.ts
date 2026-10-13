import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GameStoreService } from '../../game/services/game-store.service';

@Component({
  selector: 'app-hud-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="hud-bar">
      <!-- Left: Brand & Level Selector -->
      <div class="brand-cluster">
        <div class="logo-badge">
          <span class="pulse-dot"></span>
          <span class="logo-text">SCALE OR DIE</span>
        </div>

        <div class="level-picker">
          <select
            class="level-select"
            [value]="store.currentLevelIndex()"
            (change)="onLevelChange($event)"
            aria-label="Select Campaign Level"
          >
            @for (lvl of store.levels; track lvl.id; let i = $index) {
              <option [value]="i">
                {{ lvl.title }}
                @if (store.completedLevels()[lvl.id]; as stars) {
                  ({{ '★'.repeat(stars) }})
                }
              </option>
            }
          </select>
          <span class="concept-pill" [title]="store.currentLevel().conceptBadge">
            {{ store.currentLevel().conceptBadge }}
          </span>
        </div>
      </div>

      <!-- Center: Live SLA & Performance Telemetry -->
      <div class="telemetry-cluster">
        <div class="metric-card" [class.danger]="isSlaDanger()" [class.healthy]="!isSlaDanger()">
          <span class="metric-label">SLA (&ge;{{ store.currentLevel().targetSlaPercent }}%)</span>
          <span class="metric-value">{{ store.telemetry().slaPercent }}%</span>
        </div>

        <div class="metric-card">
          <span class="metric-label">P95 (&le;{{ store.currentLevel().targetLatencyMs }}ms)</span>
          <span class="metric-value cyan">{{ store.telemetry().p95LatencyMs }} ms</span>
        </div>

        <div class="metric-card">
          <span class="metric-label">LOAD / INCOMING</span>
          <span class="metric-value">
            {{ store.telemetry().currentRps }}
            <small>/ {{ store.telemetry().incomingRps }} RPS</small>
          </span>
        </div>

        <div class="metric-card">
          <span class="metric-label">OK / 403 / DROP</span>
          <span class="metric-value">
            <span class="ok-txt">{{ store.telemetry().totalResolved }}</span> /
            <span class="waf-txt">{{ store.telemetry().totalBlockedMalicious }}</span> /
            <span class="err-txt">{{ store.telemetry().totalFailed }}</span>
          </span>
        </div>

        <div class="metric-card budget-card">
          <span class="metric-label">BUDGET</span>
          <span class="metric-value gold">\${{ store.budget() }}</span>
        </div>

        <div class="metric-card score-card">
          <span class="metric-label">SCORE</span>
          <span class="metric-value cyan">
            {{ store.telemetry().score }}
            @if (store.completedLevels()[store.currentLevel().id]; as stars) {
              <span class="gold">{{ '★'.repeat(stars) }}</span>
            }
          </span>
        </div>
      </div>

      <!-- Right: Wave & Guide Controls -->
      <div class="actions-cluster">
        @if (!store.isWaveRunning()) {
          <button type="button" class="btn btn-launch" (click)="store.startWave()">
            ▶ LAUNCH WAVE
          </button>
        } @else {
          <button type="button" class="btn btn-pause" (click)="store.togglePause()">
            {{ store.isPaused() ? '▶ RESUME' : '⏸ PAUSE' }}
          </button>
          <button type="button" class="btn btn-stop" (click)="store.resetWave()">
            ⏹ ABORT
          </button>
        }

        <button
          type="button"
          class="btn btn-icon"
          [class.active]="store.simSpeed() === 2"
          (click)="store.toggleSimSpeed()"
          title="Toggle Simulation Speed (1x / 2x)"
        >
          {{ store.simSpeed() }}x
        </button>

        <button
          type="button"
          class="btn btn-secondary"
          (click)="store.autoArchitectCurrentLevel()"
          title="Auto-build the recommended reference architecture for this level"
        >
          ⚡ Blueprint
        </button>

        <button
          type="button"
          class="btn btn-secondary"
          (click)="store.showBriefingModal.set(true)"
          title="View Level Briefing & Hints"
        >
          📋 Briefing
        </button>

        <button
          type="button"
          class="btn btn-secondary"
          (click)="store.showCodexModal.set(true)"
          title="Open System Design Field Guide"
        >
          📘 Codex
        </button>

        <button
          type="button"
          class="btn btn-icon"
          (click)="store.toggleMute()"
          title="Mute / Unmute Synth Audio"
        >
          {{ store.isMuted() ? '🔇' : '🔊' }}
        </button>
      </div>
    </header>

    <!-- Sub-bar: Wave Progress & Active Traffic Announcement -->
    <div class="wave-banner">
      <div class="wave-announcement">
        <span class="status-tag" [class.live]="store.isWaveRunning()">
          {{ store.isWaveRunning() ? 'LIVE TRAFFIC' : 'ARCHITECT MODE' }}
        </span>
        <span class="announcement-text">{{ store.telemetry().currentSegmentAnnouncement }}</span>
      </div>

      <div class="wave-progress-wrap">
        <div class="wave-progress-fill" [style.width.%]="waveProgressPct()"></div>
      </div>

      <div class="packet-legend">
        <span class="legend-item"><i class="dot get"></i> GET Read</span>
        <span class="legend-item"><i class="dot post"></i> POST Write</span>
        <span class="legend-item"><i class="dot static"></i> STATIC Media</span>
        <span class="legend-item"><i class="dot async"></i> ASYNC Job</span>
        <span class="legend-item"><i class="dot ddos"></i> DDoS Attack</span>
      </div>
    </div>
  `,
  styles: `
    .hud-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
      padding: 6px 12px;
      background: rgba(9, 14, 26, 0.95);
      border-bottom: 1px solid rgba(56, 189, 248, 0.22);
      backdrop-filter: blur(12px);
      z-index: 30;
    }
    .brand-cluster {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .logo-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 8px;
      background: linear-gradient(135deg, rgba(0, 242, 254, 0.16), rgba(59, 130, 246, 0.16));
      border: 1px solid rgba(0, 242, 254, 0.45);
      border-radius: 7px;
      flex-shrink: 0;
    }
    .pulse-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #00f2fe;
      box-shadow: 0 0 8px #00f2fe;
    }
    .logo-text {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 800;
      font-size: 11.5px;
      letter-spacing: 0.06em;
      color: #f8fafc;
      white-space: nowrap;
    }
    .level-picker {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }
    .level-select {
      background: #0f172a;
      color: #f8fafc;
      border: 1px solid #334155;
      border-radius: 6px;
      padding: 5px 8px;
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
      max-width: 245px;
      text-overflow: ellipsis;
    }
    .concept-pill {
      font-size: 10px;
      font-weight: 600;
      color: #38bdf8;
      background: rgba(56, 189, 248, 0.12);
      border: 1px solid rgba(56, 189, 248, 0.3);
      padding: 3px 7px;
      border-radius: 999px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 165px;
    }
    @media (max-width: 1480px) {
      .concept-pill {
        display: none;
      }
    }
    .telemetry-cluster {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .metric-card {
      display: flex;
      flex-direction: column;
      padding: 3px 8px;
      background: rgba(15, 23, 42, 0.85);
      border: 1px solid rgba(51, 65, 85, 0.8);
      border-radius: 7px;
      min-width: 78px;
    }
    .metric-card.healthy {
      border-color: rgba(16, 185, 129, 0.45);
    }
    .metric-card.danger {
      border-color: rgba(255, 75, 92, 0.8);
      background: rgba(255, 75, 92, 0.12);
    }
    .budget-card {
      border-color: rgba(251, 191, 36, 0.5);
    }
    .metric-label {
      font-size: 8.5px;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: #94a3b8;
      white-space: nowrap;
    }
    .metric-value {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12.5px;
      font-weight: 700;
      color: #f8fafc;
      white-space: nowrap;
    }
    .metric-value.cyan {
      color: #00f2fe;
    }
    .metric-value.gold {
      color: #fbbf24;
    }
    .ok-txt {
      color: #10b981;
    }
    .waf-txt {
      color: #fb923c;
    }
    .err-txt {
      color: #ff4b5c;
    }
    .actions-cluster {
      display: flex;
      align-items: center;
      gap: 5px;
      flex-shrink: 0;
    }
    .btn {
      border: none;
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 11.5px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
    }
    .btn-launch {
      background: linear-gradient(135deg, #10b981, #059669);
      color: #022c22;
      box-shadow: 0 0 14px rgba(16, 185, 129, 0.4);
    }
    .btn-launch:hover {
      transform: translateY(-1px);
      box-shadow: 0 0 20px rgba(16, 185, 129, 0.65);
    }
    .btn-pause {
      background: #f59e0b;
      color: #020617;
    }
    .btn-stop {
      background: #ef4444;
      color: #fff;
    }
    .btn-secondary {
      background: #1e293b;
      color: #e2e8f0;
      border: 1px solid #334155;
    }
    .btn-secondary:hover {
      background: #334155;
      border-color: #38bdf8;
    }
    .btn-icon {
      background: #1e293b;
      color: #e2e8f0;
      border: 1px solid #334155;
      padding: 6px 8px;
    }
    .btn-icon.active {
      background: rgba(0, 242, 254, 0.2);
      border-color: #00f2fe;
      color: #00f2fe;
    }
    .wave-banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 4px 12px;
      background: rgba(15, 23, 42, 0.92);
      border-bottom: 1px solid rgba(30, 41, 59, 0.9);
      font-size: 10.5px;
    }
    .wave-announcement {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .status-tag {
      font-family: 'JetBrains Mono', monospace;
      font-size: 9.5px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(56, 189, 248, 0.15);
      color: #38bdf8;
      white-space: nowrap;
    }
    .status-tag.live {
      background: rgba(16, 185, 129, 0.2);
      color: #10b981;
    }
    .announcement-text {
      color: #cbd5e1;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .wave-progress-wrap {
      flex: 1;
      max-width: 260px;
      height: 5px;
      background: #1e293b;
      border-radius: 999px;
      overflow: hidden;
    }
    .wave-progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #00f2fe, #10b981);
      transition: width 0.25s linear;
    }
    .packet-legend {
      display: flex;
      align-items: center;
      gap: 10px;
      color: #94a3b8;
      font-size: 10.5px;
      white-space: nowrap;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .dot {
      display: inline-block;
      width: 7px;
      height: 7px;
      border-radius: 50%;
    }
    .dot.get {
      background: #00f2fe;
      box-shadow: 0 0 6px #00f2fe;
    }
    .dot.post {
      background: #fbbf24;
      box-shadow: 0 0 6px #fbbf24;
    }
    .dot.static {
      background: #c084fc;
      box-shadow: 0 0 6px #c084fc;
    }
    .dot.async {
      background: #34d399;
      box-shadow: 0 0 6px #34d399;
    }
    .dot.ddos {
      background: #ff3366;
      box-shadow: 0 0 6px #ff3366;
    }
  `,
})
export class HudHeaderComponent {
  readonly store = inject(GameStoreService);

  readonly isSlaDanger = computed(
    () => this.store.telemetry().slaPercent < this.store.currentLevel().targetSlaPercent
  );

  readonly waveProgressPct = computed(() => {
    const t = this.store.telemetry();
    if (t.waveTotalSec <= 0) return 0;
    return Math.min(100, Math.round((t.waveElapsedSec / t.waveTotalSec) * 100));
  });

  onLevelChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const idx = Number(select.value);
    this.store.selectLevel(idx);
  }
}
