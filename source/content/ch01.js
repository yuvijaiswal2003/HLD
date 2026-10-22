module.exports = {
  id: "foundations",
  num: 1,
  part: 1,
  title: "How to Think About System Design",
  tagline: "What interviewers grade, why systems evolve the way they do, and a plan for 45 minutes.",
  level: "Beginner",
  lessons: [
    {
      id: "what-is-hld",
      title: "What system design is, and what interviewers grade",
      minutes: 8,
      blocks: [
        { t: "p", html: "<b>System design</b> is deciding which components a software system needs, what each one is responsible for, how they talk to each other, and where the data lives, so that the whole thing meets its goals for scale, speed, reliability and cost. A <b>high-level design (HLD)</b> works at the level of boxes and arrows: clients, load balancers, application services, databases, caches, queues, and the requests and data flowing between them." },
        { t: "p", html: "A <b>low-level design (LLD)</b> zooms into one of those boxes: the classes and interfaces inside a service, function signatures, the exact columns and indexes of a table, error handling, design patterns. Real engineering needs both. Interviews usually test them in separate rounds, and this course is about HLD." },
        { t: "table", head: ["Aspect", "High-level design", "Low-level design"], rows: [
          ["Question it answers", "What components exist and how do they interact?", "How is this one component built inside?"],
          ["Unit of design", "Services, datastores, caches, queues, CDNs, regions", "Classes, modules, method contracts, table schemas"],
          ["Typical artifacts", "Architecture diagram, data flow, capacity estimates", "Class diagrams, call sequences, DDL"],
          ["Main concerns", "Scalability, availability, latency, consistency, cost", "Correctness, readability, extensibility, testability"],
          ["Interview example", "“Design YouTube”", "“Design the classes for a parking lot”"]
        ] },
        { t: "h", text: "Why there is no single right answer" },
        { t: "p", html: "Every design is a bundle of trade-offs. Take the like counter on a post. Keeping it in one SQL row is simple and always exact, but that row becomes a lock hotspot when a viral post gets 50,000 likes per second. Splitting it into many counter rows (or keeping it in an in-memory store and flushing periodically) scales, but the number you show can be slightly behind for a moment. Neither is “correct” in the abstract. The right choice depends on how exact the count must be and how much traffic you expect." },
        { t: "p", html: "Interviewers know this. They are not checking whether your diagram matches a reference answer. They are checking whether you can name the options, pick one for reasons tied to the requirements, and say what you gave up." },
        { t: "h", text: "What interviewers actually evaluate" },
        { t: "table", head: ["Signal", "Done well", "Red flag"], rows: [
          ["Problem scoping", "Asks focused questions, writes down requirements and scale, agrees on what is out of scope", "Starts drawing boxes in the first minute"],
          ["Structure", "Moves through clear phases and says what comes next", "Wanders between topics, revisits basics at minute 40"],
          ["Technical depth", "Explains how a component works and why it fits this workload", "Names products without explaining them"],
          ["Trade-offs", "Compares two or more options against the requirements", "Presents one option as the only possible one"],
          ["Quantitative reasoning", "Uses estimates to justify decisions such as shard count or cache size", "Never computes anything, or computes and then ignores the result"],
          ["Communication", "Thinks out loud, checks in, adapts to hints", "Goes silent for minutes, or argues with every hint"]
        ] },
        { t: "p", html: "Expectations rise with level. A mid-level candidate should reach a working, sensible design with some prompting. A senior candidate should drive the conversation, find the hard parts without being told, and go deep on two or three of them. A staff-level candidate additionally discusses operations (deploys, migrations, on-call), how the design evolves over years, and its cost to the organization." },
        { t: "callout", kind: "interview", title: "One sentence that shows four signals", html: "“I'll use PostgreSQL for orders because we need multi-row transactions, and at about 2,000 writes per second a single primary handles it. If writes grow 10x, we'd shard by <code>customer_id</code>.” That sentence states a requirement, a decision, a number, and an escape hatch. Aim to talk like this all interview." },
        { t: "callout", kind: "tip", title: "Treat hints as directions", html: "When an interviewer asks “what happens if this node dies?” or “how big does this table get?”, they are pointing at the part they want you to go deep on. Thank them, answer it properly, and keep going." }
      ]
    },
    {
      id: "scaling-journey-1",
      title: "The scaling journey, part 1: from one server to many",
      minutes: 10,
      blocks: [
        { t: "p", html: "Most large systems were not designed at their final size. They evolved: traffic grew, something broke, and the team added the component that fixed that specific bottleneck. Walking through this evolution is the fastest way to learn why each building block exists. We'll follow an imaginary recipe-sharing site from launch to tens of millions of users. At each stage, look for the bottleneck that forces the next change." },
        { t: "h", text: "Stage 1: everything on one server" },
        { t: "p", html: "At launch, one virtual machine runs the web server (say Nginx), the application code and the database. DNS maps <code>recipes.example.com</code> to that machine's IP address. This is cheap and easy to deploy and debug. It has two problems. First, the machine is a <b>single point of failure (SPOF)</b>: a component whose failure takes the whole system down. Second, the app and the database fight over the same CPU, memory and disk." },
        { t: "diagram", caption: "Stage 1: one machine does everything, so any failure of that machine is a full outage.", code: `flowchart LR
  U(("Users")) -->|"1. resolve recipes.example.com"| DNS["DNS"]
  U -->|"2. HTTPS requests"| S["Single server<br/>Nginx + app + PostgreSQL"]` },
        { t: "h", text: "Stage 2: move the database to its own machine" },
        { t: "p", html: "Separating the database lets each tier be sized for its job: app servers want CPU, databases want RAM and fast disks. It also prepares the app tier to be copied later. At this stage most teams also scale <b>vertically</b>: they move to a bigger machine with more cores and memory. Vertical scaling is simple and buys real time (a single modern server can have 64+ cores and over 1 TB of RAM), but it has a hard ceiling, the price climbs steeply near the top, and the machine is still a SPOF." },
        { t: "h", text: "Stage 3: a load balancer and many app servers" },
        { t: "p", html: "<b>Horizontal scaling</b> means adding more machines instead of bigger ones. A <b>load balancer</b> sits in front of several identical app servers, spreads requests across them, checks their health, and stops sending traffic to any that fail. Losing one app server now only reduces capacity a little." },
        { t: "p", html: "This only works if app servers are <b>stateless</b>: they keep nothing in local memory that a later request needs. If user sessions live in one server's memory, a user whose next request lands on another server appears logged out. Shared state moves to a shared store such as Redis, or into a signed token the client carries. Chapter 4 covers load balancing in depth." },
        { t: "diagram", caption: "Stage 3: any app server can handle any request because session state lives in a shared store, not in server memory.", code: `flowchart LR
  U(("Users")) --> LB["Load balancer"]
  LB --> A1["App server 1"]
  LB --> A2["App server 2"]
  LB --> A3["App server 3"]
  A1 --> DB[("PostgreSQL")]
  A2 --> DB
  A3 --> DB
  A1 -.->|"sessions"| R[("Redis")]
  A2 -.-> R
  A3 -.-> R` },
        { t: "h", text: "Stage 4: add a cache" },
        { t: "p", html: "Most applications are <b>read-heavy</b>: a recipe is viewed hundreds of times for every edit, and a small set of popular recipes gets most of the views. A <b>cache</b> such as Redis or Memcached keeps hot data in memory. A cache read takes well under a millisecond, versus a few milliseconds for an indexed database query, and every cache hit is a query the database never sees. The common pattern is <b>cache-aside</b>: check the cache, and on a miss read the database and store the result with an expiry time. The cost is that cached data can be stale, and keeping it fresh is genuinely hard. Chapter 5 is devoted to caching." },
        { t: "h", text: "Stage 5: serve static content from a CDN" },
        { t: "p", html: "Images, CSS, JavaScript and video are the same for every user. A <b>content delivery network (CDN)</b> is a provider-run fleet of cache servers in hundreds of locations worldwide. A user in Mumbai downloads a photo from a nearby edge server in tens of milliseconds instead of fetching it from your servers in Virginia, roughly 200 ms of round trip away, and your servers no longer spend bandwidth on it. Files usually live in object storage such as Amazon S3, which acts as the CDN's origin." },
        { t: "diagram", caption: "Stage 5: static files come from the CDN edge, while only dynamic API calls reach the app tier, which reads through a cache.", code: `flowchart LR
  U(("Users")) -->|"images, JS, CSS"| CDN["CDN edge"]
  CDN -.->|"on miss"| OS[("Object storage")]
  U -->|"API calls"| LB["Load balancer"]
  LB --> A1["App server"]
  LB --> A2["App server"]
  A1 --> C[("Redis cache")]
  A2 --> C
  A1 --> DB[("PostgreSQL")]
  A2 --> DB` },
        { t: "callout", kind: "warn", title: "Don't start at the last stage", html: "A design for 1,000 users that already has sharding, Kafka and three regions is a red flag, just like a single server for 100 million users. Interviewers want the design to match the numbers. Say which stage the estimated scale requires, and mention what you would add later." }
      ]
    },
    {
      id: "scaling-journey-2",
      title: "The scaling journey, part 2: data, async work and regions",
      minutes: 10,
      blocks: [
        { t: "p", html: "After stage 5, the app tier scales by adding servers and static traffic is off our hands. The remaining pressure lands on the database, on slow work done inside requests, and on geography." },
        { t: "h", text: "Stage 6: read replicas" },
        { t: "p", html: "Even with a cache, cache misses and uncacheable queries eventually saturate the database. Because reads outnumber writes, we add <b>read replicas</b>: copies of the database that receive every change from the <b>primary</b> and serve read queries. All writes still go to the primary. Replicas also give us a standby to promote if the primary dies." },
        { t: "p", html: "The catch is <b>replication lag</b>. Replication is usually asynchronous, so a replica can be milliseconds to seconds behind. A user who updates their profile and immediately reloads may read from a replica that hasn't applied the change yet and see the old value. Chapter 7 covers fixes such as routing a user's reads to the primary for a short time after they write." },
        { t: "diagram", caption: "Stage 6: writes go to one primary, which streams changes to replicas that share the read load.", code: `flowchart LR
  A["App servers"] -->|"writes"| P[("Primary")]
  P -.->|"async replication"| R1[("Replica 1")]
  P -.->|"async replication"| R2[("Replica 2")]
  A -->|"reads"| R1
  A -->|"reads"| R2` },
        { t: "h", text: "Stage 7: sharding" },
        { t: "p", html: "Replicas multiply read capacity, but every replica still holds the full dataset and every write still goes through one primary. When the data no longer fits on one machine, or writes exceed what one primary can absorb, we <b>shard</b> (also called horizontal partitioning): different rows live on different database servers, chosen by a <b>shard key</b>. For example, <code>hash(user_id) mod 16</code> picks one of 16 shards, and each shard has its own replicas." },
        { t: "p", html: "Sharding is powerful and expensive. Queries that span shards (“top recipes across all users”) need scatter-gather or a separate index. Transactions across shards are hard. Adding shards means moving data. A bad shard key creates a hot shard. The shard key should match the main access pattern so most requests touch one shard. Chapter 7 goes deep on this." },
        { t: "h", text: "Stage 8: queues for asynchronous work" },
        { t: "p", html: "Some work doesn't need to finish while the user waits: resizing an uploaded photo, sending a welcome email, updating the search index, notifying followers. The app puts a message on a <b>message queue</b> (RabbitMQ, Amazon SQS, Kafka) and returns immediately. <b>Workers</b> consume messages at their own pace. Responses get faster, traffic spikes are absorbed by the queue instead of overloading downstream systems (load leveling), and a failing email provider no longer breaks sign-up. The cost: work completes later (eventual consistency), and workers need retries and must tolerate processing a message twice. Chapter 9 covers messaging." },
        { t: "diagram", caption: "Stage 8: the API does the minimum synchronously and hands slow work to independent workers through a queue.", code: `flowchart LR
  U(("User")) -->|"POST recipe"| API["API server"]
  API -->|"1. save"| DB[("Database")]
  API -->|"2. publish RecipeCreated"| Q[["Message queue"]]
  Q --> W1["Thumbnail worker"]
  Q --> W2["Search indexer"]
  Q --> W3["Email worker"]` },
        { t: "h", text: "Stage 9: multiple regions" },
        { t: "p", html: "A single data center or cloud region is still one failure domain, and users on other continents pay 100 to 200 ms of network round trip per request. Running full copies of the stack in several regions puts servers near users and lets the system survive a regional outage. GeoDNS or anycast sends each user to a nearby healthy region. The hard part is data: either each user's data has one home region that takes its writes (simpler), or every region accepts writes and they replicate to each other, which requires resolving conflicting updates. Chapters 7 and 12 cover these designs." },
        { t: "diagram", caption: "Stage 9: each region serves nearby users from its own stack, and the databases replicate across regions asynchronously.", code: `flowchart LR
  U1(("US users")) -->|"GeoDNS answer: us-east"| LB1
  U2(("EU users")) -->|"GeoDNS answer: eu-west"| LB2
  subgraph R1["Region us-east"]
    LB1["Load balancer"] --> App1["App servers"] --> DB1[("Database")]
  end
  subgraph R2["Region eu-west"]
    LB2["Load balancer"] --> App2["App servers"] --> DB2[("Database")]
  end
  DB1 -.->|"async replication"| DB2
  DB2 -.->|"async replication"| DB1` },
        { t: "table", head: ["Stage", "Change", "Bottleneck it removes", "New problem it brings"], rows: [
          ["1", "One server", "None yet", "SPOF; app and DB compete for resources"],
          ["2", "Separate DB server, bigger machines", "Resource contention", "Still SPOFs; vertical ceiling"],
          ["3", "Load balancer + many app servers", "App CPU; app server failures", "App must be stateless; LB must be redundant"],
          ["4", "Cache", "Read load and read latency on the DB", "Stale data; invalidation"],
          ["5", "CDN for static content", "Bandwidth; latency for distant users", "Purging and versioning files"],
          ["6", "Read replicas", "DB read throughput", "Replication lag"],
          ["7", "Sharding", "Write throughput; data size", "Cross-shard queries; rebalancing; hot shards"],
          ["8", "Queues + workers", "Slow work in requests; traffic spikes", "Eventual consistency; retries; duplicates"],
          ["9", "Multiple regions", "Regional outages; global latency", "Cross-region consistency; cost"]
        ] },
        { t: "callout", kind: "example", title: "Instagram's early path", html: "Instagram's early backend, described on its engineering blog, was Django on AWS with PostgreSQL, Redis and Memcached. As data grew, the team sharded PostgreSQL by user into several thousand logical shards mapped onto far fewer physical servers, so shards could later be moved to new machines without re-splitting the data." },
        { t: "callout", kind: "interview", title: "Use the journey as a checklist", html: "You rarely walk every stage in an interview. Instead ask: “At the scale we estimated, where is the bottleneck?” Then add only the components that the numbers justify, and say which stage you would reach next if traffic grew 10x." }
      ]
    },
    {
      id: "requirements",
      title: "Requirements: turning a vague prompt into numbers",
      minutes: 10,
      blocks: [
        { t: "p", html: "Interview prompts are vague on purpose: “Design Twitter.” Your first job is to turn that into a short written list of what the system must do and how well it must do it. Everything you design later should trace back to this list." },
        { t: "h", text: "Functional requirements" },
        { t: "p", html: "<b>Functional requirements</b> are the features: behavior a user or another system can observe. Phrase them as actions: “a user can post a message of up to 280 characters”, “a user sees a timeline of posts from accounts they follow, newest first”. In an interview, pick the 3 to 5 core features and say explicitly what is out of scope, such as ads, direct messages or analytics." },
        { t: "h", text: "Non-functional requirements" },
        { t: "p", html: "<b>Non-functional requirements</b> (NFRs, also called quality attributes) describe how well the system performs those functions. They shape the architecture far more than features do. A chat app for 100 users and one for a billion have the same features and completely different designs." },
        { t: "table", head: ["NFR", "What it means", "How to make it a number", "Example target"], rows: [
          ["Scalability", "Handles growth in users, data and traffic by adding resources", "Peak requests per second, data volume, growth per year", "50k reads/s at peak; 10 TB growing 3 TB/year"],
          ["Availability", "Fraction of time the system answers requests successfully", "Uptime percentage, often per operation", "99.95% for reading; 99.9% for posting"],
          ["Latency", "How long a request takes", "Percentiles such as p50 and p99 per key operation", "Timeline p99 under 200 ms"],
          ["Consistency", "Whether readers see the latest write", "Which data must be strongly consistent and how stale the rest may be", "Like counts may lag 5 s; account balances never"],
          ["Durability", "Acknowledged data is never lost", "Acceptable data loss window, number of copies", "No acknowledged message lost; 3 replicas in 3 zones"],
          ["Cost", "Money to build and run the system", "Monthly infrastructure budget or cost per user", "Under $0.02 per monthly active user"],
          ["Security and privacy", "Only the right people see and change data", "Auth needs, encryption, compliance obligations", "TLS everywhere; encrypted at rest; delete user data within 30 days on request"]
        ] },
        { t: "p", html: "A note on latency: the <b>p99</b> (99th percentile) is the time that 99% of requests beat. Prefer percentiles to averages, because an average hides the slow tail. If a page makes 50 backend calls, the chance that at least one is slower than the backend's p99 is 1 - 0.99^50, about 40%, so tail latency shapes what users actually feel." },
        { t: "h", text: "Turning vague asks into numbers" },
        { t: "steps", items: [
          { title: "Ask who and how many", html: "“How many daily active users (DAU) should we design for, and where are they?” Example answer: 10 million DAU, mostly North America and Europe." },
          { title: "Ask what they do", html: "“How many times a day does a typical user read and write?” Example: views 20 posts and writes 1, so reads outnumber writes 20 to 1." },
          { title: "Ask about the data", html: "“How big is a typical object, and how long do we keep it?” Example: 1 KB per post, kept forever, with optional images." },
          { title: "Ask what matters most", html: "“Which is worse here: showing slightly stale data, losing data, or being down?” The answer tells you where to spend on consistency, durability and availability." },
          { title: "Write it down and convert", html: "Turn the answers into requests per second, storage per year and bandwidth. Chapter 3 shows how to do this arithmetic quickly." }
        ] },
        { t: "p", html: "Here is what a finished requirements list looks like for “Design a comments system for a news site.” Notice how short it is. It fits in a corner of the whiteboard and drives every later decision." },
        { t: "code", lang: "text", code: `Functional
  - Post a comment on an article (text, up to 2,000 chars)
  - List comments for an article, newest first, paginated
  - Reply to a comment (one level of nesting)
  - Out of scope: ML moderation, notifications, reactions

Non-functional
  - 5M DAU, reads:writes about 100:1
  - Read p99 under 200 ms, post p99 under 500 ms
  - 99.9% availability for reads
  - New comments may take up to 5 s to appear for other readers
  - An acknowledged comment is never lost` },
        { t: "callout", kind: "interview", title: "Plant your trade-offs early", html: "Say the consistency decision while gathering requirements: “I'll assume a few seconds of delay before other readers see a new comment is fine, but the comment itself must never be lost.” Later, when you add caches and async replication, you can point back to this agreement." },
        { t: "callout", kind: "warn", title: "Don't interrogate the interviewer", html: "Four to seven focused questions is plenty. If the interviewer says “you decide”, state a reasonable assumption out loud (“I'll assume 10M DAU”) and move on. Spending 15 minutes on questions is as harmful as asking none." }
      ]
    },
    {
      id: "interview-framework",
      title: "A 45-minute interview framework",
      minutes: 12,
      blocks: [
        { t: "p", html: "Most system design interviews last 45 to 60 minutes. Without a plan, candidates either spend 20 minutes on requirements or draw boxes for 40 minutes and never show depth. The budget below fits a 45-minute slot; stretch each phase proportionally for 60." },
        { t: "table", head: ["Phase", "Time", "Goal", "On the board when done"], rows: [
          ["1. Clarify requirements", "~5 min", "Agree on scope and quality bar", "Functional list, NFR list, out-of-scope list"],
          ["2. Estimate", "~5 min", "Find the scale that drives the design", "Average and peak QPS, storage, bandwidth if relevant"],
          ["3. API and data model", "5–10 min", "Define the contract and core entities", "2 to 5 endpoints; main tables with keys"],
          ["4. High-level design", "10–15 min", "A working end-to-end design", "Boxes and arrows covering the main read and write paths"],
          ["5. Deep dives", "~10 min", "Show depth on the 2 or 3 hardest parts", "Detailed sub-designs with alternatives and numbers"],
          ["6. Wrap-up", "~5 min", "Show you know the weaknesses", "Bottlenecks, failure modes, what changes at 10x"]
        ] },
        { t: "diagram", caption: "The six phases in order; estimates from phase 2 are reused to justify decisions in phases 4 and 5.", code: `flowchart LR
  C["1. Clarify<br/>5 min"] --> E["2. Estimate<br/>5 min"]
  E --> A["3. API and data model<br/>5-10 min"]
  A --> H["4. High-level design<br/>10-15 min"]
  H --> D["5. Deep dives<br/>10 min"]
  D --> W["6. Wrap-up<br/>5 min"]
  E -.->|"numbers justify choices"| D` },
        { t: "h", text: "Phase 1: clarify" },
        { t: "list", items: [
          "Restate the problem: “So we're building X for Y kind of user. The core features I hear are A, B and C. Anything else critical?”",
          "Scale: “Roughly how many daily active users, and is traffic global or regional?”",
          "Quality: “Is it worse to show stale data or to be unavailable for a moment?”",
          "Scope: “I'll leave out D and E unless you want them.”"
        ] },
        { t: "h", text: "Phase 2: estimate" },
        { t: "p", html: "Only compute numbers that can change a decision: read and write QPS, storage growth, and sometimes bandwidth or cache memory. Round hard. Then say what the numbers mean: “3,000 writes per second fits on one well-tuned PostgreSQL primary, but 300 TB over five years does not fit on one machine, so storage must be partitioned.”" },
        { t: "h", text: "Phase 3: API and data model" },
        { t: "p", html: "The API pins down exactly what the system does; the data model reveals the access patterns that pick the database. Keep both short." },
        { t: "code", lang: "http", code: `POST /v1/articles/{article_id}/comments
  body: { "text": "...", "parent_id": null }
  -> 201 Created  { "comment_id": "c_8f2", "created_at": "..." }

GET /v1/articles/{article_id}/comments?cursor=c_8f2&limit=20
  -> 200 OK  { "comments": [ ... ], "next_cursor": "c_7a1" }` },
        { t: "h", text: "Phase 4: high-level design" },
        { t: "p", html: "Draw the simplest design that satisfies every functional requirement end to end: client, load balancer, services, storage. Walk through one write and one read out loud, naming each hop. Only after that works should you start optimizing." },
        { t: "h", text: "Phase 5: deep dives" },
        { t: "p", html: "Pick the parts where the non-functional requirements bite: a hot key, a large fan-out, a strict consistency need, a dataset too big for one machine. If the interviewer doesn't choose, propose: “The two hardest parts are X and Y. I'd like to start with X.” For each, present two options, compare them against the requirements, and choose." },
        { t: "h", text: "Phase 6: wrap-up" },
        { t: "p", html: "Name the bottlenecks and remaining single points of failure, the metrics you would alert on, and what you would change at 10x traffic. Pointing out your own design's weaknesses is a strong senior signal." },
        { t: "callout", kind: "interview", title: "Drive, but check in", html: "Announce transitions (“I have a working design. Now let me look at the bottlenecks.”) and check in about once per phase (“Is this the right level of detail, or should I go deeper on storage?”). Interviewers explicitly grade whether you lead the conversation." },
        { t: "callout", kind: "tip", title: "Keep a parking lot", html: "Write a short list in a corner of the board for topics you'll return to, such as “hot celebrity accounts” or “rate limiting”. It shows awareness without derailing the current phase, and it gives you a ready list of deep-dive candidates." }
      ]
    },
    {
      id: "common-mistakes",
      title: "Common mistakes and how to avoid them",
      minutes: 7,
      blocks: [
        { t: "p", html: "Most failed system design interviews fail for a handful of repeated reasons, and almost none of them are about not knowing a technology. They are about process. Each mistake below has a simple counter-habit." },
        { t: "table", head: ["Mistake", "What it looks like", "Do this instead"], rows: [
          ["Jumping to solutions", "“We'll use Kafka and Cassandra” in minute one", "Clarify requirements first; let the numbers pick the technology"],
          ["Buzzword soup", "Every box is a product name with no reason attached", "For each component, say what problem it solves and why this one"],
          ["Ignoring numbers", "Estimates computed, then never used again", "Tie decisions to numbers: shard count, cache size, server count"],
          ["Not driving", "Waiting for the interviewer to ask the next question", "Announce the plan and propose deep-dive topics yourself"],
          ["Over-engineering", "Multi-region active-active for a 500-person internal tool", "Match the stated scale and SLA; describe how it would evolve"],
          ["One option only", "Picks a database without considering any other", "Compare two options briefly, then choose with a reason"],
          ["Ignoring failure", "No answer to “what if this node dies?”", "Look for SPOFs; add replicas, failover, retries, health checks"],
          ["Going silent", "Long pauses while thinking privately", "Think out loud, even when unsure"],
          ["Rabbit-holing", "Fifteen minutes on the exact JSON field names", "Timebox details; offer to come back later"]
        ] },
        { t: "h", text: "Buzzword soup versus a reasoned choice" },
        { t: "p", html: "Weak: “We'll put Kafka in the middle, Cassandra for storage, Redis for caching, and run it all on Kubernetes.” Nothing here says why." },
        { t: "p", html: "Strong: “Writes are about 30,000 per second, append-only, always looked up by user and time, with no multi-row transactions. That suits a wide-column store like Cassandra, which absorbs high write rates by appending to a log-structured storage engine. The trade-off is that we can only query efficiently by partition key, so I'll make <code>user_id</code> the partition key and time the clustering key.” Same technology, but now the interviewer sees the reasoning and the cost." },
        { t: "h", text: "A self-check before you say you're done" },
        { t: "list", ordered: true, items: [
          "Does the diagram cover every functional requirement, for both the read and the write path?",
          "Does every non-functional requirement have a mechanism? (Availability: replicas and failover. Latency: cache and CDN. Durability: replication and backups.)",
          "Did I use my estimates to size something?",
          "Where are the single points of failure?",
          "What breaks first at 10x traffic, and what would I change?"
        ] },
        { t: "callout", kind: "warn", title: "Don't recite a memorized answer", html: "Interviewers often change a constraint halfway (“now users are in five countries with data-residency laws”) precisely to see whether you reason or recite. Learn why designs look the way they do, so you can adapt when the constraint changes." },
        { t: "callout", kind: "interview", title: "Criticize your own design", html: "Ending with “The weakest part of this design is the single Redis node for counters; if it fails we lose up to a second of increments. With more time I'd add a replica and periodic reconciliation from the database” scores better than claiming the design has no weaknesses." }
      ]
    }
  ],
  takeaways: [
    "HLD decides the components, their responsibilities, how they communicate and where data lives; LLD designs the inside of one component.",
    "Interviewers grade the process: scoping, structure, depth, trade-offs, numbers and communication. There is no single reference answer.",
    "Systems scale in stages, and each building block (load balancer, cache, CDN, replicas, shards, queues, regions) removes one bottleneck and introduces a new problem.",
    "Stateless app servers are the precondition for horizontal scaling; shared state belongs in a database, a cache or a signed token.",
    "Non-functional requirements drive architecture more than features do; turn each one into a number (QPS, p99 latency, nines, staleness window).",
    "State latency targets as percentiles such as p99, not averages, because the slow tail is what users feel.",
    "Use a time-boxed plan: clarify (5), estimate (5), API and data model (5–10), high-level design (10–15), deep dives (10), wrap-up (5).",
    "Tie every choice to a requirement or an estimate, and say what you give up.",
    "Lead the conversation: announce transitions, propose deep dives, and point out your own design's weaknesses."
  ],
  mcqs: [
    {
      q: "Which of these is a <b>low-level design</b> concern rather than a high-level design concern?",
      options: [
        "Choosing between a message queue and synchronous calls between two services",
        "Defining the classes and interfaces inside the payment service",
        "Putting a CDN in front of images and other static assets",
        "Splitting user data across database shards by user ID"
      ],
      answer: 1,
      explain: "Classes and interfaces describe the inside of one component, which is LLD. The other three decide which components exist and how data and requests flow between them, which is HLD.",
      level: "easy"
    },
    {
      q: "Which of these is a <b>non-functional</b> requirement?",
      options: [
        "Users can upload and crop a profile photo",
        "Users can search posts by hashtag or username",
        "Admins can suspend an account for 30 days",
        "The home feed loads in under 200 ms at p99"
      ],
      answer: 3,
      explain: "A latency target describes how well the system works, not what it does. The other options are features a user can observe, which are functional requirements.",
      level: "easy"
    },
    {
      q: "Your app and database run on one server. The app code saturates the CPU, and the database's working set no longer fits in memory. What is the most sensible next step?",
      options: [
        "Move the database to its own machine with more RAM",
        "Shard the database across 16 nodes by user ID",
        "Deploy a second copy of the stack in another region behind GeoDNS",
        "Put a message queue between the app and the database"
      ],
      answer: 0,
      explain: "The problem is two workloads competing for one machine, so separating them is the cheapest fix and lets you give the database more RAM. Sharding or multi-region solve problems of a much larger scale and add a lot of complexity.",
      level: "medium"
    },
    {
      q: "You put a load balancer in front of four app servers. Users now report being logged out at random. What is the most likely cause?",
      options: [
        "The load balancer uses round robin instead of least connections",
        "The database cannot handle four times as many connections",
        "Each app server keeps user sessions in its own local memory",
        "The app servers have different TLS certificate expiry dates"
      ],
      answer: 2,
      explain: "With in-memory sessions, a request that lands on a different server finds no session. Make the servers stateless by keeping sessions in a shared store like Redis or in signed tokens; sticky sessions are a workaround with their own problems.",
      level: "medium"
    },
    {
      q: "In which situation do read replicas help the most?",
      options: [
        "Writes are 80% of traffic and the primary's disk is nearly full",
        "The application needs transactions that span several shards",
        "Reads are 95% of traffic and the primary's CPU is saturated",
        "Every user must always read their own writes immediately"
      ],
      answer: 2,
      explain: "Replicas add read capacity by serving queries from copies. They don't add write capacity or disk space (each holds the full data), and asynchronous replicas can lag, which works against read-your-writes.",
      level: "easy"
    },
    {
      q: "Which problem does <b>sharding</b> solve that adding read replicas does not?",
      options: [
        "Write throughput and total data size beyond one machine",
        "Slow reads of a few viral posts that everyone requests",
        "Large image files using most of the outbound bandwidth",
        "High latency for users far from the only data center"
      ],
      answer: 0,
      explain: "Every replica stores the full dataset and all writes still go through one primary, so replicas can't help when writes or data outgrow a machine. Sharding splits both. Popular items are a caching problem, images are a CDN problem, and distant users need a CDN or more regions.",
      level: "hard"
    },
    {
      q: "A user changes their display name. The page reloads and shows the old name; a second later it shows the new one. The app writes to a primary and reads from asynchronous read replicas, with no cache. What is the cause?",
      options: [
        "Edge caching: the CDN served a stale copy of the profile page",
        "Load balancing: the reload went to a different app server",
        "Write retry: the primary lost the write and retried it a second later",
        "Replication lag: the read hit a replica that was still behind"
      ],
      answer: 3,
      explain: "Asynchronous replicas trail the primary by milliseconds to seconds. A common fix is to read a user's own data from the primary for a short window after they write. A stateless app tier makes the choice of app server irrelevant.",
      level: "medium"
    },
    {
      q: "What does moving images and video delivery to a CDN mainly achieve?",
      options: [
        "Stronger consistency for profile data read from many regions",
        "Lower latency for distant users and less origin bandwidth",
        "Faster SQL joins by running queries at edge locations",
        "Automatic sharding of the metadata database by region"
      ],
      answer: 1,
      explain: "A CDN caches static files at edge locations near users, so downloads are faster and your origin serves only cache misses. It does nothing for database consistency or partitioning.",
      level: "easy"
    },
    {
      q: "Which piece of work is the best candidate to move out of the request path into a queue and background workers?",
      options: [
        "Generating thumbnails after a user uploads a photo",
        "Verifying a user's password hash during login",
        "Reading the price to show on the checkout page",
        "Checking that a new username is not already taken"
      ],
      answer: 0,
      explain: "Thumbnails can be produced a few seconds later without hurting the user, so a queue makes the upload fast and absorbs spikes. The others are needed to build the response the user is waiting for.",
      level: "medium"
    },
    {
      q: "The prompt is “Design an expense-report tool for 2,000 employees of one company.” A candidate proposes three active-active regions, Kafka and 32 Cassandra shards. What is the most likely feedback?",
      options: [
        "Strong, because it already handles a hundredfold growth in usage",
        "Weak, but only because Cassandra lacks multi-row transactions",
        "Weak, because one region and a relational DB fit this scale",
        "Strong, because multiple regions are required for any 99.9% target"
      ],
      answer: 2,
      explain: "2,000 users generate a trivial load, so the extra complexity costs money and operations for no benefit. Matching the design to the numbers is a core signal, and 99.9% is achievable within one region using multiple availability zones.",
      level: "hard"
    },
    {
      q: "In a 45-minute interview, you're at minute 25 and still refining requirements and estimates. What is the best move?",
      options: [
        "Keep refining, since precise estimates are the most important output",
        "Ask the interviewer to choose the database so you can save time",
        "Skip the API and go straight to a deep dive on caching",
        "State your assumptions and quickly sketch the end-to-end design"
      ],
      answer: 3,
      explain: "Without a working end-to-end design there is nothing to deep-dive into, and that is the most common way to fail. Lock in reasonable assumptions, draw the design, then use the remaining time for depth.",
      level: "medium"
    },
    {
      q: "Which latency requirement is the most useful to design against?",
      options: [
        "Average response time under 100 ms across all endpoints",
        "Feed endpoint p99 under 300 ms, measured at the load balancer",
        "Every request completes in under 1 ms, measured at the client",
        "All responses should be as fast as reasonably possible"
      ],
      answer: 1,
      explain: "It names an operation, a percentile, a threshold and where it is measured, so it can be designed for and tested. Averages hide the slow tail, 1 ms for everything is unrealistic once any network hop is involved, and “as fast as possible” can't be verified.",
      level: "hard"
    },
    {
      q: "For which feature is eventual consistency <b>least</b> acceptable?",
      options: [
        "The like count shown under a viral post",
        "The follower count shown on a public profile",
        "Reserving the last unit of an item at checkout",
        "A contact's “last seen” timestamp in a chat app"
      ],
      answer: 2,
      explain: "If two buyers can both reserve the last unit, you oversell, which costs money and trust. A like count, follower count or last-seen time that is a few seconds stale harms nobody.",
      level: "medium"
    },
    {
      q: "In a deep dive, the interviewer asks: “What happens if your single Redis cache node fails?” What is the best response?",
      options: [
        "Explain that misses would flood the DB, then add a replica with failover and request coalescing",
        "Explain that Redis keeps data in memory and rarely crashes, so the risk can be accepted as it is",
        "Switch to Memcached, since Memcached replicates every key to the other nodes in the cluster by default",
        "Store all data only in Redis, so that there is no longer a database behind it that could be overloaded"
      ],
      answer: 0,
      explain: "A good answer states the impact first (every request becomes a DB query, which may overload it), then the mitigations: a replica with automatic failover and protection such as request coalescing. Memcached does not replicate keys by default, and dropping the database trades a cache problem for a durability problem.",
      level: "hard"
    },
    {
      q: "Why should you estimate QPS and storage early in a design interview?",
      options: [
        "Because it shows the interviewer you have memorized latency tables",
        "Because the interviewer needs exact figures for capacity planning",
        "Because the numbers decide whether you need shards or caches",
        "Because estimates replace the need to discuss trade-offs later"
      ],
      answer: 2,
      explain: "Estimates exist to drive decisions: whether one database is enough, how big the cache must be, whether a CDN is required. Rough, order-of-magnitude numbers are enough; precision is not the point.",
      level: "easy"
    }
  ],
  design: [
    {
      id: "design-blog-1m",
      title: "Design a personal blog that grows to 1M readers",
      level: "Easy",
      prompt: "A writer wants a personal blog. It starts with a few hundred readers a month. Over two years it grows to 1 million monthly readers, and some posts go viral and get shared on Hacker News or Reddit, bringing huge sudden spikes. Readers read posts and leave comments; the author publishes a few posts a week. Design the system, and show how it should evolve from launch to 1M readers without wasting money.",
      clarify: [
        "Is 1M the number of monthly unique readers or page views? How many pages does a reader view per visit?",
        "How big is a viral spike: how many visitors, over how long?",
        "Are comments required, and must a new comment appear instantly for other readers?",
        "Do posts include images or video, and roughly how large?",
        "What is the budget? Should this cost tens of dollars a month or is more acceptable?",
        "Is a few minutes of downtime a month acceptable?",
        "Are search, newsletters or analytics in scope?"
      ],
      hints: [
        "Compare reads and writes: the author writes a few times a week while readers read all day. What does that suggest?",
        "Most of a post page is identical for every reader. Could the HTML itself be cached, not only the images?",
        "Calculate page views per second during a spike. Is that a lot for a CDN? For one small server running PHP and SQL on every request?",
        "Separate the static part (posts) from the dynamic part (comments); they need very different scaling.",
        "A static site generator plus object storage plus a CDN serves posts with no servers at all. Comments can be a tiny API that the page loads separately."
      ],
      solution: [
        { t: "h", text: "Requirements" },
        { t: "list", items: [
          "<b>Functional:</b> author publishes and edits posts (Markdown with images); readers view posts, an index page and an RSS feed; readers post and read comments.",
          "<b>Non-functional:</b> 1M monthly readers with viral spikes; posts load fast worldwide (first byte p95 under 200 ms); 99.9% availability for reading; new comments visible to others within about 30 s; low cost; acknowledged comments are not lost."
        ] },
        { t: "h", text: "Estimates" },
        { t: "code", lang: "text", code: `Monthly page views:  1M readers x 3 pages = 3M page views/month
Seconds per month:   30 x 86,400 = ~2.6M s
Average load:        3M / 2.6M s = ~1.2 page views/s   (tiny)

Viral spike:         200k visitors in 2 hours on one post
                     200,000 / 7,200 s = ~28 page views/s
                     busiest minutes ~5x that = ~150 page views/s
Bytes per new visitor: ~50 KB HTML + ~1.5 MB images, CSS, JS
Spike bandwidth:     150 x 1.5 MB = ~225 MB/s = ~1.8 Gbit/s

Comments:            1% of readers comment = 10k/month = ~0.004 writes/s
Storage after 2 yrs: posts 500 x 50 KB = 25 MB
                     images 500 x 5 x 300 KB = ~750 MB
                     comments 240k x 1 KB = ~240 MB` },
        { t: "p", html: "The numbers make the design obvious. Storage is under a few gigabytes and the average load is about one request per second. The only hard number is the spike: around 150 page views per second and close to 2 Gbit/s of bandwidth. That would knock over a small server that runs code and database queries per request, but it is routine for a CDN. This is a caching and CDN problem, not a database problem." },
        { t: "h", text: "API" },
        { t: "code", lang: "http", code: `GET  /posts/{slug}/                 -> static HTML, served by the CDN
GET  /api/posts/{slug}/comments?cursor=c_91&limit=50
     -> 200 { "comments": [ ... ], "next_cursor": "c_42" }
POST /api/posts/{slug}/comments
     body: { "name": "Ana", "text": "...", "captcha_token": "..." }
     -> 201 { "id": "c_92", "status": "published" }
POST /admin/publish                  (author only, triggers a rebuild)` },
        { t: "h", text: "Data model" },
        { t: "table", head: ["Store", "Contents", "Notes"], rows: [
          ["Git repository", "Posts as Markdown files plus images", "Source of truth for content; full history for free"],
          ["Object storage (S3 or similar)", "Generated HTML, images, CSS, JS", "CDN origin; cheap and highly durable"],
          ["PostgreSQL (small managed instance)", "<code>comments(id PK, post_slug, parent_id, author_name, text, status, created_at)</code>", "Index on <code>(post_slug, created_at)</code>; relational and tiny, with daily backups"]
        ] },
        { t: "h", text: "High-level design" },
        { t: "diagram", caption: "Posts are prebuilt files served from the CDN; only comment calls reach a server, and even those are briefly cached at the edge.", code: `flowchart LR
  R(("Readers")) --> CDN["CDN"]
  CDN -.->|"pages and images on miss"| OS[("Object storage")]
  CDN -->|"api requests"| API["Comments API<br/>2 small instances"]
  API --> DB[("PostgreSQL")]
  AU(("Author")) -->|"git push"| CI["Build pipeline<br/>static site generator"]
  CI -->|"upload HTML and images"| OS
  CI -.->|"purge changed URLs"| CDN` },
        { t: "p", html: "<b>Read path:</b> the reader's browser requests the post from the CDN. HTML, CSS and images come from the edge cache; on a miss the CDN fetches the file from object storage once and caches it. JavaScript on the page then fetches comments from <code>/api/...</code>, also through the CDN, which caches the response for 30 seconds. <b>Write path for posts:</b> the author pushes Markdown; a build job (Hugo, Jekyll, Astro or similar) renders HTML, uploads changed files and purges those URLs from the CDN. <b>Write path for comments:</b> the browser posts to the API, which checks the CAPTCHA and a per-IP rate limit, then inserts into PostgreSQL." },
        { t: "h", text: "Deep dives" },
        { t: "p", html: "<b>Evolving with traffic.</b> Each step is driven by a number, not by fashion:" },
        { t: "table", head: ["Readers per month", "Design", "Why"], rows: [
          ["Under 10k", "One small VM running WordPress or Ghost with its database", "Cheapest and simplest; load is negligible"],
          ["10k to 100k", "Same VM plus a CDN in front for images and cached pages", "Offloads bandwidth and absorbs small spikes"],
          ["100k to 1M", "Static site on object storage plus CDN; separate comments API", "Posts need no servers; only comments are dynamic"],
          ["Beyond 1M with busy comments", "More API instances behind a load balancer, Redis for comment lists, a read replica", "Only when comment traffic itself justifies it"]
        ] },
        { t: "p", html: "<b>Surviving the spike.</b> The classic failure is the “hug of death”: every page view runs application code and several SQL queries, and a small server collapses at about 100 requests per second. With static HTML on a CDN, origin load hardly changes with traffic. Set cache headers deliberately: HTML gets a long CDN TTL and is purged on publish; CSS, JS and images use content-hashed file names (<code>app.3f9a1c.css</code>) with a one-year TTL, so a change simply produces a new URL. For comments, a 30-second edge TTL means even 150 page views per second produce roughly one origin request per post per CDN location every 30 seconds." },
        { t: "p", html: "<b>Seeing your own comment.</b> A commenter expects to see their comment immediately, but the cached list may be 30 seconds old. Solve it in the browser: after a successful POST, insert the returned comment into the visible list. Other readers see it within the TTL, which the requirements allow." },
        { t: "h", text: "Trade-offs and bottlenecks" },
        { t: "list", items: [
          "Static generation means a publish takes seconds to minutes to appear. Fine for a blog, wrong for breaking news.",
          "The 30-second edge cache on comments trades freshness for protecting a tiny backend.",
          "The single PostgreSQL instance is a SPOF for comments only; posts stay readable if it dies. Daily backups plus point-in-time recovery are enough for this SLA.",
          "A hosted comment service removes the API entirely, at the cost of privacy, ads and control.",
          "The real operational risk is spam: CAPTCHA, per-IP rate limits and a moderation queue matter more than scaling."
        ] }
      ],
      followups: [
        "The author fixes a factual error in a viral post. How long until every reader sees the fix, and how would you shorten it?",
        "The author wants a live view counter on each post. How do you add it without hurting the CDN hit ratio?",
        "How would you add full-text search over all posts?",
        "Spam bots start posting 1,000 comments a minute from thousands of IPs. What do you do?",
        "The author adds paid, subscriber-only posts. What changes in your caching?"
      ]
    },
    {
      id: "design-poll-app",
      title: "Design a simple poll and voting app",
      level: "Medium",
      prompt: "Design a poll service like the polls embedded in social posts or chat apps. A user creates a poll with a question, 2 to 4 options and a closing time. Any logged-in user with the link can vote once. Everyone sees results as vote counts and percentages. Most polls are small, but a celebrity's poll or one shown on live TV can get a million votes in a few minutes.",
      clarify: [
        "Must voters be logged in? How strictly must we enforce one vote per person?",
        "Can a voter change their vote before the poll closes?",
        "How fresh must displayed results be: exact and instant, or within a few seconds?",
        "How many polls are created per day, and how fast does the hottest poll receive votes?",
        "Can people see results before voting, or only after?",
        "Must we keep who voted for what after the poll closes?"
      ],
      hints: [
        "Start with the simplest correct design: a votes table with a unique constraint on <code>(poll_id, user_id)</code>. What happens to it when one poll receives 10,000 votes per second?",
        "Separate two jobs: remembering who has voted (deduplication) and counting votes (aggregation). They don't need the same storage.",
        "A single counter row updated by every vote becomes a lock hotspot. How could one counter become many?",
        "Results may be a couple of seconds stale. How does that let you serve 100,000 result reads per second cheaply?"
      ],
      solution: [
        { t: "h", text: "Requirements" },
        { t: "list", items: [
          "<b>Functional:</b> create a poll (question, 2 to 4 options, closing time); vote once per logged-in user; view per-option counts and percentages; polls close automatically. Changing a vote is out of scope for v1.",
          "<b>Non-functional:</b> 10M DAU; the hottest poll gets 1M votes in 5 minutes; vote acknowledgment p99 under 200 ms; displayed results may lag up to about 2 s; every accepted vote is counted exactly once in the final result; 99.9% availability."
        ] },
        { t: "h", text: "Estimates" },
        { t: "code", lang: "text", code: `Poll creation:  1M polls/day / ~100,000 s/day = ~10 creates/s
Votes overall:  10M DAU x 3 votes = 30M votes/day
                30M / 100,000 s = ~300 votes/s average, ~1k/s at peak

Hottest poll:   1M votes in 5 min = 1,000,000 / 300 s = ~3,300 votes/s
                bursts up to ~10k votes/s, all on ONE poll
Result reads:   ~10 result views per vote -> up to ~100k reads/s on that poll

Storage:        vote row = poll_id 8 B + user_id 8 B + option 1 B
                + timestamp 8 B = ~25 B, ~100 B with row and index overhead
                30M votes/day x 100 B = 3 GB/day = ~1.1 TB/year
                polls: 1M/day x 1 KB = 1 GB/day` },
        { t: "p", html: "Average load is small: one PostgreSQL primary handles 1,000 inserts per second easily, and a terabyte a year is manageable. The crux is the hot poll: thousands of increments per second to the same few counters, and up to 100,000 reads per second of the same result." },
        { t: "h", text: "API" },
        { t: "code", lang: "http", code: `POST /v1/polls
     body: { "question": "...", "options": ["A", "B", "C"], "closes_at": "..." }
     -> 201 { "poll_id": "p_7Hk2" }

POST /v1/polls/{poll_id}/votes        (Authorization: Bearer token)
     body: { "option_id": 2 }
     -> 201 Created  |  409 Conflict (already voted)  |  410 Gone (closed)

GET  /v1/polls/{poll_id}/results
     -> 200 { "options": [ { "id": 1, "votes": 51234 }, ... ], "total": 98110 }` },
        { t: "h", text: "Data model" },
        { t: "table", head: ["Table", "Columns", "Purpose"], rows: [
          ["polls", "<code>poll_id PK, creator_id, question, options, closes_at, status</code>", "Poll definitions"],
          ["votes", "<code>poll_id, user_id, option_id, created_at</code>, primary key <code>(poll_id, user_id)</code>", "Source of truth; the key enforces one vote per user"],
          ["Redis counters", "key <code>poll:p_7Hk2:counts</code>, a hash of option to count", "Fast running totals for display"]
        ] },
        { t: "p", html: "PostgreSQL fits because the unique key gives one-vote-per-user for free and the data is relational. When the votes table grows into terabytes, partition it by <code>poll_id</code> (Chapter 7); every query is per poll, so each touches one partition." },
        { t: "h", text: "High-level design" },
        { t: "diagram", caption: "Votes are deduplicated in PostgreSQL and counted in Redis; result reads are absorbed by a short CDN cache.", code: `flowchart LR
  V(("Voters")) -->|"POST vote"| LB["Load balancer"]
  V -->|"GET results"| CDN["CDN, 2 s TTL"]
  CDN -->|"on miss"| LB
  LB --> API["Poll API servers"]
  API -->|"1. insert vote"| DB[("PostgreSQL")]
  API -->|"2. HINCRBY option"| R[("Redis counters")]
  API -->|"read totals"| R
  JOB["Reconciler"] -.->|"COUNT per option"| DB
  JOB -.->|"correct totals"| R` },
        { t: "p", html: "<b>Vote path:</b> the API inserts into <code>votes</code>. A duplicate violates the primary key and returns 409. On success it increments the option's counter in Redis with <code>HINCRBY</code> and returns 201. <b>Results path:</b> the browser fetches results through the CDN, cached for 2 seconds, so the hottest poll produces about one origin read per CDN location every 2 seconds instead of 100,000 per second. Percentages are computed in the client. <b>Reconciliation:</b> a job periodically recomputes counts with <code>SELECT option_id, COUNT(*) ... GROUP BY option_id</code> and corrects Redis, and it computes the final result when the poll closes." },
        { t: "h", text: "Deep dives" },
        { t: "p", html: "<b>The hot counter.</b> If totals lived in a single PostgreSQL row per option, every vote would lock that row for the length of its transaction. With about 1 ms per transaction, one row tops out near 1,000 updates per second, below our 3,300 average. Two fixes: (1) <b>sharded counters</b>: keep, say, 32 rows per option, add each vote to a random one, and sum the 32 on read; (2) keep running totals in Redis, where a single key handles on the order of 100,000 increments per second. We use Redis for display and the votes table as the truth." },
        { t: "p", html: "<b>Exactly-once counting.</b> The insert and the Redis increment are two separate systems, so a crash between them can leave Redis one vote short, and a retried request could double count. We accept that the live number can be very slightly off, because the reconciler rebuilds totals from the deduplicated votes table, which is exact. The final, published result always comes from the database." },
        { t: "p", html: "<b>If inserts become the bottleneck.</b> At tens of thousands of votes per second on one poll, the API can deduplicate in Redis instead (<code>SADD poll:p_7Hk2:voters user_id</code> returns 1 only for a new voter), increment the counter, and publish the vote to a queue such as Kafka. A consumer then batch-inserts into PostgreSQL with <code>ON CONFLICT DO NOTHING</code>. Votes are acknowledged faster, at the cost of a short window where a vote is accepted but not yet in the database." },
        { t: "h", text: "Trade-offs and bottlenecks" },
        { t: "table", head: ["Decision", "Gain", "Cost"], rows: [
          ["Results cached 2 s at the CDN", "Hot poll reads cost almost nothing", "Results lag by up to 2 s"],
          ["Redis for live totals", "No row-lock hotspot; fast reads", "Can drift slightly; needs reconciliation"],
          ["DB unique key for dedupe", "Simple and exactly correct", "Insert rate on one poll is limited by one primary"],
          ["Async inserts via Kafka (optional)", "Handles extreme vote bursts", "More moving parts; brief window before a vote is durable in the DB"],
          ["Logged-in voting", "Meaningful one-vote-per-user rule", "Fake accounts can still stuff a poll"]
        ] }
      ],
      followups: [
        "Voters may now change their vote until the poll closes. What changes in deduplication and counting?",
        "How do you stop someone from voting thousands of times with throwaway accounts?",
        "Redis crashes in the middle of the hottest poll. What do users see, and how do you restore correct totals?",
        "Results must update live on screen without refreshing. How would you push updates to millions of viewers?",
        "Some polls must be anonymous: you may not store who voted for which option. How do you still enforce one vote per user?"
      ]
    }
  ]
};
