module.exports = {
  id: "reliability",
  num: 12,
  part: 5,
  title: "Reliability, Availability and Fault Tolerance",
  tagline: "Design for failure: redundancy, failover, retries and recovery that actually work.",
  level: "Intermediate",
  lessons: [
    {
      id: "availability-math",
      title: "Availability math and redundancy",
      minutes: 10,
      blocks: [
        { t: "p", html: "<b>Availability</b> is the fraction of time (or of requests) a system serves correctly. For a single component it is <code>A = MTBF / (MTBF + MTTR)</code>: mean time between failures divided by total time. A server that fails on average every 1,000 hours and takes 1 hour to replace is up 1000 / 1001 ≈ <b>99.9%</b> of the time. Notice the lever this gives you: cutting MTTR from 1 hour to 6 minutes buys as much as making the hardware fail ten times less often. Fast detection, automated failover and quick rollback are availability features." },
        { t: "numbers", items: [
          { value: "8.76 h", label: "Downtime per year at 99.9%" },
          { value: "43.8 min", label: "Downtime per month at 99.9%" },
          { value: "52.6 min", label: "Downtime per year at 99.99%" },
          { value: "5.26 min", label: "Downtime per year at 99.999%" }
        ] },
        { t: "p", html: "Chapter 3 has the full table of nines. This lesson is about the next step: computing the availability of a <em>system</em> from the availability of its parts, and finding the parts that cap it." },
        { t: "h", text: "Components in series" },
        { t: "p", html: "If a request needs every component to work (load balancer, then app server, then database), the components are in <b>series</b> and their availabilities multiply: <code>A = A1 × A2 × ... × An</code>. Two 99.9% components give <code>0.999 × 0.999 = 0.998001</code>, about <b>99.8%</b>. Downtime roughly doubles, from 8.8 to about 17.5 hours a year. Ten 99.9% dependencies in series give <code>0.999^10 ≈ 0.990</code>, which is 99.0% or about 3.6 days a year. Every synchronous dependency you add lowers the ceiling." },
        { t: "h", text: "Components in parallel" },
        { t: "p", html: "If any one of several redundant copies can serve the request, they are in <b>parallel</b>, and you multiply the <em>unavailabilities</em>: <code>A = 1 − (1 − A1) × (1 − A2)</code>. Two independent 99.9% replicas give <code>1 − (0.001)^2 = 1 − 0.000001 = 0.999999</code>, six nines, roughly 32 seconds of downtime a year. Three 99% servers give <code>1 − 0.01^3 = 99.9999%</code>. Redundancy is how you build a reliable system out of unreliable parts." },
        { t: "diagram", caption: "Series multiplies availabilities, parallel multiplies unavailabilities; real systems mix both.", code: `flowchart LR
  subgraph S["Series: both must work"]
    S1["App server<br/>99.9%"] --> S2["Database<br/>99.9%"]
  end
  subgraph P["Parallel: either can serve"]
    P0["Load balancer"] --> P1["Replica 1<br/>99.9%"]
    P0 --> P2["Replica 2<br/>99.9%"]
  end
  S2 -.->|"0.999 x 0.999 = 99.8%"| R1["Lower than either part"]
  P1 -.->|"1 - 0.001 x 0.001 = 99.9999%"| R2["Higher than either part"]` },
        { t: "p", html: "A worked example. Take a three-tier stack and compute it the way you would on a whiteboard, tier by tier (parallel inside a tier, series across tiers):" },
        { t: "table", head: ["Design", "LB tier", "App tier", "DB tier", "End to end", "Downtime / year"], rows: [
          ["A: one of each", "99.99%", "99.9%", "99.9%", "0.9999 × 0.999 × 0.999 ≈ <b>99.79%</b>", "≈ 18.4 h"],
          ["B: 2 app servers, DB primary + standby", "99.99%", "1 − 0.001² = 99.9999%", "99.9999%", "≈ <b>99.99%</b>", "≈ 54 min"],
          ["C: B plus an LB pair", "1 − 0.0001² ≈ 99.999999%", "99.9999%", "99.9999%", "≈ <b>99.9998%</b>", "≈ 1 min on paper"]
        ] },
        { t: "p", html: "Design B shows the key insight: once the app and DB tiers are redundant, the single load balancer dominates the result. The end-to-end number is set by the <b>weakest series component</b>, so you find that one and fix it next. That weakest link is a <b>single point of failure (SPOF)</b>: one component whose failure takes the whole system down." },
        { t: "callout", kind: "warn", title: "The parallel formula is optimistic", html: "It assumes failures are <b>independent</b> and failover is <b>instant</b>. Neither is true. Both replicas run the same bad deploy, share the same expired certificate, sit in the same AZ when its power fails, or read the same broken config. Failover takes 10–60 seconds to detect and execute, and the failover machinery itself can fail. Design C will not deliver one minute a year. Correlated failures are why you spread replicas across AZs, stagger deploys and keep dependencies diverse." },
        { t: "h", text: "Hidden single points of failure" },
        { t: "list", items: [
          "A single database primary, cache cluster, message broker or load balancer.",
          "Shared dependencies everyone forgets: DNS provider, auth service, config/feature-flag service, secrets store, container registry.",
          "A single region, or one AZ that holds all the replicas of a shard.",
          "Operational SPOFs: an unrenewed TLS certificate, a cron job on one box, the one engineer who knows how to fail over."
        ] },
        { t: "h", text: "Redundancy levels: N, N+1, N+2, 2N" },
        { t: "table", head: ["Level", "Meaning", "Survives", "Typical use"], rows: [
          ["N", "Exactly enough capacity for peak load", "Nothing; any failure degrades service", "Dev and test"],
          ["N+1", "One spare unit", "One failure, or one unit down for maintenance", "Most stateless tiers"],
          ["N+2", "Two spares", "A failure during a deploy or maintenance window", "Critical tiers, quorum systems"],
          ["2N", "A full duplicate of everything", "Loss of an entire site", "Active-active data centers or regions"]
        ] },
        { t: "p", html: "Apply this to zones. If peak needs N = 6 servers and you spread across 3 AZs, losing one AZ leaves two, which must still hold 6, so each AZ needs 3 and you run <b>9 total (1.5N)</b>. With only 2 AZs each needs all 6: <b>12 total (2N)</b>. In general, with k zones you provision <code>N × k / (k − 1)</code>. More zones means less idle headroom." },
        { t: "callout", kind: "interview", title: "How to talk about availability", html: "State the target in minutes (\"99.99% is about 4.4 minutes a month\"), multiply the series path, point at the SPOFs, add redundancy where it moves the number, and size capacity so a zone loss at peak still leaves N. Then say the honest part: real availability is limited by correlated failures and MTTR, so you also invest in fast detection, automated failover and safe deploys." }
      ]
    },
    {
      id: "failover",
      title: "Failover: active-passive, active-active, zones and regions",
      minutes: 9,
      blocks: [
        { t: "p", html: "Redundancy only helps if traffic actually moves off the broken part. <b>Failover</b> is that move. There are two basic shapes, and the choice depends mostly on whether the component holds state that can be written in only one place at a time." },
        { t: "h", text: "Active-passive" },
        { t: "p", html: "One node serves traffic while a <b>standby</b> waits. A <b>hot</b> standby is running and continuously replicating, and takes over in seconds. A <b>warm</b> standby is running but scaled down or lagging, and takes minutes. A <b>cold</b> standby is provisioned from backups when needed, and takes hours. This is the default for databases: one primary accepts writes, so there is never a write conflict, and the standby is a full-size copy so it can absorb the load." },
        { t: "steps", items: [
          { title: "Detect", html: "Health checks or heartbeats miss several times in a row, for example 3 misses at a 5-second interval, so about 15 seconds. Too aggressive and a GC pause triggers a false failover; too lax and you burn downtime." },
          { title: "Fence the old primary", html: "Make sure the old node cannot keep accepting writes: revoke its lease, cut it off at the network or storage layer, or use fencing tokens. Without this you get <b>split brain</b>, two primaries diverging (Chapter 8 covers leases and fencing)." },
          { title: "Promote", html: "The standby applies any replicated log it has and becomes primary. With asynchronous replication, writes the old primary acknowledged but had not shipped are lost." },
          { title: "Redirect traffic", html: "Move a virtual IP, update DNS (with a low TTL), or update service discovery so clients find the new primary. Clients must reconnect and retry." },
          { title: "Recover and rebuild", html: "Rebuild the old node as the new standby. Avoid automatic failback, which can cause flapping between nodes." }
        ] },
        { t: "diagram", caption: "A database failover: detection, promotion and redirection each add seconds of downtime.", code: `sequenceDiagram
  participant App as App servers
  participant Mon as Failover manager
  participant P as DB primary AZ-a
  participant S as DB standby AZ-b
  participant SD as Service discovery
  App->>P: reads and writes
  P->>S: stream replication log
  Note over P: AZ-a loses power
  Mon->>P: health check times out 3 times
  Mon->>S: promote to primary
  S-->>Mon: now accepting writes
  Mon->>SD: point db-primary at AZ-b
  App->>SD: resolve db-primary again
  App->>S: reads and writes resume` },
        { t: "h", text: "Active-active" },
        { t: "p", html: "In <b>active-active</b> every node serves live traffic. Stateless tiers behind a load balancer are naturally active-active. Nothing sits idle, and the \"failover path\" is exercised every second, so it is known to work. The catches: the survivors must absorb the failed node's share, so with two nodes each must stay under about <b>50%</b> utilization at peak (three nodes: about 66%). And if the nodes hold writable state, concurrent writes in two places create conflicts that need resolution strategies (multi-leader replication and CRDTs, Chapter 7)." },
        { t: "compare", items: [
          { title: "Active-passive", pros: ["No write conflicts: one writer at a time", "Simple mental model for stateful systems", "Standby has full capacity for the failover"], cons: ["Standby capacity sits idle", "Failover path is rarely exercised and may not work when needed", "Seconds to minutes of downtime per failover"], use: "Databases and other stateful components with a single writer, such as a PostgreSQL primary with a hot standby." },
          { title: "Active-active", pros: ["All capacity serves traffic", "Failover is just rerouting; often near-instant", "Can serve users from the closest site"], cons: ["Each node must keep headroom to absorb the others", "Writable state needs conflict handling", "Harder to reason about consistency"], use: "Stateless tiers everywhere; stateful data only when it is partitioned by owner or mergeable (counters, sets, append-only logs)." }
        ] },
        { t: "h", text: "Multi-AZ vs multi-region" },
        { t: "p", html: "An <b>availability zone (AZ)</b> is one or more data centers with independent power, cooling and networking, separated from other AZs in the same region by kilometers but close enough for low single-digit millisecond round trips. That is fast enough for <b>synchronous</b> replication. Regions are hundreds to thousands of kilometers apart, with 60–150 ms cross-region RTT, which pushes you toward <b>asynchronous</b> replication." },
        { t: "table", head: ["Aspect", "Multi-AZ (one region)", "Multi-region"], rows: [
          ["Protects against", "Data center fire, power or network loss in one AZ", "Regional outage, regional control-plane failure, natural disaster"],
          ["Replication", "Synchronous is practical (1–2 ms per commit)", "Usually asynchronous (60–150 ms RTT)"],
          ["RPO on failure", "Zero with sync replication", "Seconds of writes, the replication lag"],
          ["Failover time", "Seconds to a couple of minutes", "Minutes (warm standby) to near zero (active-active)"],
          ["Extra latency", "Negligible", "Large if a request crosses regions"],
          ["Cost and complexity", "Modest; managed databases do it for you", "High: duplicate stacks, data sync, routing, testing"]
        ] },
        { t: "callout", kind: "example", title: "Multi-AZ is not multi-region", html: "In the December 2021 AWS us-east-1 outage, an automated scaling activity caused congestion on AWS's internal network and impaired many AWS services and APIs across the region. The impact did not respect AZ boundaries, so applications that depended on those regional services were affected even when they were spread across several AZs." },
        { t: "p", html: "One more principle: <b>static stability</b>. During large incidents the control plane (APIs that launch instances, change DNS, scale clusters) is often the first thing to degrade. A design that needs to launch 100 new servers to survive an AZ loss may not be able to. Pre-provision the headroom so the data plane keeps working with no changes." },
        { t: "callout", kind: "warn", title: "Untested failover does not work", html: "DNS-based failover is slowed by resolvers and clients that cache records beyond the TTL. Connection pools hold sockets to the dead primary. Runbooks go stale. Schedule failovers (game days) so you know the real RTO, and prefer mechanisms that do not depend on client DNS behavior, such as anycast or proxies that reroute at the edge." },
        { t: "callout", kind: "interview", title: "Default answer", html: "\"Multi-AZ by default for everything, with sync replication for the database. Multi-region only if the requirements justify roughly double the cost and complexity: a regional-disaster RTO, global latency targets, or data residency.\" Interviewers like hearing you scope the expensive option instead of reaching for it reflexively." }
      ]
    },
    {
      id: "timeouts-retries",
      title: "Timeouts, retries, backoff and jitter",
      minutes: 10,
      blocks: [
        { t: "p", html: "Most failures in distributed systems are not clean crashes but <b>slowness</b>: a dependency that takes 30 seconds instead of 30 milliseconds. A hung dependency is worse than a dead one, because every caller waiting on it holds a thread, a connection and memory. The first defense is a timeout; the second is a careful retry." },
        { t: "h", text: "Timeouts" },
        { t: "list", items: [
          "<b>Every remote call gets a timeout.</b> Many clients default to none: Python <code>requests</code> waits forever unless you pass <code>timeout=</code>.",
          "Set separate <b>connect</b> and <b>request</b> timeouts. Inside a data center a connect timeout of a few hundred milliseconds is plenty.",
          "Base the request timeout on the dependency's measured latency, a bit above its p99.9. If p99.9 is 400 ms, start around 500 ms, not 30 seconds.",
          "<b>Propagate deadlines.</b> If the user-facing budget is 1 second and 700 ms are spent, the next hop gets at most 300 ms. gRPC deadlines do this automatically. Never keep working for a caller that has already given up."
        ] },
        { t: "h", text: "Which failures to retry" },
        { t: "p", html: "Retries turn transient failures (a dropped packet, a node restarting, a leader election) into successes. They are only correct for errors that might succeed next time, and only for operations that are safe to repeat." },
        { t: "table", head: ["Failure", "Retry?", "Why"], rows: [
          ["Connection refused or reset, DNS blip", "Yes, with backoff", "Likely transient; request probably never reached the app"],
          ["<code>503 Service Unavailable</code>", "Yes, with backoff; honor <code>Retry-After</code>", "Server is overloaded or restarting"],
          ["<code>429 Too Many Requests</code>", "Yes, after <code>Retry-After</code>", "You are being rate limited (Chapter 11); hammering makes it worse"],
          ["Timeout on an idempotent call", "Yes, a limited number of times", "Repeating it has the same effect"],
          ["Timeout on a non-idempotent call", "Only with an idempotency key", "The first attempt may have succeeded"],
          ["<code>400</code>, <code>401</code>, <code>403</code>, <code>404</code>, <code>422</code>", "No", "The request itself is wrong; it will fail the same way"]
        ] },
        { t: "callout", kind: "warn", title: "Idempotency is a prerequisite for retries", html: "A timeout tells you nothing about whether the server did the work. Retrying <code>POST /charges</code> after a timeout can charge the customer twice. Make the operation idempotent with an <b>idempotency key</b> that the server stores and dedupes on (Chapter 11), or do not retry it automatically." },
        { t: "h", text: "Exponential backoff with full jitter" },
        { t: "p", html: "If thousands of clients retry on a fixed schedule, their retries arrive in synchronized waves that knock the recovering server back down. <b>Exponential backoff</b> doubles the wait each attempt so pressure drops over time. <b>Jitter</b> randomizes the wait so clients spread out instead of moving in lockstep. With <b>full jitter</b>, each wait is a random value between zero and the capped exponential: <code>sleep = random(0, min(cap, base × 2^attempt))</code>. AWS's published analysis of backoff strategies found that adding jitter sharply cuts the total number of calls clients make while competing for a contended resource." },
        { t: "code", lang: "python", code: `import random
import time

class TransientError(Exception):
    """Timeouts, connection resets, 503s, 429s: safe to retry."""

def call_with_backoff(op, max_attempts=5, base=0.1, cap=5.0):
    """Run op() with capped exponential backoff and full jitter.

    Only wrap idempotent operations, or ones carrying an idempotency key.
    """
    for attempt in range(max_attempts):
        try:
            return op()
        except TransientError:
            if attempt == max_attempts - 1:
                raise                                # out of attempts
            ceiling = min(cap, base * 2 ** attempt)  # 0.1, 0.2, 0.4, 0.8 ...
            time.sleep(random.uniform(0, ceiling))   # full jitter

# usage: call_with_backoff(lambda: inventory.reserve(sku, qty, key=order_id))` },
        { t: "h", text: "Retry storms and amplification" },
        { t: "p", html: "Retries multiply across layers. If every layer makes up to 3 attempts and the bottom dependency is down, one user request becomes <code>3 × 3 × 3 = 27</code> calls at the database, at the exact moment it is struggling. That positive feedback loop is a <b>retry storm</b>, and it is a classic way a brief blip becomes a long outage." },
        { t: "diagram", caption: "Three layers that each retry 3 times turn one user request into 27 calls on the failing database.", code: `flowchart LR
  U(("User")) -->|"1 request"| GW["API gateway<br/>3 attempts"]
  GW -->|"up to 3"| OS["Order service<br/>3 attempts each"]
  OS -->|"up to 9"| IS["Inventory service<br/>3 attempts each"]
  IS -->|"up to 27"| DB[("Overloaded database")]` },
        { t: "list", items: [
          "<b>Retry at one layer</b>, usually the one closest to the failing dependency. Other layers fail fast.",
          "<b>Cap attempts per request</b> (2–3 total) and keep a <b>retry budget</b> per client: retries may be at most about 10% of requests in a window. When the dependency is truly down, retries stop instead of tripling traffic.",
          "Let an overloaded server answer \"overloaded, do not retry\" so upstream layers stop retrying.",
          "Combine with a circuit breaker (next lesson) so a dead dependency gets near-zero traffic until it recovers."
        ] },
        { t: "callout", kind: "tip", title: "Hedged requests for tail latency", html: "For idempotent reads, send a second copy to another replica if the first has not answered by the p95 latency, and use whichever answers first. Google's \"The Tail at Scale\" paper popularized this. It adds only a few percent extra load but cuts p99 sharply. Never hedge non-idempotent writes." },
        { t: "callout", kind: "interview", title: "The sentence interviewers want", html: "\"Every call has a timeout from the remaining deadline; we retry only transient errors on idempotent operations, with capped exponential backoff and full jitter, at a single layer, under a retry budget.\" Then mention idempotency keys for writes. That one line covers most of what they probe." }
      ]
    },
    {
      id: "circuit-breakers-bulkheads",
      title: "Circuit breakers, bulkheads, load shedding and degradation",
      minutes: 11,
      blocks: [
        { t: "p", html: "Retries handle blips lasting milliseconds to seconds. When a dependency is down for minutes, you need to stop calling it, protect your own resources, and keep serving whatever you still can. Four patterns do this: circuit breakers, bulkheads, load shedding and graceful degradation." },
        { t: "h", text: "Circuit breaker" },
        { t: "p", html: "A <b>circuit breaker</b> wraps calls to a dependency and tracks failures. In <b>CLOSED</b> state calls flow normally. When the failure rate crosses a threshold (for example over 50% of at least 20 calls in a 10-second window) it trips to <b>OPEN</b>: calls fail immediately without touching the network, and the caller uses a fallback. After a cool-down it moves to <b>HALF-OPEN</b> and lets a few trial calls through. If they succeed, it closes; if any fail, it opens again. Failing fast frees threads, gives the dependency room to recover, and turns a 5-second timeout into a 1-millisecond error." },
        { t: "diagram", caption: "The breaker opens on a high failure rate, waits, then probes with a few trial calls before closing.", code: `flowchart LR
  C["CLOSED<br/>calls flow, failures counted"] -->|"failure rate over threshold"| O["OPEN<br/>fail fast, use fallback"]
  O -->|"cool-down expires, e.g. 30s"| H["HALF-OPEN<br/>allow a few trial calls"]
  H -->|"trial calls succeed"| C
  H -->|"a trial call fails"| O
  C -->|"call succeeds"| C` },
        { t: "code", lang: "python", code: `import time

class CircuitOpen(Exception):
    pass

class CircuitBreaker:
    """Minimal breaker: opens after N consecutive failures.
    Production breakers use a failure rate over a rolling window
    and limit how many trial calls run in HALF_OPEN."""
    def __init__(self, threshold=5, cooldown=30.0):
        self.threshold, self.cooldown = threshold, cooldown
        self.failures, self.state, self.opened_at = 0, "CLOSED", 0.0

    def call(self, op):
        if self.state == "OPEN":
            if time.monotonic() - self.opened_at < self.cooldown:
                raise CircuitOpen()          # fail fast; caller uses a fallback
            self.state = "HALF_OPEN"         # cool-down over: let a trial through
        try:
            result = op()
        except Exception:
            self.failures += 1
            if self.state == "HALF_OPEN" or self.failures >= self.threshold:
                self.state, self.opened_at = "OPEN", time.monotonic()
            raise
        self.failures, self.state = 0, "CLOSED"
        return result` },
        { t: "list", items: [
          "Require a <b>minimum request volume</b> before tripping, so 2 failures out of 3 calls at 3 a.m. do not open the circuit.",
          "Count timeouts and 5xx as failures, not 4xx: a 404 means the dependency is healthy.",
          "Keep breakers <b>per dependency</b>, ideally per host or endpoint, so one bad replica does not cut off the healthy ones.",
          "Netflix Hystrix popularized the pattern (it is now in maintenance mode); today you use Resilience4j, Polly, or Envoy's outlier detection in a service mesh."
        ] },
        { t: "h", text: "Bulkheads" },
        { t: "p", html: "Ships are divided into watertight compartments so one breach does not sink the ship. A <b>bulkhead</b> isolates resources the same way. Suppose a product page service uses one shared pool of 200 threads for all downstream calls, and the recommendation service starts hanging until its 30-second timeout. At 20 recommendation calls per second, Little's Law gives <code>20 × 30 = 600</code> calls in flight, far more than 200 threads. The pool fills up, and checkout, served by the same process, starts failing too. Give each dependency its own bounded pool and the hanging dependency can only exhaust its own slice." },
        { t: "diagram", caption: "Separate bounded pools per dependency: the hanging recommendation service can only exhaust its own 20 threads.", code: `flowchart LR
  Req["Incoming requests"] --> App["Product page service"]
  App --> P1["Pool: payments<br/>60 threads"]
  App --> P2["Pool: inventory<br/>60 threads"]
  App --> P3["Pool: recommendations<br/>20 threads"]
  P1 --> S1["Payment service"]
  P2 --> S2["Inventory service"]
  P3 --> S3["Recommendation service<br/>hanging"]` },
        { t: "p", html: "Bulkheads scale up to whole architectures: separate clusters for premium and free tiers, or <b>cell-based architecture</b>, where the system is split into independent copies (cells) that each serve a slice of customers, so a bad deploy or poison request hurts one cell, not everyone." },
        { t: "h", text: "Load shedding and backpressure" },
        { t: "p", html: "When demand exceeds capacity and you accept everything, queues grow until wait time exceeds the clients' timeouts. Servers then spend their capacity on requests nobody is waiting for: throughput looks high while <b>goodput</b> (useful completed work) collapses. <b>Load shedding</b> rejects excess work early and cheaply: cap concurrent requests or queue length, return a fast <code>503</code> or <code>429</code>, shed low-priority traffic (analytics, prefetch) before critical traffic (checkout), and drop queued requests whose deadline has already passed. <b>Backpressure</b> is the cooperative version: bounded queues and flow control (TCP windows, HTTP/2 and gRPC flow control, pull-based Kafka consumers) tell producers to slow down instead of letting work pile up. Chapter 9 covers backpressure in queues." },
        { t: "h", text: "Graceful degradation" },
        { t: "list", items: [
          "Serve <b>stale cached data</b> when the source is down, flagged as possibly outdated.",
          "Hide non-critical features: replace personalized recommendations with a precomputed bestseller list.",
          "Switch to <b>read-only mode</b> when the write path is impaired.",
          "Lower quality: smaller images, lower video bitrate, fewer search facets.",
          "Accept writes into a durable queue and process them later, telling the user \"processing\".",
          "Keep <b>kill switches</b> (feature flags) so operators can turn expensive features off in seconds."
        ] },
        { t: "table", head: ["Pattern", "Protects against", "Mechanism"], rows: [
          ["Timeout", "Hung dependencies holding resources", "Bound the wait per call, from the remaining deadline"],
          ["Retry with backoff and jitter", "Transient failures", "Repeat idempotent calls with randomized, growing delays"],
          ["Circuit breaker", "Hammering a dependency that is down", "Fail fast after a high failure rate, probe to recover"],
          ["Bulkhead", "One dependency exhausting shared resources", "Separate bounded pools, clusters or cells"],
          ["Load shedding", "Overload and congestion collapse", "Reject excess early with cheap errors, by priority"],
          ["Graceful degradation", "Losing whole pages to one failed feature", "Fallbacks, stale data, read-only mode, kill switches"]
        ] },
        { t: "callout", kind: "interview", title: "Tell the story as a chain", html: "\"A call to recommendations has a 200 ms timeout and one retry with jitter. If its failure rate passes 50%, the breaker opens and we fall back to the cached bestseller list. Its thread pool is capped at 20, so even if it hangs, checkout keeps working. If the whole service is overloaded we shed prefetch traffic first.\" Naming concrete numbers and fallbacks beats listing pattern names." }
      ]
    },
    {
      id: "disaster-recovery",
      title: "Disaster recovery, backups and chaos engineering",
      minutes: 10,
      blocks: [
        { t: "p", html: "High availability handles a node or an AZ failing. <b>Disaster recovery (DR)</b> handles the bigger events: losing a region, losing a database, or losing the data itself to corruption, an accidental delete, a bad migration or ransomware. Two numbers frame every DR conversation." },
        { t: "h", text: "RPO and RTO" },
        { t: "p", html: "<b>RPO (recovery point objective)</b> is how much data you can afford to lose, measured in time: an RPO of 5 minutes means after recovery you may be missing up to the last 5 minutes of writes. <b>RTO (recovery time objective)</b> is how long you can afford to be down: from the disaster until service is restored. RPO is driven by how often you copy data off-site (backup frequency or replication lag); RTO is driven by how fast you can detect, decide, restore and redirect." },
        { t: "diagram", caption: "RPO looks backward from the disaster to the last safe copy; RTO looks forward to restored service.", code: `flowchart LR
  B["Last backup or last<br/>replicated write"] -->|"RPO: writes in this gap are lost"| D["Disaster"]
  D -->|"RTO: detect, decide, restore, redirect"| R["Service restored"]` },
        { t: "h", text: "Backups done properly" },
        { t: "list", items: [
          "<b>Full, incremental and differential</b> backups trade restore speed against storage. Disk <b>snapshots</b> are fast and cheap to take.",
          "<b>Point-in-time recovery (PITR)</b>: a base backup plus the archived write-ahead log (PostgreSQL WAL, MySQL binlog) lets you restore to any second, for example just before a bad <code>DELETE</code>.",
          "The <b>3-2-1 rule</b>: 3 copies, on 2 different media or services, 1 off-site (another region or account).",
          "Make backups <b>immutable</b> (for example S3 Object Lock) and keep them in a separate account so an attacker or a buggy script with production credentials cannot delete them.",
          "<b>Test restores</b> regularly and time them. Restoring 1 TB at 200 MB/s takes about 5,000 seconds, roughly 1.4 hours, before any replay or validation. That is your RTO floor."
        ] },
        { t: "callout", kind: "warn", title: "Replication is not a backup", html: "Replicas copy every change, including the mistakes. A <code>DROP TABLE</code> or a corrupting bug reaches every synchronous replica within milliseconds. Replication protects against hardware loss; only backups with history (snapshots, PITR) protect against bad writes." },
        { t: "callout", kind: "example", title: "GitLab, January 2017", html: "While fixing replication, an engineer deleted the data directory on GitLab.com's primary database. Several of the backup and replication mechanisms they relied on turned out not to be working, and the site was restored from a copy taken about six hours earlier, losing roughly six hours of data. GitLab published the postmortem openly; the lesson everyone took from it was that an untested backup is not a backup." },
        { t: "h", text: "DR strategies" },
        { t: "table", head: ["Strategy", "What runs in the DR region", "RPO", "RTO", "Cost"], rows: [
          ["Backup and restore", "Nothing; backups are copied cross-region", "Hours (since last backup; minutes with PITR log shipping)", "Hours to a day", "$"],
          ["Pilot light", "Data replicated continuously; app tier off or minimal", "Seconds to minutes", "Tens of minutes to hours (provision and scale compute)", "$$"],
          ["Warm standby", "A scaled-down but fully working stack, ready to scale up", "Seconds to minutes", "Minutes", "$$$"],
          ["Multi-site active-active", "Full stacks serving live traffic in every region", "Near zero (async lag) or zero (sync)", "Near zero: reroute traffic", "$$$$, plus conflict handling"]
        ] },
        { t: "p", html: "Pick per system, not per company. Compare the cost of an hour of downtime with the cost of the DR setup. A payments database may justify warm standby or active-active; an internal analytics warehouse is fine with backup and restore. Many companies tier their services (tier 0 for revenue-critical, tier 3 for internal tools) and assign each tier an RPO, RTO and strategy." },
        { t: "h", text: "Chaos engineering" },
        { t: "p", html: "The only way to know your failover, retries and fallbacks work is to break things on purpose. <b>Chaos engineering</b> runs controlled experiments that inject failures into a system (ideally production) to find weaknesses before they cause outages. Tools include Netflix's Chaos Monkey, Gremlin, LitmusChaos and AWS Fault Injection Service." },
        { t: "steps", items: [
          { title: "Define steady state", html: "Pick a measurable signal of normal behavior, such as successful checkouts per minute or the SLO error rate." },
          { title: "Form a hypothesis", html: "\"If we terminate one database replica, read error rate stays under 0.1% and p99 stays under 300 ms.\"" },
          { title: "Inject a real-world failure", html: "Kill instances, add 500 ms of latency, blackhole a dependency, fill a disk, or fail an entire AZ." },
          { title: "Limit the blast radius", html: "Start in staging, then a small percentage of production traffic, with an abort button that stops the experiment automatically if the steady state breaks." },
          { title: "Fix and automate", html: "Every surprise becomes a fix. Experiments that pass become recurring automated checks so regressions are caught." }
        ] },
        { t: "callout", kind: "example", title: "Netflix", html: "Netflix built Chaos Monkey during its move to AWS to randomly terminate production instances during business hours, forcing every service to tolerate instance loss. Its later Chaos Kong exercises simulate losing an entire AWS region by evacuating traffic to the other regions Netflix runs in active-active." },
        { t: "callout", kind: "interview", title: "Close the loop", html: "When you present a design, give its RPO and RTO explicitly (\"RPO zero inside the region from sync replication, about 1 second for a regional loss; RTO about 15 minutes with warm standby\"), say how backups are protected and tested, and mention game days. It shows you think about running the system, not just drawing it." }
      ]
    }
  ],
  takeaways: [
    "Components in series multiply availabilities (0.999 × 0.999 ≈ 99.8%); redundant components in parallel multiply unavailabilities (1 − 0.001² = 99.9999%).",
    "End-to-end availability is capped by the weakest series component, so find and remove single points of failure, including DNS, auth, config and certificates.",
    "Availability = MTBF / (MTBF + MTTR): fast detection, automated failover and quick rollback often buy more than more reliable hardware.",
    "Size for failure: with k zones and peak need N, provision N × k / (k − 1), and keep active-active nodes below the utilization the survivors can absorb.",
    "Active-passive suits single-writer state such as a database primary; active-active suits stateless tiers and data that is partitioned by owner or mergeable.",
    "Multi-AZ with synchronous replication is the default (RPO zero, failover in seconds); multi-region costs far more and must be justified by requirements.",
    "Every remote call needs a timeout derived from the remaining deadline; retry only transient errors on idempotent operations, with capped exponential backoff and full jitter.",
    "Retries multiply across layers (3 × 3 × 3 = 27): retry at one layer, cap attempts, and enforce a retry budget to prevent retry storms.",
    "Circuit breakers fail fast when a dependency is down, bulkheads stop one dependency from exhausting shared resources, and load shedding keeps goodput up under overload.",
    "RPO is acceptable data loss, RTO is acceptable downtime; pick backup-restore, pilot light, warm standby or active-active per service tier, and test restores and failovers regularly."
  ],
  mcqs: [
    { q: "A request must pass through a load balancer (99.99%), an app server (99.9%) and a database (99.9%). None is redundant. What is the approximate end-to-end availability?",
      options: ["99.99%, set by the most reliable component", "99.9%, set by the least reliable component", "99.79%, the product of all three", "99.999%, because there are three layers of protection"],
      answer: 2,
      explain: "Components in series multiply: 0.9999 × 0.999 × 0.999 ≈ 0.9979, about 18 hours of downtime a year. A series system is always less available than its weakest part, not equal to it.",
      level: "easy" },
    { q: "Two independent replicas, each 99.9% available, sit behind a load balancer and either can serve any request. Ignoring the load balancer and failover time, what is the availability of the replica tier?",
      options: ["99.8%", "99.9%", "99.95%", "99.9999%"],
      answer: 3,
      explain: "Parallel components fail only if all fail: 1 − (0.001 × 0.001) = 0.999999. The 99.8% answer is the series formula, which applies when both are required.",
      level: "easy" },
    { q: "Your service needs 12 servers to handle peak traffic. You spread it evenly across 3 availability zones and must survive losing any one AZ at peak with no degradation. What is the minimum total server count?",
      options: ["12", "18", "16", "24"],
      answer: 1,
      explain: "After losing one AZ, the remaining two must hold 12 servers, so each AZ needs 6, giving 18 total (N × k / (k − 1) = 12 × 3 / 2). With only 2 AZs you would need 24.",
      level: "medium" },
    { q: "A client calls <code>POST /payments</code>, times out after 5 seconds and retries. The customer is charged twice. What is the right fix?",
      options: ["Send an idempotency key with each payment and have the server dedupe on it", "Raise the client timeout to 60 seconds so the first attempt can always finish", "Retry with exponential backoff and jitter instead of retrying immediately", "Change the endpoint from <code>POST</code> to <code>GET</code> so it becomes safe to retry"],
      answer: 0,
      explain: "A timeout does not tell the client whether the server did the work, so retries of a non-idempotent call can duplicate it. An idempotency key makes the retry return the original result. Backoff only changes when the duplicate happens, and a longer timeout still fails sometimes.",
      level: "medium" },
    { q: "Why add jitter to exponential backoff?",
      options: ["To guarantee that the total retry time stays within the caller's deadline", "To make each individual retry more likely to succeed than the one before", "To spread retries from many clients so they do not arrive in waves", "To stop clients from retrying non-idempotent requests such as POST"],
      answer: 2,
      explain: "Without jitter, clients that failed together retry together, hitting the recovering server in bursts. Randomizing each wait spreads the load out; capping the backoff, not jitter, is what bounds the total wait.",
      level: "easy" },
    { q: "A 30-second database blip became a 40-minute outage. During the incident the database saw about 20x normal traffic. The API gateway, order service and inventory service each make up to 3 attempts per call. What change helps most?",
      options: ["Raise each layer to 5 attempts with longer backoff so more requests eventually succeed", "Add two more read replicas so the database has spare capacity during incidents", "Lower every timeout to 10 ms so failed calls release resources faster", "Retry only at the layer nearest the database, with a cap and a retry budget"],
      answer: 3,
      explain: "Retries multiply across layers: 3 × 3 × 3 = 27 database calls per user request, a retry storm that keeps the database from recovering. Retrying at one layer under a budget (for example at most 10% extra) bounds the amplification; more attempts make it worse.",
      level: "hard" },
    { q: "What does a circuit breaker do in the <b>half-open</b> state?",
      options: ["Lets all calls through while it keeps counting failures in a sliding window", "Lets a few trial calls through; success closes it, failure reopens it", "Fails every call fast until an operator resets it from the dashboard", "Sends calls to a standby region while the primary dependency recovers"],
      answer: 1,
      explain: "Half-open is the probe phase after the open cool-down expires. Allowing only a few calls tests recovery without flooding a dependency that may still be fragile; letting everything through is the closed state.",
      level: "medium" },
    { q: "A product page service uses one shared pool of 200 threads for all downstream calls. The recommendation service starts hanging until its 30-second timeout, and soon checkout requests on the same service fail too. Which pattern most directly prevents checkout from failing?",
      options: ["A bulkhead: a separate, bounded pool for each dependency", "Doubling the shared pool to 400 threads so it has spare room", "Adding three retries with backoff to every recommendation call", "Caching checkout responses in Redis so checkout skips the pool"],
      answer: 0,
      explain: "At 20 recommendation calls per second and 30 seconds each, Little's Law gives 600 calls in flight, which exhausts 200 or 400 shared threads. A bulkhead caps recommendations to its own small pool so checkout keeps its threads; retries would add load.",
      level: "medium" },
    { q: "During a traffic spike your servers are at 100% CPU and completing requests at full speed, yet nearly every client sees a timeout. What is happening and what fixes it?",
      options: ["The load balancer algorithm is wrong; switch from least connections to round robin so load evens out", "Client timeouts are too short; raise them to 60 seconds so slow requests have time to finish", "Servers work on requests whose clients gave up; bound queues, drop expired requests, shed load early", "The database is missing indexes; add them so each request needs less CPU and finishes sooner"],
      answer: 2,
      explain: "This is goodput collapse: throughput stays high but the work is wasted on abandoned requests. Rejecting excess load cheaply and skipping requests past their deadline keeps the work you do useful; longer timeouts just make queues deeper.",
      level: "hard" },
    { q: "What does a recovery point objective (RPO) of 5 minutes mean?",
      options: ["Service must be back online within 5 minutes of a disaster", "At most the last 5 minutes of writes may be lost", "Backups must be taken and restore-tested every 5 minutes", "Failover must be detected and started within 5 minutes"],
      answer: 1,
      explain: "RPO bounds data loss, measured backward from the disaster to the last safe copy. Restoring service within a time limit is the RTO.",
      level: "easy" },
    { q: "A service needs an RTO under 10 minutes for a full regional outage and can tolerate about 1 minute of data loss. The team wants the cheapest strategy that meets both. Which one?",
      options: ["Backup and restore: nightly snapshots copied to the second region", "Pilot light: replicated data, no running app tier", "Warm standby: a scaled-down working stack that scales up", "Multi-site active-active: full capacity serving in both regions"],
      answer: 2,
      explain: "Warm standby keeps a running stack with continuously replicated data, so failover is mostly scaling up and redirecting traffic, achievable in minutes. Pilot light must provision compute first, typically tens of minutes; active-active meets the target but costs more.",
      level: "medium" },
    { q: "A buggy migration corrupts 10% of rows in your PostgreSQL database. You have a synchronous standby in another AZ, an asynchronous replica in another region, nightly base backups and continuous WAL archiving. How do you recover the data?",
      options: ["Fail over to the synchronous standby, which holds the last committed state", "Promote the cross-region asynchronous replica, which lags a few seconds", "Restart the primary so it replays the WAL from its last checkpoint", "Restore a base backup and replay archived WAL to just before the migration"],
      answer: 3,
      explain: "Replicas apply every change, including the corrupting writes, within milliseconds or seconds. Point-in-time recovery from a backup plus the WAL archive is what restores the state before a bad write; replication protects only against losing hardware.",
      level: "hard" },
    { q: "A stateless tier runs active-active on two nodes, each at 70% CPU at peak. One node fails at peak. What happens?",
      options: ["The survivor needs about 140% CPU and overloads; keep each node under 50% or add a third", "The survivor stays near 70% because the load balancer queues the excess requests", "Nothing visible: in active-active each node already has capacity for all traffic", "Autoscaling launches a replacement within seconds, so almost no requests are affected"],
      answer: 0,
      explain: "Active-active only survives a failure if the remaining nodes can absorb the lost share. With two nodes each must run below about 50% at peak; with three, below about 66%. New instances take minutes to boot, so autoscaling does not cover the gap.",
      level: "medium" },
    { q: "Before promoting a database standby during failover, why must you fence the old primary?",
      options: ["To shorten the time the standby takes to catch up on replication", "To prevent split brain, with both nodes accepting writes", "To flush the DNS cache so clients find the new primary faster", "To free disk space on the old primary before it is rebuilt"],
      answer: 1,
      explain: "A primary that is only slow or partitioned may still be accepting writes. Fencing (revoking its lease, cutting its network or storage access, or using fencing tokens) guarantees a single writer.",
      level: "easy" },
    { q: "A component fails on average every 1,000 hours and takes 1 hour to repair. Which change improves its availability more?",
      options: ["Doubling MTBF to 2,000 hours with better hardware", "Adding a second hour of scheduled maintenance each month", "Doubling both MTBF and MTTR together", "Cutting MTTR to 6 minutes with automated failover"],
      answer: 3,
      explain: "Availability is MTBF / (MTBF + MTTR). Doubling MTBF gives 2000 / 2001 ≈ 99.95%; cutting MTTR to 0.1 h gives 1000 / 1000.1 ≈ 99.99%. Doubling both leaves the ratio unchanged.",
      level: "hard" }
  ],
  design: [
    {
      id: "design-payment-service-9999",
      title: "Design a payment service with 99.99% availability",
      level: "Medium",
      prompt: "Design the payment service for an e-commerce platform. Checkout calls it to charge a customer's card through external payment processors such as Stripe or Adyen. It must be available 99.99% of the time, must never charge a customer twice, and must never lose a record of a successful charge.",
      clarify: [
        "Do we process cards ourselves or call external processors (PSPs)? How many PSPs, and are they interchangeable?",
        "What is the peak payment volume, for example during a holiday sale?",
        "Is 99.99% measured on our API's success rate, or does it include the processors' outages?",
        "What latency does checkout expect, and can a payment be confirmed asynchronously (\"processing\") in some cases?",
        "Which regions do we operate in, and are there data residency or PCI DSS scope constraints?",
        "What is the acceptable data loss (RPO) for the payment ledger? Is it zero?"
      ],
      hints: [
        "Start with the budget: 99.99% is about 4.4 minutes of downtime a month. Which components are in series on the payment path, and what availability does each need?",
        "Retries are unavoidable with networks and external processors. What makes a retried charge safe?",
        "Treat the ledger as the source of truth. Which state must be written durably before and after calling the processor, and what happens if the process crashes between the two?",
        "The processor itself might be down or slow. How do you avoid letting that consume all your threads, and can you route to a second processor?",
        "Think about RPO zero: what replication setup gives no data loss on an AZ failure, and what do you do about a full regional loss?"
      ],
      solution: [
        { t: "h", text: "Requirements" },
        { t: "list", items: [
          "<b>Functional:</b> create a payment for an order, capture or refund it, query status, and receive asynchronous results from processors via webhooks.",
          "<b>Exactly-once effect:</b> a payment for an order is charged at most once regardless of client, service or processor retries.",
          "<b>Availability:</b> 99.99% success for valid requests at our API, about 4.4 minutes of failure budget a month.",
          "<b>Durability:</b> RPO zero for the payment ledger within a region; no successful charge may be unrecorded.",
          "<b>Latency:</b> p99 under 2 seconds including the processor call, which dominates.",
          "<b>Security:</b> never store raw card numbers; use processor tokens to keep PCI scope small."
        ] },
        { t: "h", text: "Estimates" },
        { t: "list", items: [
          "10M payments a day → 10,000,000 / 86,400 ≈ <b>115 per second</b> on average; assume 10x at peak sales, about <b>1,200 per second</b>.",
          "Each payment writes about 3–5 ledger rows (created, authorized, captured, plus state transitions) at ~500 bytes: 10M × 5 × 500 B ≈ <b>25 GB a day</b>, about 9 TB a year. A sharded or large relational cluster handles this.",
          "Processor calls take 300–800 ms. In-flight calls at peak, by Little's Law: 1,200 × 0.8 s ≈ <b>~1,000 concurrent</b>, so size connection pools and threads accordingly.",
          "Availability budget: if our service needs 99.99% end to end and has about four series dependencies (LB, app, ledger DB, processor), each must be about 99.9975% or better (0.999975^4 ≈ 0.9999), which a single instance of anything rarely is. So every tier must be redundant, and the processor dependency must be made redundant or taken off the synchronous critical path."
        ] },
        { t: "h", text: "API" },
        { t: "code", lang: "http", code: `POST /v1/payments
Idempotency-Key: order-8812-attempt-1
{ "order_id": "8812", "amount": 4999, "currency": "USD",
  "payment_method_token": "pm_tok_abc" }
-> 201 { "payment_id": "pay_91", "status": "SUCCEEDED" }
-> 202 { "payment_id": "pay_91", "status": "PROCESSING" }

GET  /v1/payments/pay_91
-> 200 { "status": "SUCCEEDED", "psp": "adyen", "psp_ref": "..." }

POST /v1/payments/pay_91/refunds
Idempotency-Key: refund-8812-1
{ "amount": 4999 }

POST /v1/webhooks/psp/{provider}
(signed callback from the processor with the final status)` },
        { t: "h", text: "Data model" },
        { t: "p", html: "A relational database (PostgreSQL or Aurora/Spanner-class) because payments need transactions, unique constraints and strong consistency. Run it multi-AZ with <b>synchronous replication</b> for RPO zero. Shard by <code>order_id</code> hash if one primary cannot take the write rate." },
        { t: "table", head: ["Table", "Key columns", "Purpose"], rows: [
          ["<code>idempotency_keys</code>", "<code>key</code> (unique), <code>request_hash</code>, <code>payment_id</code>, <code>response</code>, <code>created_at</code>", "Dedupe retries; return the stored response for a repeated key"],
          ["<code>payments</code>", "<code>payment_id</code>, <code>order_id</code>, <code>amount</code>, <code>currency</code>, <code>status</code>, <code>psp</code>, <code>psp_ref</code>, <code>version</code>", "Current state machine: CREATED, PENDING, SUCCEEDED, FAILED, UNKNOWN"],
          ["<code>payment_events</code>", "<code>payment_id</code>, <code>seq</code>, <code>type</code>, <code>payload</code>, <code>at</code>", "Append-only ledger of every transition, for audit and reconciliation"],
          ["<code>outbox</code>", "<code>id</code>, <code>topic</code>, <code>payload</code>, <code>published</code>", "Transactional outbox for publishing payment results to Kafka"]
        ] },
        { t: "h", text: "High-level design" },
        { t: "diagram", caption: "Every tier is redundant across AZs; the processor call is guarded by a breaker and can fail over to a second processor.", code: `flowchart LR
  CO["Checkout service"] --> LB["Load balancers<br/>multi-AZ"]
  LB --> PS["Payment service<br/>stateless, 3 AZs"]
  PS --> DB[("Payments DB<br/>sync standby in 2nd AZ")]
  PS -->|"breaker, 2s timeout"| PSP1["Processor A"]
  PS -.->|"failover route"| PSP2["Processor B"]
  PSP1 -.->|"webhook"| PS
  DB --> OB["Outbox relay"]
  OB --> K[["Kafka: payment results"]]
  RC["Reconciliation job"] --> DB
  RC --> PSP1` },
        { t: "p", html: "<b>Write path:</b> checkout sends <code>POST /payments</code> with an idempotency key. The service inserts the key and a <code>PENDING</code> payment row in one transaction (a unique-key conflict means it is a retry: return the stored result). It then calls the processor, passing our <code>payment_id</code> as the processor's own idempotency key, so even our retries to the processor cannot double-charge. On a response it updates the row to <code>SUCCEEDED</code> or <code>FAILED</code> and writes an outbox row in the same transaction; a relay publishes it to Kafka for order fulfillment. <b>Read path:</b> status reads go to the primary (or a standby run with <code>synchronous_commit = remote_apply</code>, so it has applied every acknowledged write), never a lagging replica." },
        { t: "h", text: "Deep dive: idempotency and the unknown outcome" },
        { t: "p", html: "The dangerous case is a timeout from the processor: the charge may or may not have happened. Mark the payment <code>UNKNOWN</code>, return <code>202 PROCESSING</code> to checkout, and resolve it later. Because the processor call carried our idempotency key, retrying the same request is safe and returns the original outcome; the processor's webhook or a status query settles it. A <b>reconciliation job</b> compares our ledger with the processor's settlement reports daily (and status APIs every few minutes for <code>UNKNOWN</code> rows) and fixes any drift. Never retry an unknown payment with a <em>new</em> key." },
        { t: "h", text: "Deep dive: surviving processor failures" },
        { t: "list", items: [
          "A <b>circuit breaker per processor</b> with a 2-second timeout: if processor A's error rate passes the threshold, the breaker opens and new payments route to processor B. Card tokens must work with both, for example using a network token or a vault that can forward to either.",
          "A <b>bulkhead</b> per processor: separate connection pools so a hanging processor cannot exhaust capacity for the healthy one.",
          "If every processor is down, accept the payment as <code>PROCESSING</code> into a durable queue and retry with backoff and jitter. This counts as success against our availability SLO when the business accepts delayed confirmation for low-risk orders.",
          "Retry only at the payment service layer; checkout does not retry on top of it, which avoids retry amplification."
        ] },
        { t: "h", text: "Deep dive: database failover and regional DR" },
        { t: "p", html: "Within the region, the primary has a synchronous standby in another AZ (RPO zero). Failover is automated: detect after ~10–15 seconds of failed checks, fence the old primary, promote, update the endpoint; total around 30–60 seconds, which uses a large part of the monthly 4.4-minute budget, so it must be rare and rehearsed. For a regional disaster, run a <b>warm standby</b> region with an asynchronously replicated database: RPO of a few seconds of payments, recovered from processor records by reconciliation, and RTO around 10–15 minutes." },
        { t: "h", text: "Trade-offs and bottlenecks" },
        { t: "table", head: ["Decision", "Benefit", "Cost"], rows: [
          ["Sync replication across AZs", "RPO zero on AZ loss", "1–2 ms extra commit latency; write blocks if the standby is unreachable unless it degrades to async"],
          ["Two processors with breaker routing", "Processor outages do not stop payments", "Integration, token portability and reconciliation for two providers"],
          ["Accept as PROCESSING when stuck", "Keeps checkout available", "Customers wait for confirmation; some orders later fail"],
          ["Warm standby region instead of active-active", "Far simpler: one writer, no conflicts on money", "Minutes of RTO and seconds of RPO for a regional loss"],
          ["Relational DB as ledger", "Transactions and unique constraints for exactly-once effect", "Sharding is manual once a single primary is not enough"]
        ] }
      ],
      followups: [
        "How do you deploy a new version without spending the error budget? Walk through canary releases and automatic rollback.",
        "The synchronous standby becomes unreachable. Do you block writes or degrade to asynchronous replication, and what does each do to RPO and availability?",
        "A webhook from the processor arrives before your own call returns. How do you handle out-of-order updates to the payment state machine?",
        "Finance reports a mismatch between your ledger and the processor's settlement file. How does reconciliation find and fix it?",
        "What would change if the business required active-active across two regions for payments?"
      ]
    },
    {
      id: "design-multi-region-social",
      title: "Design multi-region active-active for a social app",
      level: "Hard",
      prompt: "A social app with 200M daily active users in North America, Europe and Asia currently runs in one AWS region. Users post updates, follow others, like and comment, and read a feed. Make it active-active across three regions so users get low latency and the app survives the loss of an entire region.",
      clarify: [
        "Which operations must be strongly consistent (usernames, account settings) and which can be eventually consistent (likes, feeds)?",
        "What are the latency targets for reads and writes, for example p99 under 200 ms for feed reads?",
        "What RPO and RTO do we need for a regional loss? Is losing a few seconds of likes acceptable?",
        "Are there data residency rules, such as EU users' data staying in the EU?",
        "Do most interactions happen between users in the same region, or is the graph global?",
        "Is there a budget limit? Active-active means a full data copy in every region plus spare compute in each to absorb a failed region."
      ],
      hints: [
        "Start by routing: how does a user reach the nearest healthy region, and how is traffic moved when a region fails?",
        "Not all data is the same. Split it into data that can be written anywhere and merged, and data that needs a single owner.",
        "For single-owner data, consider giving each user a home region that owns their writes. What happens when a user travels or their home region fails?",
        "For mergeable data such as like counts and follower sets, which conflict resolution strategies avoid lost updates?",
        "Capacity: if one of three regions fails, the remaining two must absorb its traffic. What utilization does that imply for each region at peak?"
      ],
      solution: [
        { t: "h", text: "Requirements" },
        { t: "list", items: [
          "<b>Functional:</b> post, follow, like, comment, read home feed and profiles; global unique usernames.",
          "<b>Latency:</b> reads and writes served in the user's nearest region, p99 under 200 ms.",
          "<b>Availability:</b> survive a full regional outage with RTO under 5 minutes for all users.",
          "<b>RPO:</b> a few seconds of social interactions may be lost on a regional disaster; account and identity data must not be lost or forked.",
          "<b>Consistency:</b> read-your-writes for a user's own actions; eventual consistency across regions for everything else."
        ] },
        { t: "h", text: "Estimates" },
        { t: "list", items: [
          "200M DAU × 50 feed reads a day = 10B reads a day → 10,000,000,000 / 86,400 ≈ <b>115k reads per second</b>, peak ~2x ≈ 230k.",
          "Writes: 200M × 10 actions (likes, comments, posts) = 2B a day ≈ <b>23k writes per second</b>, peak ~50k.",
          "Cross-region replication traffic: 50k writes/s × ~1 KB ≈ <b>50 MB/s</b> to each other region, about 400 Mbps, which is fine for inter-region links but costs real money in transfer fees.",
          "Capacity: with 3 regions, losing one sends its share to the other two, so each must handle 1.5x its normal share. Run each region at no more than about <b>66% of capacity at peak</b>, which is roughly 1.5N in total."
        ] },
        { t: "h", text: "API" },
        { t: "code", lang: "http", code: `GET  /v1/feed?cursor=...          (served by nearest region)
POST /v1/posts                      { "text": "...", "media_ids": [] }
POST /v1/posts/{id}/likes           Idempotency-Key: like-u42-p99
POST /v1/users/{id}/follow
PUT  /v1/me/settings                (routed to the user's home region)` },
        { t: "h", text: "Data model" },
        { t: "table", head: ["Data", "Store", "Write model", "Conflict handling"], rows: [
          ["Users, usernames, settings", "Strongly consistent store: Spanner/CockroachDB, or a single-writer home region", "Single owner", "None needed: one writer, or consensus for unique usernames"],
          ["Posts and comments", "Cassandra or DynamoDB global tables, partitioned by author", "Written in the author's home region", "Immutable after create; edits are rare and use last-writer-wins per field"],
          ["Likes and counters", "CRDT counters or per-region counters summed on read", "Any region", "Merge: a counter per region, total = sum"],
          ["Follow graph", "Wide-column store, edges keyed by user", "Any region", "Add-wins set with tombstones and timestamps"],
          ["Feed cache", "Redis per region", "Rebuilt locally from replicated events", "Disposable; recompute on loss"]
        ] },
        { t: "h", text: "High-level design" },
        { t: "diagram", caption: "Each region serves local users and replicates events to the others; a home region owns each user's account data.", code: `flowchart TD
  U(("Users")) --> GLB["GeoDNS or anycast<br/>health-checked routing"]
  GLB --> US["Region us-east<br/>full stack"]
  GLB --> EU["Region eu-west<br/>full stack"]
  GLB --> AP["Region ap-south<br/>full stack"]
  US <-->|"async replication"| EU
  EU <-->|"async replication"| AP
  AP <-->|"async replication"| US
  US --> GDB[("Global consistent store<br/>usernames and accounts")]
  EU --> GDB
  AP --> GDB` },
        { t: "p", html: "<b>Read path:</b> latency-based DNS or anycast sends each user to the nearest healthy region. Feed, posts and profiles are read from that region's local replicas and Redis feed cache. <b>Write path:</b> a like or follow is written locally and acknowledged, then replicated asynchronously to the other two regions (about 100–200 ms of lag). Posts are written in the author's home region. Account changes and username claims go to the strongly consistent global store, which pays a cross-region consensus round trip (100+ ms) but is a small fraction of traffic." },
        { t: "h", text: "Deep dive: home regions and conflict avoidance" },
        { t: "p", html: "The cleanest way to avoid write conflicts is to have one owner per record. Each user gets a <b>home region</b> (usually where they signed up), stored in a small global directory and cached at the edge. Writes to that user's own data (profile, posts) are routed to the home region; everyone reads anywhere. When a user travels, their reads stay local and only their own-data writes pay a cross-region hop. If the home region fails, ownership moves to a surviving region; to avoid two owners, ownership changes go through the consensus-backed directory with a fencing epoch, and writes carrying an old epoch are rejected." },
        { t: "h", text: "Deep dive: mergeable data" },
        { t: "list", items: [
          "<b>Counters:</b> never replicate \"likes = 1,042\"; replicate increments. Each region keeps its own count per post, and the displayed total is the sum. Two regions incrementing concurrently never lose updates (a G-counter, or a PN-counter for unlikes).",
          "<b>Sets</b> such as followers: use an add-wins set or record each edge with a timestamp and tombstones for removal, so a concurrent follow and unfollow resolves deterministically.",
          "<b>Idempotent events:</b> every replicated event carries a unique ID; consumers dedupe, so redelivery during failover does not double-count.",
          "<b>Read-your-writes:</b> the user's own region shows their action immediately. If a failover moves them to another region before replication arrives, the client keeps recent actions locally and merges them into what it shows for a short window."
        ] },
        { t: "h", text: "Deep dive: regional failover" },
        { t: "steps", items: [
          { title: "Detect", html: "Health checks from multiple vantage points fail for the region for about 30–60 seconds. Use automated detection but require a quorum of checkers to avoid false evacuations." },
          { title: "Evacuate", html: "Remove the region from DNS or anycast. Clients move to the next-nearest region; DNS TTLs of 30–60 seconds limit how long stragglers keep trying the dead one." },
          { title: "Absorb", html: "The two survivors take 1.5x load. Because they run at 66% or less at peak, they cope without needing to launch capacity, which may be slow during a large incident. Non-critical features (trending, recommendations) are shed if needed." },
          { title: "Reassign ownership", html: "Users homed in the failed region get a new home via the directory, with a new epoch. Writes from the failed region that never replicated, a few seconds' worth, are lost or recovered when it returns." },
          { title: "Recover", html: "When the region returns, it catches up from the others' replication logs before taking traffic, and ownership is moved back gradually." }
        ] },
        { t: "h", text: "Trade-offs and bottlenecks" },
        { t: "table", head: ["Decision", "Benefit", "Cost"], rows: [
          ["Async cross-region replication", "Local-latency writes", "Seconds of RPO on regional loss; temporary cross-region inconsistency"],
          ["Home region per user", "No write conflicts on owned data", "Cross-region hop for traveling users' own writes; ownership handoff logic"],
          ["CRDT counters and sets", "Concurrent writes everywhere without lost updates", "More complex data model; counts are briefly different per region"],
          ["Global consensus store for usernames", "Uniqueness guaranteed", "100+ ms writes; a dependency every region needs, so it must itself span 3+ regions"],
          ["66% peak utilization per region", "Survive a region loss without scaling", "About 50% more capacity than a single region at full load"]
        ] }
      ],
      followups: [
        "EU regulation now requires EU users' personal data to stay in the EU. How does that change replication and the home-region model?",
        "A network partition splits us-east from the other two regions, but us-east is still healthy and serving its users. What should happen to writes there?",
        "How would you test that a regional evacuation really works without causing an outage?",
        "A celebrity's post gets 5M likes in an hour across all regions. How do counters and replication hold up?",
        "How do you run a schema migration across three active regions without downtime?"
      ]
    }
  ]
};
