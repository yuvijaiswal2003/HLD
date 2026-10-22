# HLD Course — Content Spec

You are writing one or more chapters of an interactive High-Level Design (system design) course.
The learner is a working engineer preparing for system design interviews and wants to go from
very basic to advanced. The app renders your content: lessons (reading), an MCQ quiz, and
"design an application" practice problems with progressive hints and a model solution.

Quality bar: this should read like the best system design book chapter you know (DDIA-level
accuracy, Alex Xu-level clarity), written in your own words. Explain the *why*, give concrete
numbers, name real technologies (Redis, Kafka, Cassandra, DynamoDB, PostgreSQL, Nginx, etc.)
where they help, and always tie concepts back to what interviewers ask. Be technically precise —
every fact, MCQ answer and explanation must be correct. No filler, no marketing tone, no emoji.
Plain direct sentences. Don't copy text from books or websites.

## File format

Write each chapter to `/home/claude/hld/content/chNN.js` (NN = two-digit chapter number) as a
CommonJS module:

```js
module.exports = {
  id: "caching",              // kebab-case, unique
  num: 5,                     // chapter number
  part: 2,                    // part number (given in your assignment)
  title: "Caching",
  tagline: "Make reads fast and cheap without serving stale lies.",   // one line, <= 90 chars
  level: "Intermediate",      // "Beginner" | "Intermediate" | "Advanced"
  lessons: [ /* 4–7 lessons, see below */ ],
  takeaways: [ /* 6–10 strings: the things to remember for an interview */ ],
  mcqs: [ /* 12–15 MCQs */ ],
  design: [ /* 2–3 design problems */ ]
};
```

Use template literals (backticks) for any multi-line string (diagrams, code). Inside template
literals do not use `${` and avoid backticks. Run `node /home/claude/hld/validate.js chNN` after
writing each file — it must print OK. Fix every error it reports.

## Lessons

```js
{ id: "cache-strategies", title: "Caching strategies", minutes: 8, blocks: [ ...blocks ] }
```

Each lesson: 6–18 blocks. Mix prose with structure (tables, compare cards, diagrams, callouts).
Every chapter should have at least 3 diagrams in total and at least 2 tables.
Each lesson should have at least one `interview` callout OR a `tip`/`warn` callout.

### Block types (exact shapes — the validator rejects anything else)

| t | fields | notes |
|---|---|---|
| `p` | `html` | Paragraph. Inline HTML allowed: `<b>`, `<em>`, `<code>`, `<br>` only. |
| `h` | `text` | Sub-heading inside a lesson (plain text). |
| `list` | `items: [html...]`, optional `ordered: true` | Bullet or numbered list. Same inline HTML rules. |
| `table` | `head: [..]`, `rows: [[..],[..]]` | Every row has same length as head. Cells may use inline HTML. |
| `callout` | `kind`, `title`, `html` | kind ∈ `tip` (practical advice), `warn` (common mistake / pitfall), `interview` (what interviewers look for / how to say it), `example` (real-world example: how Netflix/Uber/Discord etc. do it — only well-known, accurate facts). |
| `diagram` | `code`, `caption` | Mermaid source (rules below). Caption = one sentence on what to notice. |
| `code` | `lang`, `code` | Short pseudocode/code (≤ 30 lines). lang: `python`, `sql`, `text`, `http`, `json`, `bash`, `js`. |
| `compare` | `items: [{ title, pros: [..], cons: [..], use: "when to use" }]` | 2–4 items. Great for "SQL vs NoSQL", "push vs pull". |
| `steps` | `items: [{ title, html }]` | An ordered process where order matters (request flow, failover sequence). |
| `numbers` | `items: [{ value, label }]` | 2–6 key figures, e.g. `{value:"~100 µs", label:"Read 1 MB from memory"}`. Use sparingly. |

### Mermaid diagram rules (strict — diagrams that fail to parse break the page)

* Use only `flowchart LR`, `flowchart TD`, or `sequenceDiagram`. Nothing else.
* Flowchart node ids: letters/digits only (`LB`, `App1`, `Cache`). Every label in double quotes:
  `LB["Load Balancer"]`, `DB[("PostgreSQL primary")]` (cylinder), `Q[["Kafka topic"]]`, `U(("User"))`.
* Never put double quotes, `#`, `;`, `{}`, `[]`, `()` or `<>` *inside* a label. Use plain words.
  Write "p99 < 100ms" as "p99 under 100ms". Line breaks in labels: use `<br/>` only.
* Edges: `A --> B`, `A -->|"label text"| B`, `A -.->|"async"| B`, `A ==> B`. Edge labels in quotes.
* Subgraphs: `subgraph R1["Region us-east"]` … `end`. Subgraph ids letters/digits only.
* No `style`, `classDef`, `class`, `click`, `linkStyle`, or `%%` comments — the app themes diagrams.
* sequenceDiagram: `participant C as Client` style declarations, messages `C->>S: text`,
  replies `S-->>C: text`, `Note over C,S: text`, `alt`/`else`/`end`, `loop`/`end`. No semicolons,
  no `#`, no `{}` in message text.
* Keep diagrams readable: ≤ 14 nodes. One idea per diagram.
* Indent lines inside the template literal with 2 spaces; first line is the diagram type.

Example:
```js
{ t: "diagram", caption: "Cache-aside: the app checks the cache first and only hits the database on a miss.", code: `flowchart LR
  C(("Client")) --> App["App server"]
  App -->|"1. GET user:42"| R[("Redis")]
  App -->|"2. on miss: SELECT"| DB[("PostgreSQL")]
  App -.->|"3. SET user:42 TTL 300s"| R` }
```

## MCQs (12–15 per chapter)

```js
{ q: "Which eviction policy...?", options: ["...", "...", "...", "..."], answer: 2,
  explain: "Why the right answer is right AND why the tempting wrong one is wrong.",
  level: "medium" }   // "easy" | "medium" | "hard"
```

* Exactly 4 options. `answer` is the 0-based index. Spread correct answers across positions
  (roughly even across 0–3 — the validator warns if one index dominates).
* Make them the kind interviewers and online assessments actually ask: scenario-based
  ("Your read replica shows stale data right after a user updates their profile. What fixes it with the least cost?"),
  trade-off questions, numbers ("approx how many seconds in a day ≈ 10^5"), definitions only for basics.
* Mix: ~30% easy, ~45% medium, ~25% hard.
* Distractors must be plausible. No "all of the above"/"none of the above". Options similar length.
* `q`, options and `explain` may use inline `<code>`, `<b>`, `<em>`.
* `explain`: 1–3 sentences, teaches something.

## Design problems (2–3 per chapter)

```js
{
  id: "design-pastebin",
  title: "Design Pastebin",
  level: "Easy",                       // "Easy" | "Medium" | "Hard"
  prompt: "Design a service where users paste text and get a short link that others can open...",
  clarify: ["Questions a strong candidate asks first (4–7 items)"],
  hints: ["Progressive hints, from gentle nudge to near-answer (3–5 items)"],
  solution: [ ...blocks ],             // model answer using the same block types
  followups: ["Follow-up questions an interviewer would push on (3–5 items)"]
}
```

Solution structure (use `h` blocks for these sections, in this order):
1. Requirements (functional + non-functional, short lists)
2. Estimates (back-of-envelope with real arithmetic: QPS, storage, bandwidth — show the math)
3. API (a `code` block with lang `http`, 2–5 endpoints)
4. Data model (table or code block with schema; say which DB and why)
5. High-level design (a `diagram` + a few sentences walking through the read and write paths)
6. Deep dives (2–3 of the hardest parts, e.g. hot keys, fan-out, consistency)
7. Trade-offs and bottlenecks (`list` or `table`)

The design problems in a chapter should exercise that chapter's concepts (e.g. the caching
chapter asks for a design where caching is the crux). For case-study chapters, the design
problems are *variations* of the walkthroughs in the lessons (different product, new constraint).

## Tone and depth

* Start each chapter at the level the learner is at that point in the course (earlier chapters
  assume little; later chapters assume earlier ones). Define a term the first time you use it.
* Prefer concrete numbers: "a single Redis node handles ~100k simple ops/sec",
  "cross-region RTT is ~60–150 ms". Use approximate figures that are widely accepted.
* `example` callouts: only well-known, accurate public facts (e.g. "Discord moved message
  storage from Cassandra to ScyllaDB", "Twitter's Snowflake IDs are 64-bit"). If unsure, use a
  `tip` instead.
* Write the takeaways as crisp interview-ready statements.
