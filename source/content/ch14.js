// Chapter 14 · Advanced Techniques and Data Structures (Part 6 — Advanced Toolkit)

const lessons = [
  // ---------------------------------------------------------------- Lesson 1
  {
    id: "unique-ids",
    title: "Unique ID generation",
    minutes: 14,
    blocks: [
      { t: "p", html: "On a single database, <code>AUTO_INCREMENT</code> or a PostgreSQL <code>BIGSERIAL</code> hands out IDs and you never think about it. Once data is sharded across many databases or written in several regions, there is no single counter to ask. You need IDs that are <b>unique without coordinating on every insert</b>, and you usually want more than uniqueness: a compact size (64 vs 128 bits), rough ordering by creation time so the newest rows sort last, high throughput, and no leakage of business data such as how many orders you took today." },
      { t: "table", head: ["Scheme", "Size", "Time-sortable?", "Coordination", "Main gotcha"], rows: [
        ["Auto-increment (one DB)", "64-bit", "Yes, strictly", "Every insert goes through one writer", "Single point of failure and write bottleneck; leaks volume; breaks when sharded"],
        ["Multi-master step offsets", "64-bit", "Roughly", "Fixed at config time", "Adding a server means re-planning every offset"],
        ["Ticket server (Flickr-style)", "64-bit", "Roughly", "One DB round trip per ID or per batch", "The ticket DB must itself be made highly available"],
        ["UUID v4", "128-bit, 122 random bits", "No", "None", "Random index inserts; 16 bytes in every index entry"],
        ["UUID v7", "128-bit: 48-bit ms timestamp + 74 random bits", "Yes, to the millisecond", "None", "Still 16 bytes; reveals creation time"],
        ["ULID", "128-bit: 48-bit ms timestamp + 80 random bits", "Yes, as a 26-char string", "None", "Community spec, not an RFC; monotonic mode needs care"],
        ["Snowflake", "64-bit", "Yes, k-sorted", "Worker ID assigned once at startup", "Depends on clocks and on unique worker IDs"]
      ] },
      { t: "h", text: "Auto-increment, step offsets and ticket servers" },
      { t: "p", html: "The cheapest distributed scheme reuses the database counter. With two MySQL masters you set <code>auto_increment_increment = 2</code> on both and <code>auto_increment_offset</code> to 1 and 2, so one issues odd IDs and the other even IDs. A <b>ticket server</b> takes this further: a dedicated database whose only job is to hand out numbers, which application servers call before inserting rows anywhere. Both give compact 64-bit integers, but each ID (or batch) costs a network round trip to a component you now have to keep highly available. A common refinement is <b>segment allocation</b>: each app server reserves a block of, say, 1,000 IDs with one <code>UPDATE ... SET max_id = max_id + 1000</code> and hands them out from memory, cutting database traffic by 1,000x at the cost of gaps when a server restarts." },
      { t: "callout", kind: "example", title: "Flickr's ticket servers", html: "Flickr generated primary keys for its sharded MySQL databases with two dedicated ticket servers. Getting an ID meant running <code>REPLACE INTO Tickets64 (stub) VALUES ('a')</code> followed by <code>SELECT LAST_INSERT_ID()</code> on a ticket server. One server issued odd numbers and the other even numbers, so either could fail without stopping ID generation." },
      { t: "h", text: "UUIDs and ULIDs" },
      { t: "p", html: "A <b>UUID v4</b> is 128 bits, 122 of them random, so any machine can generate one with no coordination. Collisions are a non-issue in practice: by the birthday bound you need about 2.7 × 10^18 UUIDs for a 50% chance of a single collision, which is a billion IDs per second for 86 years. The costs are size (16 bytes, often stored as a 36-character string) and randomness: consecutive v4 IDs land in unrelated places in an index. <b>UUID v7</b> (RFC 9562, 2024) fixes the ordering by putting a 48-bit Unix millisecond timestamp in the high bits, followed by random bits, so IDs generated later sort later. <b>ULID</b> is the same idea from before v7 existed: 48 bits of milliseconds plus 80 random bits, written as 26 characters of Crockford base32 that sort lexicographically in time order." },
      { t: "h", text: "Twitter Snowflake" },
      { t: "diagram", caption: "A Snowflake ID packs a millisecond timestamp, a worker ID and a per-millisecond counter into one signed 64-bit integer, with the timestamp in the high bits so IDs sort by time.", code: `flowchart LR
  S["1 bit<br/>sign, always 0"] --- T["41 bits<br/>ms since custom epoch<br/>about 69.7 years"]
  T --- M["10 bits<br/>machine ID<br/>1,024 workers"]
  M --- Q["12 bits<br/>sequence<br/>4,096 IDs per ms"]` },
      { t: "p", html: "Snowflake, which Twitter built in 2010, generates IDs inside each worker process from three ingredients. The top bit stays 0 so the value is positive in signed 64-bit types (Java <code>long</code>, PostgreSQL <code>BIGINT</code>). The next <b>41 bits</b> are milliseconds since a custom epoch: 2^41 ms is about 69.7 years, and choosing a recent epoch (Twitter's is in November 2010, so its IDs last until about 2080) spends none of that range on the past. <b>10 bits</b> identify the worker, allowing 1,024 generators (Twitter split them into 5 bits of data center and 5 of worker). The last <b>12 bits</b> are a sequence that counts up within one millisecond, so each worker can issue <b>4,096 IDs per millisecond</b>, about 4.1 million per second. If the sequence overflows, the generator waits for the next millisecond. IDs are <em>k-sorted</em>: ordered by millisecond across the fleet, as far as worker clocks agree, but within one millisecond they order by worker ID, not by true creation time." },
      { t: "code", lang: "python", code: `import threading, time

EPOCH_MS = 1767225600000               # custom epoch: 2026-01-01T00:00:00Z
MACHINE_BITS, SEQ_BITS = 10, 12
MAX_SEQ = (1 << SEQ_BITS) - 1          # 4095

class Snowflake:
    def __init__(self, machine_id):
        if not 0 <= machine_id < (1 << MACHINE_BITS):    # 0..1023
            raise ValueError("machine_id out of range")
        self.machine_id, self.last_ms, self.seq = machine_id, -1, 0
        self.lock = threading.Lock()

    def next_id(self):
        with self.lock:
            now = time.time_ns() // 1_000_000
            if now < self.last_ms:                       # clock went backwards
                raise RuntimeError("clock moved back; refusing to issue IDs")
            if now == self.last_ms:
                self.seq = (self.seq + 1) & MAX_SEQ
                if self.seq == 0:                        # 4,096 used this ms:
                    while now <= self.last_ms:           # spin to the next ms
                        now = time.time_ns() // 1_000_000
            else:
                self.seq = 0
            self.last_ms = now
            return (((now - EPOCH_MS) << (MACHINE_BITS + SEQ_BITS))
                    | (self.machine_id << SEQ_BITS) | self.seq)

def decode(sid):   # -> (unix_ms, machine_id, sequence)
    return (sid >> 22) + EPOCH_MS, (sid >> 12) & 1023, sid & MAX_SEQ` },
      { t: "callout", kind: "warn", title: "The two ways Snowflake produces duplicates", html: "Snowflake is unique only if (1) no two live workers share a machine ID and (2) a worker's clock never runs backwards. Assign machine IDs from a lease in ZooKeeper or etcd rather than hand-edited config, and make the worker stop issuing IDs if it loses the lease. For clocks, run NTP in slew mode so corrections speed the clock up or slow it down instead of stepping it back, persist the last issued timestamp so a restart cannot reuse it, and on a backward jump either wait it out (a few milliseconds) or refuse and alert." },
      { t: "h", text: "Sortable vs random IDs and index locality" },
      { t: "p", html: "In a B-tree primary key index (and especially a clustered one, like InnoDB's, where the rows live in the index), time-ordered keys always insert at the right-hand edge. The same few leaf pages stay hot in memory, pages fill completely before a new one starts, and range scans by time are cheap. Random UUID v4 keys insert into a random leaf every time: once the index outgrows the buffer pool, most inserts need a disk read first, pages split and stay partly empty, and write throughput can drop several-fold. That is why Snowflake, UUID v7 and ULID exist. The rule flips on <b>range-partitioned distributed stores</b> such as Bigtable, HBase and Spanner: a monotonically increasing key sends every new write to the one tablet that owns the newest range, creating a hot spot, so Spanner's documentation recommends UUID v4 or bit-reversed sequences. Hash-partitioned stores like Cassandra and DynamoDB hash the partition key, so its ordering does not affect how writes spread." },
      { t: "callout", kind: "tip", title: "Send 64-bit IDs to browsers as strings", html: "JavaScript numbers are doubles and represent integers exactly only up to 2^53 (about 9 × 10^15). A Snowflake ID exceeds that once its timestamp passes 2^31 ms, roughly 25 days after the epoch, and <code>JSON.parse</code> silently rounds it to a different ID. Twitter's API added an <code>id_str</code> field for this reason, and Discord sends its Snowflake IDs as strings." },
      { t: "callout", kind: "example", title: "Snowflake variants in production", html: "Discord uses Snowflake-style IDs with an epoch of 1 January 2015 for messages, users and channels. Instagram generated 64-bit IDs inside PostgreSQL with a PL/pgSQL function: 41 bits of milliseconds, 13 bits of logical shard ID and a 10-bit per-shard sequence, so the shard that owns a row can be read straight from its ID." },
      { t: "callout", kind: "interview", title: "How to answer the ID question", html: "State the requirements first: must IDs fit in 64 bits, sort by time, be unguessable? Then pick: Snowflake for compact, time-sorted numeric IDs at high volume; UUID v7 when 128 bits is acceptable and you want zero coordination; UUID v4 or a random token for anything user-facing that must not be enumerable. Mention the two Snowflake risks (worker ID assignment and clock rollback) before the interviewer does." }
    ]
  },

  // ---------------------------------------------------------------- Lesson 2
  {
    id: "probabilistic-structures",
    title: "Probabilistic data structures",
    minutes: 15,
    blocks: [
      { t: "p", html: "Some questions are expensive to answer exactly at scale: <em>have we seen this URL before?</em>, <em>how many times did this hashtag appear?</em>, <em>how many distinct users visited today?</em> An exact answer needs memory proportional to the number of distinct items, which can be billions. <b>Probabilistic data structures</b> (often called sketches) answer with a small, mathematically bounded error in a fixed amount of memory, often kilobytes. Most are also <b>mergeable</b>: you can build one per server or per minute and combine them, which is what makes them fit distributed systems so well." },
      { t: "table", head: ["Structure", "Answers", "Memory", "Error behaviour", "Typical use"], rows: [
        ["Bloom filter", "Is x in the set?", "About 9.6 bits per item for 1% false positives", "False positives only; never a false negative", "Skip disk reads for absent keys, cache penetration guard, already-seen checks"],
        ["Count-Min Sketch", "How often has x appeared?", "Fixed width × depth counters, independent of distinct items", "Overestimates only, by at most εN with probability 1 − δ", "Heavy hitters, hot-key detection, cache admission"],
        ["HyperLogLog", "How many distinct items?", "12 KB in Redis for any cardinality", "About 0.81% standard error, in either direction", "Unique visitors, distinct counts in analytics"]
      ] },
      { t: "h", text: "Bloom filters" },
      { t: "p", html: "A Bloom filter is a bit array of <b>m</b> bits, all initially 0, plus <b>k</b> hash functions that each map an item to a position in the array. To <b>add</b> an item, hash it k times and set those k bits to 1. To <b>query</b>, hash it the same way: if any of the k bits is 0, the item was definitely never added; if all are 1, it was <em>probably</em> added, because other items may have set those bits. So a Bloom filter never gives a false negative, only false positives, and it works as a cheap gatekeeper in front of an expensive lookup." },
      { t: "diagram", caption: "Carol was never added but all her bits were set by Alice and Bob, a false positive; Dave hits a zero bit, which is a definite no.", code: `flowchart LR
  A["add alice"] -->|"3 hashes"| P1["set bits 2, 9, 14"]
  B["add bob"] -->|"3 hashes"| P2["set bits 5, 9, 21"]
  P1 --> BA[("Bit array of m bits")]
  P2 --> BA
  BA --> Q1["query carol:<br/>bits 2, 5, 21"]
  BA --> Q2["query dave:<br/>bits 2, 7, 14"]
  Q1 -->|"all bits are 1"| Maybe["Maybe present:<br/>check the database"]
  Q2 -->|"bit 7 is 0"| Absent["Definitely absent:<br/>skip the lookup"]` },
      { t: "p", html: "After inserting n items, the false-positive probability is approximately <b>p ≈ (1 − e^(−kn/m))^k</b>. For a given m and n it is minimised at <b>k = (m/n) · ln 2</b>, which gives the sizing formula <b>m = −n · ln p / (ln 2)²</b>, about <b>1.44 · log2(1/p) bits per item</b>. Worked example: 100M usernames at 1% need m = 10^8 × 4.605 / 0.4805 ≈ 958M bits ≈ 120 MB, with k = 9.6 × 0.693 ≈ 7 hash functions. Two consequences: the filter size depends only on n and p, not on item size (a 2 KB URL costs the same 9.6 bits as an 8-byte ID), and every 10x reduction in false positives costs another 4.8 bits per item." },
      { t: "table", head: ["Target false-positive rate", "Bits per item", "Hash functions k", "Memory for 100M items"], rows: [
        ["10%", "4.8", "3", "~60 MB"],
        ["1%", "9.6", "7", "~120 MB"],
        ["0.1%", "14.4", "10", "~180 MB"],
        ["0.01%", "19.2", "13", "~240 MB"]
      ] },
      { t: "code", lang: "python", code: `import hashlib, math

class BloomFilter:
    def __init__(self, n, p):
        self.m = math.ceil(-n * math.log(p) / math.log(2) ** 2)   # bits
        self.k = max(1, round(self.m / n * math.log(2)))          # hashes
        self.bits = bytearray((self.m + 7) // 8)

    def _positions(self, item):
        # Kirsch-Mitzenmacher trick: k positions from two hashes, h1 + i*h2
        d = hashlib.sha256(item.encode()).digest()
        h1 = int.from_bytes(d[:8], "big")
        h2 = int.from_bytes(d[8:16], "big") | 1
        return [(h1 + i * h2) % self.m for i in range(self.k)]

    def add(self, item):
        for pos in self._positions(item):
            self.bits[pos // 8] |= 1 << (pos % 8)

    def might_contain(self, item):
        return all(self.bits[pos // 8] & (1 << (pos % 8))
                   for pos in self._positions(item))

bf = BloomFilter(n=1_000_000, p=0.01)   # m = 9,585,059 bits (~1.2 MB), k = 7
bf.add("user:42")
bf.might_contain("user:42")   # True, always
bf.might_contain("user:43")   # False, or True about 1% of the time` },
      { t: "callout", kind: "warn", title: "Bloom filter pitfalls", html: "<b>No deletes</b>: clearing a bit could erase other items, so use a counting Bloom filter (small counters instead of bits) or a cuckoo filter if you need removal. <b>No resizing</b>: the false-positive rate climbs steeply past the planned n; a filter sized for 1% at n items is at about 44% after 3n insertions, so size for growth or rebuild periodically. <b>No enumeration</b>: you cannot list what is inside, only test membership." },
      { t: "h", text: "Count-Min Sketch" },
      { t: "p", html: "A Count-Min Sketch estimates how often each item has appeared in a stream. It is a grid of counters with <b>d</b> rows and <b>w</b> columns, and each row has its own hash function. To count an item, hash it once per row and increment one counter in each row. To estimate its count, read the same d counters and take the <b>minimum</b>. Collisions only ever add other items' counts to a counter, so with non-negative increments every counter is at least the true count and the estimate <b>can only overestimate</b>, never underestimate. Taking the minimum picks the row with the least collision noise." },
      { t: "p", html: "Sizing: with <b>w = ⌈e/ε⌉</b> and <b>d = ⌈ln(1/δ)⌉</b>, the estimate is at most <b>true count + εN</b> with probability at least 1 − δ, where N is the total of all increments. For ε = δ = 0.001 that is 2,719 columns × 7 rows = 19,033 counters, about 76 KB with 4-byte counters, whether the stream holds a thousand distinct keys or a billion. The bound is relative to N, though: over 1 billion events the overestimate can reach 1 million. That is noise for a hashtag seen 50 million times and meaningless for one seen 40 times, which is why Count-Min Sketches are used to find <b>heavy hitters</b>, not to report long-tail counts." },
      { t: "h", text: "HyperLogLog" },
      { t: "p", html: "HyperLogLog (HLL) estimates <b>cardinality</b>, the number of distinct items. The intuition: hash every item to a uniformly random bit string. Half the hashes start with a 0 bit, a quarter with 00, one in 2^k with k zeros, so if the longest run of leading zeros you have seen is 20, you have probably seen around 2^20 distinct items. One such observation is very noisy, so HLL uses the first p bits of each hash to pick one of <b>m = 2^p registers</b>, keeps the maximum leading-zero rank seen in each register, and combines them with a harmonic mean plus bias corrections. The standard error is <b>1.04 / √m</b>. A duplicate hashes identically and cannot raise a register twice, which is why HLL counts distinct items rather than events." },
      { t: "p", html: "Redis implements HLL with p = 14: 16,384 registers of 6 bits each is 12,288 bytes, the well-known <b>12 KB</b>, and 1.04 / √16384 gives <b>0.81% standard error</b> whether the set holds a thousand or a billion members (small sets use a compact sparse encoding). The commands are <code>PFADD</code>, <code>PFCOUNT</code> and <code>PFMERGE</code>. Merging takes the register-wise maximum, so merging seven daily HLLs gives an HLL of the week's distinct visitors, but intersections cannot be computed reliably and you must never <em>sum</em> daily counts to get weekly uniques. Counting 1 billion distinct 8-byte user IDs exactly as a plain set needs about 8 GB; an HLL needs 12 KB." },
      { t: "numbers", items: [
        { value: "~9.6 bits", label: "Per item in a Bloom filter at 1% false positives" },
        { value: "~76 KB", label: "Count-Min Sketch for ε = δ = 0.1%" },
        { value: "12 KB", label: "One Redis HyperLogLog, any cardinality" },
        { value: "0.81%", label: "HyperLogLog standard error in Redis" }
      ] },
      { t: "callout", kind: "example", title: "Where these show up in real systems", html: "Cassandra, HBase and RocksDB keep a Bloom filter per on-disk data file so a read for a missing key skips that file without touching disk (Cassandra exposes this as the per-table <code>bloom_filter_fp_chance</code>). Redis ships HyperLogLog natively, and the RedisBloom module adds Bloom filters and Count-Min Sketches. BigQuery's <code>HLL_COUNT</code> functions implement HyperLogLog++. The Java cache Caffeine decides which entries to admit using a compact Count-Min-style frequency sketch (TinyLFU)." },
      { t: "callout", kind: "interview", title: "When to reach for a sketch", html: "Ask whether the answer must be exact. Unique visitors on a dashboard, trending topics and already-crawled checks tolerate 1% error; billing, inventory and account balances do not. When you propose a sketch, name the error type (Bloom: false positives only; Count-Min: overestimates only; HLL: symmetric, about ±0.81%) and the memory saved, for example 12 KB instead of 8 GB." }
    ]
  },

  // ---------------------------------------------------------------- Lesson 3
  {
    id: "merkle-gossip",
    title: "Merkle trees, gossip and failure detection",
    minutes: 13,
    blocks: [
      { t: "p", html: "Large leaderless clusters such as Cassandra and other Dynamo-style stores (Chapter 7) have two housekeeping problems that no single coordinator should own. Replicas drift apart after missed writes, and they need to find <em>which</em> data differs without shipping terabytes around to compare. And every node needs to know which other nodes are alive. <b>Merkle trees</b> solve the first problem; <b>gossip</b> plus a <b>failure detector</b> solves the second." },
      { t: "h", text: "Merkle trees" },
      { t: "p", html: "A Merkle tree (hash tree) summarises a dataset with hashes. Split the key space into ranges and hash the data in each range to form the <b>leaves</b>. Each parent is the hash of its children's hashes concatenated, up to a single <b>root hash</b>. Changing one value changes its leaf, every ancestor and the root, so two replicas with equal roots hold identical data; with a cryptographic hash, equal roots over different data are vanishingly unlikely." },
      { t: "diagram", caption: "Replicas compare hashes from the root down and only descend into subtrees that differ, so the matching left half is never examined in detail.", code: `flowchart TD
  R["Root hash: differs"] --> L["Left subtree hash: matches"]
  R --> RR["Right subtree hash: differs"]
  L --> A["Range 1: matches"]
  L --> B["Range 2: matches"]
  RR --> C["Range 3: matches"]
  RR --> D["Range 4: differs<br/>stream only these keys"]` },
      { t: "p", html: "To repair, two replicas exchange root hashes. If they match, stop. If not, exchange the children's hashes and recurse only into the children that differ. With 1 million leaf ranges the tree is 20 levels deep, so a single divergent range is located in about 20 steps of comparing two hashes, and then only that range's keys are streamed. Without the tree, replicas would exchange a hash per key or ship the data itself. Leaf size is the main knob: smaller ranges re-send less data per mismatch but make the tree bigger to build and store." },
      { t: "list", items: [
        "<b>Anti-entropy repair</b> in Dynamo, Cassandra (<code>nodetool repair</code> builds trees per token range) and Riak.",
        "<b>Git</b>: a commit points to a tree object whose hash covers its subtrees and file blobs, so diffing two commits skips every subtree whose hash is unchanged.",
        "<b>Inclusion proofs</b>: Certificate Transparency logs and Bitcoin blocks let a client verify that an item belongs to a set of n items with only log2(n) sibling hashes, about 20 hashes for a million entries.",
        "<b>Sync and backup tools</b>: comparing per-directory or per-chunk hash trees tells a client which parts of a large tree changed."
      ] },
      { t: "callout", kind: "warn", title: "Merkle trees are not free", html: "Both replicas must bucket keys into exactly the same ranges, which is natural when ranges follow the token ring but breaks if replicas own different ranges. Building a tree means reading and hashing every row in the range, which is why Cassandra repairs are scheduled, throttled operations rather than continuous ones. Systems that keep the tree current on every write move that hashing cost onto the write path instead." },
      { t: "h", text: "Gossip protocols" },
      { t: "p", html: "In a gossip (epidemic) protocol, every node wakes up periodically, say once per second, picks one or a few random peers, and exchanges a digest of its state: for example a table of node, heartbeat counter, status and version. Each side keeps whichever entry has the higher version. A fact known to one node reaches all N nodes in <b>O(log N) rounds</b>, roughly 10 to 20 one-second rounds for 1,000 nodes, while each node sends a constant number of messages per round regardless of cluster size. There is no coordinator to fail, and a lost message is repaired in the next round. The price is that membership is <b>eventually</b> consistent: different nodes briefly disagree about who is in the cluster." },
      { t: "callout", kind: "example", title: "Gossip in the wild", html: "Cassandra's gossiper runs every second and exchanges state with up to three other nodes, which is how nodes learn about joins, departures, schema versions and token ownership. Redis Cluster nodes ping each other over a dedicated cluster bus and piggyback information about other nodes on those messages. HashiCorp Consul and Serf use the memberlist library, an implementation of the SWIM protocol." },
      { t: "h", text: "Failure detection" },
      { t: "p", html: "A node cannot tell a crashed peer from a slow one or from a broken network link; all it sees is missing messages. A failure detector therefore only ever <em>suspects</em>, and every design trades detection speed against false alarms." },
      { t: "compare", items: [
        { title: "Fixed-timeout heartbeats", pros: ["Trivial to implement and reason about", "Detection time is predictable: timeout plus one interval"], cons: ["One threshold for every network: too short gives false alarms during GC pauses, too long delays failover", "All-to-all heartbeats cost O(N²) messages"], use: "Small clusters and leader-to-follower checks, such as Raft election timeouts." },
        { title: "SWIM-style probing", pros: ["Each node probes one random peer per period, so load per node is constant", "Indirect probes through k other nodes filter out a single bad link", "A suspect state lets a slow node refute the accusation"], cons: ["More protocol states and tuning knobs", "Detection time is probabilistic"], use: "Large, dynamic memberships: Consul, Serf, service discovery agents." },
        { title: "Phi accrual", pros: ["Learns each peer's heartbeat inter-arrival distribution", "Outputs a suspicion level, so each consumer picks its own threshold"], cons: ["Needs a window of heartbeat history per peer", "Thresholds are less intuitive than seconds"], use: "Cassandra and Akka cluster membership, on noisy networks." }
      ] },
      { t: "diagram", caption: "SWIM asks other members to probe a silent node before suspecting it, so one congested link between A and C does not get C declared dead.", code: `sequenceDiagram
  participant A as Node A
  participant B as Node B
  participant D as Node D
  participant C as Node C
  A->>C: ping
  Note over A,C: no ack within the timeout
  A->>B: ping-req for C
  A->>D: ping-req for C
  B->>C: ping
  D->>C: ping
  Note over B,C: no ack via B or D either
  A->>A: mark C as suspect
  A-->>B: gossip that C is suspect
  Note over A,C: C is declared dead unless it refutes before the suspicion timeout` },
      { t: "p", html: "The <b>phi accrual detector</b> (Hayashibara et al., 2004) records the arrival times of a peer's recent heartbeats and models the gaps between them as a probability distribution. At any moment it outputs <b>φ = −log10(P)</b>, where P is the probability that a heartbeat would arrive even later than now given that history. φ = 1 means roughly a 10% chance that suspecting the peer is a mistake, φ = 2 means 1%, φ = 3 means 0.1%. A peer whose heartbeats are normally regular gets suspected quickly; one on a jittery link automatically gets more slack. Cassandra convicts a node when φ exceeds <code>phi_convict_threshold</code>, which defaults to 8." },
      { t: "callout", kind: "interview", title: "Say suspected, then fence", html: "Interviewers like to hear that no failure detector is perfect in an asynchronous network: a node declared dead may still be running and writing. Pair detection with a safety mechanism, such as leases with fencing tokens (Chapter 8) or quorum writes, so a falsely suspected node cannot corrupt data. Then quote the knobs: heartbeat interval, timeout or φ threshold, and the expected detection time." }
    ]
  },

  // ---------------------------------------------------------------- Lesson 4
  {
    id: "geospatial-indexing",
    title: "Geospatial indexing and nearby search",
    minutes: 15,
    blocks: [
      { t: "p", html: "\"Find restaurants within 2 km\" looks like a simple filter: <code>WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?</code>. The problem is that a B-tree indexes one dimension well. An index on <code>(lat, lng)</code> narrows by latitude and then scans every place in that latitude band around the whole planet, a strip 4 km tall and 40,000 km long, to filter by longitude. Two separate indexes are no better: each returns a huge band and the database has to intersect them. Geospatial indexes fix this by mapping 2D space onto <b>cells</b> with IDs that a normal index or key-value store can look up, so that points that are close together usually get nearby IDs." },
      { t: "h", text: "Geohash" },
      { t: "p", html: "A geohash recursively halves the world. The first bit says whether the longitude is in the east or west half, the second bit does the same for latitude, and the bits keep alternating, each one halving the cell. Every 5 bits become one character of a base32 alphabet (<code>0-9</code> and <code>b-z</code> without <code>a i l o</code>). A point in central San Francisco, 37.7749, −122.4194, encodes to <code>9q8yyk8yt</code>. The key property is the <b>prefix</b>: every point inside the cell <code>9q8yyk</code> has a geohash starting with <code>9q8yyk</code>, so \"everything in this cell\" is a B-tree range scan, <code>WHERE geohash &gt;= '9q8yyk' AND geohash &lt; '9q8yym'</code>, on a plain string column in PostgreSQL, DynamoDB or Cassandra. That works because the base32 alphabet is in ASCII order, so string order equals bit order." },
      { t: "table", head: ["Characters", "Cell size at the equator, width × height", "Rough fit for a search radius of"], rows: [
        ["1", "~5,000 km × 5,000 km", "Continent"],
        ["2", "~1,250 km × 625 km", "Large country"],
        ["3", "~156 km × 156 km", "Region, up to ~150 km"],
        ["4", "~39 km × 19.5 km", "Metro area, up to ~20 km"],
        ["5", "~4.9 km × 4.9 km", "Up to ~5 km"],
        ["6", "~1.2 km × 0.6 km", "Up to ~600 m"],
        ["7", "~153 m × 153 m", "Up to ~150 m"],
        ["8", "~38 m × 19 m", "A city block or building"],
        ["9", "~4.8 m × 4.8 m", "A doorway; finer than consumer GPS"]
      ] },
      { t: "p", html: "Each extra character divides a cell by 32, alternating between 8 × 4 and 4 × 8 splits, which is why the shape flips between square and 2:1. East-west widths also shrink with latitude by cos(latitude): at 60° north a precision-6 cell is about 0.6 km wide instead of 1.2 km." },
      { t: "h", text: "The edge problem and the 3 × 3 search" },
      { t: "p", html: "Shared prefixes mean nearness, but nearness does not mean a shared prefix. Two points 10 m apart on either side of the Greenwich meridian (51.4779, +0.00007 and 51.4779, −0.00007) encode to <code>u10hb5</code> and <code>gcpuzg</code>: no common characters at all, because they sit on opposite sides of the very first split. A user standing near the edge of their cell is also closer to places in the next cell than to most places in their own. So a nearby search never queries just the user's cell. It queries the cell plus its <b>8 neighbours</b>, then computes the true distance (haversine) for every candidate and drops those outside the radius." },
      { t: "table", head: ["", "West", "Centre column", "East"], rows: [
        ["North", "<code>9q8yyj</code>", "<code>9q8yym</code>", "<code>9q8yyt</code>"],
        ["Centre row", "<code>9q8yyh</code>", "<code>9q8yyk</code>, the user's cell", "<code>9q8yys</code>"],
        ["South", "<code>9q8yy5</code>", "<code>9q8yy7</code>", "<code>9q8yye</code>"]
      ] },
      { t: "p", html: "Choose the precision so the cell's <em>shorter</em> side is at least the search radius. Then any point within the radius is at most one cell away in each direction, so the 3 × 3 block is guaranteed to contain all of them. For a 500 m search, precision 6 (short side about 600 m) works; for 1 km you must drop to precision 5, because a precision-6 block only guarantees about 600 m of coverage." },
      { t: "h", text: "Quadtrees" },
      { t: "p", html: "Geohash cells are a fixed grid, but places are not spread evenly. A precision-5 cell in Manhattan may hold tens of thousands of businesses while one in Nevada holds none. A <b>quadtree</b> adapts to density instead: start with one node covering the whole map, and whenever a node holds more than a capacity K (say 100 places), split it into four equal quadrants and push its places down. Dense areas end up with many small leaves and empty areas with a few huge ones, so every leaf has at most K places to scan." },
      { t: "diagram", caption: "A quadtree splits only where data is dense: the busy north-east quadrant splits again while the sparse quadrants stay as single leaves.", code: `flowchart TD
  Root["Region: 400 places<br/>over capacity 100, split"] --> NW["NW: 30 places<br/>leaf"]
  Root --> NE["NE: 310 places<br/>over capacity, split"]
  Root --> SW["SW: 12 places<br/>leaf"]
  Root --> SE["SE: 48 places<br/>leaf"]
  NE --> NE1["NE-NW: 95 places<br/>leaf"]
  NE --> NE2["NE-NE: 80 places<br/>leaf"]
  NE --> NE3["NE-SW: 70 places<br/>leaf"]
  NE --> NE4["NE-SE: 65 places<br/>leaf"]` },
      { t: "p", html: "A quadtree usually lives in memory on each search server. Sizing for 200M places with K = 100: at least 2M leaves (more in practice, since leaves are partly full). Each place costs an 8-byte ID plus 16 bytes of latitude and longitude for distance checks, so 200M × 24 bytes ≈ 4.8 GB, plus a few hundred MB of node overhead: about 5 GB, which fits in one server's memory. To search, find the leaf containing the user, then visit neighbouring leaves in order of distance until you have enough results. The costs: building the tree from 200M rows takes minutes, so servers need a warm-up period and a rolling rebuild, and live updates mean splitting and merging nodes under concurrent reads. Many systems just rebuild nightly and accept that a new restaurant appears the next day." },
      { t: "h", text: "Google S2 and Uber H3" },
      { t: "compare", items: [
        { title: "Geohash", pros: ["Simple, plain string keys", "Prefix query is a range scan in any ordered store", "Supported by Redis GEO, Elasticsearch, many libraries"], cons: ["Fixed grid ignores density", "Edge discontinuities need the 3 × 3 trick", "Cell shapes distort toward the poles"], use: "Default for proximity search on a key-value store or relational table." },
        { title: "Quadtree", pros: ["Adapts to density: bounded points per leaf", "Natural k-nearest-neighbour search"], cons: ["In-memory structure to build, update and replicate", "Not a storage key format by itself"], use: "In-memory index for a read-heavy service with very uneven density." },
        { title: "Google S2", pros: ["Projects the sphere onto 6 cube faces, so cells distort far less than lat/lng grids", "64-bit cell IDs ordered along a Hilbert curve, which preserves locality better than geohash's Z-order", "Levels 0 to 30, down to about 1 cm²; any region is covered by a few cells of mixed levels"], cons: ["More complex library and concepts", "Cells are quadrilaterals, so neighbour distances still vary"], use: "Precise coverings of arbitrary regions and polygons, such as delivery zones or geofences." },
        { title: "Uber H3", pros: ["Hexagonal cells: all 6 neighbours are the same distance away", "16 resolutions; k-ring neighbourhoods are easy and uniform"], cons: ["Children do not exactly tile the parent, so the hierarchy is approximate", "12 pentagons per resolution are special cases"], use: "Aggregating and smoothing over areas: supply and demand, surge pricing, heat maps." }
      ] },
      { t: "p", html: "S2 converts a search circle into a <b>covering</b>: a small set of cells of mixed sizes that together contain the circle (S2's region coverer aims for 8 cells by default). Each cell is a contiguous range of 64-bit IDs, so the query becomes a handful of range scans. H3 is the natural choice when the question is about areas rather than points, because hexagons have one kind of neighbour instead of the square grid's edge and corner neighbours. At resolution 9 an H3 hexagon averages about 0.1 km²." },
      { t: "callout", kind: "example", title: "Off-the-shelf geo indexes", html: "Redis stores <code>GEOADD</code> members in a sorted set whose score is a 52-bit geohash, and <code>GEOSEARCH</code> (Redis 6.2+) checks the surrounding cells and filters by distance. MongoDB's <code>2dsphere</code> index is built on S2 cells. PostGIS answers <code>ST_DWithin</code> queries using an R-tree-style GiST index. Uber open-sourced H3 in 2018 after using hexagons to analyse supply, demand and pricing across cities." },
      { t: "callout", kind: "interview", title: "The interview move for nearby search", html: "Explain why a plain lat/lng index fails, pick geohash (or S2) for storage keys, and then say the three details interviewers check: query the 8 neighbouring cells, re-rank candidates by true distance, and handle density by expanding to a coarser precision when results are too few, or switch to a quadtree when density varies wildly. Also note that a store with 200M places is only a few GB of index: it fits in memory, so scale reads with replicas rather than sharding." }
    ]
  },

  // ---------------------------------------------------------------- Lesson 5
  {
    id: "real-time-collaboration",
    title: "Real-time collaboration: OT vs CRDTs",
    minutes: 13,
    blocks: [
      { t: "p", html: "In a collaborative editor every user edits a local copy so typing feels instant, and edits are exchanged in the background. The hard part is concurrency. Start with the text <code>abc</code>. Alice inserts <code>X</code> at position 0 while Bob, at the same moment, deletes position 2 (the <code>c</code>). If each side simply applies the other's operation, Alice applies <em>delete 2</em> to <code>Xabc</code> and removes the <code>b</code>, ending with <code>Xac</code>; Bob applies <em>insert X at 0</em> to <code>ab</code> and gets <code>Xab</code>. The replicas have diverged, and Alice lost a character Bob never deleted. Positions are only meaningful relative to the document version they were created against. The two families of solutions are <b>operational transformation</b> and <b>CRDTs</b>." },
      { t: "h", text: "Operational transformation" },
      { t: "p", html: "OT keeps position-based operations and <b>transforms</b> each incoming operation against the concurrent operations already applied, so it still means what its author intended. Bob's <em>delete 2</em>, transformed past Alice's <em>insert at 0</em>, becomes <em>delete 3</em>, and both sides end with <code>Xab</code>. Production OT systems use a <b>central server</b> that assigns every operation a revision number, which creates one total order. A client sends each operation tagged with the revision it was based on; the server transforms it against everything committed since then, commits it as the next revision and broadcasts it. Clients transform incoming operations against their own pending ones in the same way." },
      { t: "diagram", caption: "The server orders concurrent edits and transforms Bob's delete past Alice's insert, so every replica converges on the same text.", code: `sequenceDiagram
  participant A as Alice
  participant S as Server
  participant B as Bob
  Note over A,B: everyone is at revision 0 with text abc
  A->>S: insert X at 0, based on rev 0
  B->>S: delete at 2, based on rev 0
  S->>S: commit Alice op as rev 1, text Xabc
  S-->>A: ack rev 1
  S-->>B: Alice op as rev 1
  B->>B: transform it past own pending delete, text Xab
  S->>S: transform Bob op past rev 1 into delete at 3
  S->>S: commit as rev 2, text Xab
  S-->>A: delete at 3 as rev 2, text Xab
  S-->>B: ack rev 2` },
      { t: "code", lang: "python", code: `# Transform op against an op that was applied concurrently before it.
# op = (kind, pos, char, site); site IDs break ties between equal positions.
def transform(op, other):
    kind, pos, ch, site = op
    o_kind, o_pos, _, o_site = other
    if o_kind == "ins":
        if o_pos < pos or (o_pos == pos and (kind == "del" or o_site < site)):
            pos += 1                      # text shifted right under us
    else:                                 # other was a delete
        if o_pos < pos:
            pos -= 1                      # text shifted left under us
        elif o_pos == pos and kind == "del":
            return None                   # both deleted the same char: no-op
    return (kind, pos, ch, site)

transform(("del", 2, "c", "bob"), ("ins", 0, "X", "alice"))
# -> ("del", 3, "c", "bob")` },
      { t: "p", html: "Even this two-operation case needs tie-break rules. Real editors also have rich-text formatting, multi-character ranges, undo and cursors, and every pair of operation types needs a transform function. Many published OT algorithms for the peer-to-peer case, with no central server, were later shown to diverge in some corner cases. The central server sidesteps most of that, because operations only ever need to be transformed against one agreed history." },
      { t: "h", text: "CRDTs" },
      { t: "p", html: "A <b>conflict-free replicated data type</b> is designed so that concurrent updates can be applied in any order and replicas that have seen the same set of updates are guaranteed to end up in the same state, with no transformation and no central ordering. <b>State-based</b> CRDTs ship whole states and merge them with a function that is commutative, associative and idempotent, so duplicated or reordered messages are harmless. <b>Operation-based</b> CRDTs ship operations that commute, but need delivery that is reliable and in causal order. Text CRDTs (RGA, YATA as used by Yjs, Automerge's list type) avoid positions entirely: every character gets a unique ID such as <code>(counter, replica)</code> and an insert says \"after the character with ID x\". Concurrent inserts after the same character are ordered by a deterministic rule on their IDs, and deletes leave <b>tombstones</b> so later operations can still refer to the deleted character." },
      { t: "code", lang: "python", code: `class GCounter:                       # grow-only counter, state-based CRDT
    def __init__(self, replica_id):
        self.id, self.counts = replica_id, {}

    def increment(self, n=1):
        self.counts[self.id] = self.counts.get(self.id, 0) + n

    def merge(self, other):           # element-wise max: order and repeats don't matter
        for rid, c in other.counts.items():
            self.counts[rid] = max(self.counts.get(rid, 0), c)

    def value(self):
        return sum(self.counts.values())

us, eu = GCounter("us"), GCounter("eu")
us.increment(3); eu.increment(5)
us.merge(eu); eu.merge(us)            # both now report 8` },
      { t: "compare", items: [
        { title: "Operational transformation", pros: ["Small, position-based operations and little per-character metadata", "Mature for text: Google Docs uses OT", "Server can validate and reject edits and enforce permissions in one place"], cons: ["Transform functions are subtle and grow with every operation type", "Needs a central server for ordering in practice", "Long offline sessions mean transforming large batches of operations on reconnect"], use: "Always-online, server-mediated editing of text or rich text." },
        { title: "CRDTs", pros: ["Converge without a central authority: peer-to-peer, multi-region, offline-first", "Merge is mathematically guaranteed; any sync order works", "Libraries exist for counters, sets, maps, lists and JSON: Yjs, Automerge"], cons: ["Unique IDs and tombstones add metadata; cleaning up tombstones needs coordination", "Converging is not the same as preserving intent: semantic conflicts still need product rules", "Invariants such as no cycles in a tree are hard to enforce without a server"], use: "Offline-first or peer-to-peer apps, multi-region replicated state, local-first software." }
      ] },
      { t: "callout", kind: "example", title: "Figma's middle path", html: "Figma's engineering team has written that its multiplayer system is not a true CRDT but was inspired by CRDTs, and relies on a central server as the authority. A Figma file is a tree of objects with properties. Concurrent changes to different properties both survive, while concurrent changes to the same property resolve to the last value the server received. Child order uses fractional indexing, which gives each child a position between its neighbours, and the server rejects reparenting moves that would create a cycle. A design canvas suits this because users rarely edit the same property of the same object at the same moment, unlike two people typing in one paragraph." },
      { t: "callout", kind: "tip", title: "The rest of a collaboration system", html: "Persist an append-only operation log plus periodic snapshots, so a newly opened document loads the latest snapshot and replays only the operations after it. Route every editor of one document to the same server (consistent hashing on document ID) so ordering happens in one process. Send cursors and selections over the same WebSocket but never persist them; they are ephemeral presence data." },
      { t: "callout", kind: "interview", title: "How to choose in an interview", html: "For \"design Google Docs\", OT with a central server per document, an op log and snapshots is the expected answer, and you should say why: low metadata and one place to enforce ordering and permissions. Pick CRDTs when the prompt says offline editing, peer-to-peer sync or multi-region writes without a single leader. Either way, name the cost: OT needs a server in the loop, and CRDTs carry metadata and tombstones." }
    ]
  },

  // ---------------------------------------------------------------- Lesson 6
  {
    id: "top-k-and-fanout",
    title: "Top-K, heavy hitters and fan-out",
    minutes: 13,
    blocks: [
      { t: "p", html: "\"Top 10 trending hashtags\", \"most viewed videos this hour\", \"which cache keys are hot\" and \"which IPs send the most requests\" are all <b>Top-K</b> problems: rank items by frequency and return the K most frequent. A <b>heavy hitter</b> is an item whose count exceeds some fraction of the whole stream, for example more than 0.1% of all events. The difficulty is never the ranking itself; it is counting billions of events over millions of distinct keys, across many machines and over sliding time windows." },
      { t: "h", text: "Exact Top-K on one machine" },
      { t: "p", html: "Count with a hash map, then keep a <b>min-heap of size K</b>: push each item while the heap is small; once it holds K items, replace the root only when an item beats the current K-th best. That is O(D log K) for D distinct items instead of O(D log D) for a full sort, and it is what you write when the data fits on one box." },
      { t: "code", lang: "python", code: `import heapq

def top_k(counts, k):
    heap = []                                  # min-heap of (count, key)
    for key, c in counts.items():
        if len(heap) < k:
            heapq.heappush(heap, (c, key))
        elif c > heap[0][0]:                   # beats the current k-th best
            heapq.heapreplace(heap, (c, key))
    return sorted(heap, reverse=True)

top_k({"#a": 5, "#b": 9, "#c": 1, "#d": 7}, 2)   # [(9, '#b'), (7, '#d')]` },
      { t: "h", text: "Distributed Top-K: partition by key" },
      { t: "p", html: "At scale, events are spread over many servers. The correct pattern is to <b>partition the stream by the key being counted</b>, for example a Kafka topic keyed by hashtag, so all events for one hashtag reach one aggregator. Each aggregator then holds exact counts for its share of keys, computes a local top-K, and a merger combines the local lists. Because no key is split across aggregators, the global top K is guaranteed to be among the union of the local top Ks." },
      { t: "callout", kind: "warn", title: "Merging local top-K lists from unkeyed data is wrong", html: "Suppose three web servers each count the hashtags they happened to receive. Server 1 sees <code>#b</code> 150 times, server 2 sees <code>#c</code> 150 times, server 3 sees <code>#d</code> 150 times, and every server sees <code>#a</code> 100 times. Each local top-1 omits <code>#a</code>, so the merged answer is a 150-count tag, yet <code>#a</code> has 300 in total and is the true winner. Merging is only correct after a shuffle by key, or if every server sends its full counts rather than just its top K." },
      { t: "diagram", caption: "Events are shuffled by hashtag so each aggregator owns complete counts for its keys; only small local top-K lists travel to the merger.", code: `flowchart LR
  P["Post service"] -->|"hashtag events"| K[["Kafka topic<br/>keyed by hashtag"]]
  K --> A1["Aggregator 1<br/>counts per minute"]
  K --> A2["Aggregator 2<br/>counts per minute"]
  K --> A3["Aggregator 3<br/>counts per minute"]
  A1 -->|"local top-K"| M["Top-K merger"]
  A2 -->|"local top-K"| M
  A3 -->|"local top-K"| M
  M --> R[("Redis<br/>trending results")]
  R --> API["Trending API"]` },
      { t: "h", text: "Approximate Top-K in bounded memory" },
      { t: "p", html: "When there are too many distinct keys to count exactly, two techniques bound memory. <b>Count-Min Sketch plus a heap</b>: add every event to a sketch, read back its estimate, and keep a heap of the best candidates; memory is the sketch plus the heap. Because estimates never undercount, a frequency threshold never filters out a real heavy hitter. The risk runs the other way, a light item inflated by collisions, so keep a few more candidates than K (say 2K) and rank them by exact counts kept just for those candidates. <b>Space-Saving</b> (a relative of Misra-Gries) keeps exactly m counters: an item already tracked is incremented, while a new item replaces the item with the smallest counter and inherits that count plus 1. Any item that occurs more than N/m times in a stream of N events is guaranteed to be tracked, and each count is overestimated by at most the smallest counter." },
      { t: "p", html: "For <b>time windows</b>, keep one bucket per minute: a hash map, a sketch or both. The last hour is the sum of the last 60 minute buckets, and sliding the window drops the oldest bucket. Count-Min Sketches with identical dimensions and hash functions can be added cell by cell, so per-minute sketches combine cheaply; heaps cannot be added or subtracted, so a top-K is recomputed from the combined counts. Windowing, event time and watermarks are covered in Chapter 10." },
      { t: "callout", kind: "tip", title: "Redis sorted sets for modest Top-K", html: "For up to a few million keys, a Redis sorted set per minute does the job: <code>ZINCRBY trend:10:15 1 \"#worldcup\"</code> on each event, <code>ZUNIONSTORE</code> the last 60 minute keys for the hour, then <code>ZREVRANGE trend:hour 0 9 WITHSCORES</code>. Each <code>ZINCRBY</code> is O(log n). The catch is that every event is a network round trip to one node, so batch or pre-aggregate counts in the application before sending them." },
      { t: "h", text: "Fan-out strategies: a preview" },
      { t: "p", html: "<b>Fan-out</b> means one action triggering work on many targets. It is central to news feeds, notifications and chat (Chapter 16 covers those in depth), and the choice is usually between doing the work on write or on read." },
      { t: "compare", items: [
        { title: "Fan-out on write (push)", pros: ["Reads are one cache lookup: the feed is precomputed", "Predictable read latency"], cons: ["Write cost scales with follower count: 50M writes for an account with 50M followers", "Wasted work for inactive followers"], use: "Most users, who have modest follower counts and readers who read far more often than they post." },
        { title: "Fan-out on read (pull)", pros: ["Writes are a single insert", "No wasted work; always fresh"], cons: ["Each read gathers from every followee and merges, so read cost grows with following count", "Higher and more variable read latency"], use: "Celebrity accounts and rarely read feeds." },
        { title: "Hybrid", pros: ["Push for normal accounts, pull for accounts above a follower threshold", "Bounds both write amplification and read cost"], cons: ["Two code paths to build and keep consistent", "The threshold needs tuning"], use: "The standard answer for social feeds at scale." }
      ] },
      { t: "p", html: "Fan-out on read has a statistical trap: <b>tail latency amplification</b>. If one request fans out to 100 shards and each shard is slow 1% of the time, then 1 − 0.99^100 ≈ 63% of requests wait for at least one slow shard. Mitigations include hedged requests (send a duplicate to another replica if the first has not answered by about the p95 latency), returning partial results after a deadline, and fanning out to fewer, larger partitions." },
      { t: "callout", kind: "interview", title: "Top-K signals interviewers look for", html: "Clarify the window (all time, last hour, sliding) and whether approximate counts are acceptable. Partition by key before aggregating, pre-aggregate hot keys on the producer side, and keep the serving path separate: a precomputed list in a cache, refreshed every few seconds, not a query that scans counts on demand." }
    ]
  }
];

const takeaways = [
  "Snowflake IDs pack 1 sign bit, a 41-bit millisecond timestamp (about 69 years from a custom epoch), a 10-bit machine ID (1,024 workers) and a 12-bit sequence (4,096 IDs per ms per worker) into 64 bits. They stay unique only if worker IDs are unique and clocks never run backwards.",
  "Time-ordered keys (Snowflake, UUID v7, ULID) keep B-tree inserts at the right-hand edge of the index; random UUID v4 keys scatter inserts across it. On range-partitioned stores such as Bigtable and Spanner the rule flips: sequential keys create a hot tablet.",
  "A Bloom filter never gives false negatives. Size it with m = −n·ln p / (ln 2)² and k = (m/n)·ln 2: about 9.6 bits and 7 hashes per item for 1%, no matter how large the items are.",
  "A Count-Min Sketch estimates frequencies in fixed memory and only overestimates, by at most εN with probability 1 − δ. Use it to find heavy hitters, not to report exact long-tail counts.",
  "HyperLogLog counts distinct items in 12 KB in Redis with about 0.81% standard error. Merge sketches with <code>PFMERGE</code> to get unions, and never add daily unique counts together.",
  "Merkle trees find the ranges where replicas differ in O(log n) hash comparisons. Gossip spreads membership in O(log N) rounds. Failure detectors such as SWIM and phi accrual can only suspect a node, so pair them with fencing.",
  "For nearby search, a geohash prefix is a cell (6 characters is about 1.2 × 0.6 km, 5 is about 4.9 km). Always query the 8 neighbouring cells and re-rank by true distance. Quadtrees adapt to density, S2 handles precise region coverings, and H3 hexagons suit area aggregation.",
  "OT transforms position-based edits through a central server, which is how Google Docs works. CRDTs converge without coordination but carry extra metadata and tombstones; they suit offline-first and peer-to-peer apps.",
  "For distributed Top-K, partition events by key before counting, keep per-minute buckets for sliding windows and serve precomputed results from a cache. Merging local top-K lists computed from unpartitioned data gives wrong answers.",
  "Fan-out on write makes reads cheap but costs one write per follower; fan-out on read makes writes cheap but amplifies tail latency. Use a hybrid to handle celebrity accounts."
];

const mcqs = [
  {
    q: "In the classic Snowflake layout (1 sign bit, 41 timestamp bits, 10 machine bits, 12 sequence bits), how many IDs can one worker issue in a single millisecond before it must wait for the next one?",
    options: ["1,024", "4,096", "65,536", "2^22, about 4.2 million"],
    answer: 1,
    explain: "The 12-bit sequence runs from 0 to 4,095, so one worker can issue 4,096 IDs per millisecond, about 4.1 million per second. 1,024 is the number of workers the 10 machine bits allow, not the per-millisecond capacity.",
    level: "easy"
  },
  {
    q: "Roughly how much memory does one Redis HyperLogLog use, and what is its standard error?",
    options: ["About 1 KB, with about 5% standard error", "It grows with the number of distinct members and has no error", "About 1.2 MB, with about 0.01% standard error", "About 12 KB, with about 0.81% standard error"],
    answer: 3,
    explain: "Redis uses 16,384 six-bit registers (12 KB), and the error is 1.04 / √16384 ≈ 0.81% no matter how many distinct items are added. An exact set would grow with cardinality, which is exactly what HLL avoids.",
    level: "easy"
  },
  {
    q: "A cluster of N nodes spreads membership changes by gossip: every second each node exchanges state with a random peer. Roughly how long does a new fact take to reach every node?",
    options: ["O(log N) rounds, about 10 to 20 for 1,000 nodes", "O(N) rounds, about 1,000 for 1,000 nodes", "One round, because every node talks to every other node", "O(N²) rounds, because each pair must exchange state"],
    answer: 0,
    explain: "As in an epidemic, the number of informed nodes roughly doubles each round, so dissemination takes a logarithmic number of rounds while each node sends a constant number of messages per round. All-to-all exchange would take one round but O(N²) messages, which is what gossip avoids.",
    level: "easy"
  },
  {
    q: "A signup service checks a Bloom filter containing every username ever registered before it queries the database. Which outcome can <b>never</b> happen?",
    options: ["The filter says a name is taken, but the database has no such user", "The false-positive rate rises as more names are registered", "The filter says a name is free, but the database already has that name", "Two different names share some of the same bit positions"],
    answer: 2,
    explain: "A Bloom filter has no false negatives: adding a name set all of its bits, so a 0 bit proves the name was never added. False positives, the first option, do happen and become more likely as the filter fills, which is why a 'maybe' answer still goes to the database.",
    level: "easy"
  },
  {
    q: "You need a Bloom filter for 1 billion crawled URLs with a 1% false-positive rate. About how much memory does it need?",
    options: ["About 120 MB", "About 1.2 GB", "About 12 GB", "About 100 GB, since URLs average 100 bytes"],
    answer: 1,
    explain: "At 1% you need about 9.6 bits per item: 9.6 × 10^9 bits ≈ 1.2 GB, with k ≈ 7 hash functions. The size depends only on n and p, never on how long the items are, so the last option is a trap.",
    level: "medium"
  },
  {
    q: "A Count-Min Sketch reports an estimate of 1,200 for <code>#launch</code>. What do you know about its true count?",
    options: ["It is exactly 1,200", "It is at least 1,200", "It is at most 1,200", "It is within about ±0.81% of 1,200, either way"],
    answer: 2,
    explain: "Each counter holds the true count plus collisions from other keys, so the minimum across rows can only overestimate: the true count is at most 1,200, and with probability 1 − δ at least 1,200 − εN. The ±0.81% figure belongs to HyperLogLog, which estimates distinct counts, not frequencies.",
    level: "medium"
  },
  {
    q: "Your dashboard keeps one Redis HyperLogLog of visitor IDs per day. Product wants the number of unique visitors over the last 7 days. What is correct?",
    options: ["<code>PFMERGE</code> the seven daily keys and run <code>PFCOUNT</code> on the result", "Add up the seven daily <code>PFCOUNT</code> values for the weekly total", "Average the seven daily counts and multiply by 7", "It cannot be done; recount from the raw logs each time"],
    answer: 0,
    explain: "Merging HLLs takes the register-wise maximum, which produces the sketch of the union, so a visitor seen on several days is counted once. Adding daily counts counts a returning visitor once per day and overstates weekly uniques.",
    level: "medium"
  },
  {
    q: "An NTP correction steps a Snowflake worker's clock back by 5 ms. What should the generator do?",
    options: ["Keep issuing IDs and reset the sequence to 0", "Switch to a random 12-bit sequence until the clock recovers", "Add a random offset to the timestamp to avoid collisions", "Pause issuing IDs until the clock passes the last timestamp it used"],
    answer: 3,
    explain: "Issuing IDs for a millisecond the worker has already used can repeat a (timestamp, machine, sequence) triple, which is a duplicate ID. Waiting out a small backward jump, or refusing and alerting on a large one, preserves uniqueness; running NTP in slew mode avoids the step in the first place.",
    level: "medium"
  },
  {
    q: "A nearby-restaurants query looks up only the user's own precision-6 geohash cell and misses a restaurant 80 m away. What is the most likely cause and fix?",
    options: ["Precision 6 is too coarse; query the finer precision-9 cell instead", "It is across a cell boundary; also query the 8 neighbouring cells", "Geohash ignores longitude near the user; use latitude-only ranges", "Cached cell results are stale; lower the cache TTL on cell lookups"],
    answer: 1,
    explain: "Points that are close together can sit in different cells, sometimes with no shared prefix at all, so proximity search queries the 3 × 3 block around the user and then filters by true distance. A finer precision makes the miss more likely, not less, because the cells get smaller.",
    level: "medium"
  },
  {
    q: "Two Cassandra replicas of a 500 GB token range need repair. How does a Merkle tree keep the data transferred small?",
    options: ["Compare hashes from the root down and stream only ranges whose hashes differ", "Compress the full 500 GB range on both replicas and exchange the compressed copies", "Send a Bloom filter of all keys so each replica can see which keys the other lacks", "Exchange per-key timestamps and keep the newer version of every key on both sides"],
    answer: 0,
    explain: "Equal hashes prove a subtree matches, so the comparison prunes everything identical and only mismatched leaf ranges are streamed. Exchanging per-key timestamps or full copies moves data proportional to the whole range even when only a few rows differ, and a Bloom filter cannot detect keys whose values differ.",
    level: "medium"
  },
  {
    q: "You are building a notes app where a user edits on a phone and a laptop that may both be offline for days, then syncs peer-to-peer or through any relay. Which approach fits best?",
    options: ["Operational transformation with a central server ordering every edit", "Last-write-wins on the whole document using device clocks", "A CRDT-based document model such as Yjs or Automerge", "Pessimistic locking so only one device can edit at a time"],
    answer: 2,
    explain: "CRDTs converge whatever order or route updates arrive by, which suits long offline periods and peer-to-peer sync. OT in practice needs a central server to impose one order, and whole-document last-write-wins silently discards one device's edits.",
    level: "medium"
  },
  {
    q: "A MySQL InnoDB table uses random UUID v4 primary keys, and insert throughput drops sharply once the table outgrows the buffer pool. Which change fixes the root cause with the least redesign?",
    options: ["Add a secondary index on the UUID column to speed up lookups", "Store the UUID as a 36-character string instead of 16 binary bytes", "Shard the table by the first byte of the UUID", "Switch to time-ordered keys such as UUID v7 or Snowflake IDs"],
    answer: 3,
    explain: "InnoDB clusters rows by primary key, so random keys insert into random leaf pages that must be read from disk and split, while time-ordered keys append at the right edge where the pages stay in memory. Storing the key as a string makes every index entry bigger, and sharding spreads the problem around without removing it.",
    level: "hard"
  },
  {
    q: "You move an events table to Bigtable with row keys that start with a Snowflake ID. Adding nodes does not raise write throughput, and one node is pegged. Why?",
    options: ["Snowflake IDs are not unique across data centers", "Increasing keys all land in the tablet owning the newest range", "Bigtable cannot index 64-bit integer row keys efficiently", "The 12-bit sequence caps the table at 4,096 writes per millisecond"],
    answer: 1,
    explain: "Bigtable partitions rows by contiguous key ranges, so monotonically increasing keys always hit the last tablet, a moving hot spot. Lead the key with something well distributed, such as a hash prefix, a salt or a bit-reversed ID; this is also why Spanner advises against sequential primary keys.",
    level: "hard"
  },
  {
    q: "Twenty web servers behind a round-robin load balancer each count hashtags for the last hour and send only their local top 10 to a merger, which adds them up and returns the top 10. What is wrong?",
    options: ["A tag ranked 11th on every server can be first overall yet appear in no list", "Adding counts double-counts tags that appear in several local lists", "Round robin delivers each event to several servers, inflating counts", "Nothing: the union of the local top-10 lists always contains the global top 10"],
    answer: 0,
    explain: "Because a hashtag's events are spread across all servers, its total can be the largest while it ranks 11th on every server. Partition events by hashtag first, for example with a Kafka topic keyed by tag, so each aggregator holds complete counts, or send full counts instead of local top-K lists.",
    level: "hard"
  },
  {
    q: "Why does Cassandra use a phi accrual failure detector rather than a fixed heartbeat timeout?",
    options: ["It guarantees a crashed node is never confused with a slow one", "It removes heartbeats and infers liveness from client traffic", "It adapts suspicion to each peer's observed heartbeat timing", "It needs no threshold, because the right value is derived automatically"],
    answer: 2,
    explain: "Phi accrual models each peer's heartbeat inter-arrival times and outputs a suspicion level φ, where φ = 3 means about a 0.1% chance that suspecting the peer is a mistake. No detector can perfectly tell crashed from slow in an asynchronous network, and it still needs a threshold: Cassandra's <code>phi_convict_threshold</code> defaults to 8.",
    level: "hard"
  }
];

const design = [
  // ---------------------------------------------------------------- Design 1
  {
    id: "design-proximity-service",
    title: "Design a proximity service (find nearby restaurants)",
    level: "Medium",
    prompt: "Design the backend for a Yelp-style app. Given the user's location and a radius such as 500 m, 2 km or 10 km, return nearby restaurants and other businesses, optionally filtered by category, sorted by distance or rating, with pagination. Business owners can add and edit listings. Assume 200M businesses worldwide and 100M daily active users.",
    clarify: [
      "Which radii must we support, and is there a maximum such as 10 km?",
      "Is the default sort by distance or by a relevance score that combines distance, rating and popularity?",
      "How quickly must a new or edited business appear in search results: seconds, minutes, or by the next day?",
      "Do businesses ever move, or only users? Do we need live-moving objects such as delivery drivers?",
      "Which filters are required in the first version: category, open now, price, rating?",
      "Is the traffic global, and how uneven is density between dense cities and rural areas?"
    ],
    hints: [
      "Explain why an ordinary index on latitude and longitude does a poor job of answering a 2D radius query.",
      "Turn locations into grid cells with sortable IDs, such as geohash prefixes, so a cell lookup becomes a range scan in an ordinary store.",
      "A user near a cell edge needs results from the next cell, so search the user's cell and its 8 neighbours, then filter by true distance.",
      "Businesses change rarely compared with how often they are searched. Estimate the geo index size; it may fit in memory, which means read replicas, not sharding.",
      "Dense downtowns and empty deserts need different cell sizes. Consider expanding the search to coarser precision until enough results are found, or a quadtree."
    ],
    solution: [
      { t: "h", text: "Requirements" },
      { t: "list", items: [
        "<b>Functional</b>: search nearby businesses by location, radius (0.5, 1, 2, 5 or 10 km) and optional category; sort by distance or rating; paginate; view a business; owners create, update and delete listings.",
        "<b>Non-functional</b>: search p99 under 200 ms; 99.99% availability for search; listing edits visible within minutes, not instantly; read-heavy; scale to 200M businesses and peak tens of thousands of searches per second.",
        "<b>Out of scope</b>: moving objects such as drivers (Chapter 17), reviews and photo storage, personalised ranking."
      ] },
      { t: "h", text: "Estimates" },
      { t: "list", items: [
        "<b>Search QPS</b>: 100M DAU × 5 searches per day = 5 × 10^8 per day; ÷ ~10^5 s ≈ 5,000 QPS on average (5,800 exactly); peak at 3x ≈ 17,000 QPS.",
        "<b>Writes</b>: about 100k business creates and edits per day ≈ 1 write per second. The read-to-write ratio is about 5,000:1.",
        "<b>Business data</b>: 200M × ~1 KB (name, address, hours, category, rating) ≈ 200 GB. That fits on one PostgreSQL primary with replicas.",
        "<b>Geo index</b>: 200M × (12-byte geohash + 8-byte ID + 16 bytes of lat/lng + ~24 bytes of row and index overhead ≈ 60 bytes) ≈ 12 GB. It fits in RAM on a single machine.",
        "<b>Replicas</b>: if one in-memory index replica serves ~3,000 searches per second (9 range lookups plus distance math each), 17k peak ÷ 3k ≈ 6, so run about 8 per region for headroom and failover.",
        "<b>Hydration</b>: 20 results per page × 5,800 searches/s ≈ 116k business lookups/s, served by Redis multi-gets."
      ] },
      { t: "h", text: "API" },
      { t: "code", lang: "http", code: `GET /v1/search/nearby?lat=37.7749&lng=-122.4194&radius=2000&category=sushi&sort=distance&limit=20
200 OK
{ "results": [ { "id": "881", "name": "Sushi Ran", "distance_m": 468, "rating": 4.6 } ],
  "next_cursor": "eyJkIjo0NjgsImlkIjo4ODF9" }

GET /v1/search/nearby?lat=37.7749&lng=-122.4194&radius=2000&cursor=eyJkIjo0NjgsImlkIjo4ODF9

GET /v1/businesses/881

POST /v1/businesses            (owner, body: name, category, lat, lng, hours...)
PUT  /v1/businesses/881        (owner, partial update)` },
      { t: "p", html: "The cursor encodes the last result's sort key, here distance 468 m and ID 881, so the next page continues after that result instead of using an offset that shifts when data changes." },
      { t: "h", text: "Data model" },
      { t: "code", lang: "sql", code: `-- Source of truth: PostgreSQL primary + replicas
CREATE TABLE business (
  business_id BIGINT PRIMARY KEY,          -- Snowflake ID
  name        TEXT NOT NULL,
  category    TEXT NOT NULL,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  rating      NUMERIC(2,1),
  hours       JSONB,
  updated_at  TIMESTAMPTZ NOT NULL
);

-- Geo index: one row per business, full-precision geohash.
-- Any coarser cell is a prefix, so one column serves every radius.
CREATE TABLE geo_index (
  geohash     TEXT COLLATE "C" NOT NULL,   -- 9 chars, about 4.8 m cells
  category    TEXT NOT NULL,
  business_id BIGINT NOT NULL,
  lat         DOUBLE PRECISION NOT NULL,   -- copied so distance needs no join
  lng         DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (geohash, business_id)
);
CREATE INDEX geo_by_category ON geo_index (category, geohash);

-- One cell of the 3x3 block:
-- SELECT business_id, lat, lng FROM geo_index
--  WHERE geohash >= '9q8yyk' AND geohash < '9q8yym';` },
      { t: "p", html: "PostgreSQL is fine here because the dataset is small and the write rate is tiny; the geo index is a plain B-tree on a C-collated string, so prefix ranges are index range scans. The <code>(category, geohash)</code> index lets a category filter run inside the index instead of fetching every place in the cell. The same layout works in DynamoDB or Cassandra with the cell prefix as the partition key, if you prefer a managed key-value store." },
      { t: "h", text: "High-level design" },
      { t: "diagram", caption: "Search is a stateless read path over a replicated, memory-resident geo index; owner edits flow through the primary and reach the index asynchronously via CDC.", code: `flowchart LR
  U(("Mobile app")) --> GW["API gateway"]
  GW -->|"search"| LBS["Location search<br/>service, stateless"]
  GW -->|"owner edits"| BS["Business service"]
  LBS -->|"9 cell range scans"| GR[("Geo index<br/>read replicas")]
  LBS -->|"MGET details"| RC[("Redis<br/>business cache")]
  BS --> PG[("PostgreSQL primary<br/>business table")]
  PG -.->|"CDC events"| IX["Index updater"]
  IX --> GP[("Geo index primary")]
  GP -.->|"replication"| GR
  IX -.->|"invalidate"| RC` },
      { t: "steps", items: [
        { title: "Pick the precision", html: "The location search service maps the radius to a geohash precision whose cell's short side is at least the radius: 0.5 km uses 6 characters; 1 and 2 km use 5; 5 and 10 km use 4. Above about 65° latitude cells get narrow, so drop one more level." },
        { title: "Compute the 3 × 3 block", html: "Encode the user's position, compute the 8 neighbouring cells (a pure function, no I/O) and issue 9 prefix range scans in parallel, or one query with 9 OR-ed ranges, against a geo index replica." },
        { title: "Filter and rank", html: "Compute the haversine distance for every candidate, drop those outside the radius, apply filters and sort by distance or by a score such as rating weighted by distance. Keep the top <code>limit</code> after the cursor." },
        { title: "Hydrate", html: "Fetch names, ratings and hours for the 20 IDs with one Redis <code>MGET</code>; fill misses from a PostgreSQL replica and cache them with a TTL of about 10 minutes." },
        { title: "Write path", html: "An owner edit commits to the <code>business</code> table. A CDC stream (Debezium reading the write-ahead log) feeds the index updater, which upserts the <code>geo_index</code> row (deleting the old row first if the business moved) and invalidates the cached details. End-to-end lag is seconds to minutes, inside the requirement." }
      ] },
      { t: "h", text: "Deep dives" },
      { t: "p", html: "<b>1. Uneven density.</b> A 10 km search uses precision 4, and the 3 × 3 block around Manhattan covers roughly 90 × 58 km, which can hold hundreds of thousands of businesses, far too many to distance-sort per request, while the same block in rural Nevada holds a handful. Three tactics: (a) push the category filter into the index so \"sushi\" scans only sushi rows; (b) for distance-sorted queries, search outward: start with the precision-6 block and expand to precision 5 and 4 only while fewer than <code>limit</code> results lie within the distance the current block fully covers (its cell's short side, about 600 m at precision 6), so dense areas stop early and sparse ones widen automatically; (c) cap candidates per cell, for example by keeping cells pre-sorted by rating when the sort is by rating. If density skew still hurts, replace the flat geohash table with an in-memory quadtree (leaf capacity about 100) on each search server, rebuilt from the geo index at startup; with 200M places that is about 5 GB per server and takes a few minutes to build." },
      { t: "p", html: "<b>2. Why replicas rather than shards.</b> The whole index is about 12 GB, so every replica can hold all of it in memory, and any server can answer any query without a scatter-gather. Sharding by geohash would create hot shards (a city at lunchtime) and cross-shard queries along cell edges, all to solve a size problem that does not exist. Scale reads by adding replicas, and replicate the full index to every region so each user is served locally. Shard only if the index grows past one machine's memory, and then by region: a covering of cell prefixes per shard, so a query touches one shard except near shard borders." },
      { t: "p", html: "<b>3. Caching cell lookups.</b> Businesses barely change, so the result of \"cell <code>9q8yyk</code>, category sushi\" can be cached in Redis as a list of (ID, lat, lng) with a TTL of a few minutes plus an explicit invalidation when the index updater touches that cell. Popular cells (downtown, airports) get very high hit rates. Never cache the final response keyed by the user's raw coordinates: two users a metre apart produce different keys, so the hit rate would be close to zero." },
      { t: "h", text: "Trade-offs and bottlenecks" },
      { t: "table", head: ["Decision", "Chosen", "Alternative", "Why"], rows: [
        ["Spatial index", "Geohash prefixes in a B-tree", "Quadtree, S2 covering, PostGIS", "Simple, works in any ordered store; switch to a quadtree only if density skew hurts"],
        ["Scaling reads", "Full index replicated per region", "Shard by geography", "12 GB fits in RAM; replicas avoid hot shards and cross-shard edges"],
        ["Freshness", "Async CDC, seconds to minutes", "Synchronous index writes", "Requirement allows minutes; keeps the write path simple"],
        ["Pagination", "Cursor on (distance, ID)", "Offset", "Stable pages and no deep-offset scans"],
        ["Ranking", "Distance plus rating in the service", "Search engine such as Elasticsearch geo queries", "Elasticsearch is attractive once text search and rich filters join the requirements"]
      ] }
    ],
    followups: [
      "A user searches with a 50 km radius in a rural area. How does your precision choice change, and what stops it from scanning a 156 km cell in a dense region?",
      "How would you add full-text search (\"vegan ramen open now\") on top of the geo filter?",
      "Owners complain that edits take a day to appear. What changes if freshness must be under 5 seconds?",
      "How would the design change for moving objects that update their location every 4 seconds, such as delivery drivers?",
      "How do you handle a search near the antimeridian or the poles, where geohash neighbours behave oddly?"
    ]
  },

  // ---------------------------------------------------------------- Design 2
  {
    id: "design-top-k-trending-hashtags",
    title: "Design a Top-K trending hashtags system",
    level: "Hard",
    prompt: "Design the service behind a 'Trending now' panel for a Twitter-like social network. Show the top 10 hashtags globally and per country, based on activity over the last hour, refreshed at least every minute. Assume 500M posts per day, and that roughly 30% of posts contain hashtags.",
    clarify: [
      "Is trending simply the highest count in the window, or what is growing fastest compared with normal? A tag like #love is always popular but rarely trending.",
      "Which windows matter: a sliding last hour, last 24 hours? How fresh must the panel be?",
      "Global and per-country only, or also per city and per topic?",
      "Are approximate counts acceptable, or does this feed anything that must be exact, such as ad billing?",
      "What do we do about spam and bots inflating a hashtag?",
      "Do we need historical trends (what was trending at 9 pm yesterday) or only the current list?"
    ],
    hints: [
      "Separate the pipeline that counts from the API that serves; the panel should read a precomputed list.",
      "Counting needs all events for a hashtag in one place. What should the Kafka partition key be, and what happens to a partition when one tag goes viral?",
      "A sliding 1-hour window can be built from 60 one-minute buckets. Which data structures can be added together across buckets?",
      "The number of distinct hashtags is huge but the top 10 are heavy hitters. Consider Count-Min Sketch or Space-Saving to bound memory, and keep exact counts only for candidates.",
      "Raw count favours always-popular tags. Score the current window against a baseline from previous days, and count distinct users per tag so one bot cannot fake a trend."
    ],
    solution: [
      { t: "h", text: "Requirements" },
      { t: "list", items: [
        "<b>Functional</b>: top 10 trending hashtags globally and for each of about 200 countries over a sliding 1-hour window; refreshed every minute; trending means unusually high activity relative to the tag's normal level, not only high volume.",
        "<b>Non-functional</b>: freshness within 1 to 2 minutes; serving p99 under 50 ms at very high read QPS; approximate counts are fine; resilient to bot manipulation; the counting pipeline survives node failures without double counting enough to change rankings.",
        "<b>Out of scope</b>: personalised trends, text topic clustering, ad billing."
      ] },
      { t: "h", text: "Estimates" },
      { t: "list", items: [
        "<b>Events</b>: 500M posts × 30% with tags × ~2 tags = 3 × 10^8 hashtag events per day ≈ 3,500 per second on average, so assume ~10k per second at peak and 50k per second during a global event.",
        "<b>Event size</b>: ~100 bytes (tag, country, user ID, timestamp), so 10k/s × 100 B = 1 MB/s; trivial for Kafka.",
        "<b>Distinct tags</b>: maybe 5M distinct tags per hour, but the long tail is huge (most appear once). An exact hash map for one minute holds well under 1M entries, about 100 MB; fine on one aggregator, larger if country breakdowns are exact.",
        "<b>Reads</b>: the panel is loaded on many app opens: say 200M DAU × 10 views = 2 × 10^9 per day ≈ 23k QPS on average, 70k at peak. All of it is served from a precomputed list in a cache or CDN.",
        "<b>Output</b>: 201 lists (global plus 200 countries) × 50 candidates × ~50 bytes ≈ 500 KB per refresh. Tiny."
      ] },
      { t: "h", text: "API" },
      { t: "code", lang: "http", code: `GET /v1/trends?scope=global
GET /v1/trends?scope=country&code=BR
200 OK
Cache-Control: max-age=30
{ "scope": "BR", "window": "1h", "generated_at": "2026-10-22T10:15:00Z",
  "trends": [ { "tag": "#worldcup", "rank": 1, "posts_1h": 412000 },
              { "tag": "#eleicoes", "rank": 2, "posts_1h": 188500 } ] }

POST /internal/v1/trends/blocklist   (trust and safety: body tag, reason)` },
      { t: "h", text: "Data model" },
      { t: "table", head: ["Store", "Key", "Value", "Notes"], rows: [
        ["Kafka topic <code>hashtag-events</code>", "Partition key = hashtag", "tag, country, user_id, post_id, event_time", "64 partitions; 3x replication; 24 h retention for replay"],
        ["Flink keyed state", "(tag, minute)", "count, HLL of user IDs, per-country counts", "Exact counts per tag; checkpointed to S3 every 30 s"],
        ["Cassandra <code>tag_minute_counts</code>", "Partition (tag, day); clustering minute", "count, distinct_users", "Baselines and history; TTL 30 days"],
        ["Redis <code>trends:{scope}</code>", "Scope such as global or BR", "JSON list of top 50 candidates with scores", "Overwritten every minute; read by the API"],
        ["PostgreSQL <code>blocklist</code>", "tag", "reason, created_by, created_at", "Small; cached in every ranker"]
      ] },
      { t: "h", text: "High-level design" },
      { t: "diagram", caption: "Counting is a keyed streaming job that owns exact per-tag counts; ranking runs once a minute on small candidate lists, and reads never touch the pipeline.", code: `flowchart LR
  PS["Post service"] -->|"extract hashtags"| K[["Kafka<br/>hashtag-events,<br/>keyed by tag"]]
  K --> F["Flink counters<br/>per-minute counts,<br/>user HLLs"]
  F -->|"per-partition candidates<br/>every minute"| RK["Trend ranker"]
  F -.->|"minute counts"| CS[("Cassandra<br/>history and baselines")]
  CS -->|"baseline lookups"| RK
  RK --> RD[("Redis<br/>trends by scope")]
  RD --> API["Trends API"]
  API --> CDN["CDN, 30 s TTL"]
  CDN --> APP(("Apps"))` },
      { t: "steps", items: [
        { title: "Emit", html: "When a post is created, the post service extracts and normalises hashtags (lowercase, Unicode NFKC normalisation so visually identical tags count together) and produces one event per tag to Kafka, keyed by tag. Keying by tag puts every event for a tag on one partition and one Flink task." },
        { title: "Count", html: "A Flink job keyed by tag keeps, per tag and per one-minute event-time bucket, a total count, per-country counts and a HyperLogLog of user IDs. A watermark allowing about 30 s of lateness closes each minute. Flink checkpoints state and Kafka offsets together, so after a failure counts are restored exactly." },
        { title: "Emit candidates", html: "When a minute closes, each Flink task sums the last 60 minutes for its tags, keeps a local top 50 globally and per country by score, and sends those lists to the ranker. Because the stream is partitioned by tag, the true global top 10 must appear in the union of these per-partition lists." },
        { title: "Rank", html: "The ranker merges about 64 lists per scope, removes blocklisted tags and those below the distinct-user threshold, computes the final score and writes the top 50 per scope to Redis as one small JSON value. A standby ranker takes over through a lease if the active one dies." },
        { title: "Serve", html: "The API reads <code>trends:{scope}</code> from Redis and returns the top 10; the CDN caches each scope for 30 s. 70k reads per second turn into a few hundred origin requests per second." }
      ] },
      { t: "h", text: "Deep dives" },
      { t: "p", html: "<b>1. Trending is not the same as popular.</b> Ranking by raw count shows #love and #photography forever. Instead compare the last hour with the tag's usual level for this hour, taken from Cassandra minute counts (the average for the same hour over the previous 7 days). A simple z-like score works well: <code>score = (count_1h − expected) / sqrt(expected)</code>, with expected floored at a small number so brand-new tags do not divide by zero. Example: #love at 5,000 per hour against a baseline of 4,800 scores (5,000 − 4,800) / √4,800 ≈ 2.9; #earthquake at 2,500 against a baseline of 50 scores about 346 and trends. Add minimum volume and distinct-user thresholds, and optionally decay the score over the hour so the panel turns over." },
      { t: "code", lang: "python", code: `import math

def trend_score(count_1h, baseline_1h, distinct_users):
    if count_1h < 200 or distinct_users < 100:     # too small or too few people
        return 0.0
    expected = max(baseline_1h, 5.0)               # floor for brand-new tags
    return (count_1h - expected) / math.sqrt(expected)

trend_score(5000, 4800, 3900)   # ~2.9:  always popular, not trending
trend_score(2500, 50, 2100)     # ~346:  a sudden spike, trending` },
      { t: "p", html: "<b>2. Hot partitions when a tag goes viral.</b> During a final, #worldcup can be 20% of all events, about 10k per second, all keyed to one Kafka partition and one Flink task. Two fixes compose well. First, pre-aggregate before Kafka: each post-service instance keeps a local map of tag counts for 1 to 5 seconds and emits <code>(tag, country, count)</code> deltas instead of single events, which collapses thousands of events into one message per instance per flush. Second, salt only known-hot keys: send <code>#worldcup</code> as <code>#worldcup|0</code> to <code>#worldcup|7</code>, count each sub-key separately and add the 8 partial counts in the ranker. Pre-aggregation alone usually suffices; salting adds a second merge step and is reserved for the few tags a hot-key detector flags." },
      { t: "p", html: "<b>3. Memory for the long tail.</b> Exact per-minute counts for millions of one-off tags waste state. Use two tiers: every event updates a per-minute Count-Min Sketch per partition (2,719 × 7 counters ≈ 76 KB, with error at most 0.1% of that minute's events), and a tag gets exact state only once its sketch estimate passes a threshold, say 20 per minute. Because the sketch only overestimates, no tag that truly crossed the threshold is missed; a few false candidates just cost a little extra exact state. Distinct-user HLLs are kept only for candidates for the same reason: at about 12 KB each in dense form, one per tag would cost 60 GB for 5M tags." },
      { t: "h", text: "Trade-offs and bottlenecks" },
      { t: "list", items: [
        "<b>Exact vs approximate</b>: exact keyed counts are affordable for candidate tags; sketches bound memory for the tail. The rankings tolerate small errors; billing would not.",
        "<b>Freshness vs stability</b>: one-minute buckets with a 30 s watermark give trends within about 2 minutes. Shorter windows react faster but make the list jumpy; publish only when ranks change meaningfully, or smooth scores across minutes.",
        "<b>Global vs regional pipelines</b>: one global pipeline is simpler; per-region pipelines with a global merge of candidate lists avoid shipping every event across oceans, at the cost of a second merge step.",
        "<b>Abuse</b>: distinct-user HLLs, account-age weighting and a manual blocklist matter as much as the counting; a trending list is a target for spam.",
        "<b>Bottlenecks</b>: hot partitions (fixed by pre-aggregation and salting), the single ranker (small and stateless, so a standby with a lease), and Flink state size (two-tier counting)."
      ] }
    ],
    followups: [
      "How do you show 'what was trending at 9 pm last Friday' without replaying Kafka?",
      "A bot network posts #buyXcoin from 50,000 new accounts. Which signals stop it from trending, and what is the cost of false positives?",
      "How would you extend trends to every city in the world, roughly 10,000 scopes, without 50 times more ranker work?",
      "If Flink is down for 10 minutes, what does the panel show, and how does it catch up?",
      "How would you make trends personalised (relevant to accounts the user follows) at 70k reads per second?"
    ]
  },

  // ---------------------------------------------------------------- Design 3
  {
    id: "design-unique-id-generator",
    title: "Design a distributed unique ID generator",
    level: "Medium",
    prompt: "Design a service that issues unique IDs for every entity in a large product (posts, messages, orders, users), used by dozens of internal services running in 5 regions. IDs must be 64-bit integers, roughly sortable by creation time, and available even if a region is cut off from the others. Peak demand is about 1 million IDs per second globally.",
    clarify: [
      "Must IDs fit in 64 bits, or is a 128-bit UUID acceptable to the databases and clients that store them?",
      "How strict is the ordering: strictly increasing across the whole system, or roughly time-sorted (k-sorted) to within a few milliseconds?",
      "What is the peak rate per region, and how many regions and generator processes might exist in 5 years?",
      "Will IDs appear in public URLs or APIs? Is it a problem if they reveal creation time or allow guessing neighbouring IDs?",
      "What latency budget does a caller have to obtain an ID, and may callers fetch IDs in batches?",
      "How many years must the scheme last without changing format?"
    ],
    hints: [
      "Rule out the simple options first: why do auto-increment and UUID v4 each break one of the requirements?",
      "Split 64 bits into time, generator identity and a counter. Work out how long 41 bits of milliseconds last and how many IDs per millisecond 12 bits give.",
      "Uniqueness now depends entirely on no two live generators sharing an identity. How do you hand out generator IDs in an autoscaling fleet, and take them back from crashed nodes?",
      "Put region bits in the generator ID so regions never coordinate. Then deal with clocks: what does a generator do when its clock jumps backwards, and what if a reused generator ID runs on a machine whose clock is behind?",
      "Consider whether generation belongs in a library inside every service or in a small dedicated service, and what batching does to latency and ordering."
    ],
    solution: [
      { t: "h", text: "Requirements" },
      { t: "list", items: [
        "<b>Functional</b>: issue unique 64-bit IDs, singly or in batches up to 1,000; decode an ID into its timestamp and generator for debugging.",
        "<b>Non-functional</b>: never a duplicate, even across crashes, restarts and clock problems; roughly time-ordered (IDs created more than a few milliseconds apart sort correctly); 1M IDs/s global peak; p99 under 2 ms in-region; each region keeps issuing IDs while partitioned from the others; at least 50 years of range.",
        "<b>Not required</b>: strictly increasing IDs across the system or gap-free sequences, which would need a single sequencer."
      ] },
      { t: "h", text: "Estimates" },
      { t: "list", items: [
        "<b>Rate</b>: 1M IDs/s global peak; the largest region carries 40%, so 400k IDs/s.",
        "<b>Per-generator capacity</b>: 4,096 IDs per ms is about 4.1M IDs/s, far above demand, so the sequence field is not the limit. The limit is RPC handling: with batching averaging 10 IDs per request, the largest region sees 40k requests/s, and a generator node comfortably serves 50k gRPC requests/s, so 2 nodes would do; run 6 per region (2 per availability zone), which still leaves N+2 after losing a whole zone.",
        "<b>Lifetime</b>: 2^41 ms ≈ 69.7 years; with a custom epoch of 2026-01-01 the IDs last until 2095.",
        "<b>Generator IDs</b>: 10 bits = 3 bits region (8 regions) + 7 bits worker (128 per region); 6 nodes per region, plus new nodes started during deploys, is far below 128.",
        "<b>State</b>: none per ID. Coordination state is two etcd keys per active worker (owner and reservation), about 60 keys across the 5 regions, refreshed once a second."
      ] },
      { t: "h", text: "API" },
      { t: "code", lang: "http", code: `POST /v1/ids?count=3
200 OK
{ "ids": ["106696815391346693", "106696815391346694", "106696815391346695"] }

GET /v1/ids/106696815391346693/decode
200 OK
{ "timestamp": "2026-10-22T10:15:03.120Z", "region": 2, "worker": 17, "sequence": 5 }

GET /v1/health
503 Service Unavailable   (lease lost or clock unsafe: callers fail over)` },
      { t: "p", html: "Internally this is gRPC; the HTTP form is shown for clarity. IDs are returned as decimal strings because JavaScript clients lose precision above 2^53." },
      { t: "h", text: "Data model" },
      { t: "table", head: ["Bits", "Field", "Range", "Notes"], rows: [
        ["63", "Sign", "Always 0", "Positive in signed BIGINT and Java long"],
        ["62 to 22", "Timestamp, 41 bits", "ms since 2026-01-01, until 2095", "High bits, so IDs sort by time"],
        ["21 to 19", "Region, 3 bits", "0 to 7", "Fixed per region; no cross-region coordination"],
        ["18 to 12", "Worker, 7 bits", "0 to 127 per region", "Leased from the regional etcd cluster"],
        ["11 to 0", "Sequence, 12 bits", "0 to 4,095", "Resets every millisecond"]
      ] },
      { t: "code", lang: "json", code: `[
  { "key": "/idgen/region-2/owner/17",
    "value": { "node": "idgen-2b-03", "started_at": "2026-10-22T09:58:41Z" },
    "lease_id": "694d77aa1c9e2f01",
    "lease_ttl_seconds": 10 },
  { "key": "/idgen/region-2/reserved/17",
    "value": { "reserved_until_ms": 1792664105120 },
    "lease_id": null }
]` },
      { t: "p", html: "The only stored state lives in a 3- or 5-node etcd cluster per region, two keys per worker ID: an <code>owner</code> key attached to a lease, which disappears if the holder stops renewing, and a <code>reserved</code> key with no lease, which survives the holder and records the latest timestamp it was allowed to use. etcd is chosen because it offers linearizable compare-and-set and leases that expire when the holder stops renewing them, which are exactly the primitives needed to hand out exclusive identities (ZooKeeper ephemeral nodes would work equally well)." },
      { t: "h", text: "High-level design" },
      { t: "diagram", caption: "Each region runs its own generator nodes and etcd cluster, so generating an ID never leaves the region; etcd is touched only to lease a worker ID, not on the ID path.", code: `flowchart LR
  subgraph R2["Region 2"]
    SVC["Calling services<br/>with ID client"] --> LB["Internal load balancer"]
    LB --> G1["Generator<br/>worker 17, AZ a"]
    LB --> G2["Generator<br/>worker 18, AZ b"]
    LB --> G3["Generator<br/>worker 19, AZ c"]
    G1 -.->|"lease keepalive"| E[("etcd cluster<br/>worker leases")]
    G2 -.->|"lease keepalive"| E
    G3 -.->|"lease keepalive"| E
    NTP["Chrony time sync"] -.-> G1
  end
  R1["Region 1: same layout,<br/>region bits = 1"]` },
      { t: "p", html: "<b>ID path</b>: a service calls <code>NextIds(count)</code> through a thin client library; the load balancer picks a healthy generator, which runs the Snowflake loop in memory and returns the IDs. No disk and no coordination is involved, so latency is one in-region round trip, well under 1 ms. If a generator is unhealthy, the client retries on another; since every worker has a distinct ID, retries can never produce duplicates. <b>Control path</b>: at startup and every second, each generator talks to etcd to hold its worker lease and extend its reservation, described next." },
      { t: "h", text: "Deep dives" },
      { t: "p", html: "<b>1. Leasing worker IDs safely.</b> Uniqueness depends on no two live processes sharing a (region, worker) pair. Static config files fail in autoscaling fleets, so worker IDs are leased: a starting node grants itself a 10-second etcd lease and tries worker IDs 0 to 127 with a transaction that creates <code>/idgen/region-2/owner/n</code>, attached to the lease, only if it does not exist. It renews the lease every second, together with the reservation described below. If renewal has not succeeded for 7 seconds by its own clock, it stops serving IDs and reports unhealthy <em>before</em> etcd can expire the lease and hand the ID to someone else. A crashed node's key disappears when its lease expires, so the worker ID returns to the pool automatically." },
      { t: "diagram", caption: "A new holder of worker 17 waits until its clock passes the previous holder's reservation, so it can never reuse a millisecond the previous holder might have used.", code: `sequenceDiagram
  participant N as New generator
  participant E as etcd
  participant C as Local clock
  N->>E: grant lease, TTL 10 s
  N->>E: create owner/17 if absent, attached to lease
  E-->>N: success
  N->>E: read reserved/17
  E-->>N: reserved_until_ms = T from the previous holder
  N->>C: read current time
  alt clock is not yet past T
    N->>N: wait, serve nothing
  end
  N->>E: if still owner, set reserved/17 to now + 2 s
  Note over N,E: every second: renew the lease and extend the reservation
  N->>N: issue IDs only with timestamps at most the reservation` },
      { t: "p", html: "The reservation closes a subtle hole. Suppose worker 17's previous holder died and its clock was 50 ms ahead of the new node's. Without a reservation, the new holder could issue IDs in milliseconds the old one already used, with the same worker ID, and produce duplicates. Each holder therefore sets <code>reserved/17</code> to now + 2 s every second, using a transaction that succeeds only while <code>owner/17</code> is still attached to its own lease ID, and never issues an ID with a timestamp beyond the reservation. A new holder waits until its own clock passes the stored value before serving. Since the old holder's IDs carry timestamps no later than T by its own clock and the new holder's carry timestamps after T by its clock, the two can never overlap, whatever the skew between them. A paused zombie that wakes up after losing the lease cannot extend the reservation, so it runs out of usable milliseconds almost immediately. Restarts on the same machine work the same way, so no local disk state is needed." },
      { t: "p", html: "<b>2. Clocks.</b> Run chrony in slew mode with a maximum offset alarm: if a node's offset from its time sources exceeds 20 ms, it marks itself unhealthy and drains. In the generator, read time as the wall clock captured at startup plus a monotonic clock's elapsed time, so NTP steps and leap-second handling cannot make time go backwards while the process runs; re-anchor gradually if the two diverge. If time still appears to go backwards, wait when the gap is under 10 ms and refuse with an error above that; the client simply retries on another node. Ordering across regions is only as good as clock agreement, a few milliseconds, which is why the requirement says roughly time-ordered." },
      { t: "p", html: "<b>3. Library or service.</b> Embedding the generator as a library in every service removes the network hop, but then every pod needs a worker ID: a few thousand pods per region and frequent autoscaling would exhaust 128 IDs and hammer etcd with lease churn. A dedicated service keeps the generator count small and stable and the bit budget comfortable, at the cost of about 0.5 ms per call, which batching hides. Services with extreme rates, such as the chat service issuing message IDs, can still embed the library with a reserved block of worker IDs. Batching does not break ordering in any way that matters: a batch of 100 IDs is generated at one moment and handed out over the next few milliseconds, well within the roughly ordered guarantee." },
      { t: "h", text: "Trade-offs and bottlenecks" },
      { t: "table", head: ["Option", "Unique without coordination?", "Time-sorted?", "64-bit?", "Why not chosen, or when to use it"], rows: [
        ["Snowflake service (chosen)", "Yes, after a one-time worker lease", "Yes, k-sorted", "Yes", "Meets every requirement; costs a small service plus etcd"],
        ["DB auto-increment or ticket server", "No: every ID or batch hits one DB", "Yes", "Yes", "Fails availability during a regional partition unless split into per-region ranges"],
        ["Segment allocation from a DB", "Mostly: one DB call per 1,000 IDs", "Only within a segment", "Yes", "Good when compact, mostly increasing integers from an existing database matter more than time order"],
        ["UUID v7", "Yes, fully", "Yes, to the ms", "No: 128-bit", "Best choice if 128 bits were allowed: no worker IDs, no service"],
        ["UUID v4", "Yes, fully", "No", "No: 128-bit", "Random index inserts; use for public, unguessable tokens instead"]
      ] },
      { t: "list", items: [
        "<b>etcd is off the per-ID path but not off the critical path</b>: no ID request touches etcd, but a generator that cannot extend its reservation stops within about 2 s, which is the price of safety. To ride out short etcd outages, reserve further ahead (say 30 s) with a longer lease. The cost is that a node taking over a recently used worker ID may wait up to 30 s, so new nodes should prefer worker IDs that have been idle longest. Run etcd as 5 nodes across AZs.",
        "<b>Information leakage</b>: IDs reveal creation time, and the sequence hints at volume. For public URLs, expose a separate random token or encrypt the ID with a fixed-key 64-bit block cipher.",
        "<b>Bit budget is a one-way door</b>: changing the layout later breaks ordering and decoding, so leave headroom (128 workers per region, 4,096 per ms) and document the epoch."
      ] }
    ],
    followups: [
      "A product team needs 2,000 generator processes in one region. How would you re-split the 64 bits, and what do you give up?",
      "Finance requires order IDs that are strictly increasing with no gaps. Can this design provide that? What would?",
      "A VM live-migrates and its clock comes back 2 seconds behind. Walk through exactly what your generator does.",
      "How would you migrate an existing system that uses auto-increment IDs to this scheme without breaking clients that sort by ID?",
      "Your IDs appear in public URLs, and a competitor is estimating your daily order volume from them. What do you change?"
    ]
  }
];

module.exports = {
  id: "advanced-techniques",
  num: 14,
  part: 6,
  title: "Advanced Techniques and Data Structures",
  tagline: "Unique IDs, sketches, Merkle trees, geo indexes and CRDTs: tools for the hard parts.",
  level: "Advanced",
  lessons,
  takeaways,
  mcqs,
  design
};
