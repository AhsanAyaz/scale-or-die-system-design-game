import { LevelDefinition } from '../models/game.models';

export const CAMPAIGN_LEVELS: readonly LevelDefinition[] = [
  {
    id: 1,
    slug: 'single-point-of-failure',
    title: 'Level 1: Hello World & Vertical Scaling',
    subtitle: 'Connect your first cloud stack and survive launch day',
    conceptBadge: 'Vertical Scaling & Request Path',
    scenarioBriefing:
      'Welcome, Principal Architect! Your startup is going live in 60 seconds. You have an Internet Ingress portal, one Stateless App Server, and a Primary SQL Database—but the data pipes are disconnected and the hardware is undersized.',
    architecturalLesson:
      'Every request flows from Ingress → Compute (App Server) → Durable Storage (Database). Vertical scaling ("scaling up" to higher CPU/RAM tiers) is the fastest way to boost single-node capacity, but has hard physical limits.',
    realWorldAnalogy:
      'Vertical scaling is like swapping a sedan engine for a V8: simple and effective at first, until you need to carry 500 passengers.',
    startingBudget: 450,
    targetSlaPercent: 95,
    targetLatencyMs: 65,
    unlockedNodes: ['app_server', 'sql_db'],
    starterNodes: [
      { id: 'n_ingress_1', type: 'ingress', gridX: 1, gridY: 3, locked: true, label: 'DNS Ingress' },
      { id: 'n_app_1', type: 'app_server', gridX: 5, gridY: 3, tier: 1, label: 'App-01' },
      { id: 'n_db_1', type: 'sql_db', gridX: 9, gridY: 3, tier: 1, label: 'Primary-SQL' },
    ],
    starterWires: [
      { fromId: 'n_ingress_1', toId: 'n_app_1' },
    ],
    waves: [
      {
        durationSec: 12,
        rps: 8,
        announcement: 'Early Beta Testers Logging In (8 RPS)',
        mix: { GET: 75, POST: 25, STATIC: 0, ASYNC: 0, MALICIOUS: 0 },
      },
      {
        durationSec: 14,
        rps: 15,
        announcement: 'Product Hunt Frontpage Traffic! (15 RPS)',
        mix: { GET: 70, POST: 30, STATIC: 0, ASYNC: 0, MALICIOUS: 0 },
      },
    ],
    hints: [
      'Select the WIRE tool (or press W) and connect App-01 → Primary-SQL so requests can reach the database!',
      'Click on App-01 and Primary-SQL and upgrade them to Tier 2 before the Product Hunt spike hits.',
    ],
  },
  {
    id: 2,
    slug: 'horizontal-scaling',
    title: 'Level 2: The Slashdot Effect',
    subtitle: 'Scale out stateless compute behind an L7 Load Balancer',
    conceptBadge: 'Horizontal Scaling & Load Balancing',
    scenarioBriefing:
      'Your app went viral on Hacker News! A single App Server—even upgraded—cannot process 32+ concurrent requests per second without dropping connections. You need Horizontal Scaling.',
    architecturalLesson:
      'By keeping App Servers stateless (storing session/user data in the DB or Cache instead of local disk), you can place an L7 Load Balancer in front of multiple App Servers and distribute traffic via Round Robin or Least Connections.',
    realWorldAnalogy:
      'Instead of hiring one superhuman cashier, open 3 checkout lanes with a traffic director pointing customers to the shortest line.',
    startingBudget: 680,
    targetSlaPercent: 96,
    targetLatencyMs: 60,
    unlockedNodes: ['load_balancer', 'app_server', 'sql_db'],
    starterNodes: [
      { id: 'n_ingress_1', type: 'ingress', gridX: 1, gridY: 3, locked: true, label: 'Global Ingress' },
      { id: 'n_lb_1', type: 'load_balancer', gridX: 3, gridY: 3, tier: 1, label: 'ALB-Edge' },
      { id: 'n_app_1', type: 'app_server', gridX: 6, gridY: 1, tier: 1, label: 'App-North' },
      { id: 'n_db_1', type: 'sql_db', gridX: 10, gridY: 3, tier: 2, label: 'Primary-SQL' },
    ],
    starterWires: [
      { fromId: 'n_ingress_1', toId: 'n_lb_1' },
      { fromId: 'n_lb_1', toId: 'n_app_1' },
      { fromId: 'n_app_1', toId: 'n_db_1' },
    ],
    waves: [
      {
        durationSec: 12,
        rps: 18,
        announcement: 'Morning Commute Surge (18 RPS)',
        mix: { GET: 80, POST: 20, STATIC: 0, ASYNC: 0, MALICIOUS: 0 },
      },
      {
        durationSec: 16,
        rps: 32,
        announcement: 'Hacker News #1 Trending Spike! (32 RPS)',
        mix: { GET: 75, POST: 25, STATIC: 0, ASYNC: 0, MALICIOUS: 0 },
      },
    ],
    hints: [
      'Place 1 or 2 additional Stateless App Servers in the middle column (grid X=6).',
      'Wire ALB-Edge → each new App Server, and wire each App Server → Primary-SQL.',
      'Upgrade Primary-SQL to Tier 3 so it can handle the combined output of your App Server fleet!',
    ],
  },
  {
    id: 3,
    slug: 'redis-caching',
    title: 'Level 3: Database Meltdown',
    subtitle: 'Protect your SQL disk I/O with an in-memory Redis Cache',
    conceptBadge: 'In-Memory Caching (Cache-Aside)',
    scenarioBriefing:
      '90% of incoming traffic is users refreshing the same leaderboard (`GET` reads). Your Primary SQL Database disk heads are glowing red-hot! Adding more App Servers only hammers the database faster.',
    architecturalLesson:
      'An in-memory cache like Redis sits between your App Servers and Database. On a Cache Hit (85–92% of GET reads), Redis responds in 2ms without touching the database! Only Cache Misses and POST writes travel onward to SQL.',
    realWorldAnalogy:
      'Keeping the 100 most-asked reference books on your desk (RAM) instead of walking down to the basement archive vault (Disk) for every question.',
    startingBudget: 740,
    targetSlaPercent: 97,
    targetLatencyMs: 38,
    unlockedNodes: ['load_balancer', 'app_server', 'redis_cache', 'sql_db'],
    starterNodes: [
      { id: 'n_ingress_1', type: 'ingress', gridX: 1, gridY: 3, locked: true, label: 'Global Ingress' },
      { id: 'n_lb_1', type: 'load_balancer', gridX: 3, gridY: 3, tier: 1, label: 'Nginx-LB' },
      { id: 'n_app_1', type: 'app_server', gridX: 5, gridY: 2, tier: 2, label: 'App-01' },
      { id: 'n_app_2', type: 'app_server', gridX: 5, gridY: 4, tier: 2, label: 'App-02' },
      { id: 'n_db_1', type: 'sql_db', gridX: 10, gridY: 3, tier: 1, label: 'Primary-SQL' },
    ],
    starterWires: [
      { fromId: 'n_ingress_1', toId: 'n_lb_1' },
      { fromId: 'n_lb_1', toId: 'n_app_1' },
      { fromId: 'n_lb_1', toId: 'n_app_2' },
    ],
    waves: [
      {
        durationSec: 12,
        rps: 24,
        announcement: 'Live Sports Scoreboard Refresh (24 RPS — 90% Reads)',
        mix: { GET: 90, POST: 10, STATIC: 0, ASYNC: 0, MALICIOUS: 0 },
      },
      {
        durationSec: 16,
        rps: 42,
        announcement: 'Championship Overtime Read Stampede! (42 RPS)',
        mix: { GET: 90, POST: 10, STATIC: 0, ASYNC: 0, MALICIOUS: 0 },
      },
    ],
    hints: [
      'Place a Redis In-Memory Cache between your App Servers (X=5) and Primary-SQL (X=10), e.g., at X=8, Y=3.',
      'Wire App-01 & App-02 → Redis Cache → Primary-SQL.',
      'Click Redis Cache and switch its strategy to Write-Through (92% Hit Rate) or upgrade its tier!',
    ],
  },
  {
    id: 4,
    slug: 'cdn-and-read-replicas',
    title: 'Level 4: Viral Media Storm',
    subtitle: 'Offload static video at the CDN Edge and split DB Reads/Writes',
    conceptBadge: 'CDN Edge + Read Replicas',
    scenarioBriefing:
      'Users are streaming high-res 4K clips (`STATIC` purple packets) while querying complex search filters (`GET` cyan) and posting comments (`POST` amber). Your origin servers are drowning in bandwidth.',
    architecturalLesson:
      '1) A CDN Edge Node intercepts `STATIC` media requests right at the network edge (3ms latency!) so they never hit your App Servers. 2) Read Replica DBs scale SQL `GET` reads horizontally while keeping `POST` writes dedicated to the Primary DB.',
    realWorldAnalogy:
      'CDN is like stocking popular snacks at neighborhood corner stores instead of shipping every candy bar from the central factory.',
    startingBudget: 920,
    targetSlaPercent: 97,
    targetLatencyMs: 36,
    unlockedNodes: ['cdn', 'load_balancer', 'app_server', 'redis_cache', 'sql_db', 'read_replica'],
    starterNodes: [
      { id: 'n_ingress_1', type: 'ingress', gridX: 1, gridY: 3, locked: true, label: 'Global DNS' },
      { id: 'n_cdn_1', type: 'cdn', gridX: 3, gridY: 3, tier: 1, label: 'CloudFront-CDN' },
      { id: 'n_lb_1', type: 'load_balancer', gridX: 5, gridY: 3, tier: 1, label: 'ALB-Origin' },
      { id: 'n_app_1', type: 'app_server', gridX: 7, gridY: 2, tier: 2, label: 'App-01' },
      { id: 'n_app_2', type: 'app_server', gridX: 7, gridY: 4, tier: 2, label: 'App-02' },
      { id: 'n_db_1', type: 'sql_db', gridX: 10, gridY: 2, tier: 2, label: 'Primary-Write-DB' },
    ],
    starterWires: [
      { fromId: 'n_ingress_1', toId: 'n_cdn_1' },
      { fromId: 'n_cdn_1', toId: 'n_lb_1' },
      { fromId: 'n_lb_1', toId: 'n_app_1' },
      { fromId: 'n_lb_1', toId: 'n_app_2' },
      { fromId: 'n_app_1', toId: 'n_db_1' },
      { fromId: 'n_app_2', toId: 'n_db_1' },
    ],
    waves: [
      {
        durationSec: 14,
        rps: 30,
        announcement: 'Creator Video Drop (30 RPS — Static Media + Reads)',
        mix: { GET: 45, POST: 15, STATIC: 40, ASYNC: 0, MALICIOUS: 0 },
      },
      {
        durationSec: 16,
        rps: 46,
        announcement: 'Global Livestream Peak! (46 RPS)',
        mix: { GET: 45, POST: 15, STATIC: 40, ASYNC: 0, MALICIOUS: 0 },
      },
    ],
    hints: [
      'Notice how CloudFront-CDN automatically absorbs all purple STATIC packets right at the edge!',
      'Place a Read Replica DB (or Redis Cache) at X=10, Y=4 and wire App-01 & App-02 to it so GET reads are split away from Primary-Write-DB.',
    ],
  },
  {
    id: 5,
    slug: 'message-queues-backpressure',
    title: 'Level 5: Black Friday Flash Sale',
    subtitle: 'Decouple spiky async checkout bursts with Kafka Message Queues',
    conceptBadge: 'Async Message Queues & Load Leveling',
    scenarioBriefing:
      'At midnight on Black Friday, thousands of shoppers hit "Buy Now" simultaneously, sending heavy `ASYNC` order-fulfillment & payment-processing jobs (green hexes). Synchronous processing will lock up your App Servers and Database!',
    architecturalLesson:
      'A Message Queue (Kafka / RabbitMQ) acts as a shock absorber. It ingests huge spikes of `ASYNC` and `POST` events into a durable queue and drains them at a steady, controlled rate that downstream Workers & Databases can safely digest.',
    realWorldAnalogy:
      'A coffee shop taking orders onto a ticket rail (Queue) so the barista can make espresso at a steady rhythm without collapsing when a tour bus arrives.',
    startingBudget: 1050,
    targetSlaPercent: 97,
    targetLatencyMs: 42,
    unlockedNodes: [
      'cdn',
      'load_balancer',
      'app_server',
      'message_queue',
      'redis_cache',
      'sql_db',
      'read_replica',
    ],
    starterNodes: [
      { id: 'n_ingress_1', type: 'ingress', gridX: 1, gridY: 3, locked: true, label: 'Checkout Ingress' },
      { id: 'n_lb_1', type: 'load_balancer', gridX: 3, gridY: 3, tier: 2, label: 'Edge-LB' },
      { id: 'n_app_1', type: 'app_server', gridX: 5, gridY: 2, tier: 2, label: 'Checkout-API-1' },
      { id: 'n_app_2', type: 'app_server', gridX: 5, gridY: 4, tier: 2, label: 'Checkout-API-2' },
      { id: 'n_db_1', type: 'sql_db', gridX: 10, gridY: 3, tier: 2, label: 'Orders-SQL' },
    ],
    starterWires: [
      { fromId: 'n_ingress_1', toId: 'n_lb_1' },
      { fromId: 'n_lb_1', toId: 'n_app_1' },
      { fromId: 'n_lb_1', toId: 'n_app_2' },
    ],
    waves: [
      {
        durationSec: 12,
        rps: 28,
        announcement: 'Doors Open! Heavy Async Checkout Jobs (28 RPS)',
        mix: { GET: 35, POST: 20, STATIC: 0, ASYNC: 45, MALICIOUS: 0 },
      },
      {
        durationSec: 16,
        rps: 52,
        announcement: 'Lightning Deal Drop! Massive Async Burst (52 RPS)',
        mix: { GET: 30, POST: 20, STATIC: 0, ASYNC: 50, MALICIOUS: 0 },
      },
    ],
    hints: [
      'Place a Kafka Message Queue at X=8, Y=2 and a Redis Cache at X=8, Y=4.',
      'Wire Checkout-API-1 & 2 to BOTH Kafka MQ (for ASYNC/POST jobs) and Redis Cache (for fast GET reads), then wire both into Orders-SQL!',
    ],
  },
  {
    id: 6,
    slug: 'database-sharding',
    title: 'Level 6: Write Bottleneck & DB Sharding',
    subtitle: 'Partition high-velocity writes across a Sharded Database Cluster',
    conceptBadge: 'Horizontal DB Sharding & Consistent Hashing',
    scenarioBriefing:
      'Your IoT telemetry platform ingests millions of real-time sensor writes (`POST` amber cubes). Even a Tier-3 Primary SQL Database cannot write to a single disk fast enough! Caching only helps reads—how do you scale writes?',
    architecturalLesson:
      'Database Sharding horizontally partitions your data across independent DB nodes by Shard Key (e.g., UserID Hash Modulo). Each DB Shard handles a fraction of the `POST` write and `GET` read load with zero lock contention.',
    realWorldAnalogy:
      'Splitting a massive coat-check room into 3 separate counters: A–H, I–P, and Q–Z so 3 attendants can hang coats simultaneously.',
    startingBudget: 1200,
    targetSlaPercent: 98,
    targetLatencyMs: 35,
    unlockedNodes: [
      'load_balancer',
      'app_server',
      'message_queue',
      'redis_cache',
      'sql_db',
      'db_shard',
    ],
    starterNodes: [
      { id: 'n_ingress_1', type: 'ingress', gridX: 1, gridY: 3, locked: true, label: 'Telemetry Ingress' },
      { id: 'n_lb_1', type: 'load_balancer', gridX: 3, gridY: 3, tier: 2, label: 'Ingress-LB' },
      { id: 'n_app_1', type: 'app_server', gridX: 5, gridY: 1, tier: 2, label: 'Ingest-App-1' },
      { id: 'n_app_2', type: 'app_server', gridX: 5, gridY: 3, tier: 2, label: 'Ingest-App-2' },
      { id: 'n_app_3', type: 'app_server', gridX: 5, gridY: 5, tier: 2, label: 'Ingest-App-3' },
      { id: 'n_shard_1', type: 'db_shard', gridX: 10, gridY: 2, tier: 1, label: 'Shard-Alpha' },
    ],
    starterWires: [
      { fromId: 'n_ingress_1', toId: 'n_lb_1' },
      { fromId: 'n_lb_1', toId: 'n_app_1' },
      { fromId: 'n_lb_1', toId: 'n_app_2' },
      { fromId: 'n_lb_1', toId: 'n_app_3' },
      { fromId: 'n_app_1', toId: 'n_shard_1' },
      { fromId: 'n_app_2', toId: 'n_shard_1' },
      { fromId: 'n_app_3', toId: 'n_shard_1' },
    ],
    waves: [
      {
        durationSec: 14,
        rps: 38,
        announcement: 'Global Fleet Write Stream (38 RPS — 65% Writes)',
        mix: { GET: 25, POST: 65, STATIC: 0, ASYNC: 10, MALICIOUS: 0 },
      },
      {
        durationSec: 16,
        rps: 58,
        announcement: 'Autonomous Vehicle Telemetry Surge! (58 RPS)',
        mix: { GET: 20, POST: 65, STATIC: 0, ASYNC: 15, MALICIOUS: 0 },
      },
    ],
    hints: [
      'Place at least 2 more Sharded DB Partitions (e.g., Shard-Beta at X=10, Y=4 and Shard-Gamma at X=10, Y=0 or Y=5).',
      'You can place an L7 Load Balancer or Kafka Queue at X=8 to cleanly fan out writes from all App Servers across all DB Shards!',
    ],
  },
  {
    id: 7,
    slug: 'planet-scale-ddos-defense',
    title: 'Level 7: Botnet Apocalypse (Planet Scale)',
    subtitle: 'Defend against a multi-vector DDoS attack while serving global traffic',
    conceptBadge: 'WAF Rate Limiting & Full-Stack Resilience',
    scenarioBriefing:
      'The final test! A rival syndicate has launched a massive botnet DDoS flood (`MALICIOUS` crimson virus drones) right in the middle of your global keynote. If malicious packets reach your App Servers or DBs, they will poison your queues and crash the cluster!',
    architecturalLesson:
      'Defense-in-Depth combines an API Gateway / WAF at the perimeter (scrubbing DDoS traffic with 403/429 rules), a CDN for static offload, Load Balancers for stateless compute, Redis for read caching, Kafka for async buffering, and Sharded DBs for write scale.',
    realWorldAnalogy:
      'Airport security (WAF) checks boarding passes at the entrance so pranksters never clog the runways or board the planes.',
    startingBudget: 1650,
    targetSlaPercent: 98,
    targetLatencyMs: 35,
    unlockedNodes: [
      'waf',
      'cdn',
      'load_balancer',
      'app_server',
      'message_queue',
      'redis_cache',
      'sql_db',
      'read_replica',
      'db_shard',
    ],
    starterNodes: [
      { id: 'n_ingress_1', type: 'ingress', gridX: 1, gridY: 2, locked: true, label: 'US-East Ingress' },
      { id: 'n_ingress_2', type: 'ingress', gridX: 1, gridY: 4, locked: true, label: 'EU-West Ingress' },
      { id: 'n_waf_1', type: 'waf', gridX: 3, gridY: 2, tier: 2, label: 'WAF-Shield-1' },
      { id: 'n_cdn_1', type: 'cdn', gridX: 5, gridY: 3, tier: 2, label: 'Global-CDN' },
      { id: 'n_app_1', type: 'app_server', gridX: 7, gridY: 2, tier: 2, label: 'Core-App-1' },
      { id: 'n_app_2', type: 'app_server', gridX: 7, gridY: 4, tier: 2, label: 'Core-App-2' },
      { id: 'n_redis_1', type: 'redis_cache', gridX: 9, gridY: 2, tier: 2, label: 'Redis-Cluster' },
      { id: 'n_shard_1', type: 'db_shard', gridX: 11, gridY: 2, tier: 2, label: 'Shard-01' },
      { id: 'n_shard_2', type: 'db_shard', gridX: 11, gridY: 4, tier: 2, label: 'Shard-02' },
    ],
    starterWires: [
      { fromId: 'n_ingress_1', toId: 'n_waf_1' },
      { fromId: 'n_waf_1', toId: 'n_cdn_1' },
      { fromId: 'n_cdn_1', toId: 'n_app_1' },
      { fromId: 'n_cdn_1', toId: 'n_app_2' },
      { fromId: 'n_app_1', toId: 'n_redis_1' },
      { fromId: 'n_redis_1', toId: 'n_shard_1' },
      { fromId: 'n_redis_1', toId: 'n_shard_2' },
    ],
    waves: [
      {
        durationSec: 15,
        rps: 45,
        announcement: 'Keynote Kickoff + Botnet Probe (45 RPS)',
        mix: { GET: 35, POST: 20, STATIC: 15, ASYNC: 10, MALICIOUS: 20 },
      },
      {
        durationSec: 18,
        rps: 72,
        announcement: 'SYN-Flood & L7 DDoS Mega-Wave! (72 RPS)',
        mix: { GET: 30, POST: 20, STATIC: 15, ASYNC: 10, MALICIOUS: 25 },
      },
    ],
    hints: [
      'EU-West Ingress (bottom-left) is currently unprotected! Place a second API Gateway & WAF at X=3, Y=4 and wire EU-West Ingress → WAF → Global-CDN.',
      'Add a Kafka Message Queue at X=9, Y=4 and wire Core-App-1 & 2 into both Redis-Cluster and Kafka MQ → Shard-01 & Shard-02!',
    ],
  },
  {
    id: 8,
    slug: 'chaos-sandbox-infinite',
    title: 'Bonus: Chaos Engineering Sandbox',
    subtitle: 'Infinite escalating traffic with full architectural freedom',
    conceptBadge: 'Chaos Engineering & Hyperscale',
    scenarioBriefing:
      'Welcome to Hyperscale Sandbox Mode. All 10 infrastructure components are unlocked with a generous $3,000 cloud budget. Design your dream distributed system and test how many requests per second it can survive!',
    architecturalLesson:
      'In hyperscale architecture, every tier must be redundant, stateless where possible, cached aggressively at the edge and in RAM, and partitioned across independent failure domains.',
    realWorldAnalogy:
      'Designing Netflix Chaos Monkey resilience: no matter what traffic spike hits, the packets keep flowing.',
    startingBudget: 3000,
    targetSlaPercent: 95,
    targetLatencyMs: 45,
    unlockedNodes: [
      'waf',
      'cdn',
      'load_balancer',
      'app_server',
      'message_queue',
      'redis_cache',
      'sql_db',
      'read_replica',
      'db_shard',
    ],
    starterNodes: [
      { id: 'n_ingress_1', type: 'ingress', gridX: 1, gridY: 1, locked: true, label: 'US-West DNS' },
      { id: 'n_ingress_2', type: 'ingress', gridX: 1, gridY: 3, locked: true, label: 'EU-Central DNS' },
      { id: 'n_ingress_3', type: 'ingress', gridX: 1, gridY: 5, locked: true, label: 'AP-East DNS' },
    ],
    starterWires: [],
    waves: [
      {
        durationSec: 15,
        rps: 40,
        announcement: 'Sandbox Stage 1: Global Warmup (40 RPS)',
        mix: { GET: 40, POST: 20, STATIC: 15, ASYNC: 15, MALICIOUS: 10 },
      },
      {
        durationSec: 20,
        rps: 75,
        announcement: 'Sandbox Stage 2: Hyperscale Surge (75 RPS)',
        mix: { GET: 35, POST: 25, STATIC: 15, ASYNC: 15, MALICIOUS: 10 },
      },
      {
        durationSec: 25,
        rps: 110,
        announcement: 'Sandbox Stage 3: Planet-Scale Stress Test (110 RPS)',
        mix: { GET: 35, POST: 25, STATIC: 15, ASYNC: 15, MALICIOUS: 10 },
      },
    ],
    hints: [
      'Build a multi-region edge layer with WAFs → CDNs → Load Balancers → App Server fleet → Redis + Kafka → Sharded DB cluster.',
    ],
    isInfiniteSandbox: true,
  },
];
