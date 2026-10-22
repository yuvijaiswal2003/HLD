module.exports = {
  id: "estimation",
  num: 3,
  part: 1,
  title: "Back-of-the-Envelope Estimation",
  tagline: "Turn users into QPS, bytes, bandwidth, cache, servers and nines in five minutes.",
  level: "Beginner",
  lessons: [
    {
      id: "powers-and-sizes",
      title: "Powers of two, data sizes and the size of things",
      minutes: 10,
      blocks: [
        { t: "p", html: "<b>Back-of-the-envelope estimation</b> means working out rough numbers (requests per second, storage, bandwidth, memory, machine count) fast enough to do on a whiteboard. The goal is not precision. The goal is the right <b>order of magnitude</b>, because that is what decides the design: 50 writes per second fits on any database, 50,000 needs careful choices, and 5 million needs partitioning. Being off by 2x rarely changes the design; being off by 100x always does." },
        { t: "h", text: "Arithmetic rules for the whiteboard" },
        { t: "list", items: [
          "<b>Round to one or two significant figures.</b> 86,400 becomes 100,000; 365 becomes 400 when it makes the math easy (and say you rounded up).",
          "<b>Work in powers of ten.</b> 3 × 10^6 × 2 × 10^3 = 6 × 10^9. Add exponents when multiplying, subtract when dividing.",
          "<b>Carry units everywhere.</b> “200 M posts/day × 1 KB/post = 200 GB/day.” Units catch mistakes like mixing bits and bytes.",
          "<b>State assumptions out loud</b> and write them down, so the interviewer can correct an input instead of doubting the whole result.",
          "<b>Say what the number means.</b> An estimate is only useful when you finish with “...so this fits on one node” or “...so we need a CDN”."
        ] },
        { t: "h", text: "Powers of two and data units" },
        { t: "p", html: "Computers count in powers of two, and 2^10 = 1,024 is close enough to 1,000 that each named unit is about a thousand times the previous one. Memorize this ladder and you can convert any size instantly." },
        { t: "table", head: ["Power of two", "Exact value", "Approximately", "Unit"], rows: [
          ["2^10", "1,024", "10^3, a thousand", "1 KB (kilobyte)"],
          ["2^20", "1,048,576", "10^6, a million", "1 MB (megabyte)"],
          ["2^30", "1,073,741,824", "10^9, a billion", "1 GB (gigabyte)"],
          ["2^40", "~1.1 × 10^12", "10^12, a trillion", "1 TB (terabyte)"],
          ["2^50", "~1.13 × 10^15", "10^15, a quadrillion", "1 PB (petabyte)"]
        ] },
        { t: "p", html: "Strictly, 1 KB is 1,000 bytes and 1 <b>KiB</b> (kibibyte) is 1,024 bytes. Disk vendors use decimal units, operating systems often show binary ones, which is why a “1 TB” disk shows up as about 931 GiB. The gap is 2.4% at KB and about 10% at TB. In interviews, ignore it." },
        { t: "table", head: ["Value", "Number", "Where it shows up"], rows: [
          ["2^8", "256", "Values in one byte"],
          ["2^16", "65,536", "Port numbers; unsigned 16-bit integers"],
          ["2^31 − 1", "~2.1 billion", "Maximum signed 32-bit integer (<code>INT</code> in MySQL, <code>integer</code> in PostgreSQL)"],
          ["2^32", "~4.3 billion", "IPv4 address space; unsigned 32-bit integers"],
          ["2^63 − 1", "~9.2 × 10^18", "Maximum signed 64-bit integer (<code>BIGINT</code>); effectively never runs out for IDs"],
          ["2^128", "~3.4 × 10^38", "Size of the UUID and IPv6 spaces"]
        ] },
        { t: "callout", kind: "example", title: "The view counter that hit 2^31", html: "In December 2014, Psy's “Gangnam Style” passed 2,147,483,647 views on YouTube, the maximum value of a signed 32-bit integer. YouTube said it had already moved the counter to a 64-bit integer. Any ID or counter that can plausibly pass 2 billion should be 64-bit from day one." },
        { t: "h", text: "Sizes of common objects" },
        { t: "table", head: ["Object", "Typical size", "Notes"], rows: [
          ["ASCII character", "1 B", "UTF-8 uses 1–4 B per character: 3 B for most CJK characters, 4 B for most emoji"],
          ["Integer / big integer / timestamp", "4 B / 8 B / 8 B", "Store IDs and timestamps as 8 B values"],
          ["UUID", "16 B binary, 36 B as text", "Storing UUIDs as text more than doubles index size"],
          ["Short post like a tweet, with metadata", "~300 B – 1 KB", "280 characters of text at most"],
          ["User profile row", "~1 KB", "Name, email, settings, timestamps"],
          ["Structured log line", "~200 B – 1 KB", "JSON lines are larger than plain text"],
          ["Metric sample", "16 B raw, ~1–2 B compressed", "8 B timestamp + 8 B float; time-series compression shrinks it"],
          ["JSON API response", "~1–10 KB", "Before gzip, which typically shrinks JSON 3–10x"],
          ["Web page, total transfer", "~2–3 MB", "HTML, CSS, JavaScript, fonts and images"],
          ["Phone photo, original", "~2–5 MB", "12 MP JPEG or HEIC"],
          ["Photo resized for a feed", "~100–300 KB", "About 1080 px wide JPEG"],
          ["Thumbnail", "~10–30 KB", "About 150–320 px"],
          ["1 minute of audio at 128 kbps", "~1 MB", "128,000 / 8 = 16 KB/s × 60 s = 960 KB"],
          ["1 minute of 1080p streaming video at 5 Mbps", "~37.5 MB", "5,000,000 / 8 = 625 KB/s × 60 s"],
          ["1 minute of 4K streaming video at 15 Mbps", "~110 MB", "1.875 MB/s × 60 s"],
          ["1 minute of 1080p30 video recorded on a phone", "~60–130 MB", "Raw uploads are far larger than streaming renditions"]
        ] },
        { t: "p", html: "When an object isn't in the table, build its size from its fields. Here is a post row:" },
        { t: "code", lang: "text", code: `post_id                   8 B   (64-bit ID)
author_id                 8 B
created_at                8 B
text                   ~200 B   (avg ~140 chars, some multi-byte)
language, flags         ~10 B
like/reply/share counts  24 B   (3 x 8 B)
media ids               ~16 B
------------------------------
raw row                ~275 B
x ~2 for row headers, indexes, free space
= ~550 B   -> round up to 1 KB per post` },
        { t: "callout", kind: "tip", title: "Round object sizes up", html: "Real storage is bigger than the sum of the fields: row headers, indexes, page fill factors, replication metadata. Rounding a 275-byte row up to 1 KB is not sloppy; it is roughly right, and it makes every later multiplication easy." }
      ]
    },
    {
      id: "latency-numbers",
      title: "Latency numbers every engineer should know",
      minutes: 10,
      blocks: [
        { t: "p", html: "Jeff Dean at Google popularized a list of latency figures that engineers should know by heart. Hardware has improved since, but the <b>ratios</b> between memory, disk and network have stayed roughly the same, and the ratios are what drive design decisions. The figures below are rounded, modern approximations." },
        { t: "table", head: ["Operation", "Approximate time", "Scaled: if an L1 hit took 1 second"], rows: [
          ["L1 cache reference", "~1 ns", "1 s"],
          ["Branch mispredict", "~3 ns", "3 s"],
          ["L2 cache reference", "~4 ns", "4 s"],
          ["Mutex lock and unlock, uncontended", "~20 ns", "20 s"],
          ["Main memory reference", "~100 ns", "~1.7 minutes"],
          ["Send 1 KB over a 10 Gbps link", "~1 µs", "~17 minutes"],
          ["Compress 1 KB with a fast codec like Snappy", "~2 µs", "~33 minutes"],
          ["Read 1 MB sequentially from memory", "~50 µs", "~14 hours"],
          ["Random 4 KB read from an SSD", "~20–100 µs", "~6–28 hours"],
          ["Read 1 MB sequentially from an NVMe SSD", "~300 µs", "~3.5 days"],
          ["Round trip within one data center", "~0.5 ms", "~6 days"],
          ["Read 1 MB sequentially from a hard disk", "~5 ms", "~2 months"],
          ["Hard disk seek", "~10 ms", "~4 months"],
          ["Round trip US East to US West", "~65 ms", "~2 years"],
          ["Round trip US East to Western Europe", "~80 ms", "~2.5 years"],
          ["Round trip US to Asia or Australia", "~150–200 ms", "~5–6 years"]
        ] },
        { t: "diagram", caption: "Each step down the ladder is about 5x to 1,000x slower, which is why data placement dominates latency.", code: `flowchart TD
  L1["L1 cache reference<br/>~1 ns"] -->|"100x"| RAM["Main memory reference<br/>~100 ns"]
  RAM -->|"~1,000x"| SSD["Random SSD read<br/>~100 µs"]
  SSD -->|"5x"| DC["Round trip in one data center<br/>~0.5 ms"]
  DC -->|"20x"| HDD["Hard disk seek<br/>~10 ms"]
  HDD -->|"15x"| WAN["Cross-continent round trip<br/>~150 ms"]` },
        { t: "h", text: "What the numbers tell you" },
        { t: "list", items: [
          "<b>Memory is about 1,000x faster than an SSD random read</b> and about 100,000x faster than a disk seek. That is the whole case for caches and in-memory stores like Redis.",
          "<b>Sequential beats random.</b> A hard disk does ~100–200 random reads per second but streams 100–250 MB/s sequentially. That is why Kafka, write-ahead logs and LSM-tree databases append instead of updating in place.",
          "<b>A same-data-center network hop is cheap but not free.</b> A 0.5 ms Redis round trip is worth about 5,000 memory references. Thirty sequential cache calls in one request add 15 ms.",
          "<b>Distance is physics.</b> Light in fiber covers about 200,000 km/s, so every 100 km of fiber adds about 1 ms of round trip, and real routes are longer than straight lines. No software change makes New York to Sydney faster than about 160 ms round trip.",
          "<b>Cross-region calls belong outside the request path.</b> One synchronous call from Virginia to Frankfurt costs about 90 ms; three of them blow a 200 ms budget."
        ] },
        { t: "h", text: "Throughput numbers" },
        { t: "p", html: "Latency is how long one operation takes; <b>throughput</b> is how many operations or bytes per second a component sustains. These rough single-node figures are good enough for sizing. Always say they are assumptions, and that you would load-test." },
        { t: "table", head: ["Component", "Rough single-node capacity", "Notes"], rows: [
          ["Memory bandwidth", "~10–20 GB/s for one thread; 100+ GB/s per socket", "Many memory channels in parallel"],
          ["NVMe SSD", "~2–7 GB/s sequential; hundreds of thousands of random IOPS", "SATA SSDs: ~500 MB/s"],
          ["Hard disk", "~100–250 MB/s sequential; ~100–200 random IOPS", "Cheap capacity, terrible random access"],
          ["10 Gbps network card", "~1.25 GB/s", "Plan to use ~70% of it"],
          ["Redis", "~100k simple ops/s", "Much more with pipelining; one main thread per instance"],
          ["PostgreSQL or MySQL", "Thousands of transactional writes/s; tens of thousands of simple indexed reads/s", "Depends heavily on hardware, query shape and durability settings"],
          ["Kafka broker", "Hundreds of MB/s", "Sequential disk I/O and batching"],
          ["Nginx serving static or cached content", "Tens of thousands of requests/s", "Per server, mostly bound by network and TLS"]
        ] },
        { t: "h", text: "Building a latency budget" },
        { t: "p", html: "Add up the hops a request makes to see where time goes. For a user far from the data center, the network usually dwarfs the server's work, which is why CDNs and regional deployments matter more than micro-optimizing code." },
        { t: "diagram", caption: "Server-side work takes about 9 ms, but the user still waits about 90 ms because of the transatlantic round trip.", code: `sequenceDiagram
  participant U as User in London
  participant LB as Load balancer in Virginia
  participant A as App server
  participant R as Redis
  participant DB as PostgreSQL
  U->>LB: GET /feed, about 40 ms one way
  LB->>A: Forward, about 0.2 ms
  A->>R: Look up cached feed, 0.5 ms round trip
  R-->>A: Miss
  A->>DB: Indexed query, about 3 ms
  DB-->>A: 20 rows
  Note over A: Build the JSON response, about 5 ms of CPU
  A-->>LB: 200 OK
  LB-->>U: Response, about 40 ms one way
  Note over U,DB: Server side about 9 ms, network about 80 ms` },
        { t: "callout", kind: "interview", title: "Use latency numbers to reject designs", html: "“Rendering this page calls the database once per item, 200 times, at about 1 ms each: 200 ms just in round trips. I'll batch it into one query with <code>WHERE id IN (...)</code>, or precompute the page.” Quick arithmetic like this shows the interviewer you can spot a slow design before building it." },
        { t: "callout", kind: "warn", title: "Don't confuse latency and throughput", html: "A hard disk has a seek time of ~10 ms but can still stream 200 MB/s. A cross-continent link has 150 ms of latency but can carry gigabits per second. Adding servers raises throughput; it never lowers the latency of a single round trip." }
      ]
    },
    {
      id: "dau-to-qps",
      title: "From daily users to QPS: averages, peaks and read/write ratios",
      minutes: 11,
      blocks: [
        { t: "p", html: "Almost every estimate starts from users. <b>DAU</b> (daily active users) counts distinct users active on a given day; <b>MAU</b> counts them over a month. The DAU/MAU ratio measures how habitual a product is; messaging and social apps run high, utility apps lower. <b>QPS</b> (queries per second) and <b>RPS</b> (requests per second) are used interchangeably for request rate." },
        { t: "diagram", caption: "The standard chain: users times actions gives daily requests; divide by about 100,000 seconds; multiply by a peak factor; split into reads and writes.", code: `flowchart LR
  DAU["DAU<br/>100M"] -->|"x 55 requests per user per day"| RPD["Requests per day<br/>5.5B"]
  RPD -->|"divide by about 100k seconds"| AVG["Average QPS<br/>55k"]
  AVG -->|"x peak factor 3"| PEAK["Peak QPS<br/>165k"]
  PEAK --> RD["Reads<br/>150k per second"]
  PEAK --> WR["Writes<br/>15k per second"]` },
        { t: "h", text: "The conversion you'll use most" },
        { t: "numbers", items: [
          { value: "86,400", label: "Seconds per day, round to 10^5" },
          { value: "~2.6M", label: "Seconds per 30-day month" },
          { value: "~31.5M", label: "Seconds per year, about π × 10^7" },
          { value: "~12/s", label: "Average rate of 1 million events per day" }
        ] },
        { t: "table", head: ["Events per day", "Exact average rate", "Quick rate, dividing by 10^5"], rows: [
          ["1 million", "~11.6/s", "~10/s"],
          ["10 million", "~116/s", "~100/s"],
          ["100 million", "~1,160/s", "~1,000/s"],
          ["1 billion", "~11,600/s", "~10,000/s"],
          ["10 billion", "~116,000/s", "~100,000/s"]
        ] },
        { t: "p", html: "Dividing by 10^5 instead of 86,400 understates the rate by about 14%. That is well inside estimation error, and the peak factor you multiply by next matters far more. If you want to be safe, say “about 12,000 per second” for a billion a day." },
        { t: "h", text: "Worked example: a social app" },
        { t: "code", lang: "text", code: `Assumptions
  100M DAU
  each user makes 50 read requests/day (feed, profiles, comments)
  each user makes 5 write requests/day (posts, likes, comments)

Daily volume
  reads:  100M x 50 = 5 x 10^9 = 5B/day
  writes: 100M x 5  = 5 x 10^8 = 500M/day

Average rate (divide by 10^5)
  reads:  5 x 10^9 / 10^5 = 5 x 10^4 = 50,000/s
  writes: 5 x 10^8 / 10^5 = 5 x 10^3 =  5,000/s

Peak (factor 3 for a global app)
  reads:  150,000/s
  writes:  15,000/s
  read:write ratio = 10:1` },
        { t: "h", text: "Peak traffic" },
        { t: "p", html: "Systems must be sized for the peak, not the average. Traffic follows a daily cycle, and the more concentrated your users are in time zones and habits, the higher the peak relative to the average. When you know when traffic clusters, compute the peak directly: if 30% of 1 billion daily requests happen in the busiest 3 hours, the peak is 0.3 × 10^9 ÷ 10,800 s ≈ 28,000/s, about 2.4x the 11,600/s average." },
        { t: "table", head: ["Traffic shape", "Rough peak ÷ average", "Example"], rows: [
          ["Global consumer app, users in many time zones", "~2–3x", "Social feed, web search"],
          ["Single-country or single-city app", "~4–10x", "Food delivery dinner rush, regional news"],
          ["Business app", "~3–5x in weekday working hours, near zero at night", "Office suite, CRM, internal tools"],
          ["Event-driven burst", "~10–100x for minutes", "Flash sale, concert ticket release, live TV moment"]
        ] },
        { t: "callout", kind: "example", title: "Twitter's 25x burst", html: "In August 2013 Twitter reported a record of 143,199 tweets per second during a TV broadcast of the film <em>Castle in the Sky</em> in Japan, when its steady-state average was about 5,700 tweets per second. Systems that only handle 3x the average fall over on nights like that." },
        { t: "h", text: "Read/write ratios" },
        { t: "p", html: "Splitting traffic into reads and writes tells you which half of the architecture deserves attention. The ratio is one of the most decision-relevant numbers in an interview." },
        { t: "table", head: ["System", "Rough read:write", "What it implies"], rows: [
          ["Social feed or timeline", "100:1 or more", "Caches, precomputed feeds, read replicas"],
          ["URL shortener", "100:1 or more", "Cache redirects; very cache- and CDN-friendly"],
          ["Product catalog", "1,000:1 or more", "CDN and cache; writes are rare admin edits"],
          ["Chat messaging", "~1:1 to a few:1", "Write-optimized storage and efficient delivery"],
          ["Payments and orders", "~1:1 to 10:1", "Transactions and strong consistency first"],
          ["Logs, metrics, IoT telemetry", "Write-dominated; most data is never read", "Append-only storage, batching, compression"]
        ] },
        { t: "callout", kind: "warn", title: "Watch for multipliers", html: "Counting user actions is not the same as counting backend operations. If home feeds are precomputed, one post from a user with 200 followers becomes 200 feed inserts: 5,000 posts/s × 200 = 1 million inserts/s. One page view that calls 8 microservices is 8 internal requests. Find the fan-out factor before you size anything (Chapter 16 covers feed fan-out)." }
      ]
    },
    {
      id: "storage-bandwidth",
      title: "Estimating storage and bandwidth",
      minutes: 11,
      blocks: [
        { t: "p", html: "Storage answers two design questions: does the data fit on one machine (if not, it must be partitioned) and which kind of store fits its size and shape (rows in a database, blobs in object storage). The basic formula is short; the overheads are where people slip." },
        { t: "diagram", caption: "Storage is new objects per day times their size, accumulated over the retention period, then multiplied by overheads such as replication and disk headroom.", code: `flowchart LR
  N["New objects per day"] --> M["x bytes per object"]
  M --> D["= bytes per day"]
  D --> R["x retention in days"]
  R --> O["x overheads<br/>replication, indexes, headroom"]
  O --> T["= raw capacity to provision"]` },
        { t: "h", text: "Worked example: posts and photos" },
        { t: "code", lang: "text", code: `Assumptions
  200M new posts/day, ~1 KB each (rounded up, see lesson 1)
  10% of posts carry one photo; the client uploads a ~2 MB original,
  and we keep only resized versions totaling ~500 KB
  retention: 5 years; database replication factor 3

Post rows
  200M x 1 KB          = 2 x 10^8 x 10^3 B = 2 x 10^11 B = 200 GB/day
  x 365                = 73 TB/year
  x 5 years            = 365 TB
  x 3 replicas         = ~1.1 PB of database storage

Photos
  20M x 500 KB         = 2 x 10^7 x 5 x 10^5 B = 10^13 B = 10 TB/day
  x 365                = 3.65 PB/year
  x 5 years            = ~18 PB in object storage` },
        { t: "p", html: "Two conclusions fall straight out. First, media is about 50x larger than the rows that describe it, so photos belong in object storage such as Amazon S3 and only their metadata in a database. Second, 365 TB of post rows (1.1 PB with replicas) is far beyond one database server, so the post table must be sharded (Chapter 7)." },
        { t: "h", text: "Overheads people forget" },
        { t: "table", head: ["Factor", "Typical multiplier", "Note"], rows: [
          ["Replication", "× 2–3", "Database replicas or HDFS-style copies; managed object storage includes it in the price"],
          ["Erasure coding", "× 1.2–1.5", "For example 10 data + 4 parity fragments = × 1.4 (Chapter 10)"],
          ["Indexes and row overhead", "× 1.5–2", "Secondary indexes, page headers, fragmentation"],
          ["Compression", "÷ 2–10 for text and logs; ÷ 1 for JPEG and video", "Already-compressed media does not shrink further"],
          ["Disk fill headroom", "÷ 0.6–0.8", "Room for compaction, rebalancing and growth"],
          ["Backups and snapshots", "+ 1 or more copies", "Often in a cheaper storage tier"]
        ] },
        { t: "h", text: "Bandwidth" },
        { t: "p", html: "<b>Ingress</b> (data coming in) is write rate × request size. <b>Egress</b> (data going out) is read rate × response size. Egress is usually much larger and costs money, often a few cents per GB in public clouds. Network speeds are quoted in <b>bits</b> per second, so divide by 8 to get bytes." },
        { t: "code", lang: "text", code: `Ingress: photo uploads
  20M photos/day x 2 MB original   = 40 TB/day
  40 x 10^12 B / 86,400 s          = ~460 MB/s = ~3.7 Gbit/s average
  x peak factor 3                  = ~11 Gbit/s

Egress: photo views
  100M DAU x 50 photo views/day    = 5B views/day
  5 x 10^9 / 10^5 s                = 50,000 views/s average, 150,000/s peak
  50,000 x 200 KB per view         = 10^10 B/s = 10 GB/s = 80 Gbit/s average
  at peak                          = ~240 Gbit/s
  origin traffic if the CDN serves 95% of bytes = 5% of 240 = ~12 Gbit/s` },
        { t: "p", html: "240 Gbit/s is the output of dozens of servers' network cards and needs presence near users worldwide, so a CDN isn't optional here. With a 95% CDN hit ratio, the origin only serves about 12 Gbit/s at peak." },
        { t: "table", head: ["Rate", "Bytes per second", "Per day"], rows: [
          ["1 Mbps", "125 KB/s", "~10.8 GB"],
          ["100 Mbps", "12.5 MB/s", "~1.08 TB"],
          ["1 Gbps", "125 MB/s", "~10.8 TB"],
          ["10 Gbps", "1.25 GB/s", "~108 TB"],
          ["100 Gbps", "12.5 GB/s", "~1.08 PB"]
        ] },
        { t: "callout", kind: "warn", title: "Bits versus bytes", html: "Disks and files are sized in bytes (B); network links in bits (b). 1 Gbps is 125 MB/s, not 1 GB/s. Mixing them up is an 8x error, the most common mistake in bandwidth estimates. Write the unit on every line." },
        { t: "callout", kind: "tip", title: "Price the egress", html: "10 GB/s average egress is 864 TB/day, about 26 PB per month. At an illustrative $0.02 per GB that is about $520,000 a month, often more than the servers. Mentioning cost when bandwidth is large is a strong senior signal, and it motivates CDNs, better compression and smaller image formats." },
        { t: "callout", kind: "interview", title: "Leave a table on the board", html: "Write the results as a compact table: average and peak QPS for reads and writes, storage per day, per year and over 5 years, and peak ingress and egress. You will point back to it repeatedly when justifying shards, caches and CDNs." }
      ]
    },
    {
      id: "cache-sizing",
      title: "Sizing a cache with the 80/20 rule",
      minutes: 8,
      blocks: [
        { t: "p", html: "Access patterns are skewed: a few items are wildly popular and most are rarely touched. The <b>80/20 rule</b> (Pareto principle) is the standard rule of thumb: about 20% of items receive about 80% of reads. Real skew is often stronger, closer to a Zipf distribution where the top 1% may get half the traffic. The practical consequence: caching a small hot set captures most of the reads." },
        { t: "diagram", caption: "Holding only the hot fifth of items in memory still serves most reads; the database handles the long tail.", code: `flowchart LR
  REQ(("All reads")) --> C[("Cache<br/>hot 20% of items")]
  C -->|"~80% of reads: hit"| OK["Fast response"]
  C -->|"~20% of reads: miss"| DB[("Database<br/>all items")]
  DB -.->|"fill cache"| C` },
        { t: "steps", items: [
          { title: "Count the distinct items read per day", html: "Not the number of reads. One viral post read 10 million times is still one cache entry." },
          { title: "Take the hot fraction", html: "Start with 20% unless you know the skew. For sessions or other data where every active item must be found, take 100% of the active set." },
          { title: "Multiply by the size of a cached entry", html: "Use the size of what you actually cache, such as a rendered fragment or a serialized object, not the database row." },
          { title: "Add memory overhead", html: "Redis spends roughly 50–100 bytes of bookkeeping per key, plus allocator fragmentation. Multiply by about 1.5, or 2 for very small values." },
          { title: "Divide by usable memory per node", html: "Plan to use about 75% of RAM; replication buffers and snapshot forks need the rest. Add replicas for availability." }
        ] },
        { t: "code", lang: "text", code: `Example 1: article cache (hot 20% of distinct items)
  distinct articles read per day   1M
  hot 20%                          200k articles
  x 20 KB rendered fragment        = 4 GB
  x 1.5 overhead                   = 6 GB  -> one node, plus a replica

Example 2: session store (every active session must be present)
  50M DAU x 1 KB                   = 50 GB
  x 1.5 overhead                   = 75 GB -> 2 nodes of 64 GB, plus replicas

Example 3: precomputed home timelines
  100M DAU x 500 post IDs x 8 B    = 400 GB
  x 1.5 overhead                   = 600 GB
  / ~50 GB usable per 64 GB node   = 12 shards, x 2 with replicas = 24 nodes` },
        { t: "h", text: "Sizing by distinct items, not by read volume" },
        { t: "p", html: "A common shortcut is “cache 20% of the daily read volume”: 5 billion reads/day × 1 KB = 5 TB, so 1 TB of cache. That counts each popular item once per read and overestimates badly. If those 5 billion reads touch only 200 million distinct posts, the hot set is 0.2 × 200M × 1 KB = 40 GB, 25x smaller. If you only know read volume, say the result is an upper bound." },
        { t: "h", text: "What the hit ratio buys" },
        { t: "p", html: "The <b>hit ratio</b> is the fraction of reads served from the cache. With 150,000 reads/s at peak, a 90% hit ratio sends 15,000/s to the database; 99% sends only 1,500/s. Going from 90% to 99% looks small but cuts database load 10x, which is why a modest increase in cache memory can remove the need for read replicas. Chapter 5 covers caching patterns in depth." },
        { t: "table", head: ["Cache", "Formula", "Result", "Nodes"], rows: [
          ["Article fragments", "20% × 1M × 20 KB × 1.5", "6 GB", "1 + replica"],
          ["Sessions", "100% × 50M × 1 KB × 1.5", "75 GB", "2 + replicas"],
          ["Home timelines", "100M × 500 × 8 B × 1.5", "600 GB", "12 shards, 24 with replicas"]
        ] },
        { t: "callout", kind: "interview", title: "Small caches are a finding", html: "Saying “the hot set is about 6 GB, so a single Redis node holds it, with one replica for failover” is a better answer than drawing a 20-node cluster. Interviewers like seeing estimates shrink a design as much as grow it." },
        { t: "callout", kind: "warn", title: "Small values are mostly overhead", html: "Caching 100 million 8-byte counters as separate Redis keys costs far more than 800 MB, because per-key overhead is many times the value. Grouping small values into Redis hashes, which are stored compactly while small, can cut memory several-fold." }
      ]
    },
    {
      id: "servers-nines-littles-law",
      title: "Server counts, availability nines and Little's Law",
      minutes: 13,
      blocks: [
        { t: "h", text: "How many servers?" },
        { t: "p", html: "Server count is peak load divided by what one server can sustainably handle, plus headroom for failures and deploys. Per-server capacity comes from a load test in real life; in an interview, derive it from CPU time per request, or state an assumption like “a server handles about 1,000 requests per second for this workload”." },
        { t: "code", lang: "text", code: `Assumptions
  peak load:            60,000 requests/s
  CPU per request:      ~20 ms
  server:               32 cores, target ~60% CPU at peak

Per-server capacity
  1 core:  1 s / 20 ms         = 50 requests/s
  32 cores                     = 1,600 requests/s at 100% CPU
  at 60% target                = ~960, call it 1,000 requests/s

Server count
  60,000 / 1,000               = 60 servers at peak
  spread over 3 availability zones; must survive losing one zone:
  60 / (2/3)                   = 90 servers` },
        { t: "p", html: "CPU is not always the limit. Compute the count for each resource the workload stresses and take the largest: that is the <b>binding constraint</b>, and naming it is half the value of the exercise." },
        { t: "table", head: ["Bound by", "Formula", "Example"], rows: [
          ["CPU", "peak QPS × CPU time per request ÷ (cores × target utilization)", "60k/s × 20 ms ÷ (32 × 0.6) ≈ 63, then ÷ (2/3) for zone loss ≈ 95"],
          ["Connections", "concurrent connections ÷ connections per server", "2M WebSockets ÷ 100k per server = 20 servers"],
          ["Memory", "working set ÷ usable RAM per node", "600 GB of timelines ÷ 50 GB = 12 nodes"],
          ["Network", "peak egress ÷ (NIC speed × ~70%)", "240 Gbit/s ÷ 7 Gbit/s ≈ 35 servers"],
          ["Disk capacity", "stored bytes ÷ (disk per node × fill ratio)", "1.1 PB ÷ (20 TB × 0.7) ≈ 80 nodes"]
        ] },
        { t: "h", text: "Why not run servers at 100%?" },
        { t: "p", html: "Requests don't arrive evenly, so a busy server builds a queue. In the simplest queueing model (one server, random arrivals), average response time is the service time divided by (1 − utilization). Servers with many cores tolerate higher utilization before the knee, but the knee is just as sharp. That is why capacity plans target roughly 50–70%." },
        { t: "table", head: ["Utilization", "Response time as a multiple of service time"], rows: [
          ["50%", "2x"],
          ["70%", "~3.3x"],
          ["80%", "5x"],
          ["90%", "10x"],
          ["95%", "20x"],
          ["99%", "100x"]
        ] },
        { t: "h", text: "Availability nines" },
        { t: "p", html: "<b>Availability</b> is the fraction of time (or of requests) a system serves successfully, usually written in “nines”. Each extra nine allows 10x less downtime and typically costs much more to reach." },
        { t: "table", head: ["Availability", "Downtime per year", "Per 30-day month", "Per day"], rows: [
          ["99% (two nines)", "~3.65 days", "~7.2 hours", "~14.4 minutes"],
          ["99.9% (three nines)", "~8.76 hours", "~43.2 minutes", "~1.44 minutes"],
          ["99.95%", "~4.38 hours", "~21.6 minutes", "~43 seconds"],
          ["99.99% (four nines)", "~52.6 minutes", "~4.32 minutes", "~8.6 seconds"],
          ["99.999% (five nines)", "~5.26 minutes", "~26 seconds", "~0.86 seconds"]
        ] },
        { t: "p", html: "The math is just the unavailable fraction times the period: a year has 525,600 minutes, so 99.9% allows 0.001 × 525,600 ≈ 526 minutes ≈ 8.76 hours. At four nines, the monthly budget of about 4 minutes is shorter than the time it takes to page an engineer and diagnose a problem, so it requires automatic failover. Dependencies multiply: a request that needs three services in series, each at 99.9%, is at most 0.999^3 ≈ 99.7% available. Chapter 12 covers this math in depth." },
        { t: "h", text: "Little's Law" },
        { t: "p", html: "<b>Little's Law</b> says that in any stable system, the average number of items inside equals the average arrival rate times the average time each spends inside: <b>L = λ × W</b>. It holds whatever the arrival pattern, which makes it the most useful formula in capacity planning. It turns a request rate and a latency into concurrency: how many threads, connections or queue slots you need." },
        { t: "diagram", caption: "Little's Law links three numbers: arrival rate, time in the system, and how many requests are inside at once.", code: `flowchart LR
  IN(("Arrivals<br/>λ = 2,000 per second")) --> SYS["Service<br/>L = 100 requests in flight<br/>each stays W = 50 ms"]
  SYS --> OUT(("Completions<br/>2,000 per second"))` },
        { t: "code", lang: "text", code: `L = λ x W

1. Concurrency of an API
   2,000 req/s x 0.05 s           = 100 requests in flight

2. Thread pool on a blocking server
   normal:  2,000 x 0.05 s        = 100 busy threads
   DB slows, W = 0.5 s:  2,000 x 0.5 = 1,000 busy threads
   -> a 200-thread pool is exhausted and requests queue

3. Database connection pool
   3,000 queries/s x 0.004 s each = 12 connections busy on average
   -> a pool of ~30 covers bursts; 500 would be wasteful

4. Time spent waiting in a queue
   queue holds ~600,000 messages, 2,000 msg/s flow through
   W = L / λ = 600,000 / 2,000    = 300 s per message` },
        { t: "callout", kind: "warn", title: "Latency spikes become concurrency spikes", html: "Example 2 is how outages spread. A slow dependency doesn't reduce traffic; it raises W, so L rises with it until thread pools, connection pools or memory run out, and the healthy service in front fails too. Timeouts, bounded pools and circuit breakers (Chapter 12) keep W bounded." },
        { t: "callout", kind: "interview", title: "Chain the estimates", html: "Strong answers connect the numbers: “Peak is 60k requests per second at 50 ms, so about 3,000 in flight; at 1,000 requests per second per server we need 60, or 90 to survive a zone loss; with that redundancy and automatic failover, 99.95% is a realistic target.”" }
      ]
    }
  ],
  takeaways: [
    "Estimates exist to drive decisions: round hard, state assumptions, carry units, and finish each number with what it implies.",
    "2^10 ≈ 10^3, so KB, MB, GB, TB and PB step by about 1,000. Signed 32-bit integers overflow at about 2.1 billion; use 64-bit IDs and counters.",
    "A day has 86,400 ≈ 10^5 seconds: 1M events/day ≈ 12/s and 1B/day ≈ 12k/s. Multiply by about 2–3x for global peak, more for regional apps and events.",
    "Memory ~100 ns, SSD random read ~100 µs, same-data-center round trip ~0.5 ms, disk seek ~10 ms, cross-continent round trip ~100–200 ms.",
    "Storage = new objects per day × size × retention × overheads (replication, indexes, disk headroom). Media usually dwarfs metadata.",
    "Networks are measured in bits: 1 Gbps = 125 MB/s. Egress = read rate × response size; large egress calls for a CDN and a cost estimate.",
    "Size caches by distinct hot items (often ~20% of what is read daily) times entry size times ~1.5 overhead; many caches fit on one node.",
    "Servers = peak load ÷ per-server capacity at ~60% utilization, plus headroom to lose a zone. Check CPU, connections, memory, network and disk; the largest wins.",
    "99.9% ≈ 43 minutes of downtime per month, 99.99% ≈ 4.3 minutes, 99.999% ≈ 26 seconds.",
    "Little's Law, L = λ × W, sizes thread pools, connection pools and queues, and explains why a slow dependency exhausts them."
  ],
  mcqs: [
    {
      q: "A service receives 1 billion requests per day, spread evenly. What is its average request rate?",
      options: [
        "~1,200 per second",
        "~12,000 per second",
        "~120,000 per second",
        "~1.2 million per second"
      ],
      answer: 1,
      explain: "10^9 ÷ 86,400 ≈ 11,600, about 12,000 per second. Dividing by 10^5 gives 10,000, which is close enough for design decisions.",
      level: "easy"
    },
    {
      q: "Roughly how many bytes per second can a 10 Gbps network link carry at most?",
      options: [
        "~1.25 GB/s",
        "~10 GB/s",
        "~125 MB/s",
        "~80 GB/s"
      ],
      answer: 0,
      explain: "Network speeds are in bits: 10 × 10^9 bits ÷ 8 = 1.25 × 10^9 bytes per second. 10 GB/s confuses bits with bytes, and 125 MB/s is what a 1 Gbps link carries.",
      level: "easy"
    },
    {
      q: "Which operation is the <b>slowest</b>?",
      options: [
        "A main memory reference",
        "A random 4 KB read from an NVMe SSD",
        "A seek on a spinning hard disk",
        "A round trip between two servers in the same data center"
      ],
      answer: 2,
      explain: "Roughly: memory ~100 ns, SSD random read ~20–100 µs, same-data-center round trip ~0.5 ms, disk seek ~10 ms. The seek is about 20x slower than a local network round trip.",
      level: "easy"
    },
    {
      q: "Your SLA promises 99.9% availability per 30-day month. About how much downtime does that allow each month?",
      options: [
        "~4.3 minutes",
        "~8.8 hours",
        "~7.2 hours",
        "~43 minutes"
      ],
      answer: 3,
      explain: "A 30-day month has 43,200 minutes, and 0.1% of that is 43.2 minutes. 8.8 hours is the yearly allowance at 99.9%, 4.3 minutes is the monthly allowance at 99.99%, and 7.2 hours is the monthly allowance at 99%.",
      level: "medium"
    },
    {
      q: "An API serves 4,000 requests per second with an average latency of 250 ms. On average, how many requests are in flight at once?",
      options: [
        "16",
        "250",
        "1,000",
        "16,000"
      ],
      answer: 2,
      explain: "Little's Law: L = λ × W = 4,000/s × 0.25 s = 1,000. 16 and 16,000 come from dividing instead of multiplying, and 250 is just the latency in milliseconds.",
      level: "medium"
    },
    {
      q: "A blocking server has a pool of 400 worker threads. It handles 2,000 requests/s at 100 ms average latency. A database slowdown raises average latency to 300 ms while traffic stays the same. What happens?",
      options: [
        "Requests in flight rise from ~200 to ~600, beyond 400 threads, so requests queue and latency climbs further",
        "Nothing changes, because the arrival rate is still 2,000 requests per second",
        "Throughput stays at 2,000 requests/s because the extra latency is in the database, not in the threads",
        "Requests in flight fall to ~67, because each request now holds its thread for longer"
      ],
      answer: 0,
      explain: "By Little's Law, in-flight work goes from 2,000 × 0.1 = 200 to 2,000 × 0.3 = 600. The pool can complete at most 400 ÷ 0.3 s ≈ 1,333 requests/s, so a queue builds and keeps growing. This is why timeouts and bounded pools matter.",
      level: "hard"
    },
    {
      q: "Users upload 10 million photos a day, about 2 MB each including resized copies. Roughly how much new storage is needed per year, before replication?",
      options: [
        "~730 TB",
        "~20 TB",
        "~73 PB",
        "~7.3 PB"
      ],
      answer: 3,
      explain: "10^7 × 2 × 10^6 B = 2 × 10^13 B = 20 TB per day; × 365 ≈ 7,300 TB = 7.3 PB per year. 20 TB is only one day's worth.",
      level: "medium"
    },
    {
      q: "A news site serves 1 million distinct articles per day, and each is cached as a 20 KB rendered fragment. Using the 80/20 rule, how much memory does the hot set need before overhead?",
      options: [
        "~400 MB",
        "~4 GB",
        "~20 GB",
        "~200 GB"
      ],
      answer: 1,
      explain: "20% × 1,000,000 × 20 KB = 200,000 × 20 KB = 4 GB. 20 GB would be every distinct article. Even with ~1.5x Redis overhead, one node holds the hot set easily.",
      level: "medium"
    },
    {
      q: "You stream video at 5 Mbps to 20,000 concurrent viewers. How much egress bandwidth do you need?",
      options: [
        "~10 Gbps",
        "~1 Gbps",
        "~100 Gbps",
        "~800 Gbps"
      ],
      answer: 2,
      explain: "20,000 × 5 Mbps = 100,000 Mbps = 100 Gbps, which is 12.5 GB/s. 800 Gbps comes from wrongly multiplying by 8 when the rate was already in bits.",
      level: "easy"
    },
    {
      q: "Peak traffic is 30,000 requests/s. One server handles 1,000 requests/s at your target CPU. Servers are spread evenly over 3 availability zones, and the service must carry peak with one whole zone down. How many servers do you need?",
      options: [
        "30",
        "33",
        "45",
        "90"
      ],
      answer: 2,
      explain: "After losing a zone, two-thirds of the fleet must still provide 30 servers' worth of capacity: 30 ÷ (2/3) = 45. 33 only covers a few individual server failures, and 90 provisions three times the need.",
      level: "hard"
    },
    {
      q: "A service averages 10 ms per request when nearly idle. Modeled as a simple single-server queue with random arrivals, roughly what is its average response time at 90% utilization?",
      options: [
        "~11 ms",
        "~100 ms",
        "~19 ms",
        "~1 s"
      ],
      answer: 1,
      explain: "Response time ≈ service time ÷ (1 − utilization) = 10 ms ÷ 0.1 = 100 ms. Queueing delay grows sharply near saturation, which is why capacity plans target about 50–70% utilization.",
      level: "hard"
    },
    {
      q: "A table stores user IDs as a signed 32-bit integer. About how many IDs can it hand out before overflowing?",
      options: [
        "~65,000",
        "~4.3 billion",
        "~9.2 × 10^18",
        "~2.1 billion"
      ],
      answer: 3,
      explain: "The maximum signed 32-bit value is 2^31 − 1 = 2,147,483,647. 4.3 billion is the unsigned 32-bit range, and 9.2 × 10^18 is the signed 64-bit maximum, which is why IDs should be 64-bit.",
      level: "medium"
    },
    {
      q: "Your estimates show reads outnumber writes 200 to 1. Which investments pay off first?",
      options: [
        "Caching, read replicas and a CDN",
        "Write-optimized LSM storage and batched inserts",
        "Partitioning writes across more database primaries",
        "Moving every write onto an asynchronous queue"
      ],
      answer: 0,
      explain: "With reads dominating, serving them from caches, replicas and edge servers removes most of the load. The other options optimize writes, which are only 0.5% of the traffic here.",
      level: "easy"
    },
    {
      q: "You must store 100 TB of logical data with replication factor 3, and disks may never be filled beyond 60%. How much raw disk capacity must you provision?",
      options: [
        "~500 TB",
        "~300 TB",
        "~180 TB",
        "~160 TB"
      ],
      answer: 0,
      explain: "Replicas make 100 × 3 = 300 TB of data; keeping disks at most 60% full needs 300 ÷ 0.6 = 500 TB. 180 TB comes from multiplying by 0.6 instead of dividing.",
      level: "hard"
    },
    {
      q: "A food-delivery app operating in one city gets 2 million orders a day, and 40% of them arrive during the 2-hour dinner window. What is the peak order rate?",
      options: [
        "~23 per second",
        "~111 per second",
        "~56 per second",
        "~280 per second"
      ],
      answer: 1,
      explain: "0.4 × 2,000,000 = 800,000 orders in 7,200 s ≈ 111 per second. The daily average is only ~23 per second, so this regional app peaks at almost 5x its average.",
      level: "medium"
    }
  ],
  design: [
    {
      id: "design-photo-storage",
      title: "Estimate and design storage for a photo-sharing app",
      level: "Medium",
      prompt: "Design the photo storage and delivery layer for a photo-sharing app with 100 million daily active users. Users upload photos from their phones; other users see them in feeds and on profile pages at several sizes. Photos are kept until the user deletes them. Estimate storage, bandwidth and cost over five years, and design the upload, storage and serving paths. Feed ranking is out of scope.",
      clarify: [
        "How many photos are uploaded per day, and how many photos does a user view per day?",
        "What is the maximum upload size? Do we keep the original, and which display sizes do clients need?",
        "Are videos in scope, or only photos?",
        "How fast must a new photo be visible to followers after upload?",
        "Where are users located, and what load-time target do we have for images?",
        "What durability is expected? Is losing any photo acceptable?",
        "How must deletion work, for example for privacy regulations?"
      ],
      hints: [
        "Start with uploads per day × bytes per photo, and remember that each photo is stored at several sizes.",
        "Compare the size of the photo bytes with the size of their metadata. Should they live in the same store?",
        "Compute egress for viewing at peak. Could your own servers send that? What changes with a CDN?",
        "Most views go to recent photos. What does that suggest for photos that are a year old?",
        "Does an upload need to pass through your API servers at all, or can the phone send bytes straight to object storage?"
      ],
      solution: [
        { t: "h", text: "Requirements" },
        { t: "list", items: [
          "<b>Functional:</b> upload a photo from a phone (up to 20 MB, JPEG or HEIC); serve each photo at four sizes (150, 320, 640 and 1080 px wide); delete a photo; photos are kept until deleted.",
          "<b>Non-functional:</b> 100M DAU worldwide; a new photo is viewable within ~5 s of upload; image load p95 under 200 ms; 99.95% availability for viewing; no photo is ever lost (target 11 nines of durability); cost-efficient over five years."
        ] },
        { t: "h", text: "Estimates" },
        { t: "code", lang: "text", code: `Uploads
  100M DAU x 0.2 uploads/day           = 20M photos/day
  20M / 10^5 s                         = ~200 uploads/s avg, ~600/s peak

Bytes per photo
  original, resized on the phone to 2048 px   ~1.5 MB
  derived sizes: 1080 px ~250 KB, 640 px ~100 KB,
                 320 px ~30 KB, 150 px ~10 KB  ~0.4 MB
  total                                       ~1.9 MB, call it 2 MB

Photo storage (logical)
  20M x 2 MB                           = 40 TB/day
  40 TB x 365                          = ~14.6 PB/year
  x 5 years                            = ~73 PB

Metadata
  20M rows/day x 500 B                 = 10 GB/day = ~3.7 TB/year, ~18 TB in 5 years

Upload ingress at peak
  600/s x 1.5 MB                       = 900 MB/s = ~7.2 Gbit/s

Views
  100M DAU x 100 views/day             = 10B views/day
  10^10 / 10^5 s                       = 100k views/s avg, ~300k/s peak
  ~150 KB per view (mostly 640 and 1080 px)
  peak egress: 300k x 150 KB           = 45 GB/s = ~360 Gbit/s
  origin share at 95% CDN hit ratio    = ~18 Gbit/s, ~15k requests/s` },
        { t: "p", html: "Three conclusions drive the design. Photo bytes (73 PB) dwarf metadata (18 TB) by 4,000x, so bytes go to object storage and metadata to a database. Peak egress of 360 Gbit/s requires a CDN. And storage grows by 14.6 PB a year forever, so the cost per stored byte is what we must optimize." },
        { t: "h", text: "API" },
        { t: "code", lang: "http", code: `POST /v1/photos/uploads
     -> 201 { "photo_id": "p_7Hk2", "upload_url": "<presigned PUT URL>", "expires_in": 900 }

PUT  <presigned upload_url>          (phone sends bytes directly to object storage)

POST /v1/photos/{photo_id}/complete
     body: { "caption": "...", "sha256": "..." }  -> 202 Accepted

GET  /v1/photos/{photo_id}
     -> 200 { "status": "ready", "urls": { "w320": "https://img.example-cdn.com/p_7Hk2/w320.jpg", ... } }

DELETE /v1/photos/{photo_id}         -> 204 No Content` },
        { t: "h", text: "Data model" },
        { t: "table", head: ["Store", "Contents", "Why"], rows: [
          ["Object storage (Amazon S3 or similar)", "Keys like <code>a3f/p_7Hk2/orig.jpg</code> and <code>a3f/p_7Hk2/w640.jpg</code>; the hash prefix spreads load", "Cheap, practically unlimited, designed for 11 nines of durability, serves as the CDN origin"],
          ["Wide-column or key-value DB (Cassandra or DynamoDB)", "<code>photos(photo_id PK, owner_id, status, width, height, sha256, created_at)</code>", "Key lookups at high rate; scales linearly to tens of TB; multi-region replication"],
          ["Same DB, second table", "<code>photos_by_owner(owner_id PK, created_at DESC, photo_id)</code>", "Profile grid: newest photos of one user in one partition"],
          ["Redis", "Metadata of recent photos", "Feed rendering needs up to ~300k lookups/s at peak"]
        ] },
        { t: "h", text: "High-level design" },
        { t: "diagram", caption: "Photo bytes go from the phone straight to object storage and reach viewers through the CDN; API servers handle only small metadata calls.", code: `flowchart LR
  P(("Phone app")) -->|"1. request upload"| API["Photo API"]
  P -->|"2. PUT original via presigned URL"| OS[("Object storage")]
  P -->|"3. complete"| API
  API --> MD[("Metadata DB")]
  API -->|"4. PhotoUploaded"| Q[["Queue"]]
  Q --> RW["Resize workers"]
  RW -->|"read original, write 4 sizes"| OS
  RW -->|"mark ready"| MD
  V(("Viewers")) --> CDN["CDN"]
  CDN -.->|"on miss"| OS` },
        { t: "p", html: "<b>Upload path:</b> the app asks the API for an upload slot; the API creates a metadata row with status <code>uploading</code> and returns a short-lived presigned URL. The phone PUTs the bytes directly to object storage, so 7 Gbit/s of upload traffic never touches our servers. On <code>complete</code>, the API verifies the object exists, sets status to <code>processing</code> and enqueues a job. A resize worker reads the original, writes the four sizes and marks the photo <code>ready</code>, all within a few seconds. <b>View path:</b> the feed returns CDN URLs; the CDN serves about 95% of bytes from its edge caches and fetches misses from object storage." },
        { t: "h", text: "Deep dives" },
        { t: "p", html: "<b>Storage tiering is where the money is.</b> After year one we hold 14.6 PB. At roughly $0.021 per GB-month (approximate S3 Standard list price at high volume), that is about 14.6M GB × $0.021 ≈ $307,000 per month, and growing. But the original is 1.5 of the 1.9 MB per photo, and is rarely read after resizing. Keep the derived sizes (21% of bytes, 3.1 PB) in standard storage: about $65,000. Move originals (11.5 PB) to an archive tier with millisecond access such as S3 Glacier Instant Retrieval at about $0.004 per GB-month: about $46,000. Total ≈ $110,000 per month, roughly 64% less. A lifecycle rule can also move derived sizes of photos older than a year to an infrequent-access tier." },
        { t: "p", html: "<b>Resize capacity.</b> Assume ~200 ms of CPU to decode a 2048 px image and encode four sizes. Peak is 600 uploads/s × 0.2 s = 120 cores busy; at a 60% utilization target that is 200 cores, about 7 servers with 32 cores. The queue absorbs bursts: on New Year's Eve, at 10x uploads, workers fall behind and photos take longer to become ready instead of failing, and autoscaling adds workers based on queue depth. Generating sizes eagerly costs storage for sizes nobody requests, but avoids slow first views; on-demand resizing is the alternative (Chapter 5 designs an image resizing CDN)." },
        { t: "p", html: "<b>Durability and origin load.</b> Managed object storage replicates or erasure-codes data across zones for us. If we ran our own storage, 3x replication of 73 PB would need 219 PB of raw disk, while a 10+4 erasure code needs 1.4x, about 102 PB (Chapter 10 explains the trade-off). At the origin, 15k GET/s at peak exceeds S3's documented baseline of 5,500 GETs per second per prefix, which is why object keys start with a hash prefix that spreads requests across many partitions." },
        { t: "h", text: "Trade-offs and bottlenecks" },
        { t: "table", head: ["Decision", "Gain", "Cost"], rows: [
          ["Presigned direct uploads", "API servers never carry photo bytes", "Must verify uploads and clean up abandoned ones"],
          ["Resize on the phone to 2048 px", "Smaller uploads and storage than a 5 MB original", "We never hold the full-resolution original"],
          ["Eager four-size generation", "Fast first view; simple CDN URLs", "Stores sizes that some photos never need"],
          ["Originals in an archive tier", "About 64% lower storage bill", "Per-GB retrieval fees if originals must be reprocessed"],
          ["Wide-column DB for metadata", "Scales simply to 18 TB and 300k lookups/s", "No ad hoc queries; secondary access needs its own table"]
        ] }
      ],
      followups: [
        "Users can now upload 60-second videos. Redo the storage and egress estimates.",
        "Many users repost identical memes. How would you detect duplicates, and what would it save?",
        "A user deletes a photo for privacy reasons. How do you make sure it disappears from every size, every storage tier and every CDN cache?",
        "30% of users are on slow mobile networks. What would you change about the image sizes and formats you serve?",
        "Uploads spike 10x for an hour on New Year's Eve. How many resize workers do you need, and what happens if you don't scale?"
      ]
    },
    {
      id: "design-log-metrics-pipeline",
      title: "Estimate and design a log and metrics ingestion pipeline",
      level: "Hard",
      prompt: "Your company runs 50,000 hosts. An agent on each host ships application logs and system and application metrics. Engineers must be able to search logs within a minute of emission for the last 7 days, and logs must be archived for 90 days for audits. Metrics feed dashboards and alerts, kept at full resolution for 15 days and downsampled for a year. Estimate the load on every tier and design an ingestion pipeline that does not lose data when an incident triples log volume for hours.",
      clarify: [
        "How many log lines per second does a typical host emit, and how large is a line?",
        "How many metric series does each host emit, and how often is each sampled?",
        "How fresh must data be: queryable within seconds, or within a minute?",
        "Is losing some debug logs acceptable during spikes? Are some logs (audit, security) never droppable?",
        "How large and how long are traffic spikes during incidents and deploys?",
        "Are hosts in one region or several? Must data stay in its region?",
        "Is there a budget target, or a current cost we must beat?"
      ],
      hints: [
        "Start per host: lines per second × bytes per line × hosts. Then convert the per-second rate to per-day storage with 86,400.",
        "A durable log like Kafka between agents and stores absorbs spikes. Size it four ways: ingress, disk writes with replication, retention storage, and consumer parallelism. Which one is binding?",
        "Metrics are tiny values but there are many series. Compute samples per second, then bytes per sample before and after time-series compression.",
        "During an incident, input triples while consumers keep their normal speed. How fast does the backlog grow, and how long does it take to drain?",
        "Compression ratios and replication factors change the answers by 3–10x. Write each one down as an explicit assumption."
      ],
      solution: [
        { t: "h", text: "Requirements" },
        { t: "list", items: [
          "<b>Functional:</b> agents ship structured log lines and metric samples from every host; logs are searchable by time, service, host, level and text; metrics are queryable for dashboards and alert rules; logs are archived for 90 days; metrics are kept for 15 days at 10 s resolution and 1 year at 5 min resolution.",
          "<b>Non-functional:</b> 50,000 hosts; at-least-once delivery, so acknowledged data is never lost; tolerate 3x log volume for several hours; freshness p99 under 60 s for errors; agents use bounded CPU and memory on production hosts; cost-conscious."
        ] },
        { t: "h", text: "Estimates" },
        { t: "code", lang: "text", code: `Logs: volume
  50,000 hosts x 50 lines/s             = 2.5M lines/s
  2.5M x 500 B                          = 1.25 GB/s raw  (= 10 Gbit/s)
  1.25 GB/s x 86,400 s                  = ~108 TB/day raw
  incident peak, 3x                     = 7.5M lines/s, 3.75 GB/s raw

Logs: on the wire (agents batch and compress ~5x with zstd)
  1.25 GB/s / 5                         = 250 MB/s avg, 750 MB/s peak

Logs: storage
  hot, searchable 7 days in a columnar store at ~5x net compression
    108 TB / 5 = ~22 TB/day x 7 days    = ~150 TB, x 2 replicas = ~300 TB
    nodes with 8 TB disk at 70% fill    = 300 / 5.6 = ~54 nodes
  archive 90 days in object storage at ~10x
    108 TB / 10 = ~11 TB/day x 90 days  = ~1 PB, ~$20k/month at S3 Standard prices

Agent buffer
  per host: 50 lines/s x 500 B          = 25 KB/s
  1 hour of pipeline outage             = 25 KB/s x 3,600 = ~90 MB of local disk` },
        { t: "code", lang: "text", code: `Metrics
  50,000 hosts x 1,000 series           = 50M active series
  one sample per series every 10 s      = 5M samples/s
  raw: 16 B per sample                  = 80 MB/s = ~6.9 TB/day
  compressed: ~1.5 B per sample         = 7.5 MB/s = ~650 GB/day
  15 days at full resolution            = ~10 TB, x 2 replicas = ~20 TB
  1-year rollups at 5 min, 4 values each (min, max, sum, count):
    50M x 288 points/day x 4 x 1.5 B    = ~86 GB/day = ~31 TB/year
  ingester memory at ~3 KB per active series:
    50M x 3 KB = 150 GB, x 3 replicas   = ~450 GB of RAM` },
        { t: "code", lang: "text", code: `Kafka for logs: replication factor 3, 24-hour replay buffer
  disk writes = ingress x 3             = 750 MB/s avg, 2.25 GB/s peak
  retention: 250 MB/s x 86,400 s x 3    = ~65 TB

  storage bound:   65 TB / ~7 TB usable per broker      = ~10 brokers
  disk bound:      2.25 GB/s / ~300 MB/s per broker      = ~8 brokers
  network bound:   peak out = replication 1.5 GB/s
                   + 2 consumer groups 1.5 GB/s = 3 GB/s
                   / ~500 MB/s per broker                = ~6 brokers
  binding constraint: retention storage -> 12 brokers with headroom

Partitions, set by the maximum consumer parallelism
  one indexer thread handles ~20k lines/s
  to index a full 3x peak: 7.5M / 20k   = 375 consumer threads
  partitions must be >= consumers       -> 512 partitions` },
        { t: "h", text: "API" },
        { t: "code", lang: "http", code: `POST /v1/logs:batch           (zstd-compressed NDJSON, at most 1 MB per batch)
     -> 202 Accepted
     -> 429 Too Many Requests, Retry-After: 2     (tenant over quota)

POST /v1/metrics:write        (protobuf + snappy, Prometheus remote-write style)
     -> 204 No Content

GET  /v1/logs/search?service=checkout&level=error&q=timeout&from=...&to=...
GET  /v1/metrics/query?expr=...&start=...&end=...&step=60s` },
        { t: "h", text: "Data model" },
        { t: "table", head: ["Data", "Store", "Layout", "Why"], rows: [
          ["Logs in flight", "Kafka topics <code>logs-high</code> (warn and above) and <code>logs-low</code>", "Partitioned by hash of host, so each host's lines stay in order", "Buffer, replay, and fan-out to several consumers"],
          ["Hot logs, 7 days", "Columnar store such as ClickHouse", "Table <code>logs(ts, service, host, level, trace_id, message, attrs)</code>, sorted by <code>(service, ts)</code>, one partition per day", "High compression, fast filters; expire a day by dropping its partition"],
          ["Archived logs, 90 days", "Object storage", "<code>logs/dt=2026-10-22/hour=14/service=checkout/part-0001.zst</code>", "Cheap and durable; queryable later with Spark or Athena"],
          ["Metrics", "Prometheus-compatible TSDB such as Mimir or VictoriaMetrics", "Series ID = hash of metric name and labels; 2-hour compressed chunks", "Time-series compression at ~1–2 B per sample"]
        ] },
        { t: "h", text: "High-level design" },
        { t: "diagram", caption: "Agents ship compressed batches through gateways into Kafka, which decouples bursty producers from the indexers, archiver and metrics ingesters.", code: `flowchart LR
  H["50,000 hosts<br/>agent with disk buffer"] -->|"compressed batches"| GW["Ingest gateways<br/>auth and quotas"]
  GW --> KL[["Kafka log topics"]]
  GW --> KM[["Kafka metrics topic"]]
  KL --> IDX["Log indexers"]
  KL --> ARC["Archiver"]
  IDX --> CH[("Columnar log store<br/>7 days")]
  ARC --> OS[("Object storage<br/>90 days")]
  KM --> ING["Metrics ingesters"]
  ING --> TS[("Time-series DB<br/>15 days raw")]
  TS -.->|"5 min rollups"| RU[("Rollup store<br/>1 year")]
  QA["Query API and dashboards"] --> CH
  QA --> TS` },
        { t: "p", html: "<b>Write path:</b> each agent tails local log files and scrapes local metrics, batches about one second of data, compresses it and POSTs it to a gateway. If the gateway is unreachable or returns 429, the agent spills to its local disk buffer (~90 MB per hour of outage) and retries with backoff. Gateways authenticate, enforce per-service quotas and produce to Kafka; they acknowledge the agent only after Kafka confirms the write with all in-sync replicas. Two consumer groups read the log topics: indexers write batches into the columnar store, and the archiver writes hourly compressed files to object storage. Metrics ingesters keep recent samples in memory, flush compressed 2-hour chunks to the time-series DB, and a background job computes 5-minute rollups. <b>Read path:</b> the query API sends log searches to the columnar store (or to the archive for older data) and metric queries to the TSDB." },
        { t: "h", text: "Deep dives" },
        { t: "p", html: "<b>Finding the binding constraint in Kafka.</b> The four estimates give 6 to 10 brokers. The largest, retention storage for a 24-hour replay buffer, wins, so we run 12 brokers to leave headroom for a broker failure. Partition count is driven by something else entirely: consumers in a group can't exceed partitions, and indexing 7.5M lines/s at 20k lines per thread needs 375 threads, so 512 partitions. Metrics add about 100 MB/s on the wire (assuming ~20 B per sample after batching and compression) and are sized the same way on a smaller topic." },
        { t: "p", html: "<b>Surviving a 3x incident spike.</b> The partitions allow indexing a full 3x peak, but running that many indexers (and the columnar store write capacity behind them) all the time is expensive. Suppose they normally run at 1.5x average, 375 MB/s compressed, and scaling up takes longer than the spike. During a 2-hour spike, input is 750 MB/s, so the backlog grows at 375 MB/s: 1.35 TB per hour, 2.7 TB after 2 hours, far inside the 21.6 TB a day of retention, so nothing is lost. But when traffic returns to normal, spare capacity is only 375 − 250 = 125 MB/s, so draining 2.7 TB takes 2.7 × 10^6 MB ÷ 125 MB/s ≈ 21,600 s = 6 hours. Logs would be 6 hours stale exactly when engineers are debugging. Fixes: split topics by priority so <code>logs-high</code> has its own, over-provisioned indexers and stays fresh; sample debug logs at the agent during spikes; and enforce per-service quotas so one noisy service can't consume everyone's capacity." },
        { t: "p", html: "<b>Metric cardinality.</b> Metrics are cheap per sample but expensive per series, because each active series costs memory in the ingesters. One histogram with 10 buckets × 20 endpoints × 5 status codes × 2,000 pods is already 2 million series. A developer who adds a <code>user_id</code> label with a million values makes it unbounded. Enforce a per-service limit on active series at the ingesters, reject new series beyond it with a clear error, and alert service owners when they approach the limit." },
        { t: "h", text: "Trade-offs and bottlenecks" },
        { t: "table", head: ["Decision", "Gain", "Cost"], rows: [
          ["Kafka buffer between agents and stores", "Absorbs spikes; replay after bugs; several independent consumers", "About 12 brokers to operate; adds seconds of latency"],
          ["Columnar store instead of a full-text index", "About 5x less hot storage; fast filters and aggregations", "Slower arbitrary substring search (Chapter 10 compares the options)"],
          ["Compression at the agent", "5x less network and Kafka disk", "A little CPU on every production host"],
          ["Priority topics and debug sampling", "Errors stay fresh during incidents", "Some low-priority logs are delayed or dropped"],
          ["Regional pipelines instead of one central one", "No cross-region transfer of ~21.6 TB/day of compressed logs", "Global queries must fan out to several regions"]
        ] }
      ],
      followups: [
        "A team adds a <code>request_id</code> label to a high-traffic metric. What happens to the ingesters, and how do you protect the system?",
        "Legal now requires one year of searchable audit logs for the payments service. Estimate the added cost.",
        "A Kafka broker fails during an incident peak. What happens to throughput, durability and the brokers that remain?",
        "How would you cut the hot log storage cost in half without losing the ability to search errors?",
        "Should three regions ship everything to one central region? Estimate the transfer volume and its monthly cost."
      ]
    }
  ]
};
