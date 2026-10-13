import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GameStoreService } from '../../game/services/game-store.service';
import { NODE_CATALOG, PACKET_VISUALS } from '../../game/levels/node-catalog';

@Component({
  selector: 'app-level-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- 1. Level Briefing Modal -->
    @if (store.showBriefingModal()) {
      <div class="modal-backdrop" (click)="store.showBriefingModal.set(false)">
        <div class="modal-card" (click)="$event.stopPropagation()">
          <div class="modal-top-bar">
            <span class="badge-pill">{{ store.currentLevel().conceptBadge }}</span>
            <button
              type="button"
              class="close-x"
              (click)="store.showBriefingModal.set(false)"
            >
              ✕
            </button>
          </div>

          <h2 class="modal-title">{{ store.currentLevel().title }}</h2>
          <p class="modal-subtitle">{{ store.currentLevel().subtitle }}</p>

          <div class="section-box scenario">
            <h4>🚨 Incident / Traffic Scenario</h4>
            <p>{{ store.currentLevel().scenarioBriefing }}</p>
          </div>

          <div class="section-box lesson">
            <h4>🧠 System Design Principle</h4>
            <p>{{ store.currentLevel().architecturalLesson }}</p>
            <div class="analogy">
              <strong>Real-World Analogy:</strong> {{ store.currentLevel().realWorldAnalogy }}
            </div>
          </div>

          <div class="sla-targets-row">
            <div class="target-chip">
              <span class="t-label">SLA TARGET</span>
              <span class="t-val">&ge; {{ store.currentLevel().targetSlaPercent }}%</span>
            </div>
            <div class="target-chip">
              <span class="t-label">P95 LATENCY</span>
              <span class="t-val">&le; {{ store.currentLevel().targetLatencyMs }} ms</span>
            </div>
            <div class="target-chip">
              <span class="t-label">CLOUD BUDGET</span>
              <span class="t-val gold">\${{ store.currentLevel().startingBudget }}</span>
            </div>
          </div>

          <div class="hints-box">
            <h4>🛠️ Architect Checklist & Hints</h4>
            <ul>
              @for (hint of store.currentLevel().hints; track hint) {
                <li>{{ hint }}</li>
              }
            </ul>
          </div>

          <div class="modal-footer">
            <button
              type="button"
              class="btn-outline"
              (click)="applyBlueprintAndClose()"
            >
              ⚡ Load Reference Blueprint
            </button>
            <button
              type="button"
              class="btn-primary"
              (click)="store.showBriefingModal.set(false)"
            >
              Start Architecting →
            </button>
          </div>
        </div>
      </div>
    }

    <!-- 2. Wave Complete / SLA Scorecard Modal -->
    @if (store.levelResultModal(); as res) {
      <div class="modal-backdrop">
        <div class="modal-card scorecard-card">
          <div class="result-banner" [class.pass]="res.passed" [class.fail]="!res.passed">
            {{ res.passed ? '🎉 SLA BENCHMARK PASSED!' : '💥 SLA BREACH — OUTAGE DETECTED' }}
          </div>

          <h2 class="modal-title">{{ store.currentLevel().title }}</h2>

          <div class="stars-row">
            @for (star of [1, 2, 3]; track star) {
              <span class="star-icon" [class.earned]="res.stars >= star">★</span>
            }
          </div>

          <p class="feedback-text">{{ res.feedbackSummary }}</p>

          <div class="sla-targets-row">
            <div class="target-chip">
              <span class="t-label">FINAL SLA UPTIME</span>
              <span class="t-val" [class.err]="!res.passed">{{ res.slaPercent }}%</span>
            </div>
            <div class="target-chip">
              <span class="t-label">P95 LATENCY</span>
              <span class="t-val cyan">{{ res.p95LatencyMs }} ms</span>
            </div>
            <div class="target-chip">
              <span class="t-label">ARCHITECT SCORE</span>
              <span class="t-val gold">{{ res.score }}</span>
            </div>
          </div>

          <div class="modal-footer">
            <button
              type="button"
              class="btn-outline"
              (click)="store.levelResultModal.set(null)"
            >
              🔧 Tweak Architecture
            </button>

            @if (hasNextLevel()) {
              <button
                type="button"
                class="btn-primary"
                (click)="goToNextLevel()"
              >
                Next Campaign Level →
              </button>
            }
          </div>
        </div>
      </div>
    }

    <!-- 3. System Design Codex Modal -->
    @if (store.showCodexModal()) {
      <div class="modal-backdrop" (click)="store.showCodexModal.set(false)">
        <div class="modal-card codex-card" (click)="$event.stopPropagation()">
          <div class="modal-top-bar">
            <span class="badge-pill">SYSTEM DESIGN ENCYCLOPEDIA</span>
            <button
              type="button"
              class="close-x"
              (click)="store.showCodexModal.set(false)"
            >
              ✕
            </button>
          </div>

          <h2 class="modal-title">Cloud Infrastructure & Packet Codex</h2>

          <div class="codex-grid">
            @for (item of allNodes; track item.type) {
              <div class="codex-item">
                <img
                  class="codex-img"
                  [src]="'assets/sprites/' + item.spriteKey + '.png'"
                  [alt]="item.name"
                />
                <div class="codex-info">
                  <div class="codex-head">
                    <strong>{{ item.name }}</strong>
                    <span class="codex-cost">
                      {{ item.cost > 0 ? '$' + item.cost : 'Edge Portal' }} •
                      {{ item.baseCapacityRps }} RPS • {{ item.baseLatencyMs }}ms
                    </span>
                  </div>
                  <p>{{ item.description }}</p>
                </div>
              </div>
            }
          </div>

          <h4 class="subhead">Network Traffic Packet Types</h4>
          <div class="packet-codex-row">
            @for (pkt of allPackets; track pkt.label) {
              <div class="pkt-chip">
                <img [src]="'assets/sprites/' + pkt.spriteKey + '.png'" [alt]="pkt.label" />
                <div>
                  <strong [style.color]="pkt.colorHex">{{ pkt.label }}</strong>
                  <p>{{ pkt.description }}</p>
                </div>
              </div>
            }
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(2, 6, 23, 0.78);
      backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
      padding: 20px;
    }
    .modal-card {
      width: 100%;
      max-width: 640px;
      max-height: 88vh;
      overflow-y: auto;
      background: #0b1120;
      border: 1px solid rgba(56, 189, 248, 0.4);
      border-radius: 16px;
      padding: 22px 26px;
      color: #f8fafc;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.85);
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .codex-card {
      max-width: 820px;
    }
    .modal-top-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .badge-pill {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      font-weight: 700;
      color: #00f2fe;
      background: rgba(0, 242, 254, 0.12);
      border: 1px solid rgba(0, 242, 254, 0.35);
      padding: 4px 10px;
      border-radius: 999px;
    }
    .close-x {
      background: transparent;
      border: none;
      color: #94a3b8;
      font-size: 18px;
      cursor: pointer;
    }
    .modal-title {
      margin: 0;
      font-size: 22px;
      font-weight: 800;
    }
    .modal-subtitle {
      margin: -8px 0 0;
      font-size: 13px;
      color: #94a3b8;
    }
    .section-box {
      padding: 12px 14px;
      border-radius: 10px;
      font-size: 13px;
      line-height: 1.5;
    }
    .section-box h4 {
      margin: 0 0 6px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .section-box p {
      margin: 0;
      color: #e2e8f0;
    }
    .scenario {
      background: rgba(245, 158, 11, 0.09);
      border: 1px solid rgba(245, 158, 11, 0.35);
    }
    .scenario h4 {
      color: #fbbf24;
    }
    .lesson {
      background: rgba(56, 189, 248, 0.09);
      border: 1px solid rgba(56, 189, 248, 0.35);
    }
    .lesson h4 {
      color: #38bdf8;
    }
    .analogy {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px dashed rgba(56, 189, 248, 0.25);
      font-size: 12px;
      color: #bae6fd;
    }
    .sla-targets-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
    }
    .target-chip {
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 10px;
      padding: 10px;
      text-align: center;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .t-label {
      font-size: 10px;
      font-weight: 700;
      color: #64748b;
    }
    .t-val {
      font-family: 'JetBrains Mono', monospace;
      font-size: 16px;
      font-weight: 800;
      color: #10b981;
    }
    .t-val.cyan {
      color: #00f2fe;
    }
    .t-val.gold {
      color: #fbbf24;
    }
    .t-val.err {
      color: #ff4b5c;
    }
    .hints-box {
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 10px;
      padding: 12px 16px;
    }
    .hints-box h4 {
      margin: 0 0 8px;
      font-size: 12px;
      color: #cbd5e1;
    }
    .hints-box ul {
      margin: 0;
      padding-left: 18px;
      font-size: 12.5px;
      color: #94a3b8;
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 4px;
    }
    .btn-primary {
      background: linear-gradient(135deg, #00f2fe, #3b82f6);
      color: #020617;
      border: none;
      border-radius: 8px;
      padding: 10px 18px;
      font-size: 13px;
      font-weight: 800;
      cursor: pointer;
    }
    .btn-outline {
      background: #1e293b;
      color: #e2e8f0;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 10px 16px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
    }
    .result-banner {
      text-align: center;
      padding: 8px;
      border-radius: 8px;
      font-family: 'JetBrains Mono', monospace;
      font-weight: 800;
      font-size: 13px;
    }
    .result-banner.pass {
      background: rgba(16, 185, 129, 0.2);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.45);
    }
    .result-banner.fail {
      background: rgba(255, 75, 92, 0.2);
      color: #fda4af;
      border: 1px solid rgba(255, 75, 92, 0.45);
    }
    .stars-row {
      display: flex;
      justify-content: center;
      gap: 12px;
      font-size: 38px;
    }
    .star-icon {
      color: #1e293b;
    }
    .star-icon.earned {
      color: #fbbf24;
      text-shadow: 0 0 18px rgba(251, 191, 36, 0.65);
    }
    .feedback-text {
      text-align: center;
      font-size: 13.5px;
      color: #cbd5e1;
      margin: 0;
    }
    .codex-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .codex-item {
      display: flex;
      gap: 10px;
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 10px;
      padding: 10px;
    }
    .codex-img {
      width: 48px;
      height: 48px;
      object-fit: contain;
    }
    .codex-info {
      font-size: 11.5px;
      color: #94a3b8;
    }
    .codex-info p {
      margin: 4px 0 0;
    }
    .codex-head {
      display: flex;
      flex-direction: column;
      color: #f8fafc;
    }
    .codex-cost {
      font-size: 10px;
      color: #38bdf8;
    }
    .subhead {
      margin: 4px 0 0;
      font-size: 13px;
      color: #cbd5e1;
    }
    .packet-codex-row {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }
    .pkt-chip {
      display: flex;
      align-items: center;
      gap: 10px;
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 8px;
      padding: 8px 10px;
      font-size: 11px;
    }
    .pkt-chip img {
      width: 34px;
      height: 34px;
      object-fit: contain;
    }
    .pkt-chip p {
      margin: 2px 0 0;
      color: #94a3b8;
    }
  `,
})
export class LevelModalComponent {
  readonly store = inject(GameStoreService);

  readonly allNodes = Object.values(NODE_CATALOG);
  readonly allPackets = Object.values(PACKET_VISUALS);

  readonly hasNextLevel = computed(
    () => this.store.currentLevelIndex() < this.store.levels.length - 1
  );

  applyBlueprintAndClose(): void {
    this.store.autoArchitectCurrentLevel();
    this.store.showBriefingModal.set(false);
  }

  goToNextLevel(): void {
    const nextIdx = this.store.currentLevelIndex() + 1;
    this.store.selectLevel(nextIdx);
  }
}
