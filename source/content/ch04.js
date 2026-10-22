module.exports = {
  id: "scaling-load-balancing",
  num: 4,
  part: 2,
  title: "Scaling and Load Balancing",
  tagline: "Add machines, spread the traffic, and make the front door impossible to knock over.",
  level: "Beginner",
  lessons: [
    {
      id: "vertical-horizontal",
      title: "Vertical vs horizontal scaling, and where state lives",
      minutes: 9,
      blocks: [
        { t: "p", html: "A system <b>scales</b> when it can take on more load (requests per second, users, data) without latency or error rates getting worse. There are only two basic moves: make the machine bigger, or add more machines. Almost every design in this course depends on picking the right one for each tier." },
        { t: "h", text: "Vertical scaling (scale up)" },
        { t: "p", html: "Vertical scaling means moving to a bigger box: more CPU cores, more RAM, faster NVMe disks. It needs no code changes and no new moving parts, which is why it is the right first move for a young product and often the right long-term move for a primary database. Its limits are hard ones: there is a largest machine you can buy (top-end cloud VMs have a few hundred vCPUs and terabytes of RAM), price climbs steeply near the top of the range, resizing usually means a restart, and one machine is still a <b>single point of failure</b> (SPOF): if it dies, the service is down." },
        { t: "h", text: "Horizontal scaling (scale out)" },
        { t: "p", html: "Horizontal scaling means running many copies of a service on ordinary machines and putting a <b>load balancer</b> in front to spread requests across them. Capacity grows roughly linearly with machine count, a single failure only removes a fraction of capacity, and you can add or remove machines while serving traffic. The price is complexity: you need a load balancer, health checks, deployment tooling, and, above all, a service that does not care which copy handles a request." },
        { t: "compare", items: [
          { title: "Vertical (scale up)", pros: ["No code or architecture change", "No network hops between parts, simple to reason about", "Great for databases that are hard to split"], cons: ["Hard ceiling on machine size", "Cost rises steeply at the top end", "Still a single point of failure", "Resizing often needs downtime"], use: "Early-stage products, primary databases, and anything where splitting is harder than buying a bigger box." },
          { title: "Horizontal (scale out)", pros: ["Near-linear capacity growth", "Fault tolerance: losing one node loses 1/N of capacity", "Elastic: add and remove nodes with demand", "Commodity hardware"], cons: ["Needs a load balancer and orchestration", "Service must be stateless or state must be partitioned", "More things to monitor and debug"], use: "Web and API tiers, workers, caches, and any tier that has outgrown one machine or needs high availability." }
        ] },
        { t: "h", text: "Stateless vs stateful services" },
        { t: "p", html: "A <b>stateless</b> service keeps nothing about a client in its own memory or disk between requests. Every request carries (or points to) everything needed to handle it, so any instance can serve any request, and instances can be killed or added freely. A <b>stateful</b> service holds data that later requests depend on: databases, cache nodes, a WebSocket gateway holding open connections, a multiplayer game server holding a match in memory." },
        { t: "p", html: "The standard architecture move is to <b>push state down</b>: keep the application tier stateless and move state into purpose-built stores (PostgreSQL, Redis, S3) that know how to replicate and partition it. Then the app tier scales by just adding boxes, and the hard problem of scaling state is concentrated in a few systems you can reason about carefully (Chapter 7 covers replication and sharding)." },
        { t: "h", text: "Where session state goes" },
        { t: "p", html: "Login sessions, shopping carts and multi-step form progress are the classic state that sneaks into app servers. You have four places to put it:" },
        { t: "table", head: ["Option", "How it works", "Pros", "Cons"], rows: [
          ["Local memory + sticky sessions", "Session lives in the server's RAM; the LB pins each user to that server", "Fastest, zero infrastructure", "Server dies = users logged out; uneven load; blocks clean scale-in"],
          ["Shared session store", "Session ID in a cookie; data in <b>Redis</b> or Memcached with a TTL", "Any server can serve any user; ~0.5–1 ms lookup in the same AZ", "One more system to run and make highly available"],
          ["Database", "Sessions table in PostgreSQL/MySQL or DynamoDB", "Durable, uses existing infrastructure", "Adds a write per login and a read per request to the DB"],
          ["Client-side token", "Signed cookie or JWT holds the claims; server only verifies the signature", "No server-side lookup at all", "Hard to revoke before expiry; size limits (~4 KB cookies); see Chapter 13"]
        ] },
        { t: "diagram", caption: "With sessions in Redis, every app server is interchangeable, so the load balancer can send any request anywhere.", code: `flowchart LR
  U(("Users")) --> LB["Load balancer"]
  LB --> A1["App server 1"]
  LB --> A2["App server 2"]
  LB --> A3["App server 3"]
  A1 --> R[("Redis<br/>session store")]
  A2 --> R
  A3 --> R
  A1 --> DB[("PostgreSQL")]
  A2 --> DB
  A3 --> DB` },
        { t: "callout", kind: "warn", title: "Hidden state breaks scale-out", html: "Sessions are the obvious case, but watch for the quiet ones: files uploaded to local disk, an in-process cache that must be invalidated on writes, a cron job that now runs on all 20 instances at once, rate-limit counters kept in memory, and open WebSocket connections. Each one works on one server and fails subtly on ten." },
        { t: "callout", kind: "interview", title: "How to say it", html: "When you draw the app tier, say it out loud: <em>I'll keep the API servers stateless so they can scale horizontally behind the load balancer and autoscale. Sessions go in Redis with a 30-minute TTL, uploads go straight to object storage.</em> That one sentence answers three follow-up questions before they are asked." }
      ]
    },
    {
      id: "l4-vs-l7",
      title: "Load balancers: L4 vs L7 and TLS termination",
      minutes: 11,
      blocks: [
        { t: "p", html: "A <b>load balancer</b> (LB) is a reverse proxy (Chapter 2) whose main job is to spread traffic across a pool of backends. It gives clients one stable address, hides failed or draining servers, and lets you add capacity or deploy new code without clients noticing. The most important question about any LB is how much of the traffic it can understand, and that is what the layer numbers describe." },
        { t: "h", text: "Layer 4: transport-level balancing" },
        { t: "p", html: "An <b>L4 load balancer</b> looks only at the IP and TCP/UDP headers: source and destination IP and port. It never parses HTTP, so it cannot see the URL, headers or cookies. It picks a backend once per <em>connection</em> (or per UDP flow) and then shovels bytes or packets to it. Because the work per packet is tiny, L4 balancers are extremely fast: they handle millions of packets per second and millions of concurrent connections, and some use <b>direct server return</b> so responses bypass the LB entirely. Examples: AWS Network Load Balancer (NLB), HAProxy in <code>mode tcp</code>, Linux IPVS, Google Maglev, Facebook Katran." },
        { t: "h", text: "Layer 7: application-level balancing" },
        { t: "p", html: "An <b>L7 load balancer</b> terminates the client's connection and parses the application protocol, usually HTTP. It sees the method, host, path, headers, cookies and even the body, and decides per <em>request</em>. That unlocks routing <code>/api/*</code> and <code>/images/*</code> to different services, header-based canaries, retries on another backend, compression, response caching, rate limiting, authentication and WAF rules, and correct balancing of HTTP/2 and gRPC streams. Examples: AWS Application Load Balancer (ALB), Nginx, HAProxy in <code>mode http</code>, Envoy, Traefik." },
        { t: "table", head: ["", "L4 (NLB, IPVS, HAProxy tcp)", "L7 (ALB, Nginx, Envoy, HAProxy http)"], rows: [
          ["Can see", "IPs, ports, protocol", "Everything in the HTTP request: host, path, headers, cookies, body"],
          ["Decision made", "Once per connection", "Once per request"],
          ["Routing by path / host / header", "No (only SNI hostname if peeking at TLS)", "Yes"],
          ["Retries, timeouts, rewrites", "No", "Yes, per route"],
          ["Client IP at backend", "Preserved, or via PROXY protocol", "Via <code>X-Forwarded-For</code> header"],
          ["Protocols", "Any TCP/UDP: databases, MQTT, game traffic, DNS", "HTTP/1.1, HTTP/2, gRPC, WebSocket"],
          ["Cost per request", "Very low; millions of packets/sec", "Higher: TLS and HTTP parsing per request"]
        ] },
        { t: "diagram", caption: "Large sites stack the two: an L4 tier spreads connections across a fleet of L7 proxies, which route each request by path.", code: `flowchart LR
  C(("Clients")) --> NLB["L4 balancer<br/>NLB or Maglev"]
  NLB --> E1["L7 proxy 1<br/>Envoy"]
  NLB --> E2["L7 proxy 2<br/>Envoy"]
  E1 -->|"/api/orders"| Ord["Orders service"]
  E1 -->|"/api/search"| Sea["Search service"]
  E2 -->|"/api/orders"| Ord
  E2 -->|"/api/search"| Sea` },
        { t: "callout", kind: "warn", title: "gRPC behind an L4 balancer", html: "gRPC multiplexes thousands of requests over one long-lived HTTP/2 connection. An L4 balancer only balances <em>connections</em>, so each client stays pinned to whichever backend it connected to first, and newly added backends sit idle. Use an L7 proxy that balances individual streams (Envoy, ALB with gRPC target groups) or client-side load balancing." },
        { t: "h", text: "TLS termination" },
        { t: "p", html: "To route on HTTP, an L7 LB must decrypt the traffic, which means it holds the certificate and private key. Where you decrypt is a design choice with three common answers:" },
        { t: "compare", items: [
          { title: "Terminate at the LB", pros: ["Backends skip TLS work", "Certificates managed in one place (ACM, cert-manager)", "Enables all L7 features"], cons: ["Plaintext inside your network", "LB becomes a high-value target"], use: "Default for most web apps when the internal network is trusted." },
          { title: "Passthrough (L4)", pros: ["True end-to-end encryption", "LB never sees keys or content"], cons: ["No path or header routing (SNI only)", "Every backend manages certs", "No L7 retries or WAF"], use: "Strict compliance needs, or non-HTTP protocols over TLS." },
          { title: "Terminate and re-encrypt", pros: ["L7 routing plus encryption on every hop", "Can use mTLS to prove service identity"], cons: ["Two handshakes and more CPU", "Internal certificate management"], use: "Zero-trust networks and service meshes (Istio, Linkerd)." }
        ] },
        { t: "p", html: "Once the LB terminates the connection, backends see the LB's IP, not the client's. L7 proxies add <code>X-Forwarded-For</code> and <code>X-Forwarded-Proto</code> headers; L4 proxies that open new connections use the <b>PROXY protocol</b> (invented by HAProxy) to pass the original address, while NLB can preserve the source IP directly." },
        { t: "callout", kind: "example", title: "Real L4 + L7 stacks", html: "Google published Maglev, its software L4 balancer that sits in front of its HTTP front ends. Facebook open-sourced Katran, an eBPF/XDP-based L4 balancer that spreads traffic across its Proxygen L7 proxies. Both use the two-tier shape above." },
        { t: "callout", kind: "interview", title: "What interviewers listen for", html: "Say which layer you need and why: <em>an ALB is enough here because I need path routing and TLS termination</em>, or <em>this is raw TCP from IoT devices, so an NLB</em>. Mention where TLS terminates and how backends learn the client IP. Never just draw a box labelled LB." }
      ]
    },
    {
      id: "lb-algorithms",
      title: "Load balancing algorithms",
      minutes: 11,
      blocks: [
        { t: "p", html: "Once a request arrives, the LB must pick a backend. <b>Static</b> algorithms ignore what the backends are doing (round robin, weights, hashing). <b>Dynamic</b> algorithms use live signals such as open connections or recent latency. Dynamic ones adapt better but need accurate state, which is harder when you run many LB instances." },
        { t: "table", head: ["Algorithm", "How it picks", "Best for", "Watch out for"], rows: [
          ["Round robin", "Next backend in order", "Identical servers, short uniform requests", "Ignores load; a slow server still gets its share"],
          ["Weighted round robin", "Round robin, proportional to weights", "Mixed instance sizes, canaries (weight 1 of 100)", "Weights are static guesses"],
          ["Least connections", "Backend with fewest open connections", "Long or variable requests, WebSockets", "Connection count is a proxy for load, not load itself"],
          ["Least response time", "Lowest recent latency, often combined with fewest active requests", "Backends with uneven performance", "Can pile onto a server that is fast because it is failing quickly"],
          ["IP hash / source hash", "hash(client IP) mod N", "Cheap affinity without cookies", "NAT puts thousands of users on one IP; most mappings change when N changes"],
          ["Consistent hashing", "hash(key) on a ring, or Maglev table", "Cache affinity: same key, same server", "Hot keys still overload one server"],
          ["Power of two choices", "Pick 2 backends at random, send to the less loaded", "Many LB instances with only local state", "Needs a load signal (in-flight requests)"]
        ] },
        { t: "h", text: "Round robin and weighted round robin" },
        { t: "p", html: "Round robin is the default in Nginx, HAProxy and most cloud LBs, and it is fine when servers are identical and requests are similar. Weights let a 16-core server take twice the traffic of an 8-core one, or let you send 1% of traffic to a canary. Nginx uses a <em>smooth</em> weighted round robin that interleaves picks instead of sending bursts to the heaviest server:" },
        { t: "code", lang: "python", code: `class SmoothWeightedRR:
    """Nginx-style smooth weighted round robin."""
    def __init__(self, weights):            # e.g. {"a": 5, "b": 1, "c": 1}
        self.weights = weights
        self.current = {s: 0 for s in weights}
        self.total = sum(weights.values())

    def pick(self):
        for s, w in self.weights.items():
            self.current[s] += w            # everyone earns credit
        best = max(self.current, key=self.current.get)
        self.current[best] -= self.total    # winner pays the total back
        return best

lb = SmoothWeightedRR({"a": 5, "b": 1, "c": 1})
print([lb.pick() for _ in range(7)])        # a a b a c a a` },
        { t: "h", text: "Least connections and least response time" },
        { t: "p", html: "When some requests take 5 ms and others take 30 seconds (report exports, uploads, WebSockets), round robin keeps handing new work to a server that is already stuck on slow requests. <b>Least connections</b> sends each new request to the backend with the fewest open connections, which naturally routes around busy servers. With HTTP/2 and gRPC, where one connection carries many requests, the equivalent is <b>least requests</b> (count in-flight requests, not connections). Nginx Plus offers <code>least_time</code>, which also weighs recent response time." },
        { t: "h", text: "Power of two random choices" },
        { t: "p", html: "A fleet of 50 Envoy instances each sees only its own in-flight counts. If each one always picks the globally least-loaded server it knows of, they tend to all pick the same lightly loaded server at the same moment and overload it (herding). The fix is surprisingly simple: pick <b>two</b> backends at random and send the request to the less loaded one. This gets most of the benefit of least-loaded selection, avoids herding, and needs no coordination. It is the default behaviour of Envoy's least-request balancer." },
        { t: "code", lang: "python", code: `import random

class PowerOfTwoChoices:
    def __init__(self, backends):
        self.inflight = {b: 0 for b in backends}

    def pick(self):
        a, b = random.sample(list(self.inflight), 2)
        choice = a if self.inflight[a] <= self.inflight[b] else b
        self.inflight[choice] += 1
        return choice

    def done(self, backend):            # call when the response completes
        self.inflight[backend] -= 1` },
        { t: "h", text: "Hashing for affinity" },
        { t: "p", html: "Sometimes you want the same key to land on the same server every time: a user's requests on the server that has their data cached, or a chat room on the server that holds its connections. Plain <code>hash(key) mod N</code> works until N changes: going from 10 to 11 servers remaps about 10 out of 11 keys and empties every warm cache at once. <b>Consistent hashing</b> moves only about 1/N of keys when a server joins or leaves. Nginx exposes it as <code>hash $request_uri consistent</code>, HAProxy as <code>hash-type consistent</code>, and Envoy as ring hash or Maglev. The algorithm, with code and virtual nodes, is covered in Chapter 7." },
        { t: "code", lang: "text", code: `# Nginx: weighted least-connections pool with passive health checks
upstream api {
    least_conn;
    server 10.0.1.10:8080 weight=2 max_fails=3 fail_timeout=10s;
    server 10.0.1.11:8080 weight=1 max_fails=3 fail_timeout=10s;
    server 10.0.1.12:8080 backup;    # used only if the others are down
}
server {
    listen 443 ssl;
    ssl_certificate     /etc/nginx/tls/site.crt;
    ssl_certificate_key /etc/nginx/tls/site.key;
    location /api/ {
        proxy_pass http://api;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}` },
        { t: "callout", kind: "tip", title: "A sensible default", html: "For stateless HTTP services, start with round robin or least requests (power of two choices). Switch to least connections when request durations vary widely or connections are long-lived. Reach for consistent hashing only when affinity actually buys you something, such as cache hit rate." },
        { t: "callout", kind: "interview", title: "Justify the algorithm", html: "Interviewers rarely care which algorithm you pick; they care that you can say why. <em>Uploads take up to a minute and most API calls take 20 ms, so I'll use least connections rather than round robin.</em> Bonus point: mention that with many LB nodes you want power of two choices to avoid herding." }
      ]
    },
    {
      id: "health-draining-sticky",
      title: "Health checks, connection draining and sticky sessions",
      minutes: 10,
      blocks: [
        { t: "p", html: "A load balancer is only as good as its knowledge of which backends can take traffic. Health checks tell it who is ready, draining lets servers leave without dropping requests, and sticky sessions are a convenience that quietly fights both." },
        { t: "h", text: "Active and passive health checks" },
        { t: "p", html: "An <b>active</b> health check probes each backend on a schedule, for example <code>GET /healthz/ready</code> every 5 seconds with a 2-second timeout. To avoid flapping, the LB uses hysteresis: mark a backend down after 3 consecutive failures, and up again only after 2 consecutive successes. A <b>passive</b> check watches real traffic instead: if a backend returns errors or times out repeatedly, eject it for a while. Nginx open source does passive checks via <code>max_fails</code> and <code>fail_timeout</code>; Envoy calls it outlier detection. Production setups use both: active checks catch dead servers before users do, passive checks catch servers that answer the probe but fail real requests." },
        { t: "table", head: ["Check", "Question it answers", "Who acts on failure", "Pitfall"], rows: [
          ["Liveness", "Is the process alive and not deadlocked?", "Orchestrator restarts it (Kubernetes liveness probe)", "Too strict a check causes restart loops under load"],
          ["Readiness", "Should this instance receive traffic right now?", "LB or Service stops routing to it", "Forgetting it lets cold instances take traffic mid-boot"],
          ["Deep / dependency", "Can it reach the DB, cache and downstream APIs?", "LB removes it", "A shared dependency blip fails every instance at once"]
        ] },
        { t: "code", lang: "text", code: `# HAProxy: active HTTP health check with hysteresis
backend api
    balance leastconn
    option httpchk GET /healthz/ready
    http-check expect status 200
    default-server inter 5s fall 3 rise 2
    server app1 10.0.1.10:8080 check
    server app2 10.0.1.11:8080 check
    server app3 10.0.1.12:8080 check` },
        { t: "callout", kind: "warn", title: "Deep health checks can cause total outages", html: "If every instance's health endpoint checks the shared database, a 10-second database hiccup makes every instance fail at once and the LB removes the whole fleet, turning a partial failure into a full outage. Keep the LB's readiness check about the instance itself, and handle dependency failures in the request path (timeouts, circuit breakers, Chapter 12). Many balancers fail open as a safety net: an AWS ALB routes to all targets when all are unhealthy, and Envoy ignores health status when fewer than 50% of hosts are healthy (its panic threshold)." },
        { t: "h", text: "Connection draining" },
        { t: "p", html: "Every deploy and every scale-in removes servers that still have requests in flight. <b>Connection draining</b> (AWS calls it the deregistration delay) stops sending <em>new</em> requests to a server while letting existing ones finish, up to a timeout. The AWS default is 300 seconds; most HTTP APIs set 30–60 seconds, while services with long uploads or WebSockets need more." },
        { t: "steps", items: [
          { title: "Mark the instance as leaving", html: "The deployer deregisters it from the target group, or in Kubernetes the pod gets SIGTERM and is removed from the Service endpoints." },
          { title: "Stop new traffic", html: "The LB stops routing new requests to it. In Kubernetes, add a short <code>preStop</code> sleep (5–10 s) because endpoint removal propagates to proxies asynchronously." },
          { title: "Finish in-flight work", html: "The server completes current requests and closes idle keep-alive connections, sending <code>Connection: close</code> on HTTP/1.1 or a GOAWAY frame on HTTP/2." },
          { title: "Exit before the deadline", html: "The process exits cleanly once idle, or is killed when the drain timeout (Kubernetes default <code>terminationGracePeriodSeconds</code> is 30 s) runs out." }
        ] },
        { t: "diagram", caption: "During a rolling deploy, draining lets the old instance finish what it started while the LB sends all new requests elsewhere.", code: `sequenceDiagram
  participant D as Deployer
  participant LB as Load balancer
  participant Old as Old instance
  participant New as New instance
  D->>New: start v2 and wait for readiness
  New-->>LB: readiness check passes
  D->>LB: deregister Old
  LB->>New: all new requests
  Old-->>LB: finish in-flight responses
  Note over LB,Old: drain timeout, for example 30 s
  D->>Old: SIGTERM, process exits` },
        { t: "h", text: "Sticky sessions" },
        { t: "p", html: "<b>Sticky sessions</b> (session affinity) pin a client to one backend, usually with a cookie the LB sets (the ALB uses an <code>AWSALB</code> cookie, HAProxy uses <code>cookie SERVERID insert</code>) or by IP hash. Teams reach for them when the app keeps sessions or caches in local memory." },
        { t: "compare", items: [
          { title: "Sticky sessions", pros: ["Lets a stateful app run on several servers unchanged", "Warm local caches per user"], cons: ["Uneven load when a few users are heavy", "Losing a server loses its users' sessions", "New instances get little traffic after scale-out", "Draining takes as long as the longest session"], use: "A short-term crutch for legacy apps, or inherent affinity such as an open WebSocket." },
          { title: "Stateless + shared store", pros: ["Any server handles any request", "Even load, clean deploys and scale-in", "Server loss is invisible to users"], cons: ["One network hop to Redis per request (~1 ms)", "Session store must be highly available"], use: "The default for any new service." }
        ] },
        { t: "callout", kind: "interview", title: "If asked about sticky sessions", html: "Say you would avoid them and explain why: they defeat even load distribution, autoscaling and clean failover. Then name the alternative (sessions in Redis or a signed token). Acknowledge the legitimate case: a WebSocket connection is naturally sticky, so you route reconnects with consistent hashing on user or room ID instead of cookies." }
      ]
    },
    {
      id: "lb-high-availability",
      title: "Making the load balancer itself highly available",
      minutes: 11,
      blocks: [
        { t: "p", html: "Putting one load balancer in front of ten servers moves the single point of failure; it does not remove it. Redundancy for the front door happens at two scales: inside one site (a pair or fleet of LBs sharing an address) and across sites (deciding which data center or region a user reaches at all)." },
        { t: "h", text: "Active-passive pair with a floating virtual IP" },
        { t: "p", html: "The classic on-premises setup runs two LB machines (HAProxy or Nginx) with <b>keepalived</b>, which implements VRRP. Clients connect to a <b>virtual IP</b> (VIP) that is not tied to either machine. The active node owns the VIP and sends a heartbeat advertisement every second; the passive node listens. If the passive node misses about three advertisements, it claims the VIP and broadcasts a <b>gratuitous ARP</b> so switches start sending the VIP's traffic to its MAC address. Failover takes roughly 3–4 seconds with a 1-second interval, and less with sub-second intervals. Open TCP connections on the failed node are lost unless connection state is synced (for example with conntrackd)." },
        { t: "diagram", caption: "Clients only know the virtual IP; whichever node holds it serves traffic, and the standby takes it over when heartbeats stop.", code: `flowchart TD
  C(("Clients")) --> VIP["Virtual IP 203.0.113.10"]
  VIP --> LB1["LB 1, active<br/>HAProxy + keepalived"]
  VIP -.->|"on failover"| LB2["LB 2, standby<br/>HAProxy + keepalived"]
  LB1 <-->|"VRRP heartbeat every 1 s"| LB2
  LB1 --> A1["App 1"]
  LB1 --> A2["App 2"]
  LB1 --> A3["App 3"]
  LB2 -.-> A1
  LB2 -.-> A2
  LB2 -.-> A3` },
        { t: "steps", items: [
          { title: "Heartbeats stop", html: "LB 1 crashes or loses its network link. LB 2 stops receiving VRRP advertisements." },
          { title: "Standby promotes itself", html: "After about 3 missed intervals, LB 2 transitions to master and adds the VIP to its interface." },
          { title: "Network learns the new location", html: "LB 2 sends gratuitous ARP replies; switches update their tables and route VIP traffic to LB 2." },
          { title: "Clients reconnect", html: "New connections succeed immediately. Connections that were open on LB 1 reset and clients retry." }
        ] },
        { t: "callout", kind: "tip", title: "In the cloud, you usually buy this instead", html: "Public clouds generally do not let you float IPs with VRRP multicast. Managed balancers such as ALB, NLB and Google Cloud Load Balancing are already a redundant fleet spread across availability zones behind a DNS name or static IPs. Your job is to enable multiple AZs and register targets in each, not to build a keepalived pair." },
        { t: "h", text: "DNS round robin" },
        { t: "p", html: "The simplest way to spread users across several LBs or sites is to publish several A records for one name; clients pick one. It costs nothing, but it is crude. Resolvers and clients cache answers for the TTL (and some keep them longer), plain DNS has no idea whether an IP is healthy, and load ends up uneven because big resolvers hand the same answer to many users." },
        { t: "h", text: "Anycast" },
        { t: "p", html: "With <b>anycast</b>, many locations announce the <em>same</em> IP prefix over BGP, and internet routing delivers each packet to the topologically nearest one. If a site fails, it withdraws its announcement and traffic shifts to the next-nearest site as BGP converges, typically within seconds to a minute and with no DNS caching in the way. Cloudflare serves its entire network over anycast, Google Cloud's global external load balancer gives you a single anycast IP, and AWS Global Accelerator provides two static anycast IPs in front of regional endpoints. Many DNS root servers also use anycast." },
        { t: "h", text: "Global server load balancing (GSLB)" },
        { t: "p", html: "<b>GSLB</b> is health-aware, policy-driven DNS: the authoritative DNS server answers each query with the address of the region that is best for that user right now. Policies include latency-based (lowest measured RTT), geolocation (EU users to the EU, often for data residency), weighted (shift 10% to a new region) and failover (primary unless its health check fails). Route 53, Cloudflare Load Balancing, Akamai Global Traffic Management and NS1 all do this. TTLs of 30–60 seconds keep failover reasonably fast, but you should still expect a tail of clients on the old answer for several minutes." },
        { t: "table", head: ["Technique", "Scope", "Health aware", "Failover speed", "Typical use"], rows: [
          ["Active-passive VIP (VRRP)", "One site", "Yes, via heartbeats", "~3–4 s", "On-prem HAProxy or Nginx pairs"],
          ["DNS round robin", "Sites or LBs", "No", "Minutes (TTL and caching)", "Small setups, internal services"],
          ["GSLB / GeoDNS", "Regions", "Yes, via health checks", "TTL plus caching, about 1–5 min", "Multi-region routing, data residency"],
          ["Anycast", "Global PoPs", "Yes, via route withdrawal", "Seconds to about a minute", "CDNs, DNS, global front doors"]
        ] },
        { t: "diagram", caption: "GSLB picks the region; inside each region a redundant L4/L7 tier picks the server.", code: `flowchart TD
  U(("User")) --> G["GSLB DNS<br/>latency and health policy"]
  G -->|"nearest healthy region"| L1["Regional LB us-east<br/>multi-AZ"]
  G -.->|"if us-east fails"| L2["Regional LB eu-west<br/>multi-AZ"]
  L1 --> S1["App fleet us-east"]
  L2 --> S2["App fleet eu-west"]
  HC["Health checkers"] -.->|"probe every 10 s"| L1
  HC -.->|"probe every 10 s"| L2
  HC -.->|"status"| G` },
        { t: "callout", kind: "interview", title: "Give a layered answer", html: "When asked how the LB avoids being a SPOF, answer by layer: <em>Within a region, the managed LB runs across three AZs. Across regions, Route 53 latency routing with health checks sends users to the nearest healthy region, TTL 60 s. If we need faster global failover, put an anycast front door such as Global Accelerator or Cloudflare in front.</em>" }
      ]
    },
    {
      id: "autoscaling",
      title: "Autoscaling",
      minutes: 11,
      blocks: [
        { t: "p", html: "<b>Autoscaling</b> adds and removes instances automatically so capacity follows demand. It saves money at night, absorbs daily peaks without human action, and replaces failed instances. It works cleanly only for stateless tiers; scaling stateful tiers (databases, Kafka brokers) involves moving data and is usually a deliberate operation, not a reflex." },
        { t: "h", text: "What to scale on" },
        { t: "table", head: ["Metric", "Good for", "Pitfall"], rows: [
          ["CPU utilization", "CPU-bound web and API servers", "Useless for I/O-bound services that wait on downstream calls"],
          ["Requests per instance", "HTTP tiers with a known per-instance capacity from load tests (ALB <code>RequestCountPerTarget</code>)", "Assumes requests cost about the same"],
          ["Latency (p95/p99)", "Safety net when users are already feeling it", "Lagging signal; slow downstream dependencies trigger useless scale-out"],
          ["Queue depth / backlog per worker", "Async workers reading SQS or Kafka (KEDA in Kubernetes)", "Needs a target: acceptable backlog = rate x tolerable delay"],
          ["Concurrent connections", "WebSocket and streaming gateways", "Idle connections still cost memory, not CPU"]
        ] },
        { t: "h", text: "Scaling policies" },
        { t: "list", items: [
          "<b>Target tracking</b>: keep a metric at a set point, like a thermostat (AWS target tracking, the Kubernetes Horizontal Pod Autoscaler). The usual first choice.",
          "<b>Step scaling</b>: fixed actions at thresholds, for example add 10% when CPU is above 70% and 30% when above 85%.",
          "<b>Scheduled scaling</b>: set capacity by the clock for known events: business hours, a marketing email at 9:00, a sale at noon.",
          "<b>Predictive scaling</b>: the platform learns daily and weekly patterns from recent history and launches capacity before the forecast rise (AWS EC2 Auto Scaling offers this)."
        ] },
        { t: "code", lang: "text", code: `Kubernetes HPA rule (target tracking):
  desiredReplicas = ceil( currentReplicas * currentMetric / targetMetric )

Target CPU 60%, 10 pods averaging 90%:
  desired = ceil(10 * 90 / 60) = 15 pods

Next check, 15 pods averaging 58%:
  ratio 58/60 = 0.97 is inside the default 10% tolerance, so no change` },
        { t: "h", text: "Cooldowns and flapping" },
        { t: "p", html: "After a scaling action, metrics take time to reflect the new capacity: instances must boot and warm up, and metrics are aggregated over minutes. Without a pause, the scaler sees the old high CPU and adds even more, or scales in, sees CPU jump, and scales out again. This oscillation is called <b>flapping</b>. Cooldowns and stabilization windows prevent it: the Kubernetes HPA waits 300 seconds by default before acting on a lower recommendation, and AWS simple scaling has a 300-second default cooldown. The rule of thumb is <b>scale out fast, scale in slowly</b>, because under-capacity hurts users while over-capacity only costs money." },
        { t: "h", text: "Cold starts and warm pools" },
        { t: "p", html: "Autoscaling is never instant. The real delay is the sum of several steps, and it is usually minutes, not seconds:" },
        { t: "numbers", items: [
          { value: "1–3 min", label: "Detect: metric aggregation plus alarm evaluation periods" },
          { value: "30–90 s", label: "Launch and boot a new VM" },
          { value: "10 s to minutes", label: "App start, JIT warm-up, cache fill, readiness checks" },
          { value: "Seconds", label: "Start a container on a node that already has room" }
        ] },
        { t: "p", html: "To shorten the gap, keep pre-initialized capacity on hand. EC2 Auto Scaling <b>warm pools</b> hold instances that have already booted and run their setup, kept stopped (you pay only for their disks) or running, and move them into service much faster than a fresh launch. In Kubernetes, low-priority placeholder pods reserve node space so real pods can schedule instantly while the cluster autoscaler adds nodes in the background. For known events, simply schedule capacity ahead of time." },
        { t: "diagram", caption: "Autoscaling is a feedback loop, and every arrow adds delay; warm pools and schedules shortcut the slowest steps.", code: `flowchart LR
  LB["Load balancer"] --> Fleet["Instance fleet"]
  Fleet -->|"CPU and request metrics"| Mon["CloudWatch or Prometheus"]
  Mon -->|"alarm or target tracking"| ASG["Auto Scaling group"]
  ASG -->|"launch, 1 to 3 min"| New["New instances"]
  WP["Warm pool"] -->|"tens of seconds"| New
  Sch["Schedule or forecast"] -.->|"pre-scale"| ASG
  New -->|"pass readiness check"| LB` },
        { t: "callout", kind: "warn", title: "Autoscaling moves the bottleneck", html: "Going from 20 to 400 app instances, each with a 20-connection pool, means 8,000 database connections, far beyond what a PostgreSQL primary handles well. Put a pooler (PgBouncer, RDS Proxy) in between. Also check downstream rate limits, cache capacity, LB capacity and your cloud account's instance quotas before you trust the autoscaler at peak." },
        { t: "callout", kind: "interview", title: "What a strong answer includes", html: "Name the metric and target (<em>requests per instance at 70% of the load-tested max</em>), the min and max bounds, scale-out-fast and scale-in-slow behaviour, and how you cover the startup delay (warm pool or scheduled pre-scaling). Then say what downstream system breaks first when the fleet grows tenfold." }
      ]
    }
  ],
  takeaways: [
    "Scale up first when it's simple; scale out when you need more than one machine's capacity or need to survive a machine failure.",
    "Keep the app tier stateless: sessions in Redis or a signed token, files in object storage. Stateless tiers scale by adding boxes.",
    "L4 balancers see IPs and ports and decide per connection; L7 balancers parse HTTP and decide per request, enabling path routing, retries and gRPC balancing.",
    "Terminate TLS at the L7 balancer by default; re-encrypt (or use mTLS) when the internal network must be encrypted too; passthrough loses L7 routing.",
    "Round robin for uniform requests, least connections for variable or long-lived ones, power of two choices with many LB nodes, consistent hashing only when you need affinity.",
    "Use readiness checks with hysteresis for routing, never let a shared dependency fail every instance's health check, and drain connections on deploy and scale-in.",
    "Avoid sticky sessions: they cause uneven load, lost sessions on failure, and fight autoscaling.",
    "Remove the LB as a SPOF in layers: multi-AZ managed LBs or VRRP pairs inside a site, GSLB or anycast across regions.",
    "Autoscaling takes minutes: scale out fast, scale in slowly, and use warm pools or scheduled scaling for spikes you can predict.",
    "When the fleet grows, check what breaks next: DB connections, downstream rate limits, LB capacity, account quotas."
  ],
  mcqs: [
    {
      q: "Your app stores login sessions in each server's memory. After adding a second server behind a round-robin load balancer, users are randomly logged out. What is the most robust fix?",
      options: ["Give each server more RAM so sessions are not evicted early", "Move sessions to a shared Redis store keyed by session ID", "Switch the load balancer to the least connections algorithm", "Shorten the session timeout so stale sessions expire sooner"],
      answer: 1,
      explain: "Round robin sends a user's next request to whichever server is next, and that server has no record of the session. A shared store makes every server see every session; sticky sessions would also hide the symptom but bring uneven load and lost sessions on failure.",
      level: "easy"
    },
    {
      q: "Which of these requires a Layer 7 load balancer rather than a Layer 4 one?",
      options: ["Spreading TCP connections evenly across ten servers", "Passing the client's source IP address through to backends", "Balancing UDP traffic for a DNS service", "Sending <code>/api/*</code> to one pool and <code>/images/*</code> to another"],
      answer: 3,
      explain: "The URL path is inside the HTTP request, which only an L7 balancer parses. L4 balancers handle TCP and UDP distribution and can preserve source IPs (NLB does), but they never see the path.",
      level: "easy"
    },
    {
      q: "gRPC clients reach 10 backends through an L4 load balancer. You scale to 20 backends, but the new ones receive almost no traffic. What is the most likely cause?",
      options: ["An L4 balancer picks a backend once per long-lived HTTP/2 connection", "The L4 balancer caches its backend list until it is restarted", "gRPC requires sticky sessions, so clients stay on their original backends", "The new backends fail health checks because gRPC runs over UDP"],
      answer: 0,
      explain: "An L4 balancer chooses a backend once per connection, and gRPC clients reuse one connection for a long time, so existing clients stay pinned. Use an L7 proxy that balances individual HTTP/2 streams (such as Envoy) or client-side balancing. gRPC runs over TCP, not UDP.",
      level: "medium"
    },
    {
      q: "Your API mixes 10 ms lookups with report exports that take up to 60 seconds. With round robin, some servers pile up slow requests while others sit idle. Which algorithm fits best?",
      options: ["IP hash, so each user's reports always land on the same server", "Weighted round robin with higher weights on larger instances", "Least connections, so new requests avoid busy servers", "Random selection, which averages out over many requests"],
      answer: 2,
      explain: "Least connections routes each new request to the server with the fewest open connections, which steers work away from servers stuck on long exports. Weights and randomness are blind to current load, and IP hash would concentrate heavy users.",
      level: "medium"
    },
    {
      q: "What does connection draining (deregistration delay) do when an instance is removed from a load balancer?",
      options: ["Immediately closes every open connection so clients reconnect elsewhere", "Stops new requests but lets in-flight requests finish, up to a timeout", "Moves the instance's open TCP connections to another healthy instance", "Delays the health check so the instance is not marked unhealthy too early"],
      answer: 1,
      explain: "Draining stops routing new traffic but gives existing requests time to complete, so deploys and scale-in drop nothing. TCP connections cannot be migrated between ordinary servers; they finish or get closed gracefully.",
      level: "easy"
    },
    {
      q: "You balance with IP hash. One server is overloaded while others are quiet, and its traffic comes mostly from a single large corporate customer. Why?",
      options: ["IP hash weights servers by request size, and that customer sends large requests", "The corporate firewall blocks the other servers, so traffic retries onto one", "Hash collisions are common when IP addresses are close together", "The customer's staff share one public IP behind NAT, so all hash alike"],
      answer: 3,
      explain: "IP hash maps each source IP to one server. Corporate NAT and carrier-grade NAT put many users behind a single IP, so they all land on the same backend. Cookie-based affinity or a stateless design avoids this.",
      level: "medium"
    },
    {
      q: "Ten cache-backed servers are chosen with <code>hash(key) mod N</code>. You add an eleventh and the hit rate collapses. Roughly what fraction of keys would move if you used consistent hashing instead?",
      options: ["About 50%", "About 91%", "About 9%", "Exactly 0%"],
      answer: 2,
      explain: "With consistent hashing, a new node takes over only its share of the ring, about 1/11 (9%) of keys. With mod N, going from 10 to 11 remaps about 10/11 (91%) of keys, which is why every cache went cold at once.",
      level: "hard"
    },
    {
      q: "Compliance requires traffic to be encrypted all the way to the application servers, and you also need routing by URL path. Which setup meets both?",
      options: ["Terminate TLS at an L7 balancer, route by path, and re-encrypt", "Use TLS passthrough at an L4 balancer and route by URL path", "Terminate TLS at the balancer and forward plain HTTP inside the VPC", "Route by SNI hostname at an L4 balancer without decrypting"],
      answer: 0,
      explain: "Path routing needs the decrypted HTTP request, and re-encrypting (TLS bridging, often mTLS) keeps every hop encrypted. Passthrough and SNI routing never see the path, and forwarding plain HTTP breaks the compliance rule.",
      level: "medium"
    },
    {
      q: "In a keepalived (VRRP) active-passive pair, the standby node takes over the virtual IP. How does the local network learn that the VIP now belongs to a different machine?",
      options: ["The DNS record for the VIP expires and resolvers fetch the new address", "BGP withdraws the route from the failed node within a few seconds", "Clients detect the failure and retry against the standby's own IP", "The new master sends gratuitous ARP so switches map the VIP to its MAC"],
      answer: 3,
      explain: "The VIP's IP address does not change, only the machine behind it. Gratuitous ARP announces the new IP-to-MAC mapping so switches redirect traffic immediately. DNS and BGP operate at other scopes and are not involved in a same-subnet VRRP failover.",
      level: "hard"
    },
    {
      q: "Why do many global services put an anycast IP in front of their regions instead of relying only on DNS-based failover?",
      options: ["Anycast encrypts all traffic between the user and the nearest region", "BGP routes users to a nearby healthy site, with no wait for DNS caches", "Anycast pins each TCP connection to one server for its lifetime", "Anycast removes the need for any load balancers inside each region"],
      answer: 1,
      explain: "With anycast, every site announces the same IP; a failed site withdraws its route and traffic shifts as BGP converges. DNS failover depends on resolvers honouring TTLs, and many clients keep stale answers for minutes. You still need regional load balancers behind the anycast edge.",
      level: "medium"
    },
    {
      q: "Each instance's <code>/health</code> endpoint queries the shared PostgreSQL database. During a 15-second database failover, what is the most likely outcome?",
      options: ["Only the instances currently running queries are marked unhealthy", "The LB keeps routing normally because health checks run once a minute", "Every instance fails the check, so the LB may pull the whole fleet", "The LB automatically routes traffic to the database replica instead"],
      answer: 2,
      explain: "A shared dependency in the health check makes all instances fail together, turning a partial problem into a total one. Keep LB readiness checks local to the instance and handle dependency failures with timeouts and circuit breakers. Some LBs fail open (ALB, Envoy's panic threshold) precisely to limit this.",
      level: "medium"
    },
    {
      q: "A Kubernetes HPA targets 60% average CPU. There are 8 pods averaging 90% CPU. How many replicas will it request?",
      options: ["10", "12", "14", "16"],
      answer: 1,
      explain: "HPA computes ceil(current x actual / target) = ceil(8 x 90 / 60) = ceil(12) = 12. At 12 pods the same total load averages about 60% per pod.",
      level: "hard"
    },
    {
      q: "Your Auto Scaling group adds instances when CPU is above 70% and removes them when CPU is below 60%. It oscillates every few minutes. What is the best fix?",
      options: ["Widen the threshold gap and add a longer scale-in stabilization window", "Scale on memory instead of CPU, since memory usage changes more slowly", "Lower the scale-out threshold to 50% so instances are added earlier", "Disable scale-in completely and only ever scale out"],
      answer: 0,
      explain: "Removing one instance pushes the others above 70% because the thresholds are too close, and the scaler acts before metrics settle. A wider band plus a slow, stabilized scale-in stops the flapping. Disabling scale-in works but wastes money, and a 50% scale-out threshold would overlap the 60% scale-in one.",
      level: "medium"
    },
    {
      q: "A flash sale starts at 12:00. Traffic rises 20x within 60 seconds, and new instances need about 4 minutes to become ready. What best keeps the site up?",
      options: ["Lower the scale-out CPU threshold from 70% to 30% before the sale", "Shorten the cooldown so the group can scale every 30 seconds", "Pre-scale with a scheduled action before noon, plus a warm pool", "Use step scaling that adds 100% capacity when CPU passes 80%"],
      answer: 2,
      explain: "Any reactive policy first has to detect the spike and then wait about 4 minutes for instances, so users are overloaded for most of a short sale. For a known event, provision capacity ahead of time and keep a warm pool for overflow; reactive policies then fine-tune.",
      level: "hard"
    },
    {
      q: "Which is a fundamental limitation of vertical scaling?",
      options: ["It requires rewriting the service to keep no local state", "It needs a load balancer in front of the bigger server", "It cannot be used for databases that need ACID transactions", "There is a size ceiling, and the one machine is still a SPOF"],
      answer: 3,
      explain: "Scaling up needs no code changes or load balancer, and it is common for databases, but you eventually hit the biggest machine available and still have one box that can fail. Horizontal scaling removes both limits at the cost of complexity.",
      level: "easy"
    }
  ],
  design: [
    {
      id: "design-global-ecommerce-traffic",
      title: "Design the traffic layer for a global e-commerce site",
      level: "Medium",
      prompt: "An online retailer with 100 million daily active users in North America, Europe and Asia wants a new traffic layer: everything between the user's device and the backend services. It must route requests to the right service, survive the loss of a server, an availability zone or a whole region, keep carts intact during failover, and allow safe deployments. Static assets are already on a CDN. Design the DNS, load balancing and failover layers.",
      clarify: [
        "Where are users, and what share of traffic comes from each region?",
        "What are average and peak dynamic request rates, and how big is the Black Friday spike?",
        "What availability target do we need: 99.9% or 99.99%? Is a few minutes of failover acceptable?",
        "Are there data residency rules, for example EU customer data must stay in the EU?",
        "Which state must survive a regional failover: sessions, carts, in-progress checkouts?",
        "Which cloud provider or on-prem constraints apply, and do we prefer managed balancers?"
      ],
      hints: [
        "Split routing into two decisions: which region serves this user, and which server inside that region.",
        "For the regional front door, think about what an L4 balancer gives you (static IPs, raw throughput) versus an L7 proxy (TLS, path routing, retries, canaries).",
        "Size each region so the surviving regions can absorb a failed one. Then compare DNS failover timing with anycast.",
        "Carts must outlive a region: put them in a multi-region replicated store, keep app servers stateless, and make checkout idempotent so retries during failover are safe."
      ],
      solution: [
        { t: "h", text: "Requirements" },
        { t: "list", items: [
          "<b>Functional</b>: route each request by host and path to the right service (catalog, search, cart, checkout); terminate TLS; send users to a nearby region; support canary and blue/green deploys.",
          "<b>Non-functional</b>: 99.99% availability for browsing and checkout; survive loss of an instance, an AZ or a region; added latency from the traffic layer under 10 ms p99; failover of a region within a few minutes; no lost carts."
        ] },
        { t: "h", text: "Estimates" },
        { t: "code", lang: "text", code: `Requests: 100M DAU x 30 dynamic requests/day = 3B requests/day
Average:  3e9 / 86,400 s            = ~35k RPS
Daily peak (3x average)             = ~100k RPS
Black Friday (3x daily peak)        = ~300k RPS  <- design target

Regions: us-east, eu-west, ap-south. If one fails, two must carry
the global peak: 300k / 2 = 150k RPS front-door capacity per region.

L7 proxies: assume an 8-vCPU Envoy node does ~20k RPS with TLS.
Plan at 50% -> 10k RPS per node -> 150k / 10k = 15 nodes.
Survive losing 1 of 3 AZs: 15 x 3/2 = ~23 -> 24 nodes (8 per AZ).

Connections: ~10M concurrent shoppers at peak, 40% in one region
= 4M connections / 24 nodes = ~170k per node, ~40 KB each = ~7 GB RAM.
TLS handshakes: connections live ~2 min -> 10M / 120 s = ~83k/s globally.
Egress: 300k RPS x 15 KB average response = 4.5 GB/s = ~36 Gbps.` },
        { t: "h", text: "API" },
        { t: "code", lang: "http", code: `GET  /api/v1/products/{id}        -> catalog service
GET  /api/v1/search?q=red+shoes    -> search service
POST /api/v1/cart/items            -> cart service (session cookie)
POST /api/v1/checkout              -> checkout service, Idempotency-Key header
GET  /healthz/ready                -> per-instance readiness, used by the LB` },
        { t: "h", text: "Data model" },
        { t: "table", head: ["Data", "Store", "Why"], rows: [
          ["Routing rules: host/path to cluster, weights, timeouts, retries", "Git, pushed to Envoy by an xDS control plane", "Versioned, reviewable, rolled out gradually to the fleet"],
          ["Endpoint membership and health", "Service discovery (Kubernetes endpoints or Consul)", "Proxies learn healthy backends without restarts"],
          ["Sessions", "Signed cookie plus Redis per region, TTL 30 min", "App servers stay stateless; losing a session only means logging in again"],
          ["Carts", "DynamoDB global tables, key <code>cart#userId</code>", "Multi-region replication so a regional failover keeps carts"],
          ["TLS certificates", "AWS Certificate Manager or Vault with auto-renewal", "No manual renewals across dozens of proxies"]
        ] },
        { t: "h", text: "High-level design" },
        { t: "diagram", caption: "DNS picks a healthy nearby region; inside it an L4 tier feeds an L7 proxy fleet that routes by path to stateless services.", code: `flowchart TD
  U(("Shopper")) --> DNS["Route 53<br/>latency and health routing"]
  U -->|"static assets"| CDN["CDN"]
  subgraph R1["Region us-east"]
    NLB1["NLB, L4, 3 AZs"] --> E1["Envoy L7 fleet<br/>24 nodes"]
    E1 -->|"/api/v1/products"| Cat["Catalog"]
    E1 -->|"/api/v1/cart"| Cart["Cart"]
    E1 -->|"/api/v1/checkout"| Chk["Checkout"]
    Cart --> DDB1[("DynamoDB<br/>global table")]
  end
  subgraph R2["Region eu-west"]
    NLB2["NLB, L4, 3 AZs"] --> E2["Envoy L7 fleet"]
    E2 --> Svc2["Same services"]
    Svc2 --> DDB2[("DynamoDB<br/>replica")]
  end
  DNS --> NLB1
  DNS --> NLB2
  DDB1 -.->|"async replication"| DDB2` },
        { t: "p", html: "<b>Request path</b>: the browser resolves <code>shop.example.com</code>; Route 53 returns the NLB address of the lowest-latency healthy region. The NLB spreads TCP connections across Envoy nodes in all three AZs and preserves the client IP. Envoy terminates TLS, applies per-route timeouts and retries, and forwards each request by path to a service, re-encrypting with mTLS. Services are stateless: sessions come from Redis, carts from DynamoDB. A cart write lands in the local DynamoDB replica and replicates to the other regions within about a second." },
        { t: "h", text: "Deep dives" },
        { t: "p", html: "<b>1. Regional failover.</b> Route 53 health checks probe each region's front door every 10 seconds from several locations; when a region fails, it drops out of latency answers. With a 60-second TTL, most clients move within a couple of minutes, but some resolvers and apps cache longer. If that tail is unacceptable, put AWS Global Accelerator (anycast static IPs) in front of the NLBs: failover then follows edge routing and health checks, not DNS caches. Either way, each region holds 150k RPS of proxy capacity and its app tiers autoscale with a raised minimum during peak season, because you cannot count on scaling a region from cold during a failover." },
        { t: "p", html: "<b>2. Why NLB plus Envoy, and when not to.</b> The NLB gives static IPs per AZ, absorbs connection floods and costs little per request. Envoy adds what the NLB cannot: TLS termination with central certificate management, path routing, retries on another host, outlier detection that ejects a server returning 5xx, and weighted canaries. For a smaller company an ALB alone is the right answer; the two-tier setup pays off when you need custom L7 logic, more control over load balancing (power of two choices, consistent hashing for a cache tier) or very high connection counts." },
        { t: "p", html: "<b>3. State and safe retries during failover.</b> Because carts live in DynamoDB global tables, a user rerouted to eu-west sees the cart they built in us-east, give or take the last second of writes. Global tables resolve concurrent writes with last-writer-wins, which is acceptable for carts. Checkout is different: the client sends an <code>Idempotency-Key</code>, and the checkout service records it before charging, so a request retried in another region cannot charge twice (Chapter 11). Inventory and payments keep a single home region per order to avoid conflicting writes." },
        { t: "p", html: "<b>4. Deployments.</b> Envoy shifts traffic to a new version by weight (1%, 10%, 50%, 100%) while dashboards compare error rates; rollback is a config push. Instances leaving the pool drain for 30 seconds, and Kubernetes pods use a short <code>preStop</code> sleep so proxies stop routing before shutdown starts." },
        { t: "h", text: "Trade-offs and bottlenecks" },
        { t: "table", head: ["Decision", "Choice", "Alternative", "Why"], rows: [
          ["Global routing", "Route 53 latency + health checks", "Anycast (Global Accelerator, Cloudflare)", "DNS is simpler and cheaper; anycast fails over faster and avoids cache tails"],
          ["Regional front door", "NLB + Envoy fleet", "ALB only", "More control and features vs less to operate"],
          ["TLS", "Terminate at Envoy, mTLS inside", "Terminate at edge, plaintext inside", "Encryption on every hop at the cost of CPU and internal PKI"],
          ["Cart store", "DynamoDB global tables (LWW)", "Single-region DB", "Survives regional loss; accepts rare lost concurrent cart edits"],
          ["Capacity", "Each region sized for global peak / 2", "Size for own peak and degrade on failover", "Pays for idle headroom to keep 99.99% during a region loss"]
        ] },
        { t: "list", items: [
          "Bottleneck to watch: a gray failure where one AZ is slow but passes health checks. Envoy outlier detection and latency-aware balancing help; so does zone-aware routing.",
          "The control plane that pushes Envoy config must itself be redundant, and a bad config push is a global outage risk: roll config out region by region."
        ] }
      ],
      followups: [
        "How would you protect this layer from a 1 Tbps DDoS attack?",
        "The payment provider only has an endpoint in the US. How does checkout work for EU users when us-east is down?",
        "One AZ starts returning slow responses but still passes health checks. How do you detect it and shift traffic away?",
        "How would you upgrade the Envoy fleet itself without dropping connections?",
        "EU regulators require EU customer data to stay in the EU. What changes in routing and failover?"
      ]
    },
    {
      id: "design-flash-sale-autoscaling",
      title: "Design an autoscaling web tier for a flash sale",
      level: "Medium",
      prompt: "A retailer runs a 10-minute flash sale every Friday at 12:00. Normal load on the web/API tier is 5k requests per second; during the sale it reaches 250k RPS, and almost all of that arrives within the first 60 seconds. Today the site falls over every week. Design the web tier, its autoscaling and its protections so the site stays up and costs stay reasonable the rest of the week.",
      clarify: [
        "Is the spike timing known in advance, and how accurate are traffic forecasts from past sales?",
        "Which requests hit our servers after the CDN: page views, stock checks, reserve and checkout?",
        "How long does a new instance take to launch, boot and pass readiness today?",
        "What is one instance's capacity from load tests, and at what latency?",
        "Is it acceptable to make some users wait in a queue rather than serve everyone instantly?",
        "Which downstream systems are shared: database, cache, payment provider limits?"
      ],
      hints: [
        "Work out how long reactive autoscaling takes to add capacity and compare it with a 60-second ramp.",
        "The start time is known. Which scaling policy uses that fact, and how do you cover a forecast that is too low?",
        "Even with enough servers, you need a way to admit only as many users as the system can serve. Think waiting room and load shedding.",
        "Multiply instances by connection pool size and check what happens to the database, the load balancer and your account quotas."
      ],
      solution: [
        { t: "h", text: "Requirements" },
        { t: "list", items: [
          "<b>Functional</b>: serve the sale page and stock level, let users reserve an item and check out, show a waiting-room position when demand exceeds capacity.",
          "<b>Non-functional</b>: survive 250k RPS reached within 60 s; p99 under 300 ms for admitted users; no crash or error storm when demand exceeds capacity (degrade by queueing); pay for peak capacity only around the sale window."
        ] },
        { t: "h", text: "Estimates" },
        { t: "code", lang: "text", code: `Load test: one c6i.2xlarge (8 vCPU) serves 500 RPS at ~60% CPU, p99 120 ms
Peak:      250k RPS / 500   = 500 instances, +20% headroom = 600
Baseline:  5k RPS / 500     = 10 instances -> min 12 (4 per AZ x 3 AZs)

Reactive scale-out timeline for a spike at 12:00:00
  detect (1-min metrics, 2 datapoints)     ~2-3 min
  launch + boot + warm-up + readiness      ~3 min
  first new capacity arrives               ~12:05, halfway through the sale

Cost (on-demand ~$0.34/h per instance)
  600 instances x 1.5 h window   = ~$306 per sale
  600 instances x 24 h           = ~$4,900 per day if left running

Database: 600 instances x 10-connection pool = 6,000 connections
vCPU quota: 600 x 8 = 4,800 vCPUs -> request a quota increase in advance` },
        { t: "h", text: "API" },
        { t: "code", lang: "http", code: `GET  /api/sale/{saleId}              -> sale info and stock level, cached 1 s
GET  /api/queue/{saleId}/status       -> waiting-room position, admission token when admitted
POST /api/sale/{saleId}/reserve       -> hold one unit for 10 min, needs admission token
POST /api/checkout                    -> pay for a held unit, Idempotency-Key header
GET  /healthz/ready                   -> instance readiness for the ALB` },
        { t: "h", text: "Data model" },
        { t: "p", html: "The interesting data here is the scaling configuration; sale data is small. Stock lives in Redis as an atomic counter (<code>DECR stock:{saleId}</code>), and reservations and orders live in PostgreSQL. Seat-hold and inventory details are covered in Chapter 17." },
        { t: "table", head: ["Policy", "Setting", "Purpose"], rows: [
          ["Scheduled action", "11:30 set min = desired = 600; 12:45 set min back to 12", "Capacity is already warm when the spike lands"],
          ["Warm pool", "150 pre-initialized stopped instances", "Overflow if demand beats the forecast, joins in well under a minute"],
          ["Target tracking", "~400 RPS per instance (ALB <code>RequestCountPerTarget</code> of 24,000 per minute)", "Fine-tunes capacity during and after the sale"],
          ["Step scaling safety net", "p99 above 400 ms for 1 min: add 20%", "Catches a bad forecast or a slow code path"],
          ["Scale-in", "Blocked by min until 12:45, then at most 10% per 5 min, 60 s draining", "Never remove servers mid-sale or drop in-flight checkouts"]
        ] },
        { t: "h", text: "High-level design" },
        { t: "diagram", caption: "Capacity is scheduled ahead of noon, the warm pool covers forecast errors, and the waiting room admits only what the tier can serve.", code: `flowchart LR
  U(("Shoppers")) --> CDN["CDN<br/>static and sale page"]
  CDN --> WR["Waiting room<br/>admission tokens"]
  WR --> ALB["ALB<br/>capacity reserved"]
  ALB --> ASG["Web tier ASG<br/>600 instances at noon"]
  WP["Warm pool<br/>150 instances"] -.->|"joins in under a minute"| ASG
  Sch["Scheduled action 11:30"] -.-> ASG
  ASG -.->|"metrics"| CW["CloudWatch alarms"]
  CW -.->|"scale out"| ASG
  ASG --> Redis[("Redis<br/>stock counters")]
  ASG --> PgB["PgBouncer"]
  PgB --> DB[("PostgreSQL<br/>orders")]` },
        { t: "p", html: "<b>Before the sale</b>: at 11:30 a scheduled action raises the group to 600 instances; they boot, warm up and pass readiness checks by 11:40. The load balancer's capacity is reserved or pre-warmed, because managed LBs scale over minutes too. <b>During the sale</b>: the CDN serves the sale page and assets; API calls go through the waiting room, which issues signed admission tokens at the rate the tier can serve. Admitted users reserve against the Redis counter and check out through PostgreSQL behind PgBouncer. <b>After the sale</b>: at 12:45 the minimum drops and the group scales in gradually with draining." },
        { t: "h", text: "Deep dives" },
        { t: "p", html: "<b>1. Why reactive scaling alone fails.</b> The ramp takes 60 seconds; detection plus launch takes about 5 minutes. For those 5 minutes the existing 12 instances (about 6k RPS of capacity) face about 40 times their capacity. Requests queue, latency climbs past client timeouts, clients retry, and the retries add even more load, so the fleet can fail health checks and get replaced, making things worse. A known start time is the strongest signal you have, so use scheduled scaling, and use predictive scaling for the general weekly pattern. Reactive target tracking stays on for fine adjustments." },
        { t: "p", html: "<b>2. Admission control and load shedding.</b> Capacity planning can be wrong, so the system must refuse gracefully instead of falling over. The waiting room holds users in a queue (served from the CDN or a lightweight service) and admits, say, 2,000 new users per second, adjusted using the tier's live latency. Each instance also enforces a concurrency limit and returns <code>503</code> with <code>Retry-After</code> once it is reached, and clients retry with jittered backoff. Checkout requests get priority over page refreshes, because a completed sale is worth more than a stock-level poll." },
        { t: "p", html: "<b>3. The bottlenecks that move.</b> Scaling the web tier 50x stresses everything behind it. 6,000 database connections would overwhelm PostgreSQL, so PgBouncer in transaction mode multiplexes them onto about 200 server connections, and reads are served from Redis. A single Redis key for stock is handled by one shard (roughly 100k ops/s); split stock into 10 sub-counters on different shards if needed. Ask the payment provider for a higher rate limit, and raise the EC2 vCPU quota weeks in advance, since 4,800 vCPUs is above most default quotas." },
        { t: "h", text: "Trade-offs and bottlenecks" },
        { t: "list", items: [
          "<b>Scheduled vs always-on capacity</b>: scheduling costs about $300 per sale against about $4,900 per day for permanent peak capacity, but relies on the schedule being right; the warm pool and step scaling cover forecast misses.",
          "<b>Warm pool size</b>: stopped instances cost only their disks, but a bigger pool means more launches that can fail at the worst time; 25% of peak is a reasonable buffer.",
          "<b>Waiting room vs serving everyone</b>: queueing adds friction, but a controlled queue beats a site returning errors to everyone.",
          "<b>Instance size</b>: fewer large instances mean fewer launches and connections; more small ones mean finer scaling steps and smaller blast radius per failure.",
          "<b>Remaining risk</b>: a hot code path that only shows at peak (for example a slow query). Rehearse with a load test at full scale a week before."
        ] }
      ],
      followups: [
        "The marketing team moves the sale time with one hour's notice. What breaks, and how do you make the system robust to that?",
        "How would you run this on Kubernetes instead of EC2 Auto Scaling groups?",
        "Bots send 70% of the traffic. How do you keep them from taking the stock?",
        "How do you prove before Friday that the system can take 250k RPS?",
        "The sale goes global, starting at noon local time in five time zones. How does the scaling plan change?"
      ]
    }
  ]
};
