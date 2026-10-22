module.exports = {
  id: "storage-search-data",
  num: 10,
  part: 4,
  title: "Storage, Search and Data Processing",
  tagline: "Store blobs durably, find text fast, and turn event firehoses into answers.",
  level: "Intermediate",
  lessons: [
    {
      id: "object-storage",
      title: "Block, file and object storage",
      minutes: 10,
      blocks: [
        { t: "p", html: "Every system eventually has to store bytes that are not rows: profile photos, videos, log archives, ML datasets, database backups. There are three storage abstractions, and interviewers expect you to pick the right one without hesitation. The short version: <b>block</b> storage is a raw disk, <b>file</b> storage is a shared folder tree, and <b>object</b> storage is a giant key to blob map spoken over HTTP." },
        { t: "table", head: ["Aspect", "Block", "File", "Object"], rows: [
          ["Abstraction", "Numbered fixed-size blocks; you put a filesystem or database on top", "Hierarchical directories and files with POSIX semantics", "Flat namespace of <code>bucket/key</code> mapped to an immutable blob plus metadata"],
          ["Access", "Mounted by one host as a device (iSCSI, NVMe)", "NFS or SMB, many hosts at once", "HTTP API: <code>PUT</code>, <code>GET</code>, <code>DELETE</code>, <code>LIST</code>"],
          ["Examples", "AWS EBS, GCP Persistent Disk, local NVMe", "AWS EFS, NetApp, CephFS", "Amazon S3, Google Cloud Storage, Azure Blob, MinIO"],
          ["Latency", "Sub-millisecond", "~1 to a few ms", "Tens of ms to first byte"],
          ["Updates", "Overwrite any block in place", "Append, seek and overwrite", "Replace the whole object; no in-place edits"],
          ["Scale and cost", "TBs per volume; you pay for provisioned size and IOPS", "Up to PBs; managed file storage is often the priciest per GB", "Effectively unlimited, cheapest per GB, tiered classes"],
          ["Typical use", "Database data files, boot volumes", "Shared home dirs, legacy apps, CMS assets", "Media, backups, data lakes, static sites, logs"]
        ] },
        { t: "h", text: "How an object store works inside" },
        { t: "p", html: "An object store splits into two very different subsystems. The <b>metadata service</b> maps <code>bucket + key</code> to an object id, size, checksum, version and the list of data nodes holding its pieces. It is small per object but must be strongly consistent and handle huge request rates, so it lives in a partitioned, replicated database. The <b>data service</b> stores the actual bytes on many storage nodes and is optimized for throughput and cheap capacity. Stateless API servers sit in front, authenticate the request, consult metadata and stream bytes to or from data nodes." },
        { t: "diagram", caption: "Metadata and data take different paths: metadata is tiny and strongly consistent, data is bulky and spread across many nodes and zones.", code: `flowchart LR
  C(("Client")) -->|"PUT photos/cat.jpg"| API["API servers<br/>auth, routing"]
  API -->|"1. pick placement"| Meta[("Metadata store<br/>key to object id, chunks")]
  API -->|"2. stream fragments"| D1["Data node<br/>zone A"]
  API --> D2["Data node<br/>zone B"]
  API --> D3["Data node<br/>zone C"]
  API -->|"3. commit metadata"| Meta
  Scrub["Background scrubber<br/>and repair"] -.->|"verify checksums"| D2` },
        { t: "h", text: "Replication vs erasure coding" },
        { t: "p", html: "The simple way to survive disk loss is <b>replication</b>: keep 3 full copies in 3 zones. It is fast to read and trivial to repair, but you pay 3x the raw capacity. <b>Erasure coding</b> (usually Reed-Solomon) splits an object into <code>k</code> data fragments and computes <code>m</code> parity fragments; <em>any</em> <code>k</code> of the <code>k + m</code> fragments rebuild the original. With RS(6,3) you store 9 fragments of 1/6 size each, so 1.5x raw capacity, and you survive any 3 fragment losses, which is more fault tolerance than 3x replication at half the cost." },
        { t: "table", head: ["Scheme", "Raw bytes for 1 TB", "Overhead", "Losses survived", "Cost to repair one lost piece"], rows: [
          ["2x replication", "2 TB", "100%", "1", "Copy 1 replica"],
          ["3x replication", "3 TB", "200%", "2", "Copy 1 replica"],
          ["RS(6,3) erasure coding", "1.5 TB", "50%", "Any 3 of 9", "Read 6 fragments, recompute"],
          ["RS(10,4) erasure coding", "1.4 TB", "40%", "Any 4 of 14", "Read 10 fragments, recompute"]
        ] },
        { t: "callout", kind: "tip", title: "Replicate hot data, erasure-code cold data", html: "Erasure coding costs CPU on writes, makes repairs read many fragments across the network, and turns a normal read into a multi-node read when a fragment is missing. Small objects waste space when cut into fragments, so stores pack many small objects into large append-only volumes before coding them. A common design: write new data replicated, then a background job converts it to erasure-coded form once it cools down. HDFS ships an RS(6,3) policy for exactly this reason." },
        { t: "h", text: "Where 11 nines of durability comes from" },
        { t: "p", html: "<b>Durability</b> is the probability you never lose the data; <b>availability</b> is the probability you can read it right now. S3 is designed for 99.999999999% (11 nines) durability but only about 99.99% availability. Eleven nines means an annual loss probability of 10^-11 per object: store 10 million objects and you expect 10^7 x 10^-11 = 10^-4 losses per year, about one object every 10,000 years. It comes from four things working together: fragments spread across at least 3 zones, continuous checksum scrubbing to catch silent bit rot, fast automatic repair so the window of reduced redundancy is minutes not days, and versioning plus object lock to protect against the most common cause of loss, which is humans deleting things." },
        { t: "h", text: "Presigned URLs and multipart upload" },
        { t: "steps", items: [
          { title: "Client asks your API for an upload slot", html: "<code>POST /uploads</code> with file name, size and type. Your API checks auth, quota and content type." },
          { title: "API signs a URL", html: "Using its own cloud credentials, the API creates a presigned <code>PUT</code> URL for one exact key, valid for e.g. 15 minutes. No network call to S3 is needed; it is a local HMAC signature." },
          { title: "Client uploads straight to the object store", html: "The bytes never touch your app servers, so a 2 GB video does not tie up an app thread or your bandwidth bill." },
          { title: "Object store notifies you", html: "An event notification (S3 to SQS or Lambda) or a client <code>POST /uploads/id/complete</code> call tells your backend to write the metadata row and kick off processing." }
        ] },
        { t: "p", html: "For large files use <b>multipart upload</b>: initiate, upload parts in parallel (in S3 each part is 5 MiB to 5 GiB, up to 10,000 parts), then send a complete call listing the part ETags. A failed part is retried alone, uploads can resume after a network drop, and parallel parts saturate the client's bandwidth. Add a lifecycle rule that aborts incomplete multipart uploads after a few days, or orphaned parts silently accumulate storage cost." },
        { t: "callout", kind: "interview", title: "Say this in any media-heavy design", html: "\"Uploads go directly from the client to S3 using presigned URLs, with multipart for anything over ~100 MB. Our servers only handle metadata. Downloads are served through a CDN in front of the bucket.\" That one sentence removes your app tier from the bandwidth path and shows you know the standard pattern." },
        { t: "callout", kind: "example", title: "S3 became strongly consistent", html: "Since December 2020, Amazon S3 provides strong read-after-write consistency for PUTs and DELETEs, including overwrites and LIST operations. Older designs had to work around eventual consistency on overwrites; you no longer do." }
      ]
    },
    {
      id: "full-text-search",
      title: "Full-text search and Elasticsearch",
      minutes: 12,
      blocks: [
        { t: "p", html: "A query like <code>WHERE body LIKE '%timeout%'</code> forces a full table scan: a B-tree index sorts whole values, so it cannot help with a word in the middle of a string. It also cannot rank results by relevance, handle plurals, or tolerate typos. Search engines solve this with a different data structure, built for one question: <em>which documents contain this term?</em>" },
        { t: "h", text: "The inverted index, worked example" },
        { t: "p", html: "Take three documents. D1: \"Kafka stores events in partitions\". D2: \"Redis stores keys in memory\". D3: \"Kafka partitions are replicated\". The analyzer lowercases, drops stop words like <em>in</em> and <em>are</em>, and stems words to a root form. The result maps each term to a <b>postings list</b>: the documents containing it, with the word positions." },
        { t: "table", head: ["Term", "Postings: doc at position", "Document frequency"], rows: [
          ["kafka", "D1 at 1, D3 at 1", "2"],
          ["store", "D1 at 2, D2 at 2", "2"],
          ["event", "D1 at 3", "1"],
          ["partition", "D1 at 5, D3 at 2", "2"],
          ["redis", "D2 at 1", "1"],
          ["key", "D2 at 3", "1"],
          ["memory", "D2 at 5", "1"],
          ["replicate", "D3 at 4", "1"]
        ] },
        { t: "p", html: "The query <code>kafka AND partitions</code> is analyzed the same way into <code>kafka</code>, <code>partition</code>, then the engine intersects two sorted postings lists: {D1, D3} and {D1, D3} gives {D1, D3}. Intersecting sorted lists is a linear merge, and real engines add skip pointers so they can jump ahead. The phrase query <code>\"kafka partitions\"</code> also checks positions: in D3 the terms sit at 1 and 2 (adjacent, match), in D1 at 1 and 5 (not adjacent, no match). Term lookup itself uses a sorted term dictionary (Lucene uses a compact finite-state transducer), so finding a term's postings is fast even with hundreds of millions of distinct terms." },
        { t: "h", text: "Analyzers: how text becomes terms" },
        { t: "list", items: [
          "<b>Character filters</b> clean raw text: strip HTML, map special characters.",
          "<b>Tokenizer</b> splits text into tokens: on whitespace and punctuation, or by language rules (Chinese and Japanese need dictionary-based tokenizers because words are not separated by spaces).",
          "<b>Token filters</b> transform tokens: lowercase, remove stop words, stem (<em>running</em> to <em>run</em>), add synonyms (<em>tv</em> and <em>television</em>), or emit edge n-grams (<em>ka</em>, <em>kaf</em>, <em>kafk</em>) to support search-as-you-type.",
          "The same analyzer, or a compatible one, must run at index time and at query time. Otherwise the query asks for terms that were never written to the index."
        ] },
        { t: "callout", kind: "warn", title: "text vs keyword fields", html: "In Elasticsearch a <code>text</code> field is analyzed for full-text search, while a <code>keyword</code> field is stored as one exact term for filtering, sorting and aggregations. Mapping a status code or user id as <code>text</code> breaks exact matches and aggregations; mapping a message body as <code>keyword</code> makes word search impossible. Many fields are mapped both ways." },
        { t: "h", text: "Ranking: TF-IDF and BM25" },
        { t: "p", html: "Matching documents must be ordered. <b>TF-IDF</b> scores a term higher when it appears often in the document (term frequency) and rarely across the corpus (inverse document frequency): \"kafka\" in a doc about Kafka matters more than \"the\". <b>BM25</b>, the default in Lucene, Elasticsearch and OpenSearch, improves on it in two ways: term frequency <em>saturates</em> (the 20th mention adds little over the 5th, controlled by <code>k1</code>, about 1.2), and scores are normalized by document length so long documents do not win just by containing more words (controlled by <code>b</code>, about 0.75). Production ranking then layers business signals on top: recency, popularity, personalization, or a learned re-ranking model over the top few hundred hits." },
        { t: "code", lang: "python", code: `import math

def bm25(query_terms, doc_tf, doc_len, avg_len, df, n_docs, k1=1.2, b=0.75):
    """doc_tf: term -> count in this doc. df: term -> docs containing term."""
    score = 0.0
    for t in query_terms:
        if t not in doc_tf:
            continue
        idf = math.log(1 + (n_docs - df[t] + 0.5) / (df[t] + 0.5))
        tf = doc_tf[t]
        length_norm = 1 - b + b * doc_len / avg_len
        score += idf * tf * (k1 + 1) / (tf + k1 * length_norm)
    return score` },
        { t: "h", text: "Elasticsearch: shards, replicas, near-real-time" },
        { t: "diagram", caption: "Query-then-fetch: the coordinating node asks one copy of every shard for its local top hits, merges them, then fetches only the winning documents.", code: `flowchart LR
  C(("Client")) -->|"search: timeout errors"| Co["Coordinating node"]
  Co -->|"query phase"| S0["Shard 0<br/>primary"]
  Co -->|"query phase"| S1["Shard 1<br/>replica"]
  Co -->|"query phase"| S2["Shard 2<br/>replica"]
  S0 -.->|"top 10 ids and scores"| Co
  S1 -.->|"top 10 ids and scores"| Co
  S2 -.->|"top 10 ids and scores"| Co
  Co -->|"fetch phase: get docs"| S1
  Co -->|"merged top 10"| C` },
        { t: "list", items: [
          "An <b>index</b> is split into primary shards; each shard is a self-contained Lucene index. A document goes to shard <code>hash(routing) % number_of_primary_shards</code>, where routing defaults to the document id. Because of that modulo, the primary shard count is fixed at index creation; changing it means a reindex or a split/shrink operation.",
          "Each primary has <b>replicas</b> on other nodes. Writes go to the primary, which forwards them to replicas; searches can be served by any copy, so replicas add both fault tolerance and read throughput.",
          "A Lucene shard is a set of immutable <b>segments</b>. New documents sit in an in-memory buffer and are written to the <b>translog</b> for durability. Every <code>refresh_interval</code> (default 1 second) the buffer becomes a new searchable segment. That is why Elasticsearch is <b>near-real-time</b>: a document is durable when the write returns but searchable about 1 second later.",
          "Background <b>merging</b> combines small segments into large ones and purges deleted documents. Updates are delete plus re-insert, so update-heavy workloads cost merge I/O.",
          "Rule of thumb: keep shards around 10 to 50 GB. Too many tiny shards waste heap and cluster-state overhead; giant shards make recovery and rebalancing slow.",
          "Deep pagination with <code>from + size</code> forces every shard to return <code>from + size</code> hits to the coordinator, so it is capped (10,000 by default). Use <code>search_after</code> with a sort key for deep or infinite scroll."
        ] },
        { t: "h", text: "Keeping search in sync with the database" },
        { t: "compare", items: [
          { title: "Dual writes from the app", pros: ["Simple to start", "Low latency to searchable"], cons: ["Two writes without a transaction: one can fail and they drift apart", "Concurrent updates can land in different orders in the two stores"], use: "Prototypes only, or with a periodic repair job." },
          { title: "Change data capture into an indexer", pros: ["DB commit log is the single source of truth", "Kafka buffers indexing spikes and lets you replay", "Ordering per key is preserved by partitioning on the row id"], cons: ["More moving parts: Debezium, Kafka, indexer workers", "Seconds of lag between commit and searchable"], use: "The default production answer for keeping Elasticsearch in sync with PostgreSQL or MySQL." },
          { title: "Periodic full reindex with alias swap", pros: ["Fixes any drift, allows mapping changes", "Zero-downtime cutover by flipping an alias"], cons: ["Expensive for large corpora", "Stale between runs if used alone"], use: "Schema changes, analyzer changes, and as a backstop to CDC." }
        ] },
        { t: "callout", kind: "interview", title: "Search is a derived view", html: "State clearly that the database is the source of truth and the search index is a derived, rebuildable view fed by CDC. Mention that the indexer writes with the row's version number using external versioning, so a late, out-of-order event can never overwrite a newer document. Interviewers listen for whether you treat Elasticsearch as a primary store; it should not be one for data you cannot regenerate." }
      ]
    },
    {
      id: "batch-processing",
      title: "Batch processing: MapReduce and Spark",
      minutes: 9,
      blocks: [
        { t: "p", html: "<b>Batch processing</b> runs a job over a large, bounded dataset (yesterday's logs, the full orders table) and produces output some time later: minutes to hours. Nobody waits on it interactively. It answers questions like \"daily revenue per country\" or \"rebuild the recommendation model\", and its great property is that it is <em>repeatable</em>: if the code had a bug, fix it and rerun over the same immutable input." },
        { t: "h", text: "The MapReduce model" },
        { t: "p", html: "MapReduce, published by Google in 2004 and popularized by Hadoop, splits any job into two functions you write and one step the framework does for you. <b>Map</b> reads input records and emits key-value pairs. <b>Shuffle</b> moves all pairs with the same key to the same machine and sorts them. <b>Reduce</b> processes all values for one key at a time. The framework handles splitting input, scheduling tasks near the data, and rerunning failed tasks." },
        { t: "diagram", caption: "The shuffle is the expensive part: every mapper may send data to every reducer across the network, grouped by key.", code: `flowchart LR
  In[("Input files<br/>in HDFS or S3")] --> M1["Map task 1"]
  In --> M2["Map task 2"]
  In --> M3["Map task 3"]
  M1 -->|"shuffle by key"| R1["Reduce: keys A to M"]
  M1 --> R2["Reduce: keys N to Z"]
  M2 --> R1
  M2 --> R2
  M3 --> R1
  M3 --> R2
  R1 --> Out[("Output files")]
  R2 --> Out` },
        { t: "code", lang: "python", code: `# Word count, the hello world of MapReduce
def map_fn(_, line):
    for word in line.lower().split():
        yield word, 1

def reduce_fn(word, counts):
    yield word, sum(counts)

# A combiner runs reduce_fn locally on each mapper's output before the
# shuffle, so a mapper sends (the, 5000) once instead of (the, 1) 5000 times.` },
        { t: "list", items: [
          "<b>Move compute to data.</b> Shipping a 10 GB input split across the network is slow; shipping a few KB of code to the node already holding it is cheap.",
          "<b>Fault tolerance by recomputation.</b> Map and reduce are deterministic over immutable input, so a failed task is simply rerun on another node.",
          "<b>Skew is the real enemy.</b> If one key (a celebrity user, the null key) has 30% of the values, one reducer does 30% of the work and the job waits on it. Fixes: salting the hot key into <code>key#0..key#9</code> and merging afterwards, or broadcasting the small side of a join."
        ] },
        { t: "h", text: "Spark: the successor" },
        { t: "p", html: "Classic MapReduce writes intermediate results to disk between every stage, so a 10-stage pipeline means 10 rounds of disk I/O. <b>Apache Spark</b> represents a job as a DAG of transformations over partitioned datasets, keeps intermediate data in memory where it fits, and pipelines narrow operations (map, filter) without materializing them. Lost partitions are recomputed from their <em>lineage</em> rather than restored from replicas. Spark SQL and DataFrames add a query optimizer, so most jobs are written as SQL-like code. It is typically several times to an order of magnitude faster than Hadoop MapReduce for multi-stage jobs, which is why new batch work is built on Spark, or on warehouse engines like BigQuery, Snowflake and Trino." },
        { t: "callout", kind: "interview", title: "When batch is the right answer", html: "If the requirement says \"daily report\", \"nightly\", \"reconcile\" or \"retrain\", propose a batch job on Spark reading from the data lake, and say why: simpler than streaming, cheap on spot instances, and trivially re-runnable. Do not reach for Flink when hourly freshness is fine." }
      ]
    },
    {
      id: "stream-processing",
      title: "Stream processing, windows and watermarks",
      minutes: 12,
      blocks: [
        { t: "p", html: "<b>Stream processing</b> handles unbounded data continuously: events flow in from Kafka, the job updates state and emits results within seconds. Fraud detection, live dashboards, ad-click counting and alerting are stream problems. The main engines are <b>Apache Flink</b> (a dedicated cluster, rich windowing and event-time support, large keyed state), <b>Kafka Streams</b> (a library inside your own service that reads and writes Kafka, with state in local RocksDB backed by changelog topics) and <b>Spark Structured Streaming</b> (micro-batches, a good fit if you already run Spark)." },
        { t: "h", text: "Event time vs processing time" },
        { t: "p", html: "<b>Event time</b> is when the event actually happened, stamped by the device or producer. <b>Processing time</b> is when your job sees it. They differ because of network delays, retries, consumer lag and phones that buffer events offline for hours. If you count clicks per minute by processing time, a 5-minute consumer outage shifts all those clicks into the minute the consumer recovers: the chart shows a dip then a fake spike. Counting by event time gives the right answer, but it raises a hard question: when do you know a minute is <em>complete</em>?" },
        { t: "h", text: "Watermarks and late data" },
        { t: "p", html: "A <b>watermark</b> is the engine's assertion \"I believe no more events with event time earlier than W will arrive\". A common strategy is bounded out-of-orderness: W = highest event time seen minus an allowed delay, say 10 seconds. When the watermark passes the end of a window, the window fires and emits its result. Events that arrive after that are <b>late</b>: you can drop them, send them to a side output for later correction, or keep the window open for an <em>allowed lateness</em> period and emit an updated result. A longer delay means more complete results but higher latency; that trade-off is yours to state." },
        { t: "h", text: "Window types" },
        { t: "diagram", caption: "Tumbling windows never overlap, sliding windows overlap so one event counts in several, and session windows are sized by gaps in a user's activity.", code: `flowchart TD
  subgraph TW["Tumbling, size 1 min"]
    T1["12:00 to 12:01"] --> T2["12:01 to 12:02"] --> T3["12:02 to 12:03"]
  end
  subgraph SW["Sliding, size 2 min, slide 1 min"]
    S1["12:00 to 12:02"] --> S2["12:01 to 12:03"] --> S3["12:02 to 12:04"]
  end
  subgraph SSW["Session, gap 30 min"]
    P1["clicks 9:00 to 9:12"] -->|"idle over 30 min"| P2["clicks 10:05 to 10:20"]
  end` },
        { t: "table", head: ["Window", "Definition", "Each event belongs to", "Typical use"], rows: [
          ["Tumbling", "Fixed size, back to back, no overlap", "Exactly one window", "Clicks per ad per minute, hourly billing totals"],
          ["Sliding (hopping)", "Fixed size, starts every <em>slide</em> interval", "size / slide windows, e.g. 5 min / 1 min = 5", "Moving averages, \"error rate over the last 5 minutes, updated every minute\""],
          ["Session", "Per key, closes after a gap of inactivity", "One session, which may merge with a neighbor", "User sessions on a site, viewing sessions, chat bursts"],
          ["Global", "One window per key forever, with custom triggers", "One window", "Running totals with periodic emission"]
        ] },
        { t: "h", text: "State, checkpoints and exactly-once" },
        { t: "p", html: "A windowed count is <b>state</b>: a counter per key per open window. Flink keeps it in local RocksDB on each worker and periodically takes a consistent <b>checkpoint</b> of all operator state plus the Kafka offsets that produced it, using the Chandy-Lamport style barrier algorithm. After a crash the job restores the last checkpoint and rewinds Kafka to the saved offsets, so internal state is exactly-once. End-to-end exactly-once also needs the sink to cooperate: either transactional writes committed with the checkpoint (Kafka transactions, two-phase commit sinks) or idempotent upserts keyed by <code>(key, window)</code>, so a replayed result overwrites rather than double-counts. Delivery semantics themselves are covered in Chapter 9." },
        { t: "code", lang: "sql", code: `-- Flink SQL: clicks per ad per 1-minute event-time window
CREATE TABLE clicks (
  ad_id STRING, user_id STRING, ts TIMESTAMP(3),
  WATERMARK FOR ts AS ts - INTERVAL '10' SECOND
) WITH ('connector' = 'kafka', 'topic' = 'ad-clicks', 'format' = 'json');

SELECT ad_id, window_start, COUNT(*) AS clicks
FROM TABLE(TUMBLE(TABLE clicks, DESCRIPTOR(ts), INTERVAL '1' MINUTE))
GROUP BY ad_id, window_start, window_end;` },
        { t: "callout", kind: "warn", title: "Watermarks stall on idle partitions", html: "A Flink source's watermark is the minimum across the Kafka partitions it reads. If one partition stops receiving events, its watermark stops advancing and every window waits forever. Configure idleness detection (<code>withIdleness</code>) so idle partitions are ignored, and monitor watermark lag as a first-class metric." }
      ]
    },
    {
      id: "lambda-kappa",
      title: "Lambda vs Kappa architecture",
      minutes: 7,
      blocks: [
        { t: "p", html: "Early stream processors were fast but approximate and lost state on failure; batch was slow but exact. The <b>Lambda architecture</b> (named by Nathan Marz) runs both: a <b>batch layer</b> periodically recomputes accurate views from the immutable master dataset, a <b>speed layer</b> computes recent results from the stream, and a <b>serving layer</b> merges them: batch results for everything up to the last batch run, speed results for the rest." },
        { t: "diagram", caption: "Lambda runs two pipelines over the same events; Kappa drops the batch path and reprocesses by replaying the log.", code: `flowchart LR
  Src[["Kafka events"]] --> Lake[("Data lake<br/>immutable raw events")]
  Lake --> Batch["Batch layer<br/>Spark, nightly"]
  Src --> Speed["Speed layer<br/>Flink, seconds"]
  Batch --> BV[("Batch views<br/>exact")]
  Speed --> RV[("Realtime views<br/>recent")]
  BV --> Serve["Serving layer<br/>merges both"]
  RV --> Serve
  Src -.->|"Kappa: replay from offset 0<br/>with a new job version"| Speed` },
        { t: "p", html: "The <b>Kappa architecture</b> (named by Jay Kreps) argues that with a replayable log and a stream engine with exactly-once state, the batch layer is redundant. Keep everything in one streaming pipeline. To fix a bug or change logic, start version 2 of the job reading the log from the beginning (long Kafka retention, or tiered storage, or a lake-backed source), let it catch up into a new output table, then switch readers over and delete version 1." },
        { t: "compare", items: [
          { title: "Lambda", pros: ["Batch layer gives exact, auditable numbers", "Easy to reprocess years of history on cheap batch compute", "Tolerates a lossy or approximate speed layer"], cons: ["The same logic is written twice, in two frameworks, and the two drift", "Two systems to operate and a merge layer to maintain"], use: "Billing or financial reporting where the nightly number must be reconciled exactly, or when streaming logic is approximate (sketches, sampled data)." },
          { title: "Kappa", pros: ["One codebase and one set of semantics", "Lower operational burden", "Modern engines provide exactly-once state"], cons: ["Reprocessing a large history through the stream engine can be slow and costly", "Requires long log retention or a replayable lake source"], use: "Most new real-time analytics pipelines, especially when the logic is the same for fresh and historical data." }
        ] },
        { t: "h", text: "Choosing between them" },
        { t: "list", items: [
          "<b>Is the stream logic exact?</b> With event-time windows, checkpointed state and idempotent sinks, yes, and Kappa is enough. If the speed layer uses sampling or sketches, keep a batch layer for exact numbers.",
          "<b>How much history must you reprocess?</b> Replaying a week of Kafka is routine; replaying five years through Flink is slow and expensive, and a Spark job over Parquet in the lake is better at that.",
          "<b>Does the same code serve both?</b> Flink and Spark both run batch and streaming jobs from one API, which reduces the code duplication that made Lambda painful."
        ] },
        { t: "callout", kind: "interview", title: "A good hybrid to propose", html: "A common real answer: stream processing with Flink produces the real-time numbers, and a daily batch reconciliation job over raw events in the lake checks or corrects them. Call that what it is (a Lambda-flavored reconciliation) and justify it with the money involved: advertisers are billed on these counts." }
      ]
    },
    {
      id: "oltp-olap",
      title: "OLTP vs OLAP, warehouses and lakes",
      minutes: 10,
      blocks: [
        { t: "p", html: "<b>OLTP</b> (online transaction processing) is your application database: many small reads and writes touching a few rows by key, with low latency and strong transactional guarantees. <b>OLAP</b> (online analytical processing) answers questions like \"revenue by region by month for 3 years\": few queries, each scanning billions of rows but only a handful of columns. Running analytics on the OLTP primary steals its I/O and buffer cache from user requests, so analytics data is copied into a separate system built for scans." },
        { t: "table", head: ["", "OLTP", "OLAP"], rows: [
          ["Query shape", "Point lookups and small range scans by key", "Aggregations over millions to billions of rows"],
          ["Users", "End users through the application", "Analysts, dashboards, ML pipelines"],
          ["Latency target", "Milliseconds", "Seconds to minutes"],
          ["Data", "Current state, normalized", "History, often denormalized into star schemas"],
          ["Storage layout", "Row-oriented", "Column-oriented"],
          ["Examples", "PostgreSQL, MySQL, DynamoDB", "Snowflake, BigQuery, Redshift, ClickHouse, Druid"]
        ] },
        { t: "h", text: "Why columnar storage wins for analytics" },
        { t: "p", html: "A row store keeps all columns of a row together, which is ideal for \"fetch order 42\". A <b>column store</b> keeps each column in its own file or block. For <code>SELECT region, SUM(amount) FROM orders WHERE year = 2025 GROUP BY region</code> on a 100-column table, a column store reads only 3 columns: roughly 3% of the bytes. Values within a column are similar, so they compress very well (run-length, dictionary and bit-packing encodings often give 5 to 10x), and engines process them with vectorized SIMD loops. Per-block min and max statistics let the engine skip blocks whose year range cannot match. The cost: writing one row touches every column file, so column stores ingest in large batches and are bad at single-row updates." },
        { t: "numbers", items: [
          { value: "~3%", label: "Bytes read when a query uses 3 of 100 columns" },
          { value: "5 to 10x", label: "Typical compression of columnar data" },
          { value: "Parquet, ORC", label: "Open columnar file formats for data lakes" }
        ] },
        { t: "h", text: "Warehouse vs lake vs lakehouse" },
        { t: "compare", items: [
          { title: "Data warehouse", pros: ["Fast SQL, managed, strong governance", "Schema-on-write keeps data clean"], cons: ["Proprietary storage, costly at petabyte scale", "Awkward for raw, semi-structured and ML data"], use: "Business intelligence on curated data: Snowflake, BigQuery, Redshift." },
          { title: "Data lake", pros: ["Cheapest storage: open files on S3 or GCS", "Holds anything: raw logs, images, Parquet", "Many engines can read it: Spark, Trino, Presto"], cons: ["Schema-on-read: easily becomes a data swamp", "No transactions or updates on plain files"], use: "Raw event archive, ML training data, the replay source for reprocessing." },
          { title: "Lakehouse", pros: ["ACID transactions, schema enforcement and time travel on lake files", "Upserts and deletes, important for GDPR erasure", "One copy serves BI and ML"], cons: ["Table formats and compaction add operational work", "Interactive latency can trail a tuned warehouse"], use: "Unifying lake and warehouse: Delta Lake, Apache Iceberg, Apache Hudi on object storage." }
        ] },
        { t: "h", text: "ETL vs ELT" },
        { t: "p", html: "<b>ETL</b> (extract, transform, load) transforms data in a separate engine before loading it into the warehouse; it made sense when warehouse compute was scarce and expensive. <b>ELT</b> loads raw data first and transforms it inside the warehouse with SQL, typically managed with dbt. Elastic cloud warehouses made ELT the default: raw data is preserved, so a transformation bug is fixed by rerunning SQL rather than re-extracting from source systems. ETL still fits when data must be cleaned or masked before it lands, for example stripping PII for compliance." },
        { t: "callout", kind: "example", title: "Real-time OLAP at LinkedIn and Uber", html: "Real-time OLAP stores such as Apache Druid, Apache Pinot and ClickHouse sit between streams and dashboards: they ingest from Kafka continuously and answer aggregation queries in sub-second time. Apache Pinot was created at LinkedIn to power user-facing analytics such as \"who viewed your profile\", and Uber also runs Pinot for real-time analytics." },
        { t: "callout", kind: "tip", title: "The pipeline shape to draw", html: "OLTP database to CDC (Debezium) to Kafka, then two consumers: a stream job feeding a real-time OLAP store for dashboards, and a sink writing Parquet to the lake for batch and ML. That one diagram covers most \"add analytics to this system\" follow-ups." }
      ]
    }
  ],
  takeaways: [
    "Block storage is a raw disk for one host, file storage is a shared POSIX tree, object storage is an HTTP key to blob store that scales without limit and is cheapest per GB.",
    "Object stores split a strongly consistent metadata service from a bulk data service; durability comes from multi-zone placement, checksums, scrubbing and fast repair.",
    "3x replication costs 200% overhead and survives 2 losses; RS(6,3) erasure coding costs 50% and survives any 3, at the price of CPU and costly repairs. Replicate hot data, erasure-code cold data.",
    "Upload large media straight from the client to object storage with presigned URLs and multipart upload; your servers only handle metadata.",
    "An inverted index maps each analyzed term to a sorted postings list; queries intersect lists, and positions enable phrase matching.",
    "BM25 is the default relevance function: IDF weighting, saturating term frequency and document-length normalization.",
    "Elasticsearch is near-real-time (refresh about every 1 s), routes documents by hash modulo a fixed primary shard count, and should be fed from the database by CDC, never treated as the source of truth.",
    "Use event time, not processing time, for windowed aggregation; watermarks decide when a window is complete and how late data is handled.",
    "Tumbling windows do not overlap, sliding windows put each event in size/slide windows, session windows close after an inactivity gap.",
    "Columnar storage reads only the columns a query touches and compresses well, which is why OLAP engines and Parquet use it; ELT on a lakehouse is the modern default."
  ],
  mcqs: [
    { q: "A social app stores user-uploaded videos, up to 2 GB each, which are written once and read many times through a CDN. Which storage fits best?", options: ["Block storage volumes attached to the app servers", "A shared NFS file system mounted on every app server", "Object storage such as S3, used as the CDN origin", "Blob columns in the PostgreSQL primary database"], answer: 2, explain: "Write-once, read-many blobs are exactly what object storage is built for: unlimited scale, low cost per GB and native CDN origin support. Block volumes attach to one host and NFS adds cost and a shared bottleneck without any benefit for immutable files.", level: "easy" },
    { q: "Your object store uses Reed-Solomon RS(6,3) erasure coding. What are the raw storage overhead and the number of fragment losses an object survives?", options: ["1.5x raw storage, survives any 3 lost fragments", "3x raw storage, survives any 2 lost fragments", "1.5x raw storage, survives exactly 1 lost fragment", "2x raw storage, survives any 6 lost fragments"], answer: 0, explain: "RS(6,3) stores 6 data plus 3 parity fragments, each 1/6 of the object, so 9/6 = 1.5x, and any 6 of the 9 rebuild it, so any 3 can be lost. The 3x / 2 losses figures describe triple replication.", level: "medium" },
    { q: "Why do media apps hand clients a presigned URL instead of proxying uploads through the API servers?", options: ["Presigned URLs encrypt the file end to end, so the cloud provider can never read its contents", "The bytes go straight to object storage, so app servers and their bandwidth stay out of the data path", "Presigned URLs make the upload strongly consistent where a proxied upload would be eventually consistent", "Object stores accept multipart uploads only from browsers, so servers cannot write large objects"], answer: 1, explain: "A presigned URL is a time-limited, key-scoped signature that lets the client talk to the object store directly, keeping large transfers off your fleet. It is about authorization and offloading, not encryption or consistency.", level: "easy" },
    { q: "What does an inverted index map?", options: ["Each document id to the list of terms it contains, in order", "Each document id to the disk page and byte offset where it is stored", "Each search query to a cached, pre-ranked list of matching documents", "Each term to the list of documents, and positions, where it appears"], answer: 3, explain: "An inverted index goes from term to postings list, which is what makes \"which documents contain X\" fast. The document-to-terms direction is the forward index, which is what you would have to scan without it.", level: "easy" },
    { q: "A user creates a product and, 200 ms later, searches for it in Elasticsearch but gets no hit. A second later it appears. What explains this?", options: ["The document is not searchable until the next refresh, which runs every 1 s by default", "The write went to a replica shard that had not yet forwarded it to the primary", "The translog was not yet fsynced, so the write was lost and retried 1 s later", "BM25 scores brand-new documents as zero until IDF statistics are recomputed"], answer: 0, explain: "Elasticsearch is near-real-time: writes are durable in the translog immediately but only searchable after a refresh opens a new segment. Writes always go to the primary first, so the replica explanation is backwards.", level: "medium" },
    { q: "Your team wants to raise an existing Elasticsearch index from 5 to 8 primary shards in place. Why is this not a simple setting change?", options: ["Lucene segments are encrypted with a per-shard key, and existing segments cannot be re-keyed", "The new primaries would be promoted from existing replicas, which risks a split-brain election", "Documents are placed by hash(routing) mod the primary shard count, so a new count remaps them", "Elasticsearch embeds the shard count in every document's _id, so all ids would have to change"], answer: 2, explain: "Routing is hash(routing) % number_of_primary_shards, so a new count would make lookups go to the wrong shard. You reindex into a new index (or use split/shrink, which only works with multiples or factors) and swap an alias.", level: "hard" },
    { q: "Orders live in PostgreSQL and must be searchable in Elasticsearch. Developers occasionally see search results that are older than the database row. What is the most robust fix?", options: ["Dual-write from the app in one try/catch, writing to Elasticsearch first and PostgreSQL second", "Use CDC into Kafka keyed by order id, and index with the row version as the external version", "Lower refresh_interval from 1 s to 10 ms so new documents become searchable sooner", "Add more replicas and use adaptive replica selection so searches avoid stale copies"], answer: 1, explain: "CDC makes the database log the single source of truth, per-key Kafka partitions keep updates in order, and external versioning rejects any stale write that arrives late. Reordering dual writes still leaves partial failures and races.", level: "medium" },
    { q: "Compared with classic TF-IDF, what does BM25 change?", options: ["It ignores document frequency and only counts term occurrences", "It ranks by recency and click-through rate instead of term statistics", "It requires training a learning-to-rank model on each index's click logs", "It saturates term frequency and normalizes scores by document length"], answer: 3, explain: "BM25 keeps IDF but caps the benefit of repeated terms (k1) and penalizes long documents relative to the average (b). Recency or click signals are business layers added on top, not part of BM25.", level: "medium" },
    { q: "A clicks-per-minute dashboard shows a dip followed by a big spike right after the stream job recovered from a 5-minute outage. What is the likely cause and fix?", options: ["Kafka dropped messages during the outage; fix it by enabling acks=all", "The job had too few partitions; add partitions so the backlog drains faster", "Windows were assigned by processing time; assign them by event time with a watermark", "The sink double-wrote results on recovery; switch it to at-most-once delivery"], answer: 2, explain: "With processing-time windows, the backlog consumed after recovery lands in the recovery minute, creating a false dip and spike. Event-time windows put each click in the minute it actually happened.", level: "medium" },
    { q: "A sliding window has size 10 minutes and slide 1 minute. How many window instances does each event contribute to?", options: ["10", "1", "11", "It depends on the gap between events"], answer: 0, explain: "A sliding window of size S with slide L puts each event in S / L windows, here 10. One window per event describes tumbling windows; gap-based membership describes session windows.", level: "hard" },
    { q: "A Flink job reading a 32-partition Kafka topic has stopped emitting any windows, although events keep arriving on most partitions. What is the most likely cause?", options: ["The checkpoint interval exceeds the window size, so windows are discarded before they fire", "Idle partitions stop advancing their watermarks, which holds back the minimum watermark", "The window operator's parallelism is below the partition count, so its windows never fire", "RocksDB state outgrew memory, so the job silently fell back to processing-time windows"], answer: 1, explain: "A source's watermark is the minimum over its partitions, so a partition with no traffic pins it in the past and no event-time window can close. Enabling idleness detection excludes idle partitions.", level: "hard" },
    { q: "Analysts run <code>SUM(amount) GROUP BY region</code> over 5 billion rows of a 200-column table. Why is a columnar warehouse far faster than the row-store OLTP database?", options: ["It keeps every table fully in RAM, so the 5 billion rows never touch the disk", "It precomputes every GROUP BY at load time, so the query is just a lookup", "It samples about 1% of the rows and returns an approximate SUM with an error bound", "It reads only the columns used, which compress well and scan with vectorized code"], answer: 3, explain: "Reading 2 of 200 columns cuts I/O by about 100x before compression, and similar values in a column compress 5 to 10x. Row stores read entire rows even when the query needs two fields.", level: "medium" },
    { q: "In a Kappa architecture, how do you deploy a bug fix that must also correct historical results?", options: ["Run a separate nightly Spark batch job over the archive that recomputes and overwrites history", "Replay the retained log through the fixed job into a new output, then switch readers to it", "Deploy the fix in place and patch the old output rows with one-off SQL UPDATE scripts", "Raise the watermark delay to cover the history so old events flow through the fixed job"], answer: 1, explain: "Kappa reprocesses by replaying the retained log through the same streaming code, then cutting over. A separate batch job for history is exactly the Lambda approach Kappa avoids.", level: "medium" },
    { q: "What is the defining difference between ETL and ELT?", options: ["ELT loads raw data into the warehouse first and transforms it there with SQL", "ETL is used for streaming sources, while ELT is used only for nightly batch loads", "ELT works only with structured tables, so JSON must be flattened before it is loaded", "ETL keeps raw data in the warehouse and transforms it later with SQL"], answer: 0, explain: "In ELT the warehouse does the transformation, so the raw data is kept and transformations can be rerun. ETL transforms before loading, which is still useful when data must be masked before it lands.", level: "easy" },
    { q: "A MapReduce job that joins page views with users finishes 199 of 200 reduce tasks in 5 minutes, but the last one runs for 2 hours. What is the most likely cause and fix?", options: ["One node has a failing disk; enable speculative execution so the task reruns elsewhere", "The combiner is too aggressive and merges distinct keys; disable the combiner", "Key skew from one hot key; salt that key or broadcast the smaller side of the join", "Too few mappers; increase the input split count so map output arrives sooner"], answer: 2, explain: "One straggling reducer usually means one key (a bot user, a null id) carries a disproportionate share of values. Speculative execution reruns the same overloaded task elsewhere and does not help.", level: "hard" }
  ],
  design: [
    {
      id: "design-log-search",
      title: "Design a log search system (like ELK)",
      level: "Medium",
      prompt: "Design a centralized logging platform for a company running about 5,000 services across 20,000 hosts. Engineers must be able to search logs by free text and by fields (service, level, trace id, host) within seconds of the log being written, and keep logs searchable for 14 days and archived for 1 year.",
      clarify: [
        "What is the ingest volume: log lines per second at peak and average line size?",
        "How fresh must search be: seconds, or is a minute of lag acceptable?",
        "What retention is needed for hot search versus cheap archive, and is there a compliance requirement?",
        "Are logs structured (JSON) or free text, and which fields are commonly filtered on?",
        "What query patterns dominate: needle-in-haystack by trace id, free-text error search, or aggregations for dashboards?",
        "Is it acceptable to drop or sample debug logs under extreme load, or must every line be kept?",
        "Do we need per-team access control or PII redaction?"
      ],
      hints: [
        "Never let the log pipeline put backpressure on the applications that produce logs. What sits between the agents and the indexer?",
        "Indexing is the expensive step. Think about how you partition indices so that writing, searching and deleting by age are all cheap.",
        "Recent logs are searched far more than old ones. How would you place data on hardware by age?",
        "Consider time-based indices (one per day), a hot-warm-cold tier layout, and deleting whole indices instead of documents.",
        "For one-year retention, archive compressed raw logs to object storage and only rehydrate them when someone needs them."
      ],
      solution: [
        { t: "h", text: "Requirements" },
        { t: "list", items: [
          "<b>Functional:</b> ingest logs from all hosts; full-text and field search; filter by time range; aggregations (errors per service per minute); tail live logs; 14-day hot search, 1-year archive.",
          "<b>Non-functional:</b> searchable within ~10 s of emission; ingest must never block applications; tolerate node loss without losing acknowledged logs; queries over the last hour return in under 2 s; cost-efficient at many TB per day."
        ] },
        { t: "h", text: "Estimates" },
        { t: "list", items: [
          "20,000 hosts x 50 lines/s average = 1M lines/s average; peak 3x = 3M lines/s.",
          "Average line 500 bytes, so 1M x 500 B = 500 MB/s, about 43 TB/day raw (500 MB/s x 86,400 s).",
          "Indexed in Elasticsearch with one replica, roughly 1.2x raw per copy after indexing overhead: 43 x 1.2 x 2 = about 100 TB/day; 14 days = about 1.4 PB of hot and warm index storage.",
          "Archive: compressed about 8x with zstd to object storage: 43 / 8 = about 5.4 TB/day, 365 days = about 2 PB, cheap in infrequent-access or archive storage classes.",
          "Kafka buffer: 500 MB/s with 3 replicas, 24 h retention = 500 MB x 86,400 x 3 = about 130 TB across the Kafka cluster.",
          "If one indexing node sustains about 20 MB/s of raw log ingest, peak 1.5 GB/s needs about 75 nodes for primaries, about 150 hot nodes once the replica copy is indexed too, plus headroom."
        ] },
        { t: "h", text: "API" },
        { t: "code", lang: "http", code: `POST /v1/logs/search
{ "query": "timeout AND level:ERROR AND service:checkout",
  "from": "2026-10-22T10:00:00Z", "to": "2026-10-22T11:00:00Z",
  "limit": 100, "search_after": null }
-> 200 { "hits": [...], "next": "opaque-cursor", "took_ms": 840 }

POST /v1/logs/aggregate
{ "query": "level:ERROR", "group_by": "service", "interval": "1m", "from": "...", "to": "..." }

GET /v1/logs/tail?query=service:checkout     (SSE stream of new matching lines)

POST /v1/archive/restore
{ "from": "2026-03-01", "to": "2026-03-02", "service": "checkout" }  -> 202 { "job_id": "r-91" }` },
        { t: "h", text: "Data model" },
        { t: "table", head: ["Field", "Mapping", "Why"], rows: [
          ["@timestamp", "date", "Every query has a time range; also drives index selection"],
          ["service, env, host, level", "keyword", "Exact filters and aggregations"],
          ["trace_id, request_id", "keyword", "Needle lookups to correlate with traces"],
          ["message", "text, standard analyzer", "Full-text search"],
          ["attrs.*", "flattened or a few mapped keywords", "Arbitrary JSON fields without a mapping explosion"]
        ] },
        { t: "p", html: "Indices are per day and per tenant group, e.g. <code>logs-checkout-2026.10.22</code>, behind an alias or data stream. Elasticsearch (or OpenSearch) is the search tier because it provides the inverted index, field aggregations and shard distribution out of the box. Raw logs are also archived as compressed newline-delimited JSON or Parquet in S3, partitioned by <code>date/service/hour</code>." },
        { t: "h", text: "High-level design" },
        { t: "diagram", caption: "Kafka decouples bursty producers from indexing, and the archive path reads the same topic independently of Elasticsearch.", code: `flowchart LR
  Apps["Apps on 20k hosts"] --> Agent["Local agent<br/>Fluent Bit or Vector"]
  Agent -->|"batched, compressed"| K[["Kafka topic logs<br/>partitioned by service"]]
  K --> Idx["Indexer workers<br/>parse, redact, bulk index"]
  K --> Arch["Archiver<br/>compress to Parquet"]
  Idx --> Hot[("Elasticsearch hot tier<br/>NVMe, last 2 days")]
  Hot -.->|"ILM moves to warm after 2 days"| Warm[("Warm tier<br/>HDD, days 3 to 14")]
  Arch --> S3[("Object storage<br/>1 year archive")]
  Q["Query service<br/>auth, limits"] --> Hot
  Q --> Warm
  U(("Engineer")) --> Q` },
        { t: "p", html: "<b>Write path:</b> a lightweight agent on each host tails log files, adds host metadata, batches and compresses, and ships to Kafka. If Kafka is slow the agent buffers to local disk and eventually drops debug lines, never blocking the app. Indexer workers consume, parse and enrich (service, level, trace id), redact secrets and PII, and send <code>_bulk</code> requests of a few MB each. The archiver independently writes hourly compressed files to S3. <b>Read path:</b> the query service checks the user's permissions, rewrites the time range into the set of daily indices to hit, enforces a timeout and result limit, and runs the search. Old data is queried by restoring archive files into a temporary index or querying Parquet with Trino or Athena." },
        { t: "h", text: "Deep dives" },
        { t: "p", html: "<b>Index lifecycle and tiering.</b> Daily indices make retention free: deleting a 14-day-old index drops whole files instead of marking billions of documents as deleted, which would cost huge merge I/O. Index lifecycle management rolls an index over at a size or age limit, moves it from hot NVMe nodes to warm HDD nodes after 2 days, force-merges it to a single segment once it is read-only (faster searches, less heap), and deletes it at day 14. Most queries are about the last hour, so the hot tier carries most of the read load with a small fraction of the data." },
        { t: "p", html: "<b>Shard sizing and noisy services.</b> One index per service per day gives thousands of tiny shards, wasting heap. One giant index makes a chatty service's volume dominate. Group small services into shared indices and give the top few heavy services their own, targeting 20 to 50 GB per shard. Enforce per-service ingest quotas at the indexer; a service that suddenly logs 10x (a debug flag left on) gets sampled or dropped with a metric, rather than degrading search for everyone." },
        { t: "p", html: "<b>Backpressure and durability.</b> Kafka with <code>acks=all</code> and replication factor 3 is the durability point: once Kafka acknowledges, the line will be indexed eventually. If Elasticsearch is slow (merges, a node down), consumer lag grows but nothing is lost, and indexers catch up later. Indexers commit Kafka offsets only after the bulk request succeeds, so delivery is at least once; to avoid duplicates, set the document id to a hash of host, file, offset, so a replayed line overwrites itself. Alert on consumer lag in seconds, because lag is the freshness SLO." },
        { t: "h", text: "Trade-offs and bottlenecks" },
        { t: "list", items: [
          "<b>Full-text index vs cost:</b> indexing every field of every line is the dominant cost. Alternatives like Grafana Loki index only labels (service, host, level) and brute-force scan compressed chunks, trading query speed for much lower ingest cost. A hybrid indexes errors fully and keeps debug logs label-only.",
          "<b>Freshness vs throughput:</b> raising <code>refresh_interval</code> from 1 s to 30 s substantially increases indexing throughput but delays searchability; 5 to 10 s is a reasonable compromise for logs.",
          "<b>Replicas:</b> one replica doubles storage; the warm tier could rely on the S3 archive for recovery instead, accepting slower restore on node loss.",
          "<b>Expensive queries:</b> leading wildcards and month-long regex searches can overload the cluster; the query service needs timeouts, max time range for free-text queries and per-user concurrency limits.",
          "<b>Schema chaos:</b> thousands of teams emitting different JSON keys cause mapping explosion; use a flattened field type or an allowlist of mapped attributes."
        ] }
      ],
      followups: [
        "How would you support live tail across 20,000 hosts without polling Elasticsearch every second?",
        "A team accidentally logs credit card numbers. How do you detect, redact and purge them from hot indices and the archive?",
        "How would you cut indexing cost by 70% if most logs are never searched?",
        "How do you correlate a log search with distributed traces and metrics for the same request?",
        "How would the design change for multiple regions with data-residency rules?"
      ]
    },
    {
      id: "design-ad-click-aggregation",
      title: "Design an ad-click aggregation system",
      level: "Hard",
      prompt: "Design a system that ingests ad click events and produces click counts per ad per minute, available to advertiser dashboards within about a minute and accurate enough to bill advertisers. It should also answer \"top 100 most-clicked ads in the last N minutes\" and support filtering by country and device.",
      clarify: [
        "What is the click volume per day and at peak, and how many active ads are there?",
        "How fresh must dashboards be, and how accurate: is approximate fine for dashboards if billing is exact?",
        "How late can events arrive (mobile clients offline, retries), and how long do we keep correcting a minute?",
        "Do we need to filter bot or duplicate clicks, and what defines a duplicate?",
        "Which dimensions do queries filter on: country, device, campaign, advertiser?",
        "How long do we keep minute-level data, and can older data be rolled up to hours or days?",
        "Do billing numbers need an audit trail back to raw events?"
      ],
      hints: [
        "Separate the raw click log (the source of truth) from the aggregated counts (a derived view). Where does each live?",
        "Count by event time, not arrival time. What decides when a minute is closed, and what happens to a click that arrives 3 minutes late?",
        "Retries and replays will deliver the same click twice. How do you make counting idempotent?",
        "Think about a stream job keyed by ad id with 1-minute tumbling windows, a watermark, and an upsert sink keyed by ad and minute.",
        "For billing, add a daily batch reconciliation over the raw events in the lake that recomputes and corrects the minute totals."
      ],
      solution: [
        { t: "h", text: "Requirements" },
        { t: "list", items: [
          "<b>Functional:</b> record every click; clicks per ad per minute; filter by country and device; top 100 ads over the last 1, 5 or 60 minutes; deduplicate repeated clicks; queryable history for billing.",
          "<b>Non-functional:</b> dashboard latency under ~1 minute from click; billing totals exact (no loss, no double count); tolerate events up to several minutes late; survive node failures without wrong numbers; horizontally scalable to 10x growth."
        ] },
        { t: "h", text: "Estimates" },
        { t: "list", items: [
          "1B clicks/day: 10^9 / 10^5 s = about 10,000 clicks/s average; peak 5x = 50,000/s.",
          "Raw event about 200 bytes (click id, ad id, user id, timestamp, IP, country, device): 10^9 x 200 B = 200 GB/day raw, about 73 TB/year before compression.",
          "2M active ads; at most 2M x 1,440 minutes = 2.9B minute rows/day if every ad got clicks every minute, but realistically ~10% are active per minute: about 290M rows/day of roughly 50 bytes = about 15 GB/day of aggregates, more with country/device breakdowns.",
          "Kafka: 50,000/s x 200 B = 10 MB/s at peak, which is modest; 32 to 64 partitions give room for parallel consumers and growth."
        ] },
        { t: "h", text: "API" },
        { t: "code", lang: "http", code: `GET /v1/click?ad_id=ad-42&imp=i-81c   (the user's tap hits the click redirect service)
-> 302 Location: advertiser landing page
   event produced to Kafka: { "click_id": "c-7f3a", "ad_id": "ad-42", "user_id": "u-9",
     "ts": "2026-10-22T10:01:07.123Z", "country": "IN", "device": "android" }

GET /v1/ads/ad-42/clicks?from=2026-10-22T10:00Z&to=2026-10-22T11:00Z&granularity=1m&country=IN
-> 200 { "series": [ { "minute": "10:00", "clicks": 512 }, ... ] }

GET /v1/ads/top?window=5m&limit=100&country=IN
-> 200 { "window_end": "10:05", "ads": [ { "ad_id": "ad-42", "clicks": 9120 }, ... ] }` },
        { t: "h", text: "Data model" },
        { t: "table", head: ["Store", "Schema", "Why this store"], rows: [
          ["Kafka topic <code>clicks</code>", "Raw click event, key = ad_id", "Durable, replayable buffer; per-ad ordering for the aggregator"],
          ["Object storage lake", "Parquet partitioned by date and hour", "Cheap immutable source of truth for reconciliation and audits"],
          ["Real-time OLAP store such as Apache Pinot, Druid or ClickHouse", "<code>(ad_id, minute, country, device) -> clicks</code>, upsert on that key", "Sub-second group-by and time-range queries; ingests from Kafka"],
          ["Redis", "Sorted set per window: member ad_id, score clicks", "Top-K reads served from memory"]
        ] },
        { t: "h", text: "High-level design" },
        { t: "diagram", caption: "Raw clicks are durable in Kafka and the lake; Flink produces minute aggregates for dashboards while a daily batch job recomputes billing totals from the same raw data.", code: `flowchart LR
  U(("User")) -->|"taps ad"| Redirect["Click redirect service"]
  Redirect -->|"produce, acks all"| K[["Kafka clicks<br/>key ad_id"]]
  K --> Flink["Flink job<br/>dedupe, 1 min tumbling<br/>event time windows"]
  K --> Sink["Lake sink"]
  Sink --> Lake[("S3 Parquet<br/>raw clicks")]
  Flink -->|"upsert ad, minute"| Agg[["Kafka aggregates"]]
  Agg --> OLAP[("Pinot or ClickHouse<br/>minute aggregates")]
  Flink --> TopK[("Redis top K")]
  Lake --> Recon["Daily Spark<br/>reconciliation"]
  Recon -->|"corrections"| OLAP
  Dash(("Dashboard")) --> QS["Query service"]
  QS --> OLAP
  QS --> TopK` },
        { t: "p", html: "<b>Write path:</b> the redirect server assigns a unique <code>click_id</code>, produces the event to Kafka with <code>acks=all</code> and an idempotent producer, and immediately redirects the user. A sink connector writes raw events to the lake every few minutes. <b>Aggregation:</b> a Flink job keyed by <code>ad_id</code> deduplicates by <code>click_id</code>, assigns each click to a 1-minute event-time tumbling window, and emits <code>(ad_id, minute, country, device, count)</code> when the watermark passes the window end. Results go to an aggregates topic that the OLAP store ingests with upsert semantics. <b>Read path:</b> the query service sends time-range and dimension queries to the OLAP store and reads the top-K lists from Redis." },
        { t: "h", text: "Deep dives" },
        { t: "p", html: "<b>Late events and watermarks.</b> Clicks carry the device or server timestamp, and mobile clients may send them minutes late. Use a bounded out-of-orderness watermark of about 15 seconds, so each minute's count is emitted roughly 15 seconds after that minute ends. Set an allowed lateness of 5 minutes: a late click updates the window state and Flink re-emits the corrected count, which the upsert sink overwrites. Clicks later than that go to a side output topic and are folded in by the daily reconciliation. This gives a clear story: dashboards are fast and nearly complete, billing is exact." },
        { t: "p", html: "<b>Exactly-once counts.</b> Duplicates come from three places: the user double-clicking, client retries, and replays after a failure. A per-key dedupe state of seen <code>click_id</code>s with a TTL of about 10 minutes (Flink keyed state, or a Bloom filter per window for memory efficiency) removes client duplicates. Flink checkpoints window state together with Kafka offsets, so a crash rewinds both consistently. Because each output row is keyed by <code>(ad_id, minute, country, device)</code> and written as an upsert, replaying a window rewrites the same value instead of adding to it. Avoid sinks that do <code>count = count + n</code>, which double-count on replay." },
        { t: "p", html: "<b>Hot ads and top-K.</b> A viral ad can take 5% of all clicks, overloading the single Flink subtask that owns its key. Pre-aggregate in two stages: first key by <code>(ad_id, random 0..9)</code> and count locally for the minute, then re-key by <code>ad_id</code> and sum the 10 partial counts. For top 100 over the last N minutes, each window's per-ad counts feed a top-K operator that keeps a min-heap of size 100 and writes the result to a Redis sorted set per window; 5- and 60-minute views use sliding windows or merge the minute lists. Approximate structures such as Count-Min Sketch (Chapter 14) work if exactness is not required for top-K." },
        { t: "h", text: "Trade-offs and bottlenecks" },
        { t: "table", head: ["Decision", "Chosen", "Alternative and why not"], rows: [
          ["Time semantics", "Event time with watermark", "Processing time is simpler but outages and lag move clicks into wrong minutes"],
          ["Architecture", "Kappa stream plus daily reconciliation", "Pure Lambda duplicates logic; pure Kappa has no independent audit for billing"],
          ["Watermark delay", "15 s plus 5 min allowed lateness", "Longer delay means more complete first results but slower dashboards"],
          ["Aggregate store", "Real-time OLAP with upserts", "Cassandra counters are not idempotent on replay; a relational DB struggles with billions of rows"],
          ["Dedupe", "click_id keyed state with TTL", "Global dedupe table in a database adds a network write per click at 50k/s"]
        ] }
      ],
      followups: [
        "How would you detect and exclude click fraud from bots before it reaches billing counts?",
        "An advertiser disputes a bill. How do you prove the count from raw data?",
        "How would you change the design to support arbitrary group-by dimensions chosen by the advertiser?",
        "What happens if the Flink job is down for 2 hours, and how does it catch up without breaking the dashboards?",
        "How would you run this in two regions so a regional outage does not lose clicks or double-count them?"
      ]
    }
  ]
};
