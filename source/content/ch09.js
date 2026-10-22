module.exports = {
  id: "messaging",
  num: 9,
  part: 4,
  title: "Message Queues, Streams and Event-Driven Design",
  tagline: "Decouple services in time and space without losing, duplicating or reordering work.",
  level: "Intermediate",
  lessons: [
    {
      id: "sync-vs-async",
      title: "Sync vs async: what a queue buys you",
      minutes: 8,
      blocks: [
        { t: "p", html: "Services talk in two basic ways. In <b>synchronous</b> communication (HTTP, gRPC) the caller sends a request and waits for the response; caller and callee must both be up at the same moment, and the caller's latency includes the callee's. In <b>asynchronous</b> communication the sender hands a message to a <b>broker</b> (RabbitMQ, Kafka, Amazon SQS) and moves on; a consumer picks it up later, possibly seconds later, possibly after a restart. The broker stores the message durably in between." },
        { t: "diagram", caption: "In the synchronous chain every service must be up and fast for checkout to succeed; with a queue, checkout depends only on the order write and the broker.", code: `flowchart LR
  subgraph S1["Synchronous chain"]
    U1(("User")) --> A1["Checkout API"]
    A1 -->|"wait"| E1["Email service"]
    A1 -->|"wait"| L1["Loyalty points"]
    A1 -->|"wait"| W1["Warehouse API"]
  end
  subgraph S2["With a queue"]
    U2(("User")) --> A2["Checkout API"]
    A2 -->|"publish OrderPlaced"| Q[["Broker"]]
    Q -.-> E2["Email service"]
    Q -.-> L2["Loyalty points"]
    Q -.-> W2["Warehouse sync"]
  end` },
        { t: "h", text: "What a queue buys you" },
        { t: "list", items: [
          "<b>Decoupling.</b> The producer does not know who consumes, how many consumers exist, or where they run. Adding a fraud-analytics consumer next month requires no change to checkout.",
          "<b>Buffering.</b> If the email service is down for 20 minutes, messages wait in the broker instead of failing checkout. When it recovers, it works through the backlog.",
          "<b>Load leveling.</b> A flash sale may produce 10,000 orders per second for two minutes, while the warehouse integration can only handle 1,000 per second. The queue absorbs the spike and the consumer drains it at a steady rate, so you size consumers for the average, not the peak.",
          "<b>Fan-out.</b> One published event can feed many independent consumers, each at its own pace.",
          "<b>Retries for free.</b> A message that fails processing stays in the broker and is redelivered, instead of the caller writing retry loops."
        ] },
        { t: "numbers", items: [
          { value: "99.5%", label: "Availability of 5 synchronous dependencies at 99.9% each" },
          { value: "600k", label: "Backlog after 10 min of 2,000 msg/s in vs 1,000 msg/s out" },
          { value: "~10 min", label: "Time to drain that backlog once input drops to 0 at 1,000 msg/s" }
        ] },
        { t: "p", html: "The availability figure is the series rule: 0.999 to the fifth power is about 0.995, roughly 3.6 hours of downtime a month instead of 43 minutes. The backlog figure is the load-leveling arithmetic you should do aloud in an interview: backlog grows at (arrival rate minus processing rate) and drains at (processing rate minus arrival rate). If the backlog can exceed what the broker retains, or the resulting delay is unacceptable, you need more consumers, not just a queue." },
        { t: "h", text: "What it costs" },
        { t: "table", head: ["Cost", "Why", "Mitigation"], rows: [
          ["No immediate answer", "The caller gets 'accepted', not the result", "Return 202 with a status resource, push the result by WebSocket or a callback"],
          ["Eventual consistency", "Downstream state lags the producer by milliseconds to minutes", "Design the UI for pending states; read your own writes from the source"],
          ["Duplicates and reordering", "Brokers redeliver after failures; parallel consumers finish out of order", "Idempotent consumers, partition keys for ordering (lessons 3 and 5)"],
          ["Harder debugging", "A request becomes a chain of messages across services", "Correlation IDs in message headers, distributed tracing (Chapter 13)"],
          ["Another system to run", "The broker needs capacity planning, monitoring and upgrades", "Managed services: Amazon MSK, Confluent Cloud, SQS"]
        ] },
        { t: "callout", kind: "warn", title: "Don't queue what the user is waiting for", html: "If the user needs the result to continue (login, 'is this seat available', a search query), keep the call synchronous and make it fast. Putting a queue in the middle of a request the user is blocked on just adds latency and failure modes. Queue the work that can happen after the response: emails, thumbnails, indexing, analytics, payouts." },
        { t: "callout", kind: "interview", title: "How to justify a queue", html: "Name the specific benefit: 'Sending the receipt is not on the critical path, so checkout publishes OrderPlaced and the email worker consumes it. If the email provider is down, orders still succeed and emails catch up.' Then name the cost you accept: 'the email may arrive a few seconds late, and the worker must deduplicate because delivery is at least once.'" }
      ]
    },
    {
      id: "queues-vs-pubsub",
      title: "Point-to-point vs pub/sub, and choosing a broker",
      minutes: 10,
      blocks: [
        { t: "p", html: "Two consumption models cover most uses. In a <b>point-to-point queue</b>, each message is delivered to <em>one</em> of the consumers reading the queue; adding consumers adds parallel workers that share the load (the <b>competing consumers</b> pattern). In <b>publish/subscribe</b>, each message goes to <em>every</em> subscriber; adding a subscriber adds a new, independent recipient. Real systems combine them: an event is published to a topic, each subscribing <em>service</em> gets its own copy, and within a service several instances compete for that copy." },
        { t: "diagram", caption: "SNS fans one event out to a queue per service; inside each queue, worker instances compete so each message is processed once per service.", code: `flowchart LR
  P["Order service"] -->|"publish OrderPlaced"| T[["SNS topic order-events"]]
  T --> Q1[["SQS queue email"]]
  T --> Q2[["SQS queue analytics"]]
  T --> Q3[["SQS queue warehouse"]]
  Q1 --> E1["Email worker 1"]
  Q1 --> E2["Email worker 2"]
  Q2 --> A1["Analytics loader"]
  Q3 --> W1["Warehouse worker 1"]
  Q3 --> W2["Warehouse worker 2"]` },
        { t: "p", html: "Distinguish <b>commands</b> from <b>events</b>. A command ('ChargeCard', 'SendEmail') asks one specific handler to do something and may be rejected; it naturally goes on a point-to-point queue owned by that handler. An event ('OrderPlaced', 'PaymentFailed') states a fact that already happened, in past tense; the producer does not care who listens, so it goes on a pub/sub topic. Naming messages this way keeps ownership clear." },
        { t: "h", text: "Two kinds of broker: queues and logs" },
        { t: "compare", items: [
          { title: "Message queue (RabbitMQ, SQS, ActiveMQ)", pros: ["Per-message acknowledgment: a message is removed once processed", "Flexible routing, priorities, per-message TTL and delays", "Scaling consumers is trivial: add workers to the queue"], cons: ["No replay: once acknowledged, a message is gone", "Ordering weakens as soon as several consumers compete", "Each new subscriber needs its own queue and a copy of every message"], use: "Task distribution and job queues: send this email, resize this image, call this webhook." },
          { title: "Log-based stream (Kafka, Kinesis, Pulsar)", pros: ["Messages are retained for days or forever, so consumers can replay", "Many consumer groups read the same data independently at no extra write cost", "Strict ordering per partition at very high throughput"], cons: ["Parallelism is capped by the partition count", "A slow or failing message blocks its whole partition", "Per-message routing, priorities and delays are not built in"], use: "Event streams many services consume, high-volume ingestion, CDC, rebuilding state by replay." }
        ] },
        { t: "table", head: ["", "RabbitMQ", "Apache Kafka", "Amazon SQS", "Amazon SNS"], rows: [
          ["Model", "Broker with exchanges routing to queues", "Partitioned, replicated append-only log", "Managed point-to-point queue", "Managed pub/sub fan-out"],
          ["Consumption", "Broker pushes to consumers, bounded by a prefetch count; ack removes the message", "Consumers pull and track their own offsets; data stays until retention expires", "Consumers poll; a received message is hidden for the visibility timeout, then deleted on success", "Pushes to subscribers: SQS, Lambda, HTTP endpoints, email, SMS"],
          ["Ordering", "Per queue with a single consumer", "Per partition", "Best effort on standard queues; per message group on FIFO queues", "Best effort; FIFO topics feed FIFO queues"],
          ["Replay", "No for classic and quorum queues; yes with RabbitMQ Streams", "Yes, reset offsets to any retained position", "No", "No"],
          ["Routing", "Rich: direct, topic, fanout and headers exchanges", "By topic and partition key only", "None, one queue per purpose", "Subscription filter policies"],
          ["Scale", "Tens of thousands of msg/s per queue", "Millions of msg/s per cluster", "Nearly unlimited on standard queues", "Very high, managed"],
          ["Operations", "Self-run or managed; quorum queues use Raft for replication", "Self-run or managed (MSK, Confluent); partition planning matters", "Fully managed, pay per request", "Fully managed"]
        ] },
        { t: "callout", kind: "tip", title: "A quick decision rule", html: "Need replay, several independent consumers of the same stream, or more than ~100k msg/s with ordering? Kafka (or Kinesis on AWS). Need a job queue with per-message retry, delays and minimal operations on AWS? SQS, with SNS in front for fan-out. Need complex routing (by region, priority, message type) or per-message priorities in your own infrastructure? RabbitMQ." },
        { t: "callout", kind: "example", title: "Kafka at LinkedIn", html: "Kafka was built at LinkedIn to move activity events and logs between systems and was open-sourced in 2011. By 2019 LinkedIn reported running Kafka at more than 7 trillion messages per day." },
        { t: "callout", kind: "interview", title: "Say which model you are using", html: "Interviewers notice when 'queue' and 'topic' are used interchangeably. Be explicit: 'OrderPlaced is an event on a Kafka topic; billing, email and analytics each have their own consumer group. ResizeImage is a command on an SQS queue with ten competing workers.'" }
      ]
    },
    {
      id: "kafka-model",
      title: "Kafka internals: partitions, offsets and consumer groups",
      minutes: 12,
      blocks: [
        { t: "p", html: "A Kafka cluster is a set of <b>brokers</b> (servers). Data is organized into <b>topics</b>, and each topic is split into <b>partitions</b>. A partition is an ordered, append-only log stored on disk as a series of segment files. Every message appended to a partition gets the next sequential <b>offset</b> (0, 1, 2 ...), which identifies it within that partition. Offsets are per partition: offset 42 in partition 0 and offset 42 in partition 1 are unrelated messages." },
        { t: "h", text: "Producers and partition keys" },
        { t: "p", html: "A producer sends each record to a topic with an optional <b>key</b>. If the record has a key, the default partitioner hashes it (murmur2 in the Java client) and takes the result modulo the partition count, so every record with the same key lands in the same partition, in the order it was sent. Records without a key are spread across partitions; since Kafka 2.4 the producer 'sticks' to one partition until the current batch is full or sent, then switches, which gives bigger batches. Producers batch records per partition (tuned with <code>linger.ms</code> and <code>batch.size</code>) and compress whole batches, which is a large part of Kafka's throughput." },
        { t: "code", lang: "text", code: `topic "orders", 3 partitions, key = order_id

partition 0 | off 0: o-17 CREATED | off 1: o-17 PAID   | off 2: o-41 CREATED | ...
partition 1 | off 0: o-23 CREATED | off 1: o-23 PAID   | off 2: o-23 SHIPPED | ...
partition 2 | off 0: o-09 CREATED | off 1: o-55 CREATED | off 2: o-09 PAID    | ...

partition = murmur2("o-23") mod 3 = 1, always, while the count stays 3
all events for o-23 are in partition 1, in send order
no ordering exists between o-17 in partition 0 and o-23 in partition 1` },
        { t: "h", text: "Consumers and consumer groups" },
        { t: "p", html: "Consumers <b>pull</b> records from brokers and track their position, the offset of the next record to read. Consumers that share a <code>group.id</code> form a <b>consumer group</b>: each partition is assigned to exactly one consumer in the group, so the group divides the work. Different groups are fully independent: each has its own offsets and receives every record. Groups periodically <b>commit</b> their offsets to an internal topic, <code>__consumer_offsets</code>, so a replacement consumer resumes where the previous owner stopped." },
        { t: "diagram", caption: "Within a group each partition has exactly one owner; the analytics group reads the same partitions independently, and reading never deletes data.", code: `flowchart LR
  P1["Producer"] --> T0[["orders partition 0"]]
  P1 --> T1[["orders partition 1"]]
  P1 --> T2[["orders partition 2"]]
  subgraph G1["Consumer group billing"]
    B1["Billing consumer 1"]
    B2["Billing consumer 2"]
  end
  subgraph G2["Consumer group analytics"]
    A1["Analytics consumer 1"]
  end
  T0 --> B1
  T1 --> B1
  T2 --> B2
  T0 --> A1
  T1 --> A1
  T2 --> A1` },
        { t: "list", items: [
          "<b>Parallelism is capped by partitions.</b> A group can have at most one active consumer per partition. With 12 partitions, a 13th consumer sits idle.",
          "<b>Rebalancing.</b> When a consumer joins, leaves or misses heartbeats, partitions are reassigned. With the old 'eager' protocol the whole group pauses; cooperative rebalancing (CooperativeStickyAssignor) moves only the affected partitions, static membership (<code>group.instance.id</code>) lets a restarting pod reclaim its partitions without a rebalance, and Kafka 4.0 made a new broker-coordinated group protocol generally available.",
          "<b>Slow processing triggers rebalances.</b> If a consumer does not call poll within <code>max.poll.interval.ms</code> (5 minutes by default), it is removed from the group and its partitions are reassigned, so its in-flight records get processed twice."
        ] },
        { t: "h", text: "Ordering guarantees" },
        { t: "p", html: "Kafka guarantees order <b>within a partition only</b>. There is no global order across a topic's partitions. If you need all events about one entity in order (all updates to order o-23, all moves in one chess game), make that entity's ID the key. If you need total order across everything, you need a single partition, which caps throughput at what one partition and one consumer can do." },
        { t: "h", text: "Retention and compaction" },
        { t: "p", html: "Consuming a record does not delete it. Kafka deletes old data by policy: <b>time-based</b> retention (<code>retention.ms</code>, default 7 days) or <b>size-based</b> retention (<code>retention.bytes</code> per partition, unlimited by default), applied by dropping whole old segments. Because data persists, a new consumer group can read history from the beginning, and a team that ships a bug can reset its offsets and reprocess. The alternative policy, <b>log compaction</b> (<code>cleanup.policy=compact</code>), keeps at least the latest record for every key and discards older ones; a record with a null value (a <b>tombstone</b>) eventually removes the key. A compacted topic is a durable changelog of current state, ideal for rebuilding a cache or a table of user settings." },
        { t: "h", text: "Choosing the key and the partition count" },
        { t: "table", head: ["Key choice", "Ordering you get", "Risk"], rows: [
          ["order_id", "All events of one order in order", "Little risk: high cardinality, even spread"],
          ["customer_id", "All events of one customer in order", "Hot partition if one B2B customer generates 30% of traffic"],
          ["country", "Per-country order", "Severe skew: a handful of keys, a few partitions take most load"],
          ["No key", "None", "Best spread; use it only when order truly does not matter"]
        ] },
        { t: "p", html: "Pick the <b>narrowest key that gives the ordering you need</b>, with high cardinality and no dominant values. For the partition count, divide the target throughput by what one consumer can process: at 50,000 msg/s with consumers that each handle 2,000 msg/s you need at least 25 partitions; choose something like 48 for headroom. Plan the count up front, because <b>adding partitions remaps keys</b>: hash mod 48 differs from hash mod 64, so new records for a key may land in a different partition than its older records, breaking per-key ordering across the change. Kafka never moves existing data, and partitions cannot be removed." },
        { t: "callout", kind: "tip", title: "Why Kafka is fast", html: "Appends and sequential reads are the fastest operations disks have. Kafka leans on the OS page cache instead of its own cache, batches and compresses records end to end, and sends data from page cache to the network socket with zero-copy (<code>sendfile</code>). A consumer that is keeping up usually reads from memory, not disk." },
        { t: "callout", kind: "interview", title: "The questions you will get", html: "'How do you preserve ordering?' Key by the entity ID, and ordering holds per partition. 'How do you scale consumers?' Add consumers up to the partition count. 'What happens when a consumer dies?' The group rebalances, a surviving consumer takes the partition and resumes from the last committed offset, so some records are processed again." }
      ]
    },
    {
      id: "kafka-replication",
      title: "Kafka replication, ISR and acks",
      minutes: 10,
      blocks: [
        { t: "p", html: "Each partition is replicated to <b>replication factor</b> brokers (3 is the common production choice). One replica is the <b>leader</b>; producers write to it and, by default, consumers read from it. The others are <b>followers</b> that continuously fetch from the leader, exactly like consumers. With rack-aware placement the three replicas live in three availability zones, so losing a zone loses at most one copy." },
        { t: "h", text: "In-sync replicas and the high watermark" },
        { t: "p", html: "The <b>in-sync replica set (ISR)</b> is the leader plus every follower that has caught up with the leader's log recently, within <code>replica.lag.time.max.ms</code> (30 seconds by default). A follower that falls behind is removed from the ISR and rejoins once caught up. The <b>high watermark</b> is the offset just past the last record that every ISR member has stored. Records below it are <b>committed</b>: consumers can only read up to the high watermark, so they never see a record that could disappear in a leader failover." },
        { t: "diagram", caption: "With acks=all the leader replies only after every in-sync follower has the batch, so the write survives the loss of any single broker.", code: `sequenceDiagram
  participant P as Producer acks=all
  participant L as Leader broker 1
  participant F1 as Follower broker 2
  participant F2 as Follower broker 3
  P->>L: produce batch, offsets 100 to 109
  Note over L: appends to its log, ISR = 1, 2, 3
  F1->>L: fetch from offset 100
  L-->>F1: records 100 to 109
  F2->>L: fetch from offset 100
  L-->>F2: records 100 to 109
  F1->>L: fetch from offset 110, confirms it has up to 109
  F2->>L: fetch from offset 110, confirms it has up to 109
  Note over L: all ISR members have 109, high watermark moves to 110
  L-->>P: ack, batch committed
  Note over L,F2: consumers can now read offsets 100 to 109` },
        { t: "h", text: "Producer acks" },
        { t: "table", head: ["Setting", "Leader replies when", "Latency", "What can be lost"], rows: [
          ["<code>acks=0</code>", "Immediately; the producer does not wait", "Lowest", "Anything: a dropped request or broker crash loses data silently"],
          ["<code>acks=1</code>", "The leader has appended to its own log", "Low", "Acknowledged records if the leader dies before followers copy them"],
          ["<code>acks=all</code> (default since Kafka 3.0)", "Every current ISR member has the records", "Highest, one extra replication round trip", "Nothing while at least one ISR member survives, subject to <code>min.insync.replicas</code>"]
        ] },
        { t: "p", html: "<code>acks=all</code> has a trap: 'all' means all <em>current</em> ISR members. If both followers have dropped out, the ISR is just the leader, and acks=all degrades to acks=1. <b><code>min.insync.replicas</code></b> closes the gap. With replication factor 3 and <code>min.insync.replicas=2</code>, a write with acks=all succeeds only if at least two replicas have it; if the ISR shrinks to one, the leader rejects acks=all writes with a NotEnoughReplicas error. That is a deliberate CP choice (Chapter 8): the partition becomes unavailable for writes rather than accepting writes that a single failure could destroy. Reads of already-committed data continue." },
        { t: "h", text: "Leader failure" },
        { t: "steps", items: [
          { title: "Detect", html: "The controller (a Raft-based KRaft quorum in modern Kafka; ZooKeeper in older versions) notices the broker has stopped heartbeating." },
          { title: "Elect", html: "For each partition the dead broker led, the controller picks a new leader from the ISR, so every committed record is preserved." },
          { title: "Fence", html: "The leader epoch is incremented. Requests carrying the old epoch are rejected, so a zombie ex-leader cannot get new writes committed." },
          { title: "Truncate", html: "When the old leader returns as a follower, it truncates any uncommitted records beyond the new leader's log and catches up." },
          { title: "Clients redirect", html: "Producers and consumers refresh metadata and continue with the new leader, usually within seconds." }
        ] },
        { t: "callout", kind: "warn", title: "Unclean leader election trades data for availability", html: "If every ISR member is dead, the partition is offline. Setting <code>unclean.leader.election.enable=true</code> lets an out-of-sync replica become leader, bringing the partition back at the cost of silently losing every committed record that replica lacked. It has been off by default since Kafka 0.11. Leave it off for business data; turning it on can make sense for metrics where availability matters more than completeness." },
        { t: "callout", kind: "tip", title: "Durability comes from replication, not fsync", html: "Kafka acknowledges writes once they are in the page cache of the ISR brokers; it does not fsync each message by default. The bet is that three brokers in three zones will not all lose power before the OS flushes. The standard durable configuration is replication factor 3, <code>min.insync.replicas=2</code>, <code>acks=all</code>, and unclean election disabled." },
        { t: "callout", kind: "interview", title: "Explaining Kafka durability", html: "'Each partition has three replicas in three zones. Producers use acks=all with min.insync.replicas=2, so an acknowledged write is on at least two brokers and survives any single failure. If two replicas are down, writes to that partition fail rather than risk loss. Consumers read only up to the high watermark, so they never see a record that a failover could remove.'" }
      ]
    },
    {
      id: "delivery-semantics",
      title: "Delivery semantics and exactly-once",
      minutes: 12,
      blocks: [
        { t: "p", html: "Every consumer does two things for each message: <b>process</b> it (apply its effect) and <b>record progress</b> (ack it or commit its offset). A crash can happen between the two, and the order you choose decides the guarantee." },
        { t: "table", head: ["Semantics", "How it arises", "Failure outcome", "Typical use"], rows: [
          ["At-most-once", "Commit the offset, then process", "Crash after commit: the message is never processed", "Metrics or logs where a small loss is acceptable"],
          ["At-least-once", "Process, then commit the offset", "Crash before commit: the message is processed again", "The default for almost everything, combined with idempotent processing"],
          ["Exactly-once (effect)", "Make the effect and the progress record atomic, or make duplicates harmless", "No loss, and duplicates have no visible effect", "Payments, counters, anything where duplicates cost money"]
        ] },
        { t: "p", html: "Exactly-once <em>delivery</em> over a network is impossible in general: a sender that gets no acknowledgment cannot know whether the message arrived (Chapter 8), so it must either retry, risking a duplicate, or not retry, risking a loss. What systems actually provide is exactly-once <b>effect</b> (often called exactly-once processing): duplicates may be delivered, but they are detected and discarded so the outcome is as if each message were processed once." },
        { t: "callout", kind: "warn", title: "Auto-commit is not a safe default", html: "Kafka consumers auto-commit by default (<code>enable.auto.commit=true</code>, every 5 seconds), committing offsets of records returned by earlier polls. If you process records synchronously in the poll loop, that behaves like at-least-once. If you hand records to a thread pool and poll again, offsets can be committed before processing finishes, and a crash then loses those records. For anything important, disable auto-commit and commit after processing." },
        { t: "h", text: "Idempotent producers" },
        { t: "p", html: "A producer whose request times out retries, and if the first attempt actually succeeded, the log gets a duplicate. With <code>enable.idempotence=true</code> (the default since Kafka 3.0), the broker gives the producer a <b>producer ID</b>, and the producer numbers its batches with a per-partition <b>sequence number</b>. The broker remembers the latest sequence numbers per producer and partition and discards a retry it has already written, while still acknowledging it." },
        { t: "diagram", caption: "The retry carries the same producer ID and sequence number, so the broker acknowledges it without appending a second copy.", code: `sequenceDiagram
  participant P as Producer PID 7
  participant B as Partition leader
  P->>B: batch seq 5, payment p-881
  Note over B: appends at offset 300, last seq for PID 7 is now 5
  B--xP: ack lost in the network
  Note over P: request times out, retry the same batch
  P->>B: batch seq 5, payment p-881
  Note over B: seq 5 already written for PID 7, do not append
  B-->>P: ack, offset 300` },
        { t: "p", html: "Limits: idempotence covers <b>retries by the client library within one producer session, per partition</b>. If the application itself calls send twice, or crashes and resends after restarting (getting a new producer ID), Kafka sees two different records." },
        { t: "h", text: "Transactions: exactly-once inside Kafka" },
        { t: "p", html: "Kafka transactions make a group of writes atomic across partitions, including the consumer's offset commit. A producer configured with a stable <code>transactional.id</code> registers with a transaction coordinator; on restart, re-registering bumps an <b>epoch</b> that fences off any zombie instance still using the old one. Consumers reading with <code>isolation.level=read_committed</code> see only records from committed transactions (the default is <code>read_uncommitted</code>). This gives exactly-once for <b>consume-transform-produce</b> pipelines that read from Kafka and write back to Kafka, which is what Kafka Streams uses with <code>processing.guarantee=exactly_once_v2</code>." },
        { t: "code", lang: "python", code: `producer = Producer(transactional_id="fraud-scorer-1", enable_idempotence=True)
producer.init_transactions()          # fences zombies holding the same transactional.id
consumer = Consumer(group_id="fraud-scorer", isolation_level="read_committed",
                    enable_auto_commit=False)
consumer.subscribe(["payments"])
while True:
    records = consumer.poll(timeout_ms=500)
    if not records:
        continue
    producer.begin_transaction()
    try:
        for r in records:
            producer.send("payment-scores", key=r.key, value=score(r.value))
        # the input offsets commit atomically with the output records
        producer.send_offsets_to_transaction(next_offsets(records),
                                             consumer.group_metadata())
        producer.commit_transaction()
    except Exception:
        producer.abort_transaction()  # outputs discarded, offsets not advanced
        rewind_to_last_committed(consumer)` },
        { t: "callout", kind: "warn", title: "Where Kafka's exactly-once stops", html: "Transactions cover only Kafka topics and offsets. A consumer that writes to PostgreSQL, calls a payment API or sends an email is outside the transaction: if it crashes after the side effect but before committing its offset, the message is redelivered and the side effect happens again. For external effects you still need an <b>idempotent consumer</b>." },
        { t: "h", text: "Idempotent consumers" },
        { t: "p", html: "Three techniques, from simplest to most general. <b>Naturally idempotent operations</b>: 'set status = SHIPPED' or an upsert keyed by ID can safely run twice, while 'add 10 points' cannot. <b>Store offsets with the results</b>: write the result and the consumed offset in one database transaction, and on startup seek to the stored offset instead of using Kafka's. <b>Dedupe table</b>: record each processed message ID in the same transaction as the effect, keyed by a unique constraint." },
        { t: "code", lang: "sql", code: `BEGIN;
-- fails with a unique violation if this event was already applied
INSERT INTO processed_events (consumer, event_id) VALUES ('loyalty', :event_id);
UPDATE loyalty_accounts SET points = points + :points WHERE user_id = :user_id;
COMMIT;
-- on unique violation: ROLLBACK, then commit the offset and move on.
-- purge processed_events rows older than the broker's retention window.` },
        { t: "callout", kind: "interview", title: "The answer to 'do you guarantee exactly-once?'", html: "'Delivery is at least once. Producers are idempotent and messages carry a unique event ID. Each consumer applies its effect and records the event ID in one local transaction, so a redelivered message is a no-op. For Kafka-to-Kafka steps we use transactions with read_committed consumers.' This shows you know exactly-once is an end-to-end property, not a broker setting." }
      ]
    },
    {
      id: "failure-handling",
      title: "Retries, dead-letter queues, backpressure and lag",
      minutes: 10,
      blocks: [
        { t: "p", html: "Messages fail for two kinds of reasons. <b>Transient failures</b> (a downstream timeout, a deadlock, a 503 from a partner API) usually succeed on retry. <b>Permanent failures</b> (malformed JSON, a schema the consumer does not understand, a bug triggered by one particular input) fail every time; such a message is a <b>poison message</b>. Retrying a poison message forever wastes capacity and, on a log-based broker, blocks every message behind it." },
        { t: "h", text: "Retries in queues vs logs" },
        { t: "p", html: "In SQS or RabbitMQ, failure is per message: the consumer simply does not acknowledge, and the message is redelivered later while others flow past it. In SQS a received message becomes invisible for the <b>visibility timeout</b> (30 seconds by default, up to 12 hours); if it is not deleted in time it reappears, and the queue's <b>redrive policy</b> moves it to a <b>dead-letter queue (DLQ)</b> after <code>maxReceiveCount</code> receives. RabbitMQ routes rejected or expired messages to a dead-letter exchange, and quorum queues can cap redeliveries with a delivery limit. In Kafka there is no per-message ack: the consumer cannot commit offset 501 while skipping 500, so a stuck message stalls its partition." },
        { t: "diagram", caption: "Failed messages leave the main partition so it keeps flowing; each retry tier waits longer, and only messages that exhaust every tier reach the DLQ for a human.", code: `flowchart LR
  M[["orders main topic"]] --> C["Order consumer"]
  C -->|"transient failure"| R1[["retry-1m topic"]]
  R1 --> RC1["Retry consumer<br/>waits until due"]
  RC1 -->|"fails again"| R2[["retry-30m topic"]]
  R2 --> RC2["Retry consumer<br/>waits until due"]
  RC2 -->|"still failing"| DLQ[["orders DLQ"]]
  C -->|"poison: bad schema"| DLQ
  DLQ --> Ops["Alert, inspect, fix,<br/>then redrive"]` },
        { t: "p", html: "The <b>retry topic</b> pattern: on a transient failure, the consumer publishes the message to a retry topic with metadata (attempt count, error, original topic and offset) and commits the original offset, so the main partition keeps moving. A retry consumer reads each retry topic and pauses until each message's due time; because every message in a given retry topic has the same delay, they become due in the order they arrived. After the last tier, the message goes to the DLQ. The trade-off: a message for key K that goes to retry can be overtaken by newer messages for K. If per-key order matters, either retry in place with backoff (accepting the stall) or park every later message for that key until the failed one clears." },
        { t: "callout", kind: "example", title: "Uber's retry topics", html: "Uber's engineering team published this design for Kafka in 2018: a chain of retry topics with increasing delays, each consumed by a delayed retry consumer, ending in a dead-letter topic that engineers inspect and can replay once the underlying problem is fixed." },
        { t: "list", items: [
          "<b>Detect poison early.</b> Classify errors: deserialization and validation failures go straight to the DLQ; timeouts and 5xx responses go to retry.",
          "<b>Make the DLQ useful.</b> Store the original payload, headers, error message, stack trace, attempt count and source offset. Alert when it is non-empty.",
          "<b>Plan the redrive.</b> After a fix, replay DLQ messages back to the main topic (SQS has a built-in DLQ redrive). Consumers must be idempotent, since some replayed messages may have partially succeeded.",
          "<b>Back off with jitter</b> between attempts (Chapter 12) so a recovering dependency is not hit by a synchronized wave of retries."
        ] },
        { t: "h", text: "Backpressure" },
        { t: "p", html: "<b>Backpressure</b> is how a slow stage tells a fast stage to slow down. Pull-based consumers apply it naturally: they fetch only what they can handle, and the broker holds the rest. The pressure then moves to the broker's storage and to latency. Producers need limits too: the Kafka producer blocks <code>send</code> (up to <code>max.block.ms</code>) when its <code>buffer.memory</code> is full, brokers can enforce per-client byte-rate quotas, and RabbitMQ applies flow control to publishers when memory or disk alarms fire. Inside a consumer, use bounded in-memory queues between the poll loop and worker threads; an unbounded buffer turns overload into an out-of-memory crash." },
        { t: "h", text: "Consumer lag" },
        { t: "p", html: "<b>Consumer lag</b> is how far a consumer group trails the head of the log: per partition, the log-end offset minus the group's committed offset. Track it in records and, more usefully, in <b>time</b> (age of the oldest unprocessed record), because '50,000 messages behind' means nothing without the rate. Steady lag near zero is healthy; lag that grows without recovering means consumers cannot keep up, and if it approaches the retention period, unprocessed data will be deleted." },
        { t: "table", head: ["Symptom", "Likely cause", "Fix"], rows: [
          ["Lag grows on every partition", "Consumers are under-provisioned or a dependency got slower", "Add consumers up to the partition count, batch database writes, scale the dependency"],
          ["Lag grows on one partition only", "Hot key, or a stuck poison message", "Better key choice or key salting; route the poison message to a DLQ"],
          ["Lag saw-tooths with frequent rebalances", "Processing exceeds max.poll.interval.ms, or pods restart", "Smaller max.poll.records, cooperative or static membership, faster processing"],
          ["SQS age of oldest message keeps rising", "Too few workers, or a visibility timeout shorter than processing time causing repeated redelivery", "Scale workers on queue depth; raise or extend the visibility timeout"]
        ] },
        { t: "callout", kind: "tip", title: "Autoscale on lag, within limits", html: "Tools such as KEDA scale Kubernetes consumers from Kafka lag or SQS queue depth. For Kafka, the maximum useful replica count equals the partition count, so size partitions for your peak consumer count ahead of time." }
      ]
    },
    {
      id: "event-patterns",
      title: "Event-driven patterns: from notifications to event sourcing",
      minutes: 13,
      blocks: [
        { t: "p", html: "'Event-driven' covers several quite different patterns. Martin Fowler's well-known breakdown distinguishes event notification, event-carried state transfer, event sourcing and CQRS. Mixing them up leads to confused designs, so name the one you mean." },
        { t: "h", text: "Event notification vs event-carried state transfer" },
        { t: "compare", items: [
          { title: "Event notification (thin events)", pros: ["Tiny messages: OrderPlaced with only order_id", "The producer's schema stays private", "Consumers always fetch the latest state"], cons: ["Every consumer calls back to the producer, adding load and a runtime dependency", "The callback may see a newer state than the event described"], use: "Few consumers, or data that changes after the event and must be fresh, such as 'something changed, re-sync'." },
          { title: "Event-carried state transfer (fat events)", pros: ["The event contains everything consumers need, so no callbacks", "Consumers keep a local copy and keep working while the producer is down"], cons: ["Larger messages and duplicated data", "The event schema becomes a public contract that is hard to change", "Local copies are eventually consistent"], use: "Many consumers needing the same data, such as a customer profile used by shipping, billing and support." }
        ] },
        { t: "h", text: "Event sourcing" },
        { t: "p", html: "In <b>event sourcing</b>, the source of truth is an append-only log of domain events (AccountOpened, MoneyDeposited, MoneyWithdrawn), not a table of current values. Current state is derived by replaying events in order, and services keep periodic <b>snapshots</b> so they do not replay from the beginning. You get a complete audit trail, the ability to answer 'what was the balance on March 3?', and the freedom to build new read models later by replaying history." },
        { t: "code", lang: "python", code: `def apply(state, event):
    if event.type == "AccountOpened":
        return {"balance": 0, "status": "open"}
    if event.type == "MoneyDeposited":
        return {**state, "balance": state["balance"] + event.amount}
    if event.type == "MoneyWithdrawn":
        return {**state, "balance": state["balance"] - event.amount}
    return state

def load_account(account_id):
    snap = snapshots.latest(account_id)            # e.g. state as of version 9,000
    state, version = snap.state, snap.version
    for e in event_store.read(account_id, after=version):
        state, version = apply(state, e), e.version
    return state, version

# appending enforces optimistic concurrency on the stream
event_store.append(account_id, new_events, expected_version=version)` },
        { t: "p", html: "The costs are real. Events are immutable, so their schemas must be versioned and old versions handled forever (often by 'upcasting' old events when read). Queries such as 'all accounts with balance over 1,000' need separate read models. Deleting personal data is hard in an immutable log; a common answer is crypto-shredding, which encrypts each user's data with a per-user key and deletes the key. Use event sourcing where the history itself is valuable (ledgers, order lifecycles, compliance-heavy domains), not as a default." },
        { t: "h", text: "CQRS" },
        { t: "p", html: "<b>Command Query Responsibility Segregation</b> splits the model that handles writes (commands, validated against invariants) from one or more models that serve reads, each shaped for its queries: a denormalized PostgreSQL table for the order page, an Elasticsearch index for search, a Redis sorted set for leaderboards. Read models are updated asynchronously from events, so they are eventually consistent. CQRS pairs naturally with event sourcing but does not require it; feeding read models from CDC on an ordinary database is very common." },
        { t: "diagram", caption: "Writes go to one store; Debezium streams its changes through Kafka into read models built for specific queries, each updated a little behind the write.", code: `flowchart LR
  U(("Client")) -->|"commands"| W["Order service<br/>write model"]
  W --> DB[("PostgreSQL<br/>orders + outbox")]
  DB -->|"WAL, logical decoding"| Dbz["Debezium on<br/>Kafka Connect"]
  Dbz --> K[["Kafka order-events"]]
  K --> P1["Search projector"]
  K --> P2["Dashboard projector"]
  P1 --> ES[("Elasticsearch")]
  P2 --> RD[("Redis")]
  U -->|"queries"| Q["Query service"]
  Q --> ES
  Q --> RD` },
        { t: "callout", kind: "warn", title: "CQRS breaks read-your-writes by default", html: "A user saves an order and the next page, served from the read model, does not show it yet. Fixes: return the new version with the command response and have the query side wait until its projection reaches that version; read from the write model for the user's own recent changes; or update the UI optimistically on the client." },
        { t: "h", text: "Change data capture and the outbox" },
        { t: "p", html: "<b>Change data capture (CDC)</b> turns a database's replication log into a stream of change events. <b>Debezium</b>, a set of Kafka Connect source connectors, reads the PostgreSQL write-ahead log through logical decoding or the MySQL binlog and publishes one event per inserted, updated or deleted row to Kafka, with before and after images. It captures every change, including ones made by scripts or other services, adds no load to the write path, and preserves commit order per row. Its weakness: raw table changes expose your internal schema to every consumer." },
        { t: "p", html: "The <b>transactional outbox</b> (Chapter 8) combines naturally with CDC: the service writes business rows and an outbox row describing a public, versioned event in one local transaction, and Debezium's outbox event router publishes only the outbox rows, routed to topics by aggregate type and keyed by aggregate ID. You get atomicity without dual writes, ordering per aggregate, and a deliberate public contract instead of leaked tables." },
        { t: "table", head: ["Pattern", "Source of truth", "Main benefit", "Main cost"], rows: [
          ["Event notification", "Producer's database", "Loose coupling, tiny events", "Callback load and runtime coupling"],
          ["Event-carried state transfer", "Producer's database, copied downstream", "Consumer autonomy, no callbacks", "Duplicate data, schema contract"],
          ["Event sourcing", "The event log itself", "Full history, replayable projections", "Schema evolution, query complexity"],
          ["CQRS", "Write model; read models derived", "Each query gets an optimal store", "Eventual consistency between models"],
          ["CDC", "Database, log exported", "Captures every change with no dual write", "Leaks internal schema unless combined with an outbox"],
          ["Transactional outbox", "Database, outbox table", "Atomic state change plus event", "A relay or CDC process to run, at-least-once publishing"]
        ] },
        { t: "callout", kind: "tip", title: "Treat event schemas as APIs", html: "Use a schema registry (Confluent Schema Registry, AWS Glue Schema Registry) with Avro or Protobuf and enforce compatibility rules: adding an optional field with a default is safe; renaming a field, or removing one that consumers still require, is not. Include an event ID, type, version, occurrence timestamp and aggregate ID in every event envelope." },
        { t: "callout", kind: "interview", title: "Choosing the pattern out loud", html: "'Order service publishes fat OrderPlaced events through an outbox, so shipping and billing don't call back. We don't event-source orders, since we have no need for full history beyond an audit table. The order-history page reads from a CQRS read model in Elasticsearch, built from the same events, and is a second or two behind.'" }
      ]
    }
  ],
  takeaways: [
    "Queue work that can happen after the response; keep calls synchronous when the user is waiting for the result. Queues buy decoupling, buffering, load leveling and fan-out, at the price of eventual consistency and duplicates.",
    "Point-to-point queues split messages among competing consumers; pub/sub gives every subscriber its own copy. SNS-to-SQS and Kafka consumer groups combine both.",
    "Kafka orders records only within a partition. Key by the entity whose events must stay ordered, choosing a high-cardinality key to avoid hot partitions.",
    "A consumer group has at most one active consumer per partition, so the partition count caps parallelism. Adding partitions later remaps keys and breaks per-key ordering across the change.",
    "Durable Kafka: replication factor 3, acks=all, min.insync.replicas=2, unclean leader election off. Consumers read only up to the high watermark.",
    "Process then commit gives at-least-once; commit then process gives at-most-once. Exactly-once delivery is impossible; exactly-once effect is achievable.",
    "Idempotent producers dedupe client retries per partition and session; Kafka transactions give exactly-once only for Kafka-to-Kafka pipelines. External side effects need idempotent consumers or dedupe tables.",
    "Route poison messages to a DLQ, retry transient failures through delayed retry tiers with backoff, and alert on DLQ depth and on consumer lag measured in time.",
    "Event notification, event-carried state transfer, event sourcing and CQRS are different patterns. Name the one you use and its consistency cost.",
    "Never dual-write a database and a broker: use a transactional outbox, published by a poller or by CDC with Debezium."
  ],
  mcqs: [
    { q: "Checkout calls a third-party email API synchronously to send receipts. When the provider slows to 4-second responses, checkout p99 latency explodes. What is the best fix?", options: [
      "Increase the checkout service's thread pool so more requests can wait in parallel",
      "Cache the email provider's responses in Redis with a 5-minute TTL per customer",
      "Retry the email call up to three times with a 500 ms timeout per attempt",
      "Publish an OrderPlaced event and send the receipt from an async queue consumer"
    ], answer: 3, explain: "The receipt is not on the critical path, so a queue decouples checkout from the provider's latency and availability. More threads or retries keep checkout coupled to the slow dependency, and caching makes no sense for a side effect.", level: "easy" },
    { q: "Shipping receives an <code>OrderPlaced</code> event containing only <code>order_id</code>, then calls the Orders API to fetch the address and items. Which pattern is this?", options: [
      "Event notification",
      "Event-carried state transfer",
      "Event sourcing",
      "Change data capture"
    ], answer: 0, explain: "A thin event that tells consumers something happened, with a callback for details, is event notification. Event-carried state transfer would put the address and items inside the event so no callback is needed.", level: "easy" },
    { q: "A Kafka consumer processes each record and then commits its offset. It crashes after processing a record but before committing. What happens on restart?", options: [
      "The record is skipped, giving at-most-once semantics",
      "The record is processed again, giving at-least-once semantics",
      "The broker detects the crash and rolls back the record's side effects",
      "The record is moved automatically to the group's dead-letter topic"
    ], answer: 1, explain: "The new owner resumes from the last committed offset, which is before the processed record, so it is redelivered. That is why at-least-once consumers must be idempotent; Kafka has no built-in DLQ for plain consumers.", level: "easy" },
    { q: "A topic has 8 partitions and producers send records without keys. Which ordering guarantee does a consumer have?", options: [
      "Records arrive in the exact global order that producers sent them",
      "Records are ordered by producer timestamp across all partitions",
      "Records are ordered within each partition, but not across partitions",
      "No ordering at all; unkeyed records are shuffled inside a partition"
    ], answer: 2, explain: "Kafka guarantees order only within a partition; offsets define that order. Without keys, related records spread across partitions, so nothing orders them relative to one another.", level: "easy" },
    { q: "A ride-tracking service publishes trip events (requested, accepted, started, completed) and consumers must process each trip's events in order. Most riders take one trip at a time, but a few corporate accounts book thousands of trips a day. What should the partition key be?", options: [
      "account_id, so all of an account's trips are colocated",
      "trip_id, so each trip's events stay in one partition",
      "city, so regional consumers get their data together",
      "No key, so load spreads evenly across partitions"
    ], answer: 1, explain: "The ordering requirement is per trip, and trip_id has high cardinality with no dominant value. account_id would create hot partitions for corporate accounts, city is badly skewed, and no key loses per-trip ordering.", level: "medium" },
    { q: "A consumer group on a 12-partition topic has 12 consumers, and lag keeps growing during peak. You scale the group to 24 consumers. What happens?", options: [
      "Throughput doubles, because Kafka splits each partition between two consumers",
      "Throughput doubles, but records with the same key may be processed out of order",
      "The group rejects the 12 extra consumers with a rebalance error",
      "12 consumers sit idle, so lag keeps growing at the same rate as before"
    ], answer: 3, explain: "Each partition is assigned to at most one consumer in a group, so 12 partitions cap the group at 12 active consumers. The extras simply wait as standbys for a failure; to go faster you need more partitions or faster per-record processing.", level: "medium" },
    { q: "A topic has replication factor 3 and <code>min.insync.replicas=2</code>; producers use <code>acks=all</code>. Two of a partition's three brokers go down. What happens?", options: [
      "Writes still succeed with acks=all, since the ISR shrinks to just the leader",
      "The partition goes offline for both reads and writes until a second broker returns",
      "Producers get NotEnoughReplicas errors, but consumers can still read committed data",
      "Kafka automatically elects an out-of-sync replica so writes can continue"
    ], answer: 2, explain: "With the ISR down to one replica, below min.insync.replicas, the leader refuses acks=all writes rather than accept data a single failure could destroy. Committed data remains readable from the surviving leader, and unclean election is off by default.", level: "medium" },
    { q: "With <code>enable.idempotence=true</code>, which duplicate can still end up in the Kafka log?", options: [
      "The client library retries a batch whose acknowledgment was lost",
      "The app crashes, restarts and re-sends a message it had already sent",
      "A partition leader fails over while a producer batch is still in flight",
      "A network partition makes the producer reconnect to the same broker"
    ], answer: 1, explain: "Idempotence dedupes retries within one producer session using the producer ID and per-partition sequence numbers. After a restart the producer has a new producer ID and the resend is a new record; preventing that needs transactions or consumer-side dedupe.", level: "medium" },
    { q: "One record in a partition has a malformed payload that crashes the consumer's deserializer every time. The consumer retries indefinitely and the partition's lag climbs. What is the right handling?", options: [
      "Send the record and its error to a dead-letter topic, then commit past it",
      "Restart the consumer group so the record is assigned to a different consumer",
      "Lower the topic's retention so the bad record is deleted within minutes",
      "Increase max.poll.interval.ms so the consumer has more time to parse the record"
    ], answer: 0, explain: "A poison message fails deterministically, so retries, extra time and reassignment change nothing. Parking it in a DLQ (and alerting) unblocks the partition and preserves the payload for a fix and later redrive.", level: "medium" },
    { q: "An SQS queue uses the default 30-second visibility timeout, but each job takes about 60 seconds to process. What will you observe, and how do you fix it?", options: [
      "Jobs fail with a timeout error; fix it by enabling 20-second long polling",
      "SQS throttles the slow consumers; fix it by adding more worker instances",
      "Messages are deleted after 30 seconds; fix it by raising the retention period",
      "Jobs run more than once; fix it by raising the visibility timeout past 60 s"
    ], answer: 3, explain: "When the visibility timeout expires before the worker deletes the message, SQS makes it visible again and another worker picks it up. Set the timeout above processing time, or call ChangeMessageVisibility as a heartbeat, and keep workers idempotent.", level: "medium" },
    { q: "Billing, fraud detection and analytics must each process every event on the <code>payments</code> Kafka topic at their own pace. How should they consume it?", options: [
      "Put all three services in one consumer group so they share the partitions",
      "Give each service its own consumer group with independent offsets",
      "Have billing consume and republish each event to the other two services",
      "Create one partition per service so each reads only its own partition"
    ], answer: 1, explain: "Each consumer group gets every record and tracks its own offsets, so the services are independent. One shared group would split the records so each service sees only a fraction.", level: "medium" },
    { q: "Which configuration ensures a record acknowledged to the producer survives the failure of any single broker, without trading away consistency during leader election?", options: [
      "<code>acks=1</code>, replication factor 3, <code>min.insync.replicas=2</code>, unclean leader election enabled",
      "<code>acks=all</code>, replication factor 2, <code>min.insync.replicas=1</code>, unclean leader election disabled",
      "<code>acks=all</code>, replication factor 3, <code>min.insync.replicas=2</code>, unclean leader election disabled",
      "<code>acks=0</code>, replication factor 3, <code>min.insync.replicas=2</code>, and fsync on every message"
    ], answer: 2, explain: "Every acknowledged record is on at least two replicas, and only an in-sync replica can become leader, so no acknowledged record is lost. With RF 2 and min ISR 1, the ISR can shrink to the leader alone and acks=all then means one copy. min.insync.replicas is enforced only for acks=all, so with acks=1 or acks=0 a record can be lost if the leader fails before followers copy it.", level: "hard" },
    { q: "A consumer reads from a Kafka topic, inserts each payment into PostgreSQL, then commits its offset. The team enabled Kafka transactions on the producer that writes the topic. Can a payment be inserted twice?", options: [
      "Yes: a crash between the insert and the offset commit redelivers the record",
      "No: Kafka transactions give exactly-once delivery to every downstream system",
      "No: read_committed isolation prevents a consumer from seeing a record twice",
      "Yes, but only if unclean leader election is enabled and a leader fails"
    ], answer: 0, explain: "Kafka's exactly-once covers writes to Kafka and offset commits made inside the transaction, not a PostgreSQL insert. read_committed hides aborted records but does not stop redelivery after a consumer crash. Use a unique dedupe key on the insert, or store the offset in the same database transaction.", level: "hard" },
    { q: "A 16-partition topic keyed by <code>user_id</code> is expanded to 32 partitions while running. What is the effect on ordering?", options: [
      "Kafka rehashes and migrates existing records, so per-user ordering is preserved",
      "Nothing changes, because keys stay bound to the partition they were first written to",
      "Ordering is lost for every user until the old partitions are fully compacted",
      "Many keys now map to a different partition, so per-user ordering breaks around the change"
    ], answer: 3, explain: "The partitioner computes hash mod partition count, so changing 16 to 32 remaps about half the keys, while existing data never moves. A consumer may process a user's new records before older ones still in the old partition. Plan partition counts ahead, or migrate to a new topic.", level: "hard" },
    { q: "Producers write 50 MB/s on average into a Kafka cluster, with 7-day retention and replication factor 3. Roughly how much disk does the cluster need, before headroom?", options: [
      "About 4 TB",
      "About 30 TB",
      "About 90 TB",
      "About 300 TB"
    ], answer: 2, explain: "50 MB/s × 86,400 s ≈ 4.3 TB per day; × 7 days ≈ 30 TB; × 3 replicas ≈ 90 TB. A real plan adds 30–50% headroom for traffic growth and uneven partitions.", level: "hard" }
  ],
  design: [
    {
      id: "design-order-pipeline",
      title: "Design an e-commerce order processing pipeline",
      level: "Medium",
      prompt: "Design the backend pipeline that runs after a customer clicks 'Place order' on a large e-commerce site: reserve inventory, charge payment, notify the customer, hand off to the warehouse and feed analytics. Traffic spikes 20x during sales. No order may be lost or charged twice.",
      clarify: [
        "How many orders per day, and how big is the sale-day peak?",
        "Must the customer see 'confirmed' synchronously, or is 'received, confirming' acceptable?",
        "Which steps must happen in order for one order, and which can run in parallel?",
        "Is the payment provider synchronous, and does it support idempotency keys?",
        "How long may a downstream system (warehouse, email) be down before it is a business problem?",
        "Do analytics need every event, and how fresh?"
      ],
      hints: [
        "Separate what the customer waits for (order accepted) from what can happen afterwards (payment capture, emails, warehouse).",
        "The order service must save the order and emit an event atomically. Which pattern avoids dual writes?",
        "Which key keeps one order's events in order without creating hot partitions?",
        "Delivery is at least once. How does the payment consumer avoid charging twice?",
        "What happens to a message the warehouse API rejects, and to messages during a 20-minute warehouse outage?"
      ],
      solution: [
        { t: "h", text: "Requirements" },
        { t: "list", items: [
          "<b>Functional:</b> accept an order; reserve stock; authorize and capture payment; confirm or cancel; notify the customer; send to the warehouse; stream events to analytics; expose order status.",
          "<b>Non-functional:</b> never lose an accepted order; never double charge; order acceptance p99 under 300 ms even at peak; downstream outages must not block acceptance; per-order events processed in order; end-to-end confirmation typically within 5 seconds."
        ] },
        { t: "h", text: "Estimates" },
        { t: "list", items: [
          "10M orders/day ÷ 86,400 s ≈ 120 orders/s average; sale peak 20x ≈ 2,400 orders/s, round to 3,000/s for headroom.",
          "Each order produces ~8 events (placed, stock reserved, payment authorized, confirmed, picked, shipped, and so on): 3,000 × 8 = 24,000 events/s at peak. At ~1.5 KB each that is ~36 MB/s into Kafka, easy for a small cluster.",
          "Kafka storage: 10M × 8 × 1.5 KB = 120 GB/day; × 7 days × RF 3 ≈ 2.5 TB.",
          "Partitions: payment authorization takes ~200 ms at the provider, so a consumer handling one record at a time manages only 5/s. Each payment consumer therefore processes records for different order_ids concurrently (up to 50 in flight, still sequential per key, committing only the lowest fully processed offset): ~250/s per consumer. Peak ≈ 3,000 payment events/s ÷ 250 = 12 consumers; 48 partitions per topic leaves 4x headroom."
        ] },
        { t: "h", text: "API" },
        { t: "code", lang: "http", code: `POST /v1/orders
Idempotency-Key: 3f1c-checkout-81
{"cart_id": "c-77", "payment_method_id": "pm-12", "address_id": "a-3"}
  -> 202 {"order_id": "o-5521", "status": "RECEIVED"}

GET  /v1/orders/o-5521
  -> 200 {"status": "CONFIRMED", "items": [...], "updated_at": "..."}

POST /v1/orders/o-5521/cancel
  -> 202, or 409 if already shipped` },
        { t: "h", text: "Data model" },
        { t: "p", html: "Each service owns its data. Orders and inventory live in PostgreSQL (transactions, constraints, conditional updates); events flow through Kafka topics keyed by <code>order_id</code>." },
        { t: "table", head: ["Store", "Table or topic", "Key fields"], rows: [
          ["Orders DB (PostgreSQL)", "orders", "order_id PK, customer_id, status, total, version, idempotency_key UNIQUE"],
          ["Orders DB (PostgreSQL)", "outbox", "id, aggregate_id = order_id, event_type, payload JSONB, created_at"],
          ["Inventory DB (PostgreSQL)", "stock, reservations", "sku PK, available; reservation (order_id, sku) UNIQUE"],
          ["Payments DB (PostgreSQL)", "payments, processed_events", "payment_id, order_id UNIQUE, provider_ref; event_id PK"],
          ["Kafka", "order-events, inventory-events, payment-events", "key = order_id, 48 partitions, RF 3, 7-day retention"],
          ["Kafka", "payment-commands.retry-1m, retry-15m, dlq", "Same key; retry tiers for transient provider failures"]
        ] },
        { t: "h", text: "High-level design" },
        { t: "diagram", caption: "The order write and its event commit together; each downstream service consumes in its own group, and failures divert to retry tiers instead of blocking the partition.", code: `flowchart LR
  U(("Customer")) -->|"POST /orders"| OS["Order service"]
  OS --> ODB[("Orders DB<br/>orders + outbox")]
  ODB -->|"CDC"| Dbz["Debezium"]
  Dbz --> OE[["order-events"]]
  OE --> Inv["Inventory service"]
  Inv --> IE[["inventory-events"]]
  IE --> Pay["Payment service"]
  Pay --> PE[["payment-events"]]
  PE --> OS
  OE --> Notif["Notification service"]
  OE --> WH["Warehouse connector"]
  OE --> An["Analytics sink"]
  Pay -.->|"transient failure"| Rt[["payment retry tiers and DLQ"]]` },
        { t: "p", html: "<b>Write path:</b> the order service validates the cart, then in one PostgreSQL transaction inserts the order (status RECEIVED) and an OrderPlaced outbox row, and returns 202. Debezium publishes the outbox row to <code>order-events</code>. Inventory reserves stock and emits StockReserved or StockUnavailable; payment authorizes the card on StockReserved and emits PaymentAuthorized or PaymentFailed; the order service consumes those results and moves the order to CONFIRMED or CANCELLED, emitting further events through the same outbox. Notification, warehouse and analytics each consume with their own consumer group. <b>Read path:</b> GET reads the orders table, which always reflects the latest consumed result." },
        { t: "h", text: "Deep dives" },
        { t: "p", html: "<b>1. Ordering and the key.</b> All events are keyed by <code>order_id</code>, so one order's lifecycle stays in one partition per topic and each consumer of <code>order-events</code> sees OrderPlaced before OrderCancelled for the same order. There is no ordering across topics, which is why the order state machine must tolerate results arriving in any order. <code>customer_id</code> would also preserve order but creates hot partitions for marketplace sellers or B2B buyers. Partition counts are fixed at 48 up front, because adding partitions later remaps keys." },
        { t: "p", html: "<b>2. No double charge.</b> Delivery is at least once end to end. The payment service records each consumed event ID in <code>processed_events</code> in the same transaction as the payment row, and <code>payments.order_id</code> is unique. It calls the provider with <code>Idempotency-Key = order_id</code>, so even if the service crashes after charging but before recording, the retried call returns the original charge rather than creating a new one." },
        { t: "p", html: "<b>3. Flash sale load leveling.</b> Acceptance is one small transaction, so the order service scales horizontally and absorbs 3,000 orders/s. Downstream consumers drain at their own rate. If payments fall behind by 30 seconds, customers simply see RECEIVED a little longer. Alert on lag measured in seconds per consumer group, and autoscale consumers up to the partition count. Inventory must be strongly consistent per SKU: the reservation is a conditional update (<code>UPDATE stock SET available = available - :n WHERE sku = :sku AND available &gt;= :n</code>), and hot SKUs in a sale can be split into several stock buckets to reduce row contention." },
        { t: "p", html: "<b>4. Failures.</b> Provider timeouts and 5xx responses go to <code>retry-1m</code>, then <code>retry-15m</code>, then the DLQ with full error context; validation errors go straight to the DLQ. The warehouse connector simply stops committing during a warehouse outage: Kafka retains 7 days of events, so a 20-minute outage is just lag that clears afterwards. Orders whose payment never resolves are cancelled by a timeout check, which releases the stock reservation (a compensation, as in the Chapter 8 sagas)." },
        { t: "h", text: "Trade-offs and bottlenecks" },
        { t: "table", head: ["Decision", "Benefit", "Cost"], rows: [
          ["202 Accepted plus status polling or push", "Acceptance survives any downstream outage", "Customers briefly see RECEIVED before CONFIRMED"],
          ["Outbox plus Debezium", "No dual writes; events committed with the data", "Another system (Kafka Connect) to operate; a little extra latency"],
          ["Choreography between inventory and payment", "Simple for two steps", "As steps grow, move to an orchestrator for visibility and timeouts"],
          ["Retry topics", "Main partitions keep flowing during partial outages", "A retried order's events can be overtaken; the order state machine must ignore stale transitions"],
          ["48 partitions fixed up front", "Room to scale consumers without remapping keys", "More partitions to manage than today's load needs"]
        ] }
      ],
      followups: [
        "How would you show the customer 'confirmed' within 2 seconds most of the time without making checkout synchronous?",
        "Payments is down for an hour during a sale. What does the customer see, and what happens to inventory reservations?",
        "How do you replay a week of order events into a new fraud-detection service without disturbing existing consumers?",
        "A bug double-published OrderPlaced for 10,000 orders. Which components protect you, and where would duplicates still show?",
        "When would you switch from choreography to an orchestrated saga here?"
      ]
    },
    {
      id: "design-delayed-job-scheduler",
      title: "Design a distributed delayed-job scheduler",
      level: "Hard",
      prompt: "Design a service that lets internal teams schedule a job to run at a specific future time T, from seconds to months ahead: 'send this reminder at 09:00 tomorrow', 'expire this cart in 30 minutes', 'retry this webhook in 5 minutes'. Jobs must fire close to T, survive machine failures, and be cancellable.",
      clarify: [
        "How many jobs are scheduled per day, how many are pending at once, and how far ahead?",
        "How precise must firing be: within 1 second, 10 seconds, a minute?",
        "Is at-least-once execution acceptable if job handlers are idempotent?",
        "What does 'run' mean: call an HTTP endpoint, or publish a message to the owner's topic?",
        "Do we need recurring (cron) schedules, or only one-shot jobs?",
        "Are there traffic spikes at round times, such as midnight or the top of the hour?"
      ],
      hints: [
        "Kafka cannot delay individual messages, and SQS delays cap at 15 minutes. You need a store indexed by due time.",
        "Storing jobs by due time makes 09:00:00 a hot partition. How do you spread one time bucket across many partitions?",
        "Split the work: a durable store holds far-future jobs; scheduler nodes load only jobs due in the next minute or so into memory.",
        "Each time-bucket shard must be owned by exactly one scheduler node at a time. Use leases from a coordination service, and fence stale owners.",
        "Firing is a state change, SCHEDULED to ENQUEUED, made with a conditional write. Then hand the job to a queue that workers consume with an idempotency key."
      ],
      solution: [
        { t: "h", text: "Requirements" },
        { t: "list", items: [
          "<b>Functional:</b> schedule a one-shot job (run_at, target topic, payload, idempotency key); cancel or reschedule before it fires; query status; optional recurring schedules expanded one occurrence at a time.",
          "<b>Non-functional:</b> fire within 2 seconds of T at p99; never lose an accepted job; at-least-once execution, with duplicates rare and detectable; 99.95% availability for scheduling; scale to 1B pending jobs and 50k firings/s at peaks."
        ] },
        { t: "h", text: "Estimates" },
        { t: "list", items: [
          "200M new jobs/day ÷ 86,400 s ≈ 2,300 writes/s average, ~10k/s peak.",
          "Firings average the same ~2,300/s, but round times spike: if 5% of a day's jobs target 00:00:00, that is 10M jobs due in one second. We cannot dispatch that in one second, so we either smear it (jobs declare a tolerance window) or accept a short drain: at 50k/s, 10M takes 200 s.",
          "Pending storage: 1B jobs × ~1 KB ≈ 1 TB; × RF 3 = 3 TB in the job store.",
          "Lookahead memory: at 50k firings/s peak with a 60 s lookahead, ~3M jobs in memory across all scheduler nodes × ~200 B (ID, run_at, small payload reference) ≈ 600 MB, spread over a dozen nodes."
        ] },
        { t: "h", text: "API" },
        { t: "code", lang: "http", code: `POST /v1/jobs
Idempotency-Key: cart-expire-c77
{"run_at": "2026-10-23T09:00:00Z", "tolerance_s": 30,
 "target_topic": "cart-expirations", "payload": {"cart_id": "c-77"}}
  -> 201 {"job_id": "j-7f3a", "status": "SCHEDULED"}

DELETE /v1/jobs/j-7f3a
  -> 204, or 409 if already fired

GET /v1/jobs/j-7f3a
  -> 200 {"status": "ENQUEUED", "fired_at": "2026-10-23T09:00:00.4Z"}` },
        { t: "h", text: "Data model" },
        { t: "p", html: "Use Cassandra or DynamoDB: very high write rates, simple key access, and range scans within a partition. Two tables, both written when a job is created:" },
        { t: "code", lang: "sql", code: `-- Jobs by due time: what scheduler nodes scan
CREATE TABLE jobs_by_time (
  bucket   text,       -- run_at truncated to the minute: '2026-10-23T09:00'
  shard    int,        -- hash(job_id) mod 256, splits hot minutes
  run_at   timestamp,
  job_id   text,
  target   text, payload blob, status text,
  PRIMARY KEY ((bucket, shard), run_at, job_id));

-- Jobs by id: status lookups, cancels, idempotent creates
CREATE TABLE jobs_by_id (
  job_id text PRIMARY KEY, idempotency_key text,
  bucket text, shard int, run_at timestamp,
  status text,        -- SCHEDULED, ENQUEUED, CANCELLED, DONE, FAILED
  attempt int);` },
        { t: "h", text: "High-level design" },
        { t: "diagram", caption: "Each scheduler node owns a set of shards via etcd leases, loads jobs due in the next minute, and fires them into Kafka for worker pools to execute.", code: `flowchart LR
  T(("Team service")) -->|"POST /jobs"| API["Scheduler API"]
  API --> DB[("Cassandra<br/>jobs_by_time, jobs_by_id")]
  Etcd["etcd<br/>shard leases"] -.->|"owns shards 0 to 63"| S1["Scheduler node 1<br/>timing wheel"]
  Etcd -.->|"owns shards 64 to 127"| S2["Scheduler node 2<br/>timing wheel"]
  S1 -->|"scan due buckets"| DB
  S2 -->|"scan due buckets"| DB
  S1 -->|"conditional SCHEDULED to ENQUEUED"| DB
  S1 -->|"publish at T"| K[["Kafka target topics"]]
  S2 -->|"publish at T"| K
  K --> W["Owner workers<br/>dedupe on job id"]` },
        { t: "p", html: "<b>Schedule path:</b> the API writes both rows (status SCHEDULED) and returns. A job due within the current lookahead window is also pushed straight to the owning scheduler node so it is not missed by a scan that already ran. <b>Fire path:</b> every few seconds each scheduler node reads the next minute's buckets for the shards it owns, ordered by run_at, and loads them into an in-memory hierarchical timing wheel (or a min-heap). When a job comes due, the node changes its status from SCHEDULED to ENQUEUED with a conditional write, publishes the payload to the target Kafka topic with the job ID as key and as idempotency header, and moves on. Owner teams consume their topic like any other." },
        { t: "h", text: "Deep dives" },
        { t: "p", html: "<b>1. Why not just use a queue's delay?</b> SQS per-message delays max out at 15 minutes, and RabbitMQ has no native arbitrary delay without a plugin. Kafka stores records in append order, not due-time order, so a record due tomorrow would block everything appended after it. Kafka works for <em>fixed</em> delays (a retry-5m topic, where all records become due in append order), but arbitrary T needs a time-indexed store. A Redis sorted set (score = run_at, poll with ZRANGEBYSCORE) is a fine choice at smaller scale and is how Sidekiq stores scheduled jobs, but holding a terabyte of pending jobs in memory is expensive." },
        { t: "p", html: "<b>2. Hot buckets.</b> Partitioning only by minute would put every 09:00 job in one Cassandra partition and one scheduler node. Adding <code>shard = hash(job_id) mod 256</code> splits each minute into 256 partitions, spread over many nodes, and the shards are spread across scheduler nodes. For round-time spikes, jobs with a <code>tolerance_s</code> are fired anywhere within their window, smoothing the dispatch rate, and dispatch is rate-limited per target topic to protect owners from a flood." },
        { t: "p", html: "<b>3. Exactly one firing node, at least once execution.</b> Shard ownership comes from etcd leases with fencing tokens (Chapter 8). A node that loses its lease, for example after a long GC pause, stops firing; if it fires anyway, the conditional status update (<code>UPDATE ... SET status = 'ENQUEUED' IF status = 'SCHEDULED'</code>, a Cassandra lightweight transaction or a DynamoDB condition expression) fails because the new owner already moved the job. The remaining gap is a crash between the status update and the Kafka publish: on taking over a shard, a node republishes recent ENQUEUED jobs whose fire acknowledgment is missing. That can produce a duplicate, which is why consumers deduplicate on job_id. The guarantee is at least once, with duplicates rare." },
        { t: "p", html: "<b>4. Cancellation, retries and recurrence.</b> Cancel sets status CANCELLED with the same conditional write, so it either wins before firing or returns 409. Failed executions are rescheduled as new occurrences with exponential backoff and an attempt count, ending in a DLQ topic after N attempts. A recurring job stores its cron expression; when one occurrence fires, the scheduler writes the next occurrence in the same step, so only one future occurrence exists at a time." },
        { t: "callout", kind: "tip", title: "Timing wheels", html: "A hierarchical timing wheel puts timers into slots of a circular array (one slot per second, say), with coarser wheels for longer delays, giving O(1) insert and cancel. Kafka itself uses hierarchical timing wheels to manage delayed requests in its request purgatory." },
        { t: "h", text: "Trade-offs and bottlenecks" },
        { t: "table", head: ["Decision", "Benefit", "Cost"], rows: [
          ["Durable store plus in-memory lookahead", "Scales to months ahead and a billion pending jobs", "Two-tier logic; jobs inserted inside the window need a direct push to the owner"],
          ["Minute buckets × 256 shards", "No hot partitions at round times", "Each scan touches 256 partitions per minute, split across nodes"],
          ["etcd leases for shard ownership", "One firing node per shard; quick failover", "Failover gap of about one lease TTL, so jobs fire a few seconds late"],
          ["At-least-once with idempotent consumers", "Simple and robust", "Every owner must dedupe on job_id"],
          ["Tolerance windows", "Smooth dispatch at midnight spikes", "Teams must state how late a job may run"]
        ] }
      ],
      followups: [
        "How would you guarantee firing within 100 ms instead of 2 seconds? What gets more expensive?",
        "A team schedules 50M jobs for exactly midnight on New Year's Eve. Walk through what happens.",
        "How would you move shard ownership when adding scheduler nodes without double-firing or missing jobs?",
        "How do you support 'run at 09:00 in the user's local time zone' across daylight saving changes?",
        "How would you build this on DynamoDB alone, using TTL or streams, and what would you give up?"
      ]
    }
  ]
};
