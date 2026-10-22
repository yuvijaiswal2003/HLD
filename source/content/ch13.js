module.exports = {
  id: "observability-security",
  num: 13,
  part: 5,
  title: "Observability and Security",
  tagline: "Know when your system is hurting users, and keep the wrong people out of it.",
  level: "Intermediate",
  lessons: [
    {
      id: "three-pillars",
      title: "Logs, metrics and traces",
      minutes: 11,
      blocks: [
        { t: "p", html: "<b>Monitoring</b> tells you that something you anticipated is wrong: error rate is up, the disk is full. <b>Observability</b> is the ability to answer questions you did not anticipate, such as \"why are checkouts from Android users in Brazil slow since 14:05?\", from the telemetry the system already emits. That telemetry comes in three forms, often called the three pillars: <b>logs</b>, <b>metrics</b> and <b>traces</b>. Each answers a different question, and a production system needs all three." },
        { t: "h", text: "Logs: what exactly happened" },
        { t: "p", html: "A log is a timestamped record of a discrete event. Write them as <b>structured</b> logs, one JSON object per line with consistent field names, not free-form text, so a log platform can filter and aggregate on fields without fragile regexes. Use levels deliberately: <code>DEBUG</code> (off in production by default), <code>INFO</code> (normal milestones), <code>WARN</code> (unexpected but handled), <code>ERROR</code> (a request or job failed), and <code>FATAL</code> (the process cannot continue)." },
        { t: "code", lang: "json", code: `{
  "ts": "2026-10-22T14:05:31.204Z",
  "level": "ERROR",
  "service": "checkout",
  "version": "2026.10.21-3",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "request_id": "req_7Hc91",
  "user_id": "u_8812",
  "route": "POST /v1/orders",
  "msg": "payment authorization failed",
  "psp": "adyen",
  "error_code": "PSP_TIMEOUT",
  "duration_ms": 2003
}` },
        { t: "list", items: [
          "<b>Correlation IDs:</b> generate a request ID (or use the trace ID) at the edge, pass it to every downstream call, and put it in every log line, so one search returns the whole story of a request across 15 services.",
          "<b>Never log secrets</b> (passwords, tokens, card numbers) and minimize personal data; logs are copied widely and kept for a long time.",
          "<b>Mind the volume:</b> 10,000 requests per second × 5 lines × 500 bytes = 25 MB/s, about 2.2 TB a day. Sample noisy success logs, keep all errors, and set retention by value.",
          "Ship logs to a central store such as Elasticsearch/OpenSearch, Loki or Splunk. Chapter 10 designs that pipeline."
        ] },
        { t: "h", text: "Metrics: how much and how fast" },
        { t: "p", html: "A metric is a numeric value sampled over time, identified by a name and a set of labels, for example <code>http_requests_total{service=\"checkout\", code=\"500\"}</code>. Metrics are cheap to store (a few bytes per sample after compression), fast to query and easy to aggregate across thousands of servers, which makes them the basis for dashboards and alerts. Prometheus, Datadog, CloudWatch and InfluxDB are common systems." },
        { t: "table", head: ["Type", "Behavior", "Examples", "How you use it"], rows: [
          ["Counter", "Only goes up; resets to zero on restart", "Requests served, errors, bytes sent", "Graph its rate: requests per second, errors per second"],
          ["Gauge", "Goes up and down; a current value", "Queue depth, memory in use, active connections, temperature", "Graph the value directly; alert on thresholds"],
          ["Histogram", "Counts observations into buckets, such as 0–50 ms, 50–100 ms", "Request latency, payload size", "Compute percentiles on the server; buckets from many instances can be summed"],
          ["Summary", "Client computes percentiles locally", "Latency in a single process", "Cheap per process, but percentiles cannot be combined across instances"]
        ] },
        { t: "p", html: "<b>Use percentiles, not averages, for latency.</b> If 1,000 requests are sorted by duration, p50 is the 500th, p99 the 990th. An average of 80 ms can hide 1% of users waiting 4 seconds. Two traps: you cannot average percentiles (the mean of ten servers' p99s is not the fleet's p99; merge histogram buckets instead), and tails compound under fan-out. If a page calls 100 backends and each is slow 1% of the time, <code>1 − 0.99^100 ≈ 63%</code> of page loads hit at least one slow call." },
        { t: "callout", kind: "warn", title: "Label cardinality kills metrics systems", html: "Every unique combination of label values is a separate time series. <code>method</code> (5) × <code>status</code> (10) × <code>endpoint</code> (50) × <code>instance</code> (200) is already 500,000 series. Add a <code>user_id</code> label with a million users and you have hundreds of billions, which no TSDB can hold. Put high-cardinality fields like user IDs in logs and traces, not metric labels." },
        { t: "p", html: "Two checklists tell you which metrics to collect. The <b>RED method</b> (Tom Wilkie) is for request-driven services: <b>Rate</b> (requests per second), <b>Errors</b> (failed requests per second) and <b>Duration</b> (latency distribution). The <b>USE method</b> (Brendan Gregg) is for resources such as CPUs, disks, network links and connection pools: <b>Utilization</b> (percent busy), <b>Saturation</b> (queued work that cannot be served yet) and <b>Errors</b>. Google SRE's <b>four golden signals</b> (latency, traffic, errors, saturation) combine the two." },
        { t: "h", text: "Traces: where the time went" },
        { t: "p", html: "A <b>distributed trace</b> follows one request through every service it touches. It is a tree of <b>spans</b>; each span is one unit of work (an HTTP handler, a SQL query, a cache call) with a trace ID, its own span ID, its parent's span ID, a start time, a duration and attributes. <b>Context propagation</b> makes this work: each service forwards the trace context to the next, over HTTP in the W3C <code>traceparent</code> header (version, 32-hex-digit trace ID, 16-hex-digit parent span ID, flags) and over Kafka or other queues in message headers. Instrument with <b>OpenTelemetry</b> and send spans to a backend such as Jaeger, Zipkin, Grafana Tempo or Honeycomb." },
        { t: "diagram", caption: "The trace ID stays the same across every hop while each service adds a child span pointing to its caller.", code: `flowchart LR
  C(("Client")) --> GW["API gateway<br/>span A, root"]
  GW -->|"traceparent: trace T1, parent A"| OS["Order service<br/>span B, parent A"]
  OS -->|"parent B"| DB[("PostgreSQL<br/>span C, parent B")]
  OS -->|"parent B"| PS["Payment service<br/>span D, parent B"]
  OS -.->|"trace context in message headers"| K[["Kafka"]]
  K -.-> EM["Email worker<br/>span E, parent B"]
  GW -.->|"export spans"| COL["OpenTelemetry collector"]
  COL --> TB[("Trace backend")]` },
        { t: "p", html: "Tracing every request is expensive, so you <b>sample</b>. <b>Head-based sampling</b> decides at the first hop (keep 1%) and passes the decision downstream in the trace flags: cheap, but it throws away 99% of the rare slow or failed requests you most want. <b>Tail-based sampling</b> buffers all spans of a trace in a collector and decides after the trace completes: keep every error and every request slower than p99, plus 1% of the rest. It costs more memory and infrastructure but keeps the interesting traces." },
        { t: "callout", kind: "interview", title: "How the pillars work together", html: "\"An alert fires on the checkout error-rate metric. The dashboard shows errors started at 14:05 on version 2026.10.21-3. A trace of a failed request shows 2 seconds spent in the payment-service span. Searching logs for that trace ID shows <code>PSP_TIMEOUT</code> from one processor.\" Metrics tell you <em>that</em> something is wrong, traces <em>where</em>, and logs <em>why</em>. Linking them by trace ID is the key design point." }
      ]
    },
    {
      id: "slos-alerting",
      title: "SLIs, SLOs, error budgets and alerting",
      minutes: 10,
      blocks: [
        { t: "p", html: "\"The system should be highly available\" is not a requirement anyone can test. Google's SRE practice turned it into three precise terms, and interviewers expect you to use them correctly." },
        { t: "table", head: ["Term", "What it is", "Example", "Who it is for"], rows: [
          ["<b>SLI</b>, service level indicator", "A measured ratio of good events to valid events", "Fraction of <code>GET /feed</code> requests answered with non-5xx in under 300 ms", "Engineers: the number on the dashboard"],
          ["<b>SLO</b>, service level objective", "A target for an SLI over a time window", "99.9% of feed requests are good, over a rolling 30 days", "The team: the bar you engineer and operate to"],
          ["<b>SLA</b>, service level agreement", "A contract with consequences if missed", "99.5% monthly availability or the customer gets a 10% service credit", "Customers and lawyers; set looser than the SLO"]
        ] },
        { t: "p", html: "Good SLIs measure what users experience, as close to them as possible: load balancer logs or client telemetry rather than a server's own view. Typical SLIs are <b>availability</b> (good requests / valid requests), <b>latency</b> (fraction of requests faster than a threshold, which is easier to reason about than a raw p99), <b>freshness</b> for pipelines (fraction of data updated within 5 minutes) and <b>durability</b> for storage. Exclude errors the client caused, such as most 4xx responses." },
        { t: "h", text: "Error budgets" },
        { t: "p", html: "The <b>error budget</b> is the unreliability the SLO allows: <code>1 − SLO</code>. For a 99.9% SLO the budget is 0.1%. An average month has 30.44 days × 1,440 = 43,830 minutes, so 0.001 × 43,830 ≈ <b>43.8 minutes</b> of full downtime a month (43.2 minutes if you use a 30-day window). For a request-based SLO the budget is a count: with 100 million requests a month, 99.9% allows <b>100,000</b> failed requests. A 20-minute incident at 50% errors uses 10 minutes' worth, about 23% of the month's budget." },
        { t: "table", head: ["SLO", "Budget per month (30.44 days)", "Budget per 30-day window", "Failed requests allowed at 100M requests/month"], rows: [
          ["99%", "≈ 7.3 hours", "7.2 hours", "1,000,000"],
          ["99.5%", "≈ 3.65 hours", "3.6 hours", "500,000"],
          ["99.9%", "≈ 43.8 minutes", "43.2 minutes", "100,000"],
          ["99.95%", "≈ 21.9 minutes", "21.6 minutes", "50,000"],
          ["99.99%", "≈ 4.4 minutes", "4.32 minutes", "10,000"]
        ] },
        { t: "p", html: "The budget turns reliability into a shared, spendable resource. While budget remains, the team ships features, runs experiments and does risky migrations. When it is spent, an agreed <b>error budget policy</b> applies: freeze non-critical releases and put engineers on reliability work until the window recovers. This ends the argument between \"ship faster\" and \"don't break things\" with data. Note also that 100% is the wrong target: users cannot tell 99.999% from 100% through their own flaky Wi-Fi, and each extra nine costs roughly 10x more (Chapter 12 shows how dependencies in series cap you anyway)." },
        { t: "h", text: "Alert on symptoms, not causes" },
        { t: "list", items: [
          "<b>Symptoms</b> are what users feel: error rate up, latency up, data stale. These page a human, because they mean the SLO is at risk.",
          "<b>Causes</b> are internal conditions: CPU at 90%, one replica down, a queue growing. Many are harmless (a node at 90% CPU serving fine), and others get missed because nobody wrote the alert. Show them on dashboards and file tickets; do not page on them.",
          "Exceptions: page on causes that predict an outage nobody will see coming from symptoms, such as a disk that will be full in 4 hours or a certificate that expires within a day (a cert 30 days from expiry is a ticket).",
          "<b>Every page must be urgent, user-impacting and actionable</b>, with a runbook link. A team that gets 50 pages a week stops reading them; this is alert fatigue."
        ] },
        { t: "h", text: "Burn-rate alerts" },
        { t: "p", html: "The naive alert \"error rate above 0.1% for 5 minutes\" pages on every small blip and is slow to catch large ones. Alert on <b>burn rate</b> instead: how fast you are spending the budget relative to the steady rate that would use it up exactly at the end of the window. A burn rate of 1 uses a 30-day budget in 30 days; a burn rate of 14.4 uses it in 720 / 14.4 = 50 hours, which means 2% of the budget in a single hour. The Google SRE Workbook recommends pairing a long window (to be significant) with a short window (so the alert stops soon after the problem does):" },
        { t: "table", head: ["Action", "Long window", "Short window", "Burn rate", "Budget consumed in long window"], rows: [
          ["Page", "1 hour", "5 minutes", "14.4", "2%"],
          ["Page", "6 hours", "30 minutes", "6", "5%"],
          ["Ticket", "3 days", "6 hours", "1", "10%"]
        ] },
        { t: "code", lang: "text", code: `# Page when checkout burns its 99.9% budget 14.4x too fast,
# measured over both the last 1 hour and the last 5 minutes.
(
  sum(rate(http_requests_total{job="checkout", code=~"5.."}[1h]))
  / sum(rate(http_requests_total{job="checkout"}[1h]))
) > (14.4 * 0.001)
and
(
  sum(rate(http_requests_total{job="checkout", code=~"5.."}[5m]))
  / sum(rate(http_requests_total{job="checkout"}[5m]))
) > (14.4 * 0.001)` },
        { t: "h", text: "Dashboards" },
        { t: "list", items: [
          "Top level: one SLO dashboard per user journey (sign-in, feed, checkout) showing SLI, target and budget remaining.",
          "Per service: RED metrics per endpoint, plus deploy markers so you can see whether a release lines up with a change.",
          "Per resource: USE metrics for databases, caches, queues and hosts, for drilling into causes.",
          "Keep dashboards as code (Grafana JSON or Terraform) in version control so they stay consistent across services."
        ] },
        { t: "callout", kind: "interview", title: "Bring SLOs into every design", html: "In the non-functional requirements, say \"99.9% of feed reads succeed in under 300 ms over 30 days, so about 43 minutes of budget a month.\" In the wrap-up, say what you would measure (RED per service, the SLI at the load balancer) and that you would page on burn rate, not CPU. It costs you 30 seconds and signals production experience." }
      ]
    },
    {
      id: "authn-sessions-jwt",
      title: "Authentication: sessions, tokens and JWT",
      minutes: 10,
      blocks: [
        { t: "p", html: "<b>Authentication (AuthN)</b> establishes who the caller is. <b>Authorization (AuthZ)</b> decides what that caller may do. HTTP reflects the split: <code>401 Unauthorized</code> really means unauthenticated (no valid credentials, so log in), while <code>403 Forbidden</code> means authenticated but not allowed. After the user proves their identity once, with a password, a passkey or a second factor, the system needs a way to recognize them on every later request. There are two families of answers." },
        { t: "h", text: "Server-side sessions" },
        { t: "p", html: "On login the server creates a session record (user ID, creation time, MFA status) in a shared store such as Redis, and gives the browser a long random <b>session ID</b> in a cookie. Every request does a lookup by session ID, which takes well under a millisecond in Redis. The ID itself means nothing, so stealing the database of IDs is the only way to forge one, and <b>revocation is instant</b>: delete the record. Protect the cookie with <code>HttpOnly</code> (scripts cannot read it), <code>Secure</code> (HTTPS only) and <code>SameSite=Lax</code> or <code>Strict</code> (not sent on most cross-site requests, which blocks CSRF)." },
        { t: "h", text: "Self-contained tokens: JWT" },
        { t: "p", html: "A <b>JSON Web Token (JWT)</b> carries the claims itself, so any service can verify it without a lookup. It has three base64url-encoded parts joined by dots: <code>header.payload.signature</code>. The header names the algorithm and key ID, the payload holds claims, and the signature is computed over the first two parts. With <b>HS256</b> (HMAC) the same secret signs and verifies, so every verifier could also mint tokens. With <b>RS256</b> or <b>ES256</b> the auth server signs with a private key and services verify with the public key, fetched from a JWKS endpoint and selected by <code>kid</code>. Prefer asymmetric algorithms when many services verify." },
        { t: "code", lang: "text", code: `header  = { "alg": "RS256", "typ": "JWT", "kid": "2026-10-k1" }
payload = {
  "iss": "https://auth.example.com",    issuer
  "sub": "user_8812",                   subject: who the token is about
  "aud": "https://api.example.com",     audience: who should accept it
  "iat": 1792674300,                    issued at
  "exp": 1792675200,                    expires 15 minutes later
  "scope": "mail.read calendar.write",
  "jti": "9f1c2e7a"                     unique token ID
}
token = b64url(header) + "." + b64url(payload) + "."
        + b64url(RS256_sign(private_key, b64url(header) + "." + b64url(payload)))` },
        { t: "list", items: [
          "Accept only the algorithms you expect (for example exactly RS256). Never accept <code>alg: none</code>, and never let the token's header pick between RSA and HMAC: a classic attack signs with HS256 using the server's <em>public</em> key as the HMAC secret.",
          "Verify the signature with the key matching <code>kid</code>, then check <code>iss</code>, <code>aud</code> and <code>exp</code>, allowing a small clock skew of about 30–60 seconds.",
          "Keep tokens small: they travel on every request, and a 4 KB token adds real bandwidth at 100k requests per second."
        ] },
        { t: "callout", kind: "warn", title: "A JWT is signed, not encrypted", html: "Anyone holding the token can base64-decode the payload and read it. Never put secrets or sensitive personal data in claims. The signature only proves the claims were not modified. In browsers, avoid storing tokens in <code>localStorage</code>, where any XSS can steal them; a backend-for-frontend that keeps tokens server side and gives the browser an <code>HttpOnly</code> session cookie is the safer pattern." },
        { t: "compare", items: [
          { title: "Server-side sessions", pros: ["Instant revocation: delete the record", "Small opaque cookie; nothing to leak in it", "Session data can change without reissuing anything"], cons: ["A store lookup on every request", "The session store is a shared dependency that must be highly available", "Awkward across many domains and for non-browser clients"], use: "Classic web apps on one domain, and anywhere instant logout and revocation matter." },
          { title: "JWT access tokens", pros: ["Verified locally with a public key: no lookup, scales with services", "Works across services, domains, mobile and APIs", "Carries identity and scopes to every hop"], cons: ["Cannot be revoked before expiry without extra machinery", "Claims go stale (a removed role stays in the token until it expires)", "Easy to get verification wrong"], use: "APIs and microservices, with short lifetimes (5–15 minutes) and revocable refresh tokens." }
        ] },
        { t: "h", text: "The revocation problem" },
        { t: "p", html: "If a JWT is valid until <code>exp</code> and nobody checks a database, a stolen token or a fired employee's token keeps working until it expires. The standard answer combines a short-lived <b>access token</b> (5–15 minutes) with a long-lived, opaque, server-side <b>refresh token</b> that can be revoked. Revocation then takes effect within one access-token lifetime. When that is too slow, add a check:" },
        { t: "table", head: ["Strategy", "How it works", "Revocation delay", "Cost"], rows: [
          ["Short access token + refresh token", "Client trades the refresh token for a new access token every few minutes; revoke the refresh token", "Up to the access-token lifetime, such as 15 min", "Refresh traffic to the auth server"],
          ["Denylist by <code>jti</code> or session ID", "Revoked IDs go into Redis with a TTL equal to the remaining lifetime; verifiers check it", "Seconds", "A lookup per request, but a small dataset"],
          ["Per-user token version", "Store <code>min_issued_at</code> per user; tokens issued earlier are rejected", "Seconds", "A per-user lookup, often cacheable"],
          ["Rotate the signing key", "Remove the key from JWKS so every token signed with it fails", "Minutes, as caches refresh", "Logs out everyone; emergencies only"]
        ] },
        { t: "diagram", caption: "Refresh token rotation: each refresh token works once, so a replayed old token reveals theft.", code: `sequenceDiagram
  participant C as Client
  participant API as Resource API
  participant Auth as Auth server
  C->>API: request with access token
  API-->>C: 401 token expired
  C->>Auth: refresh with refresh token R1
  Auth->>Auth: R1 valid and unused, mark it used
  Auth-->>C: new access token plus refresh token R2
  C->>API: retry with new access token
  API-->>C: 200 OK
  Note over Auth: if R1 is presented again, revoke the whole token family` },
        { t: "callout", kind: "interview", title: "The expected answer", html: "\"Short-lived JWT access tokens verified locally at each service, opaque refresh tokens stored server side with rotation and reuse detection, and a small Redis denylist of session IDs for urgent revocation, checked at the gateway.\" Saying out loud that JWTs trade revocability for scalability is what interviewers listen for." }
      ]
    },
    {
      id: "oauth-oidc-sso",
      title: "OAuth 2.0, OpenID Connect and single sign-on",
      minutes: 12,
      blocks: [
        { t: "p", html: "<b>OAuth 2.0</b> solves delegated access: letting an app act on your behalf at another service without giving it your password. A calendar app can read your Google contacts because Google issued it an <b>access token</b> limited to specific <b>scopes</b>, not because you typed your Google password into it. OAuth has four roles: the <b>resource owner</b> (the user), the <b>client</b> (the app requesting access), the <b>authorization server</b> (issues tokens after the user logs in and consents, such as Okta, Auth0, Keycloak or Google) and the <b>resource server</b> (the API that accepts the tokens)." },
        { t: "h", text: "Authorization code flow with PKCE" },
        { t: "p", html: "The browser is sent to the authorization server, the user logs in there, and the browser comes back to the app with a short-lived, single-use <b>authorization code</b>. The app then exchanges the code for tokens in a direct back-channel request. Tokens never pass through the URL bar or browser history. <b>PKCE</b> (Proof Key for Code Exchange, pronounced \"pixy\") closes the remaining hole: before starting, the client makes a random secret <code>code_verifier</code> and sends only its SHA-256 hash, the <code>code_challenge</code>. At the token step it must present the verifier itself." },
        { t: "diagram", caption: "The code travels through the browser, but only the client that holds the code verifier can exchange it for tokens.", code: `sequenceDiagram
  participant U as User browser
  participant App as Client app
  participant Auth as Authorization server
  participant API as Resource server
  U->>App: click Sign in
  App->>App: make code_verifier, code_challenge = SHA256 of it, and state
  App-->>U: redirect to Auth authorize with code_challenge and state
  U->>Auth: authorize request
  Auth->>U: login page, MFA and consent
  U->>Auth: credentials and consent
  Auth-->>U: redirect to callback with code and state
  U->>App: callback with code and state
  App->>App: check state matches
  App->>Auth: POST token with code and code_verifier
  Auth->>Auth: check SHA256 of verifier equals stored challenge
  Auth-->>App: access token, refresh token, ID token
  App->>API: GET data with Bearer access token
  API-->>App: 200 data` },
        { t: "code", lang: "python", code: `import base64, hashlib, secrets

def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

code_verifier = b64url(secrets.token_bytes(32))          # 43 chars, kept by the client
code_challenge = b64url(hashlib.sha256(code_verifier.encode()).digest())
state = secrets.token_urlsafe(16)                         # CSRF protection for the callback

# step 1: redirect with code_challenge, code_challenge_method=S256, state
# step 2: POST /token with code and code_verifier; server recomputes the hash` },
        { t: "p", html: "Why it matters: on mobile and desktop, another app can register the same custom URL scheme and intercept the redirect carrying the code; in browsers, codes can leak through logs or referrer headers. Without PKCE, whoever holds the code can redeem it. With PKCE, the attacker also needs the verifier, which never left the client, and the hash in the request does not reveal it. PKCE was designed for <b>public clients</b> (single-page apps, mobile and desktop apps, which cannot keep a client secret), and current guidance (the OAuth security best current practice, RFC 9700, and the OAuth 2.1 draft) requires it for public clients and recommends it for confidential server-side clients too, so just use it everywhere. Two more rules: the <code>state</code> parameter ties the callback to the session that started the flow (preventing login CSRF), and the server must match the <code>redirect_uri</code> exactly against a registered value." },
        { t: "table", head: ["Grant type", "Use it for", "Notes"], rows: [
          ["Authorization code + PKCE", "Any app with a user: web, SPA, mobile, desktop", "The default; use the system browser for native apps, not an embedded webview"],
          ["Client credentials", "Service-to-service calls with no user", "The service authenticates with its own secret, key or mTLS certificate"],
          ["Device authorization", "TVs, CLIs, devices without a good keyboard", "User approves on a phone by entering a short code"],
          ["Refresh token", "Getting a new access token without a new login", "Rotate on use; revoke on logout or password change"],
          ["Implicit, password grant", "Nothing new", "Deprecated by current security guidance and left out of the OAuth 2.1 draft"]
        ] },
        { t: "h", text: "OpenID Connect: adding identity" },
        { t: "p", html: "OAuth by itself is about <em>authorization</em>: an access token says \"the bearer may read mail\", not who the user is. <b>OpenID Connect (OIDC)</b> is a thin identity layer on top. The client adds the <code>openid</code> scope and receives an <b>ID token</b>: a JWT whose audience is the client, with <code>sub</code> (a stable user ID), <code>iss</code>, <code>exp</code>, <code>auth_time</code> and the <code>nonce</code> the client sent (which prevents replaying an old ID token). OIDC also standardizes a <code>/userinfo</code> endpoint, a discovery document at <code>/.well-known/openid-configuration</code> and the JWKS endpoint for signing keys." },
        { t: "callout", kind: "warn", title: "ID token and access token are not interchangeable", html: "The <b>ID token</b> tells the client who logged in; it is meant to be read by the client and nothing else. The <b>access token</b> is meant for an API and should carry that API in its <code>aud</code> claim. An API that accepts ID tokens as credentials, or that accepts any token without checking <code>aud</code>, can be fooled with a token that was issued for a different app." },
        { t: "h", text: "Single sign-on" },
        { t: "p", html: "<b>Single sign-on (SSO)</b> lets a user log in once and then use many apps. It falls out of the flow above. The authorization server, now called the <b>identity provider (IdP)</b>, sets its own session cookie on its domain at the first login. When a second app redirects the user to the IdP, the IdP sees that session and immediately issues a code with no password prompt. Enterprises use <b>SAML 2.0</b> (XML assertions, older and very common in enterprise SaaS) or <b>OIDC</b> (JSON and JWT, the modern default). IdPs can also <b>federate</b>: your IdP trusts a customer's Okta or Microsoft Entra ID, so their employees sign in with their corporate account." },
        { t: "diagram", caption: "The second app gets tokens without a login prompt because the IdP already has a valid session cookie.", code: `sequenceDiagram
  participant U as Browser
  participant Cal as Calendar app
  participant IdP as Identity provider
  U->>Cal: open calendar, no app session yet
  Cal-->>U: redirect to IdP authorize with PKCE challenge
  U->>IdP: authorize request plus IdP session cookie
  Note over IdP: session valid, MFA done 2 hours ago
  IdP-->>U: redirect to callback with code, no prompt
  U->>Cal: callback with code
  Cal->>IdP: exchange code and code_verifier
  IdP-->>Cal: ID token and access token
  Cal-->>U: set calendar session cookie` },
        { t: "callout", kind: "interview", title: "Keep the vocabulary straight", html: "Say \"OIDC for login and SSO, OAuth access tokens for APIs, authorization code with PKCE for every user-facing client, client credentials or mTLS for service-to-service.\" Mention the <code>state</code> and <code>nonce</code> parameters and exact redirect URI matching if asked about security. Mixing up OAuth (authorization) with authentication is the most common slip." }
      ]
    },
    {
      id: "authorization-models",
      title: "Authorization models: RBAC, ABAC and ReBAC",
      minutes: 9,
      blocks: [
        { t: "p", html: "Once you know who the caller is, every request asks: may <em>this subject</em> perform <em>this action</em> on <em>this resource</em>? Two principles apply regardless of model: <b>default deny</b> (no rule means no access) and <b>least privilege</b> (grant the minimum needed). The models differ in how they express rules." },
        { t: "h", text: "RBAC: role-based access control" },
        { t: "p", html: "Permissions attach to roles, and users get roles: <code>admin</code> can do everything, <code>editor</code> can write articles, <code>viewer</code> can read. It is simple to understand and to audit (\"who has admin?\"), and it covers most internal tools and B2B products. Its failure mode is <b>role explosion</b>: when access depends on context (\"editor, but only for the EMEA region's documents\"), teams create <code>emea-editor</code>, <code>apac-editor</code> and so on until there are thousands of roles nobody understands." },
        { t: "h", text: "ABAC: attribute-based access control" },
        { t: "p", html: "Policies are rules over attributes of the subject, resource, action and environment: \"allow <code>read</code> if <code>user.department == doc.department</code> and <code>doc.classification != secret</code> and the request comes from a managed device.\" ABAC handles context without role explosion and is how AWS IAM condition keys work. Policy engines such as <b>Open Policy Agent</b> (Rego) and AWS <b>Cedar</b> let you keep policies as code, separate from the application. The cost: it is hard to answer \"who can access this document?\" because the answer depends on evaluating rules against every user's attributes." },
        { t: "h", text: "ReBAC: relationship-based access control" },
        { t: "p", html: "In collaborative products, access follows relationships: Alice can edit a document because she is in a team that is an editor of the folder that contains the document. <b>ReBAC</b> stores those relationships as a graph and answers checks by walking it. Google described its system, <b>Zanzibar</b>, in a 2019 paper; it stores relation tuples of the form <code>object#relation@subject</code> and a schema of rewrite rules that derive permissions from relations." },
        { t: "code", lang: "text", code: `# relation tuples  (object#relation@subject)
doc:q4-plan#parent@folder:roadmap
folder:roadmap#editor@team:eng#member
team:eng#member@user:alice
doc:q4-plan#viewer@user:bob

# schema: rules that derive permissions
doc.edit = doc.editor  OR  parent.editor
doc.view = doc.viewer  OR  doc.edit  OR  parent.viewer

check(doc:q4-plan, edit, user:alice) -> ALLOWED  (alice -> team:eng -> folder:roadmap -> doc)
check(doc:q4-plan, edit, user:bob)   -> DENIED   (bob is only a viewer)` },
        { t: "diagram", caption: "A check walks the relationship graph: Alice reaches edit on the document through her team and the parent folder.", code: `flowchart LR
  Alice(("alice")) -->|"member of"| Team["team eng"]
  Team -->|"editor of"| Folder["folder roadmap"]
  Folder -->|"parent of"| Doc["doc q4-plan"]
  Bob(("bob")) -->|"viewer of"| Doc
  Doc -.->|"alice can edit, bob can only view"| Result["Check result"]` },
        { t: "p", html: "The paper reports Zanzibar serving Google Drive, YouTube, Calendar, Cloud and other products, with trillions of tuples, millions of checks per second and p95 latency under 10 ms. One subtle design point is the <b>new enemy problem</b>: if you remove Bob from a folder and then add a secret document to it, a stale replica must not let Bob see the new document. Zanzibar solves this with consistency tokens (\"zookies\") that tie a check to a snapshot at least as new as the content change. Open-source implementations include <b>SpiceDB</b> and <b>OpenFGA</b>." },
        { t: "table", head: ["Model", "Rules expressed as", "Strengths", "Weaknesses", "Typical fit"], rows: [
          ["RBAC", "User → role → permission", "Simple, auditable, fast", "Role explosion when context matters", "Admin consoles, internal tools, B2B seat roles"],
          ["ABAC", "Policies over attributes", "Context-aware: time, device, department, data classification", "Hard to audit and to list who has access", "Enterprise and compliance rules, cloud IAM"],
          ["ReBAC", "Relationship graph plus rewrite rules", "Natural for sharing, nesting and inheritance; can answer who has access", "Needs a dedicated, consistent, low-latency service", "Docs and files, chat channels, social and multi-tenant SaaS"]
        ] },
        { t: "h", text: "Where to enforce" },
        { t: "list", items: [
          "<b>Gateway:</b> coarse checks only: the token is valid, unexpired, for this audience and carries the needed scope.",
          "<b>Service:</b> fine-grained, per-resource checks, because only the service knows which document or order is involved. Call the authorization service or evaluate a local policy.",
          "<b>Lists and search:</b> filter results by permission (\"list documents Alice can see\") rather than checking after fetching thousands of rows; ReBAC systems offer list or lookup APIs for this.",
          "<b>Caching:</b> cache decisions briefly, and accept that a revoked permission may linger for that TTL, or use consistency tokens.",
          "<b>Audit:</b> log every denied request and every change to roles or relationships."
        ] },
        { t: "callout", kind: "interview", title: "Pick the model from the product", html: "For a Google Docs-, Slack- or Dropbox-style design, say \"ReBAC, Zanzibar-style: tuples for owner, editor and viewer, inheritance from folders, a check API with p99 under 10 ms, and consistency tokens for the new enemy problem.\" For an admin console, RBAC is enough, and saying so shows judgment. Many real systems combine them: RBAC for org roles plus ReBAC for sharing." }
      ]
    },
    {
      id: "encryption-secrets",
      title: "Encryption, secrets and password storage",
      minutes: 9,
      blocks: [
        { t: "p", html: "Data must be protected in two states: <b>in transit</b> across networks and <b>at rest</b> on disks, in databases, in backups and in object storage. On top of that come the secrets that unlock everything (keys, database passwords, API tokens) and the one kind of data you should never be able to read back: user passwords." },
        { t: "h", text: "In transit: TLS and mTLS" },
        { t: "p", html: "Use <b>TLS 1.3</b> (Chapter 2 covers the handshake) for all external traffic, typically terminated at the load balancer or CDN. Internal traffic used to be plain text inside a \"trusted\" network; modern <b>zero-trust</b> designs encrypt it too, because an attacker who gets onto the network should not be able to read or forge service calls. <b>Mutual TLS (mTLS)</b> has both sides present certificates, so the server also authenticates the client service. Doing this by hand is painful; a service mesh such as Istio or Linkerd issues short-lived certificates (hours, rotated automatically) to sidecars and gives each workload an identity, often in SPIFFE format, that authorization policies can reference." },
        { t: "h", text: "At rest: KMS and envelope encryption" },
        { t: "p", html: "At rest, encryption happens at several layers: full-disk or volume encryption (protects against stolen disks), database or storage-service encryption (S3 server-side encryption, transparent data encryption in databases), and <b>application-level or field-level encryption</b> for the most sensitive fields, which also protects against someone with database access. The hard part is not the cipher (AES-256-GCM is the default) but the keys. A <b>key management service</b> (AWS KMS, Google Cloud KMS, Azure Key Vault, HashiCorp Vault) keeps master keys inside the service, backed by hardware security modules in AWS KMS and in the HSM tiers of the others, never exports them, enforces IAM on every use and logs every operation. The pattern for using it is <b>envelope encryption</b>." },
        { t: "diagram", caption: "Envelope encryption: bulk data is encrypted locally with a data key, and only that small key is wrapped by the KMS master key.", code: `flowchart LR
  App["App server"] -->|"1. generate data key"| KMS["KMS<br/>master key stays in HSM"]
  KMS -->|"2. plaintext DEK plus DEK wrapped by master key"| App
  App -->|"3. encrypt data locally with DEK, AES-256-GCM"| CT["Ciphertext"]
  CT -->|"4. store ciphertext with wrapped DEK"| S3[("Object store or DB")]
  App -.->|"5. to read: send wrapped DEK to KMS to unwrap"| KMS` },
        { t: "list", items: [
          "<b>Performance and limits:</b> gigabytes are encrypted locally at memory speed; only a 32-byte key goes to KMS. KMS APIs are rate limited and accept only small payloads (AWS KMS encrypts at most 4 KB directly).",
          "<b>Rotation:</b> rotating the master key means re-wrapping data keys, not re-encrypting petabytes.",
          "<b>Blast radius:</b> one data key per object, tenant or file limits what a single leaked key exposes.",
          "<b>Crypto-shredding:</b> delete a tenant's key and all their data, including copies in backups, becomes unreadable. This is a practical way to honor deletion requests.",
          "<b>Audit:</b> every unwrap is an authorized, logged KMS call, so you can see who decrypted what."
        ] },
        { t: "h", text: "Secrets management" },
        { t: "list", items: [
          "No secrets in source code, git history, container images or plain config files. Scanners such as GitHub secret scanning exist because leaked keys are found and abused within minutes.",
          "Store them in a secrets manager (HashiCorp Vault, AWS Secrets Manager, Google Secret Manager) and fetch them at startup or through a sidecar, with access controlled per service.",
          "Prefer <b>workload identity</b> over static keys: IAM roles for compute instances or Kubernetes service accounts give short-lived credentials automatically.",
          "Use <b>dynamic secrets</b> where possible: Vault can mint a database user that expires in an hour, so a leaked credential dies on its own.",
          "Rotate regularly and make rotation boring, so an emergency rotation is not the first time you try it."
        ] },
        { t: "h", text: "Storing passwords" },
        { t: "p", html: "Never store passwords in plain text or with reversible encryption: you only ever need to <em>verify</em> a password, so store a <b>one-way hash</b>. Fast hashes such as MD5 or SHA-256 are the wrong tool, because a single modern GPU computes billions of SHA-256 hashes per second and cracks most leaked human passwords quickly. Use a deliberately slow, <b>salted</b>, tunable password hash. A unique random <b>salt</b> per user, stored next to the hash, means identical passwords produce different hashes and precomputed rainbow tables are useless. Tune the cost so one hash takes tens of milliseconds on your servers: invisible at login, ruinous for an attacker making billions of guesses." },
        { t: "table", head: ["Algorithm", "Verdict", "Notes"], rows: [
          ["MD5, SHA-1, SHA-256 (even salted)", "Never for passwords", "Designed to be fast; GPUs try billions of guesses per second"],
          ["PBKDF2-HMAC-SHA256", "Acceptable, needed for FIPS", "Needs very high iterations (OWASP suggests 600,000); not memory-hard, so GPUs still help"],
          ["bcrypt", "Good, widely available", "Cost factor 10 or more; only the first 72 bytes of the password are used"],
          ["scrypt", "Good", "Memory-hard, which blunts GPU and ASIC attacks"],
          ["Argon2id", "Preferred for new systems", "Variant of Argon2, winner of the 2015 Password Hashing Competition; memory-hard; OWASP minimum is about 19 MiB memory, 2 iterations"]
        ] },
        { t: "callout", kind: "warn", title: "Do not invent crypto", html: "Use TLS libraries, KMS envelope encryption and standard password hashes as designed. Hand-rolled schemes (\"we XOR with a secret\", \"we SHA-256 the password twice\", reusing a nonce with AES-GCM) are where real breaches come from. Add rate limiting and MFA on login, and a hash will rarely be your last line of defense." },
        { t: "callout", kind: "interview", title: "One-sentence security posture", html: "\"TLS everywhere with mTLS between services through the mesh, encryption at rest with KMS-managed keys using envelope encryption, per-tenant data keys so we can crypto-shred, secrets in Vault with workload identity, and passwords hashed with Argon2id.\" Each phrase invites a follow-up you can answer." }
      ]
    },
    {
      id: "attacks-defenses",
      title: "Common attacks and defenses",
      minutes: 10,
      blocks: [
        { t: "p", html: "System design interviews rarely go deep on exploits, but they expect you to recognize the classic attacks, know the standard defense for each, and place those defenses in the architecture. Most of these attacks share a root cause: the system treats untrusted input as code, or trusts a request because of where it came from." },
        { t: "h", text: "SQL injection" },
        { t: "p", html: "If user input is concatenated into a SQL string, an attacker can change the query itself. The defense is <b>parameterized queries</b> (prepared statements), where the driver sends the SQL and the values separately so input can never become syntax. ORMs do this by default. Add defense in depth: the app's database user gets only the privileges it needs, so even a successful injection cannot <code>DROP</code> tables or read other schemas." },
        { t: "code", lang: "python", code: `# Vulnerable: input becomes part of the SQL text
cur.execute("SELECT id, name FROM users WHERE email = '" + email + "'")
# email = "x' OR '1'='1"  -> returns every user

# Safe: placeholder; the value is sent separately and never parsed as SQL
cur.execute("SELECT id, name FROM users WHERE email = %s", (email,))` },
        { t: "h", text: "Cross-site scripting (XSS)" },
        { t: "p", html: "XSS injects script into a page other users view: a comment containing a script tag (stored XSS), a malicious link whose query parameter is echoed into the page (reflected XSS), or client code writing untrusted data into the DOM. The script runs with the victim's privileges on your origin and can read tokens, call APIs and change the page. Defenses: <b>context-aware output encoding</b> (modern template engines and React escape by default; avoid raw-HTML escape hatches), sanitize any user HTML you must allow (for example with DOMPurify), a strict <b>Content-Security-Policy</b> that blocks inline and third-party scripts, and <code>HttpOnly</code> cookies so scripts cannot steal the session." },
        { t: "h", text: "Cross-site request forgery (CSRF)" },
        { t: "p", html: "Browsers automatically attach cookies to requests to your domain, even when the request is triggered by another site. A malicious page can auto-submit a hidden form to <code>bank.example/transfer</code>, and the victim's session cookie goes along. Defenses: <b><code>SameSite=Lax</code> or <code>Strict</code> cookies</b> (Chromium-based browsers treat cookies without the attribute as Lax, but set it explicitly), an unpredictable <b>CSRF token</b> in each form or header that the server checks, verifying the <code>Origin</code> header, and never changing state on <code>GET</code>. APIs authenticated with a bearer token in the <code>Authorization</code> header are not exposed to CSRF, because browsers do not attach that header automatically." },
        { t: "h", text: "Server-side request forgery (SSRF)" },
        { t: "p", html: "Any feature where your server fetches a URL the user supplies (link previews, \"import from URL\", webhooks, image fetching) can be turned against your internal network. The attacker submits an internal address, and your server, which sits inside the trusted network, fetches it for them: an admin endpoint, an internal database's HTTP interface, or the cloud <b>instance metadata service</b> at <code>169.254.169.254</code>, which can hand out the server's IAM credentials. Defenses: allowlist destinations where possible; resolve the hostname and block private, loopback and link-local ranges, re-checking after every redirect and against DNS rebinding; route fetches through an egress proxy in an isolated network segment; and require IMDSv2 on AWS, whose session tokens and hop limit block most SSRF paths to metadata." },
        { t: "callout", kind: "example", title: "Capital One, 2019", html: "An attacker abused a misconfigured web application firewall to make SSRF requests to the AWS metadata service, obtained the credentials of the role attached to the instance, and used them to copy data from S3 on about 100 million people in the US and Canada. The incident is a common reason teams now enforce IMDSv2 and keep instance roles narrowly scoped." },
        { t: "h", text: "Distributed denial of service (DDoS)" },
        { t: "p", html: "DDoS attacks overwhelm you with traffic from many sources. <b>Volumetric</b> attacks flood bandwidth, often using amplification: small spoofed requests to open DNS, NTP or memcached servers produce large responses aimed at the victim. In 2018 GitHub absorbed a memcached amplification attack peaking at about 1.35 Tbps. <b>Protocol</b> attacks such as SYN floods exhaust connection tables. <b>Application-layer (L7)</b> attacks send realistic-looking HTTP requests to expensive endpoints like search or login. Defense is layered, and the first layers belong to providers with far more capacity than you have." },
        { t: "diagram", caption: "Each layer filters a different kind of attack, so only legitimate, rate-limited traffic reaches the origin.", code: `flowchart LR
  Bots(("Botnet")) --> Edge["Anycast CDN edge<br/>absorbs L3 and L4 floods"]
  Users(("Users")) --> Edge
  Edge -->|"cache hits served at edge"| Cache["Edge cache"]
  Edge --> WAF["WAF and bot detection<br/>block known bad patterns"]
  WAF --> RL["Rate limiter<br/>per IP, per token, per route"]
  RL --> LB["Load balancer<br/>SYN cookies, connection limits"]
  LB --> App["App servers<br/>load shedding, autoscaling cap"]` },
        { t: "table", head: ["Attack", "Root cause", "Primary defenses"], rows: [
          ["SQL injection", "Input treated as query syntax", "Parameterized queries, ORM, least-privilege DB user"],
          ["XSS", "Input rendered as script in other users' browsers", "Output encoding, HTML sanitizing, Content-Security-Policy, HttpOnly cookies"],
          ["CSRF", "Browser auto-attaches cookies to cross-site requests", "SameSite cookies, CSRF tokens, Origin checks, no state change on GET"],
          ["SSRF", "Server fetches attacker-chosen URLs from inside the network", "Destination allowlists, block private and metadata ranges, egress proxy, IMDSv2"],
          ["DDoS", "Capacity exhausted by traffic volume or expensive requests", "Anycast CDN and scrubbing (Cloudflare, AWS Shield, Akamai), WAF, rate limits, caching, load shedding"],
          ["Credential stuffing", "Passwords reused from other breaches", "Rate limits per account and IP, breached-password checks, MFA, bot detection"]
        ] },
        { t: "callout", kind: "interview", title: "Where defenses live in your diagram", html: "Draw the edge explicitly: \"CDN with DDoS protection and a WAF in front, rate limiting at the gateway (Chapter 11), TLS terminated at the load balancer, mTLS inside.\" Then mention input handling at the services (parameterized queries, output encoding) and SSRF protection for any URL-fetching feature. Security placed on the diagram beats a list of buzzwords at the end." }
      ]
    }
  ],
  takeaways: [
    "Metrics tell you that something is wrong, traces tell you where, logs tell you why; link all three with a trace or correlation ID propagated on every hop.",
    "Use structured JSON logs, RED metrics for services and USE metrics for resources; keep high-cardinality fields like user IDs out of metric labels.",
    "Measure latency with percentiles from histograms, never averages, and never average percentiles across instances; merge histogram buckets instead.",
    "SLI is the measurement, SLO the internal target, SLA the contract with penalties; a 99.9% SLO leaves about 43.8 minutes a month of error budget.",
    "Spend the error budget on releases and experiments; when it runs out, the error budget policy shifts the team to reliability work.",
    "Page on symptoms users feel, using multi-window burn-rate alerts (for example 14.4x over 1 hour and 5 minutes), not on CPU or other causes.",
    "Sessions are instantly revocable but need a lookup; JWTs verify locally but cannot be revoked before expiry, so pair short-lived access tokens with revocable refresh tokens and a denylist.",
    "Use OAuth 2.0 authorization code with PKCE for every user-facing client, OIDC ID tokens for login and SSO, and check iss, aud and exp on every token.",
    "RBAC for simple roles, ABAC for contextual policies, ReBAC (Zanzibar-style tuples) for sharing and nested resources; enforce coarse checks at the gateway and fine-grained checks in services.",
    "TLS outside and mTLS inside, envelope encryption with KMS at rest, secrets in a vault with workload identity, passwords hashed with Argon2id or bcrypt, and layered DDoS defense at the edge."
  ],
  mcqs: [
    { q: "Which metric type should you use for the current number of messages waiting in a queue?",
      options: ["Counter", "Gauge", "Histogram", "Summary"],
      answer: 1,
      explain: "Queue depth goes up and down and you care about its current value, which is exactly what a gauge records. A counter only increases, so it suits totals such as messages enqueued, whose rate you graph.",
      level: "easy" },
    { q: "Your service has a 99.9% availability SLO measured monthly. Roughly how much total downtime does the error budget allow per month?",
      options: ["About 4.4 minutes", "About 8.8 hours", "About 7.2 hours", "About 44 minutes"],
      answer: 3,
      explain: "The budget is 0.1% of the month: 0.001 × 43,830 minutes ≈ 43.8 minutes (43.2 for a 30-day window). 4.4 minutes is the budget for 99.99%, and 8.8 hours is a year at 99.9%.",
      level: "easy" },
    { q: "A logged-in user requests another tenant's invoice. Their token is valid but they have no access to that invoice. Which status code is correct?",
      options: ["<code>403 Forbidden</code>: the identity is known but lacks permission", "<code>401 Unauthorized</code>: the user lacks rights to this invoice", "<code>400 Bad Request</code>: the invoice ID is outside the caller's tenant", "<code>429 Too Many Requests</code>: the user is probing for other IDs"],
      answer: 0,
      explain: "Despite its name, 401 means the caller has not been authenticated (missing or invalid credentials). Here authentication succeeded and authorization failed, which is 403. Some APIs return 404 instead so they do not reveal that the resource exists.",
      level: "easy" },
    { q: "Which is the best way to store user passwords in a new system?",
      options: ["Encrypt them with AES-256 using a key stored in KMS", "Hash them with SHA-256 and a global secret pepper", "Hash them with Argon2id using a unique random salt per user", "Store them in a separate database with strict access controls"],
      answer: 2,
      explain: "Passwords only need to be verified, so store a one-way hash, and use a slow, memory-hard, salted algorithm so each guess is expensive. SHA-256 is fast enough for GPUs to try billions of guesses per second, and encryption is reversible by anyone with the key.",
      level: "easy" },
    { q: "Ten app servers each report a p99 latency gauge. Your dashboard shows the average of the ten values as the fleet p99. What is wrong and how do you fix it?",
      options: ["Nothing; the mean of per-server p99s equals the fleet p99", "The mean hides outliers; the maximum of the ten p99s is the true fleet p99", "The p99 is too noisy; average the ten p50 values instead", "Percentiles don't average; merge histogram buckets, then take p99"],
      answer: 3,
      explain: "A percentile of the whole fleet depends on the full distribution, which averages of per-server percentiles lose, especially when servers carry different traffic. Histogram buckets add up across servers, so the fleet percentile can be computed from them; the maximum is only an upper bound.",
      level: "medium" },
    { q: "Your SLO is 99.95% of requests succeeding over 30 days, and the service handles 40M requests in that window. An incident caused 8,000 failed requests. How much error budget remains?",
      options: ["About 20% of the budget", "About 60% of the budget", "About 80% of the budget", "None; the SLO is already breached"],
      answer: 1,
      explain: "The budget is 0.0005 × 40M = 20,000 failed requests. The incident used 8,000, which is 40%, leaving 12,000, or 60%.",
      level: "medium" },
    { q: "Which of these conditions should page the on-call engineer at 3 a.m.?",
      options: ["CPU on one read replica of the orders database has stayed above 90% for 10 minutes", "One of six stateless app instances failed its health check and was replaced", "The checkout error budget is burning at 14.4 times the sustainable rate", "Garbage collection pauses on the search cluster rose from 20 ms to 60 ms"],
      answer: 2,
      explain: "Pages should fire on symptoms that threaten the SLO and need human action now. The others are causes that may never affect users; put them on dashboards or tickets. A fast burn rate means the budget will be gone within days.",
      level: "medium" },
    { q: "You want to keep every trace that contains an error or is slower than 2 seconds, while storing only about 1% of normal traces. Which sampling approach achieves this?",
      options: ["Tail-based sampling in a collector, decided after each trace completes", "Head-based sampling at 1%, decided at the edge and propagated in the trace context", "Head-based sampling at 100% at the edge, deleting traces after one day", "Each service independently keeps 1% of its spans plus every span with an error"],
      answer: 0,
      explain: "Head-based sampling decides before anyone knows whether the request will fail or be slow, so it keeps only 1% of errors too. Independent per-service sampling produces broken, partial traces, even when each service keeps its own error spans. Tail sampling buffers the spans and decides with the full outcome known.",
      level: "medium" },
    { q: "Your API issues JWT access tokens valid for 24 hours. An employee is fired, but their token keeps working for the rest of the day. What is the most practical fix?",
      options: ["Switch from RS256 to HS256 so tokens are verified with a shared secret", "Encrypt the payload as a JWE so a leftover token cannot be replayed", "Use 10-minute access tokens, revocable refresh tokens and a small denylist", "Rotate the signing key every time any user account is disabled"],
      answer: 2,
      explain: "A JWT is valid until it expires unless verifiers check something extra. Short access tokens bound the exposure, revoking the server-side refresh token stops renewal, and a small denylist checked at the gateway cuts access in seconds. Rotating the key logs out every user, and the algorithm or encryption does not affect revocation.",
      level: "medium" },
    { q: "You are designing permissions for a Google Drive-like product: users share files and folders with people and groups, and folder access is inherited by everything inside. Which authorization model fits best?",
      options: ["RBAC with a role per folder, such as <code>folder-123-editor</code>, granted to groups", "ABAC policies comparing each user's department attribute with the file's department", "ACLs on each file, recopied down the tree whenever a parent folder's sharing changes", "ReBAC: store relationship tuples and derive access through groups and folders"],
      answer: 3,
      explain: "Access here is defined by relationships (member of group, editor of folder, folder is parent of file), which is what Zanzibar-style ReBAC models directly. Per-folder roles explode in number, and copying ACLs on every change is slow and error-prone for large trees.",
      level: "medium" },
    { q: "A single-page app calls your API with the access token in the <code>Authorization: Bearer</code> header, held in memory. A security review asks whether the API needs CSRF protection. What is the right answer?",
      options: ["Yes, because every state-changing endpoint needs a CSRF token", "No, because a forged cross-site request cannot carry the in-memory bearer token", "Yes, because the browser adds the bearer token to every request to that domain", "No, because TLS encryption on its own stops cross-site request forgery"],
      answer: 1,
      explain: "CSRF works because browsers attach cookies automatically to requests triggered by other sites. A header the app sets explicitly is not sent by a forged form or image request. If the API also accepted cookie authentication, it would need SameSite cookies and CSRF tokens; HTTPS does nothing against CSRF.",
      level: "medium" },
    { q: "With a 30-day SLO window, an incident burns error budget at a steady burn rate of 14.4. If nothing changes, roughly how long until the entire monthly budget is gone?",
      options: ["About 50 hours", "About 14 hours", "About 5 days", "About 2 hours"],
      answer: 0,
      explain: "A burn rate of 1 spends the budget in exactly 30 days, or 720 hours. At 14.4 it lasts 720 / 14.4 = 50 hours, which means 2% of the budget per hour, the standard fast-burn paging threshold.",
      level: "hard" },
    { q: "In the OAuth 2.0 authorization code flow, what specific attack does PKCE prevent?",
      options: ["An attacker stealing the access token from the API's memory", "A user being tricked into approving excessive scopes on the consent screen", "An attacker replaying an expired ID token to log in later", "An attacker redeeming an intercepted authorization code for tokens"],
      answer: 3,
      explain: "The client sends a hash of a random code_verifier at the start and must present the verifier itself when exchanging the code. An attacker who intercepts the redirect gets only the code and the hash, and cannot produce the verifier. Replay of ID tokens is handled by the nonce and expiry, not PKCE.",
      level: "hard" },
    { q: "A service stores 50 TB of customer documents and wants KMS-managed encryption with yearly key rotation. A teammate proposes sending each document to the KMS <code>Encrypt</code> API. What is the better design?",
      options: ["Use the KMS master key directly in the app by exporting it once at startup", "Encrypt each document with a key derived from the customer's password via PBKDF2", "Use envelope encryption: encrypt locally with a data key that KMS wraps", "Skip application encryption, because the cloud provider already encrypts the disks"],
      answer: 2,
      explain: "KMS APIs are rate limited, add a network round trip and accept only small payloads (4 KB for AWS KMS Encrypt), so bulk data is encrypted locally with a data key that KMS wraps, and only the wrapped (encrypted) data key is stored alongside each document. Rotating the master key then means re-wrapping small keys, not re-encrypting 50 TB. Master keys should never leave the KMS.",
      level: "hard" },
    { q: "Your link-preview feature fetches any URL a user pastes. An attacker submits <code>http://169.254.169.254/latest/meta-data/iam/security-credentials/</code>. What is the attack, and what is the strongest defense?",
      options: ["SSRF; block private and link-local IPs on every lookup and redirect, and require IMDSv2", "XSS; HTML-encode the fetched title and description before rendering the preview", "SQL injection; bind the pasted URL as a query parameter when saving the preview", "CSRF; require a SameSite cookie and a CSRF token on the preview endpoint"],
      answer: 0,
      explain: "The server is being tricked into requesting the cloud metadata service from inside the network, which can return IAM credentials. Blocking internal destinations (rechecking after redirects and DNS resolution), isolating the fetcher and using IMDSv2 close the hole; the other defenses address different attacks.",
      level: "hard" }
  ],
  design: [
    {
      id: "design-metrics-monitoring",
      title: "Design a metrics monitoring and alerting system",
      level: "Hard",
      prompt: "Design a metrics monitoring and alerting platform like Prometheus or Datadog for a company running 10,000 servers and about 500 microservices. Teams must be able to send metrics, build dashboards, query recent and historical data, and define alerts that notify on-call engineers through PagerDuty, Slack or email.",
      clarify: [
        "How many active time series, and at what collection interval: 10 seconds, 15, or 60?",
        "Push (agents send metrics) or pull (the system scrapes endpoints), or both?",
        "How long must data be kept at full resolution, and is downsampled long-term data acceptable?",
        "What query latency do dashboards need, and how many people view them at once during an incident?",
        "How quickly must an alert fire after a problem starts, for example under one minute?",
        "Is this metrics only, or also logs and traces? Do we need multi-tenancy with per-team quotas?"
      ],
      hints: [
        "Size it first: active series × samples per second gives the ingestion rate. How many bytes does a sample take after compression?",
        "Metrics data is append-only, time-ordered and queried by recent time ranges. What storage layout and compression does that suggest instead of a general-purpose database?",
        "Ingestion must survive bursts and node failures. Where would you put a durable buffer, and how would you partition the data?",
        "Old data is rarely queried at full resolution. How do you keep a year of data affordable?",
        "The alerting system must keep working when the infrastructure it monitors is failing. How do you avoid it sharing the same fate, and how do you avoid paging 500 times for one outage?"
      ],
      solution: [
        { t: "h", text: "Requirements" },
        { t: "list", items: [
          "<b>Functional:</b> ingest counters, gauges and histograms with labels; query with a PromQL-like language; dashboards; alert rules with routing, grouping, silencing and escalation.",
          "<b>Scale:</b> about 10M active time series at a 10-second interval, growing 2x a year.",
          "<b>Retention:</b> 15 days at full resolution, 13 months downsampled.",
          "<b>Latency:</b> dashboard queries over the last hour in under 1 second; alerts fire within 1 minute of the condition.",
          "<b>Reliability:</b> alerting must be more available than the systems it monitors, and must keep working during partial outages."
        ] },
        { t: "h", text: "Estimates" },
        { t: "list", items: [
          "Series: 10,000 hosts × ~1,000 series each (system plus application metrics) ≈ <b>10M active series</b>.",
          "Ingestion: 10M series / 10 s = <b>1M samples per second</b>, peaking at maybe 2M during deploys when series churn.",
          "Raw size: a sample is a 64-bit timestamp plus a 64-bit float, 16 bytes. Gorilla-style compression (delta-of-delta timestamps, XOR-encoded values) gets this to about <b>1.37 bytes per sample</b>, the figure Facebook reported for Gorilla.",
          "Storage per day: 1M × 86,400 × ~1.5 B ≈ <b>130 GB a day</b>; 15 days ≈ 2 TB, ×3 replicas ≈ 6 TB. Without compression it would be about 1.4 TB a day.",
          "Downsampled: 5-minute rollups (min, max, sum, count) are 30x fewer points: about 4–5 GB a day before rollup overhead, so 13 months is a few TB in object storage.",
          "Network: 1M samples/s × ~100 bytes on the wire with labels, before compression ≈ 100 MB/s into the ingestion tier."
        ] },
        { t: "h", text: "API" },
        { t: "code", lang: "http", code: `POST /api/v1/write                 (remote-write from agents: batched, snappy-compressed protobuf)
GET  /metrics                      (each service exposes this; collectors scrape it every 10s)

GET  /api/v1/query_range?query=sum(rate(http_requests_total{job="checkout",code=~"5.."}[5m]))&start=...&end=...&step=30s
-> 200 { "series": [ { "labels": {...}, "points": [[ts, value], ...] } ] }

PUT  /api/v1/rules/checkout-slo    { "expr": "...burn rate > 14.4...", "for": "2m",
                                     "labels": { "severity": "page", "team": "payments" } }
POST /api/v1/silences              { "matchers": { "service": "checkout" }, "ends_at": "..." }` },
        { t: "h", text: "Data model" },
        { t: "p", html: "A series is identified by its metric name plus sorted labels, hashed to a 64-bit <b>series ID</b>. Data is stored in a purpose-built time-series database (Prometheus TSDB format, as used by Thanos, Cortex/Mimir or VictoriaMetrics), not a relational or general key-value store, because the workload is append-only, time-ordered, highly compressible and queried by label matchers over time ranges." },
        { t: "table", head: ["Structure", "Contents", "Why"], rows: [
          ["Head block in memory", "Last ~2 hours of samples per series, plus a write-ahead log on local disk", "Fast appends and fast queries for the most recent data; WAL replays after a crash"],
          ["Immutable blocks", "2-hour chunks of compressed samples, compacted into larger blocks, uploaded to S3 or GCS", "Cheap, durable, effectively unlimited retention"],
          ["Inverted index", "Label pair to posting list of series IDs, such as <code>job=checkout</code> → [17, 942, ...]", "Resolve label matchers by intersecting posting lists"],
          ["Rollup blocks", "5-minute and 1-hour min, max, sum and count per series", "Long-range queries read 30–360x fewer points"]
        ] },
        { t: "h", text: "High-level design" },
        { t: "diagram", caption: "Kafka decouples collection from storage; ingesters keep recent data hot, and object storage holds the long tail.", code: `flowchart LR
  Svc["Services and hosts<br/>expose metrics"] --> Agent["Collector agents<br/>scrape every 10s"]
  Agent -->|"remote write, batched"| Dist["Distributors<br/>validate, shard by series ID"]
  Dist --> K[["Kafka<br/>partitioned by series ID"]]
  K --> Ing["Ingesters<br/>head block plus WAL"]
  Ing -->|"flush 2h blocks"| OS[("Object storage<br/>blocks and rollups")]
  Comp["Compactor and downsampler"] --> OS
  QF["Query frontend<br/>split, cache, merge"] --> Ing
  QF --> SG["Store gateways"]
  SG --> OS
  Rule["Rule evaluators"] --> QF
  Rule --> AM["Alertmanager cluster<br/>group, dedupe, route"]
  AM --> Notify["PagerDuty, Slack, email"]
  Dash["Dashboards"] --> QF` },
        { t: "p", html: "<b>Write path:</b> agents on each host scrape local endpoints (pull, so the system knows when a target is down via an <code>up</code> metric) and remote-write batches to stateless distributors. Distributors validate, enforce per-tenant limits on series count and rate, and write to Kafka partitioned by series ID, so all samples of a series land on the same ingester in order. Ingesters append to an in-memory head block and a WAL, replicate (3 copies via Kafka consumers or quorum writes), and every 2 hours flush a compressed, immutable block to object storage. <b>Read path:</b> the query frontend splits a range query by time, serves cached results for older intervals, sends the recent part to ingesters and the older part to store gateways that read blocks from object storage, and merges the results." },
        { t: "h", text: "Deep dive: compression and cardinality" },
        { t: "p", html: "Compression is what makes the system affordable. Scrape timestamps are nearly regular, so the delta-of-delta is usually zero and fits in one bit. Consecutive values of a series are close, so XOR with the previous value gives mostly zero bits. This turns 16 bytes into about 1.4. The real threat is <b>cardinality</b>: memory per active series in the ingesters is several kilobytes (labels, index entries, the open chunk), so 10M series need tens of GB of RAM across the cluster, and one team adding a <code>user_id</code> label can add millions of series in minutes. Enforce per-tenant series limits at the distributor, reject or drop offending labels, and expose a cardinality explorer so teams can see their top metrics." },
        { t: "h", text: "Deep dive: alerting that works during outages" },
        { t: "list", items: [
          "<b>Evaluate rules close to the data:</b> rule evaluators run every 30–60 seconds on recent data from the ingesters. A <code>for: 2m</code> clause requires the condition to hold across consecutive evaluations, which suppresses one-off blips.",
          "<b>Alertmanager</b> receives firing alerts, <b>groups</b> them (500 instances of one service down becomes one notification), <b>deduplicates</b> across evaluator replicas, applies <b>inhibition</b> (do not page for app errors when the whole data center is down) and silences, then routes by labels to the owning team's PagerDuty or Slack.",
          "Run Alertmanager as a 3-node cluster that gossips notification state, so a node failure does not drop pages; delivery is at-least-once, so a rare duplicate page is possible during a partition.",
          "<b>Independent failure domain:</b> the monitoring stack runs in separate infrastructure or a separate region, and a <b>dead man's switch</b> (an always-firing alert sent to an external service) pages if the alert pipeline itself goes silent.",
          "<b>Meta-monitoring:</b> a small, separate Prometheus watches the monitoring system's own ingestion lag, rule evaluation duration and notification failures."
        ] },
        { t: "h", text: "Deep dive: long-range queries" },
        { t: "p", html: "A 30-day dashboard over 1,000 series at 10-second resolution would read 1,000 × 259,200 ≈ 260M points. With 1-hour rollups it reads 720,000. The query frontend picks the coarsest resolution that still gives at least one point per pixel, splits the query into day-sized pieces that run in parallel, and caches results for completed days, since data older than a few hours no longer changes." },
        { t: "h", text: "Trade-offs and bottlenecks" },
        { t: "table", head: ["Decision", "Benefit", "Cost"], rows: [
          ["Pull scraping by local agents", "Knows when targets are down; targets stay simple", "Short-lived jobs need a push gateway; discovery must track every target"],
          ["Kafka between distributors and ingesters", "Absorbs bursts; ingesters can replay after a crash", "Extra latency of a second or so and another system to run"],
          ["Object storage for old blocks", "Cheap, durable, effectively unlimited retention", "Slower queries for old data, which needs store gateways and caching"],
          ["Downsampling after 15 days", "Keeps a year of data affordable", "Loses detail: a 30-second spike vanishes inside a 5-minute average unless you keep max"],
          ["Per-tenant series limits", "Protects the cluster from cardinality explosions", "Teams hit limits and must redesign their labels"]
        ] }
      ],
      followups: [
        "How would you support SLO tracking and multi-window burn-rate alerts as a built-in feature for every service?",
        "An ingester crashes with 90 minutes of unflushed data in memory. Walk through the recovery and what the dashboards show meanwhile.",
        "A team wants per-customer latency metrics for 2M customers. How do you serve that without destroying the TSDB?",
        "How would you add exemplars so a latency spike on a graph links directly to an example trace?",
        "How would you make the system multi-region while still giving a global view of all metrics?"
      ]
    },
    {
      id: "design-sso-business-suite",
      title: "Design single sign-on for a suite of business apps",
      level: "Medium",
      prompt: "A company sells a suite of business apps (mail, calendar, chat, video meetings and a file drive) to organizations, as web, mobile and desktop clients on separate subdomains. Design single sign-on so a user logs in once and can use every app, enterprise customers can connect their own identity provider such as Okta or Microsoft Entra ID, and an admin can disable a user everywhere within a minute.",
      clarify: [
        "How many organizations and users, and what are peak login rates, for example 9 a.m. Monday across time zones?",
        "Which client types: browser, iOS, Android, desktop? Do the apps call each other's APIs directly?",
        "Must we support SAML for enterprise IdPs as well as OIDC, and SCIM for automated user provisioning?",
        "What are the session rules: idle timeout, maximum session length, MFA requirements set per organization?",
        "How fast must revocation take effect, and does it have to cut off already-open WebSocket connections such as chat and meetings?",
        "Are there per-region data residency requirements for identity data?"
      ],
      hints: [
        "Put one identity provider at the center. What protocol do the apps use to talk to it, and what does each app keep after login?",
        "SSO comes from the IdP's own session. How does the second app get a user signed in without prompting for a password?",
        "Enterprise customers bring their own IdP. Can your IdP act as a client to theirs, so the apps never need to know?",
        "Access tokens are verified locally for speed. How do you still revoke a disabled user in under a minute, including long-lived WebSocket connections?",
        "Every app now depends on the IdP. How do you make it highly available, and what keeps working if it is briefly down?"
      ],
      solution: [
        { t: "h", text: "Requirements" },
        { t: "list", items: [
          "<b>Functional:</b> one login across mail, calendar, chat, meet and drive on web, mobile and desktop; MFA and passkeys; organizations can federate their own IdP (OIDC or SAML); SCIM provisioning; single logout; admin disable takes effect everywhere.",
          "<b>Security:</b> authorization code + PKCE for every client, short-lived access tokens with audience per app API, refresh token rotation, full audit log of logins and admin actions.",
          "<b>Revocation:</b> a disabled user loses access to all apps, including open WebSocket connections, within 60 seconds.",
          "<b>Availability:</b> the IdP is on every login path, so it targets 99.99%, and existing sessions must keep working through short IdP outages.",
          "<b>Latency:</b> token verification adds under 1 ms per API request; an SSO hop into a second app takes under 500 ms."
        ] },
        { t: "h", text: "Estimates" },
        { t: "list", items: [
          "50M users, 20M daily active, each using 3 apps on 2 devices.",
          "Interactive logins: assume one a day per active user, with a morning peak at 5x the average: 20,000,000 / 86,400 ≈ 230 per second average, about <b>1,200 per second</b> at peak. Each involves a password or passkey check; Argon2id at ~50 ms of CPU each means roughly 60 CPU cores at peak for hashing alone, which federated and passkey logins reduce.",
          "Token refreshes: 20M users × 3 apps × 2 devices with 10-minute access tokens across an 8-hour active day = 120M sessions × 48 ≈ 5.8B refreshes a day ≈ <b>67k per second</b>, the dominant load. Use 15-minute tokens and refresh only while an app is active to cut this substantially.",
          "API verification: tens of millions of requests per minute across the apps, all verified locally with cached public keys, so zero calls to the IdP.",
          "Session store: 120M sessions × ~1 KB ≈ <b>120 GB</b>, which fits a Redis cluster with replicas, backed by a durable database."
        ] },
        { t: "h", text: "API" },
        { t: "code", lang: "http", code: `GET  /oauth2/authorize?response_type=code&client_id=mail-web&redirect_uri=...
     &scope=openid mail.read&state=...&nonce=...&code_challenge=...&code_challenge_method=S256
POST /oauth2/token        grant_type=authorization_code | refresh_token, code_verifier=...
GET  /.well-known/openid-configuration      and   GET /oauth2/jwks
POST /oauth2/revoke       token=...         (logout from one app)
POST /scim/v2/Users       PATCH /scim/v2/Users/{id}  { "active": false }   (org provisioning)
POST /admin/v1/users/{id}/disable          (fans out a revocation event)` },
        { t: "h", text: "Data model" },
        { t: "p", html: "Identity data (users, organizations, credentials, federation settings) lives in PostgreSQL, replicated across AZs with a synchronous standby, because it needs transactions and uniqueness for emails. Sessions and refresh tokens live in Redis for fast lookups, with durable copies in the database so a Redis failure does not log everyone out." },
        { t: "table", head: ["Entity", "Key fields", "Notes"], rows: [
          ["<code>organizations</code>", "<code>org_id</code>, <code>domains</code>, <code>idp_type</code>, <code>idp_metadata</code>, <code>mfa_policy</code>, <code>session_max_hours</code>", "Verified email domains route users to their organization's IdP"],
          ["<code>users</code>", "<code>user_id</code>, <code>org_id</code>, <code>email</code> (unique), <code>status</code>, <code>password_hash</code> (Argon2id, nullable), <code>min_token_iat</code>", "<code>min_token_iat</code> invalidates every token issued before a disable"],
          ["<code>idp_sessions</code>", "<code>sid</code>, <code>user_id</code>, <code>created_at</code>, <code>last_seen</code>, <code>mfa_at</code>, <code>device</code>", "The SSO session behind the IdP cookie"],
          ["<code>refresh_tokens</code>", "<code>token_hash</code>, <code>sid</code>, <code>client_id</code>, <code>family_id</code>, <code>used</code>, <code>expires_at</code>", "Stored hashed; rotation with reuse detection per family"],
          ["<code>clients</code>", "<code>client_id</code>, <code>type</code> (public or confidential), <code>redirect_uris</code>, <code>allowed_scopes</code>", "Each app on each platform is a client with exact redirect URIs"]
        ] },
        { t: "h", text: "High-level design" },
        { t: "diagram", caption: "Every app trusts one IdP; the IdP brokers enterprise logins, and revocation events reach every gateway.", code: `flowchart LR
  U(("User")) --> Apps["Mail, Calendar, Chat,<br/>Meet, Drive clients"]
  Apps -->|"auth code plus PKCE"| IdP["Identity provider<br/>auth.suite.com"]
  IdP -->|"broker login via OIDC or SAML"| Ent["Customer IdP<br/>Okta or Entra ID"]
  IdP --> SS[("Session store<br/>Redis plus PostgreSQL")]
  Apps -->|"Bearer access token"| GW["App gateways<br/>verify JWT locally"]
  GW --> APIs["App APIs"]
  GW -.->|"cache public keys"| IdP
  IdP -->|"user disabled event"| K[["Revocation topic"]]
  K --> GW
  K --> WS["Chat and Meet<br/>WebSocket gateways"]` },
        { t: "p", html: "<b>First login:</b> the user opens the mail web app, which redirects to <code>auth.suite.com</code> with a PKCE challenge. The IdP looks up the email domain; if the organization federates, the IdP acts as an OIDC or SAML client of the customer's Okta and redirects there. After the customer's IdP authenticates the user, the suite IdP creates its own session (an <code>HttpOnly</code>, <code>Secure</code> cookie on <code>auth.suite.com</code>), issues an authorization code, and the mail backend exchanges it for an ID token, a 15-minute access token with <code>aud=mail-api</code>, and a refresh token. <b>Second app:</b> opening the calendar redirects to the IdP, which finds its session cookie and issues a code without prompting; the user sees a brief redirect. <b>API calls:</b> gateways verify the JWT signature with cached JWKS keys and check <code>iss</code>, <code>aud</code>, <code>exp</code> and scopes, with no network call." },
        { t: "h", text: "Deep dive: revocation within 60 seconds" },
        { t: "steps", items: [
          { title: "Disable", html: "An admin, or a SCIM update from the customer's IdP, sets the user's status to disabled, deletes their IdP sessions and refresh tokens, and sets <code>min_token_iat</code> to now." },
          { title: "Publish", html: "The IdP publishes a <code>user_disabled</code> event to a Kafka topic, and pushes OpenID back-channel logout notifications to each app's backend." },
          { title: "Block at gateways", html: "Every API gateway consumes the topic and keeps a small in-memory denylist of user IDs with <code>min_token_iat</code>, so tokens issued before that time are rejected within seconds. Entries expire after the maximum access-token lifetime, 15 minutes, so the list stays small." },
          { title: "Close live connections", html: "Chat and Meet WebSocket gateways consume the same event and close the user's connections. Reconnecting requires a fresh token, which the IdP will not issue." },
          { title: "Backstop", html: "Even if an event is missed, the access token expires within 15 minutes and refresh fails. Gateways also re-sync the denylist on startup from the database." }
        ] },
        { t: "h", text: "Deep dive: brokering enterprise IdPs" },
        { t: "p", html: "The apps only ever speak OIDC to the suite's IdP; the IdP translates. For each organization it stores the customer's IdP metadata (OIDC issuer and client credentials, or a SAML certificate and SSO URL). It maps the external identity to an internal <code>user_id</code> by a stable claim (OIDC <code>sub</code> or SAML NameID), never by display name, and verifies that the email domain belongs to that organization so one customer cannot assert users of another. SCIM keeps users and group membership in sync automatically, which also powers the disable path. Organization admins choose MFA policy; when they federate, MFA usually happens at their IdP, and the suite can require an <code>acr</code> or <code>amr</code> claim proving it did." },
        { t: "h", text: "Deep dive: availability of the IdP" },
        { t: "list", items: [
          "The IdP is stateless behind load balancers across 3 AZs; session data is in a replicated Redis cluster with PostgreSQL as the durable copy.",
          "Most traffic never touches it: API verification is local, so an IdP outage blocks only new logins and refreshes, not current work. Allowing a short grace period for refresh retries keeps users signed in through a brief blip.",
          "Publish signing keys ahead of use: keep the next key in JWKS before signing with it, so gateway caches already have it when rotation happens.",
          "Deploy the IdP active-active in at least two regions with replicated session data; it is the one service whose outage stops everything."
        ] },
        { t: "h", text: "Trade-offs and bottlenecks" },
        { t: "table", head: ["Decision", "Benefit", "Cost"], rows: [
          ["Central IdP brokering every customer IdP", "Apps implement one protocol; customer IdP changes are config, not code", "The IdP becomes the most critical service, needing multi-region HA"],
          ["15-minute JWT access tokens, verified locally", "No IdP call per request, which scales to every API", "Revocation needs the event-driven denylist; refresh traffic grows as tokens get shorter"],
          ["Refresh token rotation with reuse detection", "A stolen refresh token is detected and the session family killed", "Concurrent refreshes from two tabs need a short grace window"],
          ["IdP session cookie on a separate auth domain", "SSO across subdomains and native apps with a system browser", "Third-party cookie restrictions mean flows must be top-level redirects, not hidden iframes"],
          ["Event fan-out for disable", "Under 60 seconds everywhere, including live WebSockets", "Another pipeline to monitor; missed events fall back to token expiry"]
        ] }
      ],
      followups: [
        "How would you implement single logout so signing out of mail also signs the user out of every other app and device?",
        "A customer's Okta tenant goes down for an hour. What do their users experience, and can you offer a break-glass login?",
        "How would you add step-up authentication, requiring fresh MFA before a user downloads a whole drive folder?",
        "How do service-to-service calls work, for example calendar asking mail to send invites on a user's behalf?",
        "How would you rotate the token signing key safely without logging anyone out?"
      ]
    }
  ]
};
