module.exports = {
  id: "caching",
  num: 5,
  part: 2,
  title: "Caching and CDNs",
  tagline: "Make reads fast and cheap without serving stale lies.",
  level: "Intermediate",
  lessons: [
    {
      id: "why-cache",
      title: "Why cache, where caches live, and hit ratio math",
      minutes: 9,
      blocks: [
        { t: "p", html: "A <b>cache</b> is a smaller, faster store that holds copies of data whose source of truth lives somewhere slower: a database, another service, or an origin server across an ocean. Caches work because real access patterns are skewed. A small fraction of items (the popular products, the celebrity profiles, today's news) receive most of the reads, and an item read once is likely to be read again soon. Keep that hot fraction close and fast, and most requests never touch the slow system." },
        { t: "p", html: "Caching buys three things. <b>Latency</b>: a memory lookup is orders of magnitude faster than a query that joins tables or a round trip to another continent. <b>Throughput and cost</b>: every hit is a request the database never sees, so one cache node can stand in for many database replicas. <b>Availability</b>: a cache that can serve slightly stale data keeps the product working while the origin is slow or down. The price is always the same: a cache is a copy, and copies go stale." },
        { t: "numbers", items: [
          { value: "~100 ns", label: "Lookup in an in-process hash map" },
          { value: "~0.2–1 ms", label: "Redis GET over the network in the same AZ" },
          { value: "~5–50 ms", label: "Database query with joins, or one that touches disk" },
          { value: "~100–300 ms", label: "Fetching from an origin on another continent" }
        ] },
        { t: "h", text: "Where caches live" },
        { t: "p", html: "A single request can pass through half a dozen caches. Each layer trades freshness and control for speed: the closer a cache is to the user, the faster and cheaper it is, but the harder it is to invalidate." },
        { t: "table", head: ["Layer", "Examples", "Typical latency", "Shared by", "Invalidation"], rows: [
          ["Browser / client", "HTTP cache, service worker, mobile app storage", "0 ms (no request)", "One user", "Hard: you can only set headers in advance"],
          ["CDN edge", "CloudFront, Akamai, Fastly, Cloudflare", "~10–30 ms from the user", "All users near a PoP", "Purge API or versioned URLs"],
          ["Reverse proxy", "Nginx <code>proxy_cache</code>, Varnish", "~1 ms inside the DC", "All users of a site", "Purge, TTL"],
          ["In-process", "Caffeine, Guava, Python <code>functools.lru_cache</code>", "~100 ns", "One app instance", "Per instance: short TTL or broadcast"],
          ["Distributed cache", "Redis, Memcached, ElastiCache", "~0.5 ms", "All app instances", "Explicit delete, TTL"],
          ["Database", "PostgreSQL <code>shared_buffers</code>, InnoDB buffer pool, OS page cache", "~µs once the query runs", "All queries", "Automatic: the DB keeps it consistent"]
        ] },
        { t: "diagram", caption: "Each layer catches some requests so the next layer sees fewer; the database should see only the leftovers.", code: `flowchart LR
  B["Browser cache"] -->|"miss"| CDN["CDN edge"]
  CDN -->|"miss"| RP["Reverse proxy<br/>Nginx or Varnish"]
  RP -->|"miss"| App["App server<br/>in-process cache"]
  App -->|"miss"| R[("Redis")]
  R -->|"miss"| DB[("Database<br/>buffer pool")]
  DB -->|"miss"| Disk[("Disk")]` },
        { t: "h", text: "Hit ratio math" },
        { t: "p", html: "The <b>hit ratio</b> h is the fraction of lookups served from the cache. If a cache lookup costs <code>t_cache</code> and a miss costs the lookup plus the backend call <code>t_db</code>, the average latency is <code>h x t_cache + (1 - h) x (t_cache + t_db)</code>. The backend's load is proportional to the <b>miss ratio</b>, <code>1 - h</code>, which is the number that really matters for capacity." },
        { t: "code", lang: "text", code: `Cache GET = 1 ms, DB query = 20 ms, traffic = 50,000 reads/s

hit ratio   avg latency                       DB load
  80%       0.8 x 1 + 0.2 x 21  = 5.0 ms      10,000 QPS
  90%       0.9 x 1 + 0.1 x 21  = 3.0 ms       5,000 QPS
  99%       0.99 x 1 + 0.01 x 21 = 1.2 ms        500 QPS

Going from 90% to 99% looks like +9 points.
It is really a 10x cut in database load.` },
        { t: "p", html: "Hit ratio depends on how much of the <b>working set</b> (the items read in a typical window) fits in memory. With skewed traffic, a cache holding 20% of the items often serves 80% or more of the reads, which is how you size cache memory (Chapter 3). TTLs that are too short, cache keys that include needless variation (a timestamp, a tracking parameter) and constant invalidation all push the hit ratio down." },
        { t: "callout", kind: "tip", title: "What to cache, and what not to", html: "Good candidates are read often, change rarely, and are expensive to compute: product details, user profiles, rendered fragments, configuration, results of heavy aggregations. Poor candidates are written more often than read, unique per request, or must be exactly current, such as an account balance used to approve a payment. A read-to-write ratio of 10:1 or higher is a good sign that caching will pay off." },
        { t: "callout", kind: "interview", title: "Name the five parameters", html: "Whenever you add a cache in an interview, state: <b>what</b> is cached, the <b>key</b>, the <b>TTL</b>, the expected <b>hit ratio</b> and what that does to database load, and how it is <b>invalidated</b>. <em>Cache product JSON in Redis under product:id, TTL one hour plus jitter, deleted on update; at 95% hits the DB sees 5k of 100k reads per second.</em>" }
      ]
    },
    {
      id: "cache-patterns",
      title: "Caching patterns: who reads, who writes",
      minutes: 11,
      blocks: [
        { t: "p", html: "Every caching pattern answers two questions: on a read miss, <b>who loads the data</b> into the cache, and on a write, <b>what happens to the cache</b>. The answers decide how stale data can get, what happens when the cache fails, and how much code you write." },
        { t: "h", text: "Cache-aside (lazy loading)" },
        { t: "p", html: "In <b>cache-aside</b>, the application talks to both the cache and the database. On a read it checks the cache; on a miss it reads the database and writes the result into the cache with a TTL. On a write it updates the database and then <em>deletes</em> the cache entry, so the next reader loads a fresh copy. It is the most common pattern by far (it is what most teams mean by putting Redis in front of PostgreSQL), because the cache holds only data that is actually requested, and a cache outage degrades into slower reads rather than errors." },
        { t: "code", lang: "python", code: `import json, random

TTL = 3600

def get_product(pid):
    key = f"product:{pid}"
    cached = redis.get(key)
    if cached is not None:
        return json.loads(cached)                    # hit
    row = db.query_one("SELECT * FROM products WHERE id = %s", pid)
    if row is not None:
        ttl = TTL + random.randint(0, 300)           # jitter, see failure modes
        redis.set(key, json.dumps(row), ex=ttl)
    return row

def update_product(pid, fields):
    db.execute("UPDATE products SET ... WHERE id = %s", pid)
    redis.delete(f"product:{pid}")                   # invalidate, do not set` },
        { t: "p", html: "Why delete instead of writing the new value? If two writers update the same row, their cache writes can arrive in the opposite order to their database commits and leave the older value cached indefinitely. A delete is idempotent and order-independent: whatever happens, the next read loads whatever the database holds. Deleting also avoids paying to cache values that may never be read." },
        { t: "h", text: "Read-through" },
        { t: "p", html: "In <b>read-through</b>, the application asks only the cache, and the cache itself loads missing entries from the database through a loader you configure. Caffeine's <code>LoadingCache</code> in Java and Amazon DynamoDB Accelerator (DAX) work this way. The logic is identical to cache-aside, but it lives in one library instead of being repeated at every call site, and the library can coalesce concurrent misses for the same key." },
        { t: "h", text: "Write-through" },
        { t: "p", html: "In <b>write-through</b>, every write goes to the cache and the database synchronously, and the write succeeds only when both do. The cache is always warm for recently written data, though two racing writers can still update it in a different order than the database. Writes become slower (two writes on the critical path), the cache fills with data that may never be read, and you still need a TTL or invalidation for writes that bypass the cache. DAX is write-through for DynamoDB." },
        { t: "h", text: "Write-behind (write-back)" },
        { t: "p", html: "In <b>write-behind</b>, the application writes only to the cache and gets an immediate acknowledgement; the cache flushes changes to the database asynchronously, often batched. Writes are very fast and the database sees a fraction of the write load (100 increments of a counter can become one <code>UPDATE</code>). The danger is durability: if the cache node dies before flushing, acknowledged writes are gone. Use it for data you can afford to lose or rebuild, such as view counters, likes and analytics events." },
        { t: "diagram", caption: "Write-behind acknowledges before the database has the data, so anything not yet flushed is lost if the cache node fails.", code: `sequenceDiagram
  participant A as App
  participant C as Cache
  participant D as Database
  A->>C: INCR views for video 42
  C-->>A: OK, acknowledged immediately
  A->>C: INCR views for video 42
  C-->>A: OK
  loop every 5 seconds
    C->>D: UPDATE videos SET views = views + 2
    D-->>C: committed
  end
  Note over C,D: crash before a flush loses unflushed increments` },
        { t: "h", text: "Write-around and refresh-ahead" },
        { t: "p", html: "In <b>write-around</b>, writes go straight to the database and do not touch the cache; data enters the cache only when someone reads it (usually via cache-aside). This keeps write-once, rarely-read data such as logs, audit records and bulk imports from flushing useful entries out of the cache. The first read after a write is always a miss." },
        { t: "p", html: "In <b>refresh-ahead</b>, the cache reloads an entry <em>before</em> it expires if it has been accessed recently, for example when 80% of its TTL has passed. Popular keys then never expire under load, so users never wait on a miss for them. The cost is extra backend calls for entries that may not be read again, and it only helps when you can predict which keys will be needed. Caffeine's <code>refreshAfterWrite</code> and CDN <code>stale-while-revalidate</code> are both forms of it." },
        { t: "table", head: ["Pattern", "Read miss handled by", "On write", "Main risk", "Good fit"], rows: [
          ["Cache-aside", "Application", "Update DB, delete key", "Brief staleness from races; first read is slow", "General-purpose default"],
          ["Read-through", "Cache library or service", "Usually paired with write-through or delete", "Tied to the library's loader model", "Teams wanting one shared cache layer"],
          ["Write-through", "Cache (read-through)", "Cache and DB synchronously", "Slower writes; caches unread data", "Read-after-write heavy data, such as user settings"],
          ["Write-behind", "Cache", "Cache now, DB later in batches", "Data loss on cache failure", "Counters, likes, metrics"],
          ["Write-around", "Application on later read", "DB only", "Miss on first read", "Write-once, rarely read data"],
          ["Refresh-ahead", "Cache, before expiry", "Any of the above", "Wasted refreshes", "Hot keys with predictable reads"]
        ] },
        { t: "callout", kind: "example", title: "Facebook's look-aside memcache", html: "Facebook's 2013 paper <em>Scaling Memcache at Facebook</em> describes memcache as a demand-filled look-aside cache: web servers read from memcache, fall back to MySQL on a miss, and populate the cache. On writes they update the database and <em>delete</em> the key rather than updating it, precisely because deletes are idempotent." },
        { t: "callout", kind: "interview", title: "Pick per data type", html: "A strong answer uses different patterns for different data in the same design: <em>cache-aside with delete-on-write for product details, write-behind for view counts because losing a few seconds of counts is fine, and no cache at all for inventory decrements at checkout.</em>" }
      ]
    },
    {
      id: "eviction-lru",
      title: "Eviction policies and building an LRU cache",
      minutes: 11,
      blocks: [
        { t: "p", html: "A cache has finite memory, so when it is full and a new item arrives, something must go. The <b>eviction policy</b> picks the victim, and a good one keeps the items most likely to be read again. Eviction is different from <b>expiry</b>: a TTL removes an item because it might be stale, while eviction removes a perfectly valid item because of space." },
        { t: "table", head: ["Policy", "Evicts", "Strength", "Weakness", "Where you see it"], rows: [
          ["LRU", "Least recently used item", "Simple; great for recency-driven traffic", "One big scan flushes hot items", "Memcached (segmented LRU), Redis <code>allkeys-lru</code>"],
          ["LFU", "Least frequently used item", "Keeps steadily popular items; scan resistant", "Old favourites linger without aging; more bookkeeping", "Redis <code>allkeys-lfu</code>, CDNs"],
          ["FIFO", "Oldest inserted item", "Trivial and cheap", "Evicts hot items just because they are old", "Simple buffers, some hardware caches"],
          ["Random", "Any item", "No metadata at all", "Unpredictable hit ratio", "Redis <code>allkeys-random</code>"],
          ["TTL-first", "Item closest to expiry", "Respects freshness hints", "Ignores popularity", "Redis <code>volatile-ttl</code>"],
          ["W-TinyLFU", "Admits new items only if likely more popular than the victim", "Near-optimal hit ratios on real workloads", "More complex", "Caffeine (Java); Ristretto (Go) uses a TinyLFU variant"]
        ] },
        { t: "h", text: "LRU in O(1): hash map plus doubly linked list" },
        { t: "p", html: "An LRU cache needs two operations in constant time: find an item by key, and move an item to the front of a recency order (or drop the item at the back). A hash map gives the first; a <b>doubly linked list</b> gives the second. The map stores <code>key -&gt; node</code>, and the list orders nodes from most recently used (next to the head) to least recently used (next to the tail). Two sentinel nodes at the ends remove the edge cases for empty lists." },
        { t: "diagram", caption: "The map jumps straight to any node; the list keeps recency order, so the eviction victim is always the node next to the tail.", code: `flowchart LR
  subgraph M["Hash map"]
    KA["key a"]
    KB["key b"]
    KC["key c"]
  end
  H["Head sentinel"] <--> NA["Node a<br/>most recent"]
  NA <--> NB["Node b"]
  NB <--> NC["Node c<br/>least recent"]
  NC <--> T["Tail sentinel"]
  KA -.-> NA
  KB -.-> NB
  KC -.-> NC` },
        { t: "code", lang: "python", code: `class Node:
    def __init__(self, key=None, val=None):
        self.key, self.val, self.prev, self.next = key, val, None, None
class LRUCache:
    def __init__(self, capacity):
        self.cap, self.map = capacity, {}
        self.head, self.tail = Node(), Node()        # sentinels
        self.head.next, self.tail.prev = self.tail, self.head
    def _unlink(self, n):
        n.prev.next, n.next.prev = n.next, n.prev
    def _push_front(self, n):                         # after head = most recent
        n.prev, n.next = self.head, self.head.next
        self.head.next.prev = n
        self.head.next = n
    def get(self, key):
        n = self.map.get(key)
        if n is None:
            return None
        self._unlink(n)
        self._push_front(n)                           # touch: now most recent
        return n.val
    def put(self, key, val):
        if key in self.map:
            self._unlink(self.map[key])
        n = self.map[key] = Node(key, val)
        self._push_front(n)
        if len(self.map) > self.cap:                  # evict least recent
            lru = self.tail.prev
            self._unlink(lru)
            del self.map[lru.key]` },
        { t: "p", html: "Both <code>get</code> and <code>put</code> are O(1): a map lookup plus a few pointer swaps. The list must be <em>doubly</em> linked because unlinking a node from the middle needs its predecessor, and a singly linked list would need an O(n) walk to find it. The node stores its own key so that eviction can delete the map entry. In production Python you would use <code>collections.OrderedDict</code> (<code>move_to_end</code>, <code>popitem(last=False)</code>), and in Java a <code>LinkedHashMap</code> with access order; both are this same structure inside." },
        { t: "h", text: "LFU and scan resistance" },
        { t: "p", html: "LRU's weakness is a <b>scan</b>: a nightly job that reads every product once makes millions of one-off items most recent and evicts the genuinely hot ones. LFU counts accesses instead, so one read does not outrank a thousand. An O(1) LFU keeps a map from frequency to a list of keys plus a pointer to the minimum frequency. Pure LFU never forgets, so last month's viral item stays forever; practical versions decay counts over time. Caffeine's W-TinyLFU combines a small LRU window for new items with a compact frequency sketch that decides whether a newcomer deserves to evict an existing item." },
        { t: "h", text: "How Redis evicts" },
        { t: "p", html: "Redis evicts only when <code>maxmemory</code> is set, according to <code>maxmemory-policy</code>. It does not keep an exact LRU list (that would cost memory per key); instead it samples a few keys (<code>maxmemory-samples</code>, default 5) and evicts the best candidate among them, which approximates LRU closely. Its LFU mode, added in Redis 4.0, uses an 8-bit logarithmic counter per key that decays over time. The <code>volatile-*</code> policies only consider keys that have a TTL; the <code>allkeys-*</code> policies consider everything." },
        { t: "code", lang: "text", code: `# redis.conf for a pure cache node
maxmemory 24gb                 # leave headroom below physical RAM
maxmemory-policy allkeys-lfu   # or allkeys-lru
maxmemory-samples 10           # better accuracy, slightly more CPU` },
        { t: "callout", kind: "warn", title: "The default policy is not a cache policy", html: "Redis defaults to <code>noeviction</code>: once memory is full, writes fail with an OOM error instead of evicting anything. The <code>volatile-lru</code> family has a similar trap: if your keys have no TTL, there is nothing it is allowed to evict, and it behaves like <code>noeviction</code>. For a cache, set an <code>allkeys-*</code> policy explicitly." },
        { t: "callout", kind: "interview", title: "LRU is a classic coding question", html: "Implementing an LRU cache shows up in both coding and design rounds. Explain the two structures and why each is needed before writing code, mention the sentinel trick, and then discuss what changes at scale: per-key memory overhead, approximate LRU in Redis, and when LFU beats LRU." }
      ]
    },
    {
      id: "invalidation",
      title: "Invalidation and consistency",
      minutes: 10,
      blocks: [
        { t: "p", html: "Once data lives in two places, the copies can disagree. The cache does not know the database changed unless something tells it or a timer runs out. Designing a cache is therefore really designing how stale data is allowed to get, for how long, and for whom." },
        { t: "h", text: "Invalidation strategies" },
        { t: "table", head: ["Strategy", "How it works", "Staleness bound", "Cost and risk"], rows: [
          ["TTL only", "Entries expire after a fixed time", "Up to the TTL", "Zero coordination; short TTLs lower the hit ratio"],
          ["Delete on write", "Writer deletes the key after the DB commit (cache-aside)", "Usually milliseconds", "Missed if the writer crashes between commit and delete; race below"],
          ["Update on write", "Writer sets the new value (write-through)", "Milliseconds", "Concurrent writers can set out of order"],
          ["Event-driven (CDC)", "A consumer tails the DB log and deletes affected keys", "Typically under a second", "More infrastructure; catches every write, even from scripts"],
          ["Versioned keys", "Key includes a version: <code>product:42:v7</code>; a write bumps the version", "None for readers who look up the new version", "Needs the current version from somewhere; old versions expire via TTL"]
        ] },
        { t: "p", html: "In practice you combine them: explicit invalidation for freshness, and a TTL on every entry as a safety net so that any bug, missed event or race heals itself within a bounded time." },
        { t: "h", text: "The cache-aside race" },
        { t: "p", html: "Even delete-on-write has a window. A reader misses, reads the old row, and is delayed (a GC pause, a slow network). Meanwhile a writer commits a new value and deletes the key. Then the delayed reader writes its old value into the cache, where it stays until the TTL expires." },
        { t: "diagram", caption: "The stale value is set after the delete, so it survives until the TTL; this is why every entry still needs a TTL.", code: `sequenceDiagram
  participant R as Reader
  participant C as Cache
  participant D as Database
  participant W as Writer
  R->>C: GET product 42
  C-->>R: miss
  R->>D: SELECT product 42
  D-->>R: price 100, old value
  W->>D: UPDATE price to 90
  W->>C: DEL product 42
  R->>C: SET product 42 price 100
  Note over R,C: stale price 100 cached until the TTL expires` },
        { t: "list", items: [
          "<b>Keep a TTL</b> on every key to cap how long the stale value can live.",
          "<b>Leases</b>: on a miss the cache hands the reader a token, and a delete invalidates outstanding tokens, so the late <code>SET</code> is rejected. Facebook's memcache uses leases for exactly this race and for thundering herds.",
          "<b>Versioned writes</b>: store a version with the value and use a small Lua script so a <code>SET</code> only succeeds if its version is newer than the cached one.",
          "<b>Delayed double delete</b>: delete again a few hundred milliseconds after the write. Cheap, but it only narrows the window."
        ] },
        { t: "h", text: "Dual writes and change data capture" },
        { t: "p", html: "Updating the database and then deleting the key is a <b>dual write</b>: two systems, no shared transaction. If the process crashes between the two, or the delete times out, the cache stays stale until TTL. Writes from migrations, admin scripts or other services skip the delete entirely. The robust fix is to drive invalidation from the database's own commit log with <b>change data capture</b> (CDC): Debezium reads the PostgreSQL WAL or MySQL binlog and publishes row changes to Kafka, and an invalidator service deletes the affected cache keys and purges CDN objects. Every committed change produces an invalidation, in commit order, no matter who wrote it." },
        { t: "diagram", caption: "Driving invalidation from the commit log catches every write, including ones that never went through the app.", code: `flowchart LR
  App["App servers"] -->|"UPDATE"| DB[("PostgreSQL")]
  Admin["Admin scripts"] -->|"UPDATE"| DB
  DB -->|"WAL stream"| Deb["Debezium"]
  Deb --> K[["Kafka topic<br/>product changes"]]
  K --> Inv["Invalidator"]
  Inv -->|"DEL product keys"| R[("Redis")]
  Inv -->|"purge by tag"| CDN["CDN"]` },
        { t: "callout", kind: "example", title: "Invalidation from the database log", html: "Facebook's memcache paper describes mcsqueal, a daemon on each database that tails the MySQL commit log and broadcasts deletes to memcache clusters. This removed the need for every web server to issue invalidations correctly." },
        { t: "h", text: "Many layers, many copies" },
        { t: "p", html: "In-process caches multiply the problem: 200 app instances means 200 copies. Options are a very short TTL (1–5 seconds, often good enough for hot keys), broadcasting invalidations over Redis pub/sub or Kafka to every instance, or Redis 6 client-side caching, where the server tracks which keys each client holds and pushes invalidation messages." },
        { t: "callout", kind: "warn", title: "Never decide on cached data that must be exact", html: "Show a cached price on the product page, but compute the charged price from the database at checkout. Show a cached stock level, but decrement inventory transactionally. For read-your-writes (a user edits their profile and immediately reloads it), read that user's own data from the primary for a few seconds after a write, or write-through for their own record." },
        { t: "callout", kind: "interview", title: "Say how stale is acceptable", html: "Interviewers want to hear a staleness budget per data type: <em>descriptions can be a minute stale, prices five seconds, and the checkout total never.</em> Then pair TTL as a safety net with explicit or CDC-based invalidation for freshness." }
      ]
    },
    {
      id: "cache-failure-modes",
      title: "Stampedes, penetration, avalanches and hot keys",
      minutes: 12,
      blocks: [
        { t: "p", html: "A cache does not just speed things up; it reshapes load. A database tuned for 5% of traffic will collapse if it suddenly sees 100%. Four failure modes cause most cache-related outages, and interviewers ask about all of them." },
        { t: "table", head: ["Problem", "What happens", "Main fixes"], rows: [
          ["Stampede (thundering herd, dogpile)", "A hot key expires and thousands of concurrent misses hit the DB to rebuild the same value", "Lock or lease per key, request coalescing, serve stale while revalidating, probabilistic early expiry"],
          ["Penetration", "Requests for keys that do not exist always miss, so every one reaches the DB", "Negative caching, Bloom filter of valid keys, input validation"],
          ["Avalanche", "Many keys expire together, or the cache cluster fails, and the DB takes the full load", "TTL jitter, replicated cache, circuit breakers, warm-up before traffic"],
          ["Hot key", "One key gets so many reads that its single cache shard saturates", "Local in-process cache, key replication across shards, read replicas"]
        ] },
        { t: "h", text: "Stampede" },
        { t: "p", html: "Suppose the homepage feed key is read 20,000 times per second and takes 200 ms to rebuild. When it expires, roughly 4,000 requests miss during those 200 ms, and each runs the same expensive query. The database slows down, the rebuild takes longer, more requests pile up, and the system can tip over. The fixes all make sure only one caller rebuilds a key while the others wait or get the old value:" },
        { t: "list", items: [
          "<b>Per-key lock</b>: the first miss runs <code>SET lock:key token NX PX 5000</code>; the winner rebuilds, the others briefly wait and re-read, or return the stale value.",
          "<b>Request coalescing</b>: within one process, concurrent misses for the same key share a single in-flight load (Go's <code>singleflight</code>, Nginx <code>proxy_cache_lock</code>, Varnish and CDNs do this for origin fetches).",
          "<b>Serve stale while revalidating</b>: keep the value past its soft expiry, return it immediately, and refresh in the background.",
          "<b>Probabilistic early expiry</b>: each reader may decide to refresh slightly before expiry, with probability rising as expiry approaches, so one request usually refreshes early and the herd never forms."
        ] },
        { t: "code", lang: "python", code: `import asyncio

inflight = {}                                   # key -> Future for the load in progress

async def get_coalesced(key, load):
    val = await cache.get(key)
    if val is not None:
        return val
    if key in inflight:                         # someone is already loading it
        return await inflight[key]
    fut = asyncio.get_running_loop().create_future()
    inflight[key] = fut
    try:
        val = await load(key)                   # exactly one DB call per key
        await cache.set(key, val, ex=300)
        fut.set_result(val)
        return val
    except Exception as e:
        fut.set_exception(e)                    # waiters see the same error
        raise
    finally:
        del inflight[key]` },
        { t: "p", html: "Probabilistic early expiration (the XFetch algorithm) needs no locks at all. Store the value with the time it took to compute (<code>delta</code>); on every read, refresh early if the expression below is true. <code>-log(random())</code> is a positive random number, usually small and occasionally large, so the chance of an early refresh grows smoothly as expiry approaches, and slow-to-compute values start refreshing earlier." },
        { t: "code", lang: "python", code: `import math, random, time

def should_refresh(expiry, delta, beta=1.0):
    # delta: seconds the last recompute took; beta above 1 refreshes earlier
    return time.time() - delta * beta * math.log(random.random()) >= expiry` },
        { t: "h", text: "Penetration" },
        { t: "p", html: "If a key does not exist in the database, cache-aside never caches anything for it, so every request for it is a miss that reaches the database. A buggy client or an attacker iterating random product IDs can push thousands of such queries per second. <b>Negative caching</b> stores a short-lived marker for <em>not found</em> (for example a 60-second TTL), so repeated misses become hits. Against random IDs that never repeat, put a <b>Bloom filter</b> of all valid IDs in front: it answers <em>definitely not present</em> with certainty, so invalid requests are rejected without touching the cache or the database. At a 1% false-positive rate it needs about 10 bits per key, around 60 MB for 50 million IDs (the math is in Chapter 14)." },
        { t: "h", text: "Avalanche" },
        { t: "p", html: "An avalanche is a stampede across many keys at once. The classic cause is a bulk load or deploy that writes a million keys with the same one-hour TTL; an hour later they all expire within seconds. The fix is <b>TTL jitter</b>: use <code>TTL + random(0, 10% of TTL)</code> so expiries spread out. The other cause is losing the cache itself: a Redis primary fails, or every app instance restarts with an empty local cache. Defend with replicas and automatic failover, a circuit breaker or rate limit on the database fallback path so it degrades instead of collapsing, and pre-warming the most popular keys before sending traffic to a new cluster." },
        { t: "h", text: "Hot keys" },
        { t: "p", html: "In Redis Cluster each key lives in exactly one hash slot on one shard, so adding shards does nothing for a single key that receives 500,000 reads per second when one node handles roughly 100,000 to 200,000. Three fixes, usually combined: cache the hot key <b>in process</b> on every app server with a 1–5 second TTL so the cache cluster barely sees it; <b>replicate the key</b> under several names (<code>product:42:r0</code> to <code>product:42:r9</code>) that hash to different shards, read a random copy and write or delete all copies; or serve reads from shard <b>replicas</b>. Detect hot keys with per-key sampling on the client side or <code>redis-cli --hotkeys</code> (which requires an LFU policy)." },
        { t: "diagram", caption: "A local cache absorbs most reads of a hot key, and replicated copies spread the rest across shards.", code: `flowchart LR
  A1["App 1<br/>local cache, TTL 2 s"] -->|"random copy"| S1["Shard 1<br/>product 42 copy r0"]
  A2["App 2<br/>local cache, TTL 2 s"] -->|"random copy"| S2["Shard 2<br/>product 42 copy r1"]
  A3["App 3<br/>local cache, TTL 2 s"] -->|"random copy"| S3["Shard 3<br/>product 42 copy r2"]
  A1 -.-> S2
  A2 -.-> S3
  A3 -.-> S1` },
        { t: "callout", kind: "tip", title: "Plan for the cache being empty", html: "Ask what the database sees with a 0% hit ratio. If the answer is an outage, you need a cold-start plan: warm the top keys before switching traffic, ramp traffic gradually, and rate limit fallback queries. A cache whose failure takes down the database has become a critical dependency, not an optimization." },
        { t: "callout", kind: "interview", title: "Match the fix to the failure", html: "Use the precise names: stampede means one hot key expiring (coalescing, locks, early refresh); penetration means keys that do not exist (negative caching, Bloom filter); avalanche means many keys or the whole cache at once (jitter, replicas, breakers); hot key means one key overloading a shard (local cache, replication). Mixing them up is a common way to lose points." }
      ]
    },
    {
      id: "redis-memcached",
      title: "Redis vs Memcached",
      minutes: 11,
      blocks: [
        { t: "p", html: "Redis and Memcached are the two standard distributed caches. Both keep data in RAM, answer simple reads in well under a millisecond, and speak a simple protocol over TCP. They differ in what they store and what they do beyond caching." },
        { t: "compare", items: [
          { title: "Memcached", pros: ["Multithreaded: scales across all cores of one large node", "Very simple, predictable memory use with a slab allocator", "Mature, tiny feature surface"], cons: ["Values are opaque strings, default max item size 1 MB", "No persistence and no built-in replication", "Sharding is done by clients (consistent hashing such as ketama)"], use: "Pure, simple key-value caching of serialized objects where you want maximum throughput per node." },
          { title: "Redis", pros: ["Rich data structures with atomic server-side operations", "Replication, automatic failover (Sentinel) and sharding (Redis Cluster)", "Optional persistence (RDB snapshots, AOF log)", "Pub/sub, streams, Lua scripting, TTL per key"], cons: ["Commands execute on a single main thread per node, so one slow command blocks all", "More operational surface: persistence, failover, cluster topology", "Licensing changed in 2024; the open-source fork Valkey is now offered by major clouds"], use: "The default choice: caching plus counters, leaderboards, rate limiters, sessions, queues and locks." }
        ] },
        { t: "h", text: "Redis data structures and what they are for" },
        { t: "table", head: ["Type", "Key commands", "Typical use"], rows: [
          ["String", "<code>GET</code>, <code>SET ... EX</code>, <code>INCR</code>, <code>SETNX</code>", "Cached JSON, counters, simple locks, rate-limit counters"],
          ["Hash", "<code>HGET</code>, <code>HSET</code>, <code>HINCRBY</code>", "Objects with fields: a user profile, a cart (item to quantity)"],
          ["List", "<code>LPUSH</code>, <code>RPOP</code>, <code>LRANGE</code>, <code>BLPOP</code>", "Recent activity, simple work queues"],
          ["Set", "<code>SADD</code>, <code>SISMEMBER</code>, <code>SINTER</code>", "Unique visitors, tags, mutual friends"],
          ["Sorted set", "<code>ZADD</code>, <code>ZINCRBY</code>, <code>ZREVRANGE</code>, <code>ZRANGEBYSCORE</code>", "Leaderboards, top-K, timelines, sliding-window rate limits, delayed jobs"],
          ["Bitmap", "<code>SETBIT</code>, <code>BITCOUNT</code>", "Daily active flags per user ID: 100M users in about 12 MB"],
          ["HyperLogLog", "<code>PFADD</code>, <code>PFCOUNT</code>", "Approximate unique counts in 12 KB with about 0.81% error"],
          ["Stream", "<code>XADD</code>, <code>XREADGROUP</code>, <code>XACK</code>", "Lightweight event log with consumer groups"],
          ["Geo", "<code>GEOADD</code>, <code>GEOSEARCH</code>", "Nearby drivers or stores (geohash in a sorted set)"]
        ] },
        { t: "h", text: "Persistence" },
        { t: "p", html: "Redis offers two persistence mechanisms, usable together. <b>RDB</b> snapshots fork the process and write a compact point-in-time file every few minutes: fast restarts and good backups, but you lose everything since the last snapshot. <b>AOF</b> (append-only file) logs every write; with the common <code>appendfsync everysec</code> setting you lose at most about one second of writes, at the cost of larger files and periodic rewrites. For a pure cache you may turn persistence off entirely and rebuild from the database, but persistence shortens the cold start after a restart, which helps prevent avalanches." },
        { t: "h", text: "Replication and Redis Cluster" },
        { t: "p", html: "A Redis primary replicates to replicas <b>asynchronously</b>, so a failover can lose the last few writes that had not reached the replica yet (<code>WAIT</code> narrows but does not eliminate this). <b>Redis Sentinel</b> watches a primary and its replicas and promotes a replica when the primary fails. <b>Redis Cluster</b> shards data across several primaries: the key space is split into <b>16,384 hash slots</b>, a key's slot is <code>CRC16(key) mod 16384</code>, and each primary owns a range of slots, with replicas for failover. Clients cache the slot map and are redirected with <code>MOVED</code> (slot has moved for good) or <code>ASK</code> (slot is mid-migration) when it is out of date." },
        { t: "diagram", caption: "Redis Cluster maps every key to one of 16,384 slots; each primary owns a slot range and has a replica ready to take over.", code: `flowchart TD
  C["Cluster-aware client<br/>caches the slot map"] -->|"slot 0 to 5460"| P1["Primary A"]
  C -->|"slot 5461 to 10922"| P2["Primary B"]
  C -->|"slot 10923 to 16383"| P3["Primary C"]
  P1 -.->|"async replication"| R1["Replica A1"]
  P2 -.->|"async replication"| R2["Replica B1"]
  P3 -.->|"async replication"| R3["Replica C1"]` },
        { t: "p", html: "Multi-key commands (<code>MGET</code>, transactions, Lua scripts) work only when all keys are in the same slot; otherwise Redis returns a <code>CROSSSLOT</code> error. <b>Hash tags</b> solve this: only the part inside braces is hashed, so <code>{user:42}:cart</code> and <code>{user:42}:profile</code> land in the same slot. Use them deliberately, because putting too many keys under one tag recreates a hot shard." },
        { t: "numbers", items: [
          { value: "~100k+ ops/s", label: "Simple GET/SET on one Redis node; far more with pipelining" },
          { value: "16,384", label: "Hash slots in Redis Cluster" },
          { value: "512 MB", label: "Maximum size of a single Redis string value" },
          { value: "1 MB", label: "Memcached default maximum item size" }
        ] },
        { t: "callout", kind: "warn", title: "One slow command stalls everyone", html: "Because commands run one at a time, <code>KEYS *</code> on a 50-million-key node, <code>HGETALL</code> on a hash with a million fields, or deleting a huge set blocks every other client for the duration. Use <code>SCAN</code> to iterate, <code>UNLINK</code> to delete large keys in the background, and keep values small (under about 100 KB is a good rule)." },
        { t: "callout", kind: "interview", title: "Choosing between them", html: "If the interviewer asks, pick Redis unless you have a reason not to, and say why: <em>I need sorted sets for the leaderboard and atomic INCR for rate limiting, plus replication for failover.</em> Mention Memcached when the need is only a large, simple, multithreaded object cache. Either way, do not treat Redis as a durable system of record without discussing persistence and async replication loss." }
      ]
    },
    {
      id: "cdn",
      title: "CDNs and HTTP caching",
      minutes: 12,
      blocks: [
        { t: "p", html: "A <b>content delivery network</b> (CDN) is a fleet of caching reverse proxies in hundreds of <b>points of presence</b> (PoPs) around the world, close to users. A user in Sydney fetching an image from an origin in Virginia pays about 200 ms of round trip per request; from a Sydney PoP, about 10 ms. The CDN also absorbs most of the bandwidth (often 90–99% of bytes for static content), shields the origin from traffic spikes and DDoS attacks, and terminates TLS near the user. Major providers include Akamai, Cloudflare, Fastly, Amazon CloudFront and Google Cloud CDN." },
        { t: "compare", items: [
          { title: "Pull CDN", pros: ["Zero upload step: the edge fetches from origin on the first miss", "Only requested content is stored", "Works with any origin, including dynamic APIs"], cons: ["First request per PoP is slow", "Origin must handle miss traffic and stay available"], use: "The default for websites, APIs and user-generated content with long-tail popularity." },
          { title: "Push CDN", pros: ["Content is on the edge before the first request", "Origin traffic is predictable"], cons: ["You manage uploads, updates and deletes", "Storage cost for content nobody requests"], use: "Large, known files released on a schedule: game patches, software downloads, video catalogs." }
        ] },
        { t: "h", text: "Cache keys" },
        { t: "p", html: "The <b>cache key</b> decides which requests share a cached response. By default it is roughly scheme, host, path and full query string. Every variation you let into the key splits the cache: <code>?utm_source=mail</code>, reordered parameters, or a session cookie can turn one cached object into thousands of near-duplicates and push the hit ratio toward zero. Normalize at the edge: sort query parameters, strip tracking parameters, ignore cookies for public content, and include only the headers that truly change the response. The <code>Vary</code> header tells caches to key on a request header; <code>Vary: Accept-Encoding</code> is fine, but <code>Vary: User-Agent</code> or <code>Vary: Cookie</code> effectively disables shared caching." },
        { t: "h", text: "TTLs and Cache-Control" },
        { t: "table", head: ["Directive", "Meaning"], rows: [
          ["<code>max-age=N</code>", "Any cache may reuse the response for N seconds"],
          ["<code>s-maxage=N</code>", "Overrides max-age for shared caches (CDNs, proxies) only; browsers ignore it"],
          ["<code>public</code> / <code>private</code>", "Shared caches may store it / only the user's own browser may store it"],
          ["<code>no-cache</code>", "May be stored, but must be revalidated with the origin before every use"],
          ["<code>no-store</code>", "Must not be stored anywhere: use for sensitive responses"],
          ["<code>immutable</code>", "The content at this URL will never change; skip revalidation"],
          ["<code>stale-while-revalidate=N</code>", "Serve a stale copy for up to N seconds while fetching a fresh one in the background"],
          ["<code>stale-if-error=N</code>", "Serve a stale copy for up to N seconds if the origin errors or is down"]
        ] },
        { t: "p", html: "When a cached copy expires, a cache can <b>revalidate</b> instead of downloading again: it sends <code>If-None-Match</code> with the stored <code>ETag</code> (or <code>If-Modified-Since</code>), and the origin answers <code>304 Not Modified</code> with no body if nothing changed." },
        { t: "code", lang: "http", code: `# Fingerprinted static asset: cache for a year, never revalidate
GET /static/app.3f9a1c.js
HTTP/1.1 200 OK
Cache-Control: public, max-age=31536000, immutable

# Product API: browsers 30 s, CDN 5 min, serve stale during refresh or outage
GET /api/products/42
HTTP/1.1 200 OK
Cache-Control: public, max-age=30, s-maxage=300, stale-while-revalidate=60, stale-if-error=86400
ETag: "p42-v17"
Surrogate-Key: product-42 category-shoes

# Personalized page: never in a shared cache
GET /account
HTTP/1.1 200 OK
Cache-Control: private, no-store` },
        { t: "h", text: "Purging and versioned URLs" },
        { t: "p", html: "There are two ways to change content that a CDN has cached. <b>Purging</b> (invalidation) tells every PoP to drop an object: Fastly's purges complete globally in around 150 ms, CloudFront invalidations take longer and are billed per path beyond a free monthly allowance. Purging by <b>tag</b> (Fastly surrogate keys, Akamai cache tags, Cloudflare cache tags) drops every object labelled, say, <code>product-42</code> in one call. <b>Versioned URLs</b> avoid purging entirely: put a content hash or version in the file name (<code>app.3f9a1c.js</code>), cache it forever with <code>immutable</code>, and reference the new name from HTML when it changes. This is the standard for static assets because browser caches cannot be purged at all; only the short-lived HTML that points to them needs to be fresh." },
        { t: "h", text: "Origin shield" },
        { t: "p", html: "With 300 PoPs each missing independently, a new popular object can cause 300 origin fetches, and a purge causes another 300. An <b>origin shield</b> (CloudFront Origin Shield, Fastly shielding, Cloudflare Tiered Cache, Akamai tiered distribution) adds a mid-tier cache in one region: edge PoPs fetch from the shield, and only the shield fetches from origin. Combined with request collapsing at the shield, the origin sees about one request per object per TTL, and the overall hit ratio rises." },
        { t: "diagram", caption: "Edges miss into a shield, so the origin sees roughly one fetch per object instead of one per PoP.", code: `flowchart LR
  U1(("Users Tokyo")) --> E1["Edge PoP Tokyo"]
  U2(("Users Paris")) --> E2["Edge PoP Paris"]
  U3(("Users Sao Paulo")) --> E3["Edge PoP Sao Paulo"]
  E1 -->|"miss"| S["Origin shield<br/>us-east, collapses requests"]
  E2 -->|"miss"| S
  E3 -->|"miss"| S
  S -->|"miss, about 1 per object"| O["Origin<br/>S3 or app servers"]` },
        { t: "h", text: "Edge compute" },
        { t: "p", html: "Modern CDNs run your code at the PoP: Cloudflare Workers, Fastly Compute, CloudFront Functions and Lambda@Edge, Akamai EdgeWorkers. Typical uses are cache-key normalization, redirects and A/B bucketing, authentication of signed URLs or JWTs, geo-based routing, header rewrites, image format negotiation and assembling pages from cached fragments. Keep edge logic small and fast; heavy work and anything needing the primary database still belongs at the origin." },
        { t: "callout", kind: "example", title: "Netflix runs its own CDN", html: "Netflix built Open Connect, its own CDN, and places Open Connect appliances (storage-heavy cache servers) inside ISP networks and at internet exchange points. It pre-positions popular titles during off-peak hours, so nearly all video bytes are served from inside or next to the viewer's ISP." },
        { t: "callout", kind: "interview", title: "What to say about the CDN", html: "Do not stop at <em>put a CDN in front</em>. Say what is cached at the edge and for how long, how the cache key is normalized, how updates propagate (versioned URLs for assets, tag purges for content), whether there is an origin shield, and what the origin load is at the expected hit ratio." }
      ]
    }
  ],
  takeaways: [
    "Backend load is proportional to the miss ratio: going from 90% to 99% hits cuts database load 10x.",
    "Cache-aside is the default: read cache, on miss read DB and set with a TTL; on write, update DB then delete the key rather than setting it.",
    "Write-through keeps the cache warm at the cost of write latency; write-behind is fast but loses unflushed writes, so use it only for data like counters.",
    "LRU is a hash map plus a doubly linked list for O(1) get and put; LFU or W-TinyLFU resists scans; set Redis to an allkeys-* policy for caches.",
    "Every cache entry needs a TTL as a safety net; drive invalidation from the commit log (CDC) when correctness matters, and never decide payments on cached data.",
    "Stampede: coalesce or lock per key and serve stale while refreshing. Penetration: negative caching and Bloom filters. Avalanche: TTL jitter and replicas. Hot key: local cache and key replication.",
    "Pick Redis for data structures, replication and clustering; Redis Cluster hashes keys into 16,384 slots and needs hash tags for multi-key operations.",
    "Use versioned URLs with max-age one year and immutable for static assets; use s-maxage, stale-while-revalidate and tag purges for content at the CDN.",
    "Normalize CDN cache keys and avoid Vary on high-cardinality headers; add an origin shield so the origin sees about one fetch per object.",
    "Always ask what happens at a 0% hit ratio: if the database falls over, you need warm-up, rate-limited fallbacks and a replicated cache."
  ],
  mcqs: [
    {
      q: "A Redis lookup takes 1 ms and a database query takes 20 ms. On a miss the app checks Redis and then queries the DB. With a 95% hit ratio, what is the average read latency?",
      options: ["About 1.05 ms", "About 2 ms", "About 5 ms", "About 10.5 ms"],
      answer: 1,
      explain: "Average = 0.95 x 1 + 0.05 x (1 + 20) = 0.95 + 1.05 = 2.0 ms. The tempting 1.05 ms forgets that each miss also pays the cache lookup and the full DB query.",
      level: "medium"
    },
    {
      q: "At constant traffic, you improve the cache hit ratio from 90% to 99%. What happens to the load on the database?",
      options: ["It drops by about 9%", "It roughly halves", "It drops about 10x", "It drops about 100x"],
      answer: 2,
      explain: "Database load follows the miss ratio, which goes from 10% to 1%, a 10x reduction. This is why small improvements in an already high hit ratio matter so much for capacity.",
      level: "easy"
    },
    {
      q: "In the cache-aside pattern, what happens on a read miss?",
      options: ["The application queries the database, then stores the result in the cache", "The cache loads the value from the database itself, on the application's behalf", "The database pushes the row into the cache through a trigger on the table", "The application returns an error and a background job fills the cache later"],
      answer: 0,
      explain: "In cache-aside the application owns both steps: read the DB on a miss and populate the cache. When the cache does the loading itself, that is read-through.",
      level: "easy"
    },
    {
      q: "With cache-aside, why do teams usually <em>delete</em> the cache key after updating the database instead of writing the new value into the cache?",
      options: ["Redis replicates a DEL to replicas synchronously but a SET only asynchronously", "A SET without an expiry argument makes the key expire at once, so readers never see it", "Redis refuses to overwrite a key that still has a TTL until that TTL runs out", "Racing writers can update the cache in the wrong order and leave a stale value behind"],
      answer: 3,
      explain: "Two writers may commit in one order and update the cache in the other, leaving stale data until the TTL. Deleting makes the next reader load whatever the database holds, regardless of ordering, and avoids caching values nobody reads.",
      level: "medium"
    },
    {
      q: "What is the main risk of a write-behind (write-back) cache?",
      options: ["Every read has to go to the database first, so read latency gets worse", "Acknowledged writes are lost if the cache fails before it flushes them", "Every write waits for both cache and database, doubling write latency", "It needs a two-phase commit between the cache and the database"],
      answer: 1,
      explain: "Write-behind acknowledges writes once they are in the cache and flushes later, so a crash loses whatever has not been flushed. Waiting for the database on every write is the cost of write-through, which write-behind avoids.",
      level: "medium"
    },
    {
      q: "A service writes millions of audit records per day; they are rarely read, and when they are, it is weeks later. Which write strategy best protects the cache's hit ratio for other data?",
      options: ["Write-through, writing to the cache and the database together", "Write-behind, writing to the cache and flushing to the database later", "Write-around, writing to the database only and caching on read", "Refresh-ahead, reloading cached records before their TTL expires"],
      answer: 2,
      explain: "Write-around keeps write-once, rarely read data out of the cache, so it does not evict hot entries. Write-through would flood the cache with records nobody reads, and write-behind risks losing audit data.",
      level: "medium"
    },
    {
      q: "An O(1) LRU cache uses a hash map plus a linked list. Why must the list be <em>doubly</em> linked?",
      options: ["To unlink any node in O(1), which needs a pointer to its predecessor", "So eviction can scan from both ends of the list to find the least recent entry", "To allow head and tail sentinel nodes, which singly linked lists cannot have", "To hold the key and the value in two separate pointers on each node"],
      answer: 0,
      explain: "On every hit the node moves to the front, which means removing it from wherever it is. Without a prev pointer you would walk the list to find the predecessor, making each operation O(n).",
      level: "hard"
    },
    {
      q: "Every night a reporting job reads every product once, and each morning the cache hit ratio for real users has collapsed. The cache uses LRU. Which change helps most?",
      options: ["Increase the TTL on product keys so hot entries live longer in the cache", "Switch to FIFO, which evicts keys strictly in the order they were inserted", "Lower <code>maxmemory</code> so the scanned keys are evicted before morning", "Switch to LFU or W-TinyLFU, which rank keys by how often they are read"],
      answer: 3,
      explain: "Under LRU, a scan makes every one-off item most recent and evicts the hot set. LFU-style policies count frequency, so items read once cannot displace items read thousands of times. Better still, let the batch job bypass the cache.",
      level: "medium"
    },
    {
      q: "A homepage key read 20,000 times per second expires, and the database is hit by thousands of identical rebuild queries at once. Which fix targets this directly?",
      options: ["Put a Bloom filter of valid keys in front of the cache to screen requests", "Coalesce requests or take a per-key lock so only one request reloads the value", "Add random jitter to every key's TTL so expiries spread out over time", "Replicate the key under several names so its reads spread across shards"],
      answer: 1,
      explain: "This is a cache stampede on one key; coalescing or a lock limits rebuilds to one, while other callers wait or get the stale value. Bloom filters address penetration, TTL jitter addresses many keys expiring together (avalanche), and key replication addresses read throughput on a hot key.",
      level: "medium"
    },
    {
      q: "A scraper requests random product IDs that do not exist. Each one misses the cache and queries the database. What is the best defence?",
      options: ["Increase the cache size so more product keys stay resident in memory", "Switch eviction to LFU so frequently requested IDs are kept longer", "Cache not-found results briefly and screen IDs with a Bloom filter", "Use write-through so every product is cached as soon as it is written"],
      answer: 2,
      explain: "This is cache penetration. Negative caching turns repeated misses into hits, and a Bloom filter rejects IDs that are definitely absent without touching the database. A bigger cache or a different eviction policy does nothing for keys that never get cached.",
      level: "medium"
    },
    {
      q: "A nightly job loads 2 million keys into Redis, all with a TTL of exactly 3,600 seconds. About an hour later the database spikes. What is the simplest fix?",
      options: ["Add random jitter to each TTL so the keys expire at different times", "Shorten the TTL to 600 seconds so keys reload more often", "Set expiries with <code>PEXPIRE</code> so they are precise to the millisecond", "Switch Redis to <code>volatile-ttl</code> so keys nearest expiry are evicted first"],
      answer: 0,
      explain: "Identical TTLs make all keys expire together, a cache avalanche. Adding jitter (for example plus 0 to 10% of the TTL) spreads the misses over time. A shorter TTL just causes the same spike more often, millisecond precision still expires every key at the same moment, and eviction policies only act under memory pressure.",
      level: "easy"
    },
    {
      q: "One product key receives 600,000 reads per second during a flash deal and saturates its Redis Cluster shard. Why does adding more shards not help, and what does?",
      options: ["New shards need hours to migrate slots; move the shard to a larger instance type", "The cluster is limited to 16,384 operations per second per slot; raise the slot count", "Cluster clients read from replicas by default; disable replica reads on the client", "A key maps to one slot on one shard; cache it in process and copy it under several keys"],
      answer: 3,
      explain: "Sharding spreads different keys, not a single key, so one hot key still lands on one node. A short-TTL local cache absorbs most reads, and copies such as product:42:r0 to r9 spread the remainder across shards. 16,384 is the number of slots, not a throughput limit.",
      level: "hard"
    },
    {
      q: "In Redis Cluster, a Lua script that updates <code>user:42:cart</code> and <code>user:42:total</code> fails with a <code>CROSSSLOT</code> error. What is the right fix?",
      options: ["Wrap the commands in <code>MULTI</code>/<code>EXEC</code> instead of running a Lua script", "Raise the hash slot count so that both keys can fit in the same slot", "Use a hash tag in both names: <code>{user:42}:cart</code>, <code>{user:42}:total</code>", "Run the script with <code>EVAL</code> on each primary that owns one of the keys"],
      answer: 2,
      explain: "Multi-key operations in Redis Cluster require all keys in one slot. With a hash tag, only the text inside braces is hashed, so both keys share a slot. MULTI/EXEC has the same same-slot restriction, and the slot count is fixed at 16,384.",
      level: "hard"
    },
    {
      q: "After a deploy, some users keep getting the old <code>app.js</code> for a day, because it is cached with <code>max-age=86400</code>. What is the best long-term practice?",
      options: ["Use content-hashed names like <code>app.3f9a1c.js</code>, cached for a year as <code>immutable</code>", "Serve all JavaScript with <code>no-store</code> so browsers always fetch the latest file", "Keep the same file name and purge the CDN cache as the last step of every deploy", "Lower <code>max-age</code> on JavaScript to 60 seconds so old copies expire quickly"],
      answer: 0,
      explain: "A new file name is a new cache key, so every client fetches the new version as soon as the HTML references it, while unchanged files stay cached forever. Purging cannot reach browser caches, and short or no caching throws away performance.",
      level: "easy"
    },
    {
      q: "An API response has <code>Cache-Control: public, max-age=60, s-maxage=600</code>. How long may the browser and the CDN serve it without revalidating?",
      options: ["Both for 600 seconds, because s-maxage overrides max-age everywhere", "Both for 60 seconds; s-maxage only controls how long stale copies may be served", "The CDN for 60 seconds and the browser for 600 seconds", "The browser for 60 seconds and the CDN for 600 seconds"],
      answer: 3,
      explain: "s-maxage applies only to shared caches and overrides max-age there; private browser caches ignore it and use max-age. This split lets a CDN absorb traffic for longer while browsers check back sooner.",
      level: "hard"
    }
  ],
  design: [
    {
      id: "design-product-page-cache",
      title: "Design caching for a product page serving 100k RPS",
      level: "Medium",
      prompt: "An e-commerce site has 50 million products. At peak the product detail page gets 100,000 page views per second, with heavily skewed popularity and occasional flash deals where one product gets a large share of all traffic. Each page shows details (title, images, description, specs), price and stock, and a review summary. Prices and stock change about 2,000 times per second across the catalog. Design the caching so pages are fast, the database survives, and users never pay a stale price.",
      clarify: [
        "How fresh must each part be: description, price, stock level, reviews?",
        "Is the page personalized, or is most of it identical for every user in a region?",
        "Do prices vary by region, currency or customer segment?",
        "What does the database handle today, and what is the read/write mix?",
        "How hot can one product get during a flash deal?",
        "Are there bots or scrapers hitting product URLs?"
      ],
      hints: [
        "Split the page by freshness: data that changes hourly and data that changes every second should not share a cache entry or a TTL.",
        "Count the layers: what fraction can the CDN absorb, what reaches the app tier, what reaches Redis, and what reaches the database?",
        "Think about how an update in the database reaches Redis and every CDN PoP, including updates made outside the app.",
        "Plan for the flash-deal product: one key, tens of thousands of reads per second, and an expiry at the worst moment. And plan for bots requesting IDs that do not exist."
      ],
      solution: [
        { t: "h", text: "Requirements" },
        { t: "list", items: [
          "<b>Functional</b>: serve product details, price and stock, and review summary for any of 50M products; reflect admin and price updates.",
          "<b>Non-functional</b>: 100k page views/s at peak; API p99 under 100 ms at origin; details may be up to 60 s stale, price and stock up to 5 s, reviews minutes; the price charged at checkout is always current; survive a flash deal and a cache node failure."
        ] },
        { t: "h", text: "Estimates" },
        { t: "code", lang: "text", code: `Edge: 100k page views/s, each = 1 details call + 1 offer call
  details  s-maxage 60 s   ~90% CDN hit  -> 10k RPS to origin
  offer    s-maxage 5 s    ~60% CDN hit  -> 40k RPS to origin
  (HTML shell, JS, CSS and images: versioned URLs, ~100% CDN hit)

Origin app tier: 50k RPS
  L1 in-process cache, hottest ~20k products, TTL 2 s, ~50% hit
  -> 25k Redis reads/s, Redis hit ~98% -> ~500 DB reads/s

Redis memory: hot 20% of catalog = 10M products x 5 KB = 50 GB
  x 1.3 overhead = 65 GB -> 4 shards x ~16 GB, 1 replica each
  (throughput is easy: 25k ops/s vs ~100k per node)

Writes: 2k price/stock changes/s -> 2k Redis DELs/s + CDN tag purges
App servers: 50k RPS / ~2k RPS per instance (mostly hits) = 25 -> 40` },
        { t: "h", text: "API" },
        { t: "code", lang: "http", code: `GET /api/v1/products/{id}
    Cache-Control: public, max-age=30, s-maxage=60, stale-while-revalidate=300
    Surrogate-Key: product-{id}
GET /api/v1/products/{id}/offer?region=us
    Cache-Control: public, max-age=0, s-maxage=5, stale-if-error=60
GET /api/v1/products/{id}/reviews/summary
    Cache-Control: public, s-maxage=600
POST /api/v1/cart/items          -> never cached, reads live price from DB
PUT  /internal/products/{id}     -> admin update, invalidation via CDC` },
        { t: "h", text: "Data model" },
        { t: "table", head: ["Store", "Key or table", "Contents", "TTL / notes"], rows: [
          ["PostgreSQL", "<code>products</code>", "id, title, description, attributes JSONB, image_urls, version, updated_at", "Source of truth; read replicas for cache misses"],
          ["PostgreSQL", "<code>offers</code>", "product_id, region, price_cents, currency, stock, version", "Updated by pricing and inventory services"],
          ["Redis", "<code>product:{id}</code>", "Serialized details JSON with version", "1 h + 0–6 min jitter; deleted on change"],
          ["Redis", "<code>offer:{id}:{region}</code>", "Price and stock JSON", "10 s; deleted on change"],
          ["Redis", "<code>nf:product:{id}</code>", "Not-found marker", "60 s negative cache"],
          ["App memory", "Bloom filter of valid product IDs", "50M IDs at 1% false positives, about 60 MB", "Rebuilt hourly, new IDs added on create"]
        ] },
        { t: "h", text: "High-level design" },
        { t: "diagram", caption: "Reads fall through CDN, local cache and Redis before reaching PostgreSQL; writes flow back out through CDC to Redis and the CDN.", code: `flowchart LR
  U(("Shoppers")) --> CDN["CDN edge<br/>s-maxage and SWR"]
  CDN --> Sh["Origin shield"]
  Sh --> LB["Load balancer"]
  LB --> App["Product API<br/>L1 cache and Bloom filter"]
  App --> R[("Redis Cluster<br/>4 shards")]
  App --> DB[("PostgreSQL<br/>primary and replicas")]
  DB -.->|"WAL"| Deb["Debezium"]
  Deb -.-> K[["Kafka"]]
  K -.-> Inv["Invalidator"]
  Inv -.->|"DEL keys"| R
  Inv -.->|"purge by surrogate key"| CDN` },
        { t: "p", html: "<b>Read path</b>: the browser loads a cached HTML shell and assets from the CDN, then calls the details and offer APIs. Most details calls are CDN hits; misses go through the origin shield to the product API, which checks the Bloom filter, its in-process cache, then Redis, then a PostgreSQL replica, populating each layer on the way back. <b>Write path</b>: the pricing service updates <code>offers</code> in PostgreSQL. Debezium streams the change to Kafka; the invalidator deletes <code>offer:42:us</code> in Redis and purges surrogate key <code>product-42</code> at the CDN. App instances' 2-second local TTL bounds their staleness without any broadcast." },
        { t: "h", text: "Deep dives" },
        { t: "p", html: "<b>1. Split by freshness, and keep checkout honest.</b> Bundling price into the details object would force the whole object to a 5-second TTL and a purge 2,000 times per second. Splitting gives details a 60-second edge TTL with <code>stale-while-revalidate</code> (users almost never wait on a miss) and gives the small offer object a 5-second TTL. The displayed price can be up to about 5 seconds stale, so cart and checkout read the price from the database (or the pricing service) and show a notice if it changed. Cached data is for display; decisions use the source of truth." },
        { t: "p", html: "<b>2. Invalidation that cannot be skipped.</b> Deleting keys from application code would miss bulk price imports and scripts, and would leave stale data if a process crashed between commit and delete. CDC from the WAL produces an invalidation for every committed change, in order. The cache-aside race (a slow reader setting an old value after the delete) is handled by storing the row version with the value and using a Lua script that refuses to overwrite a newer version, with the TTL as a final safety net. CDN objects are tagged with surrogate keys, so one purge removes the product's details from every PoP in well under a second on providers such as Fastly." },
        { t: "p", html: "<b>3. Flash deals: stampede and hot key.</b> If one product takes 30% of traffic, that is 30k details and offer requests per second. At the edge, the CDN and shield collapse concurrent misses into one origin fetch, and <code>stale-while-revalidate</code> means expiry never causes a wait. At origin, the in-process cache serves the product from memory on all 40 instances, so Redis sees at most about 20 reads per second for it (one per instance per 2-second TTL); single-flight loading ensures each instance makes only one Redis call per expiry. If needed, the deal service writes copies <code>offer:42:us:r0</code> to <code>r7</code> across shards." },
        { t: "p", html: "<b>4. Bots and missing IDs.</b> Scrapers iterating IDs would turn every request into a database query. The Bloom filter rejects IDs that are definitely invalid with a 404 before any cache lookup; the roughly 1% that slip through hit a 60-second negative cache entry after the first miss. Rate limiting per client at the edge handles the rest." },
        { t: "h", text: "Trade-offs and bottlenecks" },
        { t: "table", head: ["Decision", "Benefit", "Cost"], rows: [
          ["Separate details and offer objects", "Long TTL for most bytes, short TTL only where needed", "Two requests per page instead of one"],
          ["CDC-based invalidation", "Catches every write, in order", "Debezium and Kafka to operate; invalidation lag of a few hundred ms"],
          ["In-process L1 cache", "Kills hot-key load on Redis", "Up to 2 s extra staleness; memory per instance"],
          ["CDN caching of API responses", "90% of details traffic never reaches origin", "Personalized data must stay out of shared responses"],
          ["Redis sized for the hot 20%", "65 GB instead of 325 GB", "Long-tail products miss more often; replicas absorb them"]
        ] },
        { t: "list", items: [
          "Remaining risk: losing a Redis shard drops about 25% of hot data at once; replicas with automatic failover and a rate-limited fallback to read replicas keep the database safe.",
          "Watch the CDN purge rate limits: 2,000 purges per second may exceed a provider's API limits, so batch purges per second or rely on the 5-second TTL for offers and purge only details."
        ] }
      ],
      followups: [
        "Prices become personalized per customer segment. How does that change what can be cached at the CDN?",
        "The Kafka consumer for invalidations falls 10 minutes behind. What do users see, and how do you detect and limit it?",
        "How would you warm the cache for a new region launch?",
        "Redis Cluster loses a primary during peak. Walk through what happens to latency and database load.",
        "How would you measure that the cache is actually helping, and what dashboards would you build?"
      ]
    },
    {
      id: "design-image-cdn",
      title: "Design an image CDN and resizing service",
      level: "Medium",
      prompt: "A marketplace stores 300 million user-uploaded photos and adds 1 million per day. Web and mobile clients need each image in many sizes and formats (thumbnails, product gallery, full screen; JPEG, WebP, AVIF). Design a service that serves resized images on demand from a URL, globally and quickly, without precomputing every variant, while keeping costs and abuse under control.",
      clarify: [
        "How many image views per second at peak, and from which regions?",
        "Which sizes and formats do clients really need: a fixed set of presets or arbitrary dimensions?",
        "Can images be edited or replaced, and must deletions (for example legal takedowns) disappear quickly?",
        "Are some images private, requiring signed or authenticated access?",
        "What are the size limits on uploads (bytes and pixels)?",
        "Is there a latency target for the first view of a brand-new variant?"
      ],
      hints: [
        "Think in cache tiers: browser, edge, shield, a durable store of generated variants, and only then the resizer.",
        "If anyone can request any width, how many cache keys can an attacker create? Restrict and sign the transformation parameters.",
        "Format negotiation via the Accept header can explode the cache. How can the edge turn it into a small, fixed part of the cache key?",
        "Make URLs immutable by putting a version in them. Then decide what a deletion still requires."
      ],
      solution: [
        { t: "h", text: "Requirements" },
        { t: "list", items: [
          "<b>Functional</b>: upload originals; serve <code>/i/{id}/v{version}/{preset}.{format}</code> resized, cropped and encoded on demand; replace an image (new version); delete an image everywhere.",
          "<b>Non-functional</b>: p95 under 50 ms for cached variants worldwide; first render of a new variant under 1 s; 99.9% availability; deleted images gone from CDN within minutes; resistant to cache-busting and decompression-bomb abuse."
        ] },
        { t: "h", text: "Estimates" },
        { t: "code", lang: "text", code: `Storage: 300M originals x 2 MB = 600 TB, +1M/day x 2 MB = +2 TB/day
Views:   3B/day / 86,400 = ~35k RPS average, ~100k RPS peak
Egress:  100k RPS x 60 KB average variant = 6 GB/s = ~48 Gbps at the edge

Tiered hit ratios at peak
  edge 95%           -> 5k RPS to the shield
  shield 80%         -> 1k RPS to origin
  variant store 70%  -> 300 RPS need a real resize

Resize cost (libvips: decode 2 MB JPEG, resize, encode WebP) ~150 ms CPU
  300 x 0.15 s = 45 cores busy -> 12 x 8-vCPU instances at ~50% utilization
  AVIF encoding is several times slower -> separate, autoscaled pool

Variant store: 60M images with variants x 4 variants x 50 KB = ~12 TB` },
        { t: "h", text: "API" },
        { t: "code", lang: "http", code: `POST   /v1/images
       -> 201 { imageId, version: 1, uploadUrl: presigned S3 PUT URL }
GET    /i/{imageId}/v{version}/{preset}.{format}?sig={hmac}
       e.g. /i/8f3k2a/v3/w400-cover.webp?sig=9c1e...
       -> 200 image bytes, Cache-Control: public, max-age=86400, s-maxage=31536000
          Surrogate-Key: img-8f3k2a
PUT    /v1/images/{imageId}      -> new original, version + 1
DELETE /v1/images/{imageId}      -> delete originals and variants, purge CDN tag` },
        { t: "h", text: "Data model" },
        { t: "table", head: ["Item", "Store", "Shape", "Why"], rows: [
          ["Image metadata", "DynamoDB, key <code>imageId</code>", "owner, current version, width, height, mime, bytes, status, created_at", "Simple key lookups at high scale; used by upload and delete paths, not the hot read path"],
          ["Originals", "S3 <code>originals/{imageId}/v{version}</code>", "Original bytes", "Derivable from the URL, so the resizer needs no DB lookup"],
          ["Variants", "S3 <code>variants/{imageId}/v{version}/{preset}.{format}</code>", "Encoded output", "Durable second-level cache; lifecycle rule expires objects 90 days after creation"],
          ["Presets", "Config file shipped with the resizer", "<code>w400-cover</code>: 400 px wide, crop to fill, quality 80", "A small fixed set keeps the cache key space bounded"]
        ] },
        { t: "h", text: "High-level design" },
        { t: "diagram", caption: "A request falls through edge, shield and the variant store; only the leftovers pay for a real resize, which is saved for next time.", code: `flowchart LR
  U(("Browser or app")) --> Edge["CDN edge PoP<br/>edge function"]
  Edge -->|"miss"| Sh["Origin shield"]
  Sh -->|"miss"| Rz["Resizer fleet<br/>libvips, single-flight"]
  Rz -->|"1. check"| VS[("S3 variant store")]
  Rz -->|"2. on miss, read"| OS[("S3 originals")]
  Rz -.->|"3. save variant"| VS
  Cl["Client upload"] --> Up["Upload API"]
  Up --> Meta[("DynamoDB<br/>image metadata")]
  Cl -->|"presigned PUT"| OS` },
        { t: "p", html: "<b>Upload</b>: the client asks the upload API for an image ID and a presigned URL, then PUTs the original directly to S3; a validation job checks the format and pixel count and marks the image active. <b>Read</b>: the edge function verifies the HMAC signature, maps the <code>Accept</code> header to one of <code>avif</code>, <code>webp</code> or <code>jpeg</code> and rewrites the URL so the format is part of the cache key. On a miss the shield forwards one collapsed request to the resizer, which checks the variant store, and otherwise reads the original, resizes it, returns it and saves it." },
        { t: "h", text: "Deep dives" },
        { t: "p", html: "<b>1. A bounded, normalized cache key.</b> If clients could request any width, quality and crop, an attacker could generate billions of distinct URLs, each a guaranteed miss and a CPU-heavy resize. Instead, allow only named presets (say 12) and sign URLs with an HMAC over the path, issued by the app servers that render pages. For format negotiation, <code>Vary: Accept</code> would split the cache by every distinct Accept string browsers send; normalizing Accept at the edge to three values and baking the format into the key keeps at most 3 variants per preset. The resulting key space is 12 presets x 3 formats per image version." },
        { t: "p", html: "<b>2. Four cache tiers and request coalescing.</b> Browser cache (one day), edge (one year, immutable URLs), shield, and the S3 variant store, which matters because CDNs evict long-tail objects; regenerating from S3 costs a GET, while regenerating by resizing costs 150 ms of CPU. When a seller shares a new listing and thousands of people open it at once, every PoP misses together: shield request collapsing turns those into one origin request per variant, and the resizer's single-flight map (keyed by variant path) ensures one resize even if two shields ask at once." },
        { t: "p", html: "<b>3. Updates and deletions.</b> Because the version is in the URL, replacing an image creates new URLs; old variants are never served for the new version and simply age out, so no purge is needed. Deletion is different: the delete API marks the metadata deleted, removes the S3 originals and variants, and purges surrogate key <code>img-8f3k2a</code>, removing every variant from every PoP in one call. Browser caches cannot be purged, which is why the browser max-age is one day rather than one year; for takedown-sensitive content you can lower it further." },
        { t: "p", html: "<b>4. Protecting the resizer.</b> A 2 MB PNG can decode to 20,000 x 20,000 pixels (1.6 GB of RAM): reject originals above about 50 megapixels at upload, set per-request memory and time limits, and isolate the slow AVIF pool so it cannot starve JPEG and WebP work. If the resizer is overloaded, the edge can fall back to the nearest larger existing variant rather than failing." },
        { t: "h", text: "Trade-offs and bottlenecks" },
        { t: "list", items: [
          "<b>On-demand vs precomputed variants</b>: on-demand stores only what is requested (12 TB instead of potentially 300M x 36 variants) but makes the first view slower; precompute the two or three presets used on every listing page at upload time.",
          "<b>Presets vs arbitrary sizes</b>: presets bound the cache and the attack surface; arbitrary sizes give designers freedom. Signed URLs let you allow a few custom sizes safely.",
          "<b>Variant store cost vs CPU</b>: storing 12 TB costs a few hundred dollars per month; regenerating evicted variants would cost far more CPU and add latency.",
          "<b>AVIF vs WebP</b>: AVIF is smaller (often 20–30% fewer bytes) but much slower to encode; serve WebP while AVIF is generated asynchronously for popular images.",
          "<b>Bottleneck</b>: egress is the dominant cost at 48 Gbps, so hit ratio and format choice drive the bill more than compute does."
        ] }
      ],
      followups: [
        "Some images are private (only the buyer and seller may see them). How do you serve them through the CDN?",
        "A viral image gets 50k requests per second within a minute of upload. Walk through every tier.",
        "How would you add smart cropping that keeps faces or products in frame?",
        "How would you migrate 300M originals to a new storage class to save cost without breaking URLs?",
        "How do you measure and improve the edge hit ratio for the long tail of rarely viewed images?"
      ]
    }
  ]
};
