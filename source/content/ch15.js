module.exports = {
  id: "case-studies-core",
  num: 15,
  part: 7,
  title: "Case Studies I: Core Services",
  tagline: "Four classic interview designs, worked end to end with real numbers and trade-offs.",
  level: "Advanced",
  lessons: [
    {
      id: "url-shortener",
      title: "Design a URL Shortener",
      minutes: 18,
      blocks: [
        { t: "p", html: "A URL shortener maps a long URL to a short code such as <code>sho.rt/aZ3k9Qx</code> and redirects anyone who opens it. It looks trivial, which is exactly why interviewers like it: the interesting parts hide in the numbers (how long must the code be?), in key generation (how do many servers mint unique codes without coordinating on every write?), and in a read path that must answer in a few milliseconds at hundreds of thousands of requests per second. The walkthrough follows the 45-minute framework from Chapter 1, told the way you would say it in the room." },
        { t: "h", text: "1. Requirements" },
        { t: "list", items: [
          "<b>Create:</b> given a long URL, return a short URL. Optional custom alias (<code>sho.rt/spring-sale</code>) and optional expiry date.",
          "<b>Redirect:</b> opening the short URL sends the browser to the long URL.",
          "<b>Analytics:</b> owners see visits per day, top referrers, countries and devices. A few minutes of delay is fine.",
          "<b>Manage:</b> owners can disable or delete a link; destinations are immutable by default.",
          "<b>Non-functional:</b> redirects are the product, so p99 under ~20 ms server-side and 99.99% availability; link creation may be slower and can briefly degrade. Links must last for years, codes must never collide, and codes should not be trivially enumerable.",
          "<b>Clarify early:</b> read:write ratio (drives caching), whether analytics is needed (drives 301 vs 302), whether the same long URL must always get the same code (adds a second index), and whether codes may be guessable (rules out raw sequential IDs)."
        ] },
        { t: "h", text: "2. Estimates" },
        { t: "p", html: "Assume <b>50M new links per day</b> and a <b>100:1</b> read:write ratio. Writes: 50M / 86,400 ≈ <b>580/s</b> average, ~1,800/s at a 3x peak. Reads: 5B/day ≈ <b>58k/s</b> average, ~175k/s at peak. Over 10 years: 50M × 365 × 10 ≈ <b>182.5B links</b>. At ~500 bytes per row (a ~200-byte URL plus code, owner, timestamps and index overhead) that is 182.5B × 500 B ≈ <b>91 TB</b>, ~275 TB with 3 replicas. Cache: if 300M distinct codes are opened per day and the hottest 20% carry 80% of traffic, caching 60M entries × ~250 B ≈ <b>15 GB</b>, a small Redis cluster. A redirect response is ~500 bytes of headers, so peak egress is only 175k × 500 B ≈ 88 MB/s. <b>Code length:</b> with base62 (<code>0-9a-zA-Z</code>), 62^6 ≈ 56.8B is less than 182.5B, while 62^7 ≈ <b>3.5 trillion</b> gives ~19x headroom, so codes are 7 characters. Saying this calculation out loud is one of the cheapest points in the interview." },
        { t: "h", text: "3. API" },
        { t: "code", lang: "http", code: `POST /api/v1/links
Authorization: Bearer <token>
Idempotency-Key: 5f0c2a9e-...        # a retried create must not mint two codes
{"long_url": "https://shop.example.com/sale?id=123",
 "alias": "spring-sale", "expires_at": "2027-06-01T00:00:00Z"}
-> 201 {"code": "aZ3k9Qx", "short_url": "https://sho.rt/aZ3k9Qx"}
-> 409 if the alias is taken, 429 if the caller is over its create limit

GET /{code}                          # no version prefix: the short URL is the contract
-> 302 Found, Location: https://shop.example.com/sale?id=123
-> 404 unknown code, 410 Gone if expired or disabled

GET /api/v1/links/{code}/stats?from=2026-10-01&to=2026-10-21&group_by=day
-> 200 {"total": 18234, "series": [...], "top_referrers": [...]}

DELETE /api/v1/links/{code}
-> 204 No Content` },
        { t: "h", text: "4. Data model" },
        { t: "table", head: ["Field", "Type", "Notes"], rows: [
          ["<code>code</code>", "string, 7 to 30 chars", "Partition key. 7 chars when generated, longer for custom aliases."],
          ["<code>long_url</code>", "string, up to 2 KB", "Validated and checked against a malware blocklist at creation."],
          ["<code>owner_id</code>", "int64", "Who may see stats, disable or delete."],
          ["<code>created_at</code>, <code>expires_at</code>", "timestamp", "<code>expires_at</code> null means never."],
          ["<code>status</code>", "enum", "active, disabled, deleted. Checked on every redirect."]
        ] },
        { t: "p", html: "The hot access pattern is a single-key lookup by <code>code</code>, with no joins, on a table that grows to ~90 TB. That is a textbook fit for a horizontally partitioned key-value or wide-column store: <b>DynamoDB or Cassandra with <code>code</code> as the partition key</b>, which spreads load evenly because generated codes are random. Sharded PostgreSQL (hash of code) is also a fine answer if you say how you shard. The dashboard's “my links” view is a second table, <code>links_by_owner(owner_id, created_at, code)</code>, written alongside the main row (the denormalization pattern from Chapter 6). Analytics never touches this store." },
        { t: "h", text: "5. High-level design" },
        { t: "diagram", caption: "Redirects and link creation are separate services; the redirect path only reads, and visit events leave it asynchronously.", code: `flowchart LR
  U(("Browser")) --> LB["Load balancer"]
  LB --> RS["Redirect service<br/>in-process LRU"]
  LB --> API["Link API service"]
  RS -->|"1. get code"| RC[("Redis cache")]
  RS -->|"2. on miss"| DB[("Links table<br/>DynamoDB or Cassandra")]
  API -->|"claim key batch"| KGS["Key generation service"]
  API -->|"put if absent"| DB
  RS -.->|"visit event"| K[["Kafka link-visits"]]
  K --> SP["Flink aggregator"]
  SP --> OLAP[("ClickHouse rollups")]
  API -->|"stats query"| OLAP` },
        { t: "p", html: "<b>Read path:</b> the redirect service checks a small in-process LRU, then Redis, then the links table; it checks status and expiry, returns a 302, and hands a visit event to the Kafka producer's local buffer without waiting on the critical path. With a ~90% Redis hit rate the database sees ~17k reads/s at peak, which a modest DynamoDB table or Cassandra cluster handles easily. <b>Write path:</b> the API service validates the URL, pops a pre-generated key from its local batch, and writes the row with a conditional put so nothing can ever overwrite an existing link. Redirect and API are separate deployments, so a surge in link creation or a bad dashboard deploy cannot slow redirects." },
        { t: "h", text: "6. Deep dives" },
        { t: "p", html: "<b>A. Generating unique codes.</b> The three families of answers are compared below, and the interviewer wants to hear why you reject two of them. We use a <b>key generation service (KGS)</b>. A background job generates random 7-character strings into an <code>unused_keys</code> table, discarding the rare duplicate there, off the request path. It keeps about a year of supply ready: 18B keys × 7 B ≈ 128 GB. When an API server asks for a batch, the KGS moves 1,000 keys from unused to used in one transaction before returning them, so no two servers can ever receive the same key. Every API server holds a buffer, so a KGS outage of a few minutes is invisible. The conditional put on the links table stays as a cheap safety net and is also how custom aliases are claimed: <code>put if not exists</code>, else 409. If a generated key ever equals an existing custom alias, its put fails and the server simply takes the next key." },
        { t: "compare", items: [
          { title: "Hash and truncate", pros: ["Stateless: any server computes the code", "Same URL gives the same code, so dedupe is free"], cons: ["Truncated MD5 or SHA-256 collides, so each create needs a check or conditional write plus a retry loop", "Collisions grow as the table fills: by year 10 about 5% of inserts collide (182.5B used of 3.5T)", "Two users shortening the same URL share one code and one set of stats unless you salt the hash"], use: "Small scale, or when identical URLs must map to one code." },
          { title: "Counter, base62-encoded", pros: ["Unique by construction, no collision checks", "Servers can lease ranges of a million IDs (Chapter 14 ticket servers)"], cons: ["One global counter is a bottleneck and a single point of failure", "Sequential codes are enumerable unless scrambled with a keyed permutation first"], use: "When you lease ID ranges per server and scramble them before encoding." },
          { title: "Pre-generated key service (KGS)", pros: ["Random-looking unique keys with zero uniqueness work on the write path", "Batches of ~1,000 keys mean the KGS sees only a few requests per second"], cons: ["Another service to store, replicate and operate", "Keys held by a crashed server are lost, which is harmless in a 3.5T space"], use: "The default at high write rates: uniqueness is solved offline, not per request." }
        ] },
        { t: "diagram", caption: "The key service is called once per 1,000 creations; each request costs a local pop and one conditional write.", code: `sequenceDiagram
  participant C as Client
  participant A as Link API
  participant K as Key service
  participant D as Links table
  C->>A: POST /api/v1/links
  alt local batch is empty
    A->>K: claim next 1000 keys
    K->>K: move batch from unused to used
    K-->>A: 1000 unused keys
  end
  A->>A: pop key aZ3k9Qx
  A->>D: put aZ3k9Qx if not exists
  D-->>A: ok
  A-->>C: 201 Created with short_url` },
        { t: "code", lang: "python", code: `import secrets

ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"

def to_base62(n: int, width: int = 7) -> str:
    """Encode a non-negative integer, e.g. a leased and scrambled counter value."""
    out = []
    while n:
        n, r = divmod(n, 62)
        out.append(ALPHABET[r])
    return "".join(reversed(out)).rjust(width, "0")

def random_key(length: int = 7) -> str:
    """What the KGS background job generates: about 41.7 bits of randomness."""
    return "".join(secrets.choice(ALPHABET) for _ in range(length))

def create_link(long_url, owner_id, allocator, table):
    while True:
        code = allocator.next_key()        # local pop; refills from the KGS when empty
        if table.put_if_absent(code, long_url, owner_id):
            return code                    # succeeds on the first try in practice` },
        { t: "p", html: "<b>B. 301 or 302?</b> This is the question interviewers ask most about this design, and the answer follows from the requirements. Because we sell analytics and let owners disable links, we return <b>302</b> (307 is equivalent for GET). If a customer later wants to cut redirect traffic and does not need analytics, a 301 with an explicit <code>Cache-Control: max-age</code> bounds how long browsers keep it." },
        { t: "table", head: ["Aspect", "301 Moved Permanently", "302 Found"], rows: [
          ["Browser caching", "Cached; without explicit headers browsers may keep it indefinitely", "Not cached by default; every visit reaches the service"],
          ["Visit analytics", "Repeat visits from the same browser are invisible", "Every visit is counted"],
          ["Disabling a link", "Browsers holding the cached redirect keep going to the old target", "Takes effect on the next visit"],
          ["Load on the service", "Lower", "Higher: one request per visit"],
          ["Search engines", "Strong signal that the target is the canonical URL", "Treated as temporary, a weaker signal"]
        ] },
        { t: "p", html: "<b>C. Caching and hot links.</b> The mapping is effectively immutable, so cache-aside with a long TTL (days) is safe; on disable or delete, the API deletes the Redis key. Two failure modes from Chapter 5 matter. A viral link can push 50k requests/s at a single Redis shard, and adding shards does not help a single key; give every redirect server an in-process LRU (say 100k entries, 60-second TTL) so hot codes are served from local memory, accepting that a disabled link may keep working for up to a minute. And scanners probing random codes miss in both cache and database every time: cache negative results briefly, or keep a Bloom filter of existing codes in front of the table." },
        { t: "p", html: "<b>D. Analytics without slowing redirects.</b> Writing a row or incrementing a counter per visit would turn a read-heavy system into one doing 175k writes/s on hot partitions. Instead the redirect server emits an event (code, timestamp, referrer, user agent, country derived from the IP) to Kafka. A Flink job drops bots and link-preview fetchers, aggregates per code per minute and writes rollups to ClickHouse; raw events land in S3 for reprocessing. Unique visitors per day use a HyperLogLog sketch (Chapter 14) rather than storing every visitor. At ~200 bytes per event, 5B events/day is ~1 TB/day raw, which is why raw data goes to object storage and the dashboard reads only rollups." },
        { t: "h", text: "7. Trade-offs and bottlenecks" },
        { t: "table", head: ["Decision", "Chosen", "Alternative", "Why"], rows: [
          ["Code generation", "Pre-generated keys (KGS)", "Hash + collision check", "No read-before-write or retries on the write path"],
          ["Redirect status", "302", "301", "Analytics and instant disable outweigh the extra traffic"],
          ["Link store", "DynamoDB or Cassandra keyed by code", "Sharded PostgreSQL", "Single-key access at 90+ TB; random keys spread evenly"],
          ["Analytics", "Async events, rollups in ClickHouse", "Counter column in the links table", "Keeps the redirect path read-only and fast"],
          ["Identical long URLs", "New code each time", "Index on hash of long URL", "A second index buys little storage and mixes stats across users"],
          ["Multi-region", "Links table replicated to every region", "Single-region database", "Redirects stay local; a brand-new link may take ~1 s to appear elsewhere"]
        ] },
        { t: "callout", kind: "interview", title: "What strong candidates say", html: "“Seven base62 characters give 3.5 trillion codes, about 19 times what ten years need. I'll pre-generate keys so creates never check for collisions. Redirects are 302 because the product sells analytics, and the redirect path only reads: local LRU, Redis, then a key-value store, with visit events going to Kafka asynchronously.” That is four decisions, each tied to a number or a requirement, in under thirty seconds. Then name the bottlenecks yourself: hot links, abuse (rate-limit creates, scan URLs for malware), and the KGS as a dependency." }
      ]
    },
    {
      id: "kv-store",
      title: "Design a Distributed Key-Value Store",
      minutes: 20,
      blocks: [
        { t: "p", html: "A Dynamo-style key-value store is where Chapter 7 (replication, partitioning, quorums), Chapter 8 (consistency, clocks) and Chapter 14 (gossip, Merkle trees) come together. Nobody expects you to invent anything; the interviewer wants to see you assemble known techniques, each chosen for a specific failure or scaling problem, and say what each costs. We design for the requirement behind Amazon's 2007 Dynamo paper: keep accepting writes while nodes, racks or links fail. Cassandra and Riak are its best-known descendants. The managed DynamoDB service is a different design despite the name: each partition is replicated by a Multi-Paxos group with a leader." },
        { t: "h", text: "1. Requirements" },
        { t: "list", items: [
          "<b>Operations:</b> <code>put(key, value)</code>, <code>get(key)</code>, <code>delete(key)</code>. Keys up to 256 bytes, values up to 1 MB, typically ~10 KB.",
          "<b>Always writable:</b> a put succeeds even with some replicas or a whole rack down. Think shopping cart: rejecting “add to cart” loses money.",
          "<b>Tunable consistency:</b> callers trade latency and availability against freshness per request.",
          "<b>Incremental scale:</b> grow from tens to hundreds of nodes by adding machines, with no downtime and no manual resharding.",
          "<b>Latency and durability:</b> p99 under 10 ms inside a data center; an acknowledged write survives node loss; no master and no single point of failure.",
          "<b>Not required:</b> multi-key transactions, secondary indexes, range scans."
        ] },
        { t: "h", text: "2. Estimates" },
        { t: "p", html: "Assume <b>1B keys × ~10 KB</b> = 10 TB of raw data, <b>30 TB</b> with 3 replicas. Keeping each node at ~1 TB on a 2 TB SSD (headroom for compaction and rebalancing) needs ~30 nodes for storage alone. Peak traffic is <b>500k reads/s and 100k writes/s</b>. With N = 3, every write goes to all 3 replicas (the coordinator just waits for W of them): 300k replica writes/s. With R = 2, each read touches 2 replicas: 1M replica reads/s. If one node sustains ~20k replica operations/s on an LSM engine, 1.3M / 20k ≈ <b>65 nodes</b>. Throughput, not storage, sizes this cluster; plan ~80 nodes so it survives losing a rack at peak." },
        { t: "h", text: "3. API" },
        { t: "code", lang: "http", code: `PUT /v1/kv/{key}?w=2
X-Context: <opaque version token from the previous get>
Content-Type: application/octet-stream
<value bytes>
-> 204 No Content

GET /v1/kv/{key}?r=2
-> 200 X-Context: <token>, body: value
-> 300 Multiple Choices, body: sibling values plus one merged token

DELETE /v1/kv/{key}?w=2
X-Context: <token>
-> 204   (writes a tombstone; the data is purged later)

# Real clients use a binary protocol over TCP or gRPC; the semantics are identical.` },
        { t: "h", text: "4. Data model: what every node stores" },
        { t: "table", head: ["Structure", "Contents", "Purpose"], rows: [
          ["Record", "key, value, vector clock, tombstone flag, write timestamp", "One version, or several siblings if writes were concurrent"],
          ["Commit log", "Append-only file, fsynced in small batches", "Durability before the memtable is flushed"],
          ["Memtable and SSTables", "LSM tree (Chapter 6), e.g. RocksDB", "Cheap sequential writes; compaction in the background"],
          ["Bloom filter per SSTable", "Bit array over the file's keys", "Skip files that cannot contain the key on reads"],
          ["Merkle tree per key range", "Hash tree over the range's records", "Cheap replica comparison for anti-entropy"],
          ["Ring state", "Token to node map, node status, versions", "Spread by gossip, cached by nodes and clients"]
        ] },
        { t: "h", text: "5. High-level design" },
        { t: "diagram", caption: "Solid edges are the request path; dotted edges are the background mechanisms that handle failures and membership.", code: `flowchart TD
  App["Application with<br/>token-aware client"] -->|"put cart:42"| CO["Node A: coordinator<br/>and replica 1"]
  CO -->|"replicate"| N2["Node B: replica 2"]
  CO -->|"replicate"| N3["Node C: replica 3"]
  CO -.->|"C unreachable: write with hint"| ND["Node D: fallback<br/>holds hint for C"]
  ND -.->|"replay when C returns"| N3
  N2 -.->|"Merkle tree anti-entropy"| N3
  GS["Gossip: membership,<br/>ring and failure detection"] -.-> CO
  GS -.-> ND` },
        { t: "p", html: "We are building the database itself, so every node runs the same code, holds the structures in the table above and can coordinate any request. There is no master or metadata server, which removes single points of failure but means membership must itself be replicated, by gossip. The client library caches the ring (learned from any node) and sends a request to the first node of the key's preference list. <b>Write:</b> the coordinator writes locally, forwards to the other N−1 replicas in parallel, and replies once W replicas (counting itself) have acknowledged. <b>Read:</b> it asks R replicas; if versions differ, it returns the newest version (or the concurrent siblings) and repairs stale replicas in the background. Hinted handoff, anti-entropy and gossip run off the request path and keep replicas converging." },
        { t: "h", text: "6. Deep dives" },
        { t: "p", html: "<b>A. Partitioning.</b> Keys are hashed (e.g. Murmur3) onto a ring, and each physical node owns many virtual nodes (tokens) scattered around it (Chapter 7). Vnodes smooth out load, let a new node take small slices from many existing nodes instead of one big slice from a neighbor, and let bigger machines own more tokens. A key's <b>preference list</b> is the first N <em>distinct physical</em> nodes clockwise from its hash, skipping extra vnodes of nodes already chosen and, in production, spreading replicas across racks or availability zones. Token-aware clients send each request straight to a replica, saving the hop through a random node that would forward it." },
        { t: "p", html: "<b>B. Quorums: the consistency knob.</b> If R + W > N, every read set intersects every write set, so a read reaches at least one replica holding the latest acknowledged write. That is still <b>not linearizability</b> (Chapter 8): a write that failed after reaching one replica may surface later, concurrent writes still need resolution, and sloppy quorums (below) break the overlap during failures. If the interviewer demands strict consistency, the honest answer is consensus per partition (Raft, as in CockroachDB or TiKV), which gives up availability on the minority side of a partition." },
        { t: "table", head: ["N, R, W", "R + W > N?", "Keeps working with one replica down", "Good for"], rows: [
          ["3, 2, 2", "Yes", "Reads and writes", "The balanced default"],
          ["3, 1, 3", "Yes", "Reads only", "Read-heavy data that rarely changes"],
          ["3, 3, 1", "Yes", "Writes only", "Write-heavy data where reads can wait or fail"],
          ["3, 1, 1", "No", "Reads and writes", "Lowest latency where staleness is fine: sessions, caches"]
        ] },
        { t: "p", html: "<b>C. Concurrent writes and vector clocks.</b> Any replica can accept a write during a partition, so two clients can update one key without seeing each other. Last-write-wins by timestamp (Cassandra's choice) silently drops one of them and trusts clocks. Dynamo instead attaches a <b>vector clock</b>, a list of (node, counter) pairs, to each version. Version X descends from Y if every counter in X is at least the matching counter in Y; if neither descends from the other, they are concurrent and both are kept as siblings for the application to merge. The opaque <code>X-Context</code> token in the API is this clock: every get returns it and the next put sends it back, which tells the store which version the writer had seen. A cart merges by set union, which has a known flaw: an item removed on one side comes back after the merge. CRDTs such as observed-remove sets (Chapter 7) fix that. Clocks also grow with the number of coordinators, so Dynamo truncated the oldest entries past a threshold of about 10." },
        { t: "table", head: ["Step", "What happens", "Version and clock"], rows: [
          ["1", "Client writes cart = [book] through node Sx", "D1 [Sx:1]"],
          ["2", "Client adds a pen through Sx", "D2 [Sx:2], replaces D1"],
          ["3", "Network splits. Client 1 adds a mug through Sy", "D3 [Sx:2, Sy:1]"],
          ["4", "Client 2 adds a lamp through Sz", "D4 [Sx:2, Sz:1]"],
          ["5", "A read finds D3 and D4; neither clock dominates", "Both returned as siblings"],
          ["6", "Client merges to [book, pen, mug, lamp] and writes through Sx", "D5 [Sx:3, Sy:1, Sz:1], replaces both"]
        ] },
        { t: "p", html: "<b>D. Failure handling.</b> Each mechanism targets a different kind of failure; naming the pairing is what interviewers listen for." },
        { t: "table", head: ["Failure", "Mechanism", "How it works", "Cost"], rows: [
          ["Replica down for seconds to hours", "Sloppy quorum + hinted handoff", "The write goes to the next healthy node with a hint naming the intended owner, and is replayed when the owner returns", "Overlap of R + W > N is lost while hints are outstanding"],
          ["Stale replica noticed on a read", "Read repair", "The coordinator writes the newest version back to replicas that returned old ones", "Fixes only keys that are read"],
          ["Long divergence or a rebuilt node", "Anti-entropy with Merkle trees", "Replicas compare root hashes per range and descend only into mismatched branches", "CPU and I/O to build trees; must finish within the tombstone grace period"],
          ["Crashes and membership changes", "Gossip + phi accrual detection", "Each second a node swaps state with a random peer; suspicion grows with missed heartbeats", "Convergence takes O(log n) rounds; seed nodes prevent split views"]
        ] },
        { t: "diagram", caption: "With W = 2 the write succeeds even though C is down; D holds it as a hint and hands it over when C returns.", code: `sequenceDiagram
  participant Cl as Client
  participant A as Node A coordinator
  participant B as Node B
  participant Cd as Node C down
  participant D as Node D fallback
  Cl->>A: put cart:42 with context
  A->>A: write locally, bump A in vector clock
  A->>B: replicate
  A->>Cd: replicate, no response
  A->>D: replicate with hint for C
  B-->>A: ack
  A-->>Cl: ok after 2 acks, A and B
  D-->>A: ack
  Note over D,Cd: later, gossip reports C is alive
  D->>Cd: replay hinted write
  Cd-->>D: ack, D deletes the hint` },
        { t: "callout", kind: "warn", title: "Deletes are writes, and they can come back", html: "A delete writes a tombstone that must reach every replica before it is purged. Cassandra keeps tombstones for <code>gc_grace_seconds</code>, 10 days by default. If a replica is down longer than that, the others purge the tombstone, the old replica returns still holding the value, and anti-entropy dutifully copies the “deleted” data back everywhere. The fix is operational: run repair more often than the grace period, and rebuild rather than restart a node that has been gone longer than it." },
        { t: "h", text: "7. Trade-offs and bottlenecks" },
        { t: "table", head: ["Choice", "What you gain", "What you pay"], rows: [
          ["Leaderless, any replica accepts writes", "Writes survive node and rack failures", "Conflicts, siblings and merge logic in the application"],
          ["Vector clocks", "Concurrent updates are never silently lost", "Bigger metadata, client complexity, truncation edge cases"],
          ["Last-write-wins instead", "Simple, no siblings", "Drops concurrent writes; depends on clock sync"],
          ["Sloppy quorum", "Writes keep succeeding during failures", "A weaker read guarantee until hints are replayed"],
          ["Consistent hashing with vnodes", "Incremental scaling and even load", "Rebalancing streams data and competes with live traffic"],
          ["Gossip membership", "No central coordinator to fail", "Membership views converge slowly in very large clusters"],
          ["Hot keys and big values", "Nothing: they are the bottleneck", "One key lives on 3 nodes however big the cluster: cache it in front, split it, or store large blobs in object storage and keep a pointer"]
        ] },
        { t: "callout", kind: "interview", title: "Map every mechanism to the problem it solves", html: "Strong candidates organize the answer as problem to technique: partitioning to consistent hashing with vnodes; replication to a rack-aware preference list of N nodes; the consistency knob to R and W; concurrent writes to vector clocks (or LWW, with its cost stated); temporary failures to sloppy quorum and hinted handoff; permanent divergence to Merkle-tree anti-entropy; membership to gossip. Then they say, unprompted, what R = W = 2 still does not guarantee." }
      ]
    },
    {
      id: "web-crawler",
      title: "Design a Web Crawler",
      minutes: 18,
      blocks: [
        { t: "p", html: "A web crawler (spider) starts from seed URLs, downloads pages, extracts their links and repeats. Search engines, web archives such as the Internet Archive and Common Crawl, SEO tools and training-data pipelines all run one. The core algorithm is a breadth-first traversal you could write in twenty lines. The design problem is running it over billions of pages without overloading any single website, without getting stuck in infinite link mazes, and without downloading the same content again and again." },
        { t: "h", text: "1. Requirements" },
        { t: "list", items: [
          "<b>Crawl:</b> from seed URLs, fetch HTML over HTTP and HTTPS, extract links, and store page content for a downstream indexer (this chapter's news-indexer design problem consumes it).",
          "<b>Recrawl:</b> revisit pages based on how often they change; important pages (high PageRank, news front pages, sitemaps) much more often.",
          "<b>Politeness:</b> obey robots.txt; by default at most one connection per host and a delay between requests to it.",
          "<b>Scale:</b> 3B pages per month, with no duplicate storage of identical content.",
          "<b>Robustness and extensibility:</b> survive spider traps, malformed HTML, slow or hostile servers; make it easy to add PDF parsing or image fetching later.",
          "<b>Out of scope unless asked:</b> JavaScript rendering (a headless browser costs an order of magnitude or more CPU and memory per page), ranking, and the search index itself."
        ] },
        { t: "h", text: "2. Estimates" },
        { t: "p", html: "A 30-day month is ~2.6M seconds, so 3B pages / 2.6M s ≈ <b>1,150 pages/s</b> average, ~2,300/s at a 2x peak. At ~100 KB of uncompressed HTML per page, download bandwidth is 1,150 × 100 KB ≈ 115 MB/s, roughly <b>1 Gbps</b>. Storage is 3B × 100 KB = 300 TB per month raw, ~75 TB compressed at 4:1; keeping 12 monthly snapshots is ~<b>0.9 PB</b> of object storage. With ~50 links per page, the link extractor emits ~58k URLs/s that must be checked against the set of ~<b>10B known URLs</b>. If an average fetch takes ~1 s including slow servers, Little's Law (Chapter 3) says 2,300 pages/s × 1 s = <b>2,300 requests in flight</b>. Async I/O handles that easily; CPU for decompression, parsing and fingerprinting is the real limit. At ~100 pages/s per node end to end, peak needs ~23 nodes, so plan ~30." },
        { t: "h", text: "3. API" },
        { t: "code", lang: "http", code: `# Control plane only: a crawler has no end-user API.
POST /v1/seeds
{"urls": ["https://www.example-news.com/"], "priority": "high"}
-> 202 Accepted

PUT /v1/hosts/{host}/policy          # manual override, e.g. after an owner complains
{"max_rps": 0.5, "blocked": false}
-> 200 OK

GET /v1/urls/status?url=https%3A%2F%2Fwww.example-news.com%2Fworld
-> 200 {"state": "crawled", "last_fetched": "2026-10-21T09:14:03Z",
        "next_fetch_at": "2026-10-21T10:14:03Z", "http_status": 200}

# Output contract: Kafka topic page-crawled, keyed by host
# {"url": "...", "fetched_at": "...", "status": 200,
#  "content_fp": "9f3c...", "warc_ref": "s3://crawl/2026-10/f-000123.warc.gz@88213"}` },
        { t: "h", text: "4. Data model" },
        { t: "table", head: ["Record", "Key", "Fields", "Store"], rows: [
          ["URL state", "64-bit URL fingerprint", "url, host, last_fetched, next_fetch_at, http_status, content fingerprint, ETag and Last-Modified, change rate, priority", "Cassandra or Bigtable, partitioned by host"],
          ["Host state", "hostname", "robots.txt rules and fetch time, crawl delay, resolved IPs with TTL, next allowed fetch time, error rate", "In memory on the owning node, checkpointed to the same store"],
          ["Page content", "crawl id + file + offset", "Compressed WARC records in ~1 GB files", "Object storage such as S3"],
          ["Content fingerprints", "64-bit text hash and SimHash", "First URL seen with this content", "RocksDB on each node"]
        ] },
        { t: "p", html: "URL state is ~10B rows, rewritten on every fetch and read by key, which suits a wide-column store. Google's Bigtable paper describes exactly this “webtable”, with rows keyed by reversed hostname (<code>com.cnn.www/index.html</code>) so that one site's pages sort together and per-site scans are cheap. Page bodies go into WARC files, the archive format used by the Internet Archive and Common Crawl: large, append-only, compressed files are the cheapest thing to put in object storage, and each event carries a file-and-offset pointer to its record." },
        { t: "h", text: "5. High-level design" },
        { t: "diagram", caption: "The crawl is a loop: new URLs flow back into the frontier, and only URLs and content not seen before survive the dedupe checks.", code: `flowchart LR
  Seed["Seed URLs"] --> F["URL frontier<br/>priority and per-host queues"]
  F --> FE["Fetcher workers<br/>async HTTP"]
  FE -->|"resolve host"| DNS["Local DNS cache"]
  FE -->|"allowed?"| RB["robots.txt cache"]
  FE -->|"raw response"| S3[("Object store<br/>WARC files")]
  FE --> PA["Parser and<br/>content fingerprint"]
  PA -->|"seen content?"| CF[("Content fingerprints")]
  PA -->|"outlinks"| UF["URL normalizer<br/>and filters"]
  UF -->|"seen URL?"| US[("URL-seen set")]
  UF -->|"new URLs routed by host"| F
  PA -.->|"page-crawled event"| K[["Kafka to indexer"]]` },
        { t: "steps", items: [
          { title: "Pick", html: "A fetcher asks the frontier for the next URL whose host may be contacted now." },
          { title: "Resolve and check", html: "Look up the host's IP in the local DNS cache and its rules in the robots.txt cache; disallowed URLs are dropped." },
          { title: "Fetch", html: "Issue the request with connect and total timeouts, a 10 MB size cap and a conditional header (<code>If-None-Match</code> or <code>If-Modified-Since</code>) so unchanged pages return a cheap 304." },
          { title: "Store and publish", html: "Append the response to a WARC file and publish a <code>page-crawled</code> event for the indexer." },
          { title: "Parse and dedupe", html: "Extract text and links; if the text fingerprint was seen before, record the duplicate and stop processing this page." },
          { title: "Extract and route", html: "Normalize each link, apply filters (scheme, length, blocklists), test it against the URL-seen set, and send new URLs to the node that owns their host." },
          { title: "Reschedule", html: "Update the URL's state and compute its next fetch time from its observed change rate." }
        ] },
        { t: "h", text: "6. Deep dives" },
        { t: "p", html: "<b>A. The URL frontier.</b> The frontier is not a FIFO queue. It answers two questions at once: which URL is most valuable to fetch next (priority), and which hosts may be contacted right now (politeness). The Mercator crawler's design, still the standard answer, gives each question its own layer. <b>Front queues</b> are one per priority level; a prioritizer assigns each URL a level from signals like PageRank, past change frequency and whether it is a news page or sitemap. <b>Back queues</b> each hold URLs of exactly one host. When a back queue empties, a router refills it from the front queues, biased toward high priority. A min-heap keyed by each host's next allowed fetch time hands hosts to fetcher threads; after a fetch the host goes back into the heap at now plus a delay. A common rule is about 10 times the last response time, and never less than the non-standard <code>Crawl-delay</code> directive where a site sets one and the crawler honors it. Most of the frontier lives on disk with only the queue heads in memory: 10B queued URLs × ~100 B is ~1 TB." },
        { t: "diagram", caption: "Front queues decide what is important; back queues and the heap decide when each host may be contacted again.", code: `flowchart LR
  In["New URLs"] --> P["Prioritizer<br/>PageRank and change rate"]
  P --> F1["Front queue: high"]
  P --> F2["Front queue: medium"]
  P --> F3["Front queue: low"]
  F1 --> R["Back queue router<br/>biased to high priority"]
  F2 --> R
  F3 --> R
  R --> B1["Back queue: host a.com"]
  R --> B2["Back queue: host b.org"]
  R --> B3["Back queue: host c.net"]
  B1 --> H["Min-heap of hosts by<br/>next allowed fetch time"]
  B2 --> H
  B3 --> H
  H --> W["Fetcher thread"]` },
        { t: "p", html: "<b>B. Dedupe at three levels.</b> <em>URL variants:</em> the same page is reached as http and https, with and without a trailing slash, with fragments, reordered query parameters or tracking parameters, so normalize before anything else. <em>URL-seen test:</em> 10B known URLs × 8-byte fingerprints is 80 GB, about 2.7 GB per node across 30 nodes, which fits in RAM, and 64-bit fingerprints expect only about three collisions among 10B URLs (n² / 2^65). A Bloom filter (Chapter 14) needs ~12 GB for 10B URLs at 1% false positives; it is the choice when memory is tight, at the cost of silently never crawling ~1% of new URLs. <em>Content duplicates:</em> mirrors, print versions and syndicated copies have different URLs but the same text. Hash the extracted text, not the raw HTML (which differs in ads and timestamps), to catch exact copies; for near-duplicates use <b>SimHash</b>, a 64-bit fingerprint in which similar documents differ in only a few bits. Google published its use of SimHash with a Hamming-distance threshold of 3 to detect near-duplicates among 8 billion pages." },
        { t: "code", lang: "python", code: `from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
import hashlib

TRACKING = {"utm_source", "utm_medium", "utm_campaign", "gclid", "fbclid"}
DEFAULT_PORT = {"http": 80, "https": 443}

def normalize(url: str) -> str:
    s = urlsplit(url.strip())
    scheme = s.scheme.lower()
    host = (s.hostname or "").lower().rstrip(".")
    if s.port and s.port != DEFAULT_PORT.get(scheme):
        host = host + ":" + str(s.port)
    query = sorted((k, v) for k, v in parse_qsl(s.query) if k not in TRACKING)
    return urlunsplit((scheme, host, s.path or "/", urlencode(query), ""))  # drop the fragment

def fingerprint(text: str) -> int:
    return int.from_bytes(hashlib.blake2b(text.encode(), digest_size=8).digest(), "big")

def owner(url: str, ring) -> str:
    # Every URL of a host goes to one node, so politeness state never leaves that node.
    return ring.lookup(urlsplit(url).hostname)` },
        { t: "p", html: "<b>C. Distributing the crawl.</b> Partition by <b>hostname</b> with consistent hashing (Chapter 7), not by URL. Every URL of a host then lands on one node, which owns that host's back queue, robots.txt rules, DNS entry and delay timer, so politeness needs no cross-node coordination. Links found for other hosts go into a Kafka topic partitioned by host, and the owning node consumes them; batching keeps this cheap at 58k links/s. When a node dies, its hosts move to ring neighbors, which rebuild state from the URL store. <b>DNS</b> deserves its own component: a crawler resolves far more distinct hostnames than a normal client, and the Mercator team found synchronous lookups through the standard library to be one of their biggest bottlenecks. Run a caching resolver on every node, resolve asynchronously, honor TTLs and pre-resolve hosts as their URLs enter the frontier. Placing crawler pools in several regions and assigning hosts to the nearest pool cuts fetch latency, which by Little's Law cuts the number of open connections needed." },
        { t: "p", html: "<b>D. robots.txt and freshness.</b> Fetch robots.txt before a host's first page and cache it for at most 24 hours, the limit RFC 9309 sets. A 4xx on robots.txt means no restrictions; a 5xx or network error means assume everything is disallowed until it can be fetched. Back off on 429 and 503 responses and when a host's latency rises. For freshness, each URL carries a <code>next_fetch_at</code> computed from its observed change rate: pages that changed on recent visits come back sooner, pages that never change drift toward monthly. Conditional GETs make unchanged revisits cost a few hundred bytes. News front pages, RSS feeds and sitemaps are polled every few minutes, because that is where new URLs appear first." },
        { t: "callout", kind: "warn", title: "Spider traps: dedupe will not save you", html: "Some sites generate unbounded URL spaces: calendars that link to the next month forever, faceted search that produces every filter combination, session IDs embedded in paths, or deliberately malicious traps. Every URL really is new, so the URL-seen set never fires. Defend with a <b>per-host page budget</b> per crawl cycle, a maximum URL length (~2,000 characters) and path depth, detection of repeating path segments such as <code>/a/b/a/b/a/b</code>, and stripping known session parameters. The budget is the backstop: a trap then wastes a bounded slice of the crawl instead of all of it." },
        { t: "h", text: "7. Trade-offs and bottlenecks" },
        { t: "table", head: ["Decision", "Chosen", "Alternative", "Why"], rows: [
          ["Partitioning", "By hostname", "By URL hash", "Politeness, robots.txt and DNS state stay on one node"],
          ["URL-seen set", "Exact 64-bit fingerprints in RAM", "Bloom filter", "80 GB fits across 30 nodes, and no new URLs are silently skipped"],
          ["Content dedupe", "Hash and SimHash of extracted text", "Exact hash of raw HTML", "Raw HTML differs in ads and timestamps; near-duplicates are the common case"],
          ["Rendering", "Static HTML only", "Headless browser for every page", "Rendering costs far more per page; reserve it for valuable JavaScript-heavy hosts"],
          ["Recrawl", "Adaptive, per URL change rate", "Fixed cycle for every URL", "Spends fetches where content actually changes"],
          ["Frontier storage", "Disk-backed queues, heads in memory", "Entirely in memory", "About 1 TB of queued URLs"]
        ] },
        { t: "callout", kind: "interview", title: "What strong candidates say", html: "Name the frontier's two jobs, priority and politeness, before drawing boxes, then say “I'll partition by host so politeness is local to one node.” Do the Little's Law calculation for in-flight fetches out loud, and list the three dedupe levels: URL normalization, the URL-seen set, content fingerprints. Interviewers routinely probe spider traps, robots.txt failures and DNS as the hidden bottleneck; raising them yourself shows you have thought about the real web, not an idealized graph." }
      ]
    },
    {
      id: "autocomplete",
      title: "Design Search Autocomplete",
      minutes: 16,
      blocks: [
        { t: "p", html: "Typeahead suggests completions as the user types: “new yo” becomes “new york times”, “new york weather”, “new york knicks”. Every keystroke can be a request, so suggestion traffic is several times search traffic, and a suggestion that arrives after the next keystroke is useless. The design splits cleanly into two systems with opposite needs: a <b>serving path</b> that answers a prefix lookup in about a millisecond, and a <b>data path</b> that turns billions of logged searches into a ranked index every day." },
        { t: "h", text: "1. Requirements" },
        { t: "list", items: [
          "<b>Suggest:</b> return the top 5 completions for a prefix, ranked by popularity with recent searches weighted more heavily.",
          "<b>Freshness:</b> newly popular queries appear within a day; breaking-news queries within minutes.",
          "<b>Safety and privacy:</b> filter offensive suggestions and never suggest a query typed by only a handful of people.",
          "<b>Locales:</b> separate suggestions per language and region.",
          "<b>Non-functional:</b> suggestions visible within ~100 ms of a keystroke, so p99 server time under ~10 ms; highly available but allowed to fail silently, since search still works without it; eventual consistency is fine.",
          "<b>Clarify:</b> personalization (blend the user's own history), spelling correction, and matching in the middle of words are separate features. Ask before assuming them."
        ] },
        { t: "h", text: "2. Estimates" },
        { t: "p", html: "Assume <b>100M DAU × 5 searches</b> = 500M searches/day ≈ 5,800/s. With a 100 ms debounce a search sends ~8 suggestion requests, so 4B requests/day ≈ <b>46k/s</b> average and ~<b>100k/s</b> at peak. Logged searches at ~100 B each are 50 GB/day. <b>Index size:</b> keep the top 10M queries per locale (prune the long tail) at ~25 characters average. That is at most 250M trie nodes, perhaps 100M after prefix sharing. Each node stores its top 5 as 4-byte query IDs plus 4-byte scores (40 B) plus ~60 B for the node and its child pointers, so ~100 B × 100M ≈ <b>10 GB</b>, plus 10M strings × ~30 B = 300 MB. That fits in one server's RAM, so <b>replicate rather than shard</b>. A lookup takes microseconds, so a server is limited by networking at roughly 20–50k requests/s: ~5 servers cover the peak, and ~12 across three regions leave room to lose a zone. Responses are ~300 B, so 100k/s × 300 B is only 30 MB/s." },
        { t: "h", text: "3. API" },
        { t: "code", lang: "http", code: `GET /v1/suggest?q=new%20yo&locale=en-US&limit=5
-> 200 Cache-Control: public, max-age=900
{"prefix": "new yo",
 "suggestions": ["new york times", "new york weather", "new york knicks",
                 "new york strip steak", "new york city marathon"]}

GET /v1/trending?locale=en-US
-> 200 {"queries": ["election results", "storm warning"]}

POST /v1/admin/blocklist              # takes effect at serving time, without a rebuild
{"pattern": "some offensive phrase", "locales": ["*"]}
-> 201 Created

# Logging is not a client call: the search service already publishes each executed
# search to Kafka topic search-queries {"query", "locale", "ts", "user_hash"}.` },
        { t: "h", text: "4. Data model" },
        { t: "table", head: ["Data", "Contents", "Where it lives"], rows: [
          ["Query log", "query, timestamp, locale, hashed user id", "Kafka, then Parquet files in S3 kept 30 days"],
          ["Daily aggregates", "(locale, query, day) to count and distinct users", "Warehouse table written by Spark"],
          ["Trie snapshot", "Serialized trie per locale with top 5 per node", "Versioned files in S3; loaded into RAM by every suggest server"],
          ["Trending overlay", "prefix to spiking queries, refreshed every minute", "Redis"],
          ["Blocklist", "Banned terms and patterns", "Config store pushed to servers"]
        ] },
        { t: "p", html: "There is no database on the hot path. The serving index is an <b>immutable in-memory snapshot</b>: it is rebuilt from logs, never edited in place, so readers need no locks, every server with the same version gives the same answers, and rollback means loading the previous version. Durable state lives upstream, in logs, aggregates and versioned snapshot files." },
        { t: "h", text: "5. High-level design" },
        { t: "diagram", caption: "Serving and data collection share nothing but the snapshot files and the trending overlay, so a slow pipeline never slows suggestions.", code: `flowchart LR
  U(("User typing")) --> CDN["Browser cache and CDN<br/>short prefixes"]
  CDN --> SG["Suggest service<br/>in-memory trie"]
  SG -->|"merge"| TR[("Redis trending overlay")]
  SS["Search service"] -.->|"executed queries"| K[["Kafka search-queries"]]
  K --> FL["Flink trending job<br/>5-minute windows"]
  FL --> TR
  K --> LOG[("S3 query logs")]
  LOG --> SP["Spark daily aggregation<br/>decay and filters"]
  SP --> TB["Trie builder"]
  TB -->|"versioned snapshot"| SNAP[("S3 trie snapshots")]
  SNAP -.->|"load and swap"| SG` },
        { t: "p", html: "<b>Serving path:</b> the browser debounces keystrokes and checks its cache; cache misses for popular short prefixes are served by the CDN; the rest reach a suggest server, which walks its in-memory trie, merges any trending entries for the prefix, removes blocklisted items and responds. <b>Data path:</b> executed searches flow into Kafka; a daily Spark job aggregates and scores them, the trie builder writes a new snapshot, and servers load it in the background and swap a pointer. A Flink job watches the same stream for spikes and keeps the trending overlay current." },
        { t: "h", text: "6. Deep dives" },
        { t: "p", html: "<b>A. A trie with top-K cached at every node.</b> A plain trie finds the node for a prefix in O(p) steps, where p is the prefix length, but then has to walk the whole subtree to find the best completions, and the subtree under “s” holds millions of queries. The fix is to precompute: store at every node the top K completions of its subtree. A lookup becomes p pointer hops plus copying K entries, however many queries share the prefix. The price is memory (the K entries per node dominate the 10 GB estimate) and expensive updates: changing one query's score can change the lists of all its ancestors. That is why the trie is built offline and served read-only." },
        { t: "diagram", caption: "Each node already holds the answer for its prefix, so serving “be” is two hops and a copy, with no subtree search.", code: `flowchart TD
  Root["root"] --> B["b<br/>top: bitcoin, best buy, bbc news"]
  B --> BE["be<br/>top: best buy, bed frame, beyonce"]
  B --> BI["bi<br/>top: bitcoin, bing, bible verse"]
  BE --> BES["bes<br/>top: best buy, best movies"]
  BE --> BED["bed<br/>top: bed frame, bedroom ideas"]
  BI --> BIT["bit<br/>top: bitcoin, bitcoin price"]` },
        { t: "code", lang: "python", code: `import heapq
K = 5

class Node:
    __slots__ = ("children", "score", "top")
    def __init__(self):
        self.children, self.score, self.top = {}, 0.0, []

def insert(root, query, score):
    node = root
    for ch in query:
        node = node.children.setdefault(ch, Node())
    node.score = score                   # decayed popularity of the complete query

def fill_top(node, prefix=""):
    """Offline, bottom-up: best K of this node's own query and its children's lists."""
    cands = [(node.score, prefix)] if node.score else []
    for ch, child in node.children.items():
        fill_top(child, prefix + ch)
        cands.extend(child.top)
    node.top = heapq.nlargest(K, cands)

def suggest(root, prefix):
    node = root
    for ch in prefix:
        node = node.children.get(ch)
        if node is None:
            return []
    return [q for _, q in node.top]      # O(len(prefix)), no subtree walk` },
        { t: "p", html: "<b>B. The data collection pipeline.</b> Count <em>executed</em> searches (and clicked suggestions), not keystrokes: what people type mid-word is noise, what they submit is intent. The daily job aggregates logs into counts and distinct users per query, then scores with exponential decay, for example a 7-day half-life: <code>score = sum of count_d × 0.5^(age_d / 7)</code>. Filters run before the build: a <b>minimum distinct-user threshold</b>, so a query typed by a few people (which may contain names or addresses) can never be suggested to strangers; the blocklist; case and whitespace normalization. A daily build is too slow for breaking news, so a Flink job counts queries over 5-minute sliding windows (a Count-Min Sketch plus a heap, Chapter 14, bounds memory), compares each count to the query's usual rate, and writes spiking queries into the trending overlay. The suggest service merges the overlay into the trie's results for matching prefixes." },
        { t: "p", html: "<b>C. Sharding the trie.</b> At ~10 GB, full replication is the right first answer. Shard only when the index outgrows memory, for example with dozens of locales or a much longer tail. Two naive schemes fail. Sharding by first letter is badly skewed, because far more English queries start with s or c than with x or q. Hashing whole queries breaks prefix lookups, because the completions of one prefix would scatter across every shard. The workable options are compared below." },
        { t: "compare", items: [
          { title: "Replicate the full trie", pros: ["Any server answers any prefix", "No routing layer or shard map"], cons: ["Every server must hold the whole index", "Each rebuild ships the full snapshot to every server"], use: "Default while the index fits comfortably in RAM, around tens of GB." },
          { title: "Shard by prefix range", pros: ["Ranges such as a to am and an to az are sized from traffic histograms, so load is balanced", "Hot ranges get extra replicas"], cons: ["A shard map to build, store and update (directory-based partitioning, Chapter 7)", "The router must parse the prefix"], use: "When one locale's trie no longer fits on one machine." },
          { title: "Prefix to top-K in a key-value store", pros: ["Each lookup is one get, hash-sharded evenly", "Scales with standard Redis or Cassandra operations"], cons: ["Stores every prefix with its own list, with no shared structure", "A network hop per request; a rebuild rewrites hundreds of millions of keys"], use: "When you already run a large key-value fleet and can spare the extra ~1 ms." }
        ] },
        { t: "p", html: "<b>D. Client and caching.</b> Most of the latency budget goes to the network, so the cheapest wins are on the client. <b>Debounce</b>: wait ~100 ms after the last keystroke, which cuts requests several-fold for fast typists. <b>Drop stale responses</b>: echo the prefix in the response so the client ignores answers that arrive out of order. <b>Cache</b>: suggestions for a prefix are identical for every user in a locale and change at most a few times a day, so mark them cacheable for 15 minutes in the browser and at the CDN. Short prefixes are both the hottest and the fewest (26 single letters and 676 two-letter pairs in English), so the CDN absorbs a large share of the traffic. Keep personalization in a separate small request or on the client so the generic response stays cacheable." },
        { t: "h", text: "7. Trade-offs and bottlenecks" },
        { t: "table", head: ["Decision", "Chosen", "Alternative", "Why"], rows: [
          ["Top-K storage", "Cached at every trie node", "Search the subtree per request", "Lookup cost depends only on prefix length; costs memory and slow updates"],
          ["Freshness", "Daily rebuild plus a trending overlay", "Update the live trie on every search", "A read-only trie needs no locks; the overlay covers news spikes"],
          ["Index location", "In memory on every server", "Prefix keys in a KV store", "Microsecond lookups with no network hop, until it outgrows RAM"],
          ["Signal", "Executed searches, decayed", "Every keystroke, raw counts", "Submitted queries show intent; decay lets old fads fade"],
          ["Caching", "Browser and CDN, 15-minute TTL", "No caching", "Short prefixes are few and extremely hot"],
          ["Safety", "Distinct-user threshold and blocklist", "Raw popularity", "Prevents leaking private queries and makes manipulation harder"]
        ] },
        { t: "callout", kind: "interview", title: "What strong candidates say", html: "“There are two systems here: a read-only serving path that must answer in about a millisecond, and an offline pipeline that rebuilds the index from search logs. I'll cache the top 5 at every trie node so a lookup is O(prefix length), rebuild daily with time decay, and add a streaming trending overlay for breaking news.” Then the sizing (~10 GB, so replicate rather than shard), and unprompted: client debounce, CDN caching of short prefixes, and a distinct-user threshold so private queries never leak." }
      ]
    }
  ],
  takeaways: [
    "Do the code-length arithmetic out loud: 62^7 ≈ 3.5 trillion covers 182B links with room to spare, so seven base62 characters are enough.",
    "At high write rates, pre-generate short keys (KGS) so the write path never does collision checks; keep a conditional put as the safety net and for custom aliases.",
    "Pick 302 when you need per-visit analytics or the ability to disable links; 301 lets browsers cache the redirect, so you lose both.",
    "Keep hot read paths read-only: emit analytics events to Kafka and aggregate offline instead of incrementing counters per request.",
    "Dynamo-style stores map one technique to each problem: consistent hashing with vnodes, N replicas with R + W > N, vector clocks, sloppy quorum with hinted handoff, Merkle-tree anti-entropy, gossip.",
    "R + W > N gives overlapping quorums, not linearizability; sloppy quorums, failed partial writes and concurrent updates still surface stale or conflicting data.",
    "A crawler's frontier does two jobs, priority and politeness; partition by hostname so robots.txt, DNS and rate-limit state live on one node.",
    "Crawler dedupe happens at three levels: URL normalization, a URL-seen set of fingerprints, and content fingerprints (SimHash for near-duplicates); per-host budgets stop spider traps.",
    "Autocomplete: cache the top K completions at every trie node so lookups cost O(prefix length), rebuild offline from search logs with time decay, and add a streaming overlay for trending queries.",
    "Size before you shard: a ~10 GB trie or a 15 GB hot-link cache fits in RAM, so replicate it; shard by prefix range only when it no longer fits."
  ],
  mcqs: [
    { q: "A URL shortener expects about 182 billion links over 10 years and uses base62 codes. What is the shortest code length that fits?", options: ["6 characters", "7 characters", "8 characters", "10 characters"], answer: 1,
      explain: "62^6 ≈ 56.8 billion is too small, while 62^7 ≈ 3.5 trillion fits with about 19x headroom. Eight characters would also work but wastes a character on every link without any need.", level: "easy" },
    { q: "Why does a URL shortener handling thousands of creates per second prefer a pre-generated key service over hashing the long URL and checking for collisions?", options: ["Hash digests are binary and cannot be encoded in the base62 alphabet at all", "A key service produces shorter codes than a truncated hash can", "Uniqueness is settled offline, so creates need no read-before-write or retry", "A key service lets identical long URLs share a single short code"], answer: 2,
      explain: "Truncated hashes collide, and the collision rate grows as the key space fills, so every create needs a check or conditional write plus retries. A KGS hands out keys already known to be unused in batches, which keeps the write path to one local pop and one insert. Sharing a code for identical URLs is a property of hashing, not of the KGS.", level: "medium" },
    { q: "Your shortener sells per-click analytics and lets owners disable links instantly. Which redirect status should it return?", options: ["302 Found, because browsers do not cache it unless headers allow it", "301 Moved Permanently, because a short link never changes its target", "200 OK with a meta-refresh page, because it can run analytics scripts", "308 Permanent Redirect, because it preserves the HTTP method and body"], answer: 0,
      explain: "Browsers may cache a 301 indefinitely, so repeat visits never reach the service, which breaks analytics and makes disabling a link ineffective. 308 is also permanent and cacheable. A meta-refresh page adds a full page load to every redirect.", level: "easy" },
    { q: "A single short link goes viral and sends 50k redirects/s, all of which hit one Redis key and saturate that shard. What is the most effective fix?", options: ["Add shards to the Redis cluster so the key's load is spread out", "Switch every link from 302 to 301 so browsers cache redirects", "Move the links table to a larger database instance with more IOPS", "Cache hot codes in an in-process LRU on each redirect server"], answer: 3,
      explain: "A single key lives on one shard however many shards exist, so adding shards does not spread it. A local LRU with a short TTL on every redirect server serves the hot code from memory, at the cost of a disable taking up to the TTL to apply. Switching to 301 would give up the analytics the product sells.", level: "medium" },
    { q: "In a Dynamo-style store with N = 3, which setting guarantees that a read quorum overlaps the most recent successful write quorum?", options: ["R = 1, W = 1", "R = 1, W = 2", "R = 2, W = 1", "R = 2, W = 2"], answer: 3,
      explain: "Overlap requires R + W > N. Only R = 2, W = 2 gives 4 > 3; the other three settings sum to 3 or less, so a read can land entirely on replicas that missed the write.", level: "easy" },
    { q: "Two replicas hold versions of the same key with vector clocks <code>[Sx:2, Sy:1]</code> and <code>[Sx:2, Sz:1]</code>. What should the store do on a read?", options: ["Keep the version with the higher wall-clock timestamp", "Return both versions as siblings for the client to merge", "Keep <code>[Sx:2, Sy:1]</code>, since Sy sorts before Sz in node order", "Discard both and return their common ancestor <code>[Sx:2]</code>"], answer: 1,
      explain: "One version descends from another only if all its counters are greater than or equal to the other's. Here each has a counter the other lacks, so the writes were concurrent and both must be kept for the client to merge. Picking by timestamp is last-write-wins, which silently drops one update.", level: "medium" },
    { q: "A cluster uses N = 3, R = 2, W = 2 with sloppy quorums. During a network partition, a write is acknowledged by node A and fallback nodes D and E. Right after the partition heals, before any background process has run, a read of the same key from home replicas B and C returns the old value. Why?", options: ["Two of the three acks came from fallback nodes, so the quorums need not overlap", "Vector clocks on B and C rejected the newer version as a concurrent sibling", "Read repair always runs before the coordinator returns, so this cannot happen", "Anti-entropy with Merkle trees reverted the write as it reached B and C"], answer: 0,
      explain: "Quorum overlap is defined over the N home replicas. A sloppy quorum counts fallback nodes toward W to stay writable, which breaks that overlap until hinted handoff copies the write back to B and C. This is the availability-for-consistency trade Dynamo makes on purpose.", level: "hard" },
    { q: "A Cassandra node was offline for 14 days. <code>gc_grace_seconds</code> is the default 10 days, and some keys were deleted while it was down. What is the risk if you simply restart it and run repair?", options: ["Repair will fail because the node's token range was reassigned to its neighbors", "The node will refuse reads until its whole commit log has been replayed", "Deleted data can reappear, since the tombstones were already purged elsewhere", "The deleted keys will be duplicated as siblings across every replica"], answer: 2,
      explain: "Tombstones exist so a delete can reach every replica before it is purged. Once the grace period passes, the healthy replicas drop them, and the returning node's stale values look like live data that anti-entropy should spread. Repair more often than the grace period, and rebuild a node that was gone longer than it.", level: "hard" },
    { q: "Why do distributed crawlers usually assign URLs to nodes by hashing the <b>hostname</b> rather than the full URL?", options: ["Hostname hashing balances load across nodes better than full-URL hashing", "Each host's robots.txt and politeness timer are owned by a single node", "It lets every node fetch from every host in parallel, which shortens the crawl", "Hostnames are already canonical, so URLs need no normalization before dedupe"], answer: 1,
      explain: "Politeness is per host: at most one connection and a delay between requests. If a host's URLs were spread across nodes, those nodes would need to coordinate every fetch. Hostname partitioning is actually less even than URL hashing, since big sites make some nodes heavier, and that is a cost accepted for this benefit.", level: "medium" },
    { q: "A crawler must sustain 2,000 pages/s and an average fetch takes 1.5 s including slow servers. About how many fetches must be in flight at once?", options: ["About 1,300", "About 2,000", "About 3,000", "About 30,000"], answer: 2,
      explain: "Little's Law: in-flight requests = arrival rate × time in system = 2,000/s × 1.5 s = 3,000. That is why fetchers use asynchronous I/O rather than one thread per connection.", level: "easy" },
    { q: "The crawler keeps fetching tens of thousands of distinct pages from one site's event calendar, each linking to the next month. The URL-seen set never fires. What is the most robust defense?", options: ["Replace the URL-seen set with a Bloom filter so it can track more URLs", "Lower the politeness delay for that host so its crawl finishes sooner", "Store a content fingerprint of each page and skip exact duplicates", "Enforce a per-host page budget per cycle, plus URL length limits"], answer: 3,
      explain: "Every calendar URL really is new, and each month's page has different content, so neither URL dedupe nor exact content hashing stops the trap. A per-host budget (backed by URL length and repeated-path limits) bounds the damage from any trap, including ones no heuristic recognizes. Crawling faster only fills the frontier faster.", level: "hard" },
    { q: "Two copies of a news article live on different domains and differ only in ad blocks, navigation and a timestamp. Which technique flags them as duplicates?", options: ["SimHash over the extracted text, compared by Hamming distance", "A SHA-256 hash of the raw HTML response, compared for equality", "Normalizing both URLs with canonical rules and comparing them", "Comparing the HTTP ETag and Last-Modified headers of both"], answer: 0,
      explain: "Raw HTML hashes differ as soon as one byte differs, and the URLs and ETags of different sites are unrelated. SimHash maps similar documents to fingerprints only a few bits apart, which is how Google detected near-duplicates at web scale, and hashing extracted text first removes boilerplate noise.", level: "medium" },
    { q: "Why does an autocomplete trie store the top K completions at every node instead of searching the subtree at request time?", options: ["It shrinks the trie's memory footprint, since leaf nodes can be dropped", "Lookup cost depends on prefix length, not on how many queries share it", "It allows the trie to be updated in place on every search without locks", "It removes the need to rank suggestions by popularity at build time"], answer: 1,
      explain: "The subtree under a short prefix like “s” can hold millions of queries, so searching it per keystroke is too slow. Precomputed lists make a lookup p hops plus a copy. The distractors have it backwards: the lists add memory, and one score change touches every ancestor, which is why the trie is built offline.", level: "medium" },
    { q: "The autocomplete index outgrows one machine and must be sharded. Why is hashing each complete query to a shard a poor choice?", options: ["Common hash functions mishandle multi-byte Unicode query strings", "It concentrates the most popular queries on a single hot shard", "A prefix's completions scatter, so every lookup must hit every shard", "Hashing makes the daily offline rebuild impossible to parallelize"], answer: 2,
      explain: "A prefix lookup needs all completions sharing that prefix, and query hashing spreads them evenly over every shard, turning each keystroke into a scatter-gather. Sharding by prefix range keeps a prefix's subtree on one shard; set range boundaries from traffic histograms to avoid the skew that first-letter sharding causes.", level: "hard" },
    { q: "Autocomplete suggestions come from a trie rebuilt nightly, but a breaking news query must start appearing within minutes. What is the best fix?", options: ["A streaming job feeds spiking queries into a small overlay merged at read time", "Rebuild the entire trie from the query logs and redeploy it every five minutes", "Insert each query into the live trie and recompute ancestor top-K under a lock", "Disable CDN and browser caching so clients always see the newest suggestions"], answer: 0,
      explain: "A small trending overlay, fed by windowed counts in Flink, keeps the main trie immutable and lock-free while adding fresh results. Rebuilding the full index every few minutes is wasteful, and live updates under locks hurt the read path. Disabling caching only adds load: the trie itself would still be stale.", level: "medium" }
  ],
  design: [
    {
      id: "design-pastebin",
      title: "Design Pastebin",
      level: "Easy",
      prompt: "Design a service like Pastebin where users paste text or code, optionally choose an expiry time and visibility, and get a short link that anyone holding it can open. Assume about 1M new pastes per day and that most pastes are read a handful of times.",
      clarify: [
        "What is the maximum paste size, and what is a typical one?",
        "What is the read:write ratio, and how long are pastes kept when no expiry is set?",
        "Which visibility modes are needed: public and listed, unlisted (anyone with the link), private (owner only)?",
        "Do we need burn-after-read, editing, or version history?",
        "Can anonymous users create pastes, or only signed-in users?",
        "Is syntax highlighting rendered on the server, or can the client do it?"
      ],
      hints: [
        "Compared with a URL shortener, the value is now a blob of up to megabytes rather than a 200-byte URL. Where should blobs live, and what stays in the database?",
        "At ~35 writes/s, do you still need a key generation service? Think about what a random ID plus a conditional put costs at this rate.",
        "Unlisted pastes are protected only by how hard their ID is to guess. How long must the ID be so that an attacker making a million guesses finds almost nothing?",
        "Expiry has two halves: never serve an expired paste, and eventually reclaim its storage. Which mechanism handles each half?",
        "Public pastes never change after creation. What does that let a CDN do, and what does burn-after-read break?"
      ],
      solution: [
        { t: "h", text: "1. Requirements" },
        { t: "list", items: [
          "<b>Functional:</b> create a paste (up to 10 MB of UTF-8 text) with optional language, expiry (10 minutes to never) and visibility (public, unlisted, private); read it as a page or as raw text; delete it; optional burn-after-read.",
          "<b>Non-functional:</b> reads p99 under 100 ms; 99.9% availability; a paste is durable until it expires; expired or deleted pastes are never served; unlisted IDs are unguessable; abuse (malware, leaked credentials) can be found and taken down."
        ] },
        { t: "h", text: "2. Estimates" },
        { t: "p", html: "Writes: 1M/day / 86,400 ≈ <b>12/s</b>, ~35/s at peak. Reads at 10:1: 10M/day ≈ 116/s, ~350/s at peak. With a 10 KB average, new content is 1M × 10 KB = <b>10 GB/day</b>, 3.65 TB/year, and text compresses ~4:1, so ~0.9 TB/year in object storage before expiry removes anything. Metadata over 10 years: 3.65B pastes × ~300 B ≈ 1.1 TB. Peak egress: 350 × 10 KB = 3.5 MB/s, mostly absorbed by the CDN. <b>ID length:</b> the database is tiny, so the ID is sized for secrecy, not storage. With 3.65B pastes among 62^8 ≈ 2.2 × 10^14 possible 8-character IDs, a random guess hits with probability ~1.7 × 10^-5, so a million guesses would find ~17 pastes. With 10 characters (62^10 ≈ 8.4 × 10^17, ~59.5 bits) a million guesses find ~0.004. Use 10-character random IDs and rate-limit clients that produce many 404s." },
        { t: "h", text: "3. API" },
        { t: "code", lang: "http", code: `POST /api/v1/pastes
{"content": "def main(): ...", "language": "python",
 "expires_in": "7d", "visibility": "unlisted", "burn_after_read": false}
-> 201 {"id": "Xk29fQa0Lm", "url": "https://paste.example/Xk29fQa0Lm"}
-> 413 if content is over 10 MB, 429 if the caller is over its create limit

GET /{id}            -> 200 HTML page, highlighting done in the browser
GET /raw/{id}        -> 200 Content-Type: text/plain; charset=utf-8
                     -> 404 unknown, 410 expired or deleted

DELETE /api/v1/pastes/{id}
-> 204 No Content` },
        { t: "h", text: "4. Data model" },
        { t: "table", head: ["Field", "Type", "Notes"], rows: [
          ["<code>id</code>", "string, 10 chars", "Partition key; random base62"],
          ["<code>owner_id</code>", "int64, nullable", "Null for anonymous pastes"],
          ["<code>visibility</code>, <code>burn_after_read</code>", "enum, bool", "Control caching and access checks"],
          ["<code>language</code>, <code>size_bytes</code>", "string, int", "Shown on the page"],
          ["<code>inline_content</code> or <code>content_key</code>", "bytes or string", "Small pastes inline, larger ones as an S3 key"],
          ["<code>created_at</code>, <code>expires_at</code>, <code>status</code>", "timestamps, enum", "status: active, burned, deleted, blocked"]
        ] },
        { t: "p", html: "Metadata goes in <b>DynamoDB</b> (single-key access, built-in TTL, change streams); content goes in <b>S3</b> under <code>pastes/{id}</code>, compressed. Pastes under ~16 KB, the large majority, are stored inline in the metadata row, which is well inside DynamoDB's 400 KB item limit and saves an S3 request on most reads. A <code>pastes_by_owner</code> index serves “my pastes” and is the only secondary access pattern." },
        { t: "h", text: "5. High-level design" },
        { t: "diagram", caption: "Small pastes are served from the metadata row, large ones from S3; expiry, cleanup and abuse scanning all run off the request path.", code: `flowchart LR
  U(("User")) --> CDN["CDN<br/>public and unlisted"]
  CDN --> LB["Load balancer"]
  LB --> PS["Paste service"]
  PS -->|"metadata and small pastes"| MD[("DynamoDB pastes")]
  PS -->|"large content"| S3[("S3 paste objects")]
  PS -->|"hot pastes"| RC[("Redis cache")]
  PS -.->|"new paste"| Q[["SQS scan queue"]]
  Q --> AS["Abuse scanner<br/>malware and secrets"]
  AS -.->|"block"| MD
  MD -.->|"TTL delete stream"| SW["Cleanup worker"]
  SW -.->|"delete object"| S3` },
        { t: "p", html: "<b>Write:</b> the paste service validates size, generates a random ID, uploads large content to S3 first, then writes the metadata row with <code>put if not exists</code>. Writing the row last means a crash leaves at worst an orphaned S3 object, which a periodic sweep removes, never a row pointing at missing content. It then enqueues the paste for scanning. <b>Read:</b> the CDN serves cached public and unlisted pastes; on a miss the service reads the row (through Redis for hot pastes), checks <code>status</code> and <code>expires_at</code>, fetches S3 content if not inline, and sets cache headers according to visibility." },
        { t: "h", text: "6. Deep dives" },
        { t: "p", html: "<b>A. No key service needed.</b> The URL shortener needed a KGS because codes had to be short and the write rate was high. Here IDs are long and writes are ~35/s: with 3.65B pastes in a space of 8.4 × 10^17, each insert collides with probability ~4 × 10^-9, so a random ID with a conditional put almost never retries. Recognizing when a component from a related design is unnecessary is a signal interviewers look for." },
        { t: "p", html: "<b>B. Expiry in two halves.</b> Correctness: every read compares <code>expires_at</code> with now, so an expired paste returns 410 the moment it expires. Reclamation: DynamoDB TTL deletes expired rows in the background, sometimes days late, which is fine because reads never rely on it. Each TTL delete appears in DynamoDB Streams, and a cleanup worker deletes the matching S3 object. An alternative for content is S3 lifecycle rules, which expire objects by age and can filter by tag, so uploads are tagged with an expiry class (<code>1d</code>, <code>7d</code>, <code>30d</code>). Cached copies are bounded by setting the CDN <code>max-age</code> to at most the time left before expiry." },
        { t: "p", html: "<b>C. Caching versus burn-after-read and privacy.</b> Public and unlisted pastes are immutable, so the CDN can cache them for up to an hour (or until expiry); a delete triggers a CDN purge for both URLs. Private pastes need an authorization check, so they are served with <code>Cache-Control: private, no-store</code> and never reach shared caches. Burn-after-read cannot be cached at all, and the read must be atomic: a conditional update <code>set status = burned if status = active</code> lets exactly one reader win. Messaging apps fetch link previews automatically, which would burn a paste before its recipient sees it, so the GET shows a “click to reveal” page and the content is released only by a POST." },
        { t: "h", text: "7. Trade-offs and bottlenecks" },
        { t: "table", head: ["Decision", "Chosen", "Alternative", "Why"], rows: [
          ["Content storage", "Inline under 16 KB, else S3", "Everything in S3", "One request for most reads; cheap storage for the long tail"],
          ["IDs", "10-char random + conditional put", "KGS with 7-char codes", "Unguessability matters more than shortness; the write rate is low"],
          ["Expiry", "Checked on read; TTL and lifecycle reclaim", "Cron job deleting rows", "Correct to the second without relying on cleanup timing"],
          ["Dedupe of identical pastes", "None", "Content-addressed storage", "Saves little and needs reference counting for deletes"],
          ["Abuse scanning", "Asynchronous after create", "Blocking scan before create", "Keeps creates fast; a bad paste is live for seconds before blocking"]
        ] }
      ],
      followups: [
        "How would you add edit history, so a revised paste keeps every version reachable by its own link?",
        "A paste goes viral and gets 20k reads/s. Walk through which layer absorbs the load.",
        "How would you detect and take down pastes containing leaked API keys within a minute?",
        "How would you support pastes of up to 1 GB?",
        "Legal requires takedowns to take effect worldwide within 5 minutes. What changes in your caching?"
      ]
    },
    {
      id: "design-link-in-bio-analytics",
      title: "Design a QR-Code and Link-in-Bio Service with Click Analytics",
      level: "Medium",
      prompt: "Design a service that gives creators and businesses two products: a link-in-bio page (<code>sho.rt/@handle</code>) listing their links, and dynamic QR codes for print whose destination the owner can change at any time. Owners see near-real-time analytics: page views, clicks and scans by link, country, device and referrer, plus unique visitors. Assume 20M creators and about 300M page views per day.",
      clarify: [
        "How fresh must the dashboard be: seconds, minutes or a day?",
        "Do owners need unique visitors, and over which windows: day, week, all time?",
        "How quickly must a changed QR destination take effect?",
        "Should bots and link-preview fetches be excluded from counts, or shown separately?",
        "What privacy rules apply: may we store IP addresses, and for how long?",
        "How large are traffic spikes when a big creator posts?"
      ],
      hints: [
        "A printed QR code can never be changed, so it must encode a short URL you control. What does that force about the redirect status code and caching?",
        "Bio pages are the same for every visitor and change rarely, so serve them from a CDN. Your servers then never see the page views; how do you still count them?",
        "Counting is the crux. Separate the event path (Kafka and a stream processor) from the query path (a columnar store), and decide where bots, double taps and duplicate deliveries are filtered.",
        "Unique visitors per link per day across billions of events: which Chapter 14 structure gives this in a few KB, and why does it matter that it is mergeable?",
        "When a celebrity posts, one link gets 50k clicks/s. Which part of your pipeline is keyed in a way that turns that into a single hot partition?"
      ],
      solution: [
        { t: "h", text: "1. Requirements" },
        { t: "list", items: [
          "<b>Bio pages:</b> <code>GET /@handle</code> renders the owner's links; owners edit links, order and theme.",
          "<b>Dynamic QR:</b> create a code for a destination, download PNG or SVG, change the destination at any time; changes visible within about a minute.",
          "<b>Tracking:</b> every bio-link click and QR scan redirects through us and is counted; page views are counted too.",
          "<b>Analytics:</b> views, clicks, scans and click-through rate by link, hour or day, country, device and referrer, plus unique visitors; dashboard lag under ~1 minute.",
          "<b>Non-functional:</b> redirects p99 under 50 ms and 99.99% available, because printed codes in the wild cannot be reissued; counts within ~1% of the truth; no raw IP addresses stored."
        ] },
        { t: "h", text: "2. Estimates" },
        { t: "p", html: "Page views: 300M/day ≈ <b>3,500/s</b>. Clicks at a 20% click-through rate: 60M/day ≈ 700/s. QR scans: 40M/day ≈ 460/s. Total ~400M events/day ≈ <b>4,600/s</b> average, ~15k/s at a 3x daily peak, with single-creator spikes of ~50k/s on top. At ~300 B per event that is 120 GB/day of raw JSON; in a columnar store with ~10x compression on repetitive fields, ~12 GB/day or ~4.4 TB/year, which is a few ClickHouse nodes. Links: 20M creators × 10 links + 50M QR codes = 250M rows × ~500 B ≈ 125 GB. Unique visitors: a HyperLogLog sketch with 4,096 six-bit registers is ~3 KB and has ~1.6% standard error (1.04 / √4096), so a per-link daily sketch is far cheaper than storing visitor IDs." },
        { t: "h", text: "3. API" },
        { t: "code", lang: "http", code: `POST /api/v1/qr
{"destination": "https://cafe.example/menu", "label": "table tents"}
-> 201 {"code": "q7Tb2", "short_url": "https://sho.rt/q/q7Tb2",
        "svg_url": "https://cdn.sho.rt/qr/q7Tb2.svg"}

PATCH /api/v1/links/{link_id}
{"destination": "https://cafe.example/winter-menu"}
-> 200 OK

GET /@{handle}                       -> 200 static HTML from the CDN
GET /r/{link_id}   and   GET /q/{code}
-> 302 Found, Location: destination, Cache-Control: no-store

GET /api/v1/analytics?from=2026-10-01&to=2026-10-21&metric=clicks&group_by=link,country
-> 200 {"rows": [...], "uniques": 48211, "as_of": "2026-10-21T14:03:00Z"}` },
        { t: "h", text: "4. Data model" },
        { t: "table", head: ["Store", "Key", "Fields"], rows: [
          ["Links (PostgreSQL sharded by owner_id)", "link_id", "owner_id, kind (bio or qr), destination, position, status, updated_at"],
          ["Pages", "handle", "owner_id, theme, published_version"],
          ["Events (ClickHouse)", "ORDER BY owner_id, link_id, ts", "event_id, ts, type (view, click, scan), country, device, referrer_domain, visitor_hash, is_bot"],
          ["Rollups (ClickHouse materialized view)", "owner_id, link_id, hour, country, device", "count, HyperLogLog state of visitor_hash"]
        ] },
        { t: "p", html: "Links are relational and small, edited by their owner, so PostgreSQL sharded by <code>owner_id</code> keeps a creator's links together. Events are append-only and queried as aggregates over one owner's rows, which is exactly what a columnar OLAP store is for (Chapter 10). Ordering the ClickHouse table by <code>(owner_id, link_id, ts)</code> means a dashboard query reads only that owner's slice of the data." },
        { t: "h", text: "5. High-level design" },
        { t: "diagram", caption: "Redirects depend only on the link cache, never on the analytics pipeline, so analytics can lag or fail without breaking printed codes.", code: `flowchart LR
  V(("Visitor")) --> CDN["CDN<br/>bio pages and QR images"]
  V -->|"link taps, scans,<br/>view beacons"| ED["Redirect and<br/>event service"]
  ED -->|"destination lookup"| RC[("Redis link cache")]
  RC -.->|"miss"| LDB[("Links DB")]
  ED -.->|"event"| K[["Kafka raw-events"]]
  K --> FL["Flink: bot flag,<br/>dedupe, enrich"]
  FL -->|"batched inserts"| CH[("ClickHouse events<br/>and rollups")]
  OW(("Owner")) --> API["Dashboard API"]
  API --> CH
  API -->|"edit link"| LDB
  API -.->|"invalidate and purge"| RC` },
        { t: "p", html: "<b>Click or scan:</b> the redirect service resolves the destination from its local LRU, then Redis, then the links DB, returns a 302, and buffers an event to Kafka asynchronously. <b>Page view:</b> the CDN serves the static page, and the page sends a small beacon (<code>navigator.sendBeacon</code>) to the event service; CDN access logs streamed into Kafka are a second source that also catches visitors who block scripts. <b>Dashboard:</b> the API queries ClickHouse rollups for charts and raw events for drill-downs." },
        { t: "h", text: "6. Deep dives" },
        { t: "p", html: "<b>A. Mutable destinations.</b> The QR code encodes <code>sho.rt/q/q7Tb2</code>, never the destination, and the redirect is always a 302 with <code>no-store</code>; a cached 301 on a phone would pin last season's menu forever. On an edit, the API updates the row, deletes the Redis key, and redirect nodes' local LRUs hold entries for at most 30 seconds, which meets the one-minute requirement. Bio pages are rendered to static HTML on every edit and purged from the CDN by URL. QR images are generated once from the short URL and served from the CDN; a short URL keeps the QR version low (fewer, larger modules), so it scans reliably when printed small, and error-correction level Q or H (25% or 30% recoverable) tolerates damage or a logo in the middle." },
        { t: "p", html: "<b>B. Counting correctly.</b> Most analytics complaints come from counts that are inflated, deflated or impossible to reconcile. Each source of error gets an explicit fix:" },
        { t: "table", head: ["Problem", "Fix", "Where"], rows: [
          ["Bots and crawlers", "User-agent lists, data-center IP ranges, no beacon; flag <code>is_bot</code> rather than drop", "Flink enrich step"],
          ["Link previews from Slack, WhatsApp, iMessage", "Known preview user agents flagged as previews, not visits", "Flink enrich step"],
          ["Double taps and refreshes", "Same visitor and link within 30 s counts once", "Flink keyed state with a TTL"],
          ["Duplicate delivery from retries", "<code>event_id</code> set at the edge; dedupe in Flink, ReplacingMergeTree as a backstop", "Flink and ClickHouse"],
          ["Unique visitors without raw IPs", "<code>visitor_hash</code> = hash of IP, user agent and a salt rotated daily; HyperLogLog per link per day", "Edge and rollups"]
        ] },
        { t: "p", html: "The daily salt means no visitor can be tracked across days, which simplifies the privacy story. The price: the same person on two days produces two hashes, so weekly uniques computed by merging daily sketches overcount repeat visitors. Products that need cross-day uniques use a consented first-party cookie as the visitor ID instead. Say this trade-off out loud; it is the kind of detail that separates a strong answer." },
        { t: "p", html: "<b>C. Hot creators.</b> A celebrity post can send 50k clicks/s to one link. The redirect tier is stateless and scales horizontally, and the hot destination sits in every node's local LRU, so no Redis key gets hot. The pipeline is the trap: partitioning Kafka by <code>link_id</code> would put the whole spike on one partition and one Flink task. Partition raw events by <code>event_id</code> instead, pre-aggregate per link per second inside each task, and merge the partial counts by <code>link_id</code> downstream; this is the two-stage aggregation from Chapter 10's ad-click design. ClickHouse wants inserts in batches of thousands of rows, so Flink flushes every second or so rather than per event." },
        { t: "h", text: "7. Trade-offs and bottlenecks" },
        { t: "table", head: ["Decision", "Chosen", "Alternative", "Why"], rows: [
          ["Redirect status", "302 with no-store", "301", "Destinations are mutable and every scan must be counted"],
          ["Page views", "CDN page plus beacon and CDN logs", "Render every view on origin", "The CDN absorbs spikes; two sources allow reconciliation"],
          ["Analytics store", "ClickHouse raw events plus rollups", "Counters in Redis or the links DB", "Arbitrary group-bys and drill-downs; no hot-row writes"],
          ["Kafka partitioning", "By event_id, two-stage aggregation", "By link_id", "Avoids one hot partition per viral link"],
          ["Uniques", "Daily HyperLogLog per link", "Exact sets of visitor IDs", "~3 KB per link-day at ~1.6% error instead of unbounded sets"],
          ["Failure isolation", "Redirects never wait on Kafka", "Synchronous event write", "Printed codes keep working when analytics is down; events buffer locally"]
        ] }
      ],
      followups: [
        "An owner's own site analytics shows 30% fewer visits than your click counts. How do you explain and reconcile the gap?",
        "How would you support A/B testing two destinations behind one QR code?",
        "A brand prints a unique QR code on each of 10M packages and wants scans per package. What changes?",
        "How do redirects and counts behave if Kafka is unavailable for an hour?",
        "How would you offer exact all-time unique visitors, and what would it cost?"
      ]
    },
    {
      id: "design-news-search-indexer",
      title: "Design a News-Search Indexer for a Crawler's Output",
      level: "Hard",
      prompt: "The web crawler from this chapter publishes a <code>page-crawled</code> event for every fetch from about 50,000 news sites. Design the system that turns this stream into news search: articles become searchable within about a minute of being crawled, results are ranked by relevance and recency, syndicated copies of one story are grouped together, and users can filter by date, source and language. Assume 2M new articles per day and a five-year archive.",
      clarify: [
        "What is the freshness target from crawl to searchable: seconds, a minute, an hour?",
        "How much history must be searchable, and must old articles be as fast as recent ones?",
        "How should a wire story republished by hundreds of sites appear: once, or every copy?",
        "What happens when an article is corrected after indexing, or must be taken down?",
        "What query volume, and which sorts and filters: relevance, newest first, date ranges, source?",
        "Which languages must be supported?"
      ],
      hints: [
        "Treat the search index as a derived view. Keep extracted articles in object storage so the search cluster can be rebuilt or reindexed at any time.",
        "An article is crawled many times and events can arrive out of order. Which document ID and which versioning rule make indexing idempotent and order-safe?",
        "News search is mostly about the last few days. How would you lay out indices by time so a query touches few shards and old data sits on cheaper hardware?",
        "Syndicated copies differ only in boilerplate. SimHash plus a pigeonhole argument finds near-duplicates among millions of articles without comparing every pair.",
        "BM25 alone ranks a three-year-old article above today's news. Blend text relevance with recency decay and source authority."
      ],
      solution: [
        { t: "h", text: "1. Requirements" },
        { t: "list", items: [
          "<b>Functional:</b> extract article text and metadata from crawled pages; index new and updated articles; keyword search with filters (date range, source, language) and sorts (relevance, newest); group syndicated copies; honor corrections and takedowns.",
          "<b>Non-functional:</b> crawl-to-searchable p95 under 60 s; search p99 under 300 ms for the last 30 days and under 2 s for the archive; indexing is idempotent and survives replays; the index can be rebuilt from durable storage."
        ] },
        { t: "h", text: "2. Estimates" },
        { t: "p", html: "<b>Input:</b> ~20M news page fetches/day (front pages, sitemaps and recrawls) ≈ <b>230 events/s</b>, ~10x during breaking news. About 2M are new articles and 1M are changed ones, so ~3M index writes/day ≈ 35/s, ~350/s at peak, which is light work for an Elasticsearch cluster. At ~20 ms of CPU to parse and extract a page, 230/s needs ~5 cores on average and ~50 at peak, so an autoscaled pool of extractor workers. <b>Storage:</b> ~5 KB of text plus ~1 KB of metadata per article, ~8 KB once indexed: 2M × 8 KB = <b>16 GB/day</b>, and five years of 3.65B articles is ~29 TB of primaries, ~58 TB with one replica. The last 30 days are only ~480 GB of primaries. <b>Queries:</b> 10M/day ≈ 115/s, up to ~1,000/s during big events, with ~90% filtered to the last week." },
        { t: "h", text: "3. API" },
        { t: "code", lang: "http", code: `GET /v1/news/search?q=central+bank+rates&from=2026-10-15&lang=en&sort=relevance&cursor=
-> 200 {"results": [{"cluster_id": "c_88f1", "title": "...", "url": "...",
                     "source": "example-news.com", "published_at": "2026-10-21T08:02:00Z",
                     "snippet": "...", "other_copies": 312}],
        "next_cursor": "eyJzIjpbMTIuNCwiOWYzYyJdfQ"}

GET /v1/news/clusters/{cluster_id}   -> 200 every copy of the story, newest first

DELETE /v1/admin/articles/{url_fp}   -> 202 Accepted   (takedown)

# Input: Kafka topic page-crawled, as produced by the crawler
# {"url", "fetched_at", "status", "content_fp", "warc_ref"}` },
        { t: "h", text: "4. Data model" },
        { t: "table", head: ["Field", "Type in the index", "Purpose"], rows: [
          ["<code>_id</code> = URL fingerprint", "keyword", "One document per URL, so recrawls overwrite instead of duplicating"],
          ["<code>title</code>, <code>body</code>", "text, per-language analyzer", "Full-text matching; title boosted"],
          ["<code>published_at</code>, <code>first_seen_at</code>", "date", "Filters, sorting, recency decay, index routing"],
          ["<code>source</code>, <code>lang</code>", "keyword", "Filters and source authority lookup"],
          ["<code>cluster_id</code>", "keyword", "Groups syndicated copies; used for field collapsing"],
          ["<code>simhash</code>", "64-bit integer", "Near-duplicate detection"],
          ["<code>authority</code>", "float", "Per-source quality score used in ranking"]
        ] },
        { t: "p", html: "Elasticsearch (or OpenSearch) serves search, but it is <b>not the source of truth</b> (Chapter 10): every extracted article is also written as compressed JSON lines to an S3 article store, partitioned by day. Reindexing for a new analyzer or mapping is then a batch job from S3 into new indices followed by an alias switch, with no recrawl. SimHash lookup tables for the last week live in Redis." },
        { t: "h", text: "5. High-level design" },
        { t: "diagram", caption: "The pipeline is a chain of idempotent stages fed by Kafka; S3 holds everything needed to rebuild the search indices.", code: `flowchart LR
  K[["Kafka page-crawled"]] --> EX["Extractor workers<br/>boilerplate removal"]
  EX -->|"read WARC record"| S3W[("S3 crawl archive")]
  EX --> DD["Near-dup clusterer<br/>SimHash"]
  DD -->|"block lookups"| SH[("Redis SimHash tables")]
  DD --> EN["Enricher<br/>language, date, authority"]
  EN -->|"extracted article"| S3A[("S3 article store")]
  EN -->|"bulk index"| ES[("Elasticsearch<br/>hot daily indices")]
  ES -.->|"after 30 days"| WARM[("Warm tier indices")]
  U(("Reader")) --> QS["Query service"]
  QS --> ES
  QS --> WARM` },
        { t: "steps", items: [
          { title: "Consume", html: "Extractor workers in one consumer group read <code>page-crawled</code>, skip non-200 responses and pages whose <code>content_fp</code> is unchanged since the last indexed version." },
          { title: "Extract", html: "Fetch the WARC record from S3, strip navigation, ads and comments, and keep title, body, author and candidate publish dates." },
          { title: "Cluster", html: "Compute the body's SimHash, look up near-duplicates from the last 7 days, and join their cluster or start a new one." },
          { title: "Enrich and persist", html: "Detect the language, pick <code>published_at</code>, attach the source's authority score, and write the article to the S3 store." },
          { title: "Index", html: "Send bulk requests of a few MB to the daily index chosen by <code>first_seen_at</code>; commit Kafka offsets only after the bulk call succeeds." }
        ] },
        { t: "h", text: "6. Deep dives" },
        { t: "p", html: "<b>A. Idempotent, order-safe indexing.</b> The document ID is the URL fingerprint, and the index is chosen by the article's <code>first_seen_at</code> date, so every recrawl of a URL targets the same document in the same index. Each write carries <code>version = fetched_at</code> in milliseconds with <code>version_type=external</code>; Elasticsearch then accepts a write only if its version is higher than the stored one. A late, older crawl is rejected with a version conflict instead of overwriting newer content, and a Kafka replay after a worker crash is harmless. This is at-least-once delivery plus idempotent writes (Chapter 9). With the default 1-second refresh on hot indices, a document is searchable about a second after its bulk request, so end-to-end latency is dominated by crawl-to-Kafka and extraction, well under the 60-second target." },
        { t: "code", lang: "json", code: `{"index": {"_index": "news-2026.10.21", "_id": "9f3c1a77e0b2d4c5",
           "version": 1792569850000, "version_type": "external"}}
{"title": "Central bank holds rates steady", "body": "...",
 "published_at": "2026-10-21T08:02:00Z", "first_seen_at": "2026-10-21T08:04:10Z",
 "source": "example-news.com", "lang": "en", "cluster_id": "c_88f1",
 "simhash": -6917529027641081856, "authority": 0.82}` },
        { t: "p", html: "<b>B. Grouping syndicated stories.</b> Two copies count as near-duplicates if their 64-bit SimHashes differ in at most 3 bits. Split each fingerprint into 4 blocks of 16 bits; by the pigeonhole principle, if at most 3 bits differ, at least one block is identical. Keep 4 lookup tables keyed by (block number, block value) covering the last 7 days, about 14M articles, since syndication happens within days. A new article fetches the candidates in its 4 buckets, about 14M / 65,536 ≈ 214 per bucket, so ~850 XOR-and-popcount checks taking microseconds, and joins the cluster of the closest match. At query time, Elasticsearch field collapsing on <code>cluster_id</code> returns the best-ranked copy of each story with a count of the others." },
        { t: "p", html: "<b>C. Ranking and time-based layout.</b> Relevance sort uses a <code>function_score</code> query: BM25 over <code>title^3</code> and <code>body</code>, multiplied by a Gaussian decay on <code>published_at</code> (for example, the score halves at about 2 days) and by a function of source authority. Publish dates come from <code>article:published_time</code> meta tags or JSON-LD <code>datePublished</code>, then sitemap news tags, falling back to <code>first_seen_at</code>; dates in the future are clamped, which stops sites from gaming recency. <b>Index layout:</b> one index per day of ~16 GB with one primary shard, inside the common 10–50 GB per-shard guideline. The query service targets only the indices its date filter covers, so a “last 7 days” search touches 7 shards rather than all 1,825 daily indices. After 30 days, index lifecycle management moves an index to cheaper warm nodes and force-merges it; the archive beyond a year can sit on searchable snapshots in object storage." },
        { t: "h", text: "7. Trade-offs and bottlenecks" },
        { t: "table", head: ["Decision", "Chosen", "Alternative", "Why"], rows: [
          ["Source of truth", "S3 article store", "Elasticsearch only", "Reindexing and recovery need no recrawl"],
          ["Ordering", "External versioning by fetched_at", "Last write wins", "Late or replayed events cannot overwrite newer content"],
          ["Index layout", "Daily indices routed by first_seen_at", "One big index", "Date filters touch few shards; old data moves to cheap tiers"],
          ["Near-duplicates", "SimHash with 4-block lookup, 7-day window", "Exact hash of the body", "Syndicated copies differ in boilerplate and small edits"],
          ["Ranking", "BM25 × recency decay × authority", "BM25 alone", "News relevance depends on freshness and source quality"],
          ["Bottleneck at spikes", "Autoscaled extractors, bulk indexing", "Fixed pool", "Breaking news multiplies both crawl volume and queries"]
        ] }
      ],
      followups: [
        "A major event brings 20x normal crawl volume and 50x normal queries at once. What protects freshness and query latency?",
        "How would you add entity pages, such as every article about one company?",
        "An editor says a correction took 20 minutes to appear in search. Trace where that time could have gone.",
        "How would you support Japanese and Chinese, where words are not separated by spaces?",
        "How would you personalize ranking without losing the ability to cache popular queries?"
      ]
    }
  ]
};
