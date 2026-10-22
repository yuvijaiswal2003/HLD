module.exports = {
  id: "databases",
  num: 6,
  part: 2,
  title: "Databases: SQL, NoSQL and Indexing",
  tagline: "Pick the right store, index it well, and know exactly what your transactions promise.",
  level: "Intermediate",
  lessons: [
    {
      id: "relational-acid",
      title: "The relational model, transactions and ACID",
      minutes: 9,
      blocks: [
        { t: "p", html: "A <b>relational database</b> stores data in tables (relations). Each table has a fixed set of typed columns, each row is identified by a <b>primary key</b>, and rows in different tables point at each other with <b>foreign keys</b>. You query with SQL, which is <em>declarative</em>: you say which rows you want, and the <b>query planner</b> decides how to get them (which index, which join order, scan or seek)." },
        { t: "p", html: "Relational databases have been the default for decades for three reasons. <b>Joins</b> let you store each fact once and combine facts at read time. <b>Constraints</b> (<code>NOT NULL</code>, <code>UNIQUE</code>, <code>FOREIGN KEY</code>, <code>CHECK</code>) enforce invariants in one place instead of in every service. And <b>transactions</b> let several changes succeed or fail together. PostgreSQL and MySQL (with its InnoDB engine) are the two you will name most often in interviews." },
        { t: "h", text: "Transactions" },
        { t: "p", html: "A <b>transaction</b> groups statements into one unit of work between <code>BEGIN</code> and <code>COMMIT</code>. If anything fails before the commit, <code>ROLLBACK</code> (explicit or automatic) undoes every change in the unit. A money transfer is the classic case: the debit, the credit and the ledger entry must all happen, or none of them." },
        { t: "code", lang: "sql", code: `CREATE TABLE accounts (
  id       bigint PRIMARY KEY,
  owner_id bigint NOT NULL REFERENCES users(id),
  balance  numeric(12,2) NOT NULL CHECK (balance >= 0)
);

BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;  -- CHECK rejects overdraft
UPDATE accounts SET balance = balance + 100 WHERE id = 2;
INSERT INTO ledger (from_id, to_id, amount) VALUES (1, 2, 100);
COMMIT;  -- all three changes become visible together, or none do` },
        { t: "h", text: "ACID, one letter at a time" },
        { t: "table", head: ["Property", "What it promises", "How the database delivers it", "What it does not mean"], rows: [
          ["<b>Atomicity</b>", "All of a transaction's writes happen, or none do, even across a crash", "Write-ahead log plus undo information; incomplete transactions are rolled back on recovery", "Nothing about concurrency; that is isolation"],
          ["<b>Consistency</b>", "A transaction takes the data from one valid state to another", "Constraints and foreign keys; everything else is your application logic", "Not the C in CAP, which means linearizability (Chapter 8)"],
          ["<b>Isolation</b>", "Concurrent transactions do not see each other's half-done work", "Locks, MVCC snapshots and conflict detection, to the degree the isolation level promises", "Not full serializability by default in most databases"],
          ["<b>Durability</b>", "Once COMMIT returns, the change survives a crash or power loss", "The commit record is fsynced to the log before the client gets OK", "Not protection against losing the disk; that needs replicas and backups"]
        ] },
        { t: "h", text: "How durability works: the write-ahead log" },
        { t: "p", html: "Writing every changed 8 KB page to its home on disk at commit time would be slow and full of random I/O. Instead the engine changes pages in memory (the <b>buffer pool</b>) and appends a compact description of the change to a <b>write-ahead log</b> (PostgreSQL calls it the WAL, InnoDB the redo log). At commit it fsyncs the log, which is a sequential append. Dirty pages are written to the data files later, at <b>checkpoints</b>. After a crash, the engine replays the log from the last checkpoint. <b>Group commit</b> lets many concurrent transactions share one fsync, which is how a single primary sustains thousands of commits per second." },
        { t: "diagram", caption: "COMMIT waits only for a sequential log fsync; data pages reach their files later, and the log can rebuild them after a crash.", code: `flowchart LR
  App["Application"] -->|"1. UPDATE"| Eng["Database engine"]
  Eng -->|"2. change page in memory"| BP["Buffer pool<br/>dirty pages"]
  App -->|"3. COMMIT"| Eng
  Eng -->|"4. append and fsync"| WAL[("Write-ahead log<br/>sequential")]
  Eng -.->|"5. OK after fsync"| App
  BP -.->|"6. later, at checkpoint"| Data[("Data files")]
  WAL -.->|"crash recovery: replay"| Data` },
        { t: "callout", kind: "warn", title: "Durability knobs that quietly trade safety for speed", html: "PostgreSQL <code>synchronous_commit = off</code> acknowledges before the WAL fsync, so a crash can lose the last fraction of a second of commits (up to three times <code>wal_writer_delay</code>, about 600 ms by default), with no corruption. MySQL <code>innodb_flush_log_at_trx_commit = 2</code> or <code>0</code> flushes about once per second, so an OS crash or power loss can lose about a second. These are fine for clickstream data and wrong for payments. Also remember that single-node durability does not survive losing the machine; that takes synchronous replication (Chapter 7)." },
        { t: "callout", kind: "interview", title: "Name the invariant, not just the database", html: "Saying 'use PostgreSQL for payments' earns little. Saying 'the debit, credit and ledger insert run in one transaction, and <code>CHECK (balance &gt;= 0)</code> stops overdrafts even if two withdrawals race' shows you know what the transaction actually buys you." }
      ]
    },
    {
      id: "isolation-anomalies",
      title: "Isolation levels and the anomalies they prevent",
      minutes: 13,
      blocks: [
        { t: "p", html: "Running transactions one at a time would be perfectly correct and far too slow. Databases let transactions overlap and offer <b>isolation levels</b> that trade correctness for concurrency. The SQL-92 standard defined four levels by three phenomena (dirty read, non-repeatable read, phantom). Real systems add two more anomalies that cause most production bugs: <b>lost update</b> and <b>write skew</b>." },
        { t: "h", text: "The five anomalies" },
        { t: "list", items: [
          "<b>Dirty read</b>: transaction B reads a row that A wrote but has not committed. If A rolls back, B acted on data that never existed.",
          "<b>Non-repeatable read</b> (also called read skew): A reads a row, B commits an update to it, A reads it again and gets a different value. A report that sums balances during a transfer can see money missing.",
          "<b>Phantom</b>: A runs a query with a condition (<code>WHERE room = 5 AND day = 'Mon'</code>), B inserts or deletes a matching row and commits, and A's rerun returns a different set of rows.",
          "<b>Lost update</b>: two transactions read the same row, modify the value in application code, and write it back. The second write silently overwrites the first.",
          "<b>Write skew</b>: two transactions read the same data, each makes a decision based on it, and each writes a <em>different</em> row. Each write is fine alone, but together they break an invariant. Double-booking a meeting room by inserting two overlapping reservations is write skew."
        ] },
        { t: "diagram", caption: "A lost update: both transactions read 10 and both write 9, so one sale disappears even though nothing errored.", code: `sequenceDiagram
  participant A as Txn A
  participant DB as Database
  participant B as Txn B
  A->>DB: SELECT stock FROM items WHERE id = 7
  DB-->>A: 10
  B->>DB: SELECT stock FROM items WHERE id = 7
  DB-->>B: 10
  A->>DB: UPDATE items SET stock = 9 WHERE id = 7
  A->>DB: COMMIT
  B->>DB: UPDATE items SET stock = 9 WHERE id = 7
  B->>DB: COMMIT
  Note over A,B: Two units sold, stock shows 9. One decrement is lost.` },
        { t: "h", text: "Which level prevents what" },
        { t: "table", head: ["Isolation level", "Dirty read", "Non-repeatable read", "Phantom", "Lost update", "Write skew"], rows: [
          ["Read Uncommitted", "Possible", "Possible", "Possible", "Possible", "Possible"],
          ["Read Committed<br>(default in PostgreSQL, Oracle, SQL Server)", "Prevented", "Possible", "Possible", "Possible", "Possible"],
          ["Repeatable Read in PostgreSQL<br>(snapshot isolation)", "Prevented", "Prevented", "Prevented", "Prevented: the second writer aborts", "<b>Possible</b>"],
          ["Repeatable Read in MySQL InnoDB<br>(MySQL default)", "Prevented", "Prevented for plain SELECTs", "Prevented for plain SELECTs; locking reads take next-key locks", "<b>Possible</b> with plain SELECT then UPDATE", "<b>Possible</b>"],
          ["Serializable", "Prevented", "Prevented", "Prevented", "Prevented", "Prevented"]
        ] },
        { t: "p", html: "<b>PostgreSQL.</b> It accepts <code>READ UNCOMMITTED</code> but treats it as Read Committed, so dirty reads never happen. At Read Committed every <em>statement</em> sees a fresh snapshot. Its Repeatable Read is <b>snapshot isolation</b>: the whole transaction sees the snapshot taken at its first statement. If it tries to update a row that a concurrent transaction changed and committed, it fails with <em>could not serialize access due to concurrent update</em> (first updater wins), and the application must retry." },
        { t: "p", html: "<b>MySQL InnoDB.</b> At Repeatable Read, plain <code>SELECT</code>s read from a snapshot fixed at the first read. But <code>UPDATE</code>, <code>DELETE</code> and <code>SELECT ... FOR UPDATE</code> do a <em>current read</em> of the latest committed row and lock it. Range scans take <b>next-key locks</b> (a record lock plus a lock on the gap before it), which block inserts into the scanned range. The consequence is that a plain SELECT followed by an UPDATE based on it can lose updates without any error. PostgreSQL would have raised one." },
        { t: "p", html: "<b>Serializable.</b> PostgreSQL implements it as <b>Serializable Snapshot Isolation</b> (SSI, since version 9.1). Transactions run on snapshots as before, the engine tracks read-write dependencies, and it aborts one transaction with SQLSTATE <code>40001</code> when a dangerous pattern appears. That is optimistic: little extra blocking, but you must retry. InnoDB's Serializable turns plain SELECTs into shared-locking reads when autocommit is off, which is classic two-phase locking with more waiting and more deadlocks. CockroachDB defaults to Serializable. Oracle's level named SERIALIZABLE is really snapshot isolation and still allows write skew." },
        { t: "diagram", caption: "Write skew: each transaction updates only its own row, so no write conflict fires, yet together they leave nobody on call.", code: `sequenceDiagram
  participant A as Alice txn
  participant DB as Database
  participant B as Bob txn
  Note over A,B: Rule: at least one doctor on call. Both are on call now.
  A->>DB: SELECT count of on-call doctors
  DB-->>A: 2
  B->>DB: SELECT count of on-call doctors
  DB-->>B: 2
  A->>DB: UPDATE doctors SET on_call = false WHERE name = Alice
  B->>DB: UPDATE doctors SET on_call = false WHERE name = Bob
  A->>DB: COMMIT
  B->>DB: COMMIT
  Note over A,B: Different rows written, no conflict detected. Nobody is on call.` },
        { t: "callout", kind: "warn", title: "Repeatable Read is not one thing", html: "The name means different guarantees in the ANSI standard, in PostgreSQL and in MySQL. Code that is safe on PostgreSQL Repeatable Read (lost updates abort) can silently lose updates on MySQL Repeatable Read. When isolation matters, name the database and the level together." },
        { t: "callout", kind: "tip", title: "Always wrap transactions in a retry loop", html: "At Serializable, and at PostgreSQL Repeatable Read, aborts are normal behavior, not errors. Retry on serialization failure (SQLSTATE <code>40001</code>) and on deadlock (<code>40P01</code> in PostgreSQL, error 1213 in MySQL) with a small backoff. Keep transactions short so retries are cheap, and never call an external API while holding a transaction open." },
        { t: "callout", kind: "interview", title: "How to talk about isolation", html: "Name the anomaly, then the cheapest fix: 'Two users can both see seat F8 free and both insert a booking. That is write skew through a phantom, and Read Committed will not stop it. I would either lock the seat row with <code>SELECT ... FOR UPDATE</code>, rely on a unique constraint on <code>(show_id, seat_id)</code>, or run this one transaction at Serializable with retries.'" }
      ]
    },
    {
      id: "mvcc-locking",
      title: "MVCC, pessimistic and optimistic locking",
      minutes: 10,
      blocks: [
        { t: "h", text: "Multi-version concurrency control" },
        { t: "p", html: "With <b>MVCC</b>, an update does not overwrite a row in place from the reader's point of view. The database keeps multiple versions tagged with transaction IDs, and each transaction reads the version visible to its snapshot. The headline benefit is that <b>readers never block writers and writers never block readers</b>. Two writers on the same row still serialize on a row lock. PostgreSQL, MySQL InnoDB, Oracle, CockroachDB and MongoDB's WiredTiger all use MVCC." },
        { t: "list", items: [
          "<b>PostgreSQL</b> writes each new version as a new tuple in the table heap, stamped with <code>xmin</code> and <code>xmax</code> transaction IDs. Old versions become dead tuples that <b>VACUUM</b> (usually autovacuum) reclaims. An UPDATE is effectively an insert plus marking the old tuple dead, which is why update-heavy tables bloat.",
          "<b>InnoDB</b> updates the row in the clustered index and writes the previous version to the <b>undo log</b>. A reader with an older snapshot rebuilds the version it needs by walking undo records, and a purge thread discards undo once no snapshot needs it."
        ] },
        { t: "callout", kind: "warn", title: "Long transactions are an MVCC tax on everyone", html: "A session left <em>idle in transaction</em>, or a six-hour report on the primary, pins the oldest snapshot. PostgreSQL then cannot vacuum any row version that snapshot might need, so tables and indexes bloat. InnoDB's undo history grows and reads slow down. Set <code>idle_in_transaction_session_timeout</code>, and move long analytics to a replica or a warehouse." },
        { t: "h", text: "Pessimistic locking: lock first, then change" },
        { t: "p", html: "<code>SELECT ... FOR UPDATE</code> locks the selected rows until the transaction ends, and other writers (and other <code>FOR UPDATE</code> readers) wait. Two modifiers are worth knowing. <code>NOWAIT</code> fails immediately instead of waiting, which is useful for 'someone else is booking this seat'. <code>SKIP LOCKED</code> skips rows that are already locked, which is the standard way to build a job queue on PostgreSQL or MySQL 8. Lock rows in a consistent order (for example <code>ORDER BY id</code>) to avoid deadlocks." },
        { t: "h", text: "Optimistic locking: change, then check nobody else did" },
        { t: "p", html: "Take no lock. Read the row with a <code>version</code> number, and make the write conditional on the version being unchanged. If the update matches zero rows, someone else got there first: reload and retry, or tell the user. Over HTTP the same idea appears as an <code>ETag</code> plus <code>If-Match</code> header, answered with <code>412 Precondition Failed</code> on conflict." },
        { t: "code", lang: "sql", code: `-- 1. Atomic single statement: best for counters and stock
UPDATE items SET stock = stock - 1
 WHERE id = 7 AND stock >= 1;          -- 0 rows updated means sold out

-- 2. Pessimistic: lock the row, decide, write
BEGIN;
SELECT balance FROM accounts WHERE id = 1 FOR UPDATE;
-- application checks the balance
UPDATE accounts SET balance = balance - 30 WHERE id = 1;
COMMIT;

-- 3. Optimistic: conditional write on a version column
UPDATE products
   SET price = 1999, version = version + 1
 WHERE id = 42 AND version = 17;       -- 0 rows means a conflict: reload, retry` },
        { t: "compare", items: [
          { title: "Pessimistic (FOR UPDATE)", pros: ["Conflicts wait instead of failing, so no wasted work", "Simple to reason about for short critical sections"], cons: ["Blocked writers add latency under contention", "Deadlocks possible; never hold locks across user think time"], use: "Short transactions on hot rows where conflicts are likely: seat holds, balance checks." },
          { title: "Optimistic (version check)", pros: ["No locks held, so high concurrency when conflicts are rare", "Works across HTTP requests and long edits"], cons: ["Every conflict costs a retry or an error shown to the user", "Under heavy contention retries pile up"], use: "Low-contention updates, forms and documents that humans edit, REST APIs with ETags." },
          { title: "Atomic statement", pros: ["One round trip, no explicit locks to manage", "The condition and the write are checked together"], cons: ["Only works when the logic fits in one SQL statement", "Complex rules still need a transaction"], use: "Counters, inventory decrements, compare-and-set on a single row." }
        ] },
        { t: "h", text: "Matching the fix to the anomaly" },
        { t: "table", head: ["Problem", "Cheapest reliable fix"], rows: [
          ["Counter increments get lost", "<code>UPDATE ... SET n = n + 1</code>, or Redis <code>INCR</code> for very hot counters"],
          ["Inventory goes negative", "Conditional atomic update with <code>stock &gt;= 1</code>, then check the row count"],
          ["Two people edit the same record", "Optimistic version column, or ETag with If-Match"],
          ["Write skew on rows that already exist (on-call rule)", "<code>SELECT ... FOR UPDATE</code> on the rows you read, or Serializable"],
          ["Write skew through inserts (overlapping bookings)", "A unique constraint, a PostgreSQL exclusion constraint on time ranges, pre-created rows to lock, or Serializable"],
          ["A report needs one consistent view of many tables", "A read-only transaction at Repeatable Read (snapshot)"]
        ] },
        { t: "callout", kind: "interview", title: "Say why you picked the locking style", html: "'Contention is low and the edit spans minutes of user time, so I use optimistic concurrency with a version column. Holding a row lock across an HTTP round-trip is not an option.' Or: 'Seat holds are short and highly contended, so I lock the exact seat rows with <code>FOR UPDATE NOWAIT</code> and fail fast.'" }
      ]
    },
    {
      id: "indexes",
      title: "Indexes: B-tree, hash, composite and covering",
      minutes: 12,
      blocks: [
        { t: "p", html: "Without an index, finding rows means a <b>full table scan</b>. A 100-million-row table at 200 bytes per row is 20 GB; scanning it at about 1 GB/s takes about 20 seconds. An <b>index</b> is a separate data structure, kept sorted or hashed by some columns, that points to the matching rows. With one, the same lookup takes well under a millisecond when the index pages are in memory." },
        { t: "h", text: "B-tree indexes" },
        { t: "p", html: "Almost every database index is a <b>B+tree</b>: a balanced tree of fixed-size pages (8 KB in PostgreSQL, 16 KB in InnoDB). Internal pages hold separator keys and child pointers. Leaf pages hold the keys in sorted order with a pointer to each row, and every leaf links to its neighbor. Equality lookups walk root to leaf. Range scans, <code>ORDER BY</code> and prefix matches find the first leaf and then follow sibling links." },
        { t: "diagram", caption: "A range query walks one root-to-leaf path, then follows sibling links across leaves without returning to the root.", code: `flowchart TD
  Root["Root page<br/>separators 500 and 1000"] --> I1["Internal page<br/>keys below 500"]
  Root --> I2["Internal page<br/>keys 500 to 999"]
  Root --> I3["Internal page<br/>keys 1000 and up"]
  I2 --> L1["Leaf<br/>keys 500 to 649"]
  I2 --> L2["Leaf<br/>keys 650 to 799"]
  I2 --> L3["Leaf<br/>keys 800 to 999"]
  L1 -.->|"sibling link"| L2
  L2 -.->|"sibling link"| L3
  Q(("Query: id 600 to 700")) -.->|"seek"| Root` },
        { t: "numbers", items: [
          { value: "~500", label: "Keys per 8 KB page (fan-out) for a small key" },
          { value: "3 levels", label: "Enough for ~125 million keys (500 cubed)" },
          { value: "4 levels", label: "Enough for ~60 billion keys" },
          { value: "1 to 2", label: "Disk reads per lookup, since upper levels stay cached" }
        ] },
        { t: "p", html: "<b>Clustered versus heap tables.</b> InnoDB stores each row inside the primary-key B-tree (a <b>clustered index</b>). Its secondary indexes store the primary key rather than a row address, so a secondary lookup walks two trees. That makes primary-key choice matter. Increasing keys (AUTO_INCREMENT, UUIDv7, Snowflake IDs, see Chapter 14) append at the right edge of the tree. Random UUIDv4 keys scatter inserts across the tree, causing page splits and cache misses, and they make every secondary index entry bigger. PostgreSQL stores rows in an unordered heap, and every index, including the primary key, points at a physical tuple location." },
        { t: "p", html: "<b>Hash indexes.</b> A hash index maps <code>hash(key)</code> to a bucket, so equality lookups are O(1) on average. It cannot answer range queries, <code>ORDER BY</code> or prefix matches, because hashing destroys order. PostgreSQL has hash indexes (crash-safe since version 10), but B-trees are usually close enough that few people use them. Hashing shines in in-memory stores such as Redis and Memcached. InnoDB can also build an internal <em>adaptive hash index</em> over hot B-tree pages on its own (off by default since MySQL 8.4)." },
        { t: "h", text: "Composite indexes and the leftmost-prefix rule" },
        { t: "p", html: "An index on <code>(a, b, c)</code> is sorted by <code>a</code>, then by <code>b</code> within equal <code>a</code>, then by <code>c</code>. Think of a phone book sorted by last name, then first name: you can find every Smith, or John Smith, but not every John. The index can seek on any <b>leftmost prefix</b> of its columns. Once a column is used for a range, the columns after it can only filter rows, not narrow the seek." },
        { t: "table", head: ["Query on an index over (tenant_id, status, created_at)", "Index used?", "Why"], rows: [
          ["<code>WHERE tenant_id = 7</code>", "Yes", "Leftmost column"],
          ["<code>WHERE tenant_id = 7 AND status = 'open'</code>", "Yes", "Two-column prefix"],
          ["<code>WHERE tenant_id = 7 AND status = 'open' ORDER BY created_at DESC LIMIT 20</code>", "Yes, with no sort step", "Rows are already in created_at order within the prefix, so it reads 20 entries and stops"],
          ["<code>WHERE tenant_id = 7 AND created_at &gt; now() - interval '1 day'</code>", "Partly", "Seeks on tenant_id; status is skipped, so created_at can only filter inside that tenant's range"],
          ["<code>WHERE status = 'open'</code>", "Usually no", "Not a prefix. MySQL 8 skip scan helps only when tenant_id has few distinct values"]
        ] },
        { t: "callout", kind: "tip", title: "Ordering columns in a composite index", html: "Put <b>equality</b> columns first, then the column you <b>sort</b> by, then <b>range</b> columns (MongoDB documents this as the ESR rule, and it applies to B-trees generally). Among equality columns, lead with the one most queries filter on, so the index serves as many queries as possible." },
        { t: "h", text: "Covering indexes" },
        { t: "p", html: "If an index contains every column a query needs, the database answers from the index alone and never visits the table. PostgreSQL shows this as an <b>Index Only Scan</b> (it works best on recently vacuumed tables, because it checks a visibility map). MySQL shows <em>Using index</em> in EXPLAIN. PostgreSQL 11+ and SQL Server can <code>INCLUDE</code> extra payload columns in the leaf entries without making them part of the sort key." },
        { t: "code", lang: "sql", code: `-- Hot query: a customer's 10 most recent orders
SELECT status, total FROM orders
 WHERE customer_id = 42
 ORDER BY created_at DESC
 LIMIT 10;

-- Seek by customer, rows already in date order, payload in the index:
CREATE INDEX orders_customer_recent
    ON orders (customer_id, created_at DESC)
    INCLUDE (status, total);
-- EXPLAIN: Index Only Scan using orders_customer_recent ... rows=10` },
        { t: "h", text: "Indexes are not free" },
        { t: "list", items: [
          "<b>Write cost.</b> Every INSERT touches every index, so a table with 5 secondary indexes does about 6 B-tree writes per insert. InnoDB updates a secondary index only when its columns change. PostgreSQL is harsher: unless an update qualifies as a cheap HOT (heap-only tuple) update, which requires that no indexed column changed and the page has room, it adds a new entry to <em>every</em> index on the table.",
          "<b>Space and memory.</b> Indexes can rival the table in size, and they compete for the buffer pool. The hot part of every index should fit in RAM.",
          "<b>Low selectivity.</b> An index on a boolean or a three-value status rarely helps on its own. Use a <b>partial index</b>, for example <code>CREATE INDEX ON jobs (run_at) WHERE status = 'pending'</code>.",
          "<b>Find dead weight.</b> PostgreSQL <code>pg_stat_user_indexes.idx_scan</code> and MySQL <code>sys.schema_unused_indexes</code> show indexes nobody reads."
        ] },
        { t: "p", html: "Other index types worth naming: <b>GIN</b> for JSONB, arrays and full-text search in PostgreSQL; <b>GiST</b> for geometry and range types (and exclusion constraints); <b>BRIN</b>, a tiny per-block min/max summary, for huge append-only tables ordered by time; and <b>expression indexes</b> such as <code>lower(email)</code>." },
        { t: "callout", kind: "interview", title: "Every table you draw should come with its indexes", html: "When you write a schema in an interview, list each index next to the query it serves: '<code>(user_id, created_at DESC)</code> for the profile timeline; unique <code>(email)</code> for login.' It shows you think about access patterns, and it heads off the 'how is this query fast?' follow-up." }
      ]
    },
    {
      id: "storage-engines",
      title: "Storage engines: B-trees versus LSM-trees",
      minutes: 12,
      blocks: [
        { t: "p", html: "Under every database sits a <b>storage engine</b> that decides how bytes are laid out on disk. Two families dominate. <b>B-tree engines</b> update pages in place. <b>Log-structured merge-tree (LSM) engines</b> never modify files; they append and merge. That one choice largely decides a database's write throughput, read latency and disk usage." },
        { t: "h", text: "B-tree engines" },
        { t: "p", html: "PostgreSQL, MySQL InnoDB, SQL Server, Oracle and MongoDB's WiredTiger (B-tree by default) belong here. A write appends to the WAL, modifies the page in the buffer pool, and later flushes the whole page to its fixed location: random I/O. A full page splits in two. Torn-page protection adds more writes (InnoDB's doublewrite buffer, PostgreSQL's full-page images after each checkpoint). So changing a 100-byte row can eventually cost a 16 KB page write plus log records. Reads are predictable: each key lives in exactly one place, one root-to-leaf path away." },
        { t: "h", text: "LSM-tree engines" },
        { t: "steps", items: [
          { title: "Append to the commit log", html: "Each write is appended to a write-ahead log (Cassandra calls it the commit log) so it survives a crash. This is sequential I/O." },
          { title: "Insert into the memtable", html: "The write goes into an in-memory sorted structure, often a skip list. Nothing is read first, and an update is just a newer entry." },
          { title: "Flush to an SSTable", html: "When the memtable fills (RocksDB's default write buffer is 64 MB), it is frozen and written out sequentially as an immutable <b>SSTable</b> (sorted string table) with a sparse index and a Bloom filter." },
          { title: "Compact in the background", html: "Compaction merge-sorts SSTables, keeps only the newest version of each key, and drops deleted data and expired tombstones. This is where the engine pays for its cheap writes." }
        ] },
        { t: "diagram", caption: "Writes only ever append; reads check the memtable first, then SSTables from newest to oldest, skipping files whose Bloom filter rules the key out.", code: `flowchart LR
  W(("Write")) -->|"1. append"| CL[("Commit log")]
  W -->|"2. insert"| MT["Memtable<br/>sorted, in RAM"]
  MT -->|"3. flush when full"| S0[("Level 0 SSTables")]
  S0 -->|"4. compaction"| S1[("Level 1 SSTables")]
  S1 -->|"compaction"| S2[("Level 2 SSTables")]
  R(("Read")) -->|"a. newest data"| MT
  R -->|"b. Bloom filter, then index"| S0
  R -.->|"c. older levels"| S1` },
        { t: "p", html: "<b>Reads</b> are the weak spot. A point lookup may have to check the memtable and several SSTables. Bloom filters make this cheap for keys a file does not contain: about 10 bits per key gives roughly a 1% false-positive rate, so most files are skipped without a disk read. Range scans cannot use Bloom filters and must merge iterators from every level, so they cost more than on a B-tree." },
        { t: "p", html: "<b>Deletes</b> write a <b>tombstone</b>, a marker that hides older values until compaction removes both. Cassandra keeps tombstones for <code>gc_grace_seconds</code> (10 days by default) so that replicas which missed the delete do not bring the data back. A query that scans many tombstones is slow; Cassandra warns at 1,000 tombstones per query and aborts at 100,000 by default. Queue-like tables, where you insert and then delete, are a classic Cassandra anti-pattern for this reason." },
        { t: "h", text: "Compaction strategies" },
        { t: "table", head: ["Strategy", "How it works", "Best for", "Cost"], rows: [
          ["<b>Size-tiered</b> (Cassandra's long-time default)", "Merge several similar-sized SSTables into one bigger one", "Write-heavy, insert-mostly data", "A key's versions spread over many files, so read amplification is higher; large merges temporarily need up to about 2x disk space"],
          ["<b>Leveled</b> (RocksDB and LevelDB default)", "Each level is about 10x larger than the previous one; SSTables within a level do not overlap, so a read checks about one file per level", "Read-heavy or update-heavy data", "Data is rewritten as it moves down the levels, so write amplification is higher, often 10x or more"],
          ["<b>Time-window</b> (Cassandra and ScyllaDB TWCS)", "Group SSTables by time window and never merge across windows; a whole window is dropped once its TTL expires", "Time series with a TTL", "Breaks down when data arrives late or rows are updated after their window closes"]
        ] },
        { t: "h", text: "The three amplifications" },
        { t: "list", items: [
          "<b>Write amplification</b>: bytes written to disk divided by bytes the application wrote. It burns disk bandwidth and SSD endurance.",
          "<b>Read amplification</b>: disk reads per query. It drives tail latency.",
          "<b>Space amplification</b>: bytes on disk divided by live data size, inflated by stale versions, tombstones and half-empty pages.",
          "You cannot minimize all three at once. Each engine and compaction strategy picks a point in that triangle, and that is the trade-off to state in an interview."
        ] },
        { t: "compare", items: [
          { title: "B-tree engine", pros: ["Fast, predictable point reads and range scans", "Each key in one place, which makes range locks and transactions straightforward", "Mature tooling: PostgreSQL, MySQL"], cons: ["Random writes and page splits", "A small row change rewrites a whole page", "Fragmentation leaves pages partly empty"], use: "Read-heavy or mixed OLTP with transactions and secondary indexes: the default for most product databases." },
          { title: "LSM-tree engine", pros: ["Very high write throughput from sequential I/O", "Compresses well because files are immutable and densely packed", "No read before write"], cons: ["Read amplification, mitigated by Bloom filters and compaction", "Compaction uses CPU and I/O and can cause latency spikes", "Tombstones and more tuning knobs"], use: "Write-heavy workloads such as messages, events, metrics and IoT: Cassandra, ScyllaDB, HBase, RocksDB, CockroachDB's Pebble, TiKV." }
        ] },
        { t: "callout", kind: "example", title: "Facebook's MyRocks", html: "Facebook built MyRocks, a RocksDB storage engine for MySQL, and moved its main user database to it. It reported roughly halving storage compared with compressed InnoDB and greatly reducing write amplification on flash. The SQL layer stayed the same; only the engine underneath changed." },
        { t: "callout", kind: "interview", title: "Why are Cassandra writes so fast?", html: "Give the mechanism, then the bill: 'A write is a commit-log append plus a memtable insert. No page is read or rewritten in place. The cost shows up later as compaction I/O, read amplification across SSTables and tombstones, so I pick the compaction strategy to match the workload.'" }
      ]
    },
    {
      id: "nosql-families",
      title: "NoSQL families and what each is for",
      minutes: 12,
      blocks: [
        { t: "p", html: "<b>NoSQL</b> is an umbrella term for non-relational stores. Many grew out of Google's Bigtable paper (2006) and Amazon's Dynamo paper (2007), built to scale horizontally across commodity machines and to hold data that did not fit rigid schemas. Each family is optimized for a particular access pattern and gives up something to get there, usually joins, ad-hoc queries or multi-row transactions." },
        { t: "table", head: ["Family", "Data model", "Examples", "Strong at", "Weak at"], rows: [
          ["Key-value", "Opaque value under a key (optionally a sort key)", "DynamoDB, Redis, Riak, etcd", "O(1) lookups at any scale, predictable latency", "Queries by anything other than the key"],
          ["Document", "JSON-like documents with nested fields", "MongoDB, Couchbase, Firestore", "Self-contained aggregates, flexible schema, secondary indexes", "Joins and cross-document invariants"],
          ["Wide-column", "Partition key to sorted rows of columns", "Cassandra, ScyllaDB, HBase, Bigtable", "Huge write rates, time-ordered reads within a partition", "Ad-hoc queries, joins, secondary indexes"],
          ["Graph", "Nodes and edges, both with properties", "Neo4j, Amazon Neptune, JanusGraph", "Multi-hop traversals and path queries", "Bulk scans and aggregates; sharding the graph"],
          ["Time-series", "Series of timestamped values identified by tags", "InfluxDB, TimescaleDB, Prometheus", "Append-heavy ingest, compression, downsampling, retention", "Updates, high-cardinality tags"],
          ["Search", "Inverted index over documents", "Elasticsearch, OpenSearch, Solr", "Full-text relevance, fuzzy matching, facets", "Acting as the system of record; read-your-writes"]
        ] },
        { t: "h", text: "Key-value: DynamoDB" },
        { t: "p", html: "DynamoDB is a managed key-value and document store. Every item has a <b>partition key</b>, which picks the internal partition, and an optional <b>sort key</b>. Items sharing a partition key are stored sorted by sort key, so <code>Query</code> can fetch ranges such as 'all orders for user 42 in March' in a single request. It offers single-digit-millisecond latency, items up to 400 KB, global secondary indexes (always eventually consistent) and local secondary indexes, and reads that are eventually consistent by default with an opt-in strongly consistent mode. Multi-item ACID writes are available through <code>TransactWriteItems</code>. You model around access patterns up front, often with several entity types in one table." },
        { t: "h", text: "Document: MongoDB" },
        { t: "p", html: "MongoDB stores BSON documents (up to 16 MB each) in collections, with rich secondary indexes and an aggregation pipeline. It has supported multi-document ACID transactions since 4.0 on replica sets and 4.2 on sharded clusters. Model data that is read together as one document. Do not embed unbounded arrays, such as every comment on a viral post; those belong in their own collection." },
        { t: "code", lang: "json", code: `{
  "_id": "order_8812",
  "user_id": 42,
  "status": "shipped",
  "placed_at": "2026-03-14T10:22:00Z",
  "shipping_address": { "city": "Pune", "zip": "411001" },
  "items": [
    { "sku": "KB-104", "qty": 1, "price_cents": 4999 },
    { "sku": "MS-220", "qty": 2, "price_cents": 1999 }
  ],
  "total_cents": 8997
}` },
        { t: "h", text: "Wide-column: Cassandra and friends" },
        { t: "p", html: "In Cassandra, ScyllaDB, HBase and Bigtable, the <b>partition key</b> decides which nodes own the data, and <b>clustering columns</b> keep rows sorted inside a partition. You design one table per query (query-first modeling) and accept duplicated data across tables. Writes are cheap because the engine is an LSM-tree. Keep partitions bounded, with a common rule of thumb of under about 100 MB, by adding a time bucket to the partition key." },
        { t: "code", lang: "sql", code: `-- CQL: one partition per channel per time bucket, newest messages first
CREATE TABLE messages (
  channel_id  bigint,
  bucket      int,        -- e.g. 10-day window number, bounds partition size
  message_id  bigint,     -- time-sortable Snowflake ID
  author_id   bigint,
  body        text,
  PRIMARY KEY ((channel_id, bucket), message_id)
) WITH CLUSTERING ORDER BY (message_id DESC);` },
        { t: "callout", kind: "example", title: "Discord's message store", html: "Discord stored messages in Cassandra, partitioned by channel and a time bucket and clustered by Snowflake message ID, which is essentially the table above. As the cluster grew to trillions of messages, garbage-collection pauses and hot partitions hurt latency, and in 2022 it migrated to ScyllaDB, a Cassandra-compatible engine written in C++." },
        { t: "h", text: "Graph, time-series and search" },
        { t: "p", html: "<b>Graph databases</b> such as Neo4j make a traversal cost proportional to the neighborhood visited, not to the total graph size. They fit fraud rings, recommendations and knowledge graphs, queried with languages like Cypher. Note that most social products do <em>not</em> use a graph database for the social graph. Facebook's TAO is a graph-shaped cache over sharded MySQL, because nearly all queries are one hop." },
        { t: "p", html: "<b>Time-series databases</b> exploit append-only, time-ordered writes. TimescaleDB, a PostgreSQL extension, splits a <em>hypertable</em> into time chunks, compresses old chunks and maintains continuous aggregates. InfluxDB and Prometheus are purpose-built engines. Typical tricks are delta-of-delta timestamps and XOR-encoded floats (Facebook's Gorilla paper reported about 1.37 bytes per point), retention by dropping whole chunks, and downsampling old data. The limit is usually <b>cardinality</b>, the number of distinct series." },
        { t: "p", html: "<b>Search engines</b> such as Elasticsearch and OpenSearch (built on Lucene) maintain an inverted index for full-text relevance and facets. New documents become searchable after a refresh, one second by default, so they are near-real-time. They are usually fed from the primary database through change data capture rather than being the system of record. Chapter 10 covers their internals." },
        { t: "callout", kind: "warn", title: "Two myths to avoid", html: "'NoSQL is schemaless': the schema moved into your code, and migrations become application logic. 'SQL does not scale': YouTube and Slack run sharded MySQL through Vitess, and distributed SQL databases (Spanner, CockroachDB, TiDB, YugabyteDB) shard automatically with serializable transactions. Choose by access pattern and consistency needs, not by slogan." }
      ]
    },
    {
      id: "choosing-a-database",
      title: "ACID vs BASE, normalization, and choosing a database",
      minutes: 11,
      blocks: [
        { t: "h", text: "ACID versus BASE" },
        { t: "p", html: "<b>BASE</b> stands for <b>B</b>asically <b>A</b>vailable, <b>S</b>oft state, <b>E</b>ventually consistent. It describes the stance of many early NoSQL stores: keep accepting reads and writes during failures, let replicas disagree for a while, and converge later. Conflict handling moves to the application. ACID describes the opposite stance: strong per-transaction guarantees, even if that sometimes means waiting or refusing a request." },
        { t: "compare", items: [
          { title: "ACID", pros: ["Invariants enforced by the database", "Simple mental model for developers", "Multi-row transactions"], cons: ["Coordination costs latency, especially across regions", "Harder to scale writes beyond one primary without distributed SQL"], use: "Money, inventory, bookings, identity: anything where a wrong answer is worse than a slow one." },
          { title: "BASE", pros: ["Stays writable through node and network failures", "Low latency and linear horizontal scale"], cons: ["Readers may see stale or conflicting data", "The application must handle conflicts and retries"], use: "Feeds, likes, carts, sensor data, logs: anything where stale for a second is acceptable." }
        ] },
        { t: "p", html: "The line has blurred. DynamoDB and MongoDB now offer multi-item transactions. Cassandra offers <b>lightweight transactions</b> (<code>INSERT ... IF NOT EXISTS</code>, <code>UPDATE ... IF col = x</code>), implemented with Paxos and costing several round trips. Spanner and CockroachDB give serializable ACID across shards and regions. So decide per operation, not per company: the payment path can be ACID while the activity feed is eventually consistent. Replication and consistency models get their own treatment in Chapters 7 and 8." },
        { t: "h", text: "Normalization versus denormalization" },
        { t: "p", html: "<b>Normalization</b> stores each fact exactly once. Third normal form, informally, means every non-key column depends on the key, the whole key, and nothing but the key. Writes touch one row, nothing can drift out of sync, and storage is compact. The price is that reads need joins." },
        { t: "p", html: "<b>Denormalization</b> copies data to where it is read: <code>author_name</code> on every post, a <code>like_count</code> column instead of <code>COUNT(*)</code>, a precomputed feed. Reads become a single lookup, but every change now fans out to many rows, and you need a way to keep the copies in sync: the same transaction, a trigger, or change data capture events (Chapter 9). Some copies are actually correct modeling. An order should keep a snapshot of the shipping address and price at purchase time, because those are historical facts." },
        { t: "callout", kind: "tip", title: "Where each approach belongs", html: "In a relational database, normalize by default and denormalize a specific hot read path once measurements show the join is the bottleneck. In DynamoDB or Cassandra there are no joins, so you denormalize by design: list the access patterns first, then build one table or index per pattern." },
        { t: "h", text: "How to choose" },
        { t: "list", ordered: true, items: [
          "<b>Access patterns</b>: by key, by key plus range, ad-hoc filters, full text, multi-hop relationships, time-range aggregates?",
          "<b>Load</b>: read/write ratio, peak QPS, and how bursty it is.",
          "<b>Size and growth</b>: does it fit on one primary for the next 2 to 3 years?",
          "<b>Consistency</b>: which operations need transactions or invariants, and which tolerate staleness?",
          "<b>Latency</b>: p99 targets, and whether users are in one region or many.",
          "<b>Operations</b>: managed service available, team expertise, cost per GB and per request."
        ] },
        { t: "table", head: ["Requirement or access pattern", "Good default", "Why", "Watch out for"], rows: [
          ["Multi-row invariants: money, inventory, bookings", "PostgreSQL or MySQL", "Transactions, constraints, joins, mature tooling", "Write scaling beyond one primary (shard with Vitess or Citus, or move to distributed SQL)"],
          ["Global strong consistency at large scale", "Spanner or CockroachDB", "Serializable transactions across shards and regions", "Cross-region commit latency of tens to hundreds of ms"],
          ["Lookups by key at huge scale with steady latency", "DynamoDB, or Cassandra", "Horizontal partitioning, single-digit ms", "Hot partitions; access patterns must be known up front"],
          ["Append-heavy writes read by partition and time", "Cassandra or ScyllaDB", "LSM writes, clustering order, tunable consistency", "Unbounded partitions, tombstones, no joins"],
          ["Self-contained aggregates with varied attributes", "MongoDB, or PostgreSQL JSONB", "Flexible schema, indexes on nested fields", "Unbounded arrays; cross-document invariants"],
          ["Metrics and sensor data with retention", "TimescaleDB, InfluxDB, Prometheus", "Compression, downsampling, chunk-based retention", "Tag cardinality"],
          ["Full-text search and facets", "Elasticsearch or OpenSearch, fed by CDC", "Inverted index and relevance ranking", "Not a system of record; refresh lag"],
          ["Multi-hop relationship queries", "Neo4j or Neptune", "Traversal cost scales with the neighborhood visited", "Sharding the graph; bulk analytics"],
          ["Sessions, rate limits, leaderboards", "Redis", "In-memory, rich data structures", "RAM cost; persistence is best-effort"]
        ] },
        { t: "diagram", caption: "Start from the dominant access pattern; most real systems end up with a relational core plus one or two specialized stores.", code: `flowchart TD
  S["What is the dominant access pattern?"] --> T["Multi-row invariants:<br/>money, stock, bookings"]
  S --> K["Key lookups at huge scale"]
  S --> W["Append-heavy writes<br/>read by partition and time"]
  S --> F["Full-text search and facets"]
  S --> G["Multi-hop relationships"]
  S --> M["Metrics with retention"]
  T --> PG[("PostgreSQL or MySQL<br/>Spanner or CockroachDB if global")]
  K --> DY[("DynamoDB or Cassandra<br/>Redis if it fits in RAM")]
  W --> CA[("Cassandra or ScyllaDB")]
  F --> ES[("Elasticsearch<br/>fed by CDC")]
  G --> NJ[("Neo4j or Neptune")]
  M --> TS[("TimescaleDB or InfluxDB")]` },
        { t: "callout", kind: "interview", title: "Default to boring, justify the exception", html: "A strong answer: 'Orders and payments go in PostgreSQL because I need transactions across the order, its line items and the inventory. Product search goes in Elasticsearch fed by CDC, because users need relevance-ranked text search. I would only move orders off PostgreSQL if writes outgrew a single primary, and at our estimate of 2k writes per second they do not.' Name the requirement that forces each store." }
      ]
    }
  ],
  takeaways: [
    "ACID is four separate promises: atomicity (all-or-nothing via the log), consistency (your invariants, helped by constraints), isolation (concurrency control) and durability (WAL fsync before COMMIT returns).",
    "PostgreSQL defaults to Read Committed and MySQL InnoDB to Repeatable Read. Neither prevents write skew; only Serializable, explicit row locks or constraints do.",
    "Lost update: fix with an atomic <code>UPDATE ... SET n = n + 1</code>, <code>SELECT ... FOR UPDATE</code> or a version check. Write skew: fix with Serializable, locking the rows you read, or a unique or exclusion constraint.",
    "MVCC lets readers and writers proceed without blocking each other; long-running transactions pay for it in bloat.",
    "Use pessimistic locks for short, highly contended transactions, and optimistic version checks for low contention or anything that spans user think time.",
    "Composite indexes follow the leftmost-prefix rule: equality columns first, then the sort column, then range columns. A covering index answers a query without touching the table.",
    "Every index speeds up some reads and slows down every write; name the query each index serves.",
    "B-trees update in place, giving predictable reads and random writes. LSM-trees append and compact, giving high write throughput at the cost of read and space amplification.",
    "Pick NoSQL by access pattern: key-value for key lookups, document for self-contained aggregates, wide-column for huge append-heavy partitions, graph for multi-hop traversals, time-series for metrics, search for text.",
    "Default to a normalized relational database, denormalize specific hot read paths, and name the requirement that pushes any data to another store."
  ],
  mcqs: [
    {
      q: "A transfer debits account A and credits account B in one transaction. The server crashes after the debit is written but before COMMIT. Which ACID property guarantees that the debit is undone on restart?",
      options: ["Atomicity", "Consistency", "Isolation", "Durability"],
      answer: 0,
      explain: "Atomicity means all-or-nothing: on recovery the engine uses its log to roll back work that never committed. Durability is the opposite promise, that work which <em>did</em> commit survives the crash.",
      level: "easy"
    },
    {
      q: "Two web requests read <code>likes = 10</code> for the same post, each adds 1 in application code, and each writes back <code>likes = 11</code>. What anomaly is this?",
      options: ["Dirty read", "Phantom read", "Lost update", "Write skew"],
      answer: 2,
      explain: "Both transactions did a read-modify-write on the same row, and the second write overwrote the first. Write skew is the related case where the two transactions write <em>different</em> rows. The cheapest fix is an atomic <code>UPDATE posts SET likes = likes + 1</code>.",
      level: "easy"
    },
    {
      q: "What are the default isolation levels of PostgreSQL and MySQL with InnoDB?",
      options: ["PostgreSQL and InnoDB both default to Repeatable Read", "PostgreSQL: Read Committed; InnoDB: Repeatable Read", "PostgreSQL: Serializable; InnoDB: Read Committed", "PostgreSQL: Repeatable Read; InnoDB: Read Committed"],
      answer: 1,
      explain: "PostgreSQL, like Oracle and SQL Server, defaults to Read Committed; InnoDB defaults to Repeatable Read. The same application code can be safe on one and racy on the other, so always name the database when discussing isolation.",
      level: "easy"
    },
    {
      q: "Which database family fits a query like 'find people within 3 hops of me who follow the same artists', computed on demand?",
      options: ["A wide-column store such as Cassandra", "A key-value store such as Redis", "A time-series database such as InfluxDB", "A graph database such as Neo4j"],
      answer: 3,
      explain: "Graph databases store relationships as first-class edges, so a multi-hop traversal costs roughly the size of the neighborhood visited. In relational or wide-column stores each hop is another join or round of lookups, and the cost explodes with depth.",
      level: "easy"
    },
    {
      q: "You store <code>author_name</code> on every post row to avoid a join on the feed page. What is the main cost you take on?",
      options: ["Each feed read must now lock the author's row in the users table", "The posts table loses its primary key, since rows are no longer unique", "Posts can no longer be indexed by author once the foreign key is gone", "Each rename must update many rows, or the copies drift apart"],
      answer: 3,
      explain: "Denormalization moves cost from reads to writes: one fact now lives in many places, so every change fans out, and you need a mechanism (same transaction, trigger or CDC) to keep the copies in sync. Reads get faster, and the table keeps its primary key and can still be indexed by author.",
      level: "easy"
    },
    {
      q: "A table has a composite B-tree index on <code>(tenant_id, status, created_at)</code>. Which query <b>cannot</b> use the index to seek directly to its rows?",
      options: ["<code>WHERE tenant_id = 7</code>", "<code>WHERE tenant_id = 7 AND status = 'open' ORDER BY created_at DESC LIMIT 20</code>", "<code>WHERE status = 'open' AND created_at &gt; '2026-01-01'</code>", "<code>WHERE tenant_id = 7 AND status = 'open'</code>"],
      answer: 2,
      explain: "The index is sorted by <code>tenant_id</code> first, so without a predicate on it there is no contiguous range to seek to (the leftmost-prefix rule). The second option is ideal: two equality columns, then rows already in <code>created_at</code> order, so there is no sort step.",
      level: "medium"
    },
    {
      q: "<code>SELECT status, total FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 10</code> uses an index on <code>customer_id</code>, then reads every matching row from the table and sorts them. What is the best fix?",
      options: ["Replace it with a hash index on <code>customer_id</code> for O(1) lookups", "Index <code>(customer_id, created_at)</code> and include <code>status</code> and <code>total</code>", "Add single-column indexes on <code>created_at</code>, <code>status</code> and <code>total</code>", "Partition the orders table by <code>status</code> so each query scans less"],
      answer: 1,
      explain: "Ordering by <code>created_at</code> within each customer removes the sort and lets the database stop after 10 entries, and including the selected columns makes the index covering, so it never touches the table. Separate single-column indexes cannot provide that order or that coverage.",
      level: "medium"
    },
    {
      q: "A B+tree index uses 8 KB pages with a fan-out of about 500. Roughly how many levels does it need for 100 million rows?",
      options: ["About 3", "About 7", "About 27", "About 100"],
      answer: 0,
      explain: "Each level multiplies capacity by about 500: 500 squared is 250,000 and 500 cubed is 125 million, so three levels are enough. 27 is the depth of a binary tree, which is why databases use wide pages. With the top levels cached, a lookup costs one or two disk reads.",
      level: "medium"
    },
    {
      q: "A sensor fleet writes 300k small readings per second, almost never updates them, and queries recent ranges per sensor. Why does an LSM-tree engine such as Cassandra or RocksDB suit this better than a B-tree engine?",
      options: ["LSM-trees update rows in place on disk, so they avoid write amplification", "LSM-trees keep each key in exactly one file, so range scans read a single file", "LSM-trees make every read a single disk seek regardless of data size", "LSM-trees buffer writes in memory and flush sorted files sequentially"],
      answer: 3,
      explain: "An LSM engine appends to a log and a memtable, then writes immutable sorted SSTables sequentially, so it absorbs high write rates without random page updates. The price is read amplification and background compaction; in-place updates describe B-trees, not LSM-trees.",
      level: "medium"
    },
    {
      q: "An admin opens a product edit form, works on it for several minutes, then clicks Save. Two admins sometimes edit the same product. Which concurrency control fits best?",
      options: ["Take <code>SELECT ... FOR UPDATE</code> when the form opens and release it on Save", "Run the save at Read Uncommitted so it never waits on other writers", "Check a <code>version</code> column in the <code>UPDATE ... WHERE</code> clause and reject stale saves", "Let the last write win, since the later Save holds the newest data"],
      answer: 2,
      explain: "Optimistic locking suits low contention and long think time: no lock is held while the person edits, and if the conditional update matches no row, the save is rejected as a conflict. Holding a row lock across HTTP requests and minutes of user time blocks other writers and leaks locks when browsers close.",
      level: "medium"
    },
    {
      q: "A reporting job on a busy PostgreSQL primary keeps one transaction open for 6 hours. What side effect should you expect on heavily updated tables?",
      options: ["Writers on those tables block until the report's transaction commits", "Dead row versions pile up, as VACUUM must keep any the old snapshot may need", "Row locks taken by the updaters escalate to table locks until the report ends", "The WAL is truncated early, so commits made during the report lose durability"],
      answer: 1,
      explain: "Under MVCC readers do not block writers, but the oldest open snapshot pins every row version it might still need, so VACUUM cannot reclaim them and tables and indexes bloat. PostgreSQL never escalates row locks to table locks. Run long reports on a replica or in short chunks, and set <code>idle_in_transaction_session_timeout</code>.",
      level: "medium"
    },
    {
      q: "An InnoDB table uses random UUIDv4 primary keys and has 6 secondary indexes. Once the table outgrows the buffer pool, insert throughput collapses. What is the best explanation?",
      options: ["Random keys scatter inserts across the clustered index, causing page splits and cache misses", "B-trees cannot order 128-bit UUIDs, so InnoDB checks uniqueness with a full table scan on insert", "InnoDB takes a table-level AUTO-INC lock for every UUID insert, serializing the writers", "Each secondary index on a UUID-keyed table is rebuilt from scratch after every insert"],
      answer: 0,
      explain: "InnoDB clusters rows by primary key, so random keys land on random pages that must be read into memory and often split, while increasing keys append at the right edge. Every secondary index entry also stores the primary key. Time-ordered IDs such as UUIDv7 or Snowflake (Chapter 14) keep inserts local.",
      level: "hard"
    },
    {
      q: "Rule: at least one doctor must be on call. Alice and Bob are both on call. Each runs a transaction at PostgreSQL Repeatable Read that counts on-call doctors (gets 2), then sets their own row to off call. Both commit. What happened, and what prevents it?",
      options: ["A lost update; Repeatable Read's first-updater-wins check already prevents it", "A dirty read; switching both transactions to Read Committed prevents it", "Write skew; run at Serializable with retries, or read the rows <code>FOR UPDATE</code>", "A non-repeatable read; re-running the count just before COMMIT prevents it"],
      answer: 2,
      explain: "Each transaction wrote a different row, so snapshot isolation sees no write-write conflict, yet together they break the invariant: that is write skew. PostgreSQL's Serializable (SSI) detects the dependency and aborts one transaction, and <code>FOR UPDATE</code> on the on-call rows also serializes them. Re-counting does not help, because the snapshot never changes.",
      level: "hard"
    },
    {
      q: "On MySQL InnoDB at Repeatable Read, two transactions each run a plain <code>SELECT balance</code> (both see 100), compute 100 - 30 in the app, and run <code>UPDATE accounts SET balance = 70</code>. What happens?",
      options: ["The second UPDATE fails with a serialization error, exactly as it would in PostgreSQL", "Both commit and one withdrawal is lost; use <code>FOR UPDATE</code> or <code>SET balance = balance - 30</code>", "InnoDB detects a deadlock between the two UPDATEs and rolls one transaction back", "The second UPDATE matches zero rows, because its snapshot predates the first commit"],
      answer: 1,
      explain: "InnoDB's UPDATE does a current read of the latest committed row: the second transaction waits for the first's row lock, then overwrites 70 with 70. PostgreSQL Repeatable Read would instead abort the second writer with <em>could not serialize access due to concurrent update</em>. A locking read or a relative update fixes it.",
      level: "hard"
    },
    {
      q: "A Cassandra table using size-tiered compaction gets frequent updates to the same rows, and reads are slow because each one merges data from many SSTables. Which change most directly cuts read amplification, and what does it cost?",
      options: ["Switch to leveled compaction; reads check about one SSTable per level, but write amplification rises", "Switch to time-window compaction; it merges all windows into one file, but uses more disk while merging", "Shrink the memtable so data flushes sooner and reads hit fewer SSTables, but flushes run more often", "Raise <code>gc_grace_seconds</code> so reads can skip tombstoned rows, but deleted data stays on disk longer"],
      answer: 0,
      explain: "Leveled compaction keeps SSTables non-overlapping within each level, bounding how many files can hold a key, at the price of higher write amplification and compaction I/O. Time-window compaction never merges across windows and suits append-only TTL data, a smaller memtable creates <em>more</em> SSTables, and keeping tombstones longer gives reads more to merge, not less.",
      level: "hard"
    }
  ],
  design: [
    {
      id: "design-ticket-booking-data",
      title: "Design the data layer for a movie ticket booking system",
      level: "Medium",
      prompt: "Design the data layer for a movie ticket booking service like BookMyShow or Fandango. Users browse shows, pick specific seats on a seat map, hold them for a few minutes while they pay, and receive a confirmed booking. The hard requirement: a seat must never be sold twice, even when thousands of people rush a blockbuster's opening show.",
      clarify: [
        "Do users pick specific seats, or is it general admission with a count?",
        "How long should a seat hold last before it is released, and can it be extended?",
        "What is the peak: how many people hit the most popular show in the first minute of sales?",
        "Are seats also sold through other channels, such as the cinema box office or partner apps?",
        "How does payment work: authorize then capture, and who handles refunds?",
        "Must the seat map be exactly up to date, or is a second or two of staleness acceptable?"
      ],
      hints: [
        "Find the exact moment two users can collide, and name the anomaly. Why does 'check the seat is free, then insert a booking' fail at Read Committed?",
        "Give the conflict a row to lock: pre-create one row per seat per show when the show is scheduled.",
        "Claim seats with a statement that checks and writes in one step, such as <code>SELECT ... FOR UPDATE NOWAIT</code> in seat order, or a conditional UPDATE whose row count you check.",
        "Model the hold as a <code>held_until</code> column. Confirmation succeeds only if the hold is still yours and unexpired, and the booking call carries an idempotency key.",
        "Seat-map reads vastly outnumber holds. Cache them and accept slight staleness, because the write path re-checks everything."
      ],
      solution: [
        { t: "h", text: "Requirements" },
        { t: "list", items: [
          "<b>Functional</b>: list shows; view a seat map with live-ish availability; hold 1 to 10 seats for 10 minutes; confirm with payment; cancel.",
          "<b>Non-functional</b>: zero double bookings (strong consistency on seat inventory); hold or confirm p99 under 300 ms; seat map p99 under 200 ms; booking path available at 99.95%; survive opening-day spikes of 50x average."
        ] },
        { t: "h", text: "Estimates" },
        { t: "code", lang: "text", code: `Inventory
  3,000 screens x 5 shows/day x 250 seats = 3.75M show-seat rows per day
  scheduled 7 days ahead                  = ~26M live rows x ~100 B = ~2.6 GB (fits in RAM)

Bookings
  2M bookings/day, 2.5 seats each
  average  = 2M / 86,400        = ~23 bookings/s
  peak 50x                      = ~1,200 hold attempts/s system-wide
  storage  = 2M x ~300 B        = ~600 MB/day = ~220 GB/year

Seat-map reads
  ~10 seat-map views per booking = 20M/day = ~230/s average, ~12k/s at peak

Conclusion: one PostgreSQL primary handles the write volume. The hard parts are
correctness under contention on a single show, and read scale for seat maps.` },
        { t: "h", text: "API" },
        { t: "code", lang: "http", code: `GET  /v1/shows/{show_id}/seats
     -> 200 { seats: [ { id: "F7", status: "available", price_cents: 25000 }, ... ] }

POST /v1/shows/{show_id}/holds          { "seat_ids": ["F7", "F8"] }
     -> 201 { hold_id, expires_at }   |   409 { unavailable: ["F8"] }

POST /v1/bookings                        Idempotency-Key: 6f1c...
     { "hold_id": "...", "payment_token": "..." }
     -> 201 { booking_id, status: "confirmed" }   |   410 hold expired

DELETE /v1/holds/{hold_id}              -> 204 (user backed out)` },
        { t: "h", text: "Data model" },
        { t: "p", html: "PostgreSQL, because the core operation is a multi-row invariant (all requested seats or none, never two owners) that needs transactions, row locks and constraints. Static catalog data (movies, cinemas, screens, seat layouts) lives in ordinary normalized tables. The key table is <code>show_seats</code>: one pre-created row per seat per show, which gives every potential conflict a row to lock." },
        { t: "code", lang: "sql", code: `CREATE TABLE show_seats (
  show_id     bigint NOT NULL REFERENCES shows,
  seat_id     text   NOT NULL,                      -- 'F7'
  price_cents int    NOT NULL,
  status      text   NOT NULL DEFAULT 'available'
              CHECK (status IN ('available', 'held', 'booked')),
  hold_id     uuid,
  held_until  timestamptz,
  booking_id  bigint,
  PRIMARY KEY (show_id, seat_id)                    -- also serves the seat-map query
);
CREATE INDEX show_seats_expiring ON show_seats (held_until)
  WHERE status = 'held';                            -- small partial index for the sweeper

CREATE TABLE bookings (
  booking_id      bigint PRIMARY KEY,
  user_id         bigint NOT NULL,
  show_id         bigint NOT NULL,
  status          text   NOT NULL,                  -- confirmed, cancelled, refunded
  amount_cents    int    NOT NULL,
  idempotency_key text   UNIQUE,                    -- retried POST returns the same booking
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON bookings (user_id, created_at DESC); -- 'my bookings' page` },
        { t: "h", text: "High-level design" },
        { t: "diagram", caption: "All seat state changes go through short transactions on the primary; seat-map reads come from a cache that may be a second or two stale.", code: `flowchart LR
  U(("User")) --> API["Booking API"]
  API -->|"seat map read"| RC[("Redis<br/>seat map, 2s TTL")]
  RC -.->|"on miss"| RR[("Read replica")]
  API -->|"hold and confirm"| PG[("PostgreSQL primary<br/>show_seats, bookings")]
  PG -.->|"async replication"| RR
  API -->|"authorize and capture"| PAY["Payment provider"]
  SW["Hold sweeper"] -->|"release expired holds"| PG
  PG -.->|"CDC"| K[["Kafka: booking events"]]
  K --> N["Tickets, email, analytics"]` },
        { t: "p", html: "<b>Read path</b>: the seat map is read from Redis, which is populated from a replica with a 2-second TTL. Availability shown to users can be slightly stale, which is acceptable because the hold transaction re-checks every seat. <b>Hold path</b>: one short transaction on the primary locks the requested seat rows, verifies they are all available (or holding an expired hold), and marks them held for 10 minutes. <b>Confirm path</b>: authorize the payment, then in one transaction flip the held seats to booked and insert the booking, then capture the payment. Booking events flow out through CDC to ticketing and email." },
        { t: "h", text: "Deep dive 1: making double booking impossible" },
        { t: "table", head: ["Approach", "Verdict"], rows: [
          ["Check with SELECT, then INSERT a booking, at Read Committed", "<b>Broken.</b> Two transactions both see F8 free and both insert. This is write skew through a phantom."],
          ["Unique constraint on <code>(show_id, seat_id)</code> in a booked-seats table", "Correct, and a good safety net, but it cannot model temporary holds by itself"],
          ["<code>SELECT ... FOR UPDATE NOWAIT</code> on pre-created seat rows", "<b>Chosen.</b> Locks the exact rows, fails fast under contention, works at Read Committed"],
          ["Conditional <code>UPDATE ... WHERE status = 'available'</code>, then check the row count", "Also correct in one statement; PostgreSQL re-checks the WHERE clause after waiting on a row lock"],
          ["Run the transaction at Serializable", "Correct, but on a hot show many transactions abort and retry, which wastes work"],
          ["Seat locks in Redis with <code>SET NX</code>", "Fast, but creates a second source of truth; useful only as a front-line filter"]
        ] },
        { t: "code", lang: "sql", code: `BEGIN;  -- Read Committed is enough: we lock exactly the rows we check
SELECT seat_id FROM show_seats
 WHERE show_id = 991 AND seat_id IN ('F7', 'F8')
   AND (status = 'available' OR (status = 'held' AND held_until < now()))
 ORDER BY seat_id          -- same lock order everywhere: no deadlocks
 FOR UPDATE NOWAIT;        -- another user mid-hold: error now, not a wait
-- app: if fewer rows than requested, ROLLBACK and return 409
UPDATE show_seats
   SET status = 'held', hold_id = 'a1b2...', held_until = now() + interval '10 minutes'
 WHERE show_id = 991 AND seat_id IN ('F7', 'F8');
COMMIT;` },
        { t: "diagram", caption: "Two users race for F8: the first locks it, the second fails fast and picks another seat, and nobody waits on a lock held during payment.", code: `sequenceDiagram
  participant A as User A
  participant S as Booking service
  participant DB as PostgreSQL
  participant B as User B
  A->>S: hold F7 and F8
  B->>S: hold F8
  S->>DB: lock F7, F8 FOR UPDATE NOWAIT for A
  DB-->>S: locked, both available
  S->>DB: lock F8 FOR UPDATE NOWAIT for B
  DB-->>S: error, row is locked
  S-->>B: 409 seat just taken
  S->>DB: mark F7, F8 held for 10 min, COMMIT
  S-->>A: hold_id, expires in 10 min` },
        { t: "h", text: "Deep dive 2: holds, expiry and payment" },
        { t: "list", items: [
          "The hold is just columns, so no extra system is needed. Expired holds are treated as available by the hold query itself (lazy expiry), and a sweeper uses the partial index to reset them every few seconds so the seat map stays accurate.",
          "Confirmation is conditional: <code>UPDATE show_seats SET status = 'booked', booking_id = ? WHERE hold_id = ? AND status = 'held' AND held_until &gt; now()</code>. If the row count is less than the seat count, the hold expired and someone may have taken a seat, so void the payment authorization and return 410.",
          "Always use the database's <code>now()</code> for hold timing, never application server clocks, so every decision uses one clock.",
          "The Idempotency-Key is stored with a unique constraint, so a client that retries after a timeout gets the same booking back instead of paying twice. Capture the payment only after the confirm transaction commits."
        ] },
        { t: "h", text: "Deep dive 3: hot shows and growth" },
        { t: "p", html: "Contention is per seat, not per show, so a 250-seat show can only have 250 concurrent winners, and losers fail fast with NOWAIT instead of queueing. The real flood is seat-map reads, which Redis and replicas absorb. If the business grows past what one primary can handle, shard by <code>cinema_id</code> (Chapter 7). Every row of a show then lives on one shard, so hold and confirm stay single-shard transactions with no distributed commit. For extreme on-sale events, put a virtual waiting room in front (Chapter 17)." },
        { t: "h", text: "Trade-offs and bottlenecks" },
        { t: "list", items: [
          "Pre-creating show_seats rows costs about 2.6 GB of live rows but turns write skew into simple row locking. That is cheap insurance.",
          "NOWAIT gives a fast 409 and a better experience than lock queues, but a user can lose a seat to a hold that later expires. The seat map refreshes within seconds.",
          "A stale seat map (up to 2 s) causes some 409s on hold. That is acceptable because the write path is authoritative.",
          "A single primary is a write single point of failure: use synchronous replication to a standby in another zone, with automatic failover (Chapters 7 and 12).",
          "Serializable everywhere would also be correct, but it costs retries under contention; targeted row locks keep the hot path predictable."
        ] }
      ],
      followups: [
        "How would you implement 'best available' to find 4 adjacent seats while hundreds of users race for the same rows?",
        "The cinema's box office sells from its own legacy system. How do you keep both channels from selling the same seat?",
        "Payment was captured but the confirm transaction failed because of a timeout. How do you detect and reconcile that?",
        "Would you ever run the booking transaction at Serializable? What would you monitor if you did?",
        "How does the design change for general-admission events with 50,000 identical tickets?"
      ]
    },
    {
      id: "design-iot-timeseries-storage",
      title: "Design storage for an IoT time-series platform",
      level: "Hard",
      prompt: "Design the storage layer for an industrial IoT platform. One million devices each report 10 metrics (temperature, vibration, power and so on) every 10 seconds. Customers view live dashboards, chart any device over any time range, and run fleet-wide aggregates per site. Raw data must be kept for 30 days and summaries for 5 years.",
      clarify: [
        "Exactly how many devices, metrics per device and seconds between readings? Do these grow?",
        "Which queries matter most: one device's recent data, fleet aggregates, or exports?",
        "What resolution is needed for old data: is a 1-hour average enough after 90 days?",
        "Can devices buffer offline and send data hours late or out of order?",
        "Are readings ever corrected or deleted, for example for GDPR or bad sensors?",
        "Is real-time alerting part of this system, or does it consume from the same stream?"
      ],
      hints: [
        "Compute points per second and bytes per day before choosing anything; the numbers decide the design.",
        "The workload is append-only and time-ordered. Which storage engine family loves that, and which one fights it?",
        "Sort the data by (device, metric, time), use time-series compression codecs, and partition by day so retention becomes a cheap partition drop instead of millions of deletes.",
        "Build rollups at ingest time, not at query time. Store sum and count, not average, so rollups can be rolled up again correctly.",
        "Put a durable log such as Kafka in front, so reconnect storms are absorbed and writes can be batched and replayed."
      ],
      solution: [
        { t: "h", text: "Requirements" },
        { t: "list", items: [
          "<b>Functional</b>: ingest readings; chart one device's metric over any range; fleet aggregates by site and metric; latest value per device for live dashboards; raw data for 30 days, 5-minute rollups for 90 days, hourly rollups for 5 years.",
          "<b>Non-functional</b>: sustain 1M points/s with 3x burst headroom; no loss of acknowledged data; chart queries p99 under 500 ms; storage cost dominated by compression ratio; tolerate late data up to 24 hours."
        ] },
        { t: "h", text: "Estimates" },
        { t: "code", lang: "text", code: `Ingest
  1M devices x 10 metrics / 10 s     = 1M points/s (100k messages/s of 10 metrics)
  per day: 1M x 86,400               = 86.4B points/day
  network: 100k msg/s x ~200 B       = ~20 MB/s

Raw storage, 30 days
  naive 16 B/point (8 B time + 8 B float) = ~1.4 TB/day before tags and overhead
  with delta-of-delta time + XOR floats, budget ~2 B/point
                                     = ~170 GB/day x 30 = ~5.2 TB, x2 replicas = ~10 TB

Rollups (10M series; 4 values each: min, max, sum, count)
  5-minute: 30 raw points -> 4 values = ~13% of raw = ~23 GB/day x 90 days = ~2 TB
  hourly: 360 raw points -> 4 values  = ~1.1% of raw = ~1.9 GB/day x 5 years = ~3.5 TB

Total ~11 TB logical, ~22 TB with 2 replicas: a modest cluster, if compression holds.` },
        { t: "h", text: "API" },
        { t: "code", lang: "http", code: `POST /v1/ingest                      (devices also connect over MQTT)
     { "device_id": 81723, "ts": 1792651200, "metrics": { "temp_c": 71.2, "rpm": 1480 } }
     -> 202 Accepted (durable in Kafka)

GET  /v1/devices/81723/series?metric=temp_c&from=...&to=...&step=5m
     -> 200 { points: [ [ts, min, max, avg], ... ] }

GET  /v1/sites/12/aggregate?metric=power_kw&from=...&to=...&step=1h
     -> 200 { points: [ [ts, sum, avg], ... ] }

GET  /v1/devices/81723/latest        -> 200 { temp_c: 71.2, rpm: 1480, ts: ... }` },
        { t: "h", text: "Data model" },
        { t: "p", html: "The data is append-only, time-ordered and read by series and time range: a textbook case for an LSM-style, time-partitioned, compressed store, not for B-tree page updates. At 1M points/s we need horizontal write scaling, so we use <b>ClickHouse</b>. Its MergeTree engine writes immutable sorted parts and merges them in the background, LSM-style. It supports per-column compression codecs, day partitions for retention, and materialized views for rollups. Device metadata (owner, site, model) lives in PostgreSQL, and the latest value per device lives in Redis." },
        { t: "code", lang: "sql", code: `CREATE TABLE readings (
  device_id UInt64,
  metric    LowCardinality(String),
  ts        DateTime CODEC(DoubleDelta, ZSTD),   -- regular intervals compress to almost nothing
  value     Float64  CODEC(Gorilla, ZSTD)        -- XOR float encoding from the Gorilla paper
) ENGINE = MergeTree                             -- ReplicatedMergeTree in production
PARTITION BY toDate(ts)                          -- one partition per day
ORDER BY (device_id, metric, ts)                 -- a series is contiguous on disk
TTL ts + INTERVAL 30 DAY                         -- expired days are dropped as whole parts
SETTINGS ttl_only_drop_parts = 1;

CREATE TABLE readings_5m (
  device_id UInt64, metric LowCardinality(String), bucket DateTime,
  min_v SimpleAggregateFunction(min, Float64),
  max_v SimpleAggregateFunction(max, Float64),
  sum_v SimpleAggregateFunction(sum, Float64),
  cnt   SimpleAggregateFunction(sum, UInt64)
) ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(bucket) ORDER BY (device_id, metric, bucket)
TTL bucket + INTERVAL 90 DAY;

CREATE MATERIALIZED VIEW readings_5m_mv TO readings_5m AS
SELECT device_id, metric, toStartOfFiveMinutes(ts) AS bucket,
       min(value) AS min_v, max(value) AS max_v, sum(value) AS sum_v, count() AS cnt
FROM readings GROUP BY device_id, metric, bucket;` },
        { t: "h", text: "High-level design" },
        { t: "diagram", caption: "Kafka decouples bursty devices from the store; batch writers turn a million tiny writes per second into a few large sorted inserts.", code: `flowchart LR
  D(("Devices")) -->|"MQTT or HTTPS"| GW["Ingest gateway"]
  GW --> K[["Kafka<br/>keyed by device_id"]]
  K --> BW["Batch writers"]
  BW -->|"large batch inserts"| CH[("ClickHouse<br/>raw, 30 days")]
  CH -->|"materialized views"| RU[("Rollups<br/>5 min and 1 hour")]
  K --> LV["Latest-value updater"]
  LV --> R[("Redis<br/>latest per device")]
  Q["Query service"] --> CH
  Q --> RU
  Q --> R
  Q --> PGm[("PostgreSQL<br/>device registry")]
  Dash(("Dashboards")) --> Q` },
        { t: "p", html: "<b>Write path</b>: gateways authenticate devices and publish to Kafka keyed by <code>device_id</code>, and return 202 once Kafka acknowledges, which makes the write durable. Batch writers consume about one second of data at a time and insert it in large blocks (ClickHouse prefers tens of thousands of rows per insert over many tiny ones). Materialized views update the 5-minute rollups as each block lands, and a second view from the 5-minute table feeds the hourly table. A separate consumer keeps the latest reading per device in a Redis hash for live tiles. <b>Read path</b>: the query service picks a resolution from the requested range (raw under 6 hours, 5-minute under 7 days, hourly beyond that), so every chart scans at most a few thousand points per series." },
        { t: "h", text: "Deep dive 1: why this engine and layout" },
        { t: "compare", items: [
          { title: "ClickHouse (chosen)", pros: ["Columnar codecs reach about 1 to 2 bytes per point", "Built-in rollups through materialized views, plus partition-drop retention", "Fleet-wide GROUP BY queries are fast"], cons: ["Prefers large batches, so a buffer such as Kafka is required", "Updates and deletes are heavy, asynchronous operations"], use: "Our scale: 1M points/s with both per-device and fleet-wide queries." },
          { title: "TimescaleDB", pros: ["Plain PostgreSQL: SQL joins with the device registry", "Compression and continuous aggregates built in"], cons: ["Write scaling is bounded by a single primary node"], use: "Around 10x smaller scale, where one strong node is enough and simplicity wins." },
          { title: "Cassandra or ScyllaDB", pros: ["Linear write scaling", "Time-window compaction with TTL drops whole SSTables"], cons: ["Generic block compression (LZ4 or Zstd), so several times more bytes per point", "No built-in downsampling, so you need a separate stream job"], use: "When you already run it and need only per-device reads." }
        ] },
        { t: "p", html: "Sorting by <code>(device_id, metric, ts)</code> makes each series contiguous, so a 24-hour chart for one device reads a few compressed blocks. The repeated <code>device_id</code> and <code>metric</code> values compress to almost nothing, timestamps 10 seconds apart compress with DoubleDelta to a fraction of a byte, and slowly changing floats compress well with Gorilla XOR encoding. Validate the 2-bytes-per-point budget on real data early, because noisy sensors compress worse, and the whole storage estimate rests on that number." },
        { t: "h", text: "Deep dive 2: retention, rollups and late data" },
        { t: "list", items: [
          "<b>Retention without tombstones</b>: with day partitions and TTLs, expiry drops whole parts. Deleting 86 billion rows a day one by one would be ruinous in any engine; in Cassandra it would also mean tombstones.",
          "<b>Composable rollups</b>: store min, max, sum and count. Average is <code>sum / count</code> at query time, which stays correct when 5-minute buckets are rolled into hours or across devices. Averaging averages is wrong when counts differ.",
          "<b>Merges are eventual</b>: the rollup table may briefly hold several partial rows per bucket, so queries re-aggregate with <code>min(min_v)</code>, <code>sum(sum_v) / sum(cnt)</code> and so on.",
          "<b>Late data</b>: a device that was offline for 3 hours sends old timestamps. The rows land in the correct day partition and the materialized view adds a partial row for the old bucket, so rollups self-correct. Reject data older than the 24-hour window, or route it to a backfill job.",
          "<b>Fleet aggregates</b>: a third materialized view keyed by <code>(site_id, metric, bucket)</code> pre-aggregates per site, so a site dashboard does not scan thousands of device series."
        ] },
        { t: "h", text: "Deep dive 3: ingest durability and bursts" },
        { t: "p", html: "When a factory's network recovers, thousands of devices flush buffered data at once. Kafka absorbs the spike, and the batch writers drain it at the store's pace; at 20 MB/s, 24 hours of retention is about 1.7 TB per replica. Writers commit Kafka offsets only after the insert succeeds (at-least-once). A retry re-sends the identical block, and ClickHouse's replicated tables discard an identical re-inserted block, so retries do not double count. Keep tags low-cardinality: a free-form tag such as a request ID multiplies the number of series, which is the classic way time-series systems fall over." },
        { t: "h", text: "Trade-offs and bottlenecks" },
        { t: "table", head: ["Decision", "Gain", "Cost"], rows: [
          ["Columnar, LSM-style store over a B-tree database", "About 10x less storage, very high ingest", "Weak point updates; needs batching"],
          ["Kafka in front of storage", "Burst absorption, replay, fan-out to alerting", "Another system to run; about a second of ingest latency"],
          ["Pre-computed rollups", "Fast long-range charts, cheap 5-year retention", "Raw detail gone after 30 days; rollup bugs need backfills"],
          ["Latest value in Redis", "Live tiles without scanning the store", "Second copy that can lag by a second"],
          ["Two replicas, not three", "Storage cost", "Lower tolerance to simultaneous failures; Kafka retention is the safety net"]
        ] }
      ],
      followups: [
        "A customer wants alerts within 5 seconds when vibration crosses a threshold. Where does that run, and why not query the store?",
        "Tag cardinality explodes because firmware starts sending a per-boot UUID as a tag. How do you detect and contain it?",
        "A bug corrupted 5-minute rollups for the last two weeks. How do you rebuild them without stopping ingest?",
        "How do you isolate tenants so one customer's backlog flush does not slow everyone else's dashboards?",
        "Regulators require deleting one device's data on request. How do you do that in an append-only, partitioned store?"
      ]
    }
  ]
};
