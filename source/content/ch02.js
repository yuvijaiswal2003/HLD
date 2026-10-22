module.exports = {
  id: "networking",
  num: 2,
  part: 1,
  title: "Networking and How the Web Works",
  tagline: "DNS, TCP, HTTP, APIs and real-time connections: the plumbing under every design.",
  level: "Beginner",
  lessons: [
    {
      id: "url-to-page",
      title: "What happens when you type a URL",
      minutes: 9,
      blocks: [
        { t: "p", html: "“What happens when you type <code>https://www.example.com</code> into a browser and press Enter?” is a classic warm-up question, and it is also the best map of this chapter. Every step is a piece of infrastructure you will place in later designs: DNS, TCP, TLS, load balancers, reverse proxies, app servers, caches and databases." },
        { t: "steps", items: [
          { title: "Parse the URL", html: "The browser splits it into a <b>scheme</b> (<code>https</code>), a <b>host</b> (<code>www.example.com</code>), an optional <b>port</b> (443 is the default for HTTPS, 80 for HTTP), a <b>path</b> (<code>/</code>) and an optional query string. If the site is on the browser's HSTS list, it upgrades <code>http</code> to <code>https</code> before sending anything." },
          { title: "Check local caches", html: "If the browser holds a fresh cached copy of the page, it may skip the network entirely. Otherwise it needs the server's IP address." },
          { title: "Resolve the name with DNS", html: "The browser checks its own DNS cache, then the operating system's cache (and hosts file), then asks a <b>recursive resolver</b>, usually run by the ISP or a public service like 8.8.8.8 or 1.1.1.1. On a full miss the resolver walks root, TLD and authoritative servers, as the next lesson shows. Result: an IP address such as <code>203.0.113.10</code>." },
          { title: "Open a TCP connection", html: "The browser performs the TCP three-way handshake with that IP on port 443. This costs one network round trip before any data flows." },
          { title: "Negotiate TLS", html: "The browser and server agree on encryption keys, and the browser verifies the server's certificate for <code>www.example.com</code> against trusted certificate authorities. TLS 1.3 takes one more round trip." },
          { title: "Send the HTTP request", html: "<code>GET / HTTP/2</code> with headers such as <code>Host</code>, <code>Cookie</code>, <code>Accept-Encoding</code>. Usually the IP belongs not to an app server but to a CDN edge or a load balancer." },
          { title: "Serve it on the backend", html: "A load balancer or reverse proxy terminates TLS and forwards the request to one of many app servers. The app authenticates the user via the cookie, reads from a cache or database, and renders HTML or JSON." },
          { title: "Return and render", html: "The response travels back along the same path. The browser parses the HTML, discovers CSS, JavaScript and images, and fetches them (many from a CDN, over the already-open connection where possible), then lays out and paints the page." }
        ] },
        { t: "diagram", caption: "The critical path of a first visit: name lookup, connection setup, then the request travels through the load balancer to an app server and its database.", code: `sequenceDiagram
  participant B as Browser
  participant D as DNS resolver
  participant E as Load balancer
  participant A as App server
  participant DB as Database
  B->>D: Look up www.example.com
  D-->>B: 203.0.113.10, TTL 300 s
  B->>E: TCP handshake, then TLS handshake
  B->>E: GET / with cookies
  E->>A: Forward request on a pooled connection
  A->>DB: Query
  DB-->>A: Rows
  A-->>E: 200 OK with HTML
  E-->>B: 200 OK with HTML
  Note over B: Parse HTML, fetch CSS, JS, images, render` },
        { t: "h", text: "Where the time goes" },
        { t: "p", html: "On a first visit, most of the delay is <b>round trips</b>, not computation. A <b>round-trip time (RTT)</b> is how long a tiny packet takes to reach the other side and come back. From London to a data center in Virginia the RTT is around 75 to 80 ms. DNS (up to one or more RTTs on a miss), TCP (1 RTT), TLS 1.3 (1 RTT) and the request itself (1 RTT) add up to roughly 250 to 300 ms before the first byte of HTML arrives, even if the server answers instantly. That is why designers care so much about connection reuse, CDNs and terminating TLS close to the user." },
        { t: "callout", kind: "interview", title: "Breadth first, then depth", html: "When asked this question, list the steps briefly end to end first, then offer depth: “I can go deeper on DNS resolution, the TLS handshake, or what the load balancer does.” The interviewer wants to see that you know the whole path and can zoom into any part." },
        { t: "callout", kind: "tip", title: "Map each step to a design lever", html: "DNS → GeoDNS sends users to a nearby region. TCP/TLS → keep-alive, HTTP/2 and HTTP/3 reduce setup cost. Edge → a CDN caches content near users. Backend → load balancers, caches and replicas. When a design has a latency problem, ask which step of this path it lives in." }
      ]
    },
    {
      id: "ip-ports-dns",
      title: "IP addresses, ports and DNS",
      minutes: 11,
      blocks: [
        { t: "h", text: "IP addresses and ports" },
        { t: "p", html: "An <b>IP address</b> identifies a network interface. IPv4 addresses are 32 bits (about 4.3 billion possible, written like <code>203.0.113.10</code>). IPv6 addresses are 128 bits (written like <code>2001:db8::1</code>), so there are effectively unlimited addresses. Because IPv4 addresses ran out, most private networks use <b>private ranges</b> (<code>10.0.0.0/8</code>, <code>172.16.0.0/12</code>, <code>192.168.0.0/16</code>) behind <b>NAT</b> (network address translation), which rewrites many private addresses to one public address on the way out. Inside a cloud VPC, your servers talk to each other on private IPs." },
        { t: "p", html: "A <b>port</b> is a 16-bit number (0 to 65535) that identifies which process on a machine should receive the traffic. Servers listen on well-known ports; clients use a temporary <b>ephemeral port</b> for their side. A TCP connection is uniquely identified by its <b>5-tuple</b>: source IP, source port, destination IP, destination port, protocol." },
        { t: "table", head: ["Port", "Service", "Port", "Service"], rows: [
          ["22", "SSH", "3306", "MySQL"],
          ["53", "DNS", "5432", "PostgreSQL"],
          ["80", "HTTP", "6379", "Redis"],
          ["443", "HTTPS, and HTTP/3 over UDP", "9092", "Kafka"]
        ] },
        { t: "callout", kind: "warn", title: "Ephemeral ports run out", html: "Linux uses ports 32768 to 60999 for outgoing connections by default, about 28,000 ports. A proxy that opens a new connection per request to the same backend IP and port can exhaust them, because each closed connection lingers in the <code>TIME_WAIT</code> state for about 60 seconds. At 1,000 new connections per second you already have 60,000 sockets in <code>TIME_WAIT</code>. The fix is connection reuse (keep-alive pools), not more ports." },
        { t: "h", text: "DNS: the internet's phone book" },
        { t: "p", html: "The <b>Domain Name System (DNS)</b> maps names like <code>www.example.com</code> to IP addresses. It is a distributed, hierarchical and heavily cached database. Four kinds of servers take part:" },
        { t: "list", items: [
          "<b>Recursive resolver:</b> does the work on the client's behalf and caches answers. Run by ISPs, companies, or public services (Google 8.8.8.8, Cloudflare 1.1.1.1).",
          "<b>Root servers:</b> know where each top-level domain's servers are. There are 13 named root server identities (a through m), each served by many machines worldwide through anycast.",
          "<b>TLD servers:</b> run the top-level domain (Verisign operates <code>.com</code>) and know which nameservers are authoritative for each domain under it.",
          "<b>Authoritative nameservers:</b> hold the actual records for a domain. Often a managed service such as Amazon Route 53, Cloudflare DNS or NS1."
        ] },
        { t: "diagram", caption: "On a full cache miss the resolver follows referrals from root to TLD to the authoritative server, then caches the answer for its TTL.", code: `sequenceDiagram
  participant C as Browser and OS
  participant R as Recursive resolver
  participant RS as Root server
  participant T as TLD server for com
  participant A as Authoritative server
  C->>R: A record for www.example.com?
  Note over R: Cache miss
  R->>RS: www.example.com?
  RS-->>R: Referral to the com servers
  R->>T: www.example.com?
  T-->>R: Referral to ns1.example-dns.net
  R->>A: www.example.com?
  A-->>R: A 203.0.113.10, TTL 300
  R-->>C: 203.0.113.10
  Note over C,R: Both cache the answer for up to 300 s` },
        { t: "p", html: "In practice full walks are rare. The resolver caches the root and <code>.com</code> referrals for days, so most lookups are answered from a cache in a few milliseconds. A cold lookup that has to reach a distant authoritative server can take 50 to 200 ms or more." },
        { t: "table", head: ["Record", "Maps", "Example use"], rows: [
          ["A", "Name to IPv4 address", "<code>api.example.com → 203.0.113.10</code>"],
          ["AAAA", "Name to IPv6 address", "Same, for IPv6 clients"],
          ["CNAME", "Name to another name", "<code>www.example.com → example.cdn-provider.net</code>, pointing at a CDN"],
          ["NS", "Domain to its authoritative nameservers", "Delegating <code>example.com</code> to Route 53"],
          ["MX", "Domain to its mail servers", "Where email for <code>@example.com</code> is delivered"],
          ["TXT", "Name to arbitrary text", "Domain ownership checks, SPF and DKIM email records"]
        ] },
        { t: "h", text: "TTL and caching" },
        { t: "p", html: "Every record carries a <b>TTL</b> (time to live) in seconds, which tells caches how long they may reuse the answer. Common values range from 60 seconds to a day. The trade-off is direct: a long TTL means fewer lookups and faster page loads, but a change (a new IP, a failover) takes up to that long to reach everyone. A short TTL makes changes propagate quickly but sends more queries to your nameservers and adds lookup latency for users. Some resolvers and clients also hold records longer than the TTL, so DNS should never be your only fast-failover mechanism." },
        { t: "callout", kind: "tip", title: "Lower the TTL before a migration", html: "If a record has a TTL of 86,400 s (one day) and you change the IP, some users keep hitting the old IP for up to a day. Lower the TTL to 60 s at least one old-TTL period before the move, switch the record, and raise the TTL again once things are stable." },
        { t: "h", text: "GeoDNS and DNS-based load balancing" },
        { t: "p", html: "Because the authoritative server chooses the answer, DNS can steer traffic. <b>DNS round robin</b> returns several A records and rotates their order, spreading clients across servers. <b>Weighted</b> answers send, say, 10% of lookups to a canary. <b>GeoDNS</b> (also called geo or latency-based routing) answers with the IP of the region closest to the asker. Managed DNS services add <b>health checks</b>, so an unhealthy endpoint is removed from answers." },
        { t: "p", html: "Two limits matter in interviews. First, GeoDNS sees the <b>resolver's</b> IP address, not the user's. A user in Sydney whose company resolver sits in Chicago may be sent to a US region. The EDNS Client Subnet extension passes part of the client's address to fix this, but not every resolver sends it. Second, DNS steering only acts at lookup time, and cached answers stay in use until the TTL expires, so it is coarse-grained. Fine-grained balancing across servers happens in load balancers (Chapter 4)." },
        { t: "callout", kind: "interview", title: "How to use DNS in a design", html: "Say something like: “GeoDNS with health checks sends each user to the nearest healthy region with a 60-second TTL. Inside the region, an L7 load balancer spreads requests across app servers.” That shows you know DNS is for coarse, regional steering and load balancers do the fine work." }
      ]
    },
    {
      id: "tcp-udp-http-tls",
      title: "TCP, UDP, HTTP versions and TLS",
      minutes: 13,
      blocks: [
        { t: "h", text: "TCP vs UDP" },
        { t: "p", html: "IP delivers individual packets with no guarantees: packets can be lost, duplicated or arrive out of order. Two transport protocols sit on top. <b>TCP</b> (Transmission Control Protocol) provides a reliable, ordered byte stream: it numbers bytes, acknowledges them, retransmits losses, controls the sending rate so a slow receiver isn't overwhelmed (<b>flow control</b>), and backs off when the network is congested (<b>congestion control</b>). <b>UDP</b> (User Datagram Protocol) sends independent datagrams with almost no extras: no connection setup, no retransmission, no ordering." },
        { t: "compare", items: [
          { title: "TCP", pros: ["Reliable, ordered delivery", "Built-in flow and congestion control", "Universally supported by proxies, firewalls and load balancers"], cons: ["1 RTT handshake before data", "Head-of-line blocking: one lost packet stalls all later bytes", "Connection state on both ends"], use: "Almost everything: HTTP/1.1 and HTTP/2, databases, Kafka, SSH, email." },
          { title: "UDP", pros: ["No handshake; send immediately", "No head-of-line blocking; late data can be skipped", "Small header (8 bytes vs 20+ for TCP)"], cons: ["Loss, duplication and reordering are the application's problem", "Some networks block or throttle it", "No built-in congestion control"], use: "DNS queries, voice and video calls, online games, and as the base for QUIC and HTTP/3." }
        ] },
        { t: "p", html: "<b>Head-of-line (HOL) blocking</b> means one stalled item holds up everything queued behind it. In TCP, if packet 5 is lost, packets 6 to 20 may have arrived, but the application can't read them until packet 5 is retransmitted, because TCP promises in-order bytes. For a file download that is fine. For a live voice call, a sample that arrives 300 ms late is useless, so real-time media uses UDP and conceals losses instead." },
        { t: "h", text: "The TCP and TLS handshakes" },
        { t: "p", html: "TCP opens a connection with a three-way handshake: <code>SYN</code>, <code>SYN-ACK</code>, <code>ACK</code>. <b>TLS</b> (Transport Layer Security, the S in HTTPS) then sets up encryption: the client says which cipher suites it supports and which host it wants (<b>SNI</b>, server name indication, so one IP can serve many certificates); the server sends its certificate, which the client verifies against trusted certificate authorities; and both derive shared session keys using an ephemeral Diffie-Hellman exchange. TLS 1.3 needs 1 RTT for this; the older TLS 1.2 needs 2." },
        { t: "diagram", caption: "A new HTTPS connection over TCP with TLS 1.3 costs three round trips before the response starts arriving.", code: `sequenceDiagram
  participant C as Client
  participant S as Server
  Note over C,S: TCP handshake, 1 RTT
  C->>S: SYN
  S-->>C: SYN-ACK
  C->>S: ACK
  Note over C,S: TLS 1.3 handshake, 1 RTT
  C->>S: ClientHello with key share and SNI
  S-->>C: ServerHello, certificate, Finished
  Note over C,S: Request, 1 RTT
  C->>S: Finished, then GET /feed
  S-->>C: 200 OK with the feed` },
        { t: "p", html: "Worked example: a user in London, a server in Virginia, RTT 80 ms. A fresh connection costs TCP (80) + TLS 1.3 (80) + request (80) = 240 ms before the first response byte, plus DNS. With TLS 1.2 it is 320 ms. Now put a CDN edge 10 ms away from the user that terminates TLS and keeps a warm, already-open connection to the origin: 10 + 10 + (10 + 80) = 110 ms. Same server, same code, less than half the latency." },
        { t: "numbers", items: [
          { value: "1 RTT", label: "TCP handshake" },
          { value: "1 RTT", label: "TLS 1.3 handshake (2 for TLS 1.2)" },
          { value: "0 RTT", label: "TLS 1.3 or QUIC resumption, for idempotent requests only" },
          { value: "~80 ms", label: "London to Virginia round trip" }
        ] },
        { t: "h", text: "Keep-alive and connection pooling" },
        { t: "p", html: "Because setup is expensive, connections should be reused. HTTP/1.1 connections are persistent (<b>keep-alive</b>) by default, so a browser sends many requests over the same connection. Between services, the same idea is a <b>connection pool</b>: an app server keeps, say, 20 open connections to PostgreSQL or to a downstream service and hands them out per request. Pools avoid handshake latency, avoid ephemeral port exhaustion, and keep the database from drowning in connection churn. PostgreSQL in particular uses one process per connection, which is why poolers like PgBouncer are common." },
        { t: "h", text: "HTTP/1.1, HTTP/2 and HTTP/3" },
        { t: "table", head: ["", "HTTP/1.1", "HTTP/2", "HTTP/3"], rows: [
          ["Transport", "TCP", "TCP", "QUIC over UDP"],
          ["Format", "Text headers", "Binary frames", "Binary frames"],
          ["Requests per connection", "One at a time; browsers open ~6 connections per host", "Many concurrent streams multiplexed on one connection", "Many independent streams"],
          ["Header compression", "None", "HPACK", "QPACK"],
          ["Head-of-line blocking", "At the HTTP level: a slow response blocks the connection", "Fixed at HTTP level, but one lost TCP packet stalls all streams", "Per stream only: a loss stalls just that stream"],
          ["Setup cost with TLS", "TCP + TLS: 2 RTT with TLS 1.3", "Same as HTTP/1.1", "1 RTT combined; 0 RTT on resumption"],
          ["Other", "Simple, universal", "Server push existed but is now largely abandoned", "Connections survive IP changes, e.g. Wi-Fi to cellular"]
        ] },
        { t: "diagram", caption: "HTTP/3 moves reliability and encryption into QUIC, which runs over UDP so that each stream recovers from loss independently.", code: `flowchart LR
  subgraph S1["HTTP/1.1 and HTTP/2"]
    A1["HTTP"] --> A2["TLS"] --> A3["TCP"] --> A4["IP"]
  end
  subgraph S2["HTTP/3"]
    B1["HTTP/3"] --> B2["QUIC<br/>streams, reliability, TLS 1.3"] --> B3["UDP"] --> B4["IP"]
  end` },
        { t: "p", html: "<b>QUIC</b> implements reliability, congestion control and encryption itself on top of UDP, and delivers each stream independently, so a lost packet only delays the streams whose data it carried. It identifies connections by a connection ID rather than the IP and port 5-tuple, so a phone moving from Wi-Fi to cellular keeps its connection. HTTP/3 helps most on lossy, high-latency networks such as mobile. Inside a data center, where loss is rare, HTTP/2 or HTTP/1.1 with pooling is usually fine." },
        { t: "callout", kind: "interview", title: "When the protocol matters in a design", html: "You rarely need to pick an HTTP version in an interview. It matters when you discuss mobile clients on poor networks (HTTP/3 helps), internal RPC (gRPC requires HTTP/2), or global latency (terminate TLS at an edge near the user and reuse connections to the origin)." }
      ]
    },
    {
      id: "api-styles",
      title: "API styles, HTTP methods and status codes",
      minutes: 12,
      blocks: [
        { t: "p", html: "An <b>API</b> is the contract between a client and a service. Three styles dominate system design discussions: REST, GraphQL and gRPC. They are not rivals for every job; each wins in a different place." },
        { t: "h", text: "REST" },
        { t: "p", html: "<b>REST</b> models the system as <b>resources</b> with URLs (<code>/users/42/orders</code>) and uses HTTP methods as the verbs. Responses are usually JSON. REST's strengths come from HTTP itself: it is understood by every language, tool and proxy, and <code>GET</code> responses can be cached by browsers and CDNs using <code>Cache-Control</code> and <code>ETag</code> headers. Its weakness is fixed response shapes: a mobile screen may need three calls (<b>under-fetching</b>), or receive fields it doesn't need (<b>over-fetching</b>)." },
        { t: "code", lang: "http", code: `GET /v1/users/42/orders?limit=20 HTTP/1.1
Host: api.shop.example
Accept: application/json

HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: private, max-age=30

{"orders": [{"id": "o_981", "total_cents": 4599, "status": "shipped"}],
 "next_cursor": "o_955"}` },
        { t: "h", text: "GraphQL" },
        { t: "p", html: "<b>GraphQL</b>, created at Facebook, exposes one endpoint and a typed schema. The client sends a query naming exactly the fields it wants, possibly across related objects, and gets them in one round trip. That suits mobile apps and many-screen frontends. The costs move to the server: each field has a resolver, and naive resolvers cause the <b>N+1 query problem</b> (one query for the list, then one per item), usually fixed by batching with a DataLoader. Arbitrary queries can be very expensive, so servers limit query depth and cost. Queries are typically POSTed to one URL, so ordinary HTTP caching doesn't work unless you use persisted queries over GET." },
        { t: "code", lang: "text", code: `query {
  user(id: 42) {
    name
    orders(last: 3) { id total status }
    recommendations(limit: 5) { title price }
  }
}` },
        { t: "h", text: "gRPC" },
        { t: "p", html: "<b>gRPC</b>, open-sourced by Google, is a remote procedure call framework. You define services and messages in a <code>.proto</code> file; tools generate client and server code in many languages; messages are encoded as compact binary <b>Protocol Buffers</b> and sent over HTTP/2. It supports unary calls and client, server and bidirectional streaming, and has deadlines built in. It shines for internal service-to-service traffic. Browsers can't speak native gRPC, so web clients need gRPC-Web through a proxy such as Envoy, and binary payloads are harder to inspect by hand." },
        { t: "code", lang: "text", code: `service OrderService {
  rpc GetOrder (GetOrderRequest) returns (Order);
  rpc WatchOrder (GetOrderRequest) returns (stream OrderEvent);
}
message GetOrderRequest { string order_id = 1; }` },
        { t: "compare", items: [
          { title: "REST", pros: ["Universal tooling; easy to debug with curl", "HTTP caching for GET at browsers and CDNs", "Simple mental model"], cons: ["Over- and under-fetching", "Many round trips for nested data", "Versioning and conventions vary by team"], use: "Public APIs, CRUD services, anything that benefits from HTTP caching." },
          { title: "GraphQL", pros: ["Client picks exactly the fields it needs", "One round trip for nested data", "Strongly typed schema and introspection"], cons: ["HTTP caching is harder", "N+1 resolvers and expensive queries need guarding", "More server complexity"], use: "Rich client apps with many screens and varied data needs; a backend-for-frontend layer." },
          { title: "gRPC", pros: ["Compact binary encoding, fast to parse", "Generated, typed clients in many languages", "Streaming and deadlines built in"], cons: ["No native browser support", "Not human-readable", "Requires HTTP/2 end to end, which some proxies handle poorly"], use: "Internal microservice calls with high QPS and tight latency budgets." }
        ] },
        { t: "h", text: "HTTP methods: safe and idempotent" },
        { t: "p", html: "A method is <b>safe</b> if it doesn't change server state. It is <b>idempotent</b> if sending the same request once or many times leaves the server in the same state. Idempotency is what makes retries safe: networks time out, and a client often can't tell whether the server processed the request." },
        { t: "table", head: ["Method", "Typical use", "Safe", "Idempotent"], rows: [
          ["GET", "Read a resource", "Yes", "Yes"],
          ["HEAD", "Read headers only, e.g. check existence or size", "Yes", "Yes"],
          ["POST", "Create a resource or trigger an action", "No", "No"],
          ["PUT", "Create or replace a resource at a known URL", "No", "Yes"],
          ["PATCH", "Partially update a resource", "No", "Not guaranteed"],
          ["DELETE", "Remove a resource", "No", "Yes"]
        ] },
        { t: "p", html: "PATCH is not guaranteed idempotent because “add 10 to the balance” changes state on every retry, while “set the email to x” would not. To make a POST safe to retry, clients send an <b>idempotency key</b> (a unique ID per logical operation, often in an <code>Idempotency-Key</code> header); the server stores the result under that key and returns the stored result on a repeat instead of acting twice. Chapter 11 covers this pattern in detail." },
        { t: "h", text: "Status codes worth knowing" },
        { t: "table", head: ["Code", "Meaning", "Typical case"], rows: [
          ["200 OK / 201 Created / 204 No Content", "Success", "Read succeeded / resource created / success with empty body"],
          ["301 / 302", "Moved permanently / temporarily", "301 can be cached by browsers; 302 cannot by default"],
          ["304 Not Modified", "Your cached copy is still valid", "Reply to a conditional GET with <code>If-None-Match</code>"],
          ["400 Bad Request", "Malformed or invalid input", "Missing required field"],
          ["401 Unauthorized", "Not authenticated", "Missing or expired token"],
          ["403 Forbidden", "Authenticated but not allowed", "User reads another user's private data"],
          ["404 Not Found / 409 Conflict", "No such resource / state conflict", "Unknown ID / duplicate username, version mismatch"],
          ["429 Too Many Requests", "Rate limited", "Return with a <code>Retry-After</code> header"],
          ["500 / 502 / 503 / 504", "Server error / bad upstream response / overloaded / upstream timeout", "502 and 504 typically come from a proxy or load balancer about its backend"]
        ] },
        { t: "callout", kind: "interview", title: "Default to REST, justify the exceptions", html: "A good default: REST for the public and mobile API, gRPC between internal services, and GraphQL only when many different clients need flexible shapes. Whatever you choose, mark which endpoints are idempotent and how retries are made safe; interviewers often probe that." }
      ]
    },
    {
      id: "real-time",
      title: "Real-time communication: polling, SSE, WebSockets, WebRTC",
      minutes: 13,
      blocks: [
        { t: "p", html: "Plain HTTP is request-response: the client asks, the server answers. Chat, live scores, notifications, collaborative editing and dashboards need the server to send data the moment something happens. There are five common techniques, from simplest to most capable." },
        { t: "h", text: "Short polling" },
        { t: "p", html: "The client asks “anything new?” on a fixed interval, say every 5 seconds. It is trivial to build and works everywhere, and responses can even be cached by a CDN. But most requests return nothing, latency averages half the interval, and the load scales with clients times frequency: 1 million clients polling every 5 seconds is 200,000 requests per second, mostly wasted." },
        { t: "h", text: "Long polling" },
        { t: "p", html: "The client sends a request and the server <b>holds it open</b> until there is new data or a timeout (often 20 to 30 seconds) passes. As soon as a response arrives, the client sends the next request. Updates arrive almost immediately, and it is still plain HTTP. Each message still costs a full request, and the server must hold many open requests cheaply, which suits event-driven servers (Node.js, Go, Nginx) better than thread-per-request ones." },
        { t: "diagram", caption: "Long polling: the server parks each request until there is data or the timeout passes, and the client immediately asks again.", code: `sequenceDiagram
  participant C as Client
  participant S as Server
  C->>S: GET /updates?since=41
  Note over S: Nothing new, hold up to 30 s
  S-->>C: 200 with event 42
  C->>S: GET /updates?since=42
  Note over S: Timeout reached, nothing new
  S-->>C: 204 No Content
  C->>S: GET /updates?since=42` },
        { t: "h", text: "Server-Sent Events (SSE)" },
        { t: "p", html: "With <b>SSE</b>, the client makes one HTTP request and the server keeps the response open, writing events as lines of text (<code>Content-Type: text/event-stream</code>). It is <b>one-way</b>: server to client. The browser's <code>EventSource</code> API reconnects automatically and sends a <code>Last-Event-ID</code> header so the server can resume where it left off. Because it is ordinary HTTP, it passes through most proxies and works well over HTTP/2. Over HTTP/1.1, browsers limit open connections to about 6 per host, which caps how many SSE streams a user can have open across tabs." },
        { t: "code", lang: "http", code: `GET /v1/matches/m77/stream HTTP/1.1
Accept: text/event-stream
Last-Event-ID: 1041

HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache

id: 1042
event: score
data: {"home": 2, "away": 1, "minute": 67}` },
        { t: "h", text: "WebSockets" },
        { t: "p", html: "A <b>WebSocket</b> starts as an HTTP request with an <code>Upgrade: websocket</code> header; the server answers <code>101 Switching Protocols</code>, and from then on the TCP connection carries small <b>bidirectional</b> frames with only 2 to 14 bytes of overhead each. This is the standard choice for chat, multiplayer games, collaborative editors and anything where the client also sends frequent messages. The price is that connections are long-lived and stateful: load balancers must support them, a message for user X must be routed to whichever server holds X's socket, and deploys must drain connections gracefully." },
        { t: "h", text: "WebRTC" },
        { t: "p", html: "<b>WebRTC</b> lets browsers and apps send audio, video and data <b>directly to each other</b>, usually over UDP, with very low latency. Peers first exchange connection details through a <b>signaling</b> server (often over a WebSocket), use <b>STUN</b> servers to discover their public addresses through NAT, and fall back to relaying through a <b>TURN</b> server when a direct path is impossible. Use it for calls and screen sharing, not for server-to-client notifications. Chapter 16 covers video conferencing at scale." },
        { t: "table", head: ["Technique", "Direction", "Latency", "Cost at scale", "Best for"], rows: [
          ["Short polling", "Client pulls", "Up to the poll interval", "Requests = clients ÷ interval, mostly empty", "Infrequent updates; very simple clients; CDN-cacheable data"],
          ["Long polling", "Client pulls, server holds", "Near real-time", "One held request per client plus a new request per message", "Fallback when streaming is blocked"],
          ["SSE", "Server to client", "Real-time", "One open HTTP response per client", "Feeds, scores, notifications, dashboards"],
          ["WebSocket", "Both ways", "Real-time", "One stateful TCP connection per client", "Chat, presence, games, collaboration"],
          ["WebRTC", "Peer to peer", "Lowest, via UDP", "Signaling, STUN and TURN servers; TURN relays carry full media", "Voice, video, screen sharing"]
        ] },
        { t: "p", html: "<b>What persistent connections cost at scale.</b> An idle connection costs memory (kernel socket buffers plus your application's per-connection state, from a few KB to tens of KB), one file descriptor, and periodic heartbeats to detect dead peers and keep NAT and load balancer mappings alive. A tuned server can hold hundreds of thousands of mostly idle connections. Worked example: 10 million concurrent users at 100,000 connections per server needs 100 servers before headroom; a heartbeat every 30 s means 10M ÷ 30 ≈ 333,000 pings per second across the fleet, which is tiny per server but not free." },
        { t: "diagram", caption: "With many connection servers, a message is published to a shared channel so the gateway holding the recipient's socket can deliver it.", code: `flowchart LR
  UA(("Client A")) -->|"WebSocket"| G1["Gateway 1"]
  UB(("Client B")) -->|"WebSocket"| G2["Gateway 2"]
  G1 -->|"publish to room 9"| PS[["Pub/sub<br/>Redis or Kafka"]]
  PS -->|"room 9 message"| G2
  G1 --> REG[("Connection registry<br/>user to gateway")]
  G2 --> REG` },
        { t: "callout", kind: "example", title: "WhatsApp's connection density", html: "In 2012 WhatsApp's engineering blog reported more than 2 million concurrent TCP connections on a single server, using Erlang on tuned FreeBSD. It shows that holding connections is not the hard part; routing messages between millions of them and surviving failures is." },
        { t: "callout", kind: "warn", title: "Reconnect storms", html: "If a gateway with 100,000 connections restarts, all 100,000 clients reconnect at once, each doing a TCP and TLS handshake and refetching state. Restart gateways one at a time with connection draining, and make clients reconnect with exponential backoff plus random jitter so the herd spreads out over seconds." }
      ]
    },
    {
      id: "proxies",
      title: "Forward proxies, reverse proxies, Nginx and Envoy",
      minutes: 8,
      blocks: [
        { t: "p", html: "A <b>proxy</b> is an intermediary that receives a request and makes it on someone else's behalf. The key question is: on whose behalf?" },
        { t: "p", html: "A <b>forward proxy</b> acts for <b>clients</b>. Clients are configured to send their traffic through it, and the destination server sees the proxy's IP rather than the client's. Companies use forward proxies to filter and log employees' outbound traffic, to cache downloads, or to give all outbound calls one fixed IP that partners can allowlist. A <b>reverse proxy</b> acts for <b>servers</b>. Clients think they are talking to the website; the reverse proxy receives the request and forwards it to one of the backend servers, which clients never see directly." },
        { t: "diagram", caption: "Same mechanism, opposite sides: a forward proxy hides and controls clients, a reverse proxy hides and protects servers.", code: `flowchart LR
  subgraph FW["Forward proxy acts for clients"]
    C1(("Employee laptop")) --> FP["Forward proxy"]
    C2(("Employee phone")) --> FP
    FP --> NET["Any site on the internet"]
  end
  subgraph RV["Reverse proxy acts for servers"]
    I(("Internet clients")) --> RP["Reverse proxy<br/>Nginx or Envoy"]
    RP --> B1["Backend 1"]
    RP --> B2["Backend 2"]
  end` },
        { t: "h", text: "What a reverse proxy does" },
        { t: "table", head: ["Function", "What it means"], rows: [
          ["Load balancing", "Spreads requests across healthy backends (Chapter 4)"],
          ["TLS termination", "Decrypts HTTPS once at the edge, so backends handle plain HTTP or re-encrypted internal traffic"],
          ["Routing", "Sends <code>/api/*</code> to one service and <code>/static/*</code> to another, by path, host or header"],
          ["Caching and compression", "Serves repeated responses from memory or disk; gzip or brotli compression"],
          ["Protection", "Rate limiting, request size limits, IP blocking; hides backend topology"],
          ["Buffering slow clients", "Reads a slow mobile upload fully before passing it on, so app workers aren't tied up"],
          ["Observability", "Access logs and metrics for every request in one place"]
        ] },
        { t: "code", lang: "text", code: `upstream api_backend {
    least_conn;
    server 10.0.1.11:8080;
    server 10.0.1.12:8080;
    keepalive 64;                  # reuse upstream connections
}
server {
    listen 443 ssl http2;
    server_name api.example.com;
    location /api/ {
        proxy_pass http://api_backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}` },
        { t: "p", html: "The Nginx config above terminates TLS on port 443, sends <code>/api/</code> traffic to two backends using least-connections balancing, and keeps a pool of idle upstream connections. Because backends see the proxy's IP, the proxy passes the original client IP in the <code>X-Forwarded-For</code> header." },
        { t: "compare", items: [
          { title: "Nginx", pros: ["Very fast event-driven web server and reverse proxy", "Excellent at static files, TLS termination and caching", "Huge ecosystem; simple config files"], cons: ["Open-source version reloads config from files rather than through a dynamic API", "Fewer built-in service-mesh features"], use: "Edge reverse proxy, static file server, simple load balancing and caching." },
          { title: "Envoy", pros: ["Built at Lyft for microservices; configured dynamically via its xDS APIs", "First-class HTTP/2 and gRPC, retries, circuit breaking, rich metrics and tracing", "The data plane behind Istio and many API gateways"], cons: ["More complex to configure by hand", "Usually needs a control plane to manage it"], use: "Sidecar proxy in a service mesh, gRPC-heavy internal traffic, dynamic API gateways." }
        ] },
        { t: "p", html: "HAProxy is another widely used high-performance load balancer and proxy. Load balancers, API gateways and service-mesh sidecars are all specialized reverse proxies; Chapters 4 and 11 cover them." },
        { t: "callout", kind: "interview", title: "Name what the proxy does for you", html: "Don't just draw an “Nginx” box. Say: “A reverse proxy tier terminates TLS, routes <code>/api</code> to the API service and <code>/ws</code> to the WebSocket gateways, enforces per-IP rate limits, and keeps keep-alive pools to the backends.” Each function is a decision the interviewer can see." }
      ]
    }
  ],
  takeaways: [
    "Typing a URL triggers: DNS lookup, TCP handshake, TLS handshake, HTTP request through a load balancer or reverse proxy to an app server, then rendering and fetching sub-resources.",
    "DNS is hierarchical and cached: recursive resolver, root, TLD, authoritative. The TTL trades lookup cost against how fast changes propagate.",
    "GeoDNS steers users to a nearby region but sees the resolver's location and is limited by caching; use load balancers for fine-grained balancing and fast failover.",
    "A fresh HTTPS connection costs about 3 RTTs with TLS 1.3 (TCP, TLS, request); reuse connections and terminate TLS near users to cut latency.",
    "HTTP/2 multiplexes streams on one TCP connection but still suffers TCP head-of-line blocking; HTTP/3 over QUIC fixes this and survives network changes.",
    "REST for public and cacheable APIs, gRPC for internal high-QPS calls, GraphQL for flexible client-driven data needs.",
    "GET, PUT and DELETE are idempotent; POST is not. Make POST retries safe with idempotency keys.",
    "Pick real-time transport by direction and scale: SSE for server-to-client streams, WebSockets for bidirectional, WebRTC for peer media, polling as the simple fallback.",
    "Persistent connections are cheap individually but stateful at scale: you need a registry or pub/sub to route messages, heartbeats, draining, and jittered reconnects.",
    "A forward proxy acts for clients; a reverse proxy acts for servers and handles TLS termination, routing, load balancing, caching and protection."
  ],
  mcqs: [
    {
      q: "Which DNS server holds the definitive A record for <code>www.example.com</code>?",
      options: [
        "The recursive resolver run by the user's ISP",
        "A root server such as <code>a.root-servers.net</code>",
        "The <code>.com</code> TLD server run by Verisign",
        "The authoritative nameserver for <code>example.com</code>"
      ],
      answer: 3,
      explain: "The authoritative nameserver holds the domain's records. Root and TLD servers only return referrals, and the recursive resolver merely caches answers it fetched from the authoritative server.",
      level: "easy"
    },
    {
      q: "Tomorrow you will move your site to a new IP address. The A record's TTL is 86,400 s. What should you do to minimize the time users hit the old IP?",
      options: [
        "Lower the TTL to 60 s at least a day ahead, then change the record",
        "Change the record tomorrow and set its TTL to 60 s at the same moment",
        "Change the record tomorrow and ask users to clear their browser caches",
        "Keep the TTL and add the new IP as a second A record next to the old one"
      ],
      answer: 0,
      explain: "Resolvers that cached the record before the change keep it for up to the old TTL, so lowering the TTL at switch time is too late. Lower it at least one old-TTL period in advance so caches already hold the short TTL when you switch.",
      level: "medium"
    },
    {
      q: "Your GeoDNS sends users in Sydney to your US region. All of them work for one company whose DNS resolver runs at headquarters in Chicago. Why?",
      options: [
        "GeoDNS uses the browser's language setting, which defaults to en-US",
        "Australian ISPs block DNS answers that point to Asia-Pacific regions",
        "GeoDNS sees the IP of the querying resolver, not of the user",
        "The TTL is too short, so the answer keeps flipping between regions"
      ],
      answer: 2,
      explain: "The authoritative server only sees the resolver's IP, so all users behind the Chicago resolver look like they are in Chicago. EDNS Client Subnet can pass part of the client's address, but only if the resolver supports and sends it.",
      level: "hard"
    },
    {
      q: "Which HTTP method is <b>idempotent but not safe</b>?",
      options: [
        "<code>GET</code>",
        "<code>POST</code>",
        "<code>PUT</code>",
        "<code>PATCH</code>"
      ],
      answer: 2,
      explain: "PUT changes state (not safe), but repeating it leaves the resource in the same final state (idempotent). GET is both safe and idempotent; POST is neither; PATCH isn't guaranteed to be idempotent.",
      level: "easy"
    },
    {
      q: "A mobile client sends <code>POST /payments</code> and the request times out. The client can't tell whether the charge happened. What makes a retry safe?",
      options: [
        "Retry with <code>PUT</code> instead of <code>POST</code>; the server then treats it as idempotent",
        "Send an idempotency key; the server returns the stored result for a repeat",
        "Raise the client timeout to 60 s so the response nearly always arrives",
        "Retry immediately three times; the database rejects exact duplicate rows"
      ],
      answer: 1,
      explain: "With an idempotency key, the server recognizes a repeat of the same logical operation and returns the original result instead of charging twice. Switching the verb doesn't change server behavior, longer timeouts only reduce the problem, and two separate charges aren't duplicate rows.",
      level: "medium"
    },
    {
      q: "A logged-in user requests another customer's private invoice, which they have no permission to see. Which status code fits best?",
      options: [
        "403 Forbidden",
        "401 Unauthorized",
        "400 Bad Request",
        "409 Conflict"
      ],
      answer: 0,
      explain: "403 means the caller is authenticated but not allowed. 401 means not authenticated (missing or invalid credentials). Some APIs return 404 instead to avoid revealing that the invoice exists.",
      level: "easy"
    },
    {
      q: "You moved a mobile API from HTTP/1.1 to HTTP/2. On lossy cellular networks, a single lost packet still delays many concurrent requests. What addresses this?",
      options: [
        "Turning on HTTP/2 server push so responses go out before requests",
        "Opening six HTTP/2 connections per host instead of one",
        "Lowering the DNS TTL so clients reconnect to a closer server",
        "Moving to HTTP/3, whose QUIC streams handle loss independently"
      ],
      answer: 3,
      explain: "HTTP/2 removes HTTP-level blocking, but all its streams share one TCP byte stream, so one loss stalls them all. QUIC delivers each stream independently over UDP, so a loss only delays the streams it carried. Extra connections only partly dilute the problem, and push and DNS are unrelated.",
      level: "medium"
    },
    {
      q: "The RTT between a user and your server is 80 ms. Ignoring DNS and server processing, how long until the first response byte arrives on a <b>new</b> HTTPS connection using TCP and TLS 1.3?",
      options: [
        "About 80 ms",
        "About 240 ms",
        "About 160 ms",
        "About 320 ms"
      ],
      answer: 1,
      explain: "TCP handshake (1 RTT) + TLS 1.3 handshake (1 RTT) + the request and response (1 RTT) = 3 × 80 = 240 ms. TLS 1.2 adds another round trip, giving 320 ms.",
      level: "medium"
    },
    {
      q: "Which workload is the best fit for UDP rather than TCP?",
      options: [
        "Uploading a 2 GB backup file to object storage",
        "Replicating database writes to a standby",
        "Sending live audio in a voice call",
        "Serving a JSON REST API to mobile apps"
      ],
      answer: 2,
      explain: "In a voice call, audio that arrives late is useless, so retransmission and in-order delivery only add delay; UDP lets the app skip lost samples. The other workloads need every byte delivered correctly and in order.",
      level: "easy"
    },
    {
      q: "A browser dashboard shows live stock prices. Data flows only from server to client, it must pass through corporate HTTP proxies, and it should reconnect automatically. What fits best?",
      options: [
        "WebRTC data channels between the browser and the server",
        "Server-Sent Events over a long-lived HTTP response",
        "Short polling a REST endpoint every 100 ms",
        "A raw TCP socket opened from JavaScript"
      ],
      answer: 1,
      explain: "SSE is one-way server-to-client streaming over ordinary HTTP, and EventSource reconnects automatically with <code>Last-Event-ID</code>. WebRTC is for peer media, 100 ms polling is wasteful, and browsers cannot open raw TCP sockets.",
      level: "medium"
    },
    {
      q: "Your long-polling endpoint holds requests for up to 120 s. Behind a cloud load balancer, many requests fail with 504 at exactly 60 s. What is the most likely fix?",
      options: [
        "Switch from long polling to short polling every 120 s",
        "Add more app servers so each one holds fewer requests",
        "Lower the DNS TTL so clients find a healthier server",
        "Return each held request after about 25–30 s, even if empty"
      ],
      answer: 3,
      explain: "The load balancer closes connections idle for longer than its timeout (60 s by default on AWS ALB) and returns 504. Long-poll timeouts should stay comfortably below every proxy timeout on the path; raising the LB timeout also works.",
      level: "hard"
    },
    {
      q: "You run 2 million WebSocket connections across 20 gateway servers. A deploy restarts all gateways at once, and the authentication service falls over. What is the best fix?",
      options: [
        "Roll the restart gradually and have clients reconnect with jittered backoff",
        "Switch clients to short polling every 10 s, which places no load on authentication",
        "Raise the heartbeat interval from 30 s to 5 minutes to cut reconnects",
        "Add a second load balancer to split the reconnect burst in half"
      ],
      answer: 0,
      explain: "Restarting everything at once causes 2 million simultaneous reconnects, each authenticating. Rolling restarts and jittered backoff spread reconnections over time. Polling would load auth on every request, heartbeats don't affect reconnect bursts, and a second load balancer still forwards every reconnect to auth.",
      level: "hard"
    },
    {
      q: "A company wants all employee web traffic to go through one point that blocks malware sites and logs requests. What is this?",
      options: [
        "A reverse proxy",
        "A forward proxy",
        "A CDN edge server",
        "An authoritative DNS server"
      ],
      answer: 1,
      explain: "A forward proxy acts on behalf of clients making outbound requests, so it can filter and log them. A reverse proxy and a CDN act on behalf of servers receiving inbound traffic.",
      level: "medium"
    },
    {
      q: "Nginx proxies 5,000 requests/s to a single backend IP and port, opening a new connection per request. It starts failing with “cannot assign requested address”. Why, and what fixes it?",
      options: [
        "The backend ran out of worker threads; add two more backend servers",
        "Nginx's DNS cache is full; increase the resolver cache size",
        "The TLS session cache is full; disable TLS on the upstream hop",
        "TIME_WAIT sockets exhaust ephemeral ports; use upstream keep-alive"
      ],
      answer: 3,
      explain: "Each closed connection holds its ephemeral port in TIME_WAIT for about 60 s: 5,000 × 60 = 300,000 needed, far above the ~28,000 default ports toward one destination. Upstream keep-alive pooling removes the churn.",
      level: "hard"
    },
    {
      q: "Dozens of internal services written in Go, Java and Python call each other at 200,000 requests/s in total, with tight latency budgets and some streaming calls. Which API style fits best?",
      options: [
        "gRPC with Protocol Buffers over HTTP/2",
        "GraphQL with one gateway endpoint per service",
        "REST with JSON over HTTP/1.1 and no connection reuse",
        "SOAP with XML schemas over HTTP/1.1"
      ],
      answer: 0,
      explain: "gRPC gives compact binary encoding, generated typed clients in every language, multiplexed HTTP/2 connections, deadlines and streaming. GraphQL targets flexible client queries, and JSON over HTTP/1.1 without reuse adds parsing and handshake costs.",
      level: "medium"
    }
  ],
  design: [
    {
      id: "design-live-scores",
      title: "Design a live sports score update service",
      level: "Medium",
      prompt: "Design the backend for a sports app that shows live scores for football, cricket and basketball matches. Scores come from an official data provider. When a goal or wicket happens, fans watching that match in the app or on the website should see it within about 2 seconds. A normal day has 2 million concurrent viewers; a big final can reach 10 million concurrent viewers, most of them watching that one match.",
      clarify: [
        "Is data only server-to-client, or do fans also send things such as reactions or predictions?",
        "How fresh must updates be: under 2 seconds end to end, or is 10 seconds acceptable?",
        "Which clients: browsers, native mobile apps, or both? Do backgrounded apps need notifications?",
        "How often does the provider send updates per match, and in what format?",
        "Do we show only the current score, or also a play-by-play commentary feed?",
        "What is the peak concurrency for a single match versus all matches?"
      ],
      hints: [
        "Compare the inbound rate (updates from the provider) with the outbound rate (messages to fans). Where is the real scale?",
        "Data only flows server to client. Which real-time technique is simplest for that?",
        "Compute the request rate if 10 million clients poll every 2 seconds. Is it feasible? What would it cost?",
        "A scoreboard is a tiny piece of state. What if every message, or every reconnect, simply carried the full current state with a version number?",
        "Think about what happens at the moment of a goal: who reconnects, and who suddenly opens the app?"
      ],
      solution: [
        { t: "h", text: "Requirements" },
        { t: "list", items: [
          "<b>Functional:</b> list live matches with current scores; open a match and see score, clock and key events update live; receive push notifications for followed teams' key events (goal, wicket, final result) when the app is in the background.",
          "<b>Non-functional:</b> provider-to-screen latency under 2 s at p95; 10M concurrent viewers at peak, up to 8M on one match; 99.95% availability during matches; updates never shown out of order (a score must not go backwards); low cost per viewer."
        ] },
        { t: "h", text: "Estimates" },
        { t: "code", lang: "text", code: `Inbound
  live matches at once:      up to ~500
  state changes:             ~1 per 10 s per match on average
  inbound rate:              500 / 10 = ~50 updates/s       (tiny)

Outbound
  big final: 8M viewers, 1 update per 10 s = 800k messages/s
  all viewers: 10M / 10 s = ~1M messages/s
  message size with SSE framing: ~300 B
  bandwidth: 1M x 300 B = 300 MB/s = ~2.4 Gbit/s

Connections
  plan 100k per fan-out server (100k x 30 KB = ~3 GB RAM)
  10M / 100k = 100 servers, +50% headroom = ~150 servers
  per server: 100k / 10 s = 10k writes/s

Polling alternative
  10M clients every 2 s = 5M requests/s at the CDN
  3-hour match: 5M x 10,800 s = 54 billion requests
  at ~$0.01 per 10k requests = ~$54,000 in request fees alone` },
        { t: "p", html: "Inbound is about 50 updates per second; outbound is about a million. The design is a fan-out problem: take a tiny stream of updates and copy each to millions of open connections quickly." },
        { t: "h", text: "API" },
        { t: "code", lang: "http", code: `GET  /v1/matches/live
     -> 200 [ { "match_id": "m77", "version": 1042, "home": 2, "away": 1 }, ... ]

GET  /v1/matches/{match_id}/stream        (Accept: text/event-stream)
     Last-Event-ID: 1041
     -> 200, then events: id: 1042  event: state  data: {full scoreboard}

GET  /v1/matches/{match_id}/snapshot      (fallback, Cache-Control: max-age=2)

PUT  /v1/users/me/follows/{team_id}       (push notifications for key events)

POST /internal/v1/provider/events         (provider webhook or feed adapter)` },
        { t: "h", text: "Data model" },
        { t: "table", head: ["Store", "Contents", "Why"], rows: [
          ["PostgreSQL", "<code>matches(match_id PK, sport, home_team, away_team, status, starts_at)</code>; <code>match_events(match_id, version, type, payload, created_at)</code>, PK <code>(match_id, version)</code>", "Durable history and schedules; low write rate"],
          ["Redis", "<code>snapshot:m77</code> → current scoreboard JSON with version", "Fast reads for new connections and the snapshot endpoint"],
          ["Kafka topic <code>match-updates</code>", "One message per state change, keyed by <code>match_id</code>", "Ordered per match; every fan-out server reads it"],
          ["PostgreSQL", "<code>follows(user_id, team_id)</code> plus device push tokens", "Who to notify for key events"]
        ] },
        { t: "h", text: "High-level design" },
        { t: "diagram", caption: "A tiny ingest stream is broadcast to every fan-out server, and each one copies the update to the thousands of fans connected to it.", code: `flowchart LR
  P["Data provider"] --> ING["Ingest service<br/>validate, assign version"]
  ING --> DB[("PostgreSQL<br/>matches and events")]
  ING --> R[("Redis snapshots")]
  ING --> K[["Kafka<br/>match-updates"]]
  K --> F1["Fan-out server 1<br/>SSE"]
  K --> F2["Fan-out server N<br/>SSE"]
  K --> NW["Notification workers"]
  NW --> PN["APNs and FCM"]
  LB["Load balancer"] --> F1
  LB --> F2
  FANS(("Fans")) --> LB
  CDN["CDN snapshot cache"] -.->|"fallback reads"| R` },
        { t: "p", html: "<b>Write path:</b> the ingest service receives a provider event, checks it, assigns the next per-match version number, writes the event and new snapshot, and publishes the full scoreboard to Kafka keyed by <code>match_id</code>, which keeps each match's updates in order. <b>Read path:</b> a fan opening a match connects through the load balancer to any fan-out server and opens an SSE stream. The server registers the connection under that <code>match_id</code> in a local in-memory map, sends the current snapshot immediately, then forwards each new update. Each fan-out server consumes the whole topic with its own consumer group (only about 50 messages per second) and drops updates for matches none of its clients watch. Notification workers send pushes for key events to followers' devices." },
        { t: "h", text: "Deep dives" },
        { t: "p", html: "<b>SSE vs WebSockets vs polling.</b> Data flows one way, so SSE is the simplest fit: plain HTTP, automatic reconnect with <code>Last-Event-ID</code>, and good behavior through proxies and over HTTP/2. WebSockets would also work and make sense if we later add reactions or chat. Polling a CDN-cached snapshot is the easiest to build and is our fallback for clients where streaming fails, but at 10M viewers polling every 2 s it means 5M requests per second and tens of thousands of dollars in request fees per match, versus about 150 fan-out servers for a few hours." },
        { t: "p", html: "<b>Ordering and reconnects.</b> Every message carries the full scoreboard (under 1 KB) and a per-match version. Clients ignore any message whose version is not newer than what they show, so a score never goes backwards even if messages are duplicated or reordered around a reconnect. On reconnect, the server compares the client's <code>Last-Event-ID</code> with the snapshot's version and sends the snapshot if the client is behind. No replay log is needed. A play-by-play commentary feed would need one, such as the last 200 events per match in a Redis list." },
        { t: "p", html: "<b>The goal moment.</b> Two surges arrive together. Push notifications bring millions of fans into the app within a minute: 2M new connections in 60 s is about 33,000 new TLS connections per second, which the load balancer tier must be sized for, and each needs a snapshot served from memory or Redis, never PostgreSQL. And if a fan-out server crashes, its 100,000 clients reconnect at once. The server sends an SSE <code>retry:</code> value with a random component, clients back off with jitter, and the load balancer spreads new connections across the remaining servers. Deploys drain one server at a time." },
        { t: "h", text: "Trade-offs and bottlenecks" },
        { t: "table", head: ["Decision", "Gain", "Cost"], rows: [
          ["SSE instead of WebSockets", "Simple, HTTP-native, auto reconnect", "One-way only; must switch if interactive features arrive"],
          ["Broadcast all updates to every fan-out server", "No routing tier; any fan can connect anywhere", "Wasteful at much higher inbound rates; would then partition by match"],
          ["Full-state messages with versions", "Idempotent, order-safe, trivial reconnect", "Slightly larger messages than deltas"],
          ["CDN polling as fallback only", "Works through any network", "Higher latency; expensive if most clients fall back"],
          ["Pushes only for key events", "Reaches backgrounded apps", "Push providers add seconds of delay and throttle bursts"]
        ] }
      ],
      followups: [
        "The provider occasionally sends a correction (a goal is disallowed). How do clients handle a score that legitimately goes down?",
        "Fans can now send emoji reactions that everyone watching sees. What changes?",
        "Inbound grows to 100,000 updates/s across many minor leagues. Is broadcasting to every fan-out server still OK?",
        "How do you measure the provider-to-screen latency in production?",
        "One region of your cloud provider fails during the final. What happens to the fans connected there?"
      ]
    },
    {
      id: "design-presence-typing",
      title: "Design a real-time “who's online” and typing indicator",
      level: "Medium",
      prompt: "A web-based team chat app wants two features: a green dot next to people who are online (and “last seen 5 min ago” for those who aren't), and a “Priya is typing…” indicator in a conversation. The app has 20 million daily active users and up to 5 million online at once. Users often have the app open in several tabs and on their phone.",
      clarify: [
        "How quickly must status change: when someone comes online, and when they leave?",
        "What does “online” mean with multiple tabs and devices, or an idle tab?",
        "How large can conversations and contact lists get: 2 people, 50, 10,000?",
        "Can users hide their status (invisible mode)?",
        "Is it acceptable to occasionally miss a typing indicator?",
        "Is there already a WebSocket connection for chat messages we can reuse?"
      ],
      hints: [
        "The client both sends (typing) and receives (presence, typing). Which connection type fits?",
        "If every client sends a heartbeat to a central store every 30 s, how many writes per second is that? Can the connection itself be the heartbeat?",
        "What if a whole gateway server dies? Do you need to write 100,000 “offline” records?",
        "Typing events are worthless after a few seconds. Do they need storage at all?",
        "A user with 2,000 contacts comes online. Who actually needs to know right now?"
      ],
      solution: [
        { t: "h", text: "Requirements" },
        { t: "list", items: [
          "<b>Functional:</b> show online, away or offline for users visible on screen; show “last seen” for offline users; show who is typing in the open conversation; support multiple tabs and devices per user; invisible mode.",
          "<b>Non-functional:</b> 5M concurrent users; coming online visible to others within ~2 s; going offline visible within ~30 s (a short delay avoids flicker); typing indicator latency p99 under 500 ms; best effort: a lost typing event is acceptable; presence must not overload the chat system."
        ] },
        { t: "h", text: "Estimates" },
        { t: "code", lang: "text", code: `Connections
  5M concurrent, ~1.5 connections each (tabs + phone) = ~7.5M sockets
  100k per gateway -> 75 gateways, ~110 with headroom

Naive heartbeats to a central store
  7.5M sockets / 30 s = 250k writes/s           (avoidable)

Connect / disconnect events instead
  20M DAU x ~10 sessions/day x 2 = 400M events/day
  400M / 86,400 s = ~4.6k/s average, ~15k/s peak

Typing
  ~10% of online users typing at any moment = 500k
  one typing event every 3 s while typing = ~170k events/s in
  ~3 recipients with the conversation open = ~500k deliveries/s

Presence state in Redis
  5M users x ~100 B = ~500 MB` },
        { t: "h", text: "API" },
        { t: "code", lang: "http", code: `GET /v1/realtime   (Upgrade: websocket, session cookie)  -> 101 Switching Protocols

  client sends  {"type": "presence.watch", "user_ids": ["u1", "u2", "u3"]}
  client sends  {"type": "typing", "conversation_id": "c9"}
  server sends  {"type": "presence", "user_id": "u1", "status": "online"}
  server sends  {"type": "typing", "conversation_id": "c9", "user_id": "u1", "ttl_ms": 5000}

GET /v1/presence?ids=u1,u2,u3
  -> 200 {"u1": {"status": "online"}, "u2": {"status": "offline", "last_seen": "..."}}

PUT /v1/users/me/settings   {"invisible": true}` },
        { t: "h", text: "Data model" },
        { t: "table", head: ["Key or table", "Contents", "Notes"], rows: [
          ["Redis <code>presence:{user_id}</code>", "Hash of <code>connection_id → gateway_id</code>, plus <code>away</code> flag", "Online if any connection's gateway is alive"],
          ["Redis <code>gw:{gateway_id}</code>", "Liveness lease, TTL 30 s, refreshed every 10 s", "One key covers all users on that gateway"],
          ["PostgreSQL <code>users.last_seen_at</code>", "Timestamp written when the last connection closes", "Durable “last seen”; low write rate"],
          ["Redis pub/sub channels", "<code>conv:{id}</code> for typing, <code>pres:{user_id}</code> for status changes", "Ephemeral; nothing is stored"]
        ] },
        { t: "h", text: "High-level design" },
        { t: "diagram", caption: "Gateways hold the sockets, record connects and disconnects in Redis, and relay typing and presence changes through pub/sub to whichever gateways have interested viewers.", code: `flowchart LR
  B(("Browsers and phones")) -->|"WebSocket"| LB["Load balancer"]
  LB --> G1["Gateway 1"]
  LB --> G2["Gateway 2"]
  G1 -->|"connect, disconnect, lease"| PR[("Redis<br/>presence and leases")]
  G2 -->|"connect, disconnect, lease"| PR
  G1 -->|"publish"| PS[["Redis pub/sub"]]
  G2 -->|"publish"| PS
  PS -->|"to subscribed gateways"| G1
  PS -->|"to subscribed gateways"| G2
  G1 -.->|"last seen on final disconnect"| DB[("PostgreSQL")]` },
        { t: "p", html: "<b>Coming online:</b> a client opens a WebSocket to any gateway. The gateway adds the connection to <code>presence:{user_id}</code>; if it is the user's first connection, it publishes “online” on <code>pres:{user_id}</code>. <b>Watching:</b> when a screen shows a member list, the client sends <code>presence.watch</code> with the visible user IDs; the gateway reads their current state in one batched Redis call and subscribes to those users' channels. <b>Typing:</b> the client sends a typing event; the gateway publishes it on <code>conv:{id}</code>; gateways with a member viewing that conversation receive it and forward it to those sockets." },
        { t: "h", text: "Deep dives" },
        { t: "p", html: "<b>Detecting offline without a heartbeat flood.</b> Gateways send WebSocket pings every 25 s and close sockets that miss two in a row; that local heartbeat never touches Redis. Each gateway refreshes one lease key, <code>gw:{id}</code>, every 10 s with a 30 s TTL. A user is online if any of their connections points at a gateway with a live lease. If a gateway crashes, its lease expires within 30 s and all its users read as offline, with zero per-user writes. A background sweeper later removes their stale connection entries. Central writes drop from about 250,000 per second to about 15,000 connect and disconnect events per second." },
        { t: "p", html: "<b>Multiple devices and flicker.</b> A user is online while any connection exists, and “away” only when every connection reports idle. When the last connection closes, wait a grace period of about 10 to 15 s before announcing “offline”, because page reloads and Wi-Fi to cellular handoffs reconnect quickly; if the user reconnects within the grace period, nothing is published. Write <code>last_seen_at</code> to PostgreSQL only when the user actually goes offline." },
        { t: "p", html: "<b>Typing is ephemeral and throttled.</b> The client sends at most one typing event every 3 s while keys are pressed, and a stop event when the message is sent or the input is cleared. Receivers show the indicator and hide it automatically 5 s after the last event, so a lost stop event fixes itself. Nothing is stored. Deliver typing only to members who currently have that conversation open, and in large channels collapse it to “several people are typing” after three names." },
        { t: "p", html: "<b>Presence fan-out.</b> Pushing every status change to every contact is the expensive part: 15,000 changes per second times hundreds of contacts each would be millions of messages per second. Pushing only to watchers of users visible on screen (a sidebar shows perhaps 30 to 50 people) cuts it by orders of magnitude. For a 10,000-member channel, show an online count and load individual statuses on demand. Invisible mode is enforced at the gateway: changes for an invisible user are published as “offline” to everyone else." },
        { t: "h", text: "Trade-offs and bottlenecks" },
        { t: "list", items: [
          "Gateway leases mean a crashed gateway's users show online for up to 30 s. That is the price of avoiding per-user heartbeat writes.",
          "The offline grace period trades accuracy (up to 15 s of false “online”) for no flicker during reconnects.",
          "Redis pub/sub is fire-and-forget: a gateway that is briefly disconnected misses events. Acceptable for typing; presence recovers on the next watch or reconnect.",
          "Watch-what-you-see keeps fan-out bounded but adds a batched presence read whenever the user scrolls to new people.",
          "Single Redis is a bottleneck at this scale; use Redis Cluster sharded by <code>user_id</code>, and shard pub/sub channels across nodes."
        ] }
      ],
      followups: [
        "How would you show a user's own status consistently across their phone and two browser tabs?",
        "Users in a 50,000-member community channel complain the member list is slow. What do you change?",
        "How do you ensure a user who blocked someone doesn't leak presence to them?",
        "The product wants “last active 3 minutes ago” for online-but-idle users. How do you track activity without a write per keystroke?",
        "Redis loses all presence data in a failover. How does the system recover, and what do users see?"
      ]
    }
  ]
};
