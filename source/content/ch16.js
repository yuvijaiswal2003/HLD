module.exports = {
  id: "case-studies-social",
  num: 16,
  part: 7,
  title: "Case Studies II: Social and Communication",
  tagline: "Chat, feeds, notifications and video calls: real-time fan-out designed end to end.",
  level: "Advanced",
  lessons: [
    // ---------------------------------------------------------------- Lesson 1: Chat
    {
      id: "chat-messaging",
      title: "Design a chat app (WhatsApp / Slack)",
      minutes: 20,
      blocks: [
        { t: "p", html: "This walkthrough designs a WhatsApp-style messenger and points out where Slack-style team chat differs. Chat looks simple — send text, show text — but it combines four hard problems: holding hundreds of millions of long-lived connections, giving every participant the same message order, never losing a message the server has acknowledged, and catching up devices that were offline. It builds on WebSockets (Chapter 2), Kafka partition ordering (Chapter 9), leases (Chapter 8) and Snowflake IDs (Chapter 14)." },
        { t: "h", text: "1. Requirements" },
        { t: "list", items: [
          "<b>Functional:</b> 1:1 and group conversations (groups capped at ~1,000 members; 100k-member Slack channels are a design-problem variation).",
          "Sent, delivered and read receipts; typing indicators; online presence and last seen.",
          "Push notifications to offline devices, and offline catch-up when a device reconnects.",
          "Multi-device: phone, desktop and web show the same history.",
          "Media (images, voice notes, files) sent as references to objects in object storage, not inline bytes."
        ] },
        { t: "list", items: [
          "<b>Latency:</b> under ~200 ms end to end (p99 under 500 ms) when both users are online in the same region.",
          "<b>Durability:</b> once the sender sees the first tick, the message is never lost.",
          "<b>Ordering:</b> every member of a conversation sees the same order.",
          "<b>Availability over consistency</b> for presence and typing; those may be briefly wrong.",
          "<b>Security:</b> TLS everywhere; end-to-end encryption is a client concern, and the server then stores only ciphertext."
        ] },
        { t: "callout", kind: "interview", title: "Scope it before you draw", html: "Ask: 1:1 only, or groups, and how large? Is history kept on the server forever (Slack) or only until delivered (WhatsApp keeps an undelivered message for up to 30 days, then deletes it)? Multi-device? End-to-end encryption? These answers change storage by orders of magnitude and decide whether the server can search messages. Repeat the scope back in one sentence: <em>'1:1 and groups up to 1,000, server-side history for multi-device sync, receipts, presence and push.'</em>" },
        { t: "h", text: "2. Estimates" },
        { t: "code", lang: "text", code: `DAU                      = 500M
Messages sent            = 500M x 40/day = 20B/day
Average write rate       = 20B / 86,400 s ≈ 231k msg/s
Peak (x2)                ≈ 460k msg/s  -> design for ~500k msg/s
Deliveries               ≈ 3 device frames per message (group members, other devices)
                         ≈ 1.5M frames/s at peak, plus receipts (batched) of similar size
Storage per message      ≈ 200 B (~100 B text + ids, timestamps, flags)
Daily storage            = 20B x 200 B = 4 TB/day, x3 replicas = 12 TB/day
Yearly (replicated)      ≈ 12 TB x 365 ≈ 4.4 PB   (media lives in object storage, not here)
Concurrent connections   ≈ 40% of DAU at peak = 200M sockets
Gateways                 = 200M / 250k sockets per box ≈ 800 -> ~1,000 with headroom
Heartbeats               = 200M / 30 s ≈ 6.7M tiny frames/s, absorbed by the gateways` },
        { t: "h", text: "3. API" },
        { t: "p", html: "The estimates say the expensive parts are ~200M long-lived connections and a write-heavy message log, and the API mirrors that split. One persistent WebSocket per device carries every real-time frame in both directions; plain HTTPS handles request/response work — history pages, sync after reconnect, media upload and group management." },
        { t: "code", lang: "http", code: `# Real-time: one WebSocket per device, auth token checked at upgrade
GET wss://chat.example.com/v1/ws            Upgrade: websocket

  client -> {"type":"send","client_msg_id":"c-7f3a","conv_id":"g42","body":"hi"}
  server -> {"type":"ack","client_msg_id":"c-7f3a","msg_id":"1846...","seq":1043}
  server -> {"type":"msg","conv_id":"g42","seq":1044,"from":"u9","body":"yo"}
  client -> {"type":"receipt","conv_id":"g42","kind":"read","up_to_seq":1044}
  both   -> {"type":"ping"} / {"type":"pong"}          every ~30 s

# Request/response over HTTPS
GET  /v1/sync                                   -> conversations where this device is behind
GET  /v1/conversations/g42/messages?before_seq=1000&limit=50
POST /v1/media                                  -> presigned upload URL (Chapter 10)
POST /v1/conversations   {"members":["u1","u9","u12"],"title":"Trip"}` },
        { t: "h", text: "4. Data model" },
        { t: "table", head: ["Table / store", "Key", "Contents", "Why this store"], rows: [
          ["<code>messages</code>", "PK (conv_id, bucket), clustering seq DESC", "msg_id, sender_id, body or ciphertext, media_ref, created_at", "Cassandra/ScyllaDB: append-only, write-heavy, read as 'latest N in one conversation'; the bucket (seq / 10,000, or a time window) caps partition size"],
          ["<code>conversations</code>", "conv_id", "type, title, member_count, last_seq", "Small and hot: same store, with last_seq cached in Redis for sync"],
          ["<code>conversation_members</code>", "PK conv_id, clustering user_id", "role, muted, last_delivered_seq, last_read_seq", "Receipts are cursors on this row, not per-message rows"],
          ["<code>user_conversations</code>", "PK user_id, clustering conv_id", "joined_at, muted, pinned", "Membership from the user's side: drives the chat list and sync"],
          ["Session registry", "user_id", "device_id -> gateway_id, TTL ~90 s refreshed by heartbeats", "Redis: tiny, hot, ephemeral; rebuilt automatically on reconnect"]
        ] },
        { t: "callout", kind: "example", title: "Discord's message store", html: "Discord's engineering blog describes storing messages in Cassandra with partition key (channel_id, bucket), where the bucket is a fixed time window, and the Snowflake message ID as the clustering key — the same shape as the table above, with a time-window bucket. In 2023 they described migrating those trillions of messages to ScyllaDB, a Cassandra-compatible store, to cut tail latency." },
        { t: "h", text: "5. High-level design" },
        { t: "diagram", caption: "Gateways only hold sockets; the conversation's owner orders and persists each message, and fan-out workers deliver to online devices or hand off to push.", code: `flowchart LR
  C(("Clients")) --> LB["L4 load balancer"]
  LB --> GW["WebSocket gateways"]
  GW -->|"send frame"| CS["Chat service<br/>owner per conv_id"]
  CS -->|"append with seq"| DB[("Cassandra<br/>messages")]
  CS --> MC[("Redis<br/>members cache")]
  CS -->|"publish"| K[["Kafka<br/>keyed by conv_id"]]
  K --> FO["Fan-out workers"]
  FO -->|"online devices?"| SR[("Redis<br/>session registry")]
  FO -->|"batched deliver"| GW
  FO -->|"offline devices"| PN["Push service"]
  PN --> AP["APNs and FCM"]
  GW -->|"heartbeats"| PS["Presence service"]
  PS --> SR` },
        { t: "p", html: "<b>Write path:</b> the client sends a frame over its WebSocket; the gateway forwards it to the chat-service instance that owns the conversation (consistent hashing on conv_id, Chapter 7). The owner dedupes on <code>client_msg_id</code>, assigns the next <code>seq</code>, appends to Cassandra with a quorum write, and only then acks the sender — that ack is the first tick. It publishes the message to Kafka keyed by conv_id so per-conversation order survives the queue. <b>Delivery path:</b> fan-out workers read the member list, look up each member's live devices in the session registry, group them by gateway and send one batched RPC per gateway; devices without a socket get a push. <b>Read path:</b> opening a conversation reads the newest page from one Cassandra partition, already sorted by seq." },
        { t: "diagram", caption: "The sender's first tick means persisted, not delivered; the second tick is driven by the recipient device's ack, and an offline recipient is reached by push plus sync.", code: `sequenceDiagram
  participant A as Alice phone
  participant G1 as Gateway 1
  participant CS as Chat service
  participant DB as Message store
  participant G2 as Gateway 2
  participant B as Bob phone
  A->>G1: send client_msg_id c-7f3a
  G1->>CS: forward to owner of conv g42
  CS->>DB: dedupe, assign seq 1043, append
  DB-->>CS: written to quorum
  CS-->>G1: ack msg_id and seq 1043
  G1-->>A: ack, show one tick
  alt Bob has a live socket
    CS->>G2: deliver seq 1043
    G2->>B: msg frame
    B-->>G2: delivered up_to_seq 1043
    G2->>CS: delivered receipt
    CS->>G1: receipt for Alice
    G1-->>A: show two ticks
  else Bob is offline
    CS->>CS: request push via APNs or FCM
    Note over B: fetches seq 1043 through sync on reconnect
  end` },
        { t: "h", text: "6. Deep dives" },
        { t: "p", html: "<b>Message IDs and ordering.</b> Never order by client clocks — phones drift by seconds or minutes. Use two identifiers. The client generates a <code>client_msg_id</code> (a UUID) so a retry after a lost ack is deduplicated instead of stored twice. The server assigns a per-conversation <code>seq</code> that is dense and strictly increasing, and that order is the truth every device renders. Because one owner (the chat-service instance holding the conversation's lease) assigns seq, two members typing at the same instant still get one agreed order, and dense numbers give gap detection: a client holding 1042 that receives 1044 fetches 1043. A global Snowflake <code>msg_id</code> remains useful as a stable handle for replies, edits and deletes. On owner failover, the new owner reads the max seq from the store before accepting writes, and a fencing token or a conditional insert on the (conv_id, seq) key stops a stale owner from reusing a number." },
        { t: "p", html: "<b>Delivery guarantees and receipts.</b> Delivery is at-least-once end to end: the server redelivers until a device acks, and devices dedupe by seq. Receipts are cursors: 'read up to 1044' implies every earlier message is read, so one small write per member per read action covers any number of messages. In a group, 'read by 7 of 12' for a message is computed by comparing members' <code>last_read_seq</code> with its seq. Clients coalesce receipts (reading 30 messages sends one), otherwise receipts would outnumber messages." },
        { t: "table", head: ["State", "Means", "Triggered by", "Stored as"], rows: [
          ["Sent (one tick)", "The server persisted the message", "Quorum write in the message store", "The message row itself"],
          ["Delivered (two ticks)", "A recipient device has it", "Device ack over its socket, or after sync", "<code>last_delivered_seq</code> per member (per device if needed)"],
          ["Read", "The recipient opened the conversation", "Client sends read up_to_seq while the view is visible", "<code>last_read_seq</code> per member"],
          ["Failed / pending", "Never reached the server", "No ack before the client's timeout", "Client only; it retries with the same client_msg_id"]
        ] },
        { t: "list", items: [
          "<b>Group fan-out.</b> Store each group message once, in the conversation's partition, and fan out <em>delivery</em>, not storage. A worker loads the cached member list, finds members with live devices, and sends one batched frame per gateway: a 1,000-member group spread over 300 gateways costs ~300 RPCs, not 1,000. Members without a socket get a push unless they muted the group. This is the push-versus-pull choice of the next lesson: chat can push to every member only because groups are capped, and 100k-member channels deliver only to online members while everyone else pulls on reconnect. With end-to-end encryption the client encrypts for each recipient device, or with a shared group sender key as WhatsApp does with the Signal protocol, and the server relays ciphertext.",
          "<b>Presence.</b> Each device heartbeats every ~30 s; the presence service keeps <code>presence:u42</code> in Redis with a ~90 s TTL (gateways batch these refreshes). Missing two to three heartbeats, or a clean close followed by a short debounce, marks the user offline, so a phone in a tunnel does not flap. Do not broadcast to every contact: clients subscribe to presence only for users on screen (the open chat, the visible rows of the chat list). 'Last seen' is just the last heartbeat time.",
          "<b>Offline sync and multi-device.</b> Each device stores locally the last seq it has per conversation. On reconnect it calls <code>/v1/sync</code>; the server reads the user's conversation list and each conversation's <code>last_seq</code> from Redis, returns the conversations where the device is behind, and the client pages in the missing ranges, newest first. Because every device syncs from the same server log, phone and laptop converge on identical history.",
          "<b>Push is a hint, not delivery.</b> APNs and FCM cap payloads at 4 KB, may delay or coalesce notifications, and APNs stores only the latest notification for an offline device. Use push to wake the app or show a preview; the message itself always arrives through the socket or sync.",
          "<b>Gateway failures and reconnect storms.</b> When a gateway holding 250k sockets dies, those clients all reconnect at once. Clients back off with jitter (Chapter 12), registry entries expire by TTL, and nothing is lost because undelivered messages are still in the store. For deploys, drain gateways gradually by telling clients to reconnect elsewhere."
        ] },
        { t: "h", text: "7. Trade-offs and bottlenecks" },
        { t: "table", head: ["Decision", "We chose", "Cost / what to watch"], rows: [
          ["Transport", "WebSocket per device behind an L4 load balancer", "Stateful connections: deploys, reconnect storms, ~1,000 gateways to operate"],
          ["Ordering", "Per-conversation seq from a single owner", "One conversation's throughput is bounded by one owner (thousands of msgs/s, far above human rates); failover needs leases and fencing"],
          ["Storage", "Wide-column store, partition (conv_id, bucket)", "No cross-conversation queries or full-text search without a separate index"],
          ["Delivery", "At-least-once plus client dedupe by seq", "Duplicates on the wire are normal; every client path must be idempotent"],
          ["Receipts", "Per-member cursors", "Exact per-message read times are lost; only 'read up to' survives"],
          ["Presence", "Heartbeats, TTL, subscribe-on-view", "Seconds of staleness; heartbeat volume must stay at the gateway tier"]
        ] },
        { t: "callout", kind: "warn", title: "Classic chat mistakes", html: "Ordering by client timestamps; acking the sender before the message is durable; treating a push notification as the delivery; broadcasting every presence change to every contact; and storing a copy of each group message per recipient, which multiplies storage by group size for no benefit (end-to-end encryption with per-device ciphertext is the one case where per-recipient copies are unavoidable)." }
      ]
    },
    // ---------------------------------------------------------------- Lesson 2: News feed
    {
      id: "news-feed",
      title: "Design a news feed (Twitter / Instagram)",
      minutes: 18,
      blocks: [
        { t: "p", html: "The home feed is the canonical read-heavy fan-out problem: one write (a post) must appear in the feeds of thousands or millions of followers, and feeds are read far more often than posts are written. This walkthrough designs a Twitter/Instagram-style home timeline. Chapter 7 introduced the celebrity hot spot and Chapter 14 previewed fan-out strategies; here the decision is made with numbers." },
        { t: "h", text: "1. Requirements" },
        { t: "list", items: [
          "<b>Functional:</b> create a post (short text, optional images or video stored in object storage behind a CDN, Chapters 5 and 10).",
          "Follow and unfollow; the graph is asymmetric (following needs no approval).",
          "Home feed of posts from followed accounts, ranked, with a chronological option and infinite scroll.",
          "Profile timeline of one user's own posts; like and reply counts on every post."
        ] },
        { t: "list", items: [
          "<b>Fast reads:</b> first feed page under ~200 ms p99 server-side.",
          "<b>Read-heavy:</b> roughly 100 feed reads per post written.",
          "<b>Freshness:</b> followers may see a post a few seconds late (eventual consistency), but the author must see it immediately (read-your-writes, Chapter 7).",
          "<b>Availability:</b> a slightly stale feed beats an error page."
        ] },
        { t: "callout", kind: "interview", title: "The three questions that flip the design", html: "(1) What does the follower distribution look like — is there a long tail of accounts with tens of millions of followers? (2) Ranked or chronological? (3) How deep does the feed go? Users rarely scroll past a few hundred items, which caps how much you precompute. Then say out loud that you will compare fan-out on write with fan-out on read and land on a hybrid; interviewers are waiting for that trade-off." },
        { t: "h", text: "2. Estimates" },
        { t: "code", lang: "text", code: `DAU                 = 300M
Feed loads          = 300M x 10/day = 3B/day -> 3B / 86,400 ≈ 35k QPS avg, ~100k QPS peak
New posts           = 50M/day -> ≈ 600/s avg, ~2k/s peak
Avg followers       = 200
Fan-out inserts     = 50M x 200 = 10B/day -> 10B / 86,400 ≈ 115k inserts/s avg
One celebrity post  = 50M followers -> 50M inserts
                      even at 1M inserts/s for the whole fleet, that is 50 s for ONE post
Timeline cache      = 300M users x 800 ids x 8 B ≈ 1.9 TB raw
                      ~2-3x overhead in Redis -> ~5 TB -> ~80 nodes of 64 GB, plus replicas
Post metadata       = 50M x 1 KB = 50 GB/day ≈ 18 TB/year
Media               = 10M images/day x 500 KB = 5 TB/day -> object storage + CDN` },
        { t: "h", text: "3. API" },
        { t: "code", lang: "http", code: `POST   /v1/posts                 {"text":"...","media_ids":["m_91"]}  -> 201 {"post_id":"1846..."}
GET    /v1/feed?limit=20&cursor=eyJzIjoi...  -> {"items":[...],"next_cursor":"..."}
GET    /v1/users/{user_id}/posts?cursor=...  -> profile timeline
POST   /v1/follows               {"followee_id":"u77"}
DELETE /v1/follows/u77
PUT    /v1/posts/{post_id}/likes/me          -> idempotent like (DELETE to unlike)` },
        { t: "h", text: "4. Data model" },
        { t: "table", head: ["Data", "Key and layout", "Store and why"], rows: [
          ["Posts", "post_id (Snowflake, time-sortable) -> author_id, text, media refs, created_at", "Sharded MySQL or Cassandra by post_id, fronted by a post cache, because every feed page hydrates ~20 posts"],
          ["Follow graph", "followers(followee_id, follower_id) and following(follower_id, followee_id)", "Two copies, each sharded by its first column, so 'all followers of X' and 'everyone X follows' are single-shard scans"],
          ["Author timeline", "author_id -> recent post_ids", "Redis list per author; serves profiles and the celebrity merge"],
          ["Home timeline", "user_id -> up to ~800 post_ids, newest first", "Redis lists; a cache rebuildable from graph and author timelines; kept only for active users"],
          ["Counters", "post_id -> likes, replies, reposts", "Counter service: sharded counters in Redis, flushed to the database in batches"],
          ["Media", "media_id -> object key, renditions", "Object storage plus CDN; the feed carries only URLs"]
        ] },
        { t: "h", text: "5. High-level design" },
        { t: "diagram", caption: "Writes go through Kafka to fan-out workers that push post IDs into followers' cached timelines; reads assemble a page from that cache plus celebrity author timelines, then hydrate and rank.", code: `flowchart LR
  U(("Client")) --> GW["API gateway"]
  GW -->|"POST post"| PS["Post service"]
  PS --> PDB[("Posts DB")]
  PS --> AT[("Redis<br/>author timelines")]
  PS -.->|"post created"| K[["Kafka"]]
  K --> FO["Fan-out workers"]
  FO -->|"followers of author"| SG[("Social graph")]
  FO -->|"push id, trim to 800"| HT[("Redis<br/>home timelines")]
  GW -->|"GET feed"| FS["Feed service"]
  FS --> HT
  FS -->|"celebrity posts"| AT
  FS -->|"hydrate"| PC[("Post cache")]
  FS --> RK["Ranking service"]` },
        { t: "p", html: "<b>Write path:</b> the post service stores the post, appends its ID to the author's timeline and emits <code>post_created</code>. Fan-out workers page through the author's followers in batches of a few thousand and push the post ID onto each active follower's home timeline, trimming to ~800 entries. Only 8-byte IDs are fanned out, never post bodies, so an edit never needs a second fan-out. <b>Read path:</b> the feed service reads the user's precomputed ID list, merges recent posts from any celebrity accounts they follow, hydrates the IDs with a multi-get against the post cache (plus counts and author profiles), ranks, and returns 20 items with a cursor. The author's own latest posts are merged from their author timeline, so they always see their post instantly even if fan-out lags." },
        { t: "h", text: "6. Deep dives" },
        { t: "compare", items: [
          { title: "Fan-out on write (push)", pros: ["A feed read is one cache lookup: fast and predictable", "Work is done once per post, off the request path"], cons: ["Write amplification: one post becomes follower-count inserts", "Celebrity posts land slowly and hammer the cache", "Wasted work for followers who never open the app"], use: "Ordinary accounts below a follower threshold in a read-heavy product." },
          { title: "Fan-out on read (pull)", pros: ["Writes are trivial: append to the author's timeline", "No wasted work for inactive users; always fresh"], cons: ["Every read fans in across hundreds of followees", "High, variable read latency; harder to rank and paginate"], use: "Celebrity authors, returning inactive users, or small systems." },
          { title: "Hybrid", pros: ["Push for normal authors, pull only for the few celebrities a reader follows", "Bounds both write amplification and read fan-in"], cons: ["Two code paths to build, test and keep consistent", "Threshold tuning, and accounts that cross it"], use: "The standard answer at Twitter or Instagram scale." }
        ] },
        { t: "p", html: "<b>The celebrity hybrid in detail.</b> Mark accounts above a follower threshold (say 100k to 1M, tuned from fan-out lag metrics) as <em>pull</em> authors; their posts go only to their author timeline. At read time the feed service looks up which pull authors the reader follows — usually a few dozen at most, cached per user — reads their newest post IDs in one pipelined Redis round trip, and merges them with the precomputed list by post ID, which sorts by time because it is a Snowflake. Following 30 celebrities costs ~30 cheap reads per feed load instead of 50M writes per celebrity post. The same idea covers inactive users from the other side: skip fan-out to anyone who has not opened the app in ~30 days, and rebuild their timeline by pulling when they return. Rebuilds also cover a lost Redis node, because the home timeline is a cache, not the source of truth." },
        { t: "diagram", caption: "A feed read merges the precomputed timeline with celebrity posts pulled at read time, filters, hydrates and ranks, then freezes the ranked list for stable pagination.", code: `sequenceDiagram
  participant C as Client
  participant F as Feed service
  participant HT as Home timeline cache
  participant G as Graph cache
  participant AT as Author timelines
  participant PC as Post cache
  participant R as Ranker
  C->>F: GET /v1/feed?limit=20
  F->>HT: read newest 200 ids for user u1
  F->>G: which followees of u1 are pull authors
  G-->>F: 12 celebrity ids
  F->>AT: pipelined read of newest ids for 12 authors
  F->>F: merge by Snowflake id, drop blocked or muted
  F->>PC: multi-get posts, counts and authors
  PC-->>F: hydrated posts, deleted ones missing
  F->>R: score about 200 candidates
  R-->>F: ordered list
  F->>F: cache ranked list for this session
  F-->>C: first 20 items and next_cursor` },
        { t: "p", html: "<b>Ranking.</b> A ranked feed is a two-stage pipeline. Candidate generation gathers a few hundred post IDs: the precomputed timeline, the celebrity merge and optionally recommended posts from accounts the user does not follow. Scoring hydrates features — affinity with the author, post age, engagement so far, media type — and a model predicts the probability of engagement; a heuristic such as <code>affinity x engagement / (age_hours + 2)^1.5</code> is a fine interview stand-in. A final pass applies rules: dedupe, author diversity (not five posts in a row from one account) and freshness. Rank when the feed is opened, not at fan-out time, because scores decay with age and depend on the reader." },
        { t: "p", html: "<b>Pagination.</b> Offset pagination breaks on a live feed: new posts push everything down, so page 2 repeats items from page 1 (Chapter 11). For a chronological feed, use a keyset cursor — 'items with post_id below the last one I saw' — which is stable because Snowflake IDs sort by time. For a ranked feed, scores move between requests, so rank once per session, cache the ordered ID list (a few KB) for 10–30 minutes, and make the cursor an opaque token holding the session ID and position. Pull-to-refresh starts a new session." },
        { t: "list", items: [
          "<b>Hot posts and counters.</b> A viral post is hydrated millions of times a minute: replicate the hot key or keep a small in-process cache on feed servers (Chapter 5). Likes go to sharded counters (N sub-keys per post, summed on read) flushed to the database in batches; a count a few seconds stale is fine.",
          "<b>Deletes, blocks and privacy.</b> Never chase a deleted post through millions of timelines. Hydration drops IDs whose post no longer exists and the read path filters blocked or muted authors, so correctness lives on the read side.",
          "<b>Follow and unfollow.</b> On follow, asynchronously backfill the newest ~20 posts of the new followee; on unfollow, filter at read time and let stale IDs age out of the capped list.",
          "<b>Fan-out throughput.</b> Key the Kafka topic by author_id so one author's posts fan out in order, and batch Redis writes with pipelines: at ~115k inserts/s average, about a dozen workers each sustaining ~10k pipelined writes/s cover the average, and autoscaling on consumer lag covers peaks."
        ] },
        { t: "callout", kind: "example", title: "Twitter's timelines", html: "Twitter's 2012 'Timelines at Scale' talk described this architecture: tweets fanned out on write into Redis-backed home timelines capped at roughly 800 entries, with accounts that have tens of millions of followers called out as the hard case for fan-out latency." },
        { t: "h", text: "7. Trade-offs and bottlenecks" },
        { t: "table", head: ["Bottleneck / risk", "Mitigation"], rows: [
          ["Celebrity write amplification", "Hybrid: pull authors merged at read time; threshold tuned from fan-out lag"],
          ["Redis memory for timelines", "Store IDs only, cap at ~800, skip inactive users, rebuild on demand"],
          ["Hydration latency (20+ lookups per page)", "Multi-get against the post cache, cached author profiles, hot-key replication"],
          ["Fan-out lag during spikes (big news events)", "Kafka absorbs bursts; workers autoscale on consumer lag; authors see their own posts via read-time merge"],
          ["Ranking cost", "Score a few hundred candidates, not thousands; cache the ranked list per session"],
          ["Deleted or blocked content in timelines", "Filter at read time; never depend on timeline cleanup"]
        ] },
        { t: "callout", kind: "warn", title: "Two classic mistakes", html: "Choosing pure fan-out on write and hand-waving the celebrity case, and storing full post bodies in every follower's timeline — that multiplies storage by follower count and turns every edit into a fan-out job. Fan out IDs; hydrate on read." }
      ]
    },
    // ---------------------------------------------------------------- Lesson 3: Notifications
    {
      id: "notification-system",
      title: "Design a notification system",
      minutes: 16,
      blocks: [
        { t: "p", html: "Almost every product needs to reach users outside the app: one-time passwords (OTPs), 'your order shipped', 'Alice mentioned you', marketing campaigns. A notification system is a shared platform that other teams call; it decides <em>how</em> to deliver a message (channel, template, timing, retries), not <em>whether</em> the business event happened. Chat (Lesson 1) and the feed (Lesson 2) both use it for anyone who is offline. Its core is queues and delivery semantics from Chapter 9 and resilience patterns from Chapter 12." },
        { t: "h", text: "1. Requirements" },
        { t: "list", items: [
          "<b>Functional:</b> send through push (APNs for iOS, FCM for Android and web), SMS, email and an in-app inbox.",
          "Triggered by internal services (transactional: OTP, receipts, mentions) and by a campaign tool (bulk: millions of users per send).",
          "Templates per channel and language; user preferences per category and channel; quiet hours in the user's time zone.",
          "Scheduled sends; delivery tracking (sent, delivered, opened, clicked, failed); device token registration."
        ] },
        { t: "list", items: [
          "<b>Latency by priority:</b> OTP and security alerts in a few seconds; marketing may take tens of minutes.",
          "<b>No loss:</b> an accepted notification is eventually sent or explicitly marked failed (at-least-once).",
          "<b>No spam:</b> deduplicate retries, enforce per-user frequency caps, honor opt-outs (also a legal requirement for marketing email and SMS).",
          "<b>Isolation:</b> a 100M-user campaign must not delay a password-reset code; a provider outage must not stall other channels."
        ] },
        { t: "callout", kind: "interview", title: "Clarify the shape of the traffic", html: "Ask which channels, transactional versus marketing split, latency per class, whether the platform owns user preferences, and whether exactly-once is expected. Then say early that exactly-once to an external provider is not achievable — a worker can crash after the provider accepted the message but before recording it — so the goal is at-least-once with deduplication, which makes duplicates rare rather than impossible." },
        { t: "h", text: "2. Estimates" },
        { t: "code", lang: "text", code: `Push          = 2B/day   -> 2B / 86,400 s ≈ 23k/s avg
Email         = 300M/day -> ≈ 3.5k/s avg
SMS           = 20M/day  -> ≈ 230/s avg (OTP and critical alerts)
Campaign      = 100M users in 30 min -> 100M / 1,800 s ≈ 55k/s on top of baseline
                -> size workers and provider quotas for ~100k/s at peak
SMS cost      ≈ $0.01 per message incl. carrier fees -> 20M x $0.01 ≈ $200k/day
                -> SMS is reserved for messages that justify the cost
Log           = 2.3B/day x 500 B ≈ 1.2 TB/day, kept 90 days ≈ 105 TB
Dedupe keys   = 2.3B/day x ~60 B ≈ 140 GB in a Redis cluster with a 24 h TTL` },
        { t: "h", text: "3. API" },
        { t: "code", lang: "http", code: `POST /v1/notifications
Idempotency-Key: order-981-shipped
{"user_id":"u42","category":"order_update","template":"order_shipped",
 "params":{"order_id":"981","eta":"Fri"},"priority":"high","channels":["push","email"]}
-> 202 Accepted {"notification_id":"n_7d1"}

POST /v1/campaigns   {"segment_id":"lapsed_30d","template":"winback_v3",
                      "send_at":"2026-11-01T17:00:00","local_time":true}
PUT  /v1/users/u42/preferences
     {"marketing":{"email":false},"quiet_hours":{"from":"22:00","to":"07:00","tz":"Asia/Kolkata"}}
POST /v1/devices     {"user_id":"u42","platform":"ios","token":"a9f3..."}
GET  /v1/users/u42/inbox?cursor=...          (in-app notification center)` },
        { t: "h", text: "4. Data model" },
        { t: "table", head: ["Data", "Key", "Store and why"], rows: [
          ["Device tokens", "(user_id, device_id) -> platform, token, app_version, last_active, enabled", "PostgreSQL or DynamoDB; read on every push, updated on app launch and when a provider reports a dead token"],
          ["Preferences", "user_id -> opt-in per category x channel, quiet hours, time zone, locale", "PostgreSQL as the source of truth, cached in Redis because every send reads it"],
          ["Templates", "(template_id, version, channel, locale) -> subject, body with placeholders", "PostgreSQL, cached in process: tiny and rarely changed"],
          ["Notification log and inbox", "PK user_id, clustering notification_id -> channel, status history, provider message id", "Cassandra with a 90-day TTL: write-heavy, read per user"],
          ["Idempotency, dedupe, caps", "idem:{key}, sent:{notification_id}:{device}, cap:{user}:{category}:{day}", "Redis with TTLs: fast SET NX and counters"]
        ] },
        { t: "h", text: "5. High-level design" },
        { t: "diagram", caption: "Intake is decoupled from delivery: routers apply preferences and templates once, then each channel has its own topics and worker pool so one slow provider or a huge campaign cannot block the others.", code: `flowchart LR
  P(("Services and<br/>campaign tool")) --> API["Notification API"]
  API -->|"idempotency key"| RD[("Redis<br/>dedupe and caps")]
  API --> K[["Kafka intake"]]
  K --> RT["Router workers"]
  RT -->|"prefs, tokens, template"| PR[("Prefs, devices,<br/>templates")]
  RT --> QP[["Push topics<br/>high and low"]]
  RT --> QE[["Email topic"]]
  RT --> QS[["SMS topic"]]
  QP --> WP["Push workers<br/>to APNs and FCM"]
  QE --> WE["Email workers<br/>to SES or SendGrid"]
  QS --> WS["SMS workers<br/>primary and backup vendor"]
  WP -.->|"status"| LOG[("Cassandra<br/>notification log")]
  WE -.->|"status"| LOG
  WS -.->|"status"| LOG` },
        { t: "p", html: "The API validates the request, rejects a repeated idempotency key, writes to the intake topic and returns <code>202 Accepted</code>; callers never wait on a provider. Router workers expand the request: look up the user's preferences and devices, drop channels the user opted out of, defer the send to the end of quiet hours (through the delayed-job scheduler from Chapter 9) unless it is critical, check frequency caps, render the template in the user's language, and emit one job per device or address to the right channel and priority topic. Channel workers call the provider and record the result; provider callbacks (SES events, Twilio status webhooks) update the log later." },
        { t: "h", text: "6. Deep dives" },
        { t: "diagram", caption: "The worker claims a dedupe key before calling the provider and classifies the response: success is logged, a dead token is disabled, and only transient errors are retried.", code: `sequenceDiagram
  participant OS as Order service
  participant API as Notification API
  participant K as Kafka
  participant R as Router
  participant W as Push worker
  participant AP as APNs
  participant L as Notification log
  OS->>API: POST notification, Idempotency-Key order-981-shipped
  API->>API: SET NX idempotency key, first time seen
  API->>K: enqueue on intake topic
  API-->>OS: 202 notification_id n_7d1
  K->>R: consume n_7d1
  R->>R: prefs, quiet hours, frequency cap, render template
  R->>K: one job per device on push-high topic
  K->>W: job for n_7d1 and device d1
  W->>W: claim dedupe key n_7d1 d1 with short lease
  W->>AP: HTTP/2 POST to device token
  alt 200
    AP-->>W: accepted with apns-id
    W->>L: mark sent
  else 410 Unregistered
    AP-->>W: token is dead
    W->>L: mark failed and disable token
  else 429 or 5xx
    AP-->>W: transient error
    W->>K: publish to retry topic with backoff
  end` },
        { t: "p", html: "<b>Deduplication without exactly-once.</b> Duplicates come from two places: a caller retrying its HTTP request, and Kafka redelivering after a worker crash. The API handles the first with the idempotency key (<code>SET idem:key NX EX 86400</code>). The worker handles the second with a per-(notification, device) key: it claims the key with a short lease before calling the provider and marks it <em>sent</em> afterwards. A redelivered job that finds <em>sent</em> skips; one that finds an expired claim sends again. The remaining window — provider accepted, worker died before marking — is why the result is 'almost never twice', not 'exactly once'. Kafka transactions do not help here: they cover Kafka-to-Kafka processing, not an HTTP call to Apple. For push, also set <code>apns-collapse-id</code> or an FCM <code>collapse_key</code> so a duplicate replaces the earlier notification on the device instead of stacking." },
        { t: "table", head: ["Response class", "Examples", "Action"], rows: [
          ["Transient", "5xx, timeout, connection reset, FCM UNAVAILABLE", "Retry with exponential backoff and jitter through delay topics (30 s, 2 min, 10 min), then dead-letter queue"],
          ["Throttled", "429, FCM QUOTA_EXCEEDED, SES throttling", "Shrink that provider's token bucket and retry later; not a failure"],
          ["Permanent for the recipient", "APNs 410 Unregistered, FCM UNREGISTERED, email hard bounce, invalid phone number", "Never retry; disable the token or add the address to a suppression list"],
          ["Bad request", "Missing template parameter, payload over the 4 KB push limit", "Never retry; dead-letter and alert the producing team"],
          ["Provider outage", "Error rate above threshold for minutes", "Circuit breaker opens (Chapter 12); route SMS and email to the backup vendor"]
        ] },
        { t: "list", items: [
          "<b>Priority isolation.</b> Separate topics and worker pools per channel and per priority — bulkheads. OTPs flow through <code>sms-high</code>, which is never shared with marketing. A campaign planner does not dump 100M jobs at once: it expands the segment in batches of ~10k, releases them through a token bucket sized to the provider quota, and with <code>local_time</code> spreads sends across time zones.",
          "<b>Preferences and quiet hours.</b> Categories carry a policy: security and transactional messages cannot be turned off, marketing honors opt-out on every channel. Preferences are read at send time (from cache, invalidated on write) so an unsubscribe takes effect within seconds, not at the next campaign build.",
          "<b>Frequency caps and aggregation.</b> Per-user caps such as 'at most 3 marketing pushes a day' are Redis counters keyed by user, category and day (Chapter 11 covers the window algorithms). Social notifications are aggregated: hold likes for a post in a 1–5 minute window keyed by (user, category, object) and send 'Alice and 12 others liked your photo' once.",
          "<b>Templates.</b> Versioned per channel and locale, rendered by the router, parameters validated at the API so a bad request fails fast. Store the rendered content or template version in the log so support can see exactly what a user received.",
          "<b>Tracking.</b> Providers report delivery asynchronously: SES publishes delivery and bounce events, Twilio calls a status webhook. APNs and FCM confirm acceptance, not display, so the app reports 'received' and 'opened' itself. Email opens via tracking pixels are unreliable since Apple Mail Privacy Protection preloads images; click-through via redirect links is the more trustworthy signal."
        ] },
        { t: "h", text: "7. Trade-offs and bottlenecks" },
        { t: "table", head: ["Decision", "Choice", "Trade-off"], rows: [
          ["Delivery semantics", "At-least-once plus dedupe keys", "Rare duplicates in the crash window between provider accept and status write"],
          ["Queue layout", "Topics per channel and priority", "More topics and pools to operate, but critical messages never queue behind bulk"],
          ["Preference check", "At send time, cached", "Cache invalidation needed so opt-outs apply within seconds"],
          ["Campaign pacing", "Token bucket per provider", "A 100M-user campaign takes tens of minutes by design"],
          ["Providers", "Primary plus backup for SMS and email", "Two integrations, template parity, different delivery reports"],
          ["Log store", "Cassandra with TTL", "No ad-hoc analytics; stream status events to the warehouse (Chapter 10)"]
        ] },
        { t: "callout", kind: "warn", title: "What weak answers miss", html: "Calling providers synchronously inside the caller's request; one shared queue for OTPs and campaigns; retrying permanent failures forever (wasted capacity, and repeated hard bounces damage email sender reputation — Amazon SES can pause an account whose bounce rate stays high); ignoring time zones for quiet hours and campaigns; and claiming exactly-once delivery to an external provider." }
      ]
    },
    // ---------------------------------------------------------------- Lesson 4: Video conferencing
    {
      id: "video-conferencing",
      title: "Design video conferencing (Zoom / Google Meet)",
      minutes: 20,
      blocks: [
        { t: "p", html: "Video calls are the one design in this chapter where the main data path is not HTTP, not TCP and not a database: it is real-time media over UDP, where a packet that arrives 300 ms late is as useless as a lost one. The design separates three planes. The <b>control plane</b> (create meeting, join, permissions) is ordinary REST. The <b>signaling plane</b> exchanges session descriptions and network candidates over a WebSocket. The <b>media plane</b> carries encrypted audio and video between clients and media servers. Chapter 2 introduced WebRTC; this lesson builds a service on top of it." },
        { t: "h", text: "1. Requirements" },
        { t: "list", items: [
          "<b>Functional:</b> create a meeting and share a link; join from browser or app; 1:1 and group calls up to ~200 interactive participants.",
          "Audio, video and screen share; mute, active speaker, gallery and speaker layouts; in-meeting chat (reuses Lesson 1).",
          "Cloud recording; host controls such as waiting room and remove participant."
        ] },
        { t: "list", items: [
          "<b>Latency:</b> mouth-to-ear under ~150 ms one way, the ITU-T G.114 guideline for natural conversation; above ~400 ms people talk over each other.",
          "<b>Adapt to networks:</b> keep audio intact and degrade video gracefully under packet loss or low bandwidth; one weak participant must not degrade everyone.",
          "<b>Connect from anywhere:</b> behind NATs and corporate firewalls that block UDP.",
          "<b>Scale:</b> ~10M concurrent participants at peak; media encrypted in transit (WebRTC mandates DTLS-SRTP)."
        ] },
        { t: "callout", kind: "interview", title: "Name the three planes early", html: "Ask about maximum meeting size, the 1:1 versus group mix, recording, dial-in and end-to-end encryption. Then say: 'I will separate control, signaling and media. Signaling is not part of WebRTC — we build it, usually on WebSockets. For media I will compare mesh, MCU and SFU with bandwidth numbers and pick an SFU with simulcast.' Interviewers listen for the topology trade-off and for NAT traversal with STUN and TURN." },
        { t: "h", text: "2. Estimates" },
        { t: "code", lang: "text", code: `Peak concurrent participants = 10M, average meeting size 5 -> 2M live meetings
Bitrates     720p ≈ 1.5 Mbps, 360p ≈ 500 kbps, 180p ≈ 150 kbps, Opus audio ≈ 40 kbps
Uplink       3 simulcast layers + audio ≈ 1.5 + 0.5 + 0.15 + 0.04 ≈ 2.2 Mbps per sender
Downlink     5-person call: 1 speaker at 720p + 3 tiles at 360p + audio
             ≈ 1.5 + 1.5 + 0.1 ≈ 3.1 Mbps per receiver
Mesh check   5 people: each uploads 4 x 1.5 = 6 Mbps, 10 people: 13.5 Mbps -> not viable
SFU fleet    ingress  10M x 2.2 Mbps = 22 Tbps
             egress   10M x 3.1 Mbps ≈ 31 Tbps
Per SFU      ~2.5 Gbps egress (packet rate and SRTP crypto bound) / 3.1 Mbps ≈ 800 users
Fleet        10M / 800 ≈ 12,500 SFU servers across ~20 regions
TURN         assume 10% relayed x (2.2 + 3.1) Mbps ≈ 1M x 5.3 Mbps ≈ 5.3 Tbps relay capacity
Recording    2% of meetings = 40k x 1.5 Mbps = 60 Gbps ≈ 27 TB per peak hour` },
        { t: "h", text: "3. API" },
        { t: "code", lang: "http", code: `POST /v1/meetings          {"title":"Design review","waiting_room":true}
  -> 201 {"meeting_id":"m-482-913","join_url":"https://meet.example.com/m-482-913"}

POST /v1/meetings/m-482-913/join
  -> {"participant_id":"p7","token":"eyJ...","signaling_url":"wss://sig-eu1.example.com",
      "ice_servers":[{"urls":"stun:stun.example.com:3478"},
        {"urls":"turns:turn-eu1.example.com:443?transport=tcp",
         "username":"1793000000:p7","credential":"hmac..."}]}

# Signaling over the WebSocket (JSON frames)
  {"type":"offer","sdp":"..."}          {"type":"answer","sdp":"..."}
  {"type":"candidate","candidate":"..."}
  {"type":"subscribe","track":"p3-video","layer":"low"}
  {"type":"active_speaker","participant":"p3"}

POST /v1/meetings/m-482-913/recordings      (host only) -> {"recording_id":"r-55"}` },
        { t: "h", text: "4. Data model" },
        { t: "table", head: ["Data", "Store", "Notes"], rows: [
          ["Meetings", "PostgreSQL", "meeting_id, host_id, schedule, settings, passcode hash: durable and low volume"],
          ["Live room state", "Redis hash per meeting, with TTL", "Participants, roles, mute state, who is presenting, assigned SFU: ephemeral; clients re-announce themselves after a failover"],
          ["SFU registry", "etcd or Redis, refreshed by heartbeats", "sfu_id, region, public IP, current participants and egress: used by the allocator"],
          ["Recordings", "PostgreSQL row plus object storage", "Metadata row; media files in S3-style storage with lifecycle tiering"],
          ["Call-quality stats", "Kafka to the warehouse", "Per-participant RTT, jitter, loss and bitrate every ~10 s for debugging and capacity planning"]
        ] },
        { t: "h", text: "5. High-level design" },
        { t: "diagram", caption: "Control and signaling run over HTTPS and WebSockets; media takes a separate UDP path to the nearest SFU, falling back to a TURN relay, with SFUs cascading between regions.", code: `flowchart LR
  A(("Participants")) -->|"join over HTTPS"| MS["Meeting service"]
  MS --> PG[("PostgreSQL<br/>meetings")]
  A -->|"WebSocket: SDP, ICE, events"| SIG["Signaling servers"]
  SIG --> RS[("Redis<br/>room state")]
  SIG -->|"pick SFU near users"| AL["SFU allocator"]
  AL --> REG[("SFU registry<br/>load by region")]
  A -.->|"STUN binding"| ST["STUN server"]
  A ==>|"SRTP over UDP"| SFU1["SFU region A"]
  A -.->|"fallback when UDP blocked"| TU["TURN relay"]
  TU -.-> SFU1
  SFU1 ==>|"cascade, one copy per stream"| SFU2["SFU region B"]
  SFU1 -->|"subscribe to all tracks"| REC["Recording bot"]
  REC --> OS[("Object storage")]` },
        { t: "p", html: "<b>Join path:</b> the client calls the meeting service, which checks permissions and returns a short-lived token, the signaling URL and ICE servers with temporary TURN credentials (an HMAC over an expiry time, so leaked credentials stop working quickly). The client opens the signaling WebSocket; signaling asks the allocator for an SFU in the meeting's region with spare capacity and records the assignment in Redis. <b>Media path:</b> the client exchanges an SDP offer and answer with the SFU through signaling, ICE finds a working network path, a DTLS handshake derives SRTP keys, and from then on audio and video flow directly between client and SFU. The SFU forwards each incoming stream to the other participants without decoding it." },
        { t: "h", text: "6. Deep dives" },
        { t: "p", html: "<b>Getting through NATs: ICE, STUN and TURN.</b> Most devices sit behind NAT and do not know their public address. <b>ICE</b> (Interactive Connectivity Establishment) gathers candidate addresses and tests them in pairs: <em>host</em> candidates (local interfaces), <em>server-reflexive</em> candidates learned by asking a <b>STUN</b> server 'what IP and port do you see me as' (one cheap request and response, no media), and <em>relay</em> candidates allocated on a <b>TURN</b> server, which forwards all media when nothing else works — symmetric NATs, or firewalls that allow only TCP or TLS on port 443. STUN matters most for peer-to-peer 1:1 calls. With an SFU on a public IP running ICE-lite, the client can usually reach it directly and the SFU learns the client's public address from the connectivity checks themselves; TURN over TLS on 443, or ICE-TCP on the SFU, covers networks that block UDP. TURN costs real bandwidth, so deploy it in every region and use it only when needed." },
        { t: "diagram", caption: "Signaling carries the SDP offer and answer and the ICE candidates; once a candidate pair passes connectivity checks, DTLS sets up SRTP keys and media flows directly between client and SFU.", code: `sequenceDiagram
  participant C as Client
  participant M as Meeting service
  participant S as Signaling
  participant ST as STUN server
  participant F as SFU
  C->>M: POST join meeting m-482
  M-->>C: token, signaling URL, STUN and TURN servers
  C->>S: WebSocket join with token
  S->>F: allocate slot for meeting m-482
  F-->>S: ready, ICE-lite, public IP
  C->>C: capture camera, encode 3 simulcast layers
  C->>S: SDP offer with simulcast layers
  S->>F: forward offer
  F-->>S: SDP answer with SFU candidates
  S-->>C: answer
  C->>ST: STUN binding request
  ST-->>C: your public IP and port
  C->>S: trickle ICE candidates
  S->>F: candidates
  C->>F: ICE connectivity checks over UDP
  F-->>C: check succeeds, pair selected
  C->>F: DTLS handshake, derive SRTP keys
  C->>F: SRTP audio and video
  S-->>C: roster and tracks of others to subscribe` },
        { t: "compare", items: [
          { title: "Mesh (peer to peer)", pros: ["No media servers to run", "Lowest latency on a direct path; end-to-end encryption is natural"], cons: ["Each client encodes and uploads N-1 streams: 10 people need ~13.5 Mbps uplink", "CPU and battery cost grow with every participant"], use: "1:1 calls and groups of 3–4." },
          { title: "MCU (Multipoint Control Unit)", pros: ["Each client receives one composited stream: minimal downlink and decoding", "Works for weak devices, phone dial-in and SIP room systems; easy recording"], cons: ["Server decodes, mixes and re-encodes every stream: very CPU-heavy", "Adds encoding latency, fixed layouts, quality loss; cannot work with end-to-end encryption"], use: "Telephony and legacy room-system bridges, composited recording or live-stream output." },
          { title: "SFU (Selective Forwarding Unit)", pros: ["Forwards packets without decoding: cheap CPU and little added latency", "Each client uploads once; the server picks per-receiver quality, layouts are client-side"], cons: ["Downlink grows with the number of visible streams", "Large egress bandwidth bill; end-to-end encryption needs insertable streams"], use: "The default for group calls from 3 to a few hundred participants." }
        ] },
        { t: "p", html: "<b>Simulcast and bandwidth adaptation.</b> With simulcast the sender encodes its camera at three qualities — say 720p at 1.5 Mbps, 360p at 500 kbps and 180p at 150 kbps — and sends all three to the SFU. The SFU then chooses per receiver and per stream: the active speaker's large tile gets the high layer, thumbnails get the low one, and a receiver on a 1 Mbps hotel network gets low layers for everyone, without dragging other participants down. The SFU estimates each receiver's downlink from congestion-control feedback (transport-wide congestion control and Google Congestion Control in WebRTC), switches layers at keyframes (requesting one with a PLI message), and tells senders to pause layers nobody is watching. Scalable Video Coding (SVC, in VP9 and AV1) achieves the same with one layered stream the SFU can thin out. For audio, the SFU forwards only the three or so loudest speakers, using the audio-level header extension (RFC 6464) so it never has to decode audio to know who is talking." },
        { t: "list", items: [
          "<b>Allocating and cascading SFUs.</b> The allocator places a meeting on an SFU in the region closest to its participants, with headroom for growth. Participants on other continents connect to their own nearest SFU, and the SFUs cascade: each stream crosses the backbone once per remote SFU, rather than once per remote participant over the public internet. Meetings too big for one server are split across several SFUs in a region in the same way.",
          "<b>Failure handling.</b> SFUs heartbeat into the registry. When one dies, signaling sees its sessions drop, the allocator assigns a new SFU, and clients set up a fresh session with it (new SDP offer and answer, ICE and DTLS handshake; an ICE restart alone only covers a network change to the same SFU); users see a freeze of a few seconds. Nothing durable is lost because an SFU holds only in-flight packets, and room state lives in Redis so a signaling server can also fail over.",
          "<b>Quality under loss.</b> Media uses UDP because TCP's retransmission and head-of-line blocking (Chapter 2) turn one lost packet into a stall. Receivers keep a small jitter buffer (tens of ms); video recovers lost packets with NACK-based retransmission when RTT is small, audio uses Opus in-band FEC, heavy loss triggers a keyframe request, and congestion control lowers bitrate before router queues build up.",
          "<b>Recording.</b> A recording bot joins as a hidden participant and subscribes to every track. Writing each track separately is cheap and lets you composite offline in any layout; compositing live (MCU-style) is needed only to live-stream to a platform such as YouTube. Segments go to object storage with multipart upload, then a transcoding job produces playback renditions (Chapter 17).",
          "<b>Webinars with 10,000 viewers.</b> Keep the few interactive speakers on the SFU and give viewers a composited HLS stream through a CDN, accepting several seconds of delay (low-latency HLS gets it down to a few seconds) in exchange for CDN-scale fan-out."
        ] },
        { t: "callout", kind: "example", title: "Discord voice", html: "Discord's 2018 engineering post on handling 2.5 million concurrent voice users with WebRTC describes clients connecting to Discord's own SFU, written in C++, rather than to each other, with voice servers deployed in many regions so users reach a nearby one." },
        { t: "h", text: "7. Trade-offs and bottlenecks" },
        { t: "table", head: ["Decision", "Choice", "Trade-off"], rows: [
          ["Media topology", "SFU with simulcast; optional peer-to-peer for 1:1", "Large server egress bill; client downlink grows with visible tiles"],
          ["Transport", "SRTP over UDP; ICE-TCP or TURN over TLS 443 as fallback", "TCP fallback adds latency and stalls under loss"],
          ["Placement", "Nearest-region SFU, cascade across regions", "An extra backbone hop and more complex routing for global meetings"],
          ["NAT traversal", "TURN in every region, short-lived credentials", "Relay bandwidth is the most expensive traffic per user"],
          ["Encryption", "DTLS-SRTP hop by hop; optional end-to-end via insertable streams", "With end-to-end encryption the server cannot record, transcribe or composite"],
          ["Recording", "Per-track capture, composite offline", "Recording is available minutes after the meeting rather than instantly"]
        ] },
        { t: "callout", kind: "warn", title: "Common video-call mistakes", html: "Calling WebRTC 'peer-to-peer' and drawing a mesh for a 50-person call; forgetting that signaling is yours to build; sending media over TCP or WebSockets; leaving out TURN, so a slice of corporate users can never connect; and having the SFU transcode, which turns it into an MCU with MCU costs." }
      ]
    },
  ],
  takeaways: [
    "Chat: one WebSocket per device on gateways that only hold connections; a Redis session registry maps user and device to gateway, and the chat service owns message logic.",
    "Order messages by a per-conversation sequence number assigned by the single owner of that conversation, and dedupe retries with a client-generated message ID. Never order by client clocks.",
    "Ack the sender only after a durable quorum write. Delivery is at-least-once with client dedupe by seq, and receipts are per-member cursors (last_delivered_seq, last_read_seq), not per-message rows.",
    "Presence is heartbeats plus a TTL key plus subscribe-on-view; push notifications are a wake-up hint, and offline devices catch up by syncing from the server-side log.",
    "Feed: fan out post IDs, not bodies. Push to followers for normal authors, pull celebrity posts at read time and merge, skip inactive users, and treat the home timeline as a rebuildable cache.",
    "Ranked feeds are candidate generation plus scoring at read time; paginate with an opaque cursor over a per-session ranked list, and use keyset cursors on time-sortable IDs for chronological feeds.",
    "Notifications: accept with 202 and an idempotency key, apply preferences, quiet hours, caps and templates once, then use separate queues and workers per channel and priority so OTPs never wait behind campaigns.",
    "Exactly-once delivery to APNs, FCM, SMS or email providers is impossible; aim for at-least-once with dedupe keys and collapse IDs, retry only transient errors, and disable dead tokens.",
    "Video calls have three planes: control (REST), signaling (your own WebSocket service carrying SDP and ICE candidates) and media (SRTP over UDP). ICE tries host, STUN server-reflexive and TURN relay candidates; TURN over TLS on 443 rescues UDP-blocked networks.",
    "An SFU with simulcast is the default for group calls: each sender uploads once in several qualities and the SFU picks a layer per receiver. Mesh suits 1:1, an MCU suits dial-in and composited output, and SFUs cascade across regions."
  ],
  mcqs: [
    { q: "In a group chat, two members send a message at almost the same instant from phones whose clocks differ by 40 seconds. How should the system guarantee that every member sees the same order?",
      options: ["Sort by the timestamp each phone attaches when the user taps send", "Have each gateway deliver messages in the order it received them", "Have the conversation's owner server assign a sequence number", "Publish to Kafka with a random partition key and order by offset"],
      answer: 2, level: "medium",
      explain: "One owner per conversation assigns a dense, increasing <code>seq</code>, so there is exactly one order and clients can detect gaps. Client clocks drift, gateways see different arrival orders, and offsets from different partitions are not comparable, which is why the Kafka key must be the conv_id." },
    { q: "When should a chat client show the sender's first tick ('sent')?",
      options: ["After the server has durably written the message to the message store", "As soon as the gateway receives the frame over the WebSocket", "When the push notification to the recipient has been handed to APNs or FCM", "When the recipient's device acknowledges receiving the message"],
      answer: 0, level: "easy",
      explain: "The first tick is the server's promise that the message will not be lost, so it must follow a durable (quorum) write. Acking at the gateway can lose messages if the next hop fails; the recipient device's ack is what drives the second tick, 'delivered'." },
    { q: "A 500-member group shows 'read by N' for each message. What is the most efficient way to store read state?",
      options: ["A row per (message, member), written when that member reads it", "A Redis set of reader IDs per message, expired with a 30-day TTL", "A read counter per message, incremented once by every reader", "A last-read seq cursor per (conversation, member), moved on read"],
      answer: 3, level: "medium",
      explain: "Reading is monotonic: 'read up to 1044' implies everything before it is read, so one cursor write per read action covers any number of messages. Per-message rows or sets multiply writes by group size, and a bare counter cannot say who read or be safely retried." },
    { q: "You need online and last-seen indicators for 200M concurrent users. Which design scales?",
      options: ["Mark a user offline the instant their TCP socket closes and broadcast it to all contacts", "Heartbeats refresh a TTL key per user, and clients subscribe only to users currently on screen", "Write every connect and disconnect to the users table and have clients poll it every 5 seconds", "Each gateway broadcasts its full list of connected users to every other gateway"],
      answer: 1, level: "medium",
      explain: "TTL keys tolerate flaky mobile networks (missing a couple of heartbeats marks offline, so no flapping), and subscribe-on-view keeps fan-out proportional to what users actually look at. Broadcasting every change to all contacts or polling the database turns presence into the system's largest workload." },
    { q: "Why can't a chat app rely on APNs or FCM to deliver the messages themselves to offline users?",
      options: ["Push services work only while the app holds an open WebSocket connection", "Push services require the provider to end-to-end encrypt every payload", "Push is best-effort: payloads are small and can be delayed or collapsed", "Push services deliver only to the most recently registered device of a user"],
      answer: 2, level: "easy",
      explain: "Push is a wake-up hint. Payloads are capped at 4 KB and providers may delay notifications or keep only the latest one for an offline device, so the app must fetch the actual messages through the socket or a sync call against the server-side log." },
    { q: "In a fan-out-on-write news feed, an account with 50M followers posts and timelines across the fleet lag for minutes. What is the standard fix?",
      options: ["Skip fan-out for huge accounts and merge their posts in at read time", "Add fan-out workers until all 50M timeline inserts finish within a second", "Switch every user to fan-out on read so that no writes are amplified", "Fan out the full post body so that feed reads can skip hydration"],
      answer: 0, level: "medium",
      explain: "The hybrid model pushes for normal authors and pulls for the few celebrities a reader follows, bounding both write amplification and read fan-in. Pure fan-out on read makes every feed load expensive for everyone, and copying bodies makes the write cost worse." },
    { q: "Users of a ranked home feed report duplicates and missing posts while scrolling, because scores change between page requests. What fixes this?",
      options: ["Switch to offset pagination with a smaller, fixed page size", "Use a keyset cursor on the ranking score of the last item shown", "Re-rank on every page request and let the client drop duplicates", "Rank once per session and page through the cached ID list"],
      answer: 3, level: "hard",
      explain: "Freezing the ranking per session makes pages consistent slices of one list; pull-to-refresh starts a new session. Offsets shift as new posts arrive, a cursor on a moving score is not stable, and client-side dedupe cannot recover posts that slipped between pages." },
    { q: "Your Redis home-timeline cluster is running out of memory. Which change saves the most without hurting feed latency for active users?",
      options: ["Store gzip-compressed post JSON in each timeline instead of raw JSON", "Store only post IDs, cap each list, and drop inactive users' timelines", "Move home timelines to PostgreSQL and query them on each feed load", "Switch all users to fan-out on read so no home timelines are stored"],
      answer: 1, level: "medium",
      explain: "IDs are ~8 bytes against ~1 KB bodies, few users scroll past a few hundred items (so a cap around 800 is plenty), and inactive users' timelines can be rebuilt on return. Compression still stores every body, so it saves far less. Moving to a database or to pure pull saves memory but makes every active user's feed slower." },
    { q: "During a 100M-user marketing campaign, password-reset codes take 20 minutes to arrive. What is the most direct architectural fix?",
      options: ["Scale out the notification API so it accepts requests faster", "Send all notifications by SMS, which is delivered faster than email", "Give critical messages their own priority queue and worker pool", "Lower the retry backoff so failed messages are retried sooner"],
      answer: 2, level: "easy",
      explain: "This is a bulkhead problem: the codes are stuck behind campaign jobs in a shared queue. A dedicated high-priority topic and workers, plus pacing campaigns with a token bucket, isolates them. More API instances only accept requests faster; they do not reorder the queue." },
    { q: "A push worker crashes after APNs returned 200 but before it recorded the result, and Kafka redelivers the job. What is the best achievable outcome?",
      options: ["No duplicate, because Kafka exactly-once transactions cover the APNs call", "A rare duplicate, minimized by a dedupe key and a collapse ID", "No duplicate, because committing the offset before calling APNs is safe", "No duplicate, because the worker runs a two-phase commit with APNs"],
      answer: 1, level: "hard",
      explain: "An external HTTP call cannot join a Kafka transaction or a 2PC, so at-least-once plus dedupe is the ceiling, and a collapse ID makes a duplicate replace the earlier notification on the device. Committing the offset first gives at-most-once: a crash then loses the notification instead of duplicating it." },
    { q: "APNs returns <code>410 Unregistered</code> for a device token. What should the push worker do?",
      options: ["Disable the token and stop sending to it; do not retry", "Retry with exponential backoff up to five times", "Send the same notification by SMS immediately", "Move the job to the dead-letter queue and replay it tomorrow"],
      answer: 0, level: "medium",
      explain: "410 is a permanent error: the app was uninstalled or the token is no longer active, and Apple expects providers to stop sending to it. Retrying only wastes capacity; transient errors such as 429 or 5xx are the ones to retry. Falling back to SMS is a product decision, not an error handler." },
    { q: "In a 10-person mesh (peer-to-peer) video call with 1.5 Mbps per video stream, roughly how much uplink does each participant need?",
      options: ["1.5 Mbps", "13.5 Mbps", "15 Mbps", "135 Mbps"],
      answer: 1, level: "easy",
      explain: "In a mesh each participant sends a separate copy to each of the other 9 peers: 9 x 1.5 = 13.5 Mbps, beyond many home uplinks, and each copy is encoded separately. With an SFU the uplink is one stream (or one simulcast set of ~2.2 Mbps) regardless of call size." },
    { q: "Users on a corporate network that blocks all outbound UDP cannot join calls. What fixes it?",
      options: ["Deploy more STUN servers inside that region", "Increase the receiver's jitter buffer to 500 ms", "Switch that meeting from an SFU to an MCU", "Offer a TURN relay over TLS on TCP port 443"],
      answer: 3, level: "medium",
      explain: "STUN only discovers a public address over UDP; it cannot carry media through a firewall. TURN over TLS on 443 looks like ordinary HTTPS traffic and relays the media, at the cost of extra latency and relay bandwidth; ICE-TCP directly to the SFU is another option. Changing the topology or buffering does not open a blocked path." },
    { q: "In a 12-person SFU call, one participant is on a 1 Mbps hotel connection. What lets them stay in the call without lowering video quality for everyone else?",
      options: ["Simulcast, with the SFU forwarding low layers to that receiver", "The SFU decodes and re-encodes every stream at a lower bitrate for that receiver", "Every sender caps its bitrate to what the slowest receiver can handle", "Switch media to TCP so lost packets are retransmitted instead of dropped"],
      answer: 0, level: "hard",
      explain: "Simulcast (or SVC) lets the SFU choose a layer per receiver, so the weak participant gets the 180p layers while others keep 720p. Transcoding per receiver works but turns the SFU into a CPU-heavy MCU; capping all senders is what happens without simulcast; TCP adds stalls under loss." },
    { q: "Which requirement most favors an MCU over an SFU?",
      options: ["A 50-person all-hands that requires end-to-end encryption", "A 1:1 call between two modern browsers on good networks", "Bridging phone dial-in and legacy SIP room systems into the call", "A 20-person stand-up where everyone uses the latest desktop app"],
      answer: 2, level: "hard",
      explain: "An MCU decodes, mixes and re-encodes into a single stream, which is what telephony and old SIP or H.323 room systems need. It cannot work with end-to-end encryption because it must decode media; a 1:1 call is cheapest peer to peer, and modern clients in a stand-up are the SFU sweet spot." }
  ],
  design: [
    // ---------------------------------------------------------------- Design 1: Slack channels + threads
    {
      id: "design-slack-channels-threads",
      title: "Design Slack-style channels with threads",
      level: "Medium",
      prompt: "Design the messaging core of a Slack-like workplace chat product. Workspaces contain public and private channels (some with 100,000+ members) and direct messages. Any message can start a thread of replies. Users see unread badges and mention counts for every channel on every device, and can search their workspace's history. Focus on channel delivery, threads, unread state and search.",
      clarify: [
        "How large do workspaces and channels get: what is the biggest channel, and how many channels does a typical user belong to?",
        "Is history kept forever, and do workspaces have retention or legal-hold policies?",
        "How do threads behave: are replies shown in the channel, and who is notified about a reply?",
        "Do unread badges need exact mention counts, consistent across devices in real time?",
        "Must search respect private-channel membership, and how fresh must results be?",
        "Are there enterprise needs such as data residency or customer-managed encryption keys?"
      ],
      hints: [
        "Reuse the chat lesson: gateways, per-conversation ordering, cursors. A channel is a conversation. What changes when it has 100k members?",
        "Do not fan out per member in big channels. Let gateways subscribe to channels on behalf of their connected users, so each message travels once to each interested gateway.",
        "A thread reply is a message with a parent reference. Keep it in the channel's partition, and keep a denormalized summary (reply count, last reply, participants) on the parent.",
        "Unread state is a per-(user, channel) read cursor; mention counts need a per-user mentions index, and @channel in a huge channel should not write one row per member.",
        "Search: index asynchronously from a change stream into an index routed by workspace, and filter by the channels the searcher may see at query time."
      ],
      solution: [
        { t: "h", text: "1. Requirements" },
        { t: "list", items: [
          "<b>Functional:</b> public and private channels, DMs; post, edit, delete; reactions; mentions (@user, @here, @channel).",
          "Threads: reply to any message, optionally also post to the channel; a Threads view of followed threads.",
          "Unread badge and mention count per channel and thread, consistent across devices.",
          "Full-text search over everything the user may see; history retained per workspace policy."
        ] },
        { t: "list", items: [
          "<b>Latency:</b> under ~500 ms to online members, including in 100k-member channels.",
          "<b>Ordering:</b> one order per channel, and inside each thread.",
          "<b>Durability:</b> no acknowledged message is lost.",
          "<b>Isolation:</b> tenants are isolated, and one huge workspace must not degrade others.",
          "<b>Freshness:</b> search results within a few seconds."
        ] },
        { t: "h", text: "2. Estimates" },
        { t: "code", lang: "text", code: `Workspaces         = 1M, the largest with 200k users
DAU                = 30M, peak concurrent ≈ 15M (work hours overlap)
Messages           = 30M x 30/day = 900M/day -> 900M / 86,400 ≈ 10k/s avg
Peak               ≈ 3x (work hours, Monday mornings) ≈ 30k msg/s
Online recipients  ≈ 40 per message -> 30k x 40 = 1.2M user deliveries/s at peak
Gateways           = 15M sockets / 150k per box = 100 gateways
Big channel        100k members, 30% online = 30k users,
                   but they sit on at most 100 gateways -> at most 100 frames per message
Message size       ≈ 1 KB (rich text blocks, mentions, metadata)
Storage            900M x 1 KB = 900 GB/day ≈ 330 TB/year, x3 replicas ≈ 1 PB/year
Read cursors       30M users x 150 channels = 4.5B rows x 50 B ≈ 225 GB
Search index       ≈ 1x raw text ≈ 330 TB/year before replicas` },
        { t: "h", text: "3. API" },
        { t: "code", lang: "http", code: `POST /v1/channels/C123/messages   {"text":"Ship it @u9","client_msg_id":"c-11"}
     -> 201 {"ts":"1793000000.000200"}
POST /v1/channels/C123/messages   {"text":"Agreed","client_msg_id":"c-12",
                                   "thread_ts":"1793000000.000200","also_send_to_channel":false}
GET  /v1/channels/C123/history?before_ts=1793000000.000200&limit=50
GET  /v1/channels/C123/threads/1793000000.000200?limit=50
POST /v1/channels/C123/mark       {"ts":"1793000000.000200"}       (move read cursor)
GET  /v1/search?q=deploy+in:C123+from:u9&cursor=...
# Real-time events arrive over the WebSocket, as in the chat lesson` },
        { t: "h", text: "4. Data model" },
        { t: "p", html: "A message is identified by <code>(channel_id, ts)</code>, where <code>ts</code> is a server-assigned, per-channel, strictly increasing timestamp-like ID; a thread is identified by its parent's ts. Messages live in sharded MySQL behind Vitess, sharded by <code>channel_id</code>: every hot query is per channel, and a reply plus its parent's summary update can then commit in one shard-local transaction." },
        { t: "table", head: ["Table", "Key", "Contents"], rows: [
          ["<code>messages</code>", "(channel_id, ts)", "user_id, blocks, thread_ts (null for top level), edited_at, deleted; parents also hold reply_count, latest_reply_ts, reply_users"],
          ["Thread index", "(channel_id, thread_ts, ts)", "Secondary index on the same shard: lists replies of one thread in order"],
          ["<code>user_channels</code>", "(user_id, channel_id), sharded by user", "last_read_ts, notification level, muted, starred"],
          ["<code>thread_subscriptions</code>", "(user_id, channel_id, thread_ts)", "following flag, last_read_ts for the thread"],
          ["<code>mentions</code>", "(user_id, ts)", "channel_id, message ts, kind: direct, keyword or group; broadcast mentions stored once per channel"],
          ["Channel heads", "channel_id in Redis", "latest_ts and latest broadcast-mention ts, for badge computation"],
          ["Search", "Elasticsearch, routed by workspace_id", "text, author, channel_id, channel type, ts; dedicated indices for the largest tenants"]
        ] },
        { t: "h", text: "5. High-level design" },
        { t: "diagram", caption: "Gateways subscribe to channels for the users connected to them, so a channel server sends each message once per interested gateway; unread state, search and notifications all hang off a change stream.", code: `flowchart LR
  C(("Clients")) --> GW["WebSocket gateways"]
  C -->|"HTTPS post"| API["Message API"]
  API -->|"insert, assign ts"| DB[("Vitess MySQL<br/>sharded by channel")]
  API -->|"publish"| CHS["Channel servers<br/>consistent hash by channel"]
  GW -->|"subscribe for connected users"| CHS
  CHS -->|"one frame per subscribed gateway"| GW
  DB -.->|"change events"| K[["Kafka"]]
  K --> UW["Unread and mention workers"]
  UW --> UR[("Read cursors<br/>and mentions")]
  K --> SI["Search indexer"]
  SI --> ES[("Elasticsearch<br/>routed by workspace")]
  K --> NS["Notification service"]` },
        { t: "p", html: "<b>Write path:</b> the API dedupes on client_msg_id, assigns the channel's next ts, commits to the channel's shard and publishes the message to the channel server that owns the channel. <b>Delivery:</b> when a user connects, their gateway subscribes to each of that user's channels (reference-counted across all its users); the channel server keeps the set of subscribed gateways per channel and sends one frame to each, and gateways fan out to their local sockets. <b>Side effects:</b> a change stream drives mention and unread updates, search indexing and push or email notifications for offline or mentioned users. <b>Read path:</b> history is a range scan on (channel_id, ts) in one shard; on startup the client fetches its channel list with latest_ts and last_read_ts to draw all badges in one call." },
        { t: "callout", kind: "example", title: "How Slack describes it", html: "Slack's engineering blog describes a real-time layer of stateful channel servers, each owning a set of channels via consistent hashing, and gateway servers that hold user WebSockets and subscribe to channels on behalf of connected users. Separately, Slack wrote about moving from MySQL shards keyed by workspace, where the largest customers created hot shards, to Vitess, which let data such as messages be sharded by channel." },
        { t: "h", text: "6. Deep dives" },
        { t: "p", html: "<b>Threads.</b> A thread is not a separate conversation. Replies live in the parent's channel partition with <code>thread_ts</code> set, so they share the channel's ordering and shard, and the thread index lists them in order. The parent carries a denormalized summary (reply_count, latest_reply_ts, the first few reply_users) updated in the same transaction as the reply, so rendering a channel never counts replies. Followers are the parent's author, everyone who replied or was mentioned in the thread, and anyone who clicked Follow. Every channel subscriber gets a small 'thread updated' event to refresh the summary; followers additionally get unread state in their Threads view and, if offline or mentioned, a notification. 'Also send to channel' writes a reference into the main timeline at the reply's ts." },
        { t: "diagram", caption: "One shard-local transaction stores the reply and updates the parent's summary; real-time delivery and follower unread state then proceed independently.", code: `sequenceDiagram
  participant B as Bob
  participant API as Message API
  participant DB as Shard for C123
  participant CS as Channel server
  participant GW as Gateways
  participant U as Unread worker
  participant N as Notification service
  B->>API: POST reply, thread_ts P, client_msg_id c-12
  API->>DB: begin, insert reply R with thread_ts P
  API->>DB: update parent P reply_count and latest_reply_ts, commit
  DB-->>API: committed
  API-->>B: 201 ts R
  API->>CS: publish reply R for channel C123
  CS->>GW: one frame per subscribed gateway
  GW->>GW: refresh parent summary, render R where thread P is open
  DB-->>U: change event for reply R
  U->>U: mark thread P unread for followers except Bob
  U->>N: notify followers who are offline or mentioned` },
        { t: "p", html: "<b>Unread badges and mention counts.</b> A channel is unread for a user when <code>latest_ts</code> exceeds that user's <code>last_read_ts</code>, a comparison the client can make for 150 channels from one multi-get. Mention counts come from the per-user mentions table: direct mentions after last_read_ts. For @channel or @here in a 100k-member channel, writing 100k mention rows would be the celebrity problem again, so store the broadcast once on the channel and add it at read time for every member whose cursor is behind it — the same push-versus-pull hybrid as the news feed. Marking a channel read on the laptop moves the cursor and emits a <code>channel_marked</code> event to the user's other devices, clearing the badge everywhere." },
        { t: "p", html: "<b>Search with permissions.</b> A change stream from the message shards feeds an indexer (Chapter 10); Elasticsearch refreshes about once a second, so new messages are searchable within seconds, and edits and deletes flow through the same stream. Small workspaces share indices with routing by workspace_id so a query hits one shard; the largest tenants get dedicated indices. Every query carries a filter: public channels of the workspace OR channel_id in the searcher's private channels and DMs. Even thousands of IDs fit in an Elasticsearch terms filter (the default limit is 65,536 terms), and because the filter is evaluated at query time, removing someone from a private channel takes effect immediately." },
        { t: "list", items: [
          "<b>Huge channels.</b> Delivery cost is bounded by the gateway count, not member count. Notification fan-out for @channel goes through the notification system with pacing, and product guardrails (a warning or admin restriction on @channel above a size) keep 100k pushes rare.",
          "<b>Hot workspaces and channels.</b> Sharding by channel spreads a 200k-user workspace across many shards; a single very hot channel sits on one channel server and one shard, which handle thousands of messages a second, far above human posting rates.",
          "<b>Reconnect storms.</b> A user reconnecting re-subscribes to ~150 channels; gateways batch subscriptions per channel server, and clients reconnect with jittered backoff."
        ] },
        { t: "h", text: "7. Trade-offs and bottlenecks" },
        { t: "table", head: ["Decision", "Benefit", "Cost"], rows: [
          ["Shard messages by channel, not workspace", "No hot shards from huge tenants; thread updates are shard-local", "Workspace-wide operations such as export or retention scan many shards"],
          ["Gateway-level channel subscriptions", "Delivery cost bounded by gateways, not members", "Stateful channel servers; subscription churn on reconnect"],
          ["Denormalized thread summary on the parent", "Channel view never counts replies", "Every reply also writes the parent row, which is hot for very active threads"],
          ["Broadcast mentions resolved at read time", "@channel costs one write", "Badge computation merges two sources"],
          ["Async search indexing with query-time permission filters", "Writes stay fast; membership changes apply instantly", "Results lag by about a second; large filters make queries heavier"]
        ] }
      ],
      followups: [
        "A 200k-member announcement channel posts and every client fetches it at once. What breaks first, and how do you protect it?",
        "How do edits and deletes propagate so that every device, thread summaries and the search index converge?",
        "An enterprise customer requires EU data residency and its own encryption keys. What changes?",
        "How would you build a channel shared between two different companies' workspaces?",
        "A user reads a channel on the phone while the laptop is offline. How do badges end up correct on both?"
      ]
    },
    // ---------------------------------------------------------------- Design 2: Gmail
    {
      id: "design-email-service",
      title: "Design an email service like Gmail",
      level: "Hard",
      prompt: "Design a web email service like Gmail for 1 billion accounts. Users send and receive email with the rest of the internet over SMTP, read mail on web and mobile, organize it with labels and conversation threads, search their whole mailbox, and are notified of new mail. Spam filtering and attachments up to 25 MB are in scope.",
      clarify: [
        "Only our own web and mobile clients, or also IMAP and POP for third-party clients?",
        "What is the storage quota per user, and is mail kept forever unless deleted?",
        "Labels (many per message) or folders (one per message)? Is there a conversation view?",
        "How fast must new mail appear, and how fast must search be?",
        "How much anti-abuse is in scope: spam and phishing classification, virus scanning, outbound abuse by our own users?",
        "Any enterprise features, such as custom domains, retention rules or legal holds?"
      ],
      hints: [
        "Split the system in two: the SMTP edge that talks to other mail servers, and the mailbox service your clients use. Every mailbox access is scoped to one user, so use that.",
        "Separate small, mutable metadata (labels, read flags) from large, immutable bodies and attachments, and put them in different stores.",
        "When may your SMTP server reply 250 OK to the sending server, and what must be true before it does?",
        "Search always runs inside one mailbox, so shard the index by user rather than by term.",
        "Clients need incremental sync: give each mailbox an increasing history ID and a change log, like chat's per-conversation seq."
      ],
      solution: [
        { t: "h", text: "1. Requirements" },
        { t: "list", items: [
          "<b>Functional:</b> receive mail from the internet (SMTP via MX records) and send to it; read, compose, reply and forward on web and mobile.",
          "Labels (a message can have many: Inbox, Work, Starred) and a conversation view grouping a thread.",
          "Full-text search with operators (<code>from:</code>, <code>has:attachment</code>, <code>after:</code>); attachments up to 25 MB.",
          "Spam, phishing and virus filtering; per-user filters; new-mail notifications; 15 GB quota per user."
        ] },
        { t: "list", items: [
          "<b>Durability above all:</b> mail accepted from another server is never lost.",
          "<b>Availability:</b> 99.9%+ for reading and sending.",
          "<b>Freshness:</b> new mail visible within seconds of acceptance; search under ~1 s for a typical mailbox.",
          "<b>Sync:</b> read-your-writes for a user's own actions across devices."
        ] },
        { t: "h", text: "2. Estimates" },
        { t: "code", lang: "text", code: `Accounts          = 1B, DAU = 400M
Inbound attempts  = 1B x 50/day = 50B/day, about half rejected at SMTP as spam
Stored inbound    = 25B/day -> 25B / 86,400 ≈ 290k msg/s avg, ~600k/s peak
Outbound          = 400M x 4/day = 1.6B/day ≈ 19k msg/s
Avg stored size   ≈ 75 KB including attachments (the median is far smaller)
New blob storage  = 25B x 75 KB ≈ 1.9 PB/day raw, ≈ 2.8 PB/day with 1.5x erasure coding
Per account       = 25 x 75 KB ≈ 1.9 MB/day ≈ 680 MB/year, well inside 15 GB
Metadata          = 25B x 500 B ≈ 12.5 TB/day, replicated 3x
Mailbox reads     = 400M x 20 list or open calls = 8B/day ≈ 93k QPS avg, ~200k peak
Search            = 400M x 2/day = 800M/day ≈ 9k QPS` },
        { t: "h", text: "3. API" },
        { t: "p", html: "Server-to-server mail uses SMTP on port 25 and is not part of the client API. Our own clients use HTTPS:" },
        { t: "code", lang: "http", code: `GET  /v1/threads?label=INBOX&page_token=...     -> threads: subject, snippet, labels, unread
GET  /v1/messages/{message_id}?format=full       -> headers, body parts, attachment refs
POST /v1/messages/send                           Idempotency-Key: draft-881
     {"raw":"base64 of the RFC 5322 message","thread_id":"t_19"}
POST /v1/messages/{message_id}/modify   {"add_labels":["Work"],"remove_labels":["UNREAD"]}
GET  /v1/history?start_history_id=4471203        -> changes since that point
GET  /v1/messages?q=from:alice+has:attachment+after:2026/01/01` },
        { t: "h", text: "4. Data model" },
        { t: "table", head: ["Data", "Key", "Store and why"], rows: [
          ["Message metadata", "(user_id, message_id)", "Wide-column store (Bigtable/HBase/Cassandra style) partitioned by user: thread_id, from, to, subject, snippet, internal_date, size, label_ids, body_ref, history_id"],
          ["Label index", "(user_id, label_id, latest_date DESC, thread_id)", "Same store and partition: 'Inbox, newest first' is one range scan"],
          ["Threads", "(user_id, thread_id)", "Message IDs, union of labels, latest date, unread count"],
          ["History log", "(user_id, history_id)", "Change type and message ID; kept about a week, after which clients do a full sync"],
          ["Bodies and attachments", "Content hash (SHA-256)", "Object storage with erasure coding and reference counts; encrypted with envelope encryption (Chapter 13); colder tier after ~90 days"],
          ["Search index", "Per-user index, routed by user_id", "Inverted index over headers, body text and attachment names"],
          ["Accounts", "user_id", "Relational store: quota_used, settings, filters, forwarding rules"]
        ] },
        { t: "h", text: "5. High-level design" },
        { t: "diagram", caption: "Mail from the internet is accepted only after it is durably spooled, then filtered, threaded and stored as metadata plus blob; clients use the mailbox API, and outbound mail leaves through a retrying SMTP tier.", code: `flowchart LR
  EXT(("Internet<br/>mail servers")) -->|"SMTP via MX"| MX["SMTP inbound edge<br/>TLS, SPF, DKIM, DMARC"]
  MX -->|"spool, then 250 OK"| SP[["Durable spool<br/>Kafka"]]
  SP --> PIPE["Pipeline<br/>virus, spam, threading, filters"]
  PIPE --> BS[("Object storage<br/>bodies and attachments")]
  PIPE --> MD[("Mailbox metadata<br/>partitioned by user")]
  PIPE --> IDX["Search indexer<br/>per-user index"]
  PIPE -.->|"new mail"| NT["Client push"]
  U(("Web and mobile")) --> API["Mailbox API"]
  API --> MD
  API --> BS
  API -->|"send"| OQ[["Outbound queues<br/>per destination domain"]]
  OQ --> OUT["SMTP outbound<br/>DKIM sign, MX lookup, retry"]
  OUT --> EXT` },
        { t: "p", html: "<b>Inbound:</b> a sending server looks up our MX records and connects to the SMTP edge, which checks IP reputation, SPF, DKIM and DMARC and whether the recipient exists, spools the message durably and only then replies 250. The pipeline scans for viruses, scores spam, assigns a thread, applies the user's filters, writes the body blob, then writes metadata, label index rows and a history entry, indexes the message and nudges the user's clients. <b>Read:</b> the client lists threads from the label index and fetches bodies by reference, which the API serves from object storage. <b>Send:</b> the API stores the message in Sent, then enqueues it; recipients at our own domain short-circuit into the inbound pipeline, and the rest go to the outbound SMTP tier." },
        { t: "diagram", caption: "The 250 reply transfers responsibility for the message, so it comes only after a replicated spool write; filtering and storage happen after acceptance.", code: `sequenceDiagram
  participant S as Sending server
  participant E as SMTP edge
  participant SP as Spool
  participant P as Pipeline
  participant M as Mailbox store
  participant C as Bob's client
  S->>E: EHLO, then STARTTLS
  S->>E: MAIL FROM alice, RCPT TO bob
  E->>E: IP reputation, SPF, recipient exists, rate limit
  E-->>S: 250 recipient OK
  S->>E: DATA with message bytes
  E->>E: verify DKIM and DMARC, size limit
  E->>SP: write message, replicated
  SP-->>E: durable
  E-->>S: 250 queued
  SP->>P: consume message
  P->>P: virus scan, spam score, thread, user filters
  P->>M: body blob first, then metadata and history entry
  M-->>C: push hint, history id 4471204
  C->>M: GET history since 4471203` },
        { t: "h", text: "6. Deep dives" },
        { t: "p", html: "<b>Accepting mail safely and fighting spam.</b> SMTP's 250 reply after DATA is a handoff: the sending server deletes its copy, so replying before the message is durably replicated risks silent loss — the same rule as chat's first tick. Reject as early and cheaply as possible: 5xx for unknown recipients and failed DMARC with a reject policy, 4xx to throttle suspicious IPs (legitimate servers retry, many spam bots do not). After acceptance, an ML classifier scores the message on sender reputation, authentication results, content and links, and user feedback from 'Report spam' and 'Not spam'; high scores go to the Spam label, kept 30 days, instead of being dropped. Attachments are scanned before the message is visible." },
        { t: "callout", kind: "example", title: "Gmail's bulk-sender rules", html: "Since February 2024 Google requires anyone sending more than 5,000 messages a day to Gmail accounts to authenticate with SPF and DKIM, publish a DMARC policy, support one-click unsubscribe and keep reported spam rates low. Receivers like Gmail use authentication results as a core spam signal." },
        { t: "p", html: "<b>Storage layout.</b> Metadata is small, mutable and queried; bodies are large and immutable, so they go to different stores. Because every request is scoped to one mailbox, partitioning everything by user_id makes listing, labeling and history single-partition operations. Labels are many-to-many: adding 'Work' writes a label-index row and updates the thread, in one partition. Threading at ingestion uses the <code>In-Reply-To</code> and <code>References</code> headers plus a normalized subject. Attachments are content-addressed with reference counts, so the same 10 MB PDF sent to 50 colleagues is stored once; many designs dedupe within a user or a domain rather than globally, to avoid leaking through dedupe whether someone else holds a given file. Bodies older than ~90 days move to a colder storage class, since old mail is rarely opened." },
        { t: "p", html: "<b>Search.</b> Web search (Chapter 15) partitions an index across many machines because a query spans the whole corpus. Mail search is the opposite: every query is inside one mailbox, so partition the index by user and a query touches one shard. Operators map to fields and filters (<code>from:</code> on the sender field, <code>has:attachment</code> as a boolean, <code>after:</code> as a date range), the indexer consumes the pipeline's output so new mail is searchable within seconds, and indexes of dormant mailboxes can sit on cheap storage and load on first query." },
        { t: "list", items: [
          "<b>Incremental sync.</b> Each mutation (message added, label changed, deleted) appends a change with the mailbox's next history_id, in the same partition as the change. A client stores the last ID it saw and asks for changes since then, while push hints over a WebSocket on web or FCM and APNs on mobile tell it when to ask. The public Gmail API works this way, with a per-mailbox <code>historyId</code>.",
          "<b>Outbound delivery.</b> Queue per destination domain, reuse SMTP connections, cache MX lookups, sign with DKIM, and retry 4xx responses with backoff for several days before returning a bounce to the sender. Per-account send limits and separate IP pools for different traffic types protect our IP reputation from abusive accounts.",
          "<b>Quota and deletes.</b> A per-user usage counter changes with each insert or delete; deleting moves to Trash for 30 days, and only then are references released and unreferenced blobs garbage-collected."
        ] },
        { t: "h", text: "7. Trade-offs and bottlenecks" },
        { t: "table", head: ["Decision", "Benefit", "Cost or risk"], rows: [
          ["Partition everything by user_id", "Every client operation is single-partition", "Very large mailboxes become hot partitions; split them by time range"],
          ["Metadata and blobs in separate stores", "Cheap, durable bulk storage; fast metadata queries", "Two writes per message; blob first, then metadata, so a half-written message is never visible"],
          ["250 only after a replicated spool write", "No silent loss", "Spool write latency on every inbound message"],
          ["Per-user search index", "One shard per query; easy deletion with the account", "Billions of small indexes to manage; cold ones load lazily"],
          ["Attachment dedupe by content hash", "Large savings on bulk and internal mail", "Reference counting and garbage collection; scope limited for privacy"],
          ["Spam to a label, not dropped", "Users can recover false positives", "Spam still costs storage for 30 days"]
        ] }
      ],
      followups: [
        "How would you support IMAP clients, which expect folders and per-folder UIDs, on top of labels?",
        "A user with 2 million messages searches 'invoice'. How do you keep that fast?",
        "How would you implement undo send and scheduled send?",
        "A newsletter goes to 50M of your users at once. How do you absorb the burst, and can you dedupe its storage?",
        "What would end-to-end encrypted mail cost you in features such as search and spam filtering?"
      ]
    },
    // ---------------------------------------------------------------- Design 3: Google Calendar
    {
      id: "design-calendar",
      title: "Design Google Calendar",
      level: "Medium",
      prompt: "Design a calendar service like Google Calendar. Users create events, including recurring ones ('every weekday at 9:00', 'last Friday of the month'), invite attendees inside and outside the service, collect RSVPs, see day, week and month views across calendars they own or subscribe to, check colleagues' free/busy time, and receive reminders by push and email before events.",
      clarify: [
        "Which recurrence patterns are required: full iCalendar RRULE, edits to single occurrences, 'this and following' edits?",
        "Do we invite external attendees by email with iCalendar invitations and process their replies?",
        "How precise must reminders be, and through which channels?",
        "What is the sharing model: who sees event details and who sees only free/busy?",
        "How large can events get, for example a 10,000-person all-hands?",
        "Must we sync with third-party clients over CalDAV or similar protocols?"
      ],
      hints: [
        "Do not store every occurrence of a recurring event forever. Store the rule plus exceptions, and decide when to expand it.",
        "Store a recurring meeting's time as local wall-clock time plus an IANA time zone, not UTC. Work out why daylight saving time forces this.",
        "A view asks 'what overlaps this window'. How do you index single events and also series that started years ago?",
        "Reminders are delayed jobs (Chapter 9). Precompute only the next reminder per event, bucket by minute, and expect a spike just before every hour.",
        "Invites: one canonical event owned by the organizer, plus a lightweight per-attendee entry for RSVP and personal settings."
      ],
      solution: [
        { t: "h", text: "1. Requirements" },
        { t: "list", items: [
          "<b>Functional:</b> create, edit and delete events with time zone, location, description and conferencing link; all-day events.",
          "Recurrence with exceptions; invite internal and external attendees; RSVP yes, no or maybe.",
          "Views across many calendars; share calendars with view or edit rights; free/busy lookup and find-a-time.",
          "Reminders by push and email, configurable per event and per user."
        ] },
        { t: "list", items: [
          "<b>Read-heavy:</b> views are opened far more often than events change; view load under ~200 ms.",
          "<b>Timely reminders:</b> within seconds of the scheduled time, and never twice.",
          "<b>Correct times across time zones and DST;</b> no lost edits under concurrent changes.",
          "<b>Sync:</b> changes reach every device and attendee within seconds."
        ] },
        { t: "h", text: "2. Estimates" },
        { t: "code", lang: "text", code: `Users              = 500M, DAU = 100M
View loads         = 100M x 10/day = 1B/day -> ≈ 12k QPS avg, ~40k QPS morning peak
Event writes       = 100M x 2/day = 200M/day -> ≈ 2.3k/s avg, ~7k/s peak
Attendee entries   ≈ 5 per event -> 1B/day ≈ 12k writes/s
Event row          ≈ 1 KB -> 200 GB/day ≈ 73 TB/year, x3 replicas ≈ 220 TB
Reminders          = 100M x 6 occurrences/day ≈ 600M/day ≈ 7k/s avg
Reminder spike     meetings start on the hour, reminders fire 10 min before:
                   4M reminders in one region at 08:50 -> 4M / 60 s ≈ 67k/s
                   -> size the reminder path for ~10x the average
Free/busy queries  ≈ 50M/day, each ~5 calendars x 1 week` },
        { t: "h", text: "3. API" },
        { t: "code", lang: "http", code: `POST /v1/calendars/{cal_id}/events
  {"summary":"Weekly sync",
   "start":{"dateTime":"2026-11-02T09:00:00","timeZone":"America/New_York"},
   "end":{"dateTime":"2026-11-02T09:30:00","timeZone":"America/New_York"},
   "recurrence":["RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=20"],
   "attendees":["ana@corp.com","raj@partner.org"],
   "reminders":[{"method":"push","minutes":10}]}
GET  /v1/calendars/{cal_id}/events?timeMin=2026-11-01T00:00:00Z&timeMax=2026-12-01T00:00:00Z
PUT  /v1/events/{event_id}/instances/20261116T090000     (edit one occurrence)
     If-Match: "etag-7"
POST /v1/events/{event_id}/rsvp     {"status":"accepted"}
POST /v1/freebusy  {"timeMin":"...","timeMax":"...","items":["ana@corp.com","li@corp.com"]}` },
        { t: "h", text: "4. Data model" },
        { t: "p", html: "Events live in sharded PostgreSQL, sharded by the organizer's calendar_id. Writes are modest (~7k/s at peak), and edits need transactions, versions (etags) and range queries. Each attendee's view is served from a per-calendar entries table and a materialized instances table on the attendee's own shard." },
        { t: "table", head: ["Table", "Key", "Contents"], rows: [
          ["<code>events</code>", "event_id, on the organizer's shard", "ical_uid, summary, start and end as local time plus IANA tz, rrule, series_start_utc, series_end_utc (null if endless), version"],
          ["<code>event_exceptions</code>", "(event_id, original_start)", "Cancelled, or overridden fields such as a new time or title for that one occurrence"],
          ["<code>attendees</code>", "(event_id, attendee)", "RSVP status, optional flag, response time"],
          ["<code>calendar_entries</code>", "(calendar_id, event_id), on the attendee's shard", "RSVP mirror, personal reminders, color, hidden"],
          ["<code>instances</code>", "(calendar_id, start_utc, event_id)", "Materialized occurrences for the next ~12 months: drives views and free/busy"],
          ["<code>reminders</code>", "(fire_minute, shard_no)", "user_id, event_id, occurrence start, offset, channel, event version"],
          ["<code>changes</code>", "(calendar_id, change_seq)", "Change log behind sync tokens for incremental client sync"]
        ] },
        { t: "h", text: "5. High-level design" },
        { t: "diagram", caption: "Event writes are small and transactional; a change stream drives expansion of recurrences, invite fan-out and reminder planning, and views read precomputed instances.", code: `flowchart LR
  U(("Clients")) --> API["Calendar API"]
  API --> EV["Event service"]
  EV --> DB[("PostgreSQL shards<br/>events and attendees")]
  EV -.->|"event changed"| K[["Kafka"]]
  K --> EXP["Expander<br/>rolling 12-month window"]
  EXP --> INS[("Instances and<br/>free-busy index")]
  K --> INV["Invite worker"]
  INV -->|"internal: entry and notify"| NS["Notification system"]
  INV -->|"external: iCalendar email"| MAIL["Mail service"]
  K --> RP["Reminder planner"]
  RP --> RS[("Reminder buckets<br/>by minute")]
  RS --> SCH["Scheduler workers"]
  SCH --> NS
  API -->|"views and free-busy"| INS` },
        { t: "p", html: "<b>Write path:</b> the event service validates and writes the event, attendees and exceptions in one transaction on the organizer's shard, bumps the version and returns. A change event drives three consumers: the expander rewrites the affected occurrences in the instances table, the invite worker upserts attendee entries and sends invitations or updates, and the reminder planner schedules the next reminder per attendee. The organizer's own view expands the series inline from the event row, so they see the change immediately even if the expander lags. <b>Read path:</b> a week view is one range scan on <code>instances</code> by (calendar_id, start_utc) for each visible calendar, hydrated from a cache of event rows." },
        { t: "h", text: "6. Deep dives" },
        { t: "p", html: "<b>Recurrence: rule plus exceptions.</b> Store the iCalendar RRULE (RFC 5545), for example <code>FREQ=MONTHLY;BYDAY=-1FR</code> for the last Friday of each month, never the full list of occurrences: an endless daily rule has no last occurrence. An edit to one occurrence becomes an exception row keyed by its <em>original</em> start time, which still identifies the occurrence after it is moved; Google's public Calendar API models this with <code>recurringEventId</code> and <code>originalStartTime</code>. 'This and following' splits the series: the old rule gets an UNTIL just before the split point and a new series starts there with the new rule. For queries, either expand rules on every read, which needs no storage but runs RRULE expansion in the read path, or materialize a rolling window. Materializing about 12 months ahead makes views and free/busy plain range scans; a nightly job extends the window, and the rare view beyond it expands on the fly." },
        { t: "table", head: ["Kind of time", "Stored as", "Why"], rows: [
          ["One-off meeting", "UTC instant plus the creator's time zone for display", "It is the same instant for every attendee"],
          ["Recurring meeting", "Local wall time plus IANA zone plus RRULE, e.g. 09:00 America/New_York", "Stays at 09:00 local across DST: 14:00 UTC in winter, 13:00 UTC in summer"],
          ["All-day event or birthday", "A floating date with no zone", "November 2 is November 2 in every time zone"],
          ["Exception to a series", "(event_id, original_start) plus overridden fields", "Identifies the occurrence even after it has moved"]
        ] },
        { t: "callout", kind: "warn", title: "The UTC trap", html: "'Store everything in UTC' is right for log lines and wrong for recurring meetings. A weekly 09:00 New York meeting stored as 14:00 UTC would show at 10:00 local after clocks move forward in March. Time zone rules also change by government decision, so when the tz database updates, re-expand the instances in the affected zones." },
        { t: "p", html: "<b>Invites and RSVPs.</b> The organizer's shard holds the one canonical event and the attendee list; each internal attendee gets a <code>calendar_entries</code> row on their own shard through an idempotent, asynchronous upsert, so their view stays a local query. Entries reference the event rather than copying it, so a title change is just a cache invalidation, not a fan-out — the 'fan out IDs, hydrate on read' rule from the news feed. An RSVP updates the attendee row on the organizer's shard and the attendee's entry. External attendees receive iMIP email (RFC 6047): a <code>text/calendar</code> part with METHOD:REQUEST, a stable UID and a SEQUENCE that increases with each significant change; their clients answer with METHOD:REPLY, which the inbound mail pipeline matches by UID. Concurrent edits use optimistic concurrency: the request carries the version it read (an etag), and a stale write gets 412 and retries on fresh data." },
        { t: "diagram", caption: "Only the next reminder per attendee and event exists; the worker revalidates against the current event version at fire time, sends with an idempotency key and schedules the next occurrence.", code: `sequenceDiagram
  participant RP as Reminder planner
  participant RS as Reminder buckets
  participant W as Scheduler worker
  participant EV as Event service
  participant N as Notification system
  participant P as Ana's phone
  RP->>RS: put u1, event e9, occurrence 09:00, fire 08:50, version 7
  loop every minute, a few minutes ahead
    W->>RS: lease shard 17, prefetch bucket 08:50
  end
  W->>EV: is e9 still at version 7 and u1 still attending
  EV-->>W: yes
  W->>N: send with idempotency key u1, e9, 0900, 10m
  N->>P: push, Weekly sync in 10 minutes
  W->>RP: done, plan the next occurrence` },
        { t: "p", html: "<b>Reminders.</b> This is the delayed-job scheduler from Chapter 9 with a sharp daily spike. The planner stores only the <em>next</em> reminder per (attendee, event), in a bucket for its fire minute, split into ~1,000 shards so many workers share the 08:50 burst. Workers lease shards (Chapter 8), prefetch buckets 2–5 minutes early and fire at the exact second. Edits do not chase down old reminder rows: at fire time the worker checks the stored version against the event and the attendee's status and drops stale reminders (lazy cancellation), while the planner writes a fresh row for the new time. Sending with an idempotency key of (user, event, occurrence, offset) means a worker that crashes and loses its lease cannot cause a double reminder. After an outage, reminders still before their event's start are sent late; the rest are dropped." },
        { t: "list", items: [
          "<b>Free/busy and find-a-time.</b> Range-scan each attendee's instances for the window, merge overlapping intervals and return only busy blocks for calendars whose details the requester may not see. Find-a-time intersects the free gaps inside working hours.",
          "<b>Big events.</b> A 10,000-attendee all-hands means 10,000 entry upserts, done in batches by the invite worker; updates notify attendees in paced batches through the notification system.",
          "<b>Sync.</b> Every change to a calendar appends to its change log, and a sync token encodes the last change_seq a client saw; clients send it to receive only what changed, and an expired token forces a full resync."
        ] },
        { t: "h", text: "7. Trade-offs and bottlenecks" },
        { t: "table", head: ["Decision", "Benefit", "Cost"], rows: [
          ["Rule plus exceptions, materialized 12 months ahead", "Views and free/busy are range scans", "An expander to run; series edits rewrite many instance rows"],
          ["Wall time plus IANA zone for recurrences", "Correct across DST and rule changes", "Expansion needs the tz database; re-expand when it changes"],
          ["Canonical event plus per-attendee entries", "Local views; edits do not copy data", "Async upserts mean an attendee may see an invite a second late"],
          ["Next-reminder-only, minute buckets, lazy cancel", "Small reminder table; edits are cheap", "Validation read at fire time; sized for on-the-hour spikes"],
          ["Optimistic concurrency with etags", "No locks; lost updates are detected", "Clients must handle 412 and retry"]
        ] }
      ],
      followups: [
        "The organizer moves a two-year weekly series 30 minutes later, but six occurrences already have individual edits. What happens to those exceptions?",
        "A country abolishes daylight saving time with three months' notice. What does the system have to do?",
        "How would you add meeting-room booking so a room can never be double-booked?",
        "How would you send every user a daily agenda email at 07:00 in their own time zone?",
        "How would you support a 'working location' or out-of-office that auto-declines new invites?"
      ]
    }
  ]
};
