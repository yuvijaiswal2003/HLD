module.exports = {
  id: "microservices-api",
  num: 11,
  part: 4,
  title: "Microservices, API Design and Rate Limiting",
  tagline: "Split systems along real boundaries, design APIs that age well, and say no politely.",
  level: "Intermediate",
  lessons: [
    {
      id: "monolith-vs-microservices",
      title: "Monoliths, modular monoliths and microservices",
      minutes: 11,
      blocks: [
        { t: "p", html: "A <b>monolith</b> is one deployable unit: one codebase, one build, one process type, usually one database. A <b>microservice architecture</b> splits the system into independently deployable services, each owning one business capability and its own data, talking over the network. Between them sits the <b>modular monolith</b>: one deployable, but with strictly enforced internal module boundaries, so each module could later become a service. Interviewers do not want to hear \"microservices are modern, so microservices\". They want the honest trade-off." },
        { t: "diagram", caption: "In a monolith a function call crosses modules; in microservices the same interaction is a network call to a service that owns its own database.", code: `flowchart LR
  subgraph Mono["Monolith"]
    Web["Web layer"] --> Ord["Orders module"]
    Ord --> Pay["Payments module"]
    Ord --> DB1[("One shared database")]
    Pay --> DB1
  end
  subgraph Micro["Microservices"]
    GW["API gateway"] --> OS["Order service"]
    OS -->|"HTTP or gRPC"| PS["Payment service"]
    OS --> ODB[("Orders DB")]
    PS --> PDB[("Payments DB")]
  end` },
        { t: "compare", items: [
          { title: "Monolith", pros: ["Simplest to build, test, debug and deploy", "In-process calls: nanoseconds, no partial failure", "ACID transactions across the whole domain", "Refactoring across modules is a normal code change"], cons: ["One team's bug or slow query can take down everything", "Deploys get slow and risky as the codebase grows", "Scales only as a whole: the image resizer and the login page get the same hardware", "Boundaries erode into a big ball of mud without discipline"], use: "New products, small teams (under ~20 to 30 engineers), and any domain you do not yet understand well." },
          { title: "Modular monolith", pros: ["Clear module ownership and enforced interfaces", "Still one deploy and one transaction boundary", "Cheap path to extract a module later"], cons: ["Needs tooling to stop modules reaching into each other's tables", "Still scales and fails as one unit"], use: "The default for most growing companies; a good interview answer when the team is medium sized." },
          { title: "Microservices", pros: ["Teams deploy independently, many times a day", "Scale and choose technology per service", "Fault isolation when combined with timeouts and circuit breakers"], cons: ["Every call can fail, time out or be slow: distributed systems problems everywhere", "No cross-service transactions: sagas and eventual consistency", "Heavy platform cost: discovery, tracing, CI/CD per service, on-call", "Debugging a request means following it across 10 services"], use: "Large organizations where team autonomy and deploy velocity are the bottleneck, with a mature platform team." }
        ] },
        { t: "h", text: "Decomposing by business capability and bounded context" },
        { t: "p", html: "Split by what the business does, not by technical layer. A \"database service\" and a \"UI service\" are layers; every feature change touches both, so you gain nothing. A <b>business capability</b> is something the business does that produces value: catalog, ordering, payments, shipping. A <b>bounded context</b> (from Domain-Driven Design) is the boundary within which a term has one precise meaning. \"Order\" means a cart with prices in Ordering, a parcel with a weight in Shipping, and a ledger entry in Accounting. Each context gets its own model, and services map to contexts." },
        { t: "list", items: [
          "<b>High cohesion:</b> things that change together live together. If two services must always be deployed together, they are one service.",
          "<b>Loose coupling:</b> a service exposes a narrow API or events, never its tables.",
          "<b>Conway's law:</b> systems mirror the communication structure of the teams that build them. Align one service, or a few, with one team that owns it end to end.",
          "<b>Avoid chatty boundaries:</b> if rendering one page requires 40 synchronous calls between two services, the boundary is in the wrong place."
        ] },
        { t: "h", text: "Database per service" },
        { t: "p", html: "Each service owns its data, and other services can reach it only through its API or the events it publishes. Shared databases look convenient but couple teams at the schema level: one team's migration breaks another team's queries, and nobody can change a column safely. Owning data also lets each service choose the right store: PostgreSQL for orders, Redis for sessions, Elasticsearch for catalog search." },
        { t: "table", head: ["Need", "Monolith answer", "Microservices answer"], rows: [
          ["Atomic update across two domains", "One ACID transaction", "Saga with compensating actions (Chapter 8)"],
          ["Publish a change reliably", "Not needed", "Transactional outbox plus CDC to Kafka (Chapter 9)"],
          ["Query joining orders and users", "SQL JOIN", "API composition, or a read model built from events (CQRS)"],
          ["Keep a local copy of another service's data", "Not needed", "Event-carried state transfer: subscribe and cache what you need"]
        ] },
        { t: "callout", kind: "warn", title: "The distributed monolith", html: "The worst outcome is services that must be deployed together, share a database, or call each other synchronously in long chains. You get all the network failure modes of microservices with none of the independence. A chain of 5 synchronous services each at 99.9% availability is at best about 99.5% available, and its latency is the sum of all five." },
        { t: "callout", kind: "example", title: "Both directions are real", html: "Shopify runs one of the largest Ruby on Rails codebases as a modular monolith with enforced component boundaries. In 2023 Amazon's Prime Video team wrote that moving a video-quality monitoring tool from distributed serverless components to a single process cut its infrastructure cost by about 90%. Netflix, at the other extreme, runs hundreds of microservices with a large platform organization behind them." },
        { t: "callout", kind: "interview", title: "How to frame it", html: "\"I would start as a modular monolith and extract services where there is a concrete reason: a component with very different scaling needs, a team that is blocked on shared deploys, or a part with a different reliability requirement such as payments.\" Then name the boundary you would extract first and why. To migrate a live system, use the <b>strangler fig</b> pattern: put a routing layer in front, move one capability at a time behind it, and delete the old code path once traffic has moved." }
      ]
    },
    {
      id: "service-discovery-gateway-mesh",
      title: "Service discovery, API gateways and service mesh",
      minutes: 11,
      blocks: [
        { t: "p", html: "With dozens of services running on hundreds of autoscaled, frequently replaced instances, IP addresses change all the time. <b>Service discovery</b> is how a caller finds a healthy instance of <code>payment-service</code> right now. It needs a <b>service registry</b>: a database of live instances, kept current by registration plus health checks." },
        { t: "compare", items: [
          { title: "Client-side discovery", pros: ["No extra network hop", "Client can use smart balancing, such as least outstanding requests or zone-aware routing"], cons: ["Discovery and balancing logic in every client, in every language", "Clients must be upgraded to change behavior"], use: "Netflix Eureka with a client library; gRPC clients with built-in load balancing; anything with a sidecar proxy doing it for the app." },
          { title: "Server-side discovery", pros: ["Clients stay simple: call one stable name", "Language agnostic, centrally managed"], cons: ["Extra hop through the load balancer", "The load balancer tier must itself scale and be highly available"], use: "AWS ALB or NLB in front of a target group; Kubernetes Services, where kube-proxy routes a stable virtual IP to pods." }
        ] },
        { t: "list", items: [
          "<b>Registries:</b> Consul (health checks, DNS and HTTP interface, key-value store), Netflix Eureka (AP-leaning, favors availability over strict consistency), and etcd or ZooKeeper (strongly consistent, used underneath Kubernetes and older systems).",
          "<b>Registration:</b> either the instance registers itself and heartbeats (self-registration), or the platform registers it (Kubernetes adds a pod to the Service's endpoints once its readiness probe passes).",
          "<b>DNS-based discovery</b> is the simplest interface (<code>payments.prod.svc.cluster.local</code>), but clients and resolvers cache answers according to TTL and some runtimes cache longer than asked, so dead instances can receive traffic for a while. Use short TTLs and client retries on connection failure."
        ] },
        { t: "h", text: "API gateway" },
        { t: "p", html: "An <b>API gateway</b> is the single entry point between external clients and internal services. It is a specialized reverse proxy (Chapter 2) that handles cross-cutting concerns once instead of in every service: TLS termination, authentication (validating JWTs or API keys), rate limiting, request routing by path or header, request and response transformation, caching, request IDs for tracing, and canary traffic splits. Common choices are Kong, AWS API Gateway, Apigee, and Envoy-based gateways." },
        { t: "p", html: "A <b>backend for frontend</b> (BFF) is a gateway layer built for one client type. The iOS app's home screen needs a compact payload aggregated from 6 services; the web app wants richer data; a partner API needs stable, versioned resources. Instead of one gateway full of client-specific branches, each client team owns its BFF, which fans out to services in parallel and shapes the response for its client. GraphQL servers are often used as a BFF." },
        { t: "diagram", caption: "Cross-cutting concerns live at the edge gateway, client-specific aggregation lives in per-client BFFs, and services stay unaware of client types.", code: `flowchart LR
  Mob(("Mobile app")) --> GW["Edge API gateway<br/>TLS, auth, rate limits"]
  Webc(("Web app")) --> GW
  Part(("Partner")) --> GW
  GW --> MB["Mobile BFF"]
  GW --> WB["Web BFF"]
  GW --> PubAPI["Public API v1"]
  MB --> US["User service"]
  MB --> CS["Catalog service"]
  WB --> CS
  WB --> OS["Order service"]
  PubAPI --> OS` },
        { t: "callout", kind: "warn", title: "Keep business logic out of the gateway", html: "A gateway that starts computing discounts or validating orders becomes a new monolith that every team must change and deploy. Gateways route and enforce policy; BFFs aggregate and shape; services own business rules." },
        { t: "h", text: "Service mesh and sidecars" },
        { t: "p", html: "A gateway handles <em>north-south</em> traffic (clients into the system). A <b>service mesh</b> handles <em>east-west</em> traffic (service to service). Each service instance gets a <b>sidecar</b> proxy, usually Envoy, that intercepts all its inbound and outbound connections. The <b>data plane</b> (all the sidecars) does discovery, load balancing, retries, timeouts, circuit breaking, mutual TLS and telemetry. The <b>control plane</b> (Istio's istiod, Linkerd's control plane) pushes routing rules, certificates and policies to every sidecar." },
        { t: "diagram", caption: "Services talk to localhost; the sidecars do discovery, mTLS, retries and metrics, configured centrally by the control plane.", code: `flowchart LR
  CP["Control plane<br/>Istio istiod"] -.->|"routes, certs, policy"| E1["Envoy sidecar"]
  CP -.-> E2["Envoy sidecar"]
  subgraph PodA["Pod: order service"]
    A["Order app"] --> E1
  end
  subgraph PodB["Pod: payment service"]
    E2 --> B["Payment app"]
  end
  E1 ==>|"mTLS, retries, timeouts"| E2
  E1 -.->|"metrics, traces"| Obs["Telemetry backend"]` },
        { t: "compare", items: [
          { title: "Libraries in each service", pros: ["No extra hop or proxy process", "Full control in application code"], cons: ["Reimplemented per language, upgraded per service", "Inconsistent behavior across teams"], use: "Few services in one or two languages." },
          { title: "Service mesh", pros: ["Uniform mTLS, retries, timeouts and telemetry with no app code changes", "Traffic shifting for canaries and fault injection centrally"], cons: ["Each hop adds a little latency, typically around a millisecond or less", "Memory and CPU for a proxy per pod; a complex control plane to operate"], use: "Many services, many languages, and a zero-trust requirement for encrypted, authenticated service-to-service calls." }
        ] },
        { t: "callout", kind: "interview", title: "Say where each concern lives", html: "Interviewers like a crisp split: \"Auth, rate limiting and routing at the edge gateway; aggregation per client in a BFF; retries, timeouts, mTLS and discovery between services in the mesh or a shared client library.\" It shows you know these are layers, not competing products." }
      ]
    },
    {
      id: "api-design",
      title: "API design best practices",
      minutes: 13,
      blocks: [
        { t: "p", html: "An API is a contract that outlives the code behind it. Mobile apps stay installed for years, partners integrate once and never touch it again. Good API design is mostly about making the common case obvious, retries safe, large results cheap, and change possible without breaking anyone. REST over HTTP is the default for public APIs, so the conventions below use it; Chapter 2 covers REST vs GraphQL vs gRPC." },
        { t: "h", text: "Resource naming" },
        { t: "table", head: ["Do", "Avoid", "Why"], rows: [
          ["<code>GET /users/42/orders</code>", "<code>GET /getOrdersForUser?id=42</code>", "Nouns for resources, HTTP methods for verbs"],
          ["<code>POST /orders</code> to create", "<code>POST /orders/create</code>", "The method already says create"],
          ["<code>GET /orders?status=shipped</code>", "<code>GET /orders/shipped</code>", "Filters are query parameters, not path segments"],
          ["<code>POST /orders/42/cancel</code> for a real action", "<code>PATCH /orders/42 {status: cancelled}</code> when cancel has side effects", "State transitions with business rules deserve an explicit action resource"],
          ["Plural collections, kebab or snake case, consistent everywhere", "Mixing <code>/user</code>, <code>/Orders</code>, <code>/line_items</code>", "Predictability is the main usability feature"]
        ] },
        { t: "h", text: "Idempotency keys" },
        { t: "p", html: "<code>GET</code>, <code>PUT</code> and <code>DELETE</code> are idempotent by definition; <code>POST</code> is not. If a client sends <code>POST /payments</code>, the connection drops, and it retries, did the customer pay once or twice? The fix: the client generates a unique <code>Idempotency-Key</code> (a UUID) per logical operation and sends it on every retry. The server stores the key with the result and, on a repeat, returns the stored response instead of executing again." },
        { t: "steps", items: [
          { title: "Atomically claim the key", html: "<code>INSERT INTO idempotency (key, user_id, request_hash, status) VALUES (..., 'in_progress')</code> with a unique constraint on <code>(user_id, key)</code>. If the insert conflicts, go to step 4." },
          { title: "Do the work", html: "Charge the card, create the order. Ideally write the business row and the idempotency result in the same database transaction." },
          { title: "Store the response", html: "Save the status code and body against the key and mark it complete. Keep keys for 24 hours or longer, longer than any client's retry window." },
          { title: "Handle a repeat", html: "Complete: return the stored response. Still in progress: return <code>409 Conflict</code> so the client retries later. Same key with a different request body: return <code>422</code>, because the client reused a key by mistake." }
        ] },
        { t: "callout", kind: "example", title: "Stripe popularized the header", html: "Stripe's API accepts an <code>Idempotency-Key</code> header on POST requests and returns the saved result for repeated keys, so clients can retry payment calls safely after timeouts. Many payment and fintech APIs copy this design." },
        { t: "h", text: "Pagination: offset vs cursor" },
        { t: "p", html: "<b>Offset pagination</b> (<code>?limit=20&offset=10000</code>) is easy and allows jumping to page 500, but the database still reads and discards the first 10,000 rows, so deep pages get slow. It also skips or repeats items when rows are inserted or deleted between page requests. <b>Cursor (keyset) pagination</b> remembers where the last page ended and asks for rows after that position, which an index can seek to directly." },
        { t: "code", lang: "sql", code: `-- Offset: scans and throws away 10,000 rows
SELECT id, created_at, title FROM posts
ORDER BY created_at DESC, id DESC
LIMIT 20 OFFSET 10000;

-- Keyset: seeks straight to the position using an index on (created_at, id)
SELECT id, created_at, title FROM posts
WHERE (created_at, id) < ('2026-10-21 09:14:00', 98231)
ORDER BY created_at DESC, id DESC
LIMIT 20;
-- Return the last row's (created_at, id) base64-encoded as an opaque next_cursor` },
        { t: "compare", items: [
          { title: "Offset", pros: ["Trivial to implement", "Jump to any page; show total pages"], cons: ["Cost grows linearly with the offset", "Duplicates or gaps when data changes between requests"], use: "Small, stable admin tables and search results limited to the first few pages." },
          { title: "Cursor / keyset", pros: ["Constant cost per page with the right index", "Stable under concurrent inserts", "Natural fit for infinite scroll and feeds"], cons: ["No random page jumps", "Needs a unique, sortable tie-breaker such as id", "Cursor must be opaque so you can change it later"], use: "Feeds, timelines, message history, any large or fast-changing collection, and public APIs." }
        ] },
        { t: "h", text: "Versioning and evolution" },
        { t: "list", items: [
          "<b>Additive changes are free:</b> a new optional field or a new endpoint breaks nobody, provided clients ignore unknown fields. Removing or renaming a field, changing a type, or tightening validation is breaking.",
          "<b>URL versioning</b> (<code>/v1/orders</code>) is explicit, cache-friendly and easy to route at the gateway; it is the most common choice. <b>Header versioning</b> (<code>Accept: application/vnd.acme.v2+json</code>) or a date header (Stripe pins each account to an API version by date) keeps URLs stable but is less visible.",
          "Bump the major version only for breaking changes, run versions side by side, announce deprecation with a <code>Sunset</code> header and a date, and watch per-version traffic before turning the old one off."
        ] },
        { t: "h", text: "Errors, batching and webhooks" },
        { t: "code", lang: "json", code: `{
  "type": "https://api.example.com/errors/insufficient-funds",
  "title": "Insufficient funds",
  "status": 402,
  "detail": "Balance is 30.00 USD, payment requires 45.00 USD.",
  "code": "insufficient_funds",
  "request_id": "req_7Hc2kQ",
  "errors": [ { "field": "amount", "message": "exceeds available balance" } ]
}` },
        { t: "list", items: [
          "<b>Errors:</b> use correct status codes (400 validation, 401 unauthenticated, 403 forbidden, 404, 409 conflict, 422, 429 rate limited, 5xx server), plus one consistent JSON body. RFC 9457 (Problem Details) defines the shape above. Include a machine-readable <code>code</code> clients can branch on and a <code>request_id</code> for support. Never leak stack traces.",
          "<b>Batching:</b> <code>POST /orders:batchGet</code> with 100 ids, or a bulk create endpoint, saves round trips for mobile clients on high-latency networks. Define partial failure explicitly: return a result per item rather than failing the whole batch for one bad item, and cap batch size.",
          "<b>Webhooks:</b> instead of partners polling, you POST events to their URL. Sign each payload with HMAC-SHA256 over the body and a timestamp so receivers can verify it and reject replays. Deliver at least once with exponential backoff for up to a day or more, include an event id so receivers can deduplicate, and offer a list-events endpoint to backfill missed deliveries. Receivers should respond 2xx quickly and process asynchronously."
        ] },
        { t: "callout", kind: "interview", title: "Small details that score points", html: "When you write the API section in any design, add: an <code>Idempotency-Key</code> on every create that moves money or sends messages, cursor pagination on every list, and <code>/v1</code> in the path. Saying \"the next page is an opaque cursor encoding (created_at, id)\" takes five seconds and signals real API experience." }
      ]
    },
    {
      id: "rate-limiting",
      title: "Rate limiting algorithms",
      minutes: 14,
      blocks: [
        { t: "p", html: "A <b>rate limiter</b> caps how many requests a client may make in a period and rejects the rest. It protects services from abuse and accidental floods (a buggy client retrying in a tight loop), stops one tenant from starving others (the <em>noisy neighbor</em> problem), controls cost when each call costs money (SMS, third-party APIs, GPU inference), and enforces paid tiers. Every limiter needs two decisions: the <b>key</b> (user id, API key, IP, tenant, endpoint, or a combination) and the <b>algorithm</b>." },
        { t: "h", text: "Token bucket" },
        { t: "p", html: "A bucket holds up to <code>capacity</code> tokens and refills at <code>rate</code> tokens per second. Each request takes one token (or <code>cost</code> tokens for expensive calls); with no tokens left, the request is rejected. The two parameters map directly to product language: <em>capacity</em> is the allowed burst, <em>rate</em> is the sustained limit. With capacity 10 and rate 1/s, an idle client can fire 10 requests at once, then 1 per second. You do not need a timer to add tokens: store <code>tokens</code> and the <code>last</code> timestamp, and refill lazily on each request from the elapsed time. That is 2 numbers per key." },
        { t: "code", lang: "python", code: `import time

class TokenBucket:
    def __init__(self, capacity, refill_per_sec):
        self.capacity = capacity          # max burst
        self.rate = refill_per_sec        # sustained requests per second
        self.tokens = float(capacity)     # start full
        self.last = time.monotonic()

    def allow(self, cost=1):
        now = time.monotonic()
        elapsed = now - self.last
        # Lazy refill: add what accrued since the last call, cap at capacity
        self.tokens = min(self.capacity, self.tokens + elapsed * self.rate)
        self.last = now
        if self.tokens >= cost:
            self.tokens -= cost
            return True
        return False

    def retry_after(self, cost=1):
        # Seconds until enough tokens exist, for the Retry-After header
        return max(0.0, (cost - self.tokens) / self.rate)` },
        { t: "h", text: "Leaky bucket, fixed window and sliding window log" },
        { t: "list", items: [
          "<b>Leaky bucket:</b> requests enter a FIFO queue of fixed size and are drained at a constant rate; if the queue is full, new requests are dropped. Output is perfectly smooth, which suits a downstream that needs a steady rate, but bursts wait in the queue and add latency. Nginx's <code>limit_req</code> uses the leaky bucket method, and Shopify documents a leaky bucket for its REST Admin API. Implemented as a meter rather than a queue (the GCRA algorithm), it behaves like a token bucket.",
          "<b>Fixed window counter:</b> one counter per key per window, e.g. <code>INCR rl:user42:10:01</code> with a 60 s expiry; reject when it exceeds the limit. Cheapest possible, but bursty at window edges: with a 100/min limit, a client can send 100 requests at 10:00:59 and 100 more at 10:01:00, so 200 in about one second, double the intended rate.",
          "<b>Sliding window log:</b> store a timestamp per accepted request (a Redis sorted set), drop entries older than <code>now - window</code>, and allow if fewer than <code>limit</code> remain. Exact, with no edge burst, but memory grows with the limit: a 10,000 per hour limit can hold 10,000 entries for each key."
        ] },
        { t: "h", text: "Sliding window counter" },
        { t: "p", html: "This hybrid keeps only two fixed-window counters, the current and the previous, and estimates the count over the true sliding window by weighting the previous window by how much of it still overlaps. Example: limit 100 per minute, previous minute had 80 requests, current minute has 30 so far, and we are 15 seconds (25%) into the current minute. The sliding window covers the last 75% of the previous minute, so the estimate is <code>80 x 0.75 + 30 = 90</code>: allow, 10 left. It assumes the previous window's requests were spread evenly, so it is an approximation, but it removes the 2x edge burst at the memory cost of two integers." },
        { t: "code", lang: "python", code: `import time

class SlidingWindowCounter:
    def __init__(self, limit, window_sec):
        self.limit = limit
        self.window = window_sec
        self.counts = {}                  # window_start -> count, keep 2

    def allow(self):
        now = time.time()
        cur_start = int(now // self.window) * self.window
        prev_start = cur_start - self.window
        cur = self.counts.get(cur_start, 0)
        prev = self.counts.get(prev_start, 0)
        # Fraction of the previous window still inside the sliding window
        overlap = 1 - (now - cur_start) / self.window
        estimated = prev * overlap + cur
        if estimated >= self.limit:
            return False
        self.counts = {prev_start: prev, cur_start: cur + 1}
        return True` },
        { t: "table", head: ["Algorithm", "State per key", "Bursts", "Accuracy", "Good for"], rows: [
          ["Token bucket", "2 numbers", "Allowed up to capacity", "Exact average rate", "Public APIs with burst plus sustained limits; the default answer"],
          ["Leaky bucket (queue)", "Queue up to N items", "Absorbed, then smoothed", "Exact output rate", "Shaping traffic to a fragile downstream"],
          ["Fixed window", "1 counter", "Up to 2x at window edges", "Coarse", "Daily or monthly quotas where edges do not matter"],
          ["Sliding window log", "1 timestamp per request", "None", "Exact", "Low limits where precision matters, such as 5 login attempts per 15 minutes"],
          ["Sliding window counter", "2 counters", "Small", "Approximate, usually within a few percent", "High-volume per-key limits at low memory"]
        ] },
        { t: "callout", kind: "example", title: "What real systems use", html: "Amazon API Gateway documents token bucket throttling with a steady-state rate and a burst size. Stripe has described using token buckets backed by Redis for its API limits. Cloudflare has written about using the sliding window counter approximation for rate limiting at its edge, finding it accurate enough while keeping only two counters per key." },
        { t: "h", text: "Where to enforce" },
        { t: "diagram", caption: "Limits are layered: coarse IP limits at the edge, identity-based limits at the gateway, and cost or concurrency limits deep inside.", code: `flowchart LR
  C(("Client")) --> Edge["CDN or WAF<br/>per IP, bot and DDoS rules"]
  Edge --> GW["API gateway<br/>per API key, user, route"]
  GW -.->|"atomic check"| R[("Redis counters")]
  GW -->|"over limit: 429"| C
  GW --> Svc["Service<br/>per tenant, per operation cost"]
  Svc --> Dep["Shared dependency<br/>concurrency limit"]` },
        { t: "list", items: [
          "<b>Client side:</b> polite SDKs throttle themselves and honor <code>Retry-After</code>, but clients can be modified, so this is never enforcement.",
          "<b>Edge (CDN, WAF):</b> cheap, coarse limits by IP or fingerprint that stop floods before they reach your origin. Beware that many users can share one IP behind corporate NAT or mobile carrier-grade NAT.",
          "<b>API gateway or middleware:</b> the main place, because it knows the authenticated identity, the plan tier and the route. Limit by API key or user id, not IP.",
          "<b>Inside services:</b> limits that need business context, such as 3 password resets per hour per account or a per-tenant cap on expensive report queries, plus concurrency limits to protect a shared database."
        ] },
        { t: "h", text: "Telling clients they are limited" },
        { t: "code", lang: "http", code: `HTTP/1.1 429 Too Many Requests
Content-Type: application/problem+json
Retry-After: 12
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1761127260

{ "type": "https://api.example.com/errors/rate-limited", "status": 429,
  "title": "Rate limit exceeded", "detail": "100 requests per minute for this API key." }` },
        { t: "callout", kind: "tip", title: "Headers on every response, not just the 429", html: "Return <code>X-RateLimit-Limit</code>, <code>-Remaining</code> and <code>-Reset</code> (epoch seconds, as GitHub does) on successful responses too, so well-behaved clients slow down before hitting the wall. <code>Retry-After</code> (seconds or an HTTP date) is the standard header on 429. An IETF draft standardizes <code>RateLimit</code> and <code>RateLimit-Policy</code> headers. Use 429 for a client exceeding its quota and 503 when the server is shedding load for everyone." },
        { t: "callout", kind: "interview", title: "The opening interviewers want", html: "Before choosing an algorithm, ask: limit by what key, what limits per tier, is a small overshoot acceptable, and what happens when the limiter itself is down. Then pick token bucket for burst plus sustained limits, or sliding window counter when you want smooth per-minute limits, and say the state lives in Redis and is updated atomically with a Lua script. The full distributed design is the first practice problem in this chapter." }
      ]
    }
  ],
  takeaways: [
    "Start as a modular monolith; extract microservices only for a concrete reason such as independent scaling, team autonomy or a distinct reliability need.",
    "Split services by business capability and bounded context, not by technical layer, and give each service its own database reachable only through its API or events.",
    "Service discovery needs a registry kept current by health checks; client-side discovery saves a hop, server-side keeps clients simple.",
    "The API gateway handles north-south cross-cutting concerns (TLS, auth, rate limits, routing); BFFs shape responses per client; a service mesh handles east-west retries, timeouts and mTLS through sidecars.",
    "Make every non-idempotent create safe to retry with a client-generated Idempotency-Key stored atomically with the result.",
    "Use cursor (keyset) pagination for large or changing collections: it seeks via an index instead of scanning and discarding offset rows.",
    "Version with /v1 in the path, make only additive changes within a version, and return one consistent error format with a machine-readable code and request id.",
    "Token bucket allows bursts up to capacity with a sustained refill rate in two numbers per key; fixed windows allow 2x bursts at edges; sliding window counter approximates a true sliding window with two counters.",
    "Distributed rate limiting needs atomic check-and-update, typically a Redis Lua script, and an explicit fail-open or fail-closed decision.",
    "Reject with 429 plus Retry-After, and send limit, remaining and reset headers on every response."
  ],
  mcqs: [
    { q: "A 12-person startup is building its first product and the CTO wants 15 microservices from day one. What is the strongest argument against it?", options: ["Kubernetes cannot route traffic between 15 services unless a service mesh such as Istio is installed", "The team pays the cost of a distributed system before it knows where the real boundaries are", "Every call between services adds about 50 ms, so pages built from several services feel slow", "Monoliths scale only vertically, so the team should split only once the largest server is maxed out"], answer: 1, explain: "Early boundaries are usually wrong, and wrong boundaries across a network are expensive to move. A modular monolith keeps refactoring cheap. A call inside one datacenter costs about a millisecond, not 50 ms, and monoliths can also scale horizontally behind a load balancer, so the last option is false.", level: "easy" },
    { q: "Two services share one PostgreSQL schema. The Orders team renames a column and the Shipping service breaks in production. Which principle would have prevented this?", options: ["Database per service, accessed only through the owner's API or events", "An ORM in every service, so renamed columns are remapped automatically", "Running each migration in a maintenance window with both services stopped", "A read replica for Shipping, so it reads a stable copy of the schema"], answer: 0, explain: "When each service owns its data, schema changes are private and the contract is the API. ORMs and maintenance windows do not remove the hidden coupling of a shared schema, and a streaming read replica receives the same rename.", level: "easy" },
    { q: "Which pattern is characteristic of a \"distributed monolith\"?", options: ["Services that publish domain events through a transactional outbox in the same database transaction", "Services that are each owned end to end by one team, including on-call duty", "Services that must deploy together and call each other synchronously in long chains", "Services that use different languages, frameworks and databases from each other"], answer: 2, explain: "Lockstep deploys and synchronous chains give you network failures and summed latency without independent deployability. Different languages per service are a normal microservices trait.", level: "easy" },
    { q: "In Kubernetes, a pod calls <code>payments.prod.svc.cluster.local</code> and kube-proxy forwards to a healthy pod. What kind of discovery is this?", options: ["Client-side discovery: the client resolves DNS and picks the pod it connects to", "Peer-to-peer discovery: pods gossip their addresses to each other with no registry", "Static configuration: the DNS name is fixed in config, so no discovery takes place", "Server-side discovery: the platform routes a stable virtual IP to live pods"], answer: 3, explain: "The client knows only a stable service name and virtual IP; the platform chooses the backend pod, which is server-side discovery. Client-side discovery means the client fetches the instance list and picks one itself.", level: "medium" },
    { q: "The mobile app's home screen needs data from 6 services in one compact response, while the web app needs richer payloads from the same services. What is the cleanest design?", options: ["Client-specific branches in every backend service, selected by the User-Agent header", "A backend for frontend per client that fans out in parallel and shapes responses", "Direct calls from the mobile app to all 6 services, sent in parallel over HTTP/2", "One merged service built from the 6, so a single call returns every field"], answer: 1, explain: "A BFF owned by each client team aggregates and tailors responses without polluting services or the shared gateway. Direct calls from a phone expose internal services and multiply requests over a high-latency network, even when sent in parallel.", level: "medium" },
    { q: "A security team requires that all service-to-service traffic be encrypted and mutually authenticated across 300 services written in 5 languages. What is the most practical approach?", options: ["A service mesh such as Istio or Linkerd, with sidecars handling mTLS and certificate rotation", "TLS terminated at the edge API gateway, with plain HTTP inside the cluster", "A TLS library added by each team, with each service managing its own certificates", "One private subnet for all services, with security groups in place of encryption"], answer: 0, explain: "A mesh enforces mTLS uniformly without app changes and automates certificate rotation. Per-team libraries mean five implementations and 300 services managing certificates by hand; edge TLS only protects north-south traffic, and network isolation alone does not authenticate services.", level: "medium" },
    { q: "A client sends <code>POST /payments</code> with an <code>Idempotency-Key</code>. The first attempt is still processing when an identical retry arrives with the same key. What should the server do?", options: ["Process the retry as a new payment, since the first has not finished", "Return 200 with an empty body so the client stops retrying", "Return 409 Conflict, or wait, without running the payment again", "Delete the stored key and restart the payment from the beginning"], answer: 2, explain: "The key is claimed atomically as in progress, so a concurrent duplicate must not execute again; 409 tells the client to retry later and then get the stored result. Processing it again is exactly the double charge the key exists to prevent.", level: "medium" },
    { q: "An endpoint uses <code>LIMIT 50 OFFSET n</code> on a 200M-row table. Page 1 takes 5 ms but page 20,000 takes 4 seconds. Why, and what fixes it?", options: ["The B-tree becomes unbalanced at high offsets; rebuild the index with REINDEX", "PostgreSQL caches only the first pages of a table; raise shared_buffers to 32 GB", "Offsets above 1M rows fall outside the index; range-partition the table by created_at month", "Each skipped row is read and discarded; use keyset pagination on an indexed (created_at, id)"], answer: 3, explain: "OFFSET still walks past every skipped row, so cost grows with depth. A keyset predicate lets the index seek directly to the last seen position, keeping each page constant time.", level: "medium" },
    { q: "Which API change is backward compatible for existing clients that ignore unknown fields?", options: ["Adding a new optional field to a response", "Renaming <code>user_name</code> to <code>username</code>", "Changing <code>price</code> from a string to an integer", "Making a previously optional request field required"], answer: 0, explain: "Additive, optional changes do not break tolerant clients. Renames, type changes and stricter validation all break existing integrations and require a new version.", level: "easy" },
    { q: "A limit of 100 requests per minute uses a fixed window counter. What is the most requests a client can get accepted within about one second?", options: ["100", "101", "150", "200"], answer: 3, explain: "The client can send 100 at the end of one window and 100 more at the start of the next, all within about a second. Sliding window log or counter, or a token bucket with capacity below 200, prevents this edge burst.", level: "medium" },
    { q: "A token bucket has capacity 20 and refills at 5 tokens per second. A client that has been idle for a minute sends requests as fast as it can. Roughly how many are accepted in the first 2 seconds?", options: ["10", "20", "30", "40"], answer: 2, explain: "The bucket starts full at 20 (refill is capped at capacity, so idle time does not add more), and 2 seconds of refill at 5 per second adds about 10, so about 30. Answering 10 ignores the burst capacity.", level: "hard" },
    { q: "With a sliding window counter limit of 100 per minute, the previous minute had 60 requests, the current minute has 50, and we are 30 seconds into the current minute. Is the next request allowed?", options: ["Yes, the estimate is 80", "Yes, the current window has only 50 requests", "No, the estimate is 110", "No, the estimate is exactly 100"], answer: 0, explain: "Half of the previous window still overlaps, so 60 x 0.5 + 50 = 80, under 100. Looking only at the current window ignores the previous minute's traffic, which is the fixed-window flaw this algorithm fixes.", level: "hard" },
    { q: "Ten gateway instances each run <code>GET count</code>, compare it to the limit in application code, then <code>INCR</code> in Redis. Under load, clients exceed their limit. Why?", options: ["INCR is not atomic in Redis Cluster, so two nodes can increment the same key at once", "GET and INCR are separate steps, so concurrent requests all read the same old count", "Redis evicts the counters under memory pressure, which resets them to zero", "Redis is single-threaded, so it drops INCR commands that queue up under load"], answer: 1, explain: "Check-then-act across two round trips is a race: many requests see 99 and all proceed. Do the check and update atomically, with INCR first and compare its result, or with a Lua script.", level: "hard" },
    { q: "The Redis cluster backing your public API's rate limiter becomes unreachable. For most product APIs, what is the usual default and its main risk?", options: ["Fail closed, rejecting every request with 429 until Redis returns; risk is a full API outage", "Switch to fixed-window counters in PostgreSQL; risk is extra load on the primary database", "Fail open with a coarse per-gateway in-memory limit; risk is backends absorbing excess traffic", "Queue requests in the gateway until Redis returns; risk is memory exhaustion and timeouts"], answer: 2, explain: "Turning a limiter outage into a full API outage is usually worse than briefly weaker limiting, so most APIs fail open with a coarse local limit as a safety net. Abuse-sensitive limits such as login attempts or SMS sends often fail closed instead.", level: "hard" },
    { q: "Thousands of users behind one mobile carrier's NAT get 429s although each makes only a few requests. What is the best fix?", options: ["Exempt known mobile carrier IP ranges from rate limiting entirely", "Raise the per-IP limit tenfold for everyone, so shared IPs have headroom", "Switch the per-IP limiter from fixed windows to a leaky bucket so bursts are smoothed out", "Limit per authenticated user or API key, with only a loose per-IP limit at the edge"], answer: 3, explain: "Carrier-grade NAT puts many users behind one IP, so IP is a poor identity for authenticated traffic. Changing the algorithm does not fix a wrong key.", level: "medium" }
  ],
  design: [
    {
      id: "design-distributed-rate-limiter",
      title: "Design a distributed rate limiter",
      level: "Hard",
      prompt: "Design a rate limiting service for a public API platform served from three regions (us-east, eu-west, ap-south) by hundreds of gateway instances. Customers have per-API-key limits by plan (e.g. 100 requests per second sustained with bursts to 200 for Pro), plus per-endpoint limits and per-IP limits for unauthenticated traffic. The limiter must add very little latency and stay correct under concurrency.",
      clarify: [
        "Which keys do we limit on: API key, user, IP, endpoint, tenant, or combinations, and how many distinct keys are active?",
        "Are limits per region or global across all regions, and how much overshoot is acceptable for a global limit?",
        "What latency budget can the limiter add per request (p99 under 1 to 2 ms?)",
        "What is the total request rate at peak, and per region?",
        "Do limits need burst allowance (token bucket) or smooth per-minute windows?",
        "If the limiter's storage is down, should requests be allowed or rejected?",
        "How quickly must a limit change (plan upgrade) take effect?"
      ],
      hints: [
        "Where does the counter live so that hundreds of gateway instances see the same value? Local memory alone is not enough.",
        "Read the counter, compare, then write it back: what goes wrong when two gateways do that at the same moment?",
        "Redis executes a Lua script atomically. Put the whole token bucket refill, check and update in one script, with one key per limited identity.",
        "A global limit across regions cannot afford a 100 ms cross-region round trip per request. Consider splitting the limit per region, or syncing counts asynchronously and accepting small overshoot.",
        "Decide explicitly what happens when Redis is unreachable, and add a small local in-memory limiter as a fallback and as a first filter for abusive keys."
      ],
      solution: [
        { t: "h", text: "Requirements" },
        { t: "list", items: [
          "<b>Functional:</b> limit requests per API key, per key and endpoint, and per IP; configurable rules per plan with burst and sustained rates; return 429 with <code>Retry-After</code> and rate limit headers; rule changes take effect within seconds; support request cost weights (an export call costs 10 tokens).",
          "<b>Non-functional:</b> added latency p99 under ~2 ms; no meaningful overshoot within a region under concurrency; global limits accurate within ~10%; highly available (the limiter must never be the reason the API is down); scales to 1M+ decisions per second."
        ] },
        { t: "h", text: "Estimates" },
        { t: "list", items: [
          "Peak traffic 1.5M requests/s across 3 regions, about 500k/s per region. Each request checks about 2 rules (key plus key and endpoint), so about 1M limiter operations/s per region.",
          "A Redis primary handles on the order of 100k to 200k simple ops/s; a Lua script with a few commands is heavier, so plan about 50k to 80k script calls/s per shard. 1M/s per region needs about 15 to 20 shards; plan 24 with headroom, each with a replica.",
          "Active keys: 5M API keys, about 1M active in any hour, times 2 to 3 rules = 3M buckets. Each token bucket is a small hash (tokens, last refill): about 100 bytes with Redis overhead, so 3M x 100 B = 300 MB per region. Memory is trivial; throughput sets the shard count.",
          "Latency: same-AZ Redis round trip about 0.2 to 0.5 ms, so one pipelined call per request fits the 2 ms budget. A cross-region round trip (60 to 150 ms) does not, which shapes the multi-region design."
        ] },
        { t: "h", text: "API" },
        { t: "code", lang: "http", code: `POST /v1/ratelimit/check          (internal, called by gateways; usually a library call)
{ "descriptors": [ { "key": "apikey:ak_9f2", "rule": "pro-default", "cost": 1 },
                   { "key": "apikey:ak_9f2:POST:/v1/exports", "rule": "exports", "cost": 10 } ] }
-> 200 { "allowed": false, "limit": 200, "remaining": 0, "reset_s": 3, "retry_after_s": 2 }

PUT /v1/ratelimit/rules/pro-default    (admin)
{ "algorithm": "token_bucket", "capacity": 200, "refill_per_sec": 100, "scope": "regional" }

Response to the end client when limited:
HTTP/1.1 429 Too Many Requests
Retry-After: 2
X-RateLimit-Limit: 200
X-RateLimit-Remaining: 0` },
        { t: "h", text: "Data model" },
        { t: "table", head: ["Data", "Where", "Shape"], rows: [
          ["Rules", "PostgreSQL as source of truth, cached in every gateway, pushed on change", "<code>rule_id, match (plan, route, method), algorithm, capacity, refill_per_sec, window, scope</code>"],
          ["Key to plan mapping", "Gateway cache from the API-key service, TTL about 60 s", "<code>api_key -> tenant_id, plan</code>"],
          ["Token bucket state", "Redis Cluster per region, sharded by key hash", "Hash <code>rl:{apikey:ak_9f2}:pro-default</code> with fields <code>tokens</code>, <code>ts</code>; TTL about 2x the time to refill from empty"],
          ["Sliding window state", "Same cluster", "Two counters <code>rl:{key}:w:1761127200</code> and the previous window, each with TTL 2 windows"]
        ] },
        { t: "p", html: "Redis fits because the state is tiny, hot, short-lived and can be lost occasionally without harm, and because Lua scripts give atomic read-modify-write in sub-millisecond time. Durability is deliberately weak: if a shard fails over and loses a second of counts, clients get a slightly more generous limit for a moment, which is acceptable." },
        { t: "h", text: "High-level design" },
        { t: "diagram", caption: "Each region decides locally against its own Redis cluster; only aggregated usage crosses regions, asynchronously.", code: `flowchart LR
  C(("Client")) --> GW["Gateway instance<br/>limiter library"]
  GW -->|"1. local pre-check"| LC["In-process<br/>token cache"]
  GW -->|"2. EVALSHA token bucket"| R[("Redis Cluster<br/>region us-east")]
  GW -->|"3a. allowed"| Svc["Backend services"]
  GW -->|"3b. over limit: 429"| C
  Cfg[("Rules DB")] -.->|"push rule changes"| GW
  R -.->|"usage deltas every 1 s"| Sync["Global usage sync"]
  Sync -.->|"remote region usage"| R
  Sync <-.->|"exchange with eu-west, ap-south"| Other["Other regions"]` },
        { t: "p", html: "<b>Request path:</b> the gateway authenticates the API key, resolves its plan, and finds the matching rules from its in-memory rule cache. It sends one pipelined <code>EVALSHA</code> per rule (or one script covering all rules when the keys share a hash slot) to the regional Redis Cluster. If every rule allows, the request goes to the backend with the rate limit headers attached; if any rule denies, the gateway returns 429 immediately with <code>Retry-After</code> computed by the script. <b>Config path:</b> rules live in PostgreSQL, and changes are pushed to all gateways through a pub/sub channel, with a periodic full refresh as a backstop, so a plan upgrade applies within seconds." },
        { t: "h", text: "Deep dive 1: atomicity and race conditions" },
        { t: "p", html: "The naive version is <code>GET</code>, compare in the gateway, then <code>SET</code>. Two gateways serving the same key at the same moment both read <code>tokens = 1</code>, both allow, and both write <code>0</code>: two requests passed on one token. Across hundreds of gateways under a burst, overshoot can be many times the limit. Options: <code>WATCH/MULTI/EXEC</code> optimistic transactions (retries under contention, which is exactly when you are busy), or a <b>Lua script</b>, which Redis runs atomically on the shard owning the key: no other command interleaves. The script reads state, refills, decides, writes and sets the TTL in one round trip." },
        { t: "code", lang: "text", code: `-- token_bucket.lua   KEYS[1] = bucket key
-- ARGV: capacity, refill_per_sec, cost
local cap  = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local cost = tonumber(ARGV[3])
local t    = redis.call('TIME')                       -- server clock, not gateway clock
local now  = tonumber(t[1]) + tonumber(t[2]) / 1000000
local s    = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(s[1]) or cap
local ts     = tonumber(s[2]) or now
tokens = math.min(cap, tokens + math.max(0, now - ts) * rate)
local allowed = 0
if tokens >= cost then tokens = tokens - cost  allowed = 1 end
redis.call('HSET', KEYS[1], 'tokens', tokens, 'ts', now)
redis.call('EXPIRE', KEYS[1], math.ceil(cap / rate * 2))
local retry = 0
if allowed == 0 then retry = (cost - tokens) / rate end
return { allowed, tostring(tokens), tostring(retry) }` },
        { t: "list", items: [
          "<b>Use the Redis server clock</b> (<code>TIME</code>) so gateways with skewed clocks cannot over-refill a bucket. Since Redis 5, scripts replicate their effects rather than the script itself, so calling <code>TIME</code> inside a script that writes is safe.",
          "<b>One key, one shard:</b> a script may only touch keys in one hash slot in Redis Cluster. Wrap the identity in a hash tag, <code>rl:{apikey:ak_9f2}:rule</code>, so all of a key's buckets live together and can be checked in one script call.",
          "<b>Load scripts once</b> with <code>SCRIPT LOAD</code> and call <code>EVALSHA</code>, falling back to <code>EVAL</code> on a <code>NOSCRIPT</code> error after a failover.",
          "<b>Multiple rules:</b> if the key rule allows but the endpoint rule denies, the first rule has already consumed a token. Either check all rules in one script and commit only if all pass, or accept that a denied request still costs a token, which is usually fine and simpler."
        ] },
        { t: "h", text: "Deep dive 2: hot keys and the local pre-check" },
        { t: "p", html: "One abusive client sending 200k requests/s with one API key sends all of them to one Redis shard, which can saturate it and hurt every other key on that shard. Two defenses: first, once Redis says a key is over its limit, the gateway caches \"denied until T\" locally (T from <code>retry_after</code>), so further requests from that key in the next second never touch Redis. Second, for very high-limit keys (an enterprise key allowed 50k/s), give each gateway a <em>local token lease</em>: it takes a batch of, say, 100 tokens from Redis in one call and spends them in memory, returning to Redis only when the batch runs out. This cuts Redis traffic by about 100x at the cost of small overshoot (up to one batch per gateway) and slightly uneven fairness between gateways." },
        { t: "h", text: "Deep dive 3: multiple regions" },
        { t: "compare", items: [
          { title: "Per-region limits", pros: ["Every decision is local: sub-millisecond", "Regions fully independent; a regional failure affects only that region"], cons: ["A client spreading traffic across 3 regions gets up to 3x its limit", "Static splits mismatch real traffic if a client is mostly in one region"], use: "Default for protection limits, where the goal is protecting each region's capacity rather than enforcing a precise global quota." },
          { title: "Single global Redis", pros: ["Exact global counts"], cons: ["60 to 150 ms cross-region round trip added to every request in remote regions", "Global outage if that region goes down"], use: "Almost never on the request path." },
          { title: "Local enforcement plus async global sync", pros: ["Local latency with approximately global limits", "Survives partitions: each region keeps enforcing on its last known view"], cons: ["Overshoot during the sync interval, roughly the limit times interval times regions", "More moving parts"], use: "Paid global quotas, such as 1M requests per day per customer, where about 1 to 5% overshoot is acceptable." }
        ] },
        { t: "p", html: "For the sync approach, each region counts usage per key locally and every second publishes per-key deltas to the other regions (through a replicated stream or a small sync service). Each region enforces against <code>local_usage + last_known_remote_usage</code>. A refinement is <b>dynamic allocation</b>: split a global budget into per-region shares proportional to recent traffic, and rebalance shares every few seconds. Avoid active-active Redis replication of counters with last-writer-wins, which loses increments; CRDT-based counters, such as a grow-only counter per region merged by summing, handle concurrent increments correctly." },
        { t: "h", text: "Deep dive 4: failure handling" },
        { t: "list", items: [
          "<b>Fail open</b> (allow when Redis is unreachable or times out after about 5 ms) for normal API limits: a limiter outage should not become an API outage. Behind it, keep a coarse per-instance in-memory token bucket set to (global limit / number of gateways) times a safety factor, so traffic is still roughly bounded.",
          "<b>Fail closed</b> for limits that protect money or security: login attempts, OTP and SMS sends, gift card redemption. A brief outage there is cheaper than a brute-force or toll-fraud window.",
          "<b>Timeouts and circuit breaker</b> on the Redis client: tight timeouts so a slow shard cannot stall the gateway, and a breaker that switches to the local fallback after repeated failures instead of paying the timeout on every request.",
          "<b>Replica failover</b> loses at most the last moment of increments (Redis replication is asynchronous), which briefly loosens limits; acceptable for this data."
        ] },
        { t: "h", text: "Trade-offs and bottlenecks" },
        { t: "table", head: ["Decision", "Choice", "Trade-off"], rows: [
          ["Algorithm", "Token bucket for API keys, sliding window counter for per-minute IP limits", "Token bucket allows bursts by design; window counters are smoother but approximate"],
          ["Atomicity", "Lua script per key on one shard", "Script cost limits throughput per shard; scale by adding shards"],
          ["Where state lives", "Regional Redis Cluster", "Fast and simple, but counts can be lost on failover"],
          ["Multi-region", "Local decisions, 1 s async global sync for global quotas", "Bounded overshoot instead of cross-region latency"],
          ["Failure mode", "Fail open with local fallback, fail closed for sensitive limits", "Brief unthrottled window vs availability"],
          ["Hot keys", "Local deny cache and token leases", "Small overshoot and less perfect fairness"]
        ] }
      ],
      followups: [
        "How would you implement a concurrency limit (max 10 in-flight requests per key) rather than a rate limit, and how do you avoid leaked slots when a gateway crashes mid-request?",
        "A customer upgrades from 100/s to 1,000/s. How do you make it take effect within 5 seconds across all regions?",
        "How would you test that the limiter does not overshoot under 500 concurrent gateways?",
        "How would you rate limit by cost, such as GPU seconds, when the cost is only known after the request finishes?",
        "How would you prevent a limited client's retries from amplifying load, and what should the SDK do with Retry-After?"
      ]
    },
    {
      id: "design-api-gateway",
      title: "Design the API gateway for a mobile and web product",
      level: "Medium",
      prompt: "A consumer product (think a food or travel marketplace) has iOS, Android and web clients and about 40 backend microservices. Today each client calls services directly through a load balancer. Design the API gateway layer: routing, authentication, rate limiting, response aggregation for mobile, versioning, and how it stays fast and highly available.",
      clarify: [
        "What is peak request rate and the latency budget the gateway may add?",
        "How do clients authenticate today: sessions, JWTs from an identity service, API keys for partners?",
        "Do mobile screens need aggregated responses, and how old are the oldest app versions still in use?",
        "Are there public partner APIs in scope, or only first-party clients?",
        "What is the deployment footprint: one region or several, Kubernetes or VMs?",
        "Which concerns must be centralized for compliance: audit logging, PII redaction, WAF?"
      ],
      hints: [
        "List the cross-cutting concerns every service currently duplicates. Which belong at the edge?",
        "Validating a JWT locally needs no network call. Why does that matter at 100k requests per second?",
        "The mobile home screen needs 6 services. Should the gateway do that aggregation, or something behind it?",
        "Gateways should be stateless so they scale horizontally. Where do routes, keys and rate-limit counters live?",
        "Think about how old mobile app versions keep working when a service changes its API."
      ],
      solution: [
        { t: "h", text: "Requirements" },
        { t: "list", items: [
          "<b>Functional:</b> single public entry point per environment; route by host, path and version to services; authenticate users (JWT) and partners (API keys); per-user and per-key rate limits; mobile and web BFFs that aggregate several services per screen; request ids and access logs; canary releases by percentage or header.",
          "<b>Non-functional:</b> gateway adds under 5 ms p99 (excluding BFF fan-out); 99.99% availability, multi-AZ; horizontally scalable stateless instances; config changes without restarts; old app versions supported for at least 12 months."
        ] },
        { t: "h", text: "Estimates" },
        { t: "list", items: [
          "20M DAU, about 60 API calls per user per day: 1.2B calls/day / 10^5 s = about 12k requests/s average; peak 5x at dinner time = 60k requests/s.",
          "An Envoy or NGINX-based gateway instance handles roughly 10k to 20k proxied requests/s with TLS on a few cores, so peak needs about 6 instances; run 12 across 3 AZs to survive an AZ loss with headroom.",
          "Average response 5 KB: 60k x 5 KB = 300 MB/s egress at peak, about 2.4 Gbps, before compression.",
          "BFF: the mobile home screen fans out to 6 services in parallel; latency is the slowest call plus overhead, so each service needs a p99 well under 100 ms for a 150 ms screen budget."
        ] },
        { t: "h", text: "API" },
        { t: "code", lang: "http", code: `GET  /mobile/v3/home?lat=12.97&lng=77.59        -> Mobile BFF: banners, nearby stores, active order
GET  /web/v1/stores/st_88                        -> Web BFF: store page with full menu
POST /api/v1/orders            Authorization: Bearer eyJ...   Idempotency-Key: 3f1c...
GET  /partner/v1/orders?cursor=eyJpZCI6...       X-API-Key: pk_live_...

Every response carries:
X-Request-Id: req_01HF3...
X-RateLimit-Limit: 600   X-RateLimit-Remaining: 587   X-RateLimit-Reset: 1761127260` },
        { t: "h", text: "Data model" },
        { t: "table", head: ["Data", "Store", "Notes"], rows: [
          ["Route table: host, path prefix, version, upstream, timeouts, retries, canary weights", "Git as source of truth, compiled into a config store (etcd or the control plane), pushed to gateways", "Declarative, reviewed in pull requests, rolled out gradually"],
          ["JWT signing keys", "Identity service JWKS endpoint, cached in gateways", "Refreshed every few minutes and on unknown <code>kid</code>"],
          ["API keys", "PostgreSQL in the key service; hashed keys cached in gateways with 60 s TTL", "Revocation pushed via pub/sub for immediate effect"],
          ["Rate limit counters", "Regional Redis Cluster", "Token bucket per user and per API key, as in the rate limiter design"],
          ["Access logs", "Kafka to the log platform", "Request id, route, status, latency, user id hashed"]
        ] },
        { t: "h", text: "High-level design" },
        { t: "diagram", caption: "The edge gateway enforces policy once for all clients, BFFs aggregate per client type, and services never see raw internet traffic.", code: `flowchart LR
  Cl(("Mobile and web")) --> CDN["CDN and WAF"]
  CDN --> L4["L4 load balancer"]
  L4 --> GW["Gateway fleet<br/>Envoy, stateless"]
  GW -.->|"rate limit check"| R[("Redis")]
  GW -.->|"JWKS cache refresh"| Id["Identity service"]
  GW --> MB["Mobile BFF"]
  GW --> WB["Web BFF"]
  GW --> Ord["Order service"]
  MB --> Cat["Catalog service"]
  MB --> Ord
  MB --> Promo["Promotions service"]
  WB --> Cat
  GW -.->|"access logs"| K[["Kafka"]]` },
        { t: "p", html: "A request arrives at the CDN, which handles DDoS protection and WAF rules and caches public assets. The L4 load balancer spreads TCP connections across gateway instances in three AZs. The gateway terminates TLS, assigns a request id, validates the JWT signature and expiry locally using cached public keys, checks rate limits in Redis, matches the route, and forwards to the upstream with the user id and scopes in trusted internal headers. Screen-shaped mobile and web calls go to BFFs, which call services in parallel with tight per-call timeouts; plain resource calls such as <code>POST /api/v1/orders</code> route directly to the owning service." },
        { t: "h", text: "Deep dives" },
        { t: "p", html: "<b>Authentication at the edge.</b> Validating a JWT locally costs microseconds of CPU and no network call, which is why the gateway uses short-lived access tokens (about 15 minutes) signed with asymmetric keys. Revocation is the catch: a stolen token stays valid until it expires, so keep tokens short and, for high-risk actions, have the service check a revocation list or session store. The gateway strips any incoming internal identity headers from clients and sets them itself, so a client cannot forge <code>X-User-Id</code>. Services trust those headers only from the gateway, enforced with mTLS or network policy. Token formats and OAuth flows are covered in Chapter 13." },
        { t: "p", html: "<b>BFF aggregation and partial failure.</b> The mobile home screen calls catalog, promotions, orders, recommendations, user and banners in parallel. Each call gets its own timeout (for example 80 ms) and a fallback: if recommendations time out, the BFF returns the screen without that carousel and a flag, instead of failing the whole screen. Required data (the store list) fails the request; optional data degrades. Responses are shaped for the client, often 60 to 80% smaller than the combined service payloads, which matters on slow mobile networks." },
        { t: "p", html: "<b>Versioning for old app versions.</b> Mobile users run versions that are months old, so the mobile BFF keeps <code>/mobile/v2</code> and <code>/mobile/v3</code> side by side, translating between the client contract and the current service APIs. Services can evolve freely as long as the BFF adapts. The gateway reads the app version header to apply a minimum supported version: below it, it returns a specific error code that makes the app show an upgrade prompt. Per-version traffic metrics decide when an old BFF version can be removed." },
        { t: "h", text: "Trade-offs and bottlenecks" },
        { t: "list", items: [
          "<b>Gateway as a single point of failure:</b> mitigated by stateless instances across AZs behind an L4 load balancer, gradual config rollout with automatic rollback, and keeping business logic out of it.",
          "<b>Extra hop latency:</b> about 1 ms per proxy hop in the same AZ; the BFF hop pays for itself by replacing several client round trips over a 50 to 200 ms mobile network.",
          "<b>Managed vs self-hosted:</b> AWS API Gateway or Apigee save operations work but cost per request at high volume and limit customization; Envoy or Kong on Kubernetes cost engineering time but are cheaper at 60k requests/s.",
          "<b>BFF sprawl:</b> one BFF per client team is good; one BFF per screen is not. Share libraries for service clients between BFFs.",
          "<b>GraphQL instead of REST BFFs:</b> lets clients pick fields and reduces versioning pressure, but needs query cost limits, persisted queries and careful caching."
        ] }
      ],
      followups: [
        "How do you roll out a gateway config change to 12 instances without a bad route taking down the whole API?",
        "How would you add response caching at the gateway for the store page without leaking personalized data between users?",
        "How do you propagate trace context from the gateway through BFFs to services?",
        "A partner integration needs webhooks for order status. Where does webhook delivery live, and how is it secured?",
        "How would the design change for two regions with users routed by latency?"
      ]
    },
    {
      id: "design-food-delivery-decomposition",
      title: "Break a food-delivery monolith into microservices",
      level: "Hard",
      prompt: "A food-delivery company runs a 6-year-old Rails monolith with one large MySQL database. It handles customers, restaurants, menus, carts, orders, payments, courier dispatch and notifications. Deploys take 2 hours, a slow menu query took down checkout last month, and 150 engineers in 15 teams are blocked on each other. Propose the target service boundaries and a safe migration plan that keeps the business running.",
      clarify: [
        "Which pain hurts most: deploy speed, reliability of checkout, scaling of a specific part, or team autonomy?",
        "What is the order volume at peak, and which flows are latency sensitive (checkout, courier location)?",
        "Which tables are shared by the most modules, and are there cross-module transactions today?",
        "Is there a deadline or freeze period (e.g. no risky changes during festival season)?",
        "Is there an existing platform: Kubernetes, CI/CD per service, tracing, Kafka?",
        "Can we tolerate eventual consistency between, say, order status and restaurant dashboards?"
      ],
      hints: [
        "Map business capabilities first and see which modules change together. Which ones have very different scaling or reliability needs?",
        "Do not extract everything at once. Which first extraction gives the biggest relief with the lowest coupling?",
        "Use a routing layer in front of the monolith and move one capability at a time behind it.",
        "Data is the hard part. How does a new service get its own copy of data that still lives in the monolith's MySQL?",
        "Placing an order touches cart, payment, restaurant and dispatch. What replaces the single transaction?"
      ],
      solution: [
        { t: "h", text: "Requirements" },
        { t: "list", items: [
          "<b>Functional:</b> no change in product behavior during migration; checkout, payment and dispatch keep working; each team can deploy its capability independently.",
          "<b>Non-functional:</b> checkout isolated from failures of menu, search and notifications; independent deploys several times a day; zero data loss and no double charges during cutovers; each extraction reversible by flipping routing back."
        ] },
        { t: "h", text: "Estimates" },
        { t: "list", items: [
          "2M orders/day, peak 4x average in the dinner hour: 2 x 10^6 / 10^5 = about 20 orders/s average, 80 orders/s peak.",
          "Menu and restaurant browsing is about 100 reads per order: 2M x 100 = 200M reads/day, about 2k/s average and 8k/s peak. This read-heavy path is the one that took down checkout by sharing the database.",
          "Courier location updates: 100k active couriers every 5 s at peak = 20k writes/s, a completely different workload from orders.",
          "Each order produces about 10 status events (placed, accepted, picked up, delivered...): 20M events/day, about 230/s average, trivial for Kafka."
        ] },
        { t: "h", text: "API" },
        { t: "code", lang: "http", code: `GET  /v1/restaurants/r_77/menu                 -> Menu service (read heavy, cached)
POST /v1/orders           Idempotency-Key: ...  -> Order service, starts the order saga
POST /v1/payments/authorize                     -> Payment service (internal, called by saga)
POST /v1/dispatch/assignments                   -> Dispatch service (internal)
PUT  /v1/couriers/c_12/location                 -> Location service, 20k writes/s

Events on Kafka: OrderPlaced, PaymentAuthorized, PaymentFailed,
RestaurantAccepted, CourierAssigned, OrderDelivered, OrderCancelled` },
        { t: "h", text: "Data model" },
        { t: "table", head: ["Service", "Owns", "Store"], rows: [
          ["Restaurant and Menu", "restaurants, menus, items, hours, prices", "PostgreSQL plus Redis cache and Elasticsearch for search"],
          ["Order", "orders, order_items, status history, saga state", "MySQL or PostgreSQL, the ordering source of truth"],
          ["Payment", "payment intents, refunds, idempotency keys, ledger", "PostgreSQL with strict ACID, separate access controls"],
          ["Dispatch and Location", "courier state, assignments, live positions", "Redis geo index for live positions, PostgreSQL for assignments"],
          ["Customer", "profiles, addresses, preferences", "PostgreSQL"],
          ["Notification", "templates, delivery log", "Consumes events; DynamoDB or Cassandra for the log"]
        ] },
        { t: "h", text: "High-level design" },
        { t: "diagram", caption: "The strangler routing layer sends extracted capabilities to new services while everything else still reaches the monolith; CDC keeps new services' data in sync during the transition.", code: `flowchart LR
  Cl(("Apps")) --> GW["API gateway<br/>strangler routing"]
  GW -->|"menu routes"| Menu["Menu service"]
  GW -->|"location routes"| Loc["Location service"]
  GW -->|"everything else"| Mono["Rails monolith"]
  Mono --> MDB[("Monolith MySQL")]
  MDB -.->|"CDC via Debezium"| K[["Kafka"]]
  K -.-> Menu
  Menu --> MenuDB[("Menu DB and cache")]
  Mono -.->|"outbox events"| K
  K -.-> Notif["Notification service"]
  Loc --> Geo[("Redis geo")]` },
        { t: "p", html: "Start by making the monolith a modular monolith internally: draw module boundaries along capabilities, and add a check in CI that fails when one module queries another module's tables. Then put the API gateway in front as a strangler layer, routing by path. Extract capabilities one at a time, in order of value and low coupling: <b>Notifications</b> first (consumes events, no one depends on it synchronously), then <b>Menu</b> (read heavy, the cause of the checkout outage), then <b>Location and Dispatch</b> (unique write workload), and only later <b>Payments</b> and <b>Orders</b>, the most coupled and the most sensitive." },
        { t: "h", text: "Deep dives" },
        { t: "p", html: "<b>Moving data out without a big bang.</b> For the Menu extraction: create the new Menu DB, backfill it from MySQL, then keep it in sync with CDC (Debezium reading the MySQL binlog into Kafka). Switch reads to the new service behind a feature flag, compare responses in shadow mode, and ramp traffic 1%, 10%, 100%. Then move writes: the restaurant dashboard writes to the Menu service, which becomes the source of truth, and the monolith, which still needs menu data for order pricing, now consumes Menu events or calls the Menu API. Finally drop the menu tables from the monolith. At every step, rollback is a routing change." },
        { t: "p", html: "<b>Replacing the checkout transaction with a saga.</b> Today one MySQL transaction creates the order, reserves the payment and marks the restaurant order. After extraction, an orchestrated saga in the Order service runs: create order (PENDING), then authorize payment, then send to restaurant, then on acceptance mark CONFIRMED, then request a courier. If the restaurant rejects or times out after 3 minutes, the saga issues compensations: void the payment authorization and mark the order CANCELLED. Each step is idempotent, keyed by order id, and the Order service publishes its events through a transactional outbox so the state change and the event are never out of sync. Sagas and outbox are covered in Chapters 8 and 9; here the point is that the business accepts short eventual consistency (the restaurant dashboard may show a new order a second later) in exchange for isolation." },
        { t: "p", html: "<b>Avoiding a distributed monolith.</b> Order placement must not synchronously call 6 services in a chain. The Order service keeps a local, event-fed copy of what it needs (item prices, restaurant open or closed) via event-carried state transfer, calls Payment synchronously only because the user waits for authorization, and does everything else asynchronously. Every synchronous call gets a timeout, retry with backoff and a circuit breaker, so a Menu outage degrades browsing but checkout still works for users with items in their carts." },
        { t: "h", text: "Trade-offs and bottlenecks" },
        { t: "list", items: [
          "<b>Pace:</b> extract 3 to 5 services in the first year, not 40. Each extraction needs a platform (CI/CD, tracing, on-call) that must exist first.",
          "<b>Consistency:</b> sagas bring intermediate states (order placed but payment pending) that the UI and support tooling must understand.",
          "<b>Duplicate data:</b> event-fed copies of menu prices can be briefly stale; the Order service re-validates price at checkout and the Menu service versions prices.",
          "<b>Operational cost:</b> more databases, more alerts, more network failure modes; offset by checkout isolation and independent deploys.",
          "<b>Leaving parts in the monolith</b> is a valid end state: low-churn admin features may never justify extraction."
        ] }
      ],
      followups: [
        "How do you find the right boundary when two capabilities share a very hot table, like orders being read by 8 modules?",
        "During the Menu cutover, how do you detect that the new service returns different results from the monolith?",
        "How would you handle a payment authorized but the saga crashing before the restaurant is notified?",
        "Which team owns the API gateway routes, and how do you stop it from becoming a bottleneck for all teams?",
        "How do you run end-to-end tests when 15 teams deploy independently?"
      ]
    }
  ]
};
