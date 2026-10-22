# Curriculum — 17 chapters, 7 parts (basic → advanced)

Each chapter's bullets are the lessons it must cover. Stay inside your chapter's scope; you may
briefly reference other chapters ("covered in Chapter 7") instead of re-teaching them.

## Part 1 — Foundations
**Ch 1 · How to Think About System Design** (Beginner, id `foundations`)
- What HLD is, HLD vs LLD, what interviewers evaluate (communication, trade-offs, not one right answer)
- The scaling journey: single server → separate DB → load balancer + many app servers → cache → CDN → read replicas → sharding → queues → multi-region (one diagram per stage or a sequence)
- Requirements: functional vs non-functional (scalability, availability, latency, consistency, durability, cost, security); how to turn vague asks into numbers
- The interview framework: a 45-minute plan (clarify 5m, estimate 5m, API + data model 5–10m, high-level design 10–15m, deep dives 10m, wrap-up/bottlenecks 5m); what to say at each step
- Common mistakes (jumping to solutions, buzzword soup, ignoring numbers, not driving the conversation)
- Design problems: Design a personal blog/website that grows to 1M readers (walk the scaling journey); Design a simple poll/voting app

**Ch 2 · Networking and How the Web Works** (Beginner, id `networking`)
- What happens when you type a URL (end-to-end steps)
- IP, ports, DNS resolution (recursive resolver, root/TLD/authoritative, TTL, caching, GeoDNS, DNS-based load balancing)
- TCP vs UDP (handshake, reliability, head-of-line blocking), HTTP/1.1 vs HTTP/2 vs HTTP/3 (QUIC), keep-alive, TLS handshake basics
- API styles: REST, GraphQL, gRPC (when each wins); HTTP methods, idempotency of methods, status codes
- Real-time communication: short polling, long polling, Server-Sent Events, WebSockets, WebRTC (when to use which, connection costs at scale)
- Forward proxy vs reverse proxy; what Nginx/Envoy do
- Design problems: Design a live sports score update service; Design a real-time "who's online / typing" indicator for a web app

**Ch 3 · Back-of-the-Envelope Estimation** (Beginner, id `estimation`)
- Powers of two and data sizes (KB→PB), sizes of common objects (a tweet, a photo, a minute of video)
- Latency numbers every engineer should know (L1, RAM, SSD, disk seek, same-DC RTT, cross-continent RTT)
- Converting DAU → average QPS → peak QPS (86,400 s/day ≈ 10^5), read/write ratios
- Storage and bandwidth estimation with worked examples; cache memory sizing (80/20 rule)
- Server count estimation, availability "nines" and downtime per year/month, Little's Law
- Design problems: Estimate and design storage for a photo-sharing app; Estimate and design a log/metrics ingestion pipeline (heavy on numbers)

## Part 2 — Core Building Blocks
**Ch 4 · Scaling and Load Balancing** (Beginner, id `scaling-load-balancing`)
- Vertical vs horizontal scaling; stateless vs stateful services; where session state goes
- Load balancers: L4 vs L7, what each can see and do; TLS termination
- Algorithms: round robin, weighted, least connections, least response time, IP hash, consistent hashing — when each fits
- Health checks, connection draining, sticky sessions (and why to avoid them)
- Making the LB itself highly available: active-passive pairs, floating VIP, DNS round robin, anycast, global server load balancing (GSLB)
- Autoscaling: metrics, cooldowns, warm pools, predictive scaling
- Design problems: Design the traffic layer for a global e-commerce site; Design an autoscaling web tier for a flash sale

**Ch 5 · Caching and CDNs** (Intermediate, id `caching`)
- Why cache, where caches live (browser, CDN, reverse proxy, in-process, distributed cache, DB buffer pool), hit ratio math
- Patterns: cache-aside, read-through, write-through, write-behind (write-back), write-around, refresh-ahead
- Eviction: LRU, LFU, FIFO, TTL; LRU implementation (hash map + doubly linked list)
- Invalidation and consistency; stampede/thundering herd (locking, request coalescing, probabilistic early expiry), penetration (negative caching, Bloom filters), avalanche (TTL jitter), hot keys (local cache, key replication)
- Redis vs Memcached; Redis data structures and what they're used for; Redis persistence/cluster basics
- CDNs: pull vs push, cache keys, TTL and Cache-Control, purging/versioned URLs, edge compute, origin shield
- Design problems: Design caching for a product page serving 100k RPS; Design an image CDN / image resizing service

**Ch 6 · Databases: SQL, NoSQL and Indexing** (Intermediate, id `databases`)
- Relational model, ACID explained concretely; transactions
- Isolation levels and anomalies (dirty read, non-repeatable read, phantom, lost update, write skew); MVCC; optimistic vs pessimistic locking
- Indexes: B-tree, hash, composite (leftmost prefix), covering; cost of indexes on writes; B-tree vs LSM-tree storage engines (memtable, SSTable, compaction, write/read amplification)
- NoSQL families: key-value, document, wide-column, graph, time-series, search — examples (DynamoDB, MongoDB, Cassandra, Neo4j, InfluxDB/TimescaleDB, Elasticsearch)
- BASE vs ACID; normalization vs denormalization; how to choose a database (decision table by access pattern)
- Design problems: Design the data layer for a movie ticket booking system (no double booking); Design storage for an IoT time-series platform

## Part 3 — Distributed Data
**Ch 7 · Replication, Partitioning and Consistent Hashing** (Intermediate, id `replication-sharding`)
- Why replicate; leader–follower; sync vs async vs semi-sync; replication lag and its anomalies (read-your-writes, monotonic reads, consistent prefix) and fixes
- Failover: detection, promotion, split brain risk; multi-leader replication and conflict resolution (LWW, version vectors, CRDTs at a high level)
- Leaderless (Dynamo-style): quorums N/R/W, R+W>N, sloppy quorum, hinted handoff, read repair, anti-entropy
- Partitioning: range vs hash vs directory-based; hot spots and the celebrity problem; secondary indexes (local vs global)
- Consistent hashing with virtual nodes (with code); rebalancing strategies; request routing (client, router tier, coordinator)
- Design problems: Design sharding for a multi-tenant SaaS database; Design a globally replicated user-profile store

**Ch 8 · Distributed Systems: CAP, Consistency and Consensus** (Advanced, id `distributed-theory`)
- Why distributed systems are hard: partial failures, unreliable networks, the fallacies of distributed computing
- CAP theorem stated correctly (partition → choose C or A), common misconceptions; PACELC
- Consistency models: linearizability, sequential, causal, read-your-writes, monotonic reads, eventual — with examples of systems
- Time and ordering: clock skew, NTP, Lamport timestamps, vector clocks, hybrid logical clocks, Spanner TrueTime
- Consensus: Raft (leader election, terms, log replication, commit), Paxos at a high level, ZooKeeper/etcd and what they're used for (leader election, config, locks)
- Distributed transactions: 2PC (and its blocking problem), sagas (choreography vs orchestration, compensations), transactional outbox; leases and fencing tokens
- Design problems: Design a distributed lock service; Design a cross-service money transfer (wallet → bank) with sagas

## Part 4 — Communication and Architecture
**Ch 9 · Message Queues, Streams and Event-Driven Design** (Intermediate, id `messaging`)
- Sync vs async communication; what a queue buys you (decoupling, buffering, load leveling)
- Point-to-point queues vs pub/sub; RabbitMQ vs Kafka vs SQS/SNS comparison
- Kafka internals: topics, partitions, offsets, consumer groups, ordering per partition, retention, replication and ISR, partition key choice
- Delivery semantics: at-most-once, at-least-once, exactly-once (idempotent producers, transactional writes, idempotent consumers, dedupe tables)
- Failure handling: retries, dead-letter queues, poison messages, backpressure, consumer lag
- Event-driven patterns: event notification, event-carried state transfer, event sourcing, CQRS, change data capture (Debezium), transactional outbox
- Design problems: Design an e-commerce order processing pipeline; Design a distributed delayed-job scheduler (run task at time T)

**Ch 10 · Storage, Search and Data Processing** (Intermediate, id `storage-search-data`)
- Block vs file vs object storage; object storage internals (metadata vs data, replication vs erasure coding, 11 nines durability), presigned URLs, multipart upload
- Full-text search: inverted index, tokenization/analyzers, ranking (TF-IDF/BM25), Elasticsearch shards and replicas, near-real-time refresh, keeping search in sync with the DB
- Batch processing: MapReduce model, Spark; stream processing: Flink/Kafka Streams, windows (tumbling, sliding, session), event time vs processing time, watermarks
- Lambda vs Kappa architecture
- OLTP vs OLAP, row vs columnar storage, data warehouse vs data lake vs lakehouse, ETL vs ELT
- Design problems: Design a log search system (like ELK); Design an ad-click aggregation system (real-time counts per ad per minute)

**Ch 11 · Microservices, API Design and Rate Limiting** (Intermediate, id `microservices-api`)
- Monolith vs modular monolith vs microservices (honest trade-offs); decomposition by business capability / bounded context; database-per-service
- Service discovery (client-side vs server-side, registries like Consul/Eureka, DNS), API gateway, backend-for-frontend, service mesh and sidecars (Envoy/Istio)
- API design best practices: resource naming, idempotency keys, pagination (offset vs cursor/keyset), versioning, error formats, batching, webhooks
- Rate limiting algorithms: token bucket, leaky bucket, fixed window, sliding window log, sliding window counter (with code); where to enforce; response headers and 429
- Design problems: Design a distributed rate limiter (full design with Redis, multiple data centers); Design the API gateway for a mobile + web product; (optional third) Break a food-delivery monolith into microservices

## Part 5 — Production Readiness
**Ch 12 · Reliability, Availability and Fault Tolerance** (Intermediate, id `reliability`)
- Availability math: components in series vs parallel, single points of failure, redundancy levels (N+1, N+2)
- Failover: active-passive vs active-active; multi-AZ vs multi-region
- Timeouts, retries with exponential backoff and jitter, retry budgets, retry storms; idempotency as a prerequisite
- Circuit breakers (closed/open/half-open), bulkheads, load shedding, graceful degradation, backpressure
- Disaster recovery: backups, RPO vs RTO, strategies (backup-restore, pilot light, warm standby, multi-site active-active); chaos engineering
- Design problems: Design a payment service with 99.99% availability; Design multi-region active-active for a social app

**Ch 13 · Observability and Security** (Intermediate, id `observability-security`)
- Three pillars: logs (structured, levels, correlation IDs), metrics (counter, gauge, histogram; percentiles p50/p95/p99; RED and USE methods), traces (spans, context propagation, sampling)
- SLI, SLO, SLA, error budgets; alerting on symptoms not causes; dashboards
- AuthN vs AuthZ; sessions vs tokens; JWT structure and pitfalls (revocation); OAuth 2.0 (authorization code + PKCE) and OpenID Connect; SSO
- Authorization models: RBAC, ABAC, ReBAC (Zanzibar-style)
- Encryption in transit (TLS, mTLS) and at rest (KMS, envelope encryption), secrets management, hashing passwords (bcrypt/argon2)
- Common attacks and defenses: SQL injection, XSS, CSRF, SSRF, DDoS (CDN, WAF, rate limits)
- Design problems: Design a metrics monitoring and alerting system (like Prometheus/Datadog); Design single sign-on for a suite of business apps

## Part 6 — Advanced Toolkit
**Ch 14 · Advanced Techniques and Data Structures** (Advanced, id `advanced-techniques`)
- Unique ID generation: auto-increment, UUID v4/v7, ticket servers, Twitter Snowflake (bit layout), ULID; sortable vs random IDs and index locality
- Probabilistic data structures: Bloom filters (false positive math), Count-Min Sketch, HyperLogLog — where each is used
- Merkle trees (anti-entropy, sync), gossip protocols and failure detection (heartbeats, phi accrual)
- Geospatial indexing: geohash, quadtrees, Google S2, Uber H3 — nearby search
- Real-time collaboration: operational transformation vs CRDTs
- Top-K / heavy hitters, and fan-out strategies preview
- Design problems: Design a proximity service (find nearby restaurants); Design a Top-K trending hashtags system; Design a distributed unique ID generator

## Part 7 — Case Studies (full walkthroughs, interview-style)
Each lesson in a case-study chapter is one complete design walkthrough following the 7-section
solution structure from SPEC.md (requirements → estimates → API → data model → HLD diagram →
deep dives → trade-offs), told as an interview answer.

**Ch 15 · Case Studies I: Core Services** (Advanced, id `case-studies-core`)
- URL Shortener (TinyURL/bit.ly): base62, key generation service vs hashing, 301 vs 302, caching, analytics
- Distributed Key-Value Store (Dynamo-style): partitioning, replication, quorum, vector clocks, gossip, hinted handoff, Merkle trees
- Web Crawler: URL frontier, politeness, dedupe (content hashing), DNS caching, robots.txt, distributed crawling
- Search Autocomplete / Typeahead: trie with top-k caching, data collection pipeline, sharding the trie
- Design problems (variations): Design Pastebin; Design a QR-code / link-in-bio service with click analytics; Design a news-search indexer for a crawler's output

**Ch 16 · Case Studies II: Social and Communication** (Advanced, id `case-studies-social`)
- Chat / messaging (WhatsApp/Slack): WebSocket gateways, message storage (Cassandra/HBase style), message IDs/ordering, delivery receipts, group chat fan-out, presence, push notifications, offline sync
- News Feed (Twitter/Instagram): fan-out on write vs read, hybrid for celebrities, feed cache, ranking, pagination
- Notification System: channels (push, SMS, email), templates, user preferences, queues per channel, retries, dedupe, rate limiting
- Video Conferencing (Zoom/Google Meet): signaling, WebRTC, STUN/TURN, mesh vs MCU vs SFU, simulcast, scaling SFUs, recording
- Design problems (variations): Design Slack-style channels with threads; Design an email service like Gmail; Design Google Calendar (events, recurrence, invites, reminders)

**Ch 17 · Case Studies III: Media, Location and Commerce** (Advanced, id `case-studies-media`)
- Video Streaming (YouTube/Netflix): upload pipeline, transcoding DAG, adaptive bitrate (HLS/DASH), CDN strategy, metadata, view counts
- Ride-Hailing (Uber/Ola): location updates, geospatial index, matching/dispatch, trip state machine, surge, ETA
- File Storage and Sync (Dropbox/Google Drive): chunking, dedupe, metadata DB, sync protocol, conflict handling, notifications, sharing
- Ticket Booking / Flash Sale (BookMyShow/Ticketmaster): seat holds with TTL, inventory consistency, virtual waiting room, payment, idempotency
- Design problems (variations): Design Spotify (music streaming); Design a food-delivery app (Swiggy/DoorDash); Design Instagram Stories (24h expiring media)
