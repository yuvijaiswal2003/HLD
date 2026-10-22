module.exports = {
  id: "replication-sharding",
  num: 7,
  part: 3,
  title: "Replication, Partitioning and Consistent Hashing",
  tagline: "Copy data for safety and speed, split it for scale, and know what breaks when you do.",
  level: "Intermediate",
  lessons: [
    {
      id: "leader-follower",
      title: "Why replicate: leader-follower and sync vs async",
      minutes: 10,
      blocks: [
        { t: "p", html: "<b>Replication</b> means keeping copies of the same data on several machines. You do it for four reasons: <b>availability</b> (keep serving when a machine dies), <b>read scaling</b> (spread reads over many copies), <b>latency</b> (put a copy near users in another region) and <b>durability</b> (an acknowledged write exists in more than one place). Copying data once is easy. The hard part is handling changes, and there are three ways to do it." },
        { t: "table", head: ["Approach", "Who accepts writes", "Examples", "Main risk"], rows: [
          ["<b>Single-leader</b> (leader-follower)", "One leader per dataset or partition", "PostgreSQL, MySQL, MongoDB replica sets, Redis, Kafka partitions", "Replica lag and failover"],
          ["<b>Multi-leader</b>", "Several leaders, usually one per region or device", "DynamoDB global tables, CouchDB, PostgreSQL BDR", "Write conflicts"],
          ["<b>Leaderless</b> (Dynamo-style)", "Any replica; clients write to several at once", "Cassandra, ScyllaDB, Riak", "Stale reads, conflicts, repair work"]
        ] },
        { t: "h", text: "Leader-follower replication" },
        { t: "p", html: "One replica is the <b>leader</b> (also called primary or master). Every write goes to it. The leader records each change in its replication log and streams the log to the <b>followers</b> (replicas, secondaries, standbys), which apply the changes in the same order. Reads can go to the leader or to any follower. Because there is a single place where writes are ordered, there are no write conflicts. This is the default in PostgreSQL streaming replication, MySQL binlog replication and MongoDB replica sets." },
        { t: "diagram", caption: "One leader orders all writes; one follower is synchronous for safety, the others are asynchronous for read scale and a regional copy.", code: `flowchart LR
  W(("Writes")) --> L[("Leader<br/>us-east-1a")]
  L -->|"sync: wait for ack"| F1[("Follower<br/>us-east-1b")]
  L -.->|"async"| F2[("Follower<br/>us-east-1c")]
  L -.->|"async, cross-region"| F3[("Follower<br/>eu-west-1")]
  R(("Reads")) --> F1
  R --> F2
  R --> F3` },
        { t: "h", text: "Synchronous, asynchronous and semi-synchronous" },
        { t: "table", head: ["Mode", "Leader waits for", "If the leader dies", "Cost", "Where you see it"], rows: [
          ["<b>Asynchronous</b>", "Only its own local commit", "Acknowledged writes not yet shipped are <b>lost</b>", "Fastest; a slow follower never blocks writes", "Default in PostgreSQL and MySQL replication"],
          ["<b>Synchronous</b> (all followers)", "Every follower to confirm", "No acknowledged write is lost", "Any one slow or dead follower stalls every write", "Rarely used for all followers"],
          ["<b>Semi-synchronous</b> (one or a quorum)", "At least one follower, or a majority, to confirm", "No loss, provided you promote a follower that confirmed", "One extra round trip per commit", "PostgreSQL <code>synchronous_standby_names = 'ANY 1 (s1, s2)'</code>; MySQL semi-sync; MongoDB <code>w: \"majority\"</code>"]
        ] },
        { t: "diagram", caption: "With one synchronous follower, COMMIT returns only when the write exists on two machines; the async follower catches up in the background.", code: `sequenceDiagram
  participant C as Client
  participant L as Leader
  participant F1 as Sync follower
  participant F2 as Async follower
  C->>L: COMMIT
  L->>L: write and fsync local WAL
  L->>F1: stream WAL record
  L->>F2: stream WAL record
  F1-->>L: ack, record flushed to disk
  L-->>C: OK, durable on two machines
  F2-->>L: ack arrives later, nobody waits for it` },
        { t: "numbers", items: [
          { value: "~0.5 to 2 ms", label: "Extra commit latency for a sync follower in another availability zone" },
          { value: "60 to 150 ms", label: "Extra commit latency for a sync follower in another region" },
          { value: "under 1 s", label: "Typical lag of a healthy async follower in the same region" }
        ] },
        { t: "p", html: "Two details matter in interviews. MySQL's semi-sync replica acknowledges once the change is in its relay log, meaning received, not yet applied. If no acknowledgment arrives within <code>rpl_semi_sync_source_timeout</code> (10 seconds by default), the source silently falls back to asynchronous replication, so monitor that state. In PostgreSQL, <code>synchronous_commit = remote_apply</code> waits until the standby has <em>applied</em> the change, so a read on that standby immediately afterwards sees it." },
        { t: "h", text: "What travels in the replication log" },
        { t: "table", head: ["Log format", "What it ships", "Strength", "Weakness"], rows: [
          ["Statement-based", "The SQL text, such as <code>UPDATE ... SET n = n + 1</code>", "Compact", "Nondeterministic functions such as <code>NOW()</code> and <code>RAND()</code> diverge; MySQL moved to row-based as the default in 5.7"],
          ["Physical (WAL shipping)", "Byte-level page changes from the storage engine", "Exact copy, low overhead; PostgreSQL streaming replication", "Leader and followers must run the same major version, and you cannot filter tables"],
          ["Logical (row-based)", "Row images: inserted values, plus keys and new values of changed rows", "Works across versions and engines; feeds change data capture (Debezium, Chapter 9)", "More bytes for bulk updates; DDL handling varies"]
        ] },
        { t: "p", html: "To add a follower without downtime: take a consistent snapshot that records its exact log position (PostgreSQL <code>pg_basebackup</code>, MySQL's clone plugin or XtraBackup with a GTID position), copy it to the new machine, then stream the log from that position until it catches up." },
        { t: "callout", kind: "warn", title: "A replica is not a backup", html: "An accidental <code>DROP TABLE</code> or a buggy <code>UPDATE</code> without a <code>WHERE</code> clause replicates to every follower within milliseconds. Keep point-in-time backups (Chapter 12). A delayed replica (PostgreSQL <code>recovery_min_apply_delay</code>, MySQL <code>SOURCE_DELAY</code>) set an hour behind is a cheap extra safety net." },
        { t: "callout", kind: "interview", title: "State the durability you are buying", html: "'Writes go to the primary and replicate to two read replicas. One replica in another AZ is semi-synchronous, so every acknowledged write exists on two machines and failover loses nothing. The cross-region replica is async because a 100 ms commit penalty is not worth it for this data.'" }
      ]
    },
    {
      id: "replication-lag",
      title: "Replication lag and its anomalies",
      minutes: 10,
      blocks: [
        { t: "p", html: "Asynchronous followers lag behind the leader. On a healthy system the lag is milliseconds to under a second, but it can grow to seconds or minutes under heavy write load, during a long-running query on the replica, or when the network degrades. While it lasts, reads from a follower can return stale data. Calling the system <b>eventually consistent</b> is true but vague. Interviewers want three specific guarantees, each with a targeted fix." },
        { t: "h", text: "Read-your-writes" },
        { t: "p", html: "<b>Read-your-writes</b> (also called read-after-write consistency) promises that after a user writes something, that user's own reads reflect it. Other users may still see the old value for a while." },
        { t: "diagram", caption: "The write is committed on the leader, but the very next read lands on a follower that has not replayed it yet.", code: `sequenceDiagram
  participant U as User
  participant App as App server
  participant L as Leader
  participant F as Lagging follower
  U->>App: save display name Ana
  App->>L: UPDATE users SET name = Ana
  L-->>App: committed at LSN 5120
  App-->>U: 200 saved
  U->>App: reload profile
  App->>F: SELECT name FROM users
  F-->>App: old name, replayed only up to LSN 5000
  App-->>U: page shows the old name
  L->>F: LSN 5120 arrives two seconds later` },
        { t: "list", items: [
          "<b>Read your own data from the leader.</b> Profile pages read the viewer's own profile from the leader and other people's profiles from followers. This is simple and enough for most products.",
          "<b>Pin to the leader for a short window.</b> For a few seconds after a user writes (say twice the p99 lag), route that user's reads to the leader.",
          "<b>Carry a position token.</b> The write returns its log position (PostgreSQL LSN, MySQL GTID, a version number). The client sends it back with later reads, and a follower serves the read only if it has replayed that far; otherwise the read goes to the leader or waits briefly. MongoDB's causally consistent sessions do this for you with <code>afterClusterTime</code>.",
          "<b>Cross-device reads</b> need the token stored server-side, keyed by user ID, because a cookie on the phone does not help the laptop."
        ] },
        { t: "h", text: "Monotonic reads" },
        { t: "p", html: "<b>Monotonic reads</b> promises that a user never sees time move backwards. Without it, a user sees a new comment, refreshes, hits a replica that is further behind, and the comment vanishes. The fix is to route each user's reads to the same replica, for example by hashing the user ID, and to fail over to another replica only if that one is down. A position token works too: never serve a user from a replica older than the newest position they have already seen." },
        { t: "code", lang: "python", code: `def read_profile(user_id, session):
    min_lsn = session.get("last_write_lsn")    # set when this user last wrote
    replica = replicas[hash(user_id) % len(replicas)]   # sticky: monotonic reads
    if min_lsn is None or replica.replayed_lsn() >= min_lsn:
        return replica.query(PROFILE_SQL, user_id)       # caught up: read-your-writes
    return leader.query(PROFILE_SQL, user_id)            # too far behind: use leader` },
        { t: "h", text: "Consistent prefix reads" },
        { t: "p", html: "<b>Consistent prefix reads</b> promises that if writes happened in a certain order, anyone reading them sees them in that order. It breaks mainly in partitioned databases, where each partition replicates on its own schedule. If a question is stored on partition 1 and its answer on partition 2, and partition 1 is lagging, an observer can see the answer before the question. The fix is to keep causally related writes in the same partition (partition a conversation's messages by <code>conversation_id</code>) or to track causal dependencies explicitly (causal consistency, Chapter 8)." },
        { t: "table", head: ["Guarantee", "Symptom when broken", "Typical fix", "Cost"], rows: [
          ["Read-your-writes", "My edit disappears right after I save", "Read own data from the leader, or require a replica caught up to my write position", "More load on the leader, or a token to track"],
          ["Monotonic reads", "Data appears, then disappears on refresh", "Stick each user to one replica, or track the newest position seen", "Uneven replica load; fallback handling"],
          ["Consistent prefix", "An answer is visible before its question", "Keep related writes in one partition, or track causal order", "Constrains the partition key"]
        ] },
        { t: "callout", kind: "warn", title: "Watch lag, and stop sending reads to laggards", html: "Alert on replication lag, and take a replica out of the read pool when it falls too far behind. ProxySQL's <code>max_replication_lag</code> and health checks that compare the replica's replay position with the leader's both do this. Otherwise one slow replica quietly serves minutes-old data to a third of your users." },
        { t: "callout", kind: "interview", title: "The most common follow-up in this area", html: "'A user updates their profile and still sees the old one.' Name the guarantee (read-your-writes), then give the cheapest targeted fix: 'Reads of your own profile go to the primary, or to a replica whose replay LSN is at least the LSN of your last write. Everyone else's profile can be served from any replica.' Don't propose synchronous replication everywhere." }
      ]
    },
    {
      id: "failover-split-brain",
      title: "Failover and split brain",
      minutes: 10,
      blocks: [
        { t: "p", html: "When a follower fails, recovery is easy: it restarts, reads the last log position it applied, and catches up from the leader. When the leader fails, one follower must become the new leader, clients must start sending writes to it, and the other followers must replicate from it. That is <b>failover</b>, and most replication incidents happen during it." },
        { t: "steps", items: [
          { title: "Detect the failure", html: "Nodes exchange heartbeats. If the leader misses them for a timeout (commonly 10 to 30 seconds), it is declared dead. There is no reliable way to tell a crashed node from a slow one or an unreachable one." },
          { title: "Choose a new leader", html: "Prefer the replica with the most recent data (the highest replayed log position), and with semi-sync, one that acknowledged every commit. The choice should come from a majority vote or a consensus store, not from a single watcher process." },
          { title: "Reroute clients", html: "Update whatever clients use to find the leader: a virtual IP, a DNS record, a proxy such as HAProxy or ProxySQL, or service discovery. Other followers start replicating from the new leader." },
          { title: "Fence the old leader", html: "Make sure the old leader cannot keep accepting writes if it comes back: it must find out that it was demoted and rejoin as a follower, discarding any writes the new leader never received." }
        ] },
        { t: "p", html: "Tools automate this. <b>Patroni</b> keeps a PostgreSQL leader key with a TTL in etcd, Consul or ZooKeeper; a primary that cannot renew the key demotes itself. <b>Orchestrator</b> does topology management and failover for MySQL. MongoDB replica sets elect a new primary themselves, typically within about 12 seconds with the default 10-second election timeout. Amazon RDS Multi-AZ fails over to a synchronous standby, typically in one to two minutes." },
        { t: "h", text: "What goes wrong" },
        { t: "list", items: [
          "<b>Lost writes.</b> With async replication, the new leader may lack the old leader's last writes. When the old leader returns, its extra writes conflict with new ones and are usually discarded. MongoDB writes them to rollback files; <code>w: \"majority\"</code> prevents acknowledged writes from being rolled back.",
          "<b>Broken references outside the database.</b> If auto-increment IDs are reissued after a lossy failover, caches, search indexes or other services that stored the old IDs now point at the wrong rows.",
          "<b>Timeout tuning.</b> Too short a timeout causes unnecessary failovers during load spikes or GC pauses, and a failover adds load at the worst moment. Too long a timeout means a longer outage.",
          "<b>Split brain.</b> Two nodes both believe they are the leader and both accept writes."
        ] },
        { t: "callout", kind: "example", title: "GitHub, October 2018", html: "A 43-second network partition between GitHub's US East Coast hub and its primary East Coast data center led its failover tooling, Orchestrator, to promote database primaries on the West Coast. Some writes accepted on the East Coast had not yet replicated, so each side had writes the other lacked. GitHub chose data integrity over a fast recovery and ran degraded for just over 24 hours while it restored and reconciled the data." },
        { t: "h", text: "Preventing split brain" },
        { t: "p", html: "Split brain is dangerous because two leaders produce two divergent histories that usually cannot be merged automatically. Shorter timeouts make it more likely, not less. The real defenses are structural:" },
        { t: "list", items: [
          "<b>Majority-based leadership.</b> Elect the leader through a quorum of at least three voters in different failure domains (etcd, ZooKeeper, or Raft inside the database). A node on the minority side of a partition cannot win or keep leadership.",
          "<b>Leases.</b> Leadership is a lease that must be renewed with the majority every few seconds. A leader that cannot renew stops accepting writes before the lease expires, so by the time a new leader is chosen, the old one has stepped down.",
          "<b>Fencing.</b> Every leadership change increments an epoch (Raft calls it a term). Replicas and storage reject anything stamped with an older epoch. In the bluntest form, STONITH ('shoot the other node in the head'), the cluster powers off the old leader. Fencing tokens are covered in Chapter 8."
        ] },
        { t: "diagram", caption: "The old primary is cut off from the majority, cannot renew its lease and demotes itself, and writes stamped with the old epoch are refused.", code: `flowchart LR
  subgraph Minority["Minority side of the partition"]
    OldP[("Old primary, epoch 7")]
    E1["etcd member 1"]
  end
  subgraph Majority["Majority side"]
    E2["etcd member 2"]
    E3["etcd member 3"]
    NewP[("New primary, epoch 8")]
    Rep[("Replica")]
  end
  OldP -.->|"lease renewal fails, steps down"| E1
  E2 -->|"majority grants lease"| NewP
  NewP -->|"replicates with epoch 8"| Rep
  OldP -.->|"epoch 7 stream rejected"| Rep` },
        { t: "callout", kind: "interview", title: "Walk through failover out loud", html: "Cover detection (heartbeat timeout and why its value matters), election (most up-to-date replica, chosen by a quorum), rerouting (VIP, DNS or proxy) and fencing (epochs or leases so the old primary cannot write). Then state the RPO: 'with semi-sync, zero acknowledged writes lost; with async, up to the replication lag.'" }
      ]
    },
    {
      id: "multi-leader-conflicts",
      title: "Multi-leader replication and conflict resolution",
      minutes: 10,
      blocks: [
        { t: "p", html: "In <b>multi-leader</b> replication, several nodes accept writes, and each one replicates its changes to the others asynchronously. Three situations call for it. In <b>multi-region</b> deployments, each region has a leader, so writes are local and fast and every region keeps working if another goes dark. In <b>offline-capable clients</b>, each device is effectively a leader (a calendar or notes app on a phone). In <b>collaborative editing</b>, every user's local copy accepts edits." },
        { t: "p", html: "The price is <b>write conflicts</b>. If two leaders change the same record before they hear about each other's change, both writes have already been acknowledged, and the system has to end up with one answer anyway. Examples include DynamoDB global tables, CouchDB and PouchDB, and EDB Postgres Distributed (formerly BDR). Cassandra's multi-datacenter mode is leaderless rather than multi-leader, but it faces the same conflicts." },
        { t: "diagram", caption: "Each region acknowledges its own write immediately, so the conflict is only discovered when replication delivers the other region's version.", code: `flowchart LR
  subgraph US["Region us-east"]
    UA(("User A")) -->|"title = Q3 plan"| LUS[("Leader us-east")]
  end
  subgraph EU["Region eu-west"]
    UB(("User B")) -->|"title = Q3 roadmap"| LEU[("Leader eu-west")]
  end
  LUS -.->|"async replication"| LEU
  LEU -.->|"async replication"| LUS
  LUS --> CR["Conflict: two committed titles<br/>resolve or merge"]
  LEU --> CR` },
        { t: "h", text: "Ways to resolve conflicts" },
        { t: "table", head: ["Strategy", "How it works", "Loses data?", "Used by"], rows: [
          ["<b>Conflict avoidance</b>", "Route every write for a given record to one home leader, such as the user's home region", "No, unless the home changes during a failover", "The most common practical choice"],
          ["<b>Last write wins (LWW)</b>", "Keep the version with the highest timestamp and discard the rest", "<b>Yes</b>, silently. Clock skew can even let the older write win", "Cassandra (per cell), DynamoDB global tables by default"],
          ["<b>Keep siblings</b>", "Detect concurrent versions with version vectors, store all of them, and merge on read or ask the user", "No, but the application must write merge logic", "Riak, CouchDB conflicting revisions, the original Dynamo"],
          ["<b>CRDTs</b>", "Use data types whose merge is commutative, associative and idempotent, so all replicas converge automatically", "No, for the operations the type supports", "Riak data types, Redis Enterprise Active-Active, Automerge and Yjs"]
        ] },
        { t: "h", text: "Version vectors: telling 'newer' from 'concurrent'" },
        { t: "p", html: "A timestamp can say which write came later by the clock, but not whether one writer had <em>seen</em> the other's write. A <b>version vector</b> keeps one counter per replica, such as <code>{us: 3, eu: 1}</code>. Each replica increments its own entry when it accepts a write. When comparing two versions: if every entry of A is greater than or equal to the matching entry of B, A supersedes B and B can be dropped. If each has an entry larger than the other's (<code>{us: 3, eu: 1}</code> versus <code>{us: 2, eu: 2}</code>), the writes were <b>concurrent</b>, and both must be kept as siblings. Vector clocks and causality are covered in depth in Chapter 8." },
        { t: "h", text: "CRDTs at a high level" },
        { t: "p", html: "A <b>CRDT</b> (conflict-free replicated data type) builds the merge into the data type. The simplest is a grow-only counter: each replica counts only its own increments, the value is the sum, and merging takes the maximum of each replica's entry. Merges can happen in any order and any number of times, and every replica still ends up with the same total. Richer CRDTs exist for counters that go down (PN-Counter), sets (OR-Set), maps, and text sequences for collaborative editors (Chapter 14)." },
        { t: "code", lang: "python", code: `class GCounter:
    """Grow-only counter CRDT: one slot per replica, merge takes the max."""
    def __init__(self, replica_id):
        self.id = replica_id
        self.counts = {}                    # replica_id -> increments made there

    def increment(self, n=1):
        self.counts[self.id] = self.counts.get(self.id, 0) + n

    def value(self):
        return sum(self.counts.values())

    def merge(self, other):                 # order and repetition do not matter
        for rid, c in other.counts.items():
            self.counts[rid] = max(self.counts.get(rid, 0), c)

us, eu = GCounter("us"), GCounter("eu")
us.increment(3); eu.increment(2)            # concurrent, while partitioned
us.merge(eu); eu.merge(us); us.merge(eu)    # repeated merges are harmless
assert us.value() == eu.value() == 5        # no increment lost` },
        { t: "callout", kind: "example", title: "Amazon's shopping cart", html: "The 2007 Dynamo paper describes Amazon's cart. When replicas held concurrent versions of a cart, the application merged them by taking the union of items. 'Add to cart' was never lost, which mattered most to the business, at the cost that an item the customer had deleted could occasionally reappear." },
        { t: "callout", kind: "warn", title: "LWW is data loss by design", html: "Under last write wins, two writes that were both acknowledged can end with one silently discarded. That is fine for a 'last seen at' timestamp or a cache entry, and wrong for a bank balance or a document body. If you choose LWW, say so out loud and say why losing a concurrent write is acceptable for that data." },
        { t: "callout", kind: "interview", title: "Avoid conflicts before you resolve them", html: "The best answer usually avoids multi-leader conflicts: 'Each user has a home region, and all writes to that user's data go to its leader there. Other regions serve local reads from async replicas. Only if we truly need concurrent writes to the same record, such as a shared counter, do I use a CRDT.'" }
      ]
    },
    {
      id: "leaderless-quorums",
      title: "Leaderless replication and quorums",
      minutes: 12,
      blocks: [
        { t: "p", html: "Amazon's 2007 Dynamo paper popularized a design with no leader at all. Riak, Cassandra, ScyllaDB and Voldemort follow it. The client, or a <b>coordinator</b> node acting for it, sends each write to all N replicas of the key and treats it as successful once W of them acknowledge. A read asks R replicas and returns the newest version among the responses, judged by a version number or timestamp. There is no failover, because no node is special: a dead replica simply stops answering, and the others carry on." },
        { t: "callout", kind: "warn", title: "DynamoDB is not Dynamo", html: "Despite the name, the DynamoDB service is not leaderless. Each partition's three replicas elect a leader with Multi-Paxos. The leader handles writes and strongly consistent reads, and it acknowledges a write once a quorum of replicas has logged it. Say 'Dynamo-style' when you mean Cassandra or Riak." },
        { t: "h", text: "Quorum math" },
        { t: "p", html: "If <b>R + W &gt; N</b>, the set of replicas a read contacts must overlap with the set that acknowledged the latest successful write, so at least one response carries the newest value. Writes keep working while <b>N - W</b> replicas are down, and reads keep working while <b>N - R</b> are down. A <b>majority quorum</b> is <code>floor(N/2) + 1</code>: 2 of 3, 3 of 5." },
        { t: "diagram", caption: "The write reached two of three replicas; any two-replica read must include at least one of them, and the coordinator repairs the stale copy it saw.", code: `sequenceDiagram
  participant C as Client
  participant Co as Coordinator
  participant R1 as Replica 1
  participant R2 as Replica 2
  participant R3 as Replica 3
  Note over R1,R3: N = 3, W = 2, R = 2. Replica 3 was down during the write.
  C->>Co: write cart = v2
  Co->>R1: write v2
  Co->>R2: write v2
  R1-->>Co: ack
  R2-->>Co: ack
  Co-->>C: OK, W = 2 reached
  C->>Co: read cart
  Co->>R2: read
  Co->>R3: read
  R2-->>Co: v2
  R3-->>Co: v1, stale
  Co-->>C: v2, the newest version wins
  Co->>R3: read repair, write v2` },
        { t: "table", head: ["N, W, R", "R + W &gt; N?", "Writes survive", "Reads survive", "Character"], rows: [
          ["3, 2, 2", "Yes", "1 node down", "1 node down", "The balanced default"],
          ["3, 3, 1", "Yes", "0 nodes down", "2 nodes down", "Fast reads, but any single failure blocks writes"],
          ["3, 1, 3", "Yes", "2 nodes down", "0 nodes down", "Fast writes, fragile reads"],
          ["3, 1, 1", "No", "2 nodes down", "2 nodes down", "Lowest latency, eventual consistency only"],
          ["5, 3, 3", "Yes", "2 nodes down", "2 nodes down", "More fault tolerance, more copies to pay for"]
        ] },
        { t: "p", html: "Cassandra sets the replication factor per keyspace and per datacenter, and lets each query choose its <b>consistency level</b>: <code>ONE</code>, <code>QUORUM</code> (a majority of all replicas), <code>LOCAL_QUORUM</code> (a majority within the coordinator's datacenter, avoiding cross-region latency), <code>EACH_QUORUM</code> (a majority in every datacenter), <code>ALL</code>, and <code>ANY</code> for writes. Drivers commonly default to <code>ONE</code> or <code>LOCAL_ONE</code>, which gives no overlap guarantee." },
        { t: "h", text: "Quorums are not linearizability" },
        { t: "list", items: [
          "<b>Sloppy quorums</b> (below) can put the W acknowledgments on nodes outside the key's N home replicas.",
          "<b>Concurrent writes under LWW</b>: with clock skew between writers, the write that really happened second can lose.",
          "<b>A read during a write</b> can see the new value on one replica and the old value on another, and two readers can disagree.",
          "<b>A failed write is not rolled back</b>: if a write reached fewer than W replicas, the client sees an error, but the replicas that did apply it keep it, and later reads may return it.",
          "<b>Restoring a replica from a stale copy</b>: if the node that held the new value dies and is rebuilt from an older replica, fewer than W nodes now hold that value."
        ] },
        { t: "h", text: "How leaderless replicas converge" },
        { t: "list", items: [
          "<b>Read repair</b>: when a read finds replicas disagreeing, the coordinator writes the newest version back to the stale ones. In Cassandra this happens on digest mismatch for reads above <code>ONE</code>. Read repair only fixes data that somebody reads.",
          "<b>Hinted handoff</b>: if a replica is down during a write, the coordinator stores a <em>hint</em> and replays it when the replica returns. Cassandra keeps hints for up to 3 hours by default (<code>max_hint_window</code>); a node that is down for longer needs a full repair.",
          "<b>Anti-entropy</b>: a background process compares replicas and copies missing data. Cassandra's <code>nodetool repair</code> compares Merkle trees, hash trees that pinpoint which key ranges differ (Chapter 14). Run it more often than <code>gc_grace_seconds</code> (10 days by default), or deleted data can come back from a replica that missed the tombstone."
        ] },
        { t: "p", html: "<b>Sloppy quorum.</b> In Dynamo and Riak, if some of a key's home replicas are unreachable, the write is accepted by other healthy nodes, which hold it with a hint and hand it off once the home nodes recover. This increases write availability during partitions, but a read quorum of home nodes may not include those stand-ins, so <code>R + W &gt; N</code> stops guaranteeing a fresh read until handoff completes. Cassandra stores hints too, but hints do not count toward the consistency level, except for <code>ANY</code>." },
        { t: "callout", kind: "interview", title: "Quote the numbers, then the caveats", html: "'Replication factor 3 per region, LOCAL_QUORUM for both reads and writes: 2 + 2 &gt; 3, so a read in the same region sees the latest acknowledged write, and we tolerate one replica down per region. It is still not linearizable, and we use LWW per cell, so concurrent writes to the same field keep only one of them.'" }
      ]
    },
    {
      id: "partitioning",
      title: "Partitioning: range, hash and directory",
      minutes: 12,
      blocks: [
        { t: "p", html: "<b>Partitioning</b>, usually called <b>sharding</b>, splits a dataset so that each node holds only part of it. You need it once the data, or the write throughput, outgrows what one machine can handle. Replication still applies: each partition has replicas on several nodes, and each node holds replicas of many partitions. Every system uses its own name: shard, partition, region (HBase), tablet (Bigtable), range (CockroachDB), chunk (MongoDB), vnode (Cassandra), vBucket (Couchbase)." },
        { t: "h", text: "Three ways to assign keys to partitions" },
        { t: "table", head: ["Strategy", "How a key is placed", "Good at", "Bad at", "Examples"], rows: [
          ["<b>Range</b>", "Contiguous key ranges per partition, such as A to F; boundaries move as data grows", "Range scans and ordered reads; splitting hot ranges", "Sequential keys such as timestamps or auto-increment send all writes to one partition", "HBase, Bigtable, CockroachDB, TiKV, MongoDB ranged sharding"],
          ["<b>Hash</b>", "<code>hash(key)</code> picks the partition, often through consistent hashing", "Spreading load evenly, even for sequential keys", "Range queries across keys must ask every partition", "Cassandra, DynamoDB, MongoDB hashed sharding, Redis Cluster"],
          ["<b>Directory</b> (lookup)", "A lookup table maps each key, or tenant, to a partition", "Moving single tenants, isolating big ones, data residency", "The directory sits in the request path and must be fast and highly available", "Vitess lookup vindexes, many multi-tenant SaaS products"]
        ] },
        { t: "p", html: "<b>Range partitioning</b> keeps neighboring keys together, so 'all events from 10:00 to 10:05' is a single scan. But a key that always increases, such as a timestamp, sends every new write to the last range. The usual fix is to lead the key with something that spreads writes, such as <code>(sensor_id, timestamp)</code>, accepting that a time scan across all sensors must touch every range." },
        { t: "p", html: "<b>Hash partitioning</b> destroys order on purpose, which is what spreads the load. A <b>compound key</b> gets you both: Cassandra hashes the partition key to pick the nodes, then keeps rows sorted by clustering columns inside the partition, so 'messages in channel 7, newest first' is a cheap range read inside one partition. Never use <code>hash(key) % number_of_nodes</code>; the last lesson of this chapter shows why." },
        { t: "p", html: "<b>Directory-based partitioning</b> trades a lookup for flexibility. A tenant can move to a new shard by copying its data and updating one row. The directory must be cached on every router, versioned so stale caches are detected, and replicated so it is never a single point of failure. A related trick is to embed the shard in the ID: Instagram's IDs carry a 13-bit logical shard number, so any server can route an ID without a lookup." },
        { t: "h", text: "Hot spots and the celebrity problem" },
        { t: "p", html: "Hashing spreads <em>different</em> keys across partitions, but every request for the <em>same</em> key still lands on one partition. A celebrity's post, a viral product or a whale tenant can overload a single partition while the rest of the cluster idles. DynamoDB, for example, caps a single partition at about 3,000 read units and 1,000 write units per second." },
        { t: "list", items: [
          "<b>Split the hot key</b>: write to <code>likes:post42:0</code> through <code>likes:post42:99</code> at random, and read by summing the sub-keys or from a cached total. Writes spread 100 ways, and reads cost 100 lookups, so apply this only to keys known to be hot.",
          "<b>Cache hot reads</b> in Redis or in process memory, with request coalescing (Chapter 5).",
          "<b>Treat celebrities differently</b>: for example, fan out a celebrity's posts on read instead of on write (Chapter 16).",
          "<b>Isolate whales</b>: give the biggest tenants dedicated shards through the directory.",
          "<b>Let the system split by load</b>: DynamoDB splits hot partitions, and CockroachDB does load-based range splitting. Neither can split a single hot key."
        ] },
        { t: "code", lang: "python", code: `import random
SHARDS = 100  # only for keys known to be hot

def incr_like(kv, post_id):
    kv.incr(f"likes:{post_id}:{random.randrange(SHARDS)}")   # spread the writes

def get_likes(kv, post_id):
    keys = [f"likes:{post_id}:{i}" for i in range(SHARDS)]
    return sum(int(v or 0) for v in kv.mget(keys))            # gather on read; cache it` },
        { t: "h", text: "Secondary indexes on partitioned data" },
        { t: "p", html: "A partition key answers 'get by ID' with a single partition. A query by any other attribute, such as 'all red products', needs a secondary index, and that index must be partitioned too. There are two ways to do it." },
        { t: "diagram", caption: "A local index makes every secondary query hit every partition; a global index answers from one index partition but must be updated on writes elsewhere.", code: `flowchart LR
  subgraph LocalIdx["Local index: scatter and gather"]
    QL["Query color = red"] --> P1["Partition 1<br/>rows and their index"]
    QL --> P2["Partition 2<br/>rows and their index"]
    QL --> P3["Partition 3<br/>rows and their index"]
  end
  subgraph GlobalIdx["Global index: one lookup, then fetch"]
    QG["Query color = red"] --> IX["Index partition for red<br/>ids 17, 802, 9311"]
    IX --> D1["Data partition 1"]
    IX --> D3["Data partition 3"]
  end` },
        { t: "compare", items: [
          { title: "Local index (document-partitioned)", pros: ["A write updates only its own partition's index, in the same local transaction", "Simple and always consistent with the data"], cons: ["Every secondary-key query fans out to all partitions", "Tail latency follows the slowest partition; capacity does not grow as you add partitions"], use: "Write-heavy data with occasional secondary queries: MongoDB and Cassandra secondary indexes, Elasticsearch shards." },
          { title: "Global index (term-partitioned)", pros: ["A secondary-key query reads one index partition", "Read capacity scales with the index"], cons: ["One write can touch several partitions", "Updated either asynchronously (stale reads) or with a distributed transaction (slower writes)"], use: "Read-heavy lookups by another attribute: DynamoDB global secondary indexes (asynchronous), CockroachDB and Spanner indexes (transactional)." }
        ] },
        { t: "p", html: "Scatter-gather gets worse with scale. If each partition is slow 1% of the time, a query that must wait for 100 partitions is slow <code>1 - 0.99^100</code>, or about 63%, of the time. That is why high-traffic secondary lookups usually earn a global index or a separate lookup table." },
        { t: "callout", kind: "interview", title: "Choose the partition key from the dominant query", html: "Pick the key that turns the most frequent queries into single-partition operations, then check every other query out loud: 'Fetch a user's orders hits one partition. Find an order by ID needs a global index or an ID that embeds the user. Admin search across all users is a scatter-gather, which is fine at 1 QPS.'" }
      ]
    },
    {
      id: "consistent-hashing-routing",
      title: "Consistent hashing, rebalancing and request routing",
      minutes: 14,
      blocks: [
        { t: "p", html: "The naive way to spread keys is <code>node = hash(key) % N</code>. It balances well, until N changes. A key stays put only if <code>hash % N</code> equals <code>hash % (N + 1)</code>, which is true for only about 1 in N + 1 keys. Growing from 10 to 11 nodes moves about 91% of all keys. For a cache, that is a miss storm that can take down the database behind it. For a database, it means migrating nearly everything." },
        { t: "h", text: "The hash ring" },
        { t: "p", html: "<b>Consistent hashing</b> (Karger et al., 1997, designed for distributed web caches and later the basis of Akamai's CDN) maps both nodes and keys onto the same circular hash space, for example every 64-bit value, with the largest value wrapping back to zero. Each node is placed at the hash of its name, called its <b>token</b>. A key belongs to the first node clockwise from the key's hash. When node E joins, it takes over only the keys between its predecessor and itself, about 1/(N + 1) of the total, and every other key stays where it was. When a node leaves, only its keys move, to its successor." },
        { t: "diagram", caption: "Each key walks clockwise to the next token; a new node E at 40 takes only the keys from 26 to 40, all of which used to belong to C.", code: `flowchart LR
  A["Node A<br/>token 0"] --> B["Node B<br/>token 25"]
  B --> C["Node C<br/>token 50"]
  C --> D["Node D<br/>token 75"]
  D -->|"wraps around"| A
  K1(("key at 10")) -.->|"next clockwise"| B
  K2(("key at 60")) -.->|"next clockwise"| D
  K3(("key at 90")) -.->|"wraps past the top"| A
  E["New node E<br/>token 40"] -.->|"takes keys 26 to 40 from C only"| C` },
        { t: "h", text: "Virtual nodes" },
        { t: "p", html: "With one token per node, random positions leave some nodes with arcs several times larger than others. When a node dies, its whole arc falls on a single neighbor, which may then overload too. Bigger machines also cannot take a bigger share. <b>Virtual nodes</b> fix all three: each physical node is placed at many points on the ring, typically 100 to 256, so its share is the sum of many small arcs. Load evens out, a failed node's keys scatter across many survivors, and a machine with twice the capacity gets twice the virtual nodes." },
        { t: "table", head: ["Virtual nodes per node", "Busiest node vs average (median, range)", "Keys moved when an 11th node joins (median, range)"], rows: [
          ["1", "3.0x (1.8x to 4.4x)", "8% (2% to 31%)"],
          ["16", "1.4x (1.25x to 1.9x)", "12% (8% to 15%)"],
          ["100", "1.15x (1.1x to 1.2x)", "9% (8% to 10%)"],
          ["256", "1.08x (1.04x to 1.13x)", "9% (8% to 10%)"],
          ["<code>hash % N</code>, for comparison", "about 1.0x", "<b>91%</b>"]
        ] },
        { t: "p", html: "These figures come from running the code below with 10 nodes and 50,000 keys over 8 runs. The ideal fraction to move is 1/11, about 9.1%. With few virtual nodes, the share the new node takes is as random as everyone else's, anywhere from 2% to 31%. With 100 or more it stays close to ideal. In every run, every key that moved went to the new node; no keys shuffled between old nodes." },
        { t: "code", lang: "python", code: `import bisect, hashlib

def ring_pos(key):
    # 64-bit position on the ring; md5 is stable across processes, hash() is not
    return int.from_bytes(hashlib.md5(key.encode()).digest()[:8], "big")

class ConsistentHashRing:
    def __init__(self, vnodes=100):
        self.vnodes = vnodes
        self.tokens = []    # sorted ring positions of every virtual node
        self.owner = {}     # ring position -> physical node

    def add_node(self, node):
        for i in range(self.vnodes):
            pos = ring_pos(f"{node}-vn{i}")
            bisect.insort(self.tokens, pos)
            self.owner[pos] = node

    def remove_node(self, node):
        for i in range(self.vnodes):
            pos = ring_pos(f"{node}-vn{i}")
            self.tokens.remove(pos)
            del self.owner[pos]

    def get_node(self, key):
        # first virtual node clockwise from the key, wrapping past the top
        i = bisect.bisect(self.tokens, ring_pos(key)) % len(self.tokens)
        return self.owner[self.tokens[i]]` },
        { t: "code", lang: "python", code: `    def replicas(self, key, n=3):
        # keep walking clockwise until n DISTINCT physical nodes are found
        start = bisect.bisect(self.tokens, ring_pos(key))
        found = []
        for j in range(len(self.tokens)):
            node = self.owner[self.tokens[(start + j) % len(self.tokens)]]
            if node not in found:
                found.append(node)
                if len(found) == n:
                    break
        return found        # found[0] owns the key; the rest hold its replicas

ring = ConsistentHashRing(vnodes=256)
for name in ["db1", "db2", "db3", "db4", "db5"]:
    ring.add_node(name)
ring.get_node("user:42")        # 'db1'
ring.replicas("user:42", n=3)   # ['db1', 'db4', 'db2']
ring.remove_node("db3")         # only db3's keys move, spread over the other four` },
        { t: "p", html: "<code>replicas()</code> builds Dynamo's <b>preference list</b>. It skips extra virtual nodes of a machine already chosen, and production systems also skip nodes in the same rack or availability zone. Cassandra cut its default <code>num_tokens</code> from 256 to 16 in version 4.0, pairing it with a smarter token allocator: fewer tokens make repair and streaming cheaper while keeping balance. Related schemes you can name: <b>rendezvous hashing</b> (each key picks the node with the highest <code>hash(key, node)</code>), <b>jump consistent hash</b> (no memory, but buckets can only be added or removed at the end) and <b>Maglev</b> hashing in Google's load balancers." },
        { t: "h", text: "Rebalancing strategies" },
        { t: "table", head: ["Strategy", "How it works", "Examples", "Watch out for"], rows: [
          ["<b>Many fixed partitions</b>", "Create far more partitions than nodes up front and move whole partitions between nodes; keys never change partition", "Redis Cluster's 16,384 hash slots, Couchbase's 1,024 vBuckets, Instagram's thousands of logical shards on fewer databases, Elasticsearch shards", "The count is hard to change later: Elasticsearch fixes an index's primary shard count at creation, and changing it means a split, shrink or reindex"],
          ["<b>Dynamic splitting</b>", "Split a range or partition when it grows too big or too hot, and merge small ones", "MongoDB chunks (128 MB default), CockroachDB ranges (512 MiB), HBase regions, DynamoDB partitions (10 GB)", "An empty database starts as one partition, so pre-split before a bulk load"],
          ["<b>Proportional to nodes</b>", "Each node owns a fixed number of tokens; a joining node takes slices from many others", "Cassandra and ScyllaDB virtual nodes", "Streaming and repair cost grows with the token count"],
          ["<b>Directory moves</b>", "Copy one tenant or key range, catch up on changes, then flip the directory entry", "Vitess MoveTables and Reshard, Citus shard moves", "Needs a short write freeze or dual writes during the cutover"]
        ] },
        { t: "callout", kind: "warn", title: "Automatic rebalancing can cascade", html: "Suppose a node slows down, the failure detector declares it dead, and the cluster starts moving its data. The transfer loads the remaining nodes, which slow down too and get declared dead in turn. Throttle data movement, separate 'temporarily down' (rely on hints and replicas) from 'permanently gone' (rebalance), and keep a human approving large moves." },
        { t: "h", text: "Request routing" },
        { t: "diagram", caption: "Something must know which node owns each key as partitions move: the client, a routing tier backed by a metadata store, or any node, which forwards the request.", code: `flowchart LR
  subgraph S1["1. Partition-aware client"]
    C1(("Client with<br/>partition map")) --> N1["Owning node"]
  end
  subgraph S2["2. Routing tier"]
    C2(("Client")) --> RT["Router<br/>mongos or VTGate"]
    MD[("Metadata store<br/>config servers or etcd")] -.-> RT
    RT --> N2["Owning node"]
  end
  subgraph S3["3. Any node coordinates"]
    C3(("Client")) --> AN["Any node"]
    AN -->|"forward"| N3["Owning node"]
  end` },
        { t: "table", head: ["Approach", "Examples", "Trade-off"], rows: [
          ["Partition-aware client", "Cassandra drivers' token-aware routing; Redis Cluster clients cache the slot map and follow <code>MOVED</code> and <code>ASK</code> redirects", "Lowest latency with no extra hop, but every client library must handle map changes"],
          ["Routing tier", "MongoDB <code>mongos</code> with config servers; Vitess VTGate with its topology in etcd, ZooKeeper or Consul", "Simple clients and one place to change routing, but an extra hop and another tier to scale"],
          ["Any node coordinates", "Cassandra (any node can coordinate, and the ring spreads by gossip); Elasticsearch", "No separate tier, but often an extra network hop inside the cluster"]
        ] },
        { t: "callout", kind: "interview", title: "Sound like you have run one", html: "'Keys map to 16,384 slots, as in Redis Cluster, and slots map to nodes in a small map stored in etcd. Clients cache the map. When a slot moves, the old owner answers with a redirect, so a stale client corrects itself after one extra round trip. Adding a node moves about 1/N of the slots, throttled so the move does not hurt p99.'" }
      ]
    }
  ],
  takeaways: [
    "Replicate for availability, read scale, latency and durability. The hard part is propagating changes, done with single-leader, multi-leader or leaderless replication.",
    "Async replication is fast but loses acknowledged writes on failover. Semi-sync (wait for one follower or a majority) keeps every acknowledged write on two machines for one extra round trip.",
    "Replica lag anomalies have targeted fixes: read-your-writes (read own data from the leader or require a caught-up replica), monotonic reads (stick a user to one replica), consistent prefix (keep causally related writes in one partition).",
    "Failover means detect, elect the most up-to-date replica, reroute and fence. Prevent split brain with majority-based leases and epoch fencing, not shorter timeouts.",
    "In multi-leader setups, avoid conflicts first with a home leader per record. LWW silently drops concurrent writes, version vectors detect concurrency, and CRDTs merge automatically.",
    "Quorums: with R + W &gt; N, reads overlap the latest write. N = 3, W = 2, R = 2 tolerates one node down, but quorums are not linearizable (sloppy quorums, LWW clocks, partial writes).",
    "Range partitioning gives cheap scans but hot-spots sequential keys; hash partitioning spreads load but scatters range queries; directory partitioning gives flexible placement at the cost of a lookup service.",
    "Hashing never fixes a single hot key: split it into sub-keys, cache it, or handle celebrities and whale tenants specially.",
    "Local secondary indexes keep writes cheap but make reads scatter-gather; global indexes give one-partition reads but asynchronous or transactional writes.",
    "Never use <code>hash % N</code> over nodes: consistent hashing moves about 1/N of keys when a node joins, and virtual nodes even out load and spread recovery."
  ],
  mcqs: [
    {
      q: "A PostgreSQL primary replicates asynchronously to one standby. It acknowledges a commit, crashes before that WAL record reaches the standby, and the standby is promoted. What happens to the write?",
      options: ["It is replayed on the standby automatically from the client's retry buffer", "It is lost, even though the client was told it committed", "Promotion is blocked until the old primary comes back", "The standby refuses promotion because it detects the missing WAL"],
      answer: 1,
      explain: "Asynchronous replication acknowledges after the local commit only, so anything not yet shipped disappears on failover. Synchronous or semi-synchronous replication to at least one standby prevents this at the cost of a round trip per commit.",
      level: "easy"
    },
    {
      q: "A user changes their display name, the page reloads, and the old name appears. Reads go to asynchronous replicas. Which guarantee is broken, and what is the cheapest fix?",
      options: ["Monotonic reads; add more read replicas so each one carries less lag", "Consistent prefix reads; move every user's rows into a single partition", "Linearizability; run every query at Serializable isolation", "Read-your-writes; read the user's own profile from the leader"],
      answer: 3,
      explain: "The user is not seeing their own write, which is a read-your-writes violation. Routing only 'my own data' reads to the leader, or to a replica that has replayed past the write's log position, fixes it without slowing everyone else. More replicas would make the lag problem no better.",
      level: "easy"
    },
    {
      q: "A cache tier picks a node with <code>hash(key) % N</code>. You grow it from 10 to 11 nodes. Roughly what fraction of keys now map to a different node?",
      options: ["About 90%", "About 9%", "About 50%", "Almost none"],
      answer: 0,
      explain: "A key stays put only if its hash modulo 10 equals its hash modulo 11, which holds for about 1 in 11 keys, so about 91% move and the cache hit ratio collapses. About 9% (1/11) is what consistent hashing would move.",
      level: "easy"
    },
    {
      q: "An events table is range-partitioned by <code>created_at</code>. Under steady write load, one node runs at 100% CPU while the others are nearly idle. Why?",
      options: ["Each range holds at most a few million rows, so full ranges reject new rows", "Every insert must first lock the partition map, which lives on one node", "Each insert carries the newest timestamp, so it lands in the last range", "Range partitioning hashes each timestamp, and the hash skews toward one node"],
      answer: 2,
      explain: "With a monotonically increasing key, the newest range receives every insert. Leading the key with something that spreads writes, such as <code>(source_id, created_at)</code>, or hashing the key, fixes it at the cost of cheap time-range scans across all sources.",
      level: "easy"
    },
    {
      q: "A leaderless store keeps N = 3 replicas per key. Which setting guarantees that reads overlap the latest successful write while still tolerating one replica down for both reads and writes?",
      options: ["W = 1, R = 1", "W = 3, R = 1", "W = 2, R = 2", "W = 1, R = 2"],
      answer: 2,
      explain: "2 + 2 &gt; 3 guarantees overlap, and both reads and writes need only 2 of 3 replicas. W = 3, R = 1 also overlaps, but a single dead replica blocks every write. W = 1, R = 2 sums to 3, which is not greater than N.",
      level: "medium"
    },
    {
      q: "With N = 5, W = 3 and R = 3, how many of a key's replicas can be unavailable while both reads and writes still succeed?",
      options: ["1", "2", "3", "4"],
      answer: 1,
      explain: "Writes need 3 of 5 and reads need 3 of 5, so each tolerates 5 - 3 = 2 replicas down, and 3 + 3 = 6 &gt; 5 keeps the overlap guarantee. This is why N = 5 is chosen when two simultaneous failures must be survivable.",
      level: "medium"
    },
    {
      q: "A user sees a new comment, refreshes and it is gone, then refreshes again and it is back. Reads are load-balanced randomly across three asynchronous replicas. Which fix targets this specific problem?",
      options: ["Route each user's reads to the same replica by hashing the user ID", "Raise the replication factor from 3 to 5 so more replicas hold the comment", "Switch from row-based to statement-based replication to cut replica lag", "Read at consistency level ONE so the fastest replica always answers"],
      answer: 0,
      explain: "This is a monotonic-reads violation: successive reads hit replicas with different lag, so time appears to go backwards. Sticky routing per user means a user only ever moves forward through one replica's history. More replicas make random routing worse, not better.",
      level: "medium"
    },
    {
      q: "A celebrity's post gets 50,000 likes per second. The like counter is a single DynamoDB item, and writes are being throttled. What is the standard fix?",
      options: ["Change the partition key to a hash of the post ID so writes spread out", "Raise the table's provisioned write capacity tenfold to absorb the burst", "Move the counter into a global secondary index with its own capacity", "Split the counter across sub-keys <code>post42:0</code> to <code>post42:99</code> and sum on read"],
      answer: 3,
      explain: "One item always lives in one partition, which is capped at about 1,000 write units per second; partition keys are already hashed, and table-level capacity does not lift that per-partition cap. Write sharding spreads the key over many partitions, and reads sum the parts or use a cached total.",
      level: "medium"
    },
    {
      q: "A products table is hash-partitioned by <code>product_id</code> across 50 partitions, and each partition keeps a local secondary index on <code>color</code>. What does <code>WHERE color = 'red'</code> cost?",
      options: ["One request to the partition that owns the term red", "A request to all 50 partitions, with the results merged", "A full scan of every partition, because local indexes only serve writes", "Two requests: one to a global index, then one to a data partition"],
      answer: 1,
      explain: "A local (document-partitioned) index only covers its own partition's rows, so a query by secondary key must scatter to all partitions and gather the results, and its latency follows the slowest one. Only a global (term-partitioned) index answers from a single index partition.",
      level: "medium"
    },
    {
      q: "Compared with one token per node, what is the main benefit of giving each node 200 virtual nodes on a consistent-hashing ring?",
      options: ["Load evens out, and a failed node's keys spread over many nodes, not one", "Adding a node no longer moves any existing keys to the new node", "Range queries over adjacent keys stay on a single node", "Lookups get faster, because the ring no longer needs a hash function"],
      answer: 0,
      explain: "Many small arcs per node average out the randomness of token placement and spread both the extra load and the recovery work when a node leaves. Keys still move when nodes join (about 1/N of them), and hashing still scatters adjacent keys.",
      level: "medium"
    },
    {
      q: "During a network partition, a Dynamo-style store accepts writes on healthy nodes outside a key's usual replica set and forwards them to the right nodes after they recover. What does this trade?",
      options: ["Gains consistency, but each write must wait for every replica to acknowledge", "Gains lower latency, so read repair and anti-entropy can be switched off", "Gains durability, so no write is lost even if a stand-in node dies for good", "Gains write availability, but R + W &gt; N no longer ensures a fresh read"],
      answer: 3,
      explain: "A sloppy quorum with hinted handoff keeps writes flowing when home replicas are unreachable, but the W acknowledgments may come from nodes that a read quorum of home replicas never consults, so reads can miss the write until handoff completes. Read repair and anti-entropy are still needed, for example if a stand-in node dies before handing off.",
      level: "medium"
    },
    {
      q: "After a network partition, a replica was promoted, but the old primary is still running and some app servers keep writing to it. Which approach most directly prevents two nodes from accepting writes at once?",
      options: ["Shorten the failure-detection timeout so failover completes sooner", "Switch to synchronous replication so both nodes always hold identical data", "Hold leadership as an etcd lease and reject writes from an older epoch", "Merge both primaries' writes with last write wins once the partition heals"],
      answer: 2,
      explain: "A leader on the minority side cannot renew its lease and steps down, and epoch fencing lets replicas and storage refuse the stale leader even if it has not noticed yet. Shorter timeouts make false failovers more likely, and LWW silently discards writes that were acknowledged.",
      level: "hard"
    },
    {
      q: "Two regions run multi-leader replication with last write wins. Within 50 ms, a user in us-east sets a document's title to 'Q3 plan' and a user in eu-west sets it to 'Q3 roadmap'. Both get success. What happens, and what would let the system detect the conflict?",
      options: ["One title silently replaces the other everywhere; version vectors would detect it", "The later write is rejected with a conflict error; LWW already detects it", "Each region keeps its own title until a resync; Lamport clocks would detect it", "Both titles are merged into one string; synchronized NTP clocks would detect it"],
      answer: 0,
      explain: "LWW converges by keeping the highest timestamp, so one acknowledged write disappears without any error, and with clock skew it may not even be the later one. A version vector shows that neither write had seen the other, so the system can keep both as siblings or merge them. Lamport clocks and synchronized wall clocks always impose an order, so they cannot reveal concurrency.",
      level: "hard"
    },
    {
      q: "A Dynamo-style store runs with N = 3, W = 2, R = 2. In which situation can a read still return a value older than the latest acknowledged write?",
      options: ["All three replicas are healthy, and the write completed before the read started", "A sloppy quorum put the write on two stand-in nodes outside the home replicas", "One home replica was down during both the write and the read that followed", "The client raises R to 3 and reads from all three home replicas"],
      answer: 1,
      explain: "With a sloppy quorum, the two acknowledgments came from stand-in nodes, so a read of two home replicas can miss the write entirely until hinted handoff runs. With one home replica down, the write and the read both use the same two surviving replicas, so they still overlap.",
      level: "hard"
    },
    {
      q: "A Cassandra keyspace has replication factor 3 in each of two datacenters, 6 replicas in total. A user writes in DC1 and then immediately reads in DC2. Which pair of consistency levels guarantees that the read sees the write?",
      options: ["Write LOCAL_QUORUM, read LOCAL_QUORUM", "Write LOCAL_QUORUM, read QUORUM (4 of 6)", "Write EACH_QUORUM, read LOCAL_QUORUM", "Write ONE, read LOCAL_QUORUM with read repair"],
      answer: 2,
      explain: "EACH_QUORUM puts the write on 2 of 3 replicas in every datacenter, so a 2-of-3 read in DC2 must overlap it (2 + 2 &gt; 3), and the read stays local. A LOCAL_QUORUM write touches only DC1, and pairing it with a 4-of-6 read gives 2 + 4 = 6, which is not greater than 6, so the read can miss.",
      level: "hard"
    }
  ],
  design: [
    {
      id: "design-multitenant-sharding",
      title: "Design sharding for a multi-tenant SaaS database",
      level: "Medium",
      prompt: "You run a B2B project-management SaaS (think Asana or Jira) on a single large PostgreSQL primary that is running out of headroom. There are 100,000 customer companies (tenants) of wildly different sizes, a few EU customers require their data to stay in the EU, and one huge tenant regularly slows everyone else down. Design how to shard the database so it can grow 10x, keep tenants isolated, and move tenants between shards without downtime.",
      clarify: [
        "How skewed are tenant sizes: what share of the data and traffic do the largest 1% of tenants have?",
        "Do any queries span tenants, such as admin reporting, global search or login by email?",
        "Which data-residency rules apply, and do they cover backups and logs too?",
        "What downtime is acceptable when moving a tenant: none, seconds of read-only, or minutes?",
        "Is it acceptable to change application code, or must sharding be transparent to it?",
        "Must we support per-tenant restore, for example when a customer deletes a project by mistake?"
      ],
      hints: [
        "Almost every query already filters by tenant. What happens to joins and transactions if all of one tenant's rows live together?",
        "Compare hashing <code>tenant_id</code> with a tenant-to-shard directory. Which one lets you put a whale on its own shard, or an EU tenant on an EU shard?",
        "Lead every primary key and index with <code>tenant_id</code>, and use globally unique row IDs so a tenant's rows can move without colliding.",
        "Moving a tenant online is snapshot, then catch up on changes, then a brief freeze, then flip the directory. How do routers with a stale cache get stopped from writing to the old shard?",
        "Some lookups happen before the tenant is known, such as login by email. Give them a small global table."
      ],
      solution: [
        { t: "h", text: "Requirements" },
        { t: "list", items: [
          "<b>Functional</b>: route every request to its tenant's shard; place tenants by policy (region, size, plan); move a tenant between shards online; support global lookups needed before the tenant is known (login by email).",
          "<b>Non-functional</b>: scale to 10x data and traffic; p99 query latency under 50 ms; one tenant's load must not degrade others; at most a few seconds of read-only time per tenant move; EU tenants' data stays in the EU; no cross-tenant data leaks."
        ] },
        { t: "h", text: "Estimates" },
        { t: "code", lang: "text", code: `Tenants and data
  100,000 tenants; 95% have under 50 users; the top 100 hold ~40% of the data
  data today 20 TB, growing ~60%/year        -> ~51 TB in 2 years
  largest tenant ~3% of data                  = ~600 GB today, ~1.5 TB in 2 years

Traffic
  1M DAU x 300 API calls/day                  = 300M/day = ~3.5k req/s average
  peak 4x                                     = ~14k req/s
  ~3 queries per request                      = ~42k queries/s at peak, 85% reads

Shard sizing
  target at most ~1 TB per primary (restore in about an hour, room to grow)
  2-year plan: 51 TB / 1 TB                   = ~50 shards; start with 24 at ~0.83 TB
  per shard at peak: 42k / 24                 = ~1.75k queries/s, easy for a primary + 2 replicas
  the largest tenant will need a dedicated shard within a year` },
        { t: "h", text: "API" },
        { t: "code", lang: "http", code: `GET  /v1/projects/88/tasks?cursor=abc        Authorization: Bearer token-with-tenant-id
     -> 200 { tasks: [...], next_cursor }     (tenant comes from the token, never the URL)

POST /v1/tasks    { "project_id": 88, "title": "Ship v2" }
     -> 201 { task_id: 7290012231 }

GET  /internal/tenants/4711/placement
     -> 200 { shard: "pg-17", region: "eu", state: "active", epoch: 4 }

POST /internal/tenants/4711/moves    { "target_shard": "pg-31" }
     -> 202 { move_id: "mv-93" }` },
        { t: "h", text: "Data model" },
        { t: "p", html: "Each shard is an ordinary PostgreSQL cluster (a primary plus two replicas) holding the full schema for the tenants placed on it. <code>tenant_id</code> leads every primary key and index, so a tenant's rows cluster together, and joins and transactions never leave one shard. A small <b>tenant directory</b> lives in its own highly available PostgreSQL cluster and is cached on every API server. Off-the-shelf options exist: Citus distributes and co-locates PostgreSQL tables by <code>tenant_id</code>, and Vitess does the same for MySQL." },
        { t: "code", lang: "sql", code: `-- Control plane: tiny, strongly consistent, cached on every API server
CREATE TABLE tenant_directory (
  tenant_id bigint PRIMARY KEY,
  shard_id  text NOT NULL,           -- 'pg-17'
  region    text NOT NULL,           -- 'us' or 'eu' (data residency)
  state     text NOT NULL,           -- active, read_only, moving
  epoch     int  NOT NULL            -- bumped on every move
);

-- On every shard: tenant_id leads every key and index
CREATE TABLE tasks (
  tenant_id  bigint NOT NULL,
  task_id    bigint NOT NULL,        -- globally unique Snowflake ID, safe to move
  project_id bigint NOT NULL,
  title      text   NOT NULL,
  status     text   NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, task_id)
);
CREATE INDEX ON tasks (tenant_id, project_id, updated_at DESC);

-- Global lookup used before the tenant is known (login)
CREATE TABLE user_logins (email text PRIMARY KEY, tenant_id bigint, user_id bigint);` },
        { t: "h", text: "High-level design" },
        { t: "diagram", caption: "API servers resolve tenant to shard from a cached directory; whales and EU tenants are placed deliberately, and the mover relocates tenants online.", code: `flowchart LR
  C(("Clients")) --> API["API servers<br/>tenant router library"]
  API -->|"tenant to shard, cached"| DIR[("Tenant directory")]
  API --> S1[("Shard pg-1<br/>small tenants")]
  API --> S2[("Shard pg-2<br/>small tenants")]
  API --> SW[("Dedicated shard<br/>whale tenant")]
  API --> SEU[("EU shard<br/>EU residency")]
  MV["Tenant mover"] -.->|"copy, catch up, flip"| S2
  MV -.->|"update placement, bump epoch"| DIR
  S1 -.->|"CDC"| WH[("Warehouse<br/>cross-tenant analytics")]` },
        { t: "p", html: "<b>Request path</b>: the API server authenticates the user, takes <code>tenant_id</code> from the token, looks up the shard in its in-memory directory cache (refreshed by a change feed, with a TTL backstop), and runs the query on that shard's primary or a replica. Every query is generated with a <code>tenant_id = ?</code> predicate, and PostgreSQL row-level security on the same column is a second guard against cross-tenant leaks. <b>Login path</b>: <code>user_logins</code> maps an email to its tenant before any shard is known. <b>Analytics</b>: cross-tenant reports run on a warehouse fed by change data capture, never by scatter-gather across production shards." },
        { t: "h", text: "Deep dive 1: shard key and placement" },
        { t: "table", head: ["Option", "Pros", "Cons"], rows: [
          ["Consistent hash of <code>tenant_id</code>", "No lookup; even spread of tenant <em>counts</em>", "Cannot place whales or EU tenants deliberately; one hot tenant still overloads its shard"],
          ["Ranges of <code>tenant_id</code>", "Simple; easy to split", "New tenants all land on the newest range; sizes unrelated to IDs"],
          ["<b>Directory (chosen)</b>", "Placement by policy: least-loaded shard in the tenant's region, dedicated shards for whales; one-row moves", "Directory must be HA and cached; stale caches must be detected"]
        ] },
        { t: "p", html: "Tenant <em>count</em> is not the load that matters; data size and QPS are, and they are extremely skewed. A directory lets the placement service put each new tenant on the least-loaded shard in its region and promote a fast-growing tenant to a dedicated shard. If one tenant ever outgrows even a dedicated shard, split it a second time by <code>(tenant_id, project_id)</code> within its own group of shards." },
        { t: "h", text: "Deep dive 2: moving a tenant online" },
        { t: "steps", items: [
          { title: "Snapshot", html: "Start logical replication of the tenant's rows from the source shard to the target (PostgreSQL 15 publications support row filters such as <code>WHERE (tenant_id = 4711)</code>). At about 100 MB/s, a 50 GB tenant copies in roughly 8 minutes." },
          { title: "Catch up", html: "Keep streaming changes until the replication lag is under a second. The tenant stays fully live on the source the whole time." },
          { title: "Freeze writes", html: "Set the tenant to <code>read_only</code> in the directory and in the source shard's local tenant-state table. Writes get a retryable error for a few seconds." },
          { title: "Drain and verify", html: "Wait for lag to reach zero, then compare row counts and per-table checksums for the tenant." },
          { title: "Flip", html: "Point the directory at the target shard, bump the epoch and set the state to <code>active</code>. API servers receive the change within a second." },
          { title: "Fence the old copy", html: "The source shard marks the tenant as moved. Every write transaction there checks that flag with one indexed lookup, so a router with a stale cache gets an error, refreshes its directory and retries on the right shard." },
          { title: "Clean up", html: "Delete the tenant's rows from the source in small batches a day later, after backups have covered the target." }
        ] },
        { t: "h", text: "Deep dive 3: noisy neighbors and cross-shard concerns" },
        { t: "list", items: [
          "<b>Noisy neighbors</b>: per-tenant token-bucket limits on requests and on database connections at the router (Chapter 11), plus per-statement timeouts, keep one tenant's import job from starving its shard-mates.",
          "<b>IDs</b>: Snowflake-style global IDs (Chapter 14) mean rows never collide when a tenant moves, and IDs can be exposed in URLs safely.",
          "<b>Schema migrations</b>: roll each migration out shard by shard with a migration tracker. Application code must tolerate both the old and new schema during the rollout.",
          "<b>Per-tenant restore</b>: restore the shard's backup to a scratch cluster at the requested time, then copy just that tenant's rows back.",
          "<b>Residency</b>: EU shards, their replicas and their backups live only in EU regions, and the directory refuses to place an EU tenant elsewhere."
        ] },
        { t: "h", text: "Trade-offs and bottlenecks" },
        { t: "list", items: [
          "The directory is a dependency on every request. Caching makes reads free, but a directory outage blocks only new placements and moves, not traffic.",
          "Co-locating by tenant makes per-tenant joins local, but cross-tenant queries become scatter-gather, which is why they go to the warehouse.",
          "Moves cost a few seconds of read-only time per tenant. Truly zero-downtime moves need dual writes, which are much more complex.",
          "Dedicated whale shards cost more and run less utilized, which is a price paid for isolation that can also be charged to that customer.",
          "Many shards multiply operational work (backups, upgrades, migrations), so automate shard lifecycle operations before passing about 20 shards."
        ] }
      ],
      followups: [
        "The whale tenant alone now needs more write throughput than the largest single machine. How do you split it?",
        "An EU tenant is acquired by a US company and wants to move to the US. What has to happen, and what must you check legally and technically?",
        "How do you run a schema migration that adds a NOT NULL column across 50 shards without downtime?",
        "A router's directory cache is stale during a move and it writes to the old shard. Walk through exactly what prevents data loss.",
        "Product wants a global search across all of a user's tenants. How do you build it without scatter-gather on the shards?"
      ]
    },
    {
      id: "design-global-profile-store",
      title: "Design a globally replicated user-profile store",
      level: "Hard",
      prompt: "Design the user-profile store for a social app with 500 million users spread across North America, Europe and Asia. Profiles (display name, username, bio, avatar URL, settings) are read constantly, since every feed item and comment shows a name and avatar, and edited rarely. Reads must be fast in every region, users must immediately see their own edits even while traveling, usernames must be globally unique, and the store must survive the loss of an entire region.",
      clarify: [
        "What are the read and write volumes, and what latency is required for each?",
        "Can other users see a profile edit a few seconds late, or must it appear everywhere immediately?",
        "What happens when a user travels: do they keep writing to their home region?",
        "After a full region outage, how much recent data may be lost (RPO), and how fast must writes resume (RTO)?",
        "Are there data-residency rules, for example EU profiles stored only in the EU?",
        "Can two devices edit the same profile at the same moment, and what should happen then?"
      ],
      hints: [
        "Compute the read:write ratio first. It tells you where to spend latency: reads must be local; writes can afford a cross-region trip.",
        "Avoid multi-leader conflicts by giving every user a home region whose leader owns all of that user's writes.",
        "Every region keeps async replicas of everyone's profile for local reads. How do you give the editing user read-your-writes when their read hits a replica?",
        "For RPO zero on a region loss, make each commit wait for one replica in another region. At about 500 writes per second, can you afford that?",
        "Username uniqueness is a global constraint. It needs one strongly consistent authority, and it is rare enough to pay a cross-region round trip."
      ],
      solution: [
        { t: "h", text: "Requirements" },
        { t: "list", items: [
          "<b>Functional</b>: get a profile by user ID or username; update profile fields; claim or change a globally unique username.",
          "<b>Non-functional</b>: reads p99 under 20 ms from cache and under 50 ms from the database, served in-region; writes p99 under 300 ms from anywhere; read-your-writes for the editor, other viewers within a few seconds; survive a region loss with no acknowledged writes lost and writes resuming within a minute; 99.99% read availability."
        ] },
        { t: "h", text: "Estimates" },
        { t: "code", lang: "text", code: `Users and size
  500M users, 200M DAU; profile ~1 KB (images live in object storage)
  one full copy = 500M x 1 KB                   = 500 GB
  copies: 3 in the home region + 2 in each of 2 other regions = 7 -> ~3.5 TB total

Reads (names and avatars render everywhere)
  200M DAU x 50 profile reads/day             = 10B/day = ~116k/s average, ~350k/s peak
  90% served by regional Redis                 -> ~35k/s reach the databases, across 3 regions

Writes
  200M DAU x 0.05 edits/day                   = 10M/day = ~116/s average, ~500/s peak
  read:write ratio about 1000:1
  cross-region replication: 500/s x 1 KB x 2 remote regions = ~1 MB/s` },
        { t: "h", text: "API" },
        { t: "code", lang: "http", code: `GET   /v1/users/81723/profile            X-Min-Version: 912   (only sent by the editor)
      -> 200 { display_name, username, bio, avatar_url, version: 912 }

PATCH /v1/users/81723/profile            If-Match: 911
      { "bio": "Climber. Coffee." }
      -> 200 { version: 912 }   |   412 someone else edited it first

GET   /v1/usernames/ana_k                -> 200 { user_id: 81723 }

PUT   /v1/users/81723/username   { "username": "ana_k" }
      -> 200   |   409 username taken` },
        { t: "h", text: "Data model" },
        { t: "p", html: "Profiles are partitioned by home region first, then by hash of <code>user_id</code> within the region. Each partition has a single leader in its home region, with two more replicas in other zones of that region, plus replicas in each other region for local reads (deep dive 3 makes one remote replica confirm each commit). That is single-leader per row, so there are no write conflicts. A version number on each row supports optimistic concurrency between a user's own devices. CockroachDB's <code>REGIONAL BY ROW</code> tables implement this layout natively; the same design can be built from per-region PostgreSQL clusters with cross-region replicas and a routing layer." },
        { t: "code", lang: "sql", code: `CREATE TABLE profiles (
  user_id      bigint PRIMARY KEY,
  home_region  text   NOT NULL,       -- 'us', 'eu', 'ap': decides which leader owns the row
  username     text   NOT NULL,
  display_name text   NOT NULL,
  bio          text,
  avatar_url   text,
  settings     jsonb  NOT NULL DEFAULT '{}',
  version      bigint NOT NULL,       -- bumped on every write; used by If-Match and X-Min-Version
  updated_at   timestamptz NOT NULL
);

-- Global uniqueness: one strongly consistent authority, replicated by consensus
CREATE TABLE usernames (
  username   text PRIMARY KEY,        -- the unique constraint does the work
  user_id    bigint NOT NULL,
  claimed_at timestamptz NOT NULL
);` },
        { t: "h", text: "High-level design" },
        { t: "diagram", caption: "A US user traveling in Europe reads locally from EU caches and replicas, while writes go to the US home leader, which waits for one remote replica before acknowledging.", code: `flowchart LR
  U(("US user<br/>traveling in EU")) --> EUAPI["EU API servers"]
  EUAPI -->|"read: cache first"| EUC[("EU Redis")]
  EUAPI -->|"read on miss"| EUR[("EU replicas of<br/>US-homed rows")]
  EUAPI ==>|"write: forward to home"| USL[("US leaders<br/>3 zones")]
  USL -->|"quorum commit: any 1 remote"| EUR
  USL -.->|"async"| APR[("AP replicas of<br/>US-homed rows")]
  EUL[("EU leaders<br/>EU-homed rows")] -.->|"async"| USR[("US replicas of<br/>EU-homed rows")]
  LS["Lease store<br/>etcd across 3 regions"] -.->|"leadership and epochs"| USL` },
        { t: "p", html: "<b>Read path</b>: GeoDNS sends users to the nearest region. Any profile is read from the regional Redis cache, then from that region's replica, with no cross-region hop, whoever owns the row. <b>Write path</b>: the API server looks up the user's home region (it is stored on the profile and cached) and forwards the write to that region's leader. A user at home pays no forwarding hop; a traveler pays one extra cross-region round trip, about 80 to 200 ms, which is acceptable for a rare action. The leader commits once one replica in another region has also flushed the change, using PostgreSQL-style quorum commit <code>ANY 1 (eu_replica, ap_replica)</code>, which typically means waiting about 80 ms for the nearest region. Each region runs a change-data-capture consumer that deletes the cache key when a replicated change arrives, with a 10-minute TTL as a backstop." },
        { t: "h", text: "Deep dive 1: why one home leader per user" },
        { t: "table", head: ["Option", "Writes", "Conflicts", "Verdict"], rows: [
          ["One global leader", "Far regions pay a cross-region trip on every write; a leader-region outage stops all writes", "None", "Simple, but couples global write availability to one region"],
          ["Multi-leader with LWW, such as DynamoDB global tables", "Local everywhere", "Concurrent edits silently drop one; usernames cannot be unique without coordination", "Fast, but LWW loses data and cannot enforce uniqueness"],
          ["Leaderless multi-DC, such as Cassandra with LOCAL_QUORUM", "Local everywhere", "Per-cell LWW merges edits to different fields; edits to the same field still lose one", "Good availability; read-your-writes across regions needs extra work"],
          ["<b>Home leader per user (chosen)</b>", "No forwarding hop for users at home; each commit waits for one remote replica", "None: each row has exactly one writer", "Best fit for rare writes and a hard read-your-writes requirement"]
        ] },
        { t: "h", text: "Deep dive 2: read-your-writes and monotonic reads across regions" },
        { t: "steps", items: [
          { title: "Write returns a version", html: "The leader bumps <code>version</code> to 912 in the same transaction and returns it." },
          { title: "Client remembers it", html: "The app keeps <code>min_version = 912</code> for the user's own profile, and the server stores it per user for 60 seconds so the user's other devices get it too." },
          { title: "Read checks freshness", html: "The user's own profile reads send <code>X-Min-Version</code>. The regional API serves from cache or replica only if that copy's version is at least 912." },
          { title: "Fall back if behind", html: "If the local copy is older, wait up to 100 ms for replication, then read from the home leader. This is rare: one cross-region read right after an edit." },
          { title: "Everyone else reads freely", html: "Other viewers send no token and may see the old bio for a second or two, which the requirements allow. Clients keep the highest version they have seen, so the profile never moves backwards on refresh." }
        ] },
        { t: "h", text: "Deep dive 3: region failure and usernames" },
        { t: "p", html: "<b>Region loss.</b> If the US region goes dark, reads continue everywhere, since every region holds a copy of every profile, and US users are re-routed by GeoDNS to the EU. For US-homed partitions, a controller picks the remote replica with the highest replayed position. Quorum commit guarantees that at least one remote replica has every acknowledged write. The controller takes a lease and a new epoch from the etcd cluster (five members spread 2-2-1 across three regions, so it survives losing any one region) and promotes that replica. RPO is zero and RTO is under a minute. When the US returns, its old leaders see the higher epoch and rejoin as followers after rewinding any unacknowledged tail (PostgreSQL <code>pg_rewind</code>), so there is no split brain and no lost acknowledged write." },
        { t: "p", html: "<b>Usernames.</b> Uniqueness cannot be checked against a stale replica, so the <code>usernames</code> table lives in a small store replicated by consensus across all three regions, such as Spanner or CockroachDB configured to survive a region failure. A claim inserts the username row, where the primary key does the uniqueness check at the cost of one cross-region quorum round trip, about 100 to 200 ms, and then updates the profile. If the profile update fails, a cleanup job releases the orphaned claim. Username lookups read from local follower replicas, so a name claimed a second ago may briefly not resolve in another region." },
        { t: "h", text: "Trade-offs and bottlenecks" },
        { t: "list", items: [
          "Quorum commit adds about 80 ms to every profile write in exchange for zero RPO. That is a good trade at 500 writes per second, and a bad one for a write-heavy store.",
          "Travelers pay cross-region latency on writes. If many users move permanently, re-home them by copying their row and flipping <code>home_region</code>.",
          "Seven copies of every profile cost about 3.5 TB, which is cheap next to the read latency it buys.",
          "Other users can see a profile a few seconds stale, and cache invalidation through CDC can lag during replication backlogs; the TTL caps the damage.",
          "The username authority is the one globally coordinated component, and it is kept small and touched only on claims and renames."
        ] }
      ],
      followups: [
        "EU regulators require EU users' profiles to be stored only in the EU, yet US users must still see their names. How do you reconcile those?",
        "Lag to the AP region grows to 30 seconds during a backlog. What do users notice, and what do you alert on?",
        "How would you design 'follower count' on the profile, which changes thousands of times per second for celebrities?",
        "Two of a user's devices edit the bio at the same moment. Walk through what each one sees.",
        "How would you migrate this from a single-region PostgreSQL deployment without downtime?"
      ]
    }
  ]
};
