# Scale or Die: The System Design 2D Game — Walkthrough

## Overview
We built **Scale or Die**, a 2D Tower Defense & Traffic Routing web game inside [`/home/ahsanayaz/system-design-game`](file:///home/ahsanayaz/system-design-game) using **Phaser 3 (WebGL 60 FPS)** and **Angular (Standalone Components, Signals, `OnPush` Change Detection)**.

Players act as a Principal Systems Architect placing cloud infrastructure nodes on an interactive 2D cyber-grid, wiring data pipes between tiers, tuning routing/caching policies, and surviving waves of real-world traffic (`GET` reads, `POST` writes, `STATIC` 4K media, `ASYNC` jobs, and `MALICIOUS` DDoS bot floods) while meeting strict **SLA Uptime (%)**, **P95 Latency (ms)**, and **Cloud Budget ($)** targets.

---

## Custom Isometric Game Sprites
We generated custom isometric cyber-tech sprite sheets using the `image-generator` subagent and sliced them into 15 transparent PNG sprites in [`public/assets/sprites/`](file:///home/ahsanayaz/system-design-game/public/assets/sprites):

````carousel
![Infrastructure Nodes Sprite Sheet (Ingress, WAF, Load Balancer, CDN, App Server, Redis Cache, Kafka Message Queue, Primary SQL DB, Sharded DB Cluster)](/home/ahsanayaz/.gemini/antigravity-cli/brain/fb796006-dc73-40fe-9cf5-b2b32e8563d8/infrastructure_spritesheet_3x3_final_1791550881550.jpg)
<!-- slide -->
![Read Replica DB & Traffic Packet Sprites (Read Replica, GET Read, POST Write, STATIC Media, ASYNC Job, Malicious DDoS Drone)](/home/ahsanayaz/.gemini/antigravity-cli/brain/fb796006-dc73-40fe-9cf5-b2b32e8563d8/packets_and_replica_spritesheet_3x2_1791550914005.jpg)
````

---

## Key Components & Files Created

### 1. Core Data Models, Catalog & 8 Campaign Levels
* [`game.models.ts`](file:///home/ahsanayaz/system-design-game/src/app/game/models/game.models.ts): Strict TypeScript interfaces for all 10 `NodeType`s, 5 `PacketType`s, routing strategies (`round_robin`, `least_connections`, `ip_hash`), cache eviction strategies (`lru_85`, `write_through_92`, `aggressive_ttl`), and real-time SLA telemetry snapshots.
* [`node-catalog.ts`](file:///home/ahsanayaz/system-design-game/src/app/game/levels/node-catalog.ts): Full hardware specs, cloud costs, base RPS capacity, latency, and system design tips for every node and packet type.
* [`campaign.levels.ts`](file:///home/ahsanayaz/system-design-game/src/app/game/levels/campaign.levels.ts):
  1. **Level 1 — Hello World & Vertical Scaling**: Connect `Ingress → App Server → Primary SQL` and upgrade hardware tiers.
  2. **Level 2 — The Slashdot Effect**: Scale stateless compute horizontally behind an **L7 Load Balancer**.
  3. **Level 3 — Database Meltdown**: Add an in-memory **Redis Cache** (`Cache-Aside` / `Write-Through`) to absorb 85–92% of `GET` reads in `2ms`.
  4. **Level 4 — Viral Media Storm**: Offload `STATIC` video traffic at the edge with a **CDN** and split SQL reads using **Read Replicas**.
  5. **Level 5 — Black Friday Flash Sale**: Buffer spiky `ASYNC` checkout bursts using a **Kafka Message Queue** for load leveling and backpressure protection.
  6. **Level 6 — Write Bottleneck & DB Sharding**: Partition high-velocity `POST` writes across a **Sharded DB Cluster** via Consistent Hashing.
  7. **Level 7 — Botnet Apocalypse (Planet Scale)**: Scrub `MALICIOUS` DDoS traffic at the perimeter with an **API Gateway / WAF** while serving global multi-vector traffic.
  8. **Bonus Level 8 — Chaos Engineering Sandbox**: Infinite escalating RPS stress test with $3,000 budget and all 10 node types unlocked.

### 2. Phaser 3 Engine, Routing Simulation & Web Audio Synth
* [`routing-engine.ts`](file:///home/ahsanayaz/system-design-game/src/app/game/engine/routing-engine.ts): Pure, deterministic packet routing & system design rules engine (`evaluatePacketAtNode`, `computeNodeStatsForTier`).
* [`architecture.scene.ts`](file:///home/ahsanayaz/system-design-game/src/app/game/scenes/architecture.scene.ts): Phaser 3 `Scene` rendering the zoned cyber-grid, animated data pipes, floating node sprites with live CPU/Queue bars and status LEDs, particle bursts, floating combat text (`200 Redis HIT`, `403 DDoS Blocked`, `503 Queue Overflow`), and a one-click **Auto-Blueprint** builder for every level.
* [`sound-engine.ts`](file:///home/ahsanayaz/system-design-game/src/app/game/audio/sound-engine.ts): Zero-dependency procedural Web Audio synthesizer for placement, wiring, upgrades, cache hits, WAF blocks, and victory fanfare.

### 3. Angular Signals HUD & Interactive Overlays
* [`game-store.service.ts`](file:///home/ahsanayaz/system-design-game/src/app/game/services/game-store.service.ts): Reactive state bridge between Phaser 3 and Angular using `signal()` and `computed()`.
* [`hud-header.component.ts`](file:///home/ahsanayaz/system-design-game/src/app/components/hud-header/hud-header.component.ts): Live SLA Uptime gauge, P95 Latency meter, RPS counter, Cloud Budget, Wave controls (`Launch`, `Pause`, `1x/2x`, `Auto-Blueprint`), and Packet Legend.
* [`node-toolbar.component.ts`](file:///home/ahsanayaz/system-design-game/src/app/components/node-toolbar/node-toolbar.component.ts): Bottom dock with tool modes (`Inspect [S]`, `Wire Pipe [W]`, `Remove [X]`, `Reset Grid`) and the unlocked node shop.
* [`node-inspector.component.ts`](file:///home/ahsanayaz/system-design-game/src/app/components/node-inspector/node-inspector.component.ts): Contextual right-hand drawer to inspect a node's live queue depth, switch Load Balancing or Redis Caching strategies, and upgrade hardware from Tier 1 → Tier 3.
* [`level-modal.component.ts`](file:///home/ahsanayaz/system-design-game/src/app/components/level-modal/level-modal.component.ts): Interactive Incident Briefing modal, 3-Star SLA Scorecard modal, and the full **System Design Codex** encyclopedia.

---

## Verification & Test Results

1. **Production Build (`npm run build`)**: Compiled cleanly with zero TypeScript or Angular template errors.
2. **Unit Tests (`npm test -- --watch=false`)**: All 5 Vitest unit suites in [`app.spec.ts`](file:///home/ahsanayaz/system-design-game/src/app/app.spec.ts) passed:
   * WAF scrubbing `MALICIOUS` DDoS packets (`403`) while forwarding legitimate requests.
   * CDN Edge terminating `STATIC` media requests (`200 Edge Hit`) and forwarding dynamic traffic.
   * Redis Cache resolving `GET` hits in memory (`2ms`) and forwarding cache misses to SQL DB.
   * Load Balancer distributing traffic via *Round Robin* and *Least Connections*.
   * Read Replica DB fulfilling `GET` reads and rejecting unwired `POST` writes.
3. **Live Dev Server**: Running and verified on **`http://127.0.0.1:4210`** (all sprite assets and index bundle returning `200 OK`).
