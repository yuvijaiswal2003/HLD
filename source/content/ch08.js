module.exports = {
  id: "distributed-theory",
  num: 8,
  part: 3,
  title: "Distributed Systems: CAP, Consistency and Consensus",
  tagline: "What can and cannot be guaranteed when machines fail and messages get lost.",
  level: "Advanced",
  lessons: [
    {
      id: "why-hard",
      title: "Why distributed systems are hard",
      minutes: 9,
      blocks: [
        { t: "p", html: "On one machine, failures are mostly all-or-nothing: if the kernel panics or the power goes, everything stops, and a program run twice on the same input does the same thing. Spread that program across a network and you get <b>partial failure</b>: some nodes and links work while others are broken, slow or flaky, and the failures are nondeterministic. A request can succeed on Tuesday and hang on Wednesday for reasons no single node can see. Almost every hard idea in this chapter exists to cope with that." },
        { t: "h", text: "You cannot tell slow from dead" },
        { t: "p", html: "Data center networks are <b>asynchronous packet networks</b>: a message can be lost, delayed for an unbounded time, duplicated or reordered, and the sender is told about none of it. When a client sends a request and hears nothing back, three very different situations look exactly the same:" },
        { t: "diagram", caption: "A lost request, a crashed or paused server and a lost response all produce the same symptom: silence until the timeout fires.", code: `sequenceDiagram
  participant C as Client
  participant S as Server
  alt Request lost
    C-xS: charge 50 dollars
    Note over S: never saw it
  else Server crashed or paused
    C->>S: charge 50 dollars
    Note over S: crashed mid-request or stuck in a GC pause
  else Response lost
    C->>S: charge 50 dollars
    Note over S: charged the card
    S--xC: OK
  end
  Note over C: all three cases end in the same timeout` },
        { t: "p", html: "The only tool the client has is a <b>timeout</b>, and a timeout means only 'no answer yet'. It does not say whether the operation happened, which is why retries must be paired with <b>idempotency</b> (applying a request twice has the same effect as applying it once). Picking the timeout is itself a trade-off: too short and you declare healthy-but-slow nodes dead, triggering failovers that add load exactly when the system is struggling; too long and users wait while a dead node is still treated as alive. Chapter 12 covers retry strategy in depth; Chapter 14 covers adaptive failure detectors." },
        { t: "h", text: "The fallacies of distributed computing" },
        { t: "p", html: "In the 1990s, engineers at Sun Microsystems (largely credited to L. Peter Deutsch, with James Gosling adding the eighth) listed the assumptions newcomers make that eventually break every system built on them:" },
        { t: "table", head: ["Fallacy", "Reality", "Design consequence"], rows: [
          ["The network is reliable", "Switches fail, cables get cut, NICs drop packets, config pushes go wrong", "Timeouts, idempotent retries, replicas in separate failure domains"],
          ["Latency is zero", "~0.5 ms round trip inside a data center, 60–150 ms across regions", "Avoid chatty APIs, batch calls, keep synchronous quorums inside a region"],
          ["Bandwidth is infinite", "Links saturate; cross-region bandwidth is expensive", "Compress, paginate, send deltas, move compute to the data"],
          ["The network is secure", "Traffic can be sniffed or spoofed, even inside a VPC", "TLS or mTLS everywhere, authenticate service-to-service calls"],
          ["Topology doesn't change", "Nodes autoscale, pods reschedule, IPs change", "Service discovery and health checks, no hardcoded addresses"],
          ["There is one administrator", "Many teams and vendors change things independently", "Backward-compatible APIs, versioning, clear ownership"],
          ["Transport cost is zero", "Serialization CPU and egress fees are real money", "Compact encodings such as Protobuf; watch cross-AZ and egress traffic"],
          ["The network is homogeneous", "Mixed hardware, OSes, MTUs and protocol versions", "Standard protocols, test across environments"]
        ] },
        { t: "h", text: "Processes pause and clocks lie" },
        { t: "p", html: "Even a node that is up can stop executing without knowing it. A stop-the-world garbage collection on a large JVM heap can take seconds; a hypervisor can suspend a VM for live migration; the OS can swap memory to disk; a write can stall on a slow disk. When the process resumes, its next line of code runs as if no time passed, while the rest of the cluster may have declared it dead and moved on. Clocks are no better: each machine's clock drifts and can jump when NTP corrects it (lesson 4). The conclusion: <b>a node cannot trust its own view of the world</b>. Decisions such as 'who is the leader' or 'is this lock still mine' must be made by a <b>quorum</b> of nodes, never by one node's opinion." },
        { t: "numbers", items: [
          { value: "~0.5 ms", label: "Round trip inside one data center" },
          { value: "60–150 ms", label: "Round trip between regions" },
          { value: "Seconds", label: "Worst-case stop-the-world GC pause on a large heap" },
          { value: "2f + 1", label: "Nodes needed to survive f crashed nodes with majority quorums" }
        ] },
        { t: "p", html: "Algorithms are proven correct under a <b>system model</b>, so name the one you assume. For node faults: <b>crash-stop</b> (a node dies and never returns), <b>crash-recovery</b> (it can come back with whatever it had written to disk, the usual assumption for databases) and <b>Byzantine</b> (nodes may lie; tolerating f traitors needs 3f + 1 nodes, which matters for blockchains and avionics, not typical backends). For timing: <b>synchronous</b> (bounded delays, unrealistic), <b>asynchronous</b> (no bounds at all, where some problems become impossible) and <b>partially synchronous</b> (well-behaved most of the time, with occasional unbounded hiccups). Raft, Paxos and nearly every production system assume crash-recovery with partial synchrony: they stay <em>safe</em> no matter what and make <em>progress</em> whenever the network behaves." },
        { t: "callout", kind: "example", title: "GitHub, October 2018", html: "A 43-second loss of connectivity between GitHub's US East Coast network hub and its primary East Coast data center caused its MySQL failover tooling (Orchestrator) to promote databases on the West Coast. When connectivity returned, some writes existed only in the East and others only in the West, and GitHub ran degraded for about 24 hours while reconciling them. A short partition plus automatic failover produced a long incident." },
        { t: "callout", kind: "interview", title: "What interviewers listen for", html: "Whenever one component calls another, say what happens when the call is slow, fails, or its response is lost: 'the call has a 500 ms timeout, retries twice with jittered backoff, and carries an idempotency key so a duplicate is harmless.' Naming partial failure explicitly is one of the clearest seniority signals in a design round." }
      ]
    },
    {
      id: "cap-pacelc",
      title: "CAP and PACELC, stated precisely",
      minutes: 10,
      blocks: [
        { t: "p", html: "The CAP theorem is the most quoted and most misquoted result in system design. Eric Brewer stated it as a conjecture in 2000; Seth Gilbert and Nancy Lynch proved a precise version in 2002. The proof uses narrow definitions, and nearly every misconception comes from swapping them for everyday meanings:" },
        { t: "list", items: [
          "<b>Consistency (C)</b> means <b>linearizability</b>: the system behaves as if there were a single copy of the data, and every read returns the latest completed write (lesson 3 defines this carefully).",
          "<b>Availability (A)</b> means every request received by a <em>non-failing</em> node eventually gets a non-error response. Not 'most requests' and not 'the majority side': every node that is up must answer.",
          "<b>Partition tolerance (P)</b> means the system keeps working while the network drops arbitrary messages between nodes, for example when a switch failure splits the cluster into two groups that cannot talk."
        ] },
        { t: "p", html: "The theorem: <b>while a partition is in progress, a system cannot provide both C and A</b>. The proof is almost obvious. Node A and node B are cut off from each other, and a client writes x = 2 to A. Another client reads x from B. B cannot know about the write, so it can either refuse or wait (staying consistent, giving up availability) or return its old value x = 1 (staying available, giving up consistency)." },
        { t: "diagram", caption: "During a partition, node B must either refuse to answer or answer without the latest write; no design escapes this choice.", code: `flowchart LR
  C1(("Client 1")) -->|"write x = 2"| A["Node A<br/>x = 2"]
  A -.-|"partition: no messages pass"| B["Node B<br/>still x = 1"]
  C2(("Client 2")) -->|"read x"| B
  B -->|"CP choice"| E["Return an error or wait<br/>until the partition heals"]
  B -->|"AP choice"| S["Return x = 1<br/>stale but available"]` },
        { t: "h", text: "Misconceptions to correct" },
        { t: "table", head: ["Misconception", "What is actually true"], rows: [
          ["'Pick any two of C, A and P'", "Partitions are not optional for anything that uses a network, so P is a given. The real statement is: <em>if</em> a partition happens, choose C or A. When there is no partition you can have both."],
          ["'Our database is CA'", "Only a single-node system, or one that assumes partitions never happen, is CA. A multi-node 'CA' system still meets partitions and then loses consistency or availability in an unplanned way."],
          ["'CP means the system goes down'", "CAP availability is very strict. A Raft cluster whose majority side keeps serving while only minority-side clients get errors is 'not available' in CAP terms, yet can deliver 99.99% uptime."],
          ["'AP means anything goes'", "AP systems can still offer eventual, session or causal guarantees. They only give up linearizability during a partition."],
          ["'C in CAP is the C in ACID'", "ACID consistency means application invariants hold (a balance never goes negative). CAP consistency is linearizability of reads and writes. Different ideas that share a letter."],
          ["'Every system is either CP or AP'", "Many systems are tunable per request: Cassandra consistency levels, DynamoDB's ConsistentRead flag, MongoDB read and write concerns. And CAP says nothing about latency or about behavior when the network is healthy."]
        ] },
        { t: "callout", kind: "warn", title: "Never say 'I'll choose CA'", html: "It signals that you think partitions can be designed away. Say instead: 'Partitions will happen. For this data I would rather reject writes on the minority side than accept conflicting ones' (CP), or 'for this data I would rather keep accepting writes and reconcile later' (AP)." },
        { t: "h", text: "PACELC: the trade-off you pay every day" },
        { t: "p", html: "Partitions are rare; latency is constant. Daniel Abadi's <b>PACELC</b> extends CAP: if there is a <b>P</b>artition, choose <b>A</b>vailability or <b>C</b>onsistency; <b>E</b>lse, choose <b>L</b>atency or <b>C</b>onsistency. The 'else' half matters more day to day because strong consistency needs coordination (waiting for a leader or a quorum to acknowledge), and coordination costs round trips: a millisecond or two inside a region, 60–150 ms across regions." },
        { t: "table", head: ["System", "On partition", "Else", "Notes"], rows: [
          ["DynamoDB (default reads), Cassandra at ONE", "A", "L", "Replicas answer locally. Strongly consistent reads or QUORUM trade latency for freshness."],
          ["Spanner, CockroachDB", "C", "C", "Paxos or Raft quorum on every write; the minority side refuses requests."],
          ["etcd", "C", "C", "Linearizable reads by default: the leader confirms with a quorum before answering."],
          ["ZooKeeper", "C", "L for reads", "Writes go through a quorum; reads are served by the local server and may lag unless the client calls sync."],
          ["Azure Cosmos DB", "Tunable", "Tunable", "Five levels: strong, bounded staleness, session (the default), consistent prefix, eventual."]
        ] },
        { t: "p", html: "Interview phrasing that lands well: 'Account balances are PC/EC: a transfer waits for a majority acknowledgment and the minority side rejects writes. The like counter on a post is PA/EL: increments go to the nearest replica and converge within seconds.'" },
        { t: "callout", kind: "interview", title: "Use CAP per piece of data", html: "Don't classify the whole system. Classify each kind of data by the cost of being wrong versus the cost of being unavailable: inventory reservations, payments, usernames and locks lean CP; feeds, counters, presence and recommendations lean AP. Then name the mechanism that delivers the choice: quorum writes, leader-only reads, or LWW with async replication." }
      ]
    },
    {
      id: "consistency-models",
      title: "Consistency models from linearizable to eventual",
      minutes: 11,
      blocks: [
        { t: "p", html: "A <b>consistency model</b> is a contract between a data store and its clients: given concurrent reads and writes, which results may a read return? Stronger models make applications easier to reason about but need more coordination, which costs latency and availability. Weaker models are cheap and fast but push complexity into the application." },
        { t: "h", text: "Linearizability: behave like a single copy" },
        { t: "p", html: "A system is <b>linearizable</b> if every operation appears to take effect atomically at some instant between its request and its response, and all clients agree on that order. The consequence is a <b>recency guarantee</b>: once any read has returned a new value, every later read, by any client, returns that value or a newer one. Reading from asynchronously replicated followers breaks it:" },
        { t: "diagram", caption: "Bob read after Alice did, yet saw an older value; a system that allows this is not linearizable even though all replicas eventually agree.", code: `sequenceDiagram
  participant W as Writer
  participant L as Leader
  participant F1 as Follower 1
  participant F2 as Follower 2
  participant A as Alice
  participant B as Bob
  W->>L: write score = 3-2 final
  L->>F1: replicate
  A->>F1: read score
  F1-->>A: 3-2 final
  A->>B: tells Bob the game is over
  B->>F2: read score
  F2-->>B: 2-2 still playing
  L->>F2: replicate, arrives late` },
        { t: "p", html: "You need linearizability whenever correctness depends on everyone agreeing on the current state <em>right now</em>: electing a single leader, holding a lock, enforcing uniqueness (one account per username), or checking a balance before a withdrawal. It also matters across channels: if a web server stores an uploaded image and then tells a resizer through a queue, the resizer's read must see the upload. The cost is coordination: in a single-leader system reads go to the leader, and the leader must confirm it is still the leader." },
        { t: "callout", kind: "warn", title: "Linearizable is not serializable", html: "<b>Serializability</b> is a transaction isolation property: concurrent multi-object transactions produce the same result as <em>some</em> serial order, and that order need not match real time, so a read-only transaction may legally see a snapshot from a few seconds ago. <b>Linearizability</b> is a real-time recency guarantee on single objects. A system with both is <b>strictly serializable</b>; Spanner calls this external consistency. Interviewers like to probe this distinction." },
        { t: "h", text: "The spectrum, strongest to weakest" },
        { t: "table", head: ["Model", "Guarantee", "Example systems", "Good fit"], rows: [
          ["Strict serializability", "Transactions are serializable and respect real-time order", "Spanner, FoundationDB", "Ledgers, inventory spanning many rows"],
          ["Linearizable", "Single objects behave like one copy; reads see the latest completed write", "etcd, ZooKeeper writes, DynamoDB strongly consistent reads", "Locks, leader election, uniqueness, balances"],
          ["Sequential", "Everyone sees operations in the same order, consistent with each client's own order, but possibly behind real time", "ZooKeeper reads served by a follower", "Configuration and coordination metadata"],
          ["Causal", "Causally related operations are seen in the same order by everyone; concurrent ones in any order", "MongoDB causally consistent sessions", "Comments and replies, chat, collaboration"],
          ["Session guarantees", "Per client: read-your-writes, monotonic reads, monotonic writes", "Cosmos DB session level (its default), sticky routing to one replica", "Profiles, settings, shopping carts"],
          ["Eventual", "If writes stop, replicas converge; no ordering promise meanwhile", "DNS, Cassandra at ONE, DynamoDB default reads", "Counters, feeds, caches, analytics"]
        ] },
        { t: "p", html: "<b>Causal consistency</b> deserves special attention. Event A <em>happens before</em> event B if B could have been influenced by A: they ran in that order in one process, or B read a value A wrote, or a chain of such links connects them. Events with no such link are <b>concurrent</b>. A causally consistent store guarantees that if you can see a reply, you can see the comment it answers. Crucially, causal consistency can be provided while staying available during a partition; it is roughly the strongest model that can. That makes it the sweet spot for user-facing features that cannot afford CP behavior." },
        { t: "p", html: "<b>Session guarantees</b> are weaker still but fix the anomalies users actually notice: posting a comment and not seeing it, or refreshing and watching data go backwards. Chapter 7 shows how to implement them with replicas. <b>Eventual consistency</b> promises only convergence; it says nothing about what you read before then, and the definition puts no upper bound on 'eventually', though replication lag is usually milliseconds to seconds in practice." },
        { t: "callout", kind: "example", title: "Amazon S3 became strongly consistent", html: "For years S3 offered only eventual consistency for overwrites and deletes, so a read right after an update could return the old object. In December 2020 AWS made S3 GET, PUT and LIST operations strongly consistent (read-after-write) at no extra cost, removing a whole class of workarounds that data pipelines had needed." },
        { t: "h", text: "Choosing a model in an interview" },
        { t: "list", items: [
          "Ask what goes wrong if a read is one second stale. If the answer is 'money is lost' or 'two people get the same seat', that data needs linearizable or serializable operations.",
          "If the answer is 'a user is briefly confused', session guarantees such as read-your-writes are usually enough.",
          "If the answer is 'a number is briefly off', eventual consistency is fine and much cheaper.",
          "Mix models in one design: seat inventory is strongly consistent, the seat map shown to browsers is cached and eventually consistent, and the final booking re-checks the strong store."
        ] },
        { t: "callout", kind: "interview", title: "Name the model and the mechanism", html: "Avoid the vague phrase 'strong consistency'. Say 'linearizable writes through a Raft-replicated leader', 'causal consistency using session tokens', or 'eventual, with LWW and async replication, lag under a second'. Precise vocabulary shows you know what each guarantee costs." }
      ]
    },
    {
      id: "time-ordering",
      title: "Time, clocks and ordering events",
      minutes: 12,
      blocks: [
        { t: "p", html: "Distributed systems order events constantly: which of two writes to a key wins, whether a lease has expired, which snapshot a transaction reads, which log line came first during an incident. The obvious tool, each machine's clock, is less reliable than it looks." },
        { t: "h", text: "Physical clocks drift and jump" },
        { t: "p", html: "Every server's clock is driven by a quartz oscillator that runs slightly fast or slow, and the error changes with temperature. Google's Spanner paper assumed up to 200 parts per million of drift, about 17 seconds per day if never corrected. <b>NTP</b> corrects drift by polling time servers, typically keeping machines within a few milliseconds of each other on a good network and tens of milliseconds over the internet, but congestion can throw it off, and when a clock is far off NTP may <em>step</em> it, so it jumps forward or backward. Operating systems therefore expose two clocks: the <b>time-of-day clock</b> (wall-clock time; can jump; only roughly comparable across machines) and the <b>monotonic clock</b> (only moves forward; meaningless across machines; the right tool for measuring timeouts and durations)." },
        { t: "numbers", items: [
          { value: "~200 ppm", label: "Worst-case quartz drift assumed by Spanner, ~17 s per day" },
          { value: "1–10 ms", label: "Typical NTP skew between servers on a good network" },
          { value: "1–7 ms", label: "TrueTime uncertainty reported in the Spanner paper" }
        ] },
        { t: "callout", kind: "warn", title: "Last-write-wins on wall clocks silently loses data", html: "If node A's clock runs 50 ms ahead of node B's, a write that reaches B 20 ms <em>after</em> A's write still gets the earlier timestamp and is discarded by last-write-wins (LWW). No error is raised; the newer data simply vanishes. Cassandra and DynamoDB global tables (in their default mode) resolve conflicts with timestamp-based LWW, which is fine for blind overwrites of independent values and dangerous for read-modify-write updates such as counters." },
        { t: "h", text: "Lamport timestamps" },
        { t: "p", html: "Leslie Lamport's 1978 insight was that many problems need only an order consistent with causality, not real time. Each node keeps a counter, increments it on every local event, attaches it to every message it sends, and on receiving a message sets its counter to max(local, received) + 1. Ties are broken by node ID, so the pair (counter, node_id) gives a <b>total order</b>. Vector clocks, below, extend the idea." },
        { t: "code", lang: "python", code: `class LamportClock:
    def __init__(self, node_id):
        self.t, self.node_id = 0, node_id
    def tick(self):                       # local event or message send
        self.t += 1
        return (self.t, self.node_id)
    def receive(self, remote_t):          # message arrival
        self.t = max(self.t, remote_t) + 1
        return (self.t, self.node_id)

class VectorClock:
    def __init__(self, node_id, nodes):
        self.node_id, self.v = node_id, {n: 0 for n in nodes}
    def tick(self):
        self.v[self.node_id] += 1
        return dict(self.v)
    def receive(self, remote):            # element-wise max, then tick
        for n, c in remote.items():
            self.v[n] = max(self.v.get(n, 0), c)
        return self.tick()

def compare(a, b):                        # a, b: dict of node -> counter
    keys = set(a) | set(b)
    le = all(a.get(k, 0) <= b.get(k, 0) for k in keys)
    ge = all(a.get(k, 0) >= b.get(k, 0) for k in keys)
    if le and ge: return "equal"
    if le: return "a happened before b"
    if ge: return "b happened before a"
    return "concurrent"` },
        { t: "p", html: "Lamport timestamps guarantee one direction: if A happened before B, then L(A) &lt; L(B). The converse fails: L(A) &lt; L(B) does not mean A influenced B; they may be concurrent. So Lamport clocks can <em>order</em> events but cannot <em>detect</em> concurrency. A subtler limit: you only know a timestamp's final position once you are sure no node will later produce a smaller one, which means hearing from every node. That is why Lamport clocks alone cannot implement 'the first user to claim a username wins'; that needs consensus (next lesson)." },
        { t: "h", text: "Vector clocks" },
        { t: "p", html: "A <b>vector clock</b> keeps one counter per node. A node increments its own entry on each event and, on receiving a message, takes the element-wise maximum before incrementing. Compare two vectors entry by entry: if every entry of A is less than or equal to the matching entry of B, A happened before B; if neither dominates, the events are <b>concurrent</b>. This is exactly what a leaderless store needs to decide whether a write supersedes another or both must be kept as siblings for the application to merge (the version vectors of Chapter 7). The cost is size: one entry per participant, so real systems bound or prune the vector." },
        { t: "diagram", caption: "C's own write and B's replicated write each have an entry the other lacks, so neither dominates and C keeps both versions.", code: `sequenceDiagram
  participant A as Node A
  participant B as Node B
  participant C as Node C
  Note over A: local write, VC = A1 B0 C0
  A->>B: replicate with VC A1 B0 C0
  Note over B: merge then write, VC = A1 B1 C0
  Note over C: independent write, VC = A0 B0 C1
  B->>C: replicate with VC A1 B1 C0
  Note over C: neither vector dominates, so the writes are concurrent and both are kept` },
        { t: "h", text: "Hybrid logical clocks" },
        { t: "p", html: "A <b>hybrid logical clock</b> (HLC) packs both ideas into one compact timestamp: a physical part that tracks the largest wall-clock time the node has seen, plus a logical counter that breaks ties and preserves causality like a Lamport clock. HLC values stay within the NTP skew of real time, so they are meaningful to humans and usable for snapshot reads ('as of 10:00:00'), and they never go backwards. CockroachDB and YugabyteDB use HLCs for transaction timestamps, and MongoDB's cluster time is an HLC. CockroachDB, lacking atomic clocks, also assumes a configured maximum clock offset (a few hundred milliseconds by default) and restarts reads whose values fall inside that uncertainty window." },
        { t: "h", text: "Spanner's TrueTime and commit wait" },
        { t: "p", html: "Google's Spanner makes clock error explicit instead of pretending it is zero. Each data center has GPS receivers and atomic clocks, and the TrueTime API returns an interval (earliest, latest) guaranteed to contain the true time, usually a few milliseconds wide. Spanner uses it to provide <b>external consistency</b>: if transaction T1 commits before T2 starts, T1 gets the smaller timestamp, on every server." },
        { t: "steps", items: [
          { title: "Acquire locks", html: "The transaction's leader takes write locks (with two-phase commit across Paxos groups when several shards are involved)." },
          { title: "Pick the timestamp", html: "Choose commit timestamp s = TT.now().latest, a time that cannot yet have passed anywhere." },
          { title: "Replicate", html: "Send the commit record through Paxos to a majority of replicas; this overlaps with the wait." },
          { title: "Commit wait", html: "Wait until TT.now().earliest is greater than s, roughly twice the uncertainty. Now every clock in the system agrees s is in the past." },
          { title: "Release and acknowledge", html: "Apply the writes, release locks and reply. Any transaction that starts afterwards sees a TrueTime interval entirely after s, so it is assigned a larger timestamp." }
        ] },
        { t: "callout", kind: "interview", title: "Answering 'how do you order events across machines?'", html: "Walk the ladder: wall clocks are skewed, so LWW can drop writes; Lamport clocks give a causality-respecting total order but cannot detect concurrency; vector clocks detect concurrency at the cost of size; HLCs add human-meaningful time to causality; TrueTime bounds clock error and waits it out to get external consistency. Then pick the rung your design needs." }
      ]
    },
    {
      id: "consensus",
      title: "Consensus: Raft, Paxos and coordination services",
      minutes: 14,
      blocks: [
        { t: "p", html: "<b>Consensus</b> means getting several nodes to agree on a value and keep agreeing even when some crash. In practice we agree on a <b>log</b>, an ordered sequence of commands. If every node applies the same commands in the same order to the same deterministic state machine, every node ends up in the same state. This <b>replicated state machine</b> underpins etcd, ZooKeeper, Consul, CockroachDB, TiKV and Kafka's KRaft controller. Many problems that look different are equivalent to consensus: leader election, distributed locks, atomic compare-and-set, uniqueness constraints and total-order broadcast." },
        { t: "p", html: "Consensus uses <b>majority quorums</b>. With 2f + 1 nodes any two majorities share at least one node, so every new decision 'sees' every previous one, and the cluster survives f failures: three nodes tolerate one, five tolerate two. Four nodes still tolerate only one (a majority of four is three), so even sizes add cost without fault tolerance. The <b>FLP impossibility</b> result (Fischer, Lynch and Paterson, 1985) shows that in a fully asynchronous network no deterministic algorithm can guarantee consensus terminates if even one node may crash. Real algorithms sidestep it with timeouts: they are always <em>safe</em> (never decide two different values) and are <em>live</em> (make progress) whenever the network is reasonably timely." },
        { t: "h", text: "Raft: roles, terms and elections" },
        { t: "p", html: "Raft (Ongaro and Ousterhout, 2014) was designed to be understandable. Each server is a <b>follower</b>, <b>candidate</b> or <b>leader</b>. Time is divided into numbered <b>terms</b>; each term starts with an election and has at most one leader. Terms act as a logical clock: every message carries the sender's term, and a server that sees a higher term immediately adopts it and becomes a follower. An old leader that was partitioned away is therefore demoted the moment it talks to anyone in the new term." },
        { t: "diagram", caption: "Every transition is driven by timeouts and term numbers; seeing a higher term always turns a server back into a follower.", code: `flowchart LR
  F["Follower"] -->|"election timeout, no heartbeat"| C["Candidate<br/>term + 1, votes for itself"]
  C -->|"votes from a majority"| L["Leader<br/>sends heartbeats"]
  C -->|"split vote: time out, new term"| C
  C -->|"sees current leader or higher term"| F
  L -->|"sees higher term"| F` },
        { t: "list", items: [
          "<b>Election timeout.</b> A follower that hears nothing from a leader for a randomized timeout (the paper suggests 150–300 ms; etcd defaults to 1 s with 100 ms heartbeats) becomes a candidate, increments its term, votes for itself and sends RequestVote to every server.",
          "<b>One vote per term.</b> Each server votes for at most one candidate per term, first come first served, and persists that vote to disk before replying so a restart cannot make it vote twice.",
          "<b>Up-to-date check.</b> A server refuses to vote for a candidate whose log is less up to date than its own: compare the term of the last entry first (higher wins), then log length. This guarantees the winner already holds every committed entry.",
          "<b>Randomized timeouts</b> make split votes rare; if nobody wins, candidates time out at different moments and the next term usually elects someone.",
          "<b>Heartbeats.</b> The leader sends empty AppendEntries messages regularly so followers do not start elections."
        ] },
        { t: "h", text: "Log replication and commit" },
        { t: "diagram", caption: "The leader answers the client once a majority, counting itself, has the entry on disk; followers learn the commit index on the next message.", code: `sequenceDiagram
  participant Cl as Client
  participant L as Leader term 7
  participant F1 as Follower 1
  participant F2 as Follower 2
  Cl->>L: SET x = 5
  Note over L: append entry 42 with term 7 to own log
  L->>F1: AppendEntries prev 41 term 7, entry 42
  L->>F2: AppendEntries prev 41 term 7, entry 42
  F1-->>L: success, entry 42 on disk
  Note over L: 2 of 3 servers have entry 42, commitIndex = 42
  L->>L: apply SET x = 5 to state machine
  L-->>Cl: OK
  F2-->>L: success, late but harmless
  L->>F1: next heartbeat carries commitIndex 42
  L->>F2: next heartbeat carries commitIndex 42
  Note over F1,F2: followers apply entry 42 in order` },
        { t: "steps", items: [
          { title: "Append locally", html: "The leader appends the command to its log with the current term and the next index." },
          { title: "Replicate with a consistency check", html: "AppendEntries carries the index and term of the entry just before the new ones. A follower accepts only if its log has a matching entry there; otherwise it rejects, the leader backs up and retries until the logs match, and then overwrites the follower's conflicting, uncommitted suffix." },
          { title: "Commit on a majority", html: "Once a majority of servers have stored the entry, the leader advances its commit index. A committed entry is guaranteed to be in the log of every future leader." },
          { title: "Apply and respond", html: "The leader applies committed entries in order to its state machine and replies to the client." },
          { title: "Propagate the commit index", html: "Followers learn the new commit index from later AppendEntries calls and apply the same entries in the same order." }
        ] },
        { t: "callout", kind: "warn", title: "Two subtleties interviewers like", html: "First, a new leader never commits an entry from an <em>earlier</em> term just by counting replicas; it commits an entry from its own term, which implicitly commits everything before it. Counting old-term entries can let a 'committed' entry be overwritten (Figure 8 of the Raft paper). Second, a leader must not serve reads from local state blindly: a partitioned old leader may not know it was replaced. It first confirms leadership with a quorum round (etcd's ReadIndex) or relies on a time-based leader lease, which assumes bounded clock drift." },
        { t: "h", text: "Paxos in one paragraph" },
        { t: "p", html: "Lamport's <b>Paxos</b> predates Raft and solves the same problem with proposers, acceptors and learners. In phase 1 a proposer picks a unique, increasing proposal number n and asks acceptors to <b>promise</b> to ignore lower numbers; acceptors reply with any value they have already accepted. In phase 2 the proposer asks acceptors to <b>accept</b> (n, v), where v must be the value of the highest-numbered proposal reported in phase 1, if any. A value is chosen once a majority accepts it. <b>Multi-Paxos</b> keeps a stable leader so phase 1 is skipped for later log slots, which makes it look much like Raft. Google's Chubby lock service and Spanner use Paxos; ZooKeeper uses a similar protocol called ZAB." },
        { t: "h", text: "ZooKeeper and etcd: consensus as a service" },
        { t: "p", html: "Few teams implement consensus themselves. They run a coordination service and build on its primitives: small linearizable key-value data, <b>watches</b> (push notification on change), <b>sessions or leases</b> that expire when a client dies, and monotonically increasing sequence or revision numbers." },
        { t: "table", head: ["Need", "How you build it", "Where it is used"], rows: [
          ["Leader election", "Candidates create an ephemeral sequential znode (ZooKeeper) or campaign on a key bound to a lease (etcd); the lowest sequence or first creator wins and others watch", "HBase masters, Kafka controllers before KRaft, Kubernetes controllers via Lease objects"],
          ["Configuration and discovery", "Store config or endpoint lists under a key; clients watch instead of polling", "Kubernetes API server state, Consul service catalog"],
          ["Distributed locks", "Like election, per resource; the session or lease is the lock's lifetime and the revision or zxid serves as a fencing token", "Batch job coordination, schema migration locks"],
          ["Group membership", "Each live member holds an ephemeral key; when its session expires the key vanishes and watchers are notified", "Worker pools, partition assignment"]
        ] },
        { t: "callout", kind: "example", title: "Real deployments", html: "Kubernetes stores all cluster state (pods, services, config) in etcd. Kafka originally kept its metadata and controller election in ZooKeeper, replaced it with its own Raft-based KRaft quorum, and removed ZooKeeper support entirely in Kafka 4.0." },
        { t: "callout", kind: "tip", title: "Keep consensus small and off the hot path", html: "A consensus group's write throughput is bounded by its leader and fsync latency, typically thousands to tens of thousands of small writes per second. Store metadata (etcd's default storage quota is 2 GB), not user data. When you need consensus over large data, shard it into many independent groups, as CockroachDB and TiKV do with one Raft group per key range." },
        { t: "callout", kind: "interview", title: "Using consensus in a design", html: "Say where you need agreement and keep it narrow: 'Shard ownership and the current leader live in etcd; the data path uses ordinary replication.' Interviewers reward reaching for consensus for coordination and avoiding it for bulk data." }
      ]
    },
    {
      id: "distributed-transactions",
      title: "Distributed transactions: 2PC, sagas and the outbox",
      minutes: 13,
      blocks: [
        { t: "p", html: "Inside one database, a transaction makes several writes atomic. Many business operations span several databases or services: create the order (Orders DB), reserve stock (Inventory DB), charge the card (Payments service). We want all of it or none of it. There are two broad approaches: make the participants commit atomically with <b>two-phase commit</b>, or give up atomic commit and run a <b>saga</b> of local transactions with compensations." },
        { t: "h", text: "Two-phase commit (2PC)" },
        { t: "p", html: "2PC has a <b>coordinator</b> (a transaction manager, often inside the application or database) and several <b>participants</b>. The key move is <b>prepare</b>: a participant that votes YES makes a binding promise. It has durably logged everything needed to commit and will commit if told to, even after crashing and restarting." },
        { t: "diagram", caption: "After voting YES, the Inventory DB is in doubt: it can neither commit nor abort on its own, so its locks stay held until the coordinator recovers.", code: `sequenceDiagram
  participant Co as Coordinator
  participant P1 as Orders DB
  participant P2 as Inventory DB
  Co->>P1: PREPARE
  Co->>P2: PREPARE
  P1-->>Co: YES, prepared record on disk, locks held
  P2-->>Co: YES, prepared record on disk, locks held
  Note over Co: logs the COMMIT decision, this is the commit point
  Co->>P1: COMMIT
  P1-->>Co: ACK, locks released
  Note over Co: crashes before sending COMMIT to the Inventory DB
  Note over P2: in doubt, cannot commit or abort alone, rows stay locked` },
        { t: "steps", items: [
          { title: "Phase 1: prepare", html: "The coordinator sends PREPARE to all participants. Each executes the work, writes a prepared record to its log, keeps its row locks, and votes YES, or votes NO and aborts." },
          { title: "Decision", html: "If every vote is YES, the coordinator durably logs COMMIT; that write is the commit point. Any NO or timeout means ABORT." },
          { title: "Phase 2: commit or abort", html: "The coordinator sends the decision to every participant and retries until each acknowledges. Participants apply it and release their locks." }
        ] },
        { t: "h", text: "Why 2PC blocks" },
        { t: "p", html: "The weak spot is the window after a participant votes YES. It can no longer abort unilaterally, because others may already have committed; it cannot commit unilaterally, because the decision may have been ABORT. If the coordinator crashes in that window, the participant is <b>in doubt</b> and must hold its locks until the coordinator returns, blocking every other transaction that touches those rows. Participants can ask each other, but if none received the decision, all are stuck. Operators sometimes resolve in-doubt transactions by hand ('heuristic' decisions), which can break atomicity. 2PC also costs latency (two round trips plus forced log writes on every participant) and lowers availability to that of the least available participant. Three-phase commit tries to remove the blocking but is only correct if network delays are bounded, so it is not used in practice." },
        { t: "compare", items: [
          { title: "2PC / XA across databases", pros: ["Real atomicity and isolation across participants", "Application code looks like one normal transaction"], cons: ["Blocks if the coordinator fails after prepare", "Locks held across network round trips cut throughput", "Every participant must support prepare; third-party APIs never do"], use: "Rarely across services; occasionally between a database and a broker from the same vendor." },
          { title: "2PC over consensus groups", pros: ["Coordinator and participants are Raft or Paxos groups, so one machine failure does not block", "Strictly serializable cross-shard transactions"], cons: ["Higher write latency, especially across regions", "Only works inside one distributed database"], use: "What Spanner, CockroachDB and YugabyteDB do internally. Pick such a database when you need cross-shard ACID." },
          { title: "Saga", pros: ["Each step is a short local transaction with no distributed locks", "Works across services and external APIs"], cons: ["No isolation: others see intermediate states", "Every step needs a compensation and idempotency"], use: "Business workflows across microservices and third parties: orders, bookings, payouts." }
        ] },
        { t: "h", text: "Sagas" },
        { t: "p", html: "A <b>saga</b> (Garcia-Molina and Salem, 1987) splits a long transaction into local transactions T1, T2 ... Tn, each committed in its own service. Each step that may need undoing has a <b>compensating transaction</b> Ci that semantically reverses it: release the reservation, refund the charge, send a cancellation email. If step Tk fails, the saga runs Ck-1 ... C1 in reverse order. Compensations are new business operations, not rollbacks: a refund is a new ledger entry, not a deleted row, and a sent email cannot be unsent. Put steps that cannot be compensated last. The step after which the saga is committed to finishing is the <b>pivot</b>; steps after it must be retried until they succeed." },
        { t: "compare", items: [
          { title: "Choreography", pros: ["No central component; services react to each other's events", "Very loose coupling, simple for 2–4 steps"], cons: ["The workflow exists only implicitly across services, hard to see and debug", "Risk of cyclic event dependencies", "Adding a step or a timeout touches several services"], use: "Short, stable flows where each step naturally reacts to an event that already exists." },
          { title: "Orchestration", pros: ["One state machine defines steps, timeouts and compensations explicitly", "Saga state is stored durably, so 'where is order 123?' is one query", "Easier to test and evolve"], cons: ["The orchestrator is another service to run and scale", "Temptation to move business logic out of the services into it"], use: "Many steps, branching, timeouts or money involved. Temporal, AWS Step Functions and Camunda are common engines." }
        ] },
        { t: "diagram", caption: "The orchestrator drives each step and, when the charge is declined, runs compensations only for the steps that already succeeded.", code: `flowchart TD
  O["Order saga orchestrator"] -->|"1. reserve"| Inv["Inventory: reserve items"]
  Inv -->|"reserved"| O
  O -->|"2. charge"| Pay["Payments: charge card"]
  Pay -->|"declined"| O
  O -->|"compensate: release"| InvC["Inventory: release reservation"]
  O -->|"mark failed"| Ord["Orders: status FAILED"]
  O -.->|"on success: 3. ship"| Ship["Shipping: create shipment"]` },
        { t: "callout", kind: "warn", title: "Sagas give up isolation", html: "Between steps, others see partial results: stock reserved for an order that will fail, a balance reduced by a charge that will be refunded. Standard countermeasures: <b>semantic locks</b> (mark records PENDING so other flows treat them carefully), ordering steps so likely failures and irreversible actions come last, <b>commutative updates</b> (increment and decrement rather than overwrite), and re-checking state before acting. Every step and compensation must also be <b>idempotent</b>, because messages arrive at least once." },
        { t: "h", text: "The transactional outbox" },
        { t: "p", html: "Sagas and event-driven systems need a service to change its database <em>and</em> publish a message. Doing both directly is the <b>dual-write problem</b>: crash after the database commit but before the publish and the event is lost; publish first and crash before the commit and you announced something that never happened. A Kafka transaction cannot include a PostgreSQL write. The <b>transactional outbox</b> fixes it with one local transaction that writes the business row and an outbox row describing the event. A separate <b>relay</b> publishes outbox rows to the broker, either by polling the table or by tailing the database's write-ahead log with change data capture (Debezium, Chapter 9)." },
        { t: "diagram", caption: "The event commits atomically with the data; the relay may publish it twice, so consumers deduplicate by event ID.", code: `flowchart LR
  Svc["Order service"] -->|"one local transaction"| DB[("PostgreSQL<br/>orders + outbox rows")]
  DB -->|"poll or tail the WAL"| Relay["Outbox relay<br/>or Debezium"]
  Relay -->|"publish, at least once"| K[["Kafka topic order-events"]]
  K --> C1["Inventory consumer<br/>dedupes on event id"]
  K --> C2["Email consumer<br/>dedupes on event id"]` },
        { t: "callout", kind: "interview", title: "What to say about distributed transactions", html: "Default to avoiding them: keep data that must change atomically in one database or one shard. When a workflow must span services, say 'orchestrated saga with compensations, each step idempotent, state changes published through an outbox.' Mention 2PC to show you know why it is avoided across services: it blocks on coordinator failure and third parties cannot take part." }
      ]
    },
    {
      id: "leases-fencing",
      title: "Leases, locks and fencing tokens",
      minutes: 9,
      blocks: [
        { t: "p", html: "Distributed locks are used for two different reasons, and the difference decides how careful you must be. An <b>efficiency lock</b> prevents duplicate work, such as two workers generating the same nightly report; if it occasionally fails, you waste some compute. A <b>correctness lock</b> prevents corruption, such as two writers modifying the same file or two leaders accepting writes; if it fails, you lose data." },
        { t: "p", html: "Distributed locks are almost always <b>leases</b>: locks with an expiry time. The holder renews the lease periodically with keepalives. If the holder crashes or is partitioned away, the lease expires and someone else can take over, so a dead client cannot hold a lock forever. Expiry introduces a new danger, though: the holder may still be alive and unaware that its lease has run out." },
        { t: "h", text: "The pause problem" },
        { t: "diagram", caption: "Without the token check at the storage layer, client 1's stale write would silently overwrite client 2's; with it, the pause is harmless.", code: `sequenceDiagram
  participant C1 as Client 1
  participant LS as Lock service
  participant C2 as Client 2
  participant S as Storage
  C1->>LS: acquire lock on file-7
  LS-->>C1: granted, lease 10 s, token 33
  Note over C1: stop-the-world GC pause for 30 s
  Note over LS: lease of client 1 expires
  C2->>LS: acquire lock on file-7
  LS-->>C2: granted, lease 10 s, token 34
  C2->>S: write file-7 with token 34
  S-->>C2: OK, highest token is now 34
  Note over C1: wakes up, still believes it holds the lock
  C1->>S: write file-7 with token 33
  S-->>C1: rejected, token 33 is older than 34` },
        { t: "p", html: "Client 1 cannot notice the pause from the inside. Checking 'is my lease still valid?' right before writing does not help: the pause can happen between the check and the write, or the write can sit in a network buffer for seconds. A longer TTL only shrinks the window. A lock based purely on time is not safe for correctness on its own." },
        { t: "h", text: "Fencing tokens" },
        { t: "p", html: "The fix is to make the <em>resource</em> enforce the lock. Each time the lock service grants the lock, it returns a <b>fencing token</b>, a number that strictly increases with every grant. The client sends the token with every write; the storage system remembers the highest token it has accepted and rejects anything lower. A paused or delayed ex-holder always carries an older token, so its writes bounce. Consensus-backed services provide such numbers for free: ZooKeeper's zxid or znode version, etcd's revision of the lock key, or the Raft log index of the grant." },
        { t: "code", lang: "sql", code: `-- Storage-side fencing: accept a write only if its token is not older
-- than the newest token already applied to this resource.
UPDATE documents
SET    body = :body,
       fence_token = :token
WHERE  id = :doc_id
  AND  fence_token <= :token;
-- 0 rows updated: a newer lock holder has written. Abort and re-acquire.` },
        { t: "h", text: "Redis locks, Redlock and consensus-backed locks" },
        { t: "compare", items: [
          { title: "Single Redis SET NX PX", pros: ["One round trip: SET lock:job owner NX PX 30000", "Simple and very fast"], cons: ["Replication is asynchronous, so a failover can lose the key and grant the lock twice", "No fencing token"], use: "Efficiency locks where an occasional double run is acceptable." },
          { title: "Redlock across 5 Redis nodes", pros: ["Survives a minority of Redis nodes failing", "No consensus system to operate"], cons: ["Safety depends on bounded clock drift, network delay and pauses", "Still no fencing token, the core of Martin Kleppmann's well-known critique"], use: "Debated. If you need correctness, prefer a consensus-backed lock with fencing." },
          { title: "etcd or ZooKeeper lock", pros: ["Grants go through consensus, so node failures never cause double grants", "Revision or zxid doubles as a fencing token"], cons: ["A few milliseconds per acquire, slower than Redis", "The protected resource must check tokens"], use: "Correctness locks: leader election, exclusive writers, schema migrations." }
        ] },
        { t: "callout", kind: "warn", title: "A lock without fencing is only a hint", html: "If the protected resource cannot check a token (an external API, a legacy file share), the lock alone cannot guarantee mutual exclusion. Make the operation itself idempotent or conditional instead: an API call with an idempotency key, or a compare-and-set on a version number." },
        { t: "callout", kind: "tip", title: "Leader leases follow the same rules", html: "A leader that serves reads from local state under a lease must stop before the lease could have expired on <em>any</em> node. It measures with its monotonic clock, starts the timer when it <em>sent</em> the renewal (not when the reply arrived), and subtracts a safety margin for drift. A new leader waits out the old leader's maximum lease before acting." },
        { t: "callout", kind: "interview", title: "Locks in a design round", html: "When your design says 'take a lock', expect 'what if the holder pauses?'. A strong answer: 'The lock is an etcd lease with a 10-second TTL and keepalives; each grant returns the key's revision as a fencing token, and the storage layer rejects writes with a lower token. For mere deduplication of work, a Redis SET NX with a TTL is enough.'" }
      ]
    }
  ],
  takeaways: [
    "Partial failure defines distributed systems: a timeout means 'no answer yet', never 'it did not happen', so every retried operation must be idempotent.",
    "CAP, stated correctly: while a partition lasts, choose linearizability or availability. P is not optional, and 'CA' is not a real option for a multi-node system.",
    "PACELC: even with a healthy network, strong consistency costs latency because it needs coordination. Choose per kind of data, not per system.",
    "Linearizability is single-object, real-time recency; serializability is transaction isolation without a real-time promise; strict serializability (Spanner) is both.",
    "Causal consistency is roughly the strongest model that stays available during partitions; eventual consistency guarantees only convergence.",
    "Wall clocks drift and jump, so LWW can silently drop writes. Lamport clocks order events, vector clocks detect concurrency, HLCs add physical time, TrueTime bounds the error and waits it out.",
    "Raft: randomized election timeouts, one vote per term, votes only for up-to-date logs, entries committed once a majority stores them. 2f + 1 nodes tolerate f failures.",
    "Use etcd or ZooKeeper for small, critical coordination data (leaders, locks, config, membership), never for bulk data.",
    "2PC blocks when the coordinator dies after participants vote YES. Across services use sagas with idempotent steps and compensations, orchestrated when the flow is complex.",
    "Never dual-write to a database and a broker; use a transactional outbox. Correctness locks need leases plus fencing tokens checked by the resource."
  ],
  mcqs: [
    { q: "According to the CAP theorem as proved by Gilbert and Lynch, what must a replicated data store give up while a network partition is in progress?", options: [
      "Either linearizable reads and writes, or a non-error reply from every live node",
      "Either durability of committed writes, or tolerance of the partition itself",
      "Either low latency, or high throughput on the majority side of the partition",
      "Either ACID transactions, or secondary indexes that span every partition"
    ], answer: 0, explain: "CAP's C is linearizability and its A means every non-failing node answers. During a partition you can keep one of the two. It says nothing about durability, throughput or indexes.", level: "easy" },
    { q: "An architect says: 'Our 3-node database cluster is CA, because it runs in one data center with redundant switches.' What is the best response?", options: [
      "Agreed: redundant switches rule out partitions, so the cluster can be both C and A",
      "Partitions still occur in one data center; during one, nodes must refuse or risk stale reads",
      "It is CP by default, because every cluster with more than one node is automatically CP",
      "It is AP by default, because a single data center has no cross-region latency to worry about"
    ], answer: 1, explain: "Redundancy lowers the odds of a partition but cannot rule one out (misconfigurations, NIC faults, GC pauses that look like partitions). P is a given, so the real design decision is behavior during a partition.", level: "medium" },
    { q: "Under PACELC, how is Cassandra best classified when clients read and write at consistency level ONE?", options: [
      "PC/EC: it refuses writes during partitions and coordinates on every read",
      "PC/EL: it refuses writes during partitions but answers quickly otherwise",
      "PA/EL: it stays available during partitions and favors latency otherwise",
      "PA/EC: it stays available during partitions but coordinates every read otherwise"
    ], answer: 2, explain: "At ONE, any single replica can accept a write or answer a read, so Cassandra stays available under partition and avoids coordination latency normally. Raising the level to QUORUM moves it toward consistency at a latency cost.", level: "medium" },
    { q: "A database runs serializable transactions on its leader but serves read-only transactions from asynchronous replicas. A user's read-only transaction returns a consistent snapshot from 2 seconds ago. Which statement is accurate?", options: [
      "It violates serializability, because it misses the latest commit",
      "It is allowed by serializability, though the read is not linearizable",
      "It violates every isolation level, because any stale read breaks isolation",
      "It satisfies strict serializability, because the snapshot is internally consistent"
    ], answer: 1, explain: "Serializability only requires equivalence to some serial order, which may place the read before recent commits. Linearizability (and strict serializability) add the real-time requirement that this read must see writes completed before it began.", level: "hard" },
    { q: "Why do teams run consensus clusters with 3 or 5 nodes rather than 4 or 6?", options: [
      "Raft cannot elect a leader when the cluster has an even number of nodes",
      "Even sizes cause a split vote in every election, so no leader ever stabilizes",
      "Odd sizes let the leader skip writing entries to its own log before replicating",
      "An even size raises the majority needed but tolerates no more failures"
    ], answer: 3, explain: "Four nodes need a majority of three and tolerate one failure, the same as three nodes. Raft works with even sizes; it just gains nothing from the extra node. Randomized timeouts handle split votes regardless of size.", level: "medium" },
    { q: "A Raft follower in term 5 receives a RequestVote for term 6 from a candidate whose last log entry has term 4 and index 9. The follower's own last entry has term 5 and index 6. What does the follower do?", options: [
      "Grants the vote and moves to term 6, because the candidate's log is longer",
      "Rejects the vote and stays in term 5, because the candidate's log is behind",
      "Moves to term 6 but rejects the vote, as its own last entry has a higher term",
      "Grants the vote and moves to term 6, because a higher term always wins the vote"
    ], answer: 2, explain: "Any higher term makes a server adopt it, but the vote also requires the candidate's log to be at least as up to date: last-entry terms are compared first, and 5 beats 4. This rule ensures a leader always holds every committed entry.", level: "hard" },
    { q: "In Raft, when may the leader treat a new log entry from its current term as committed and apply it to the state machine?", options: [
      "As soon as it is appended to and flushed in the leader's own log",
      "When every follower in the cluster has acknowledged it",
      "When a majority of servers, including the leader, store it",
      "When the next election timeout passes with no new leader elected"
    ], answer: 2, explain: "Majority storage guarantees any future leader, which needs votes from a majority and must have an up-to-date log, will contain the entry. Waiting for every follower would let one slow node stall the cluster.", level: "medium" },
    { q: "Your leaderless key-value store must detect when two clients wrote the same key concurrently, so it can keep both versions as siblings. Which mechanism supports this?", options: [
      "Lamport timestamps attached to each written value",
      "Wall-clock timestamps compared with last-write-wins",
      "A monotonic clock read on each replica at write time",
      "Version vectors attached to each stored value"
    ], answer: 3, explain: "Comparing vectors element-wise reveals when neither version dominates, which is exactly concurrency. Lamport timestamps and wall clocks always produce an order, so they silently pick a winner instead of detecting the conflict.", level: "medium" },
    { q: "Spanner assigns a commit timestamp s and waits until TrueTime guarantees s has passed before acknowledging the commit. What does this commit wait achieve?", options: [
      "It ensures a Paxos majority has persisted the write before the client gets a reply",
      "It ensures any transaction starting after the ack gets a later commit timestamp",
      "It gives the time servers a chance to resynchronize the clocks of all replicas",
      "It ensures no other transaction still holds a lock on any of the same rows"
    ], answer: 1, explain: "Commit wait converts bounded clock uncertainty into external consistency: timestamp order matches real-time commit order. Paxos replication happens in parallel with the wait; it is not what the wait is for.", level: "hard" },
    { q: "In two-phase commit, a participant has voted YES and then loses contact with the coordinator. What can it safely do?", options: [
      "Stay prepared, holding its locks, until it learns the decision",
      "Abort after a timeout, since no commit message has arrived",
      "Commit after a timeout, since it has already voted YES",
      "Ask the client application which outcome it should apply"
    ], answer: 0, explain: "After a YES vote the participant is in doubt: others may have committed, or the decision may have been ABORT. It must wait to hear the outcome from the coordinator or from a participant that knows it; acting unilaterally could break atomicity, which is exactly why 2PC is called a blocking protocol.", level: "medium" },
    { q: "In an order saga, step 1 reserves the last unit of an item and another shopper is told it is sold out. Step 2, the card charge, then fails, and the compensation releases the unit. Which ACID property does a saga not provide that allowed this?", options: [
      "Isolation between concurrent sagas",
      "Atomicity of each local step",
      "Durability of committed steps",
      "Consistency of each service's local constraints"
    ], answer: 0, explain: "Each saga step commits locally, so intermediate states are visible to everyone. Semantic locks (marking the unit PENDING) and step ordering are the usual countermeasures.", level: "easy" },
    { q: "A worker holds a 10-second lease from etcd, then stalls in a 30-second GC pause. Another worker acquires the lease and writes. What actually prevents the first worker's late write from corrupting the file?", options: [
      "The first worker checks that its lease is still valid right before every write",
      "A lease TTL chosen to be longer than the longest GC pause ever observed",
      "The storage service rejects writes whose fencing token is below the highest seen",
      "etcd closes all of the first worker's TCP connections as soon as its lease expires"
    ], answer: 2, explain: "Only the resource can enforce exclusion after the fact. A client-side check races with the pause, a longer TTL only narrows the window, and etcd cannot stop a client from talking to a different system.", level: "hard" },
    { q: "An order service inserts an order into PostgreSQL and then publishes OrderPlaced to Kafka in the same request handler. What is the problem, and what is the standard fix?", options: [
      "Kafka adds latency to the request; publish the event first, then insert the order",
      "A crash between steps leaves them out of sync; insert the event into an outbox table in the same transaction",
      "Kafka rejects raw JSON payloads; encode the event in Avro and register its schema before publishing",
      "A crash between steps leaves them out of sync; give the producer a transactional.id so both commit atomically"
    ], answer: 1, explain: "This is the dual-write problem. Kafka transactions cover only Kafka partitions and offsets, not a PostgreSQL write, so the outbox puts both changes into one local database transaction and a relay (or CDC such as Debezium) publishes the event afterward.", level: "easy" },
    { q: "Your service calls a payment API and the call times out after 2 seconds. What do you know about the payment?", options: [
      "Nothing for certain: it may never have arrived, still be running, or have succeeded",
      "It failed, so it is safe to retry right away with a brand-new request",
      "It succeeded, because a timeout only happens when the response is slow",
      "It was never received, because a timeout means the connection itself failed"
    ], answer: 0, explain: "A timeout cannot distinguish a lost request from a lost response. Retrying is only safe if the request carries an idempotency key, or after querying the payment's status.", level: "easy" },
    { q: "A comments service must never show anyone a reply before the comment it answers, and it must keep accepting writes in every region during a cross-region partition. What is the strongest model you can realistically promise?", options: [
      "Linearizability",
      "Strict serializability",
      "Sequential consistency",
      "Causal consistency"
    ], answer: 3, explain: "Causal consistency preserves the comment-before-reply order and can be provided while every region stays available. Linearizability, strict serializability and sequential consistency all need cross-region coordination, so they cannot stay available during the partition.", level: "medium" }
  ],
  design: [
    {
      id: "design-distributed-lock-service",
      title: "Design a distributed lock service",
      level: "Medium",
      prompt: "Design a lock service, in the spirit of Chubby or etcd's lock API, that thousands of internal services use to elect leaders and guard shared resources. Two clients must never both act as the holder in a way that corrupts data, and the service must survive machine failures.",
      clarify: [
        "Are the locks for efficiency (avoid duplicate work) or correctness (prevent corruption)? Correctness requires fencing.",
        "How many clients, locks and acquisitions per second? How long are locks usually held?",
        "Do waiters need FIFO fairness, or is try-lock with retry enough?",
        "Do clients need blocking waits and change notifications, or is polling acceptable?",
        "What must we survive: one node, one availability zone, a whole region?",
        "Can the protected resources check a token on each write?"
      ],
      hints: [
        "A single node is a single point of failure, and asynchronous replication can grant a lock twice after failover. What gives you a replicated, linearizable state machine?",
        "A crashed client must not hold a lock forever. Tie locks to a session with a TTL that the client keeps alive.",
        "A client that pauses past its lease still believes it holds the lock. What can the storage system check that the client cannot fake?",
        "The Raft log index of the grant is a ready-made, strictly increasing fencing token.",
        "When a popular lock is released, avoid waking every waiter. Keep an ordered queue and hand the lock to the next waiter only."
      ],
      solution: [
        { t: "h", text: "Requirements" },
        { t: "list", items: [
          "<b>Functional:</b> create a session with a TTL and keep it alive; acquire a named lock (try or blocking with timeout); release; return a fencing token with each grant; watch a lock's holder; leader-election helpers (campaign, observe).",
          "<b>Non-functional:</b> safety first (at most one valid holder per lock at any token); tolerate two node failures; acquire p99 under 10 ms within a region; linearizable operations; tiny data volume."
        ] },
        { t: "h", text: "Estimates" },
        { t: "list", items: [
          "20,000 client processes, one session each, keepalive every 3 s with a 10 s TTL: 20,000 / 3 ≈ 6,700 keepalives/s. The leader tracks lease expiry in memory, so keepalives do not go through the log.",
          "Peak 2,000 acquisitions/s; acquire plus release = 2 log writes, so ~4,000 replicated writes/s. A 5-node Raft group on SSDs with batching handles 10k–30k small writes/s, so one group fits with headroom.",
          "State: 200,000 locks and waiters × ~300 B ≈ 60 MB. Fits in memory; snapshots are small and fast.",
          "Latency: in-region quorum round trip ~1 ms plus an fsync ~1 ms, so acquire p50 is ~2–3 ms."
        ] },
        { t: "h", text: "API" },
        { t: "code", lang: "http", code: `POST /v1/sessions                     {"ttl_ms": 10000}
  -> 201 {"session_id": "s-81f", "ttl_ms": 10000}
POST /v1/sessions/s-81f/keepalive
  -> 200 {"ttl_ms": 10000}
POST /v1/locks/billing-job/acquire    {"session_id": "s-81f", "wait_ms": 5000}
  -> 200 {"token": 884213, "holder": "s-81f"}    or 408 after wait_ms
POST /v1/locks/billing-job/release    {"session_id": "s-81f", "token": 884213}
  -> 204
GET  /v1/locks/billing-job?watch=true
  -> stream of holder changes` },
        { t: "h", text: "Data model" },
        { t: "table", head: ["Key", "Value", "Notes"], rows: [
          ["session/{id}", "ttl_ms, created_index", "Expiry tracked by the leader with its monotonic clock"],
          ["lock/{name}", "holder_session, token, acquired_index", "token = Raft log index of the grant entry"],
          ["lock/{name}/waiters/{seq}", "session_id", "FIFO queue; seq = Raft index of the wait request"]
        ] },
        { t: "p", html: "This is not a general-purpose database. Each node runs the same in-memory state machine, fed by a Raft log on local SSD with periodic snapshots (the way etcd uses bbolt). Linearizable compare-and-set is the core operation, so the state must be tightly coupled to the consensus log." },
        { t: "h", text: "High-level design" },
        { t: "diagram", caption: "All lock operations go through the Raft leader; the protected storage independently rejects writes whose token is older than one it has seen.", code: `flowchart LR
  W1["Worker A<br/>client library"] -->|"acquire, keepalive"| L["Lock node 1<br/>Raft leader"]
  W2["Worker B<br/>client library"] -->|"acquire, waiting"| L
  L -->|"AppendEntries"| F1["Lock node 2"]
  L -->|"AppendEntries"| F2["Lock node 3"]
  L -->|"AppendEntries"| F3["Lock node 4"]
  L -->|"AppendEntries"| F4["Lock node 5"]
  W1 -->|"write with token 884213"| S[("Protected storage<br/>keeps max token")]
  W2 -.->|"later write with token 884250"| S` },
        { t: "p", html: "<b>Acquire path:</b> the client library sends acquire to any node, which forwards to the leader. The leader appends 'grant lock X to session S' (or 'enqueue S') to the Raft log; once a majority stores it, the entry is applied, and its log index is returned as the token. <b>Release and expiry:</b> release, or the leader noticing a session's TTL has elapsed, appends an entry that frees the lock and grants it to the head of the waiter queue in the same entry. <b>Reads</b> such as 'who holds X' use ReadIndex, so a deposed leader can never answer from stale state." },
        { t: "h", text: "Deep dives" },
        { t: "p", html: "<b>1. Session expiry without trusting clocks.</b> The leader measures each TTL with its monotonic clock from when it received the last keepalive. The client measures from when it <em>sent</em> the keepalive and considers itself expired early, at TTL minus a margin (for example 8 s of a 10 s TTL), stopping protected work before the server could expire it. After a leader change, the new leader does not know when each session last renewed, so it gives every session a fresh full TTL. That errs toward keeping locks longer, which is safe, rather than freeing them early, which is not. Chubby uses a similar grace period on master failover." },
        { t: "p", html: "<b>2. Fencing tokens.</b> Using the grant's Raft log index as the token makes tokens strictly increasing across all locks and across leader changes with no extra state. Protected stores apply writes conditionally (<code>WHERE fence_token &lt;= :token</code>) and record the new maximum. For resources that cannot check tokens, such as third-party APIs, the lock is only advisory, so those operations must be idempotent (idempotency keys) or conditional." },
        { t: "p", html: "<b>3. Waiters without a thundering herd.</b> Waiters are queued in log order. On release the leader grants the lock directly to the next waiter and notifies only that client, instead of waking everyone to race (the ZooKeeper recipe achieves the same effect by having each waiter watch only its predecessor's znode). Waiters whose sessions expire are removed from the queue in the same way." },
        { t: "p", html: "<b>4. Why not Redis?</b> A single Redis SET NX PX is fast but replicates asynchronously, so a failover can lose a granted lock and grant it again. Redlock adds timing assumptions but no fencing. Both are acceptable for efficiency locks; correctness locks need this consensus-backed design." },
        { t: "h", text: "Trade-offs and bottlenecks" },
        { t: "table", head: ["Decision", "Benefit", "Cost"], rows: [
          ["5-node Raft group instead of 3", "Survives two failures, or one during maintenance", "Each write waits for 3 acks; slightly higher latency"],
          ["Keepalives handled by the leader only", "No log write per renewal", "Leader failover must extend every lease"],
          ["Token = Raft log index", "Globally monotonic for free", "Protected storage must be changed to check tokens"],
          ["One Raft group", "Simple; linearizable across all locks", "Write ceiling of roughly 10k+/s; beyond that shard lock names across groups"],
          ["Cross-region placement", "Survives a region outage", "Every acquire pays a cross-region quorum round trip, 60–150 ms"]
        ] }
      ],
      followups: [
        "How would you add shared (read) locks alongside exclusive ones?",
        "The protected system is a third-party API that cannot check tokens. What can you still guarantee?",
        "How would you make acquisition fast for clients in three different regions?",
        "A client's keepalives are delayed 9 seconds by a network blip. Walk through what each side believes.",
        "How would a 50-instance service use this API to elect exactly one active leader?"
      ]
    },
    {
      id: "design-wallet-to-bank-saga",
      title: "Design a cross-service money transfer (wallet to bank) with sagas",
      level: "Hard",
      prompt: "A fintech app holds user balances in its own Wallet service. Design 'cash out': a user moves money from their wallet to their external bank account through a third-party payout provider. Money must never be created or lost, the user must never be paid twice, and the provider's API is slow and sometimes times out.",
      clarify: [
        "How many transfers per day, and what does the peak look like (paydays)?",
        "Does the payout provider support idempotency keys, a status lookup endpoint and webhooks?",
        "How fast must money arrive, and what does the user see while a transfer is pending?",
        "Are fraud and risk checks or daily limits part of the flow?",
        "What audit and reconciliation obligations exist (double-entry ledger, settlement reports)?",
        "Can a payout bounce back days later (bank returns), and how should that be reflected?"
      ],
      hints: [
        "The wallet database and the provider cannot share a transaction, and the provider will never join 2PC. What sequence of local transactions with compensations would work?",
        "Reserve money with a hold instead of debiting it outright, so the compensation is simply releasing the hold.",
        "The payout call is the pivot. Once the provider might have accepted it, you cannot compensate blindly. How do you resolve a timeout?",
        "Use an orchestrator with a durable state machine, the transfer ID as the idempotency key at every hop, and an outbox for every state change that emits a message.",
        "Add a daily reconciliation job that compares your ledger with the provider's settlement report and alerts on any mismatch."
      ],
      solution: [
        { t: "h", text: "Requirements" },
        { t: "list", items: [
          "<b>Functional:</b> start a cash-out with amount and destination; show status; allow cancel before payout; notify the user; handle provider rejections and later bank returns.",
          "<b>Non-functional:</b> no money lost or duplicated (correctness over latency); idempotent API; 99.95% availability for initiating transfers; completion within minutes; full audit trail; keep accepting requests during provider outages by queueing."
        ] },
        { t: "h", text: "Estimates" },
        { t: "list", items: [
          "20M users, 2% cash out per day: 400,000 transfers/day ÷ 86,400 s ≈ 5/s average; payday peak 20x ≈ 100/s.",
          "About 6 state transitions per transfer, each a local transaction plus an outbox event: ~600 writes/s and ~600 messages/s at peak. Trivial for PostgreSQL and Kafka; the challenge is correctness, not scale.",
          "Storage: transfer row 1 KB + 4 ledger entries × 200 B + 6 events × 500 B ≈ 4.8 KB per transfer; 400,000 × 4.8 KB ≈ 1.9 GB/day ≈ 700 GB/year. Audit rules require years of retention, so partition by month and archive old partitions.",
          "Provider calls average ~1 s, so at 100/s about 100 are in flight at once (Little's Law), an easy concurrency level for a worker pool."
        ] },
        { t: "h", text: "API" },
        { t: "code", lang: "http", code: `POST /v1/transfers
Idempotency-Key: 7d3c9e2a-cashout
{"wallet_id": "w-12", "amount": "250.00", "currency": "USD", "bank_account_id": "ba-9"}
  -> 202 {"transfer_id": "tr-5521", "status": "PENDING"}

GET  /v1/transfers/tr-5521
  -> 200 {"status": "PAYOUT_SUBMITTED", "updated_at": "2026-10-22T10:04:51Z"}

POST /v1/transfers/tr-5521/cancel
  -> 202, or 409 if the payout was already submitted

POST /internal/provider-webhooks          (signature verified)
  {"payout_ref": "tr-5521", "status": "PAID"}` },
        { t: "h", text: "Data model" },
        { t: "p", html: "Each service owns a PostgreSQL database: money needs transactions, constraints and an append-only double-entry ledger, which relational databases do well at this volume." },
        { t: "code", lang: "sql", code: `-- Wallet service
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  available NUMERIC(18,2) NOT NULL CHECK (available >= 0),
  held      NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (held >= 0));
CREATE TABLE ledger_entries (             -- append-only, double entry
  id BIGSERIAL PRIMARY KEY, transfer_id TEXT NOT NULL, step TEXT NOT NULL,
  account TEXT NOT NULL, direction TEXT NOT NULL, amount NUMERIC(18,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (transfer_id, step, account));    -- a replayed step cannot post twice
CREATE TABLE processed_commands (command_id TEXT PRIMARY KEY);
CREATE TABLE outbox (id BIGSERIAL PRIMARY KEY, topic TEXT, key TEXT, payload JSONB);

-- Transfer orchestrator
CREATE TABLE transfers (
  id TEXT PRIMARY KEY, idempotency_key TEXT UNIQUE NOT NULL,
  wallet_id TEXT NOT NULL, amount NUMERIC(18,2) NOT NULL,
  state TEXT NOT NULL, attempts INT NOT NULL DEFAULT 0,
  next_action_at TIMESTAMPTZ, version BIGINT NOT NULL DEFAULT 0);` },
        { t: "h", text: "High-level design" },
        { t: "diagram", caption: "The orchestrator owns the transfer state machine; the Wallet service owns the money; reconciliation independently checks both against the provider.", code: `flowchart LR
  U(("User app")) -->|"POST /transfers"| API["Transfer API"]
  API --> O["Saga orchestrator<br/>state machine"]
  O --> ODB[("Transfers DB<br/>plus outbox")]
  O -->|"PlaceHold, CaptureHold, ReleaseHold"| K[["Kafka commands and replies"]]
  K --> W["Wallet service"]
  W --> WDB[("Wallet DB<br/>ledger plus outbox")]
  O -->|"risk check"| R["Risk service"]
  O -->|"payout, key = transfer id"| P["Payout provider"]
  P -.->|"webhook: PAID or FAILED"| API
  Rec["Daily reconciliation"] -.-> P
  Rec -.-> WDB` },
        { t: "table", head: ["State", "Orchestrator action", "On success", "On failure"], rows: [
          ["PENDING", "Send PlaceHold to Wallet", "HOLD_PLACED", "Insufficient funds: FAILED, nothing to undo"],
          ["HOLD_PLACED", "Call the risk service", "RISK_APPROVED", "Rejected: RELEASING_HOLD, then FAILED"],
          ["RISK_APPROVED", "Call provider payout with Idempotency-Key = transfer_id (the pivot)", "PAYOUT_SUBMITTED", "Definitive reject: RELEASING_HOLD, then FAILED. Timeout: PAYOUT_UNKNOWN"],
          ["PAYOUT_UNKNOWN", "Query provider status by transfer_id; retry with the same key", "PAYOUT_SUBMITTED", "Still unknown: keep polling with backoff, page a human after N hours"],
          ["PAYOUT_SUBMITTED", "Wait for webhook, poll as a fallback", "PAID", "Provider reports FAILED: RELEASING_HOLD, then FAILED"],
          ["PAID", "Send CaptureHold to Wallet (held funds move to the payout clearing account)", "COMPLETED", "Retry until it succeeds; steps after the pivot cannot fail permanently"]
        ] },
        { t: "p", html: "Every transition is one local transaction in the Transfers DB that updates <code>state</code> and <code>version</code> and inserts an outbox row for any command it sends. The Wallet service handles each command in one local transaction too: check <code>processed_commands</code>, move money between <code>available</code> and <code>held</code>, insert ledger entries, and add a reply to its outbox." },
        { t: "h", text: "Deep dives" },
        { t: "p", html: "<b>1. Orchestration, not choreography or 2PC.</b> The flow has ordered steps, timeouts, an external pivot and money at stake, so an explicit, queryable state machine (built in-house or on Temporal) beats events scattered across services. 2PC is impossible because the provider will not participate, and it would block on coordinator failure anyway." },
        { t: "p", html: "<b>2. The payout timeout is not a failure.</b> A timed-out payout may have succeeded, so releasing the hold would let the user spend money that was also sent to their bank. The orchestrator moves to PAYOUT_UNKNOWN, retries with the same idempotency key (the provider returns the original result rather than paying twice) and polls the status endpoint. Only a definitive 'not found after the provider's documented window' or an explicit rejection triggers compensation. Webhooks and polls can arrive out of order, so transitions only move forward: a late PENDING status after PAID is ignored." },
        { t: "p", html: "<b>3. Holds as semantic locks.</b> PlaceHold runs <code>UPDATE accounts SET available = available - :amt, held = held + :amt WHERE id = :id AND available &gt;= :amt</code>; zero rows updated means insufficient funds. Because the hold is taken first, a concurrent purchase cannot spend the same money, which covers the isolation that sagas otherwise lack. Compensation (ReleaseHold) and completion (CaptureHold) are both idempotent and keyed by transfer_id." },
        { t: "p", html: "<b>4. Exactly-once effects over at-least-once messaging.</b> Commands and replies travel through outboxes and may be delivered twice. Wallet deduplicates on command_id, the ledger's unique constraint stops double posting, and the orchestrator ignores replies for states it has already left (checked against <code>version</code>). A daily job reconciles the ledger's clearing account against the provider's settlement file; any mismatch pages finance operations." },
        { t: "p", html: "<b>5. Bank returns.</b> A payout can bounce days after PAID. That is not a rollback of the saga but a new business flow: a 'payout returned' saga credits the wallet with new ledger entries and notifies the user." },
        { t: "h", text: "Trade-offs and bottlenecks" },
        { t: "list", items: [
          "Asynchronous 202 response: users see PENDING for seconds to minutes, in exchange for surviving provider outages without failing requests.",
          "Holds reduce the spendable balance immediately; users may be confused, so show 'available' and 'pending' separately.",
          "PAYOUT_UNKNOWN can last hours during provider incidents; the funds stay held, which is correct but needs clear user messaging and an operations dashboard.",
          "The orchestrator is a critical component; run it stateless over its database, with several instances claiming due transfers via <code>next_action_at</code> and optimistic locking on <code>version</code>.",
          "Reconciliation is the safety net for bugs in everything else; without it, a silent mismatch can persist for months."
        ] }
      ],
      followups: [
        "The provider's webhook says PAID, but a status poll a second earlier said PENDING and is processed afterwards. How do you keep state correct?",
        "How would you add a currency-conversion step whose quote expires after 30 seconds?",
        "A new step must be added to the state machine while 50,000 transfers are in flight. How do you migrate?",
        "The Wallet service is down for 20 minutes at payday peak. What do users and the orchestrator experience?",
        "Up to which state can a user cancel, and what does cancel do in each state?"
      ]
    }
  ]
};
