module.exports = {
  id: "case-studies-media",
  num: 17,
  part: 7,
  title: "Case Studies III: Media, Location and Commerce",
  tagline: "Stream video, match rides, sync files and sell seats under a stampede.",
  level: "Advanced",
  lessons: [
    {
      id: "video-streaming",
      title: "Design a video streaming platform (YouTube / Netflix)",
      minutes: 20,
      blocks: [
        { t: "p", html: "The prompt is usually <em>Design YouTube</em> or <em>Design Netflix</em>. They differ in one big way: YouTube ingests hundreds of hours of user uploads every minute, while Netflix serves a curated catalog it controls. They share a skeleton, though: accept a huge file, turn it into many formats, and deliver the bytes from a server as close to the viewer as possible. The decision that organizes everything else is splitting the <b>control plane</b> (metadata, auth, search, deciding which server a player should fetch from) from the <b>data plane</b> (video segments served by a CDN). Your application servers should never stream a single video byte." },
        { t: "h", text: "1. Requirements" },
        { t: "list", items: [
          "<b>Upload:</b> creators upload files up to several GB; an interrupted upload resumes instead of restarting.",
          "<b>Process:</b> each upload becomes several resolutions and codecs, plus thumbnails, captions and a moderation verdict.",
          "<b>Watch:</b> playback on phones, browsers and TVs with quality that adapts to the viewer's bandwidth; seek, and resume where you left off on another device.",
          "<b>Metadata and counts:</b> title, description, channel, view and like counts. Search and recommendations exist but are out of scope beyond their interfaces."
        ] },
        { t: "list", items: [
          "<b>Playback latency:</b> first frame in under ~2 s; rebuffering is the quality metric users feel most.",
          "<b>Availability:</b> 99.99% for playback; upload processing may lag by minutes without anyone noticing.",
          "<b>Durability:</b> an acknowledged upload is never lost (object storage, Chapter 10).",
          "<b>Consistency:</b> eventual is fine for counts and metadata propagation, but a video must never be playable before it passes moderation and access checks.",
          "<b>Cost:</b> egress bandwidth dominates the bill, so every choice is judged by bytes delivered per dollar."
        ] },
        { t: "h", text: "2. Estimates" },
        { t: "code", lang: "text", code: `Uploads (YouTube's public figure: ~500 hours of video per minute)
  500 h/min x 60 x 24              = 720,000 hours of new video per day
  source ~8 Mbps = 1 MB/s          = 3.6 GB/hour -> 720k x 3.6 GB ~ 2.6 PB/day raw
  H.264 ladder ~10 Mbps + VP9/AV1 ladder ~6 Mbps = 16 Mbps = 2 MB/s = 7.2 GB/hour
                                   -> 720k x 7.2 GB ~ 5.2 PB/day of renditions
  total ~7.8 PB/day; x1.5 erasure coding ~ 12 PB/day of disk (an upper bound)
  average video 10 min             -> ~4.3M new videos/day ~ 50 uploads/s

Viewing (assume 500M DAU, 40 min and 5 videos per user per day)
  500M x 40 min = 2 x 10^10 min/day / 1,440 min/day ~ 14M concurrent streams
  14M x 3 Mbps average bitrate     ~ 42 Tbps average, ~80 Tbps at evening peak
  page loads 2.5B/day / 86,400     ~ 29k/s, peak ~60k/s      (metadata API)
  6 s segments: 14M streams / 6 s  ~ 2.3M segment GETs/s     (all at the CDN)` },
        { t: "p", html: "Three conclusions fall out. Tens of terabits per second cannot leave a handful of data centers, so delivery must be a CDN, ideally one that sits inside ISP networks. Transcoding is a large, bursty batch workload that belongs on a job queue, never in the upload request. And the metadata API at ~60k QPS is an ordinary read-heavy service: cache it (Chapter 5), shard it (Chapter 7) and move on to the interesting parts." },
        { t: "h", text: "3. API" },
        { t: "code", lang: "http", code: `POST /v1/uploads                       { fileName, sizeBytes, contentType }
     -> 201 { uploadId, uploadUrl, partSize }     (presigned, resumable target)
PUT  {uploadUrl}?partNumber=7          raw bytes of one part; retried independently
POST /v1/videos                        { uploadId, title, description, visibility }
     -> 202 { videoId, status: "PROCESSING" }
GET  /v1/videos/{videoId}              -> { title, channel, counts, status, thumbnails }
GET  /v1/videos/{videoId}/playback     -> { manifestUrl (signed, expires in minutes),
                                            drmLicenseUrl, resumeAtSec }
POST /v1/watch-events                  [{ videoId, sessionId, event: "start|heartbeat|end",
                                          positionSec, ts }]       (batched by the player)` },
        { t: "h", text: "4. Data model" },
        { t: "table", head: ["Data", "Store", "Key / layout", "Why"], rows: [
          ["Video metadata", "MySQL sharded with Vitess (or PostgreSQL + Citus), fronted by a cache", "<code>video_id</code>; index on <code>channel_id</code>", "Relational, ~2 KB per video; status (UPLOADING, PROCESSING, READY, BLOCKED) and visibility need strong consistency"],
          ["Segments and manifests", "Object storage (S3/GCS) behind the CDN", "<code>vod/{video_id}/{codec}_{height}p/seg_00042.m4s</code>", "Immutable, written once, read through caches"],
          ["Raw source files", "Object storage, moved to a cold tier after processing", "<code>raw/{video_id}/source</code>", "Kept so the video can be re-encoded later with better codecs"],
          ["Processing jobs", "Workflow engine state (e.g. Temporal on PostgreSQL)", "<code>job_id</code> plus per-task state", "Tracks DAG progress, retries and idempotency"],
          ["View and like counts", "Counter store (Redis in front of Bigtable or Cassandra)", "<code>video_id</code> to count", "Absorbs a write rate no metadata row could; approximate is acceptable"],
          ["Watch history and resume points", "Cassandra / Bigtable", "partition <code>user_id</code>, cluster by <code>watched_at</code>", "Huge write volume, always read per user"]
        ] },
        { t: "h", text: "5. High-level design" },
        { t: "diagram", caption: "Uploads go straight to object storage and into an asynchronous pipeline; viewers get metadata from the API but every video byte from the CDN.", code: `flowchart LR
  Creator(("Creator")) -->|"resumable upload"| Raw[("Raw object store")]
  Creator -->|"create video"| API["Video API"]
  Raw -.->|"upload complete"| Q[["Kafka: uploads"]]
  Q --> Pipe["Transcoding pipeline"]
  Pipe --> Seg[("Segment store")]
  Pipe -->|"status READY"| Meta[("Metadata DB plus cache")]
  API --> Meta
  Viewer(("Viewer")) -->|"metadata, signed manifest URL"| API
  Viewer -->|"manifests and segments"| Edge["CDN edge inside ISP"]
  Edge -->|"miss"| Shield["Regional tier and origin shield"]
  Shield --> Seg
  Viewer -.->|"watch events"| Ev[["Kafka: watch events"]]
  Ev --> Agg["Stream aggregator"]
  Agg --> Cnt[("Counter store")]` },
        { t: "p", html: "<b>Write path.</b> The client asks the Video API for an upload session and sends parts straight to object storage through presigned, resumable URLs (multipart upload, Chapter 10). The API tier never touches the bytes, and a dropped connection resumes from the last stored part. When the object is complete, storage emits an event to Kafka; the pipeline produces renditions and manifests, writes them to the segment store, and flips the video to READY only after moderation passes. <b>Read path.</b> The player calls the API for metadata and a short-lived signed manifest URL that already points at the best CDN nodes for this client. Everything after that, the manifests and thousands of segments, goes to the CDN edge, falling back through a regional tier and an origin shield to the segment store on a miss. <b>Counts.</b> Players send batched watch events to Kafka; a stream job dedupes by session, drops invalid and bot views, sums per video per few-second window and adds the deltas to a counter store. That is the ad-click aggregation pattern from Chapter 10, not an <code>UPDATE views = views + 1</code> on a hot row." },
        { t: "h", text: "6. Deep dives" },
        { t: "p", html: "<b>Deep dive A: transcoding as a DAG.</b> Encoding a 1-hour source serially into 12 renditions (6 resolutions × 2 codecs) takes hours on one machine. Instead the orchestrator builds a directed acyclic graph of small, independent tasks: probe and validate the file, split it at keyframes into ~10 s chunks (each chunk starts a new GOP, the group of pictures that depends on one keyframe, so it decodes on its own), encode every chunk × rendition pair in parallel, stitch each rendition back together, then package. One hour is 360 chunks × 12 renditions = 4,320 tasks; with a thousand workers, wall-clock time approaches the time to encode a single chunk. Audio, thumbnails, captions, moderation and copyright fingerprinting (YouTube's Content ID) run as parallel branches. A workflow engine persists the DAG state, so a crashed worker costs one task, not the whole job." },
        { t: "diagram", caption: "Splitting at keyframes turns one long serial encode into thousands of parallel tasks; publication waits on both packaging and moderation.", code: `flowchart TD
  Src["Source file in raw store"] --> Probe["Probe and validate"]
  Probe --> Split["Split at keyframes into 10 s chunks"]
  Probe --> Audio["Encode audio: AAC and Opus"]
  Probe --> Side["Thumbnails, captions, moderation, fingerprint"]
  Split --> E1["Encode chunk 1: all renditions"]
  Split --> E2["Encode chunk 2: all renditions"]
  Split --> En["Encode chunk N: all renditions"]
  E1 --> Join["Stitch each rendition"]
  E2 --> Join
  En --> Join
  Join --> Pack["Package CMAF segments, HLS and DASH manifests, DRM"]
  Audio --> Pack
  Pack --> Gate["Publish gate: moderation passed?"]
  Side --> Gate
  Gate -->|"yes"| Pub["Mark READY and warm CDN"]` },
        { t: "list", items: [
          "<b>Idempotent tasks.</b> Key every task by (video_id, chunk, rendition) and write its output to a deterministic object path, so retries and duplicate queue deliveries just overwrite the same file.",
          "<b>Fast path first.</b> Publish as soon as 360p and 480p are ready and add 1080p and 4K as they finish, which is why a fresh upload briefly has no HD option.",
          "<b>Priorities.</b> Separate queues so a creator's new upload never waits behind a bulk re-encode of the back catalog; run backfills on spare or spot capacity.",
          "<b>Per-title ladders.</b> A cartoon needs far fewer bits than a football match at the same visual quality. Netflix moved from one fixed bitrate ladder to per-title encoding in 2015 and later to per-shot optimization.",
          "<b>Codec economics.</b> VP9 and AV1 save roughly 30–50% bandwidth over H.264 but cost several times more compute to encode, so produce them only for videos with enough expected views. Google built a custom transcoding chip (the Argos VCU) for YouTube for exactly this reason."
        ] },
        { t: "p", html: "<b>Deep dive B: adaptive bitrate with HLS and DASH.</b> Each rendition is cut into segments of a few seconds that start on a keyframe and are aligned across renditions, so the player can switch quality at any segment boundary. A manifest describes them. HLS (Apple) uses a master playlist that lists variants by BANDWIDTH and RESOLUTION, each pointing to a media playlist of segment URLs; DASH (an MPEG standard) uses one XML manifest called the MPD. With CMAF, a single set of fragmented-MP4 segments serves both manifest formats, so you store and cache one copy instead of two. The <em>client</em> picks the rendition, which keeps servers stateless. Throughput-based players estimate bandwidth from recent downloads and pick the highest bitrate below ~80% of it; buffer-based players (an approach Netflix published in 2014) choose by how many seconds are already buffered; production players such as ExoPlayer, AVPlayer, hls.js and dash.js blend the two. Start at a modest rendition so the first frame appears fast, then climb. Premium content is encrypted once with Common Encryption (the <code>cbcs</code> scheme) so the same files work with Widevine, PlayReady and FairPlay licenses." },
        { t: "code", lang: "text", code: `master.m3u8  (the player reads this first and picks a variant)
#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,CODECS="avc1.4d401e,mp4a.40.2"
h264_360p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720,CODECS="avc1.4d401f,mp4a.40.2"
h264_720p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2"
h264_1080p/index.m3u8

h264_720p/index.m3u8  (media playlist: segment list for one rendition)
#EXTM3U
#EXT-X-VERSION:7
#EXT-X-PLAYLIST-TYPE:VOD
#EXT-X-TARGETDURATION:6
#EXT-X-MAP:URI="init.mp4"
#EXTINF:6.0,
seg_00001.m4s
#EXTINF:6.0,
seg_00002.m4s
#EXT-X-ENDLIST` },
        { t: "callout", kind: "example", title: "Deep dive C: CDN strategy, and how Netflix does it", html: "Netflix runs its own CDN, Open Connect. It gives ISPs Open Connect Appliances, storage-heavy servers installed inside the ISP's network or at internet exchange points, and fills them during off-peak <em>fill windows</em> with the titles it predicts will be watched, so evening traffic is served from inside the viewer's own ISP. The control plane (accounts, catalog, and the steering service that tells each player which appliances to use) runs in AWS; the appliances only serve bytes. YouTube similarly places Google Global Cache nodes inside ISPs, but its unbounded user-generated catalog relies much more on caching on demand." },
        { t: "compare", items: [
          { title: "Pre-position (push) at the edge", pros: ["Near-100% edge hit ratio for a predictable catalog", "Fills use cheap off-peak bandwidth", "ISPs save transit, so they agree to host the boxes"], cons: ["Needs a good popularity forecast", "Hardware and operations in hundreds of ISPs", "Useless for a video uploaded five minutes ago"], use: "Curated, finite catalogs with predictable demand: Netflix, Disney+, scheduled new releases." },
          { title: "Pull-through tiered caching", pros: ["Works for an unbounded catalog with no forecasting", "Viral videos warm the edges automatically", "Commercial CDNs offer it out of the box"], cons: ["The first viewer at each edge pays a miss", "Low hit ratio on the long tail", "Needs an origin shield so miss storms don't hit storage"], use: "User-generated long tail and live streams; combine it with push for the most popular head of the catalog." }
        ] },
        { t: "callout", kind: "interview", title: "How to frame it", html: "Lead with the split: <em>APIs serve metadata and signed manifest URLs; every byte of video comes from the CDN. My estimate is ~40 Tbps of egress, so the CDN strategy is the design.</em> Then draw upload as a DAG of idempotent tasks, explain ABR as a client decision over aligned segments, and say how counts are aggregated. Candidates lose points for streaming video through app servers, transcoding inside the upload request, or incrementing a counter row on every view." },
        { t: "h", text: "7. Trade-offs and bottlenecks" },
        { t: "table", head: ["Decision", "Choice", "Trade-off"], rows: [
          ["Segment length", "4–6 s for VOD, 2 s or less for live", "Shorter segments start and adapt faster but mean more requests and more keyframes, which hurts compression"],
          ["Codec mix", "H.264 for everything; VP9/AV1 for popular videos", "30–50% bandwidth savings versus several times the encode compute and gaps on older devices"],
          ["Packaging", "CMAF segments with both HLS and DASH manifests", "One copy stored and cached; very old HLS players may still need MPEG-TS variants"],
          ["CDN", "Own ISP-embedded CDN versus commercial CDN", "Owning pays off only at enormous egress; below that, capex and operations dominate"],
          ["View counts", "Stream-aggregated, eventually consistent", "Counts lag by seconds to minutes, and fraud filtering can lower them later"],
          ["Bottleneck: upload spikes", "Autoscale encoders on queue depth, publish low renditions first", "Higher renditions arrive later during spikes; spot capacity can be reclaimed mid-task, so tasks must be retryable"]
        ] }
      ]
    },
    {
      id: "ride-hailing",
      title: "Design a ride-hailing service (Uber / Ola)",
      minutes: 18,
      blocks: [
        { t: "p", html: "Ride-hailing looks like one system but contains two with opposite needs. Driver locations are a firehose: hundreds of thousands of tiny writes per second, each worthless 30 seconds later, where losing one is harmless. Trips are a trickle, around a thousand new trips per second at peak, where every change must be right: a driver is never assigned two riders and a fare is charged exactly once. A strong answer stores and scales these two paths differently and spends its deep-dive time on the geospatial index and the matching guarantee. Rides are local, so the whole system partitions naturally by city." },
        { t: "h", text: "1. Requirements" },
        { t: "list", items: [
          "<b>Rider:</b> see nearby cars, get an upfront fare with a pickup ETA, request a ride, track the driver live, pay automatically at the end.",
          "<b>Driver:</b> go online, stream location, receive ride offers and accept or decline within ~15 s, navigate to pickup and drop-off.",
          "<b>Trip lifecycle:</b> requested, matched, arrived, in progress, completed, with cancellations and no-shows.",
          "<b>Pricing:</b> surge multipliers when demand outstrips supply in an area. Out of scope: ratings, pooled rides, scheduled rides."
        ] },
        { t: "list", items: [
          "<b>Matching latency:</b> a first offer within a few seconds of the request; time-to-match usually under ~30 s.",
          "<b>Freshness:</b> driver positions at most ~5 s old in the index and on the rider's map.",
          "<b>Correctness:</b> one driver per trip and one trip per driver; the price shown is the price charged; payment exactly once.",
          "<b>Availability:</b> the request path survives losing a zone, and an outage in one city doesn't spread to others.",
          "<b>Scale:</b> millions of online drivers worldwide, with sharp local peaks at concerts, in rain, on New Year's Eve."
        ] },
        { t: "h", text: "2. Estimates" },
        { t: "code", lang: "text", code: `Assume 2M drivers online at global peak, one location update every 4 s
  location writes   2M / 4 s                       = 500k updates/s
  payload ~100 B    500k x 100 B                   = 50 MB/s ingest
  history (avg 1M online) 250k/s x 100 B x 86,400  ~ 2.2 TB/day
Live index
  2M drivers x ~200 B (id, cell, lat, lng, status, vehicle) ~ 400 MB of RAM
Riders looking at the map (3M apps open at peak, refresh every 5 s)
  3M / 5 s                                         = 600k nearby-driver reads/s
Trips: assume 20M per day
  20M / 86,400                                     ~ 230 trips/s, ~1,200/s at a 5x peak
  ~10 state changes per trip                       ~ 12k trip writes/s at peak
  20M x 2 KB                                       = 40 GB/day, ~15 TB/year` },
        { t: "p", html: "The numbers dictate the storage split. 500k location writes/s of data with a 30-second shelf life belongs in memory, overwritten in place, with a Kafka log for anyone who needs history. A transactional database is the wrong home for it. The entire live index is only ~400 MB, so sharding is about write throughput and blast radius, not size. Trips at ~12k writes/s at peak are ordinary OLTP for a sharded relational store. Nearby-car reads (600k/s) come from the same in-memory index and can be approximated: the car icons on the map are only a hint, so serve them from a per-cell snapshot refreshed every couple of seconds." },
        { t: "h", text: "3. API" },
        { t: "code", lang: "http", code: `WS   /v1/driver/stream                 one persistent connection per online driver
     -> { type: "loc", lat, lng, heading, speedMps, ts }          every 4 s
     <- { type: "offer", tripId, pickup, etaSec, expiresInSec: 15 }
POST /v1/fare-quotes                   { pickup, dropoff, product }
     -> { quoteId, fare, surgeMultiplier, etaSec, expiresAt }
POST /v1/trips    Idempotency-Key: 7c9e...   { quoteId, pickup, dropoff, paymentMethodId }
     -> 201 { tripId, status: "MATCHING" }
POST /v1/trips/{tripId}/accept         (driver)  -> 200, or 409 if the offer expired
GET  /v1/nearby-drivers?lat=..&lng=..&product=standard
     -> [{ lat, lng, heading }]         (anonymized, approximate)` },
        { t: "h", text: "4. Data model" },
        { t: "table", head: ["Data", "Store", "Key", "Notes"], rows: [
          ["Driver live state", "In-memory geo service sharded by city (Redis GEO works for one city)", "<code>driver_id</code> to cell, position, status, ts; <code>cell</code> to set of driver IDs", "Overwritten every 4 s; a driver silent for ~30 s is dropped; rebuilt from the next round of pings after a crash"],
          ["Location history", "Kafka, then Cassandra", "partition (<code>driver_id</code>, day), cluster by ts", "Receipts, route replay, disputes, ETA model training; TTL-based retention"],
          ["Trips", "Sharded MySQL or PostgreSQL", "<code>trip_id</code>; indexes on <code>rider_id</code>, <code>driver_id</code>", "State machine with a <code>version</code> column; source of truth for billing"],
          ["Fare quotes", "Redis with TTL", "<code>quote_id</code>", "Freezes the price the rider saw for a few minutes"],
          ["Surge multipliers", "Redis, recomputed about every minute", "(city, H3 cell)", "Read on every quote"],
          ["Payments", "Payment service database (Chapter 12)", "<code>trip_id</code> unique", "Idempotent charge per trip"]
        ] },
        { t: "h", text: "5. High-level design" },
        { t: "diagram", caption: "Locations flow through memory and Kafka; trips flow through a transactional store; dispatch is where the two paths meet.", code: `flowchart LR
  D(("Driver app")) -->|"location every 4 s"| GW["WebSocket gateway"]
  R(("Rider app")) --> API["API gateway"]
  GW --> Loc["Location service"]
  Loc --> Geo[("Geo index in memory, sharded by city")]
  Loc -.-> K[["Kafka: locations"]]
  K -.-> Hist[("Cassandra: location history")]
  K -.-> Surge["Surge pricing job"]
  Surge -.->|"multiplier per cell"| Price["Pricing service"]
  API --> Price
  API --> Trip["Trip service"]
  Trip --> TDB[("Trip DB")]
  Trip --> Disp["Dispatch service"]
  Disp --> Geo
  Disp --> ETA["ETA and routing"]
  Disp -->|"offer"| GW` },
        { t: "p", html: "<b>Location path.</b> Each driver app holds one WebSocket to a gateway and sends a position every 4 s. The location service updates the in-memory geo index for that driver's city, moving the driver between cell sets if the cell changed, and appends the ping to Kafka, which feeds location history, the surge job and the live traffic speeds used for ETAs. <b>Request path.</b> The rider first gets a fare quote (pricing reads the surge multiplier for the pickup cell plus an ETA), then creates a trip with that quote ID and an idempotency key, so a double tap creates one trip. The trip service persists the trip as MATCHING and hands it to dispatch, which pulls available drivers from cells around the pickup, ranks them by road ETA, reserves one and pushes an offer through the gateway. On accept the trip becomes DRIVER_ASSIGNED, and the rider's app subscribes to that one driver's location stream until drop-off." },
        { t: "h", text: "6. Deep dives" },
        { t: "p", html: "<b>Deep dive A: the geospatial index.</b> Chapter 14 covered geohash, quadtrees, S2 and H3; the question here is which suits a write-heavy set of moving points. A quadtree has to split and merge as drivers move. Cell-based schemes are better because an update is O(1): compute the cell ID from latitude and longitude, and if it changed, move the driver from the old cell's set to the new one. Uber uses H3, whose hexagons have six equidistant neighbors, so expanding a search ring by ring (a <em>k-ring</em>) and smoothing surge across neighbors behave uniformly in every direction. Resolution 9 (~0.1 km² per cell) suits dispatch and resolution 7 (~5 km²) suits surge. With geohash you must search the cell plus its 8 neighbors, because a driver 20 m away can sit across a cell boundary; a 6-character geohash is about 1.2 km × 0.6 km. Redis GEO (<code>GEOADD</code>/<code>GEOSEARCH</code>, which stores a 52-bit geohash as the sorted-set score) is a reasonable off-the-shelf answer for one city. Shard by city or region: matching never crosses cities, a hot city can be split into more shards by coarse cell, and a node failure affects one area for a few seconds, because every driver re-reports within 4 s and the node rebuilds itself from that." },
        { t: "code", lang: "python", code: `RES = 9                                      # ~0.1 km2 hexagons
def on_location(driver_id, lat, lng, ts):
    d = drivers[driver_id]                   # created at login: status, product
    cell = h3.latlng_to_cell(lat, lng, RES)
    if d.cell != cell:                       # crossed into a new hexagon
        cells[d.cell].discard(driver_id)
        cells[cell].add(driver_id)
    d.cell, d.lat, d.lng, d.ts = cell, lat, lng, ts
    kafka.send("locations", key=driver_id, value=(lat, lng, ts))

def candidates(lat, lng, product, want=10, max_k=4):
    origin = h3.latlng_to_cell(lat, lng, RES)
    for k in range(1, max_k + 1):            # widen the search ring by ring
        found = [d for c in h3.grid_disk(origin, k) for d in cells[c]
                 if drivers[d].status == "AVAILABLE"
                 and drivers[d].product == product
                 and now() - drivers[d].ts < 30]    # skip stale drivers
        if len(found) >= want or k == max_k:
            return found                     # next: rank by road ETA, not distance` },
        { t: "p", html: "<b>Deep dive B: matching, and the one-driver-one-trip guarantee.</b> Rank candidates by ETA from the routing engine, not by straight-line distance; a driver across a river is close on the map but 15 minutes away by road. Then <em>reserve before offering</em>: an atomic compare-and-set on the driver's state, AVAILABLE to RESERVED for this trip with a version check, in the shard that owns that driver. If two dispatchers race for the same driver, exactly one CAS succeeds and the loser moves to its next candidate; nothing has to lock a whole city. The offer expires after ~15 s; a decline or timeout sets the driver back to AVAILABLE and the next candidate gets the offer. An accept moves the trip from MATCHING to DRIVER_ASSIGNED with a conditional update on the trip's version, so a late accept for a rider who already cancelled gets a 409. Greedy one-at-a-time matching is simple; in dense areas, <em>batched matching</em> (collect requests for 1–2 s and solve an assignment that minimizes total pickup time) gives better outcomes overall at the cost of a little latency." },
        { t: "diagram", caption: "The CAS reservation is what makes concurrent dispatchers safe; the offer timeout returns the driver to the pool if they don't respond.", code: `sequenceDiagram
  participant R as Rider app
  participant T as Trip service
  participant Dp as Dispatch
  participant G as Geo index
  participant Dr as Driver app
  R->>T: POST /trips with Idempotency-Key and quoteId
  T->>T: insert trip with status MATCHING
  T->>Dp: match this trip
  Dp->>G: available drivers in k-ring around pickup
  G-->>Dp: 12 candidates
  Dp->>Dp: rank by road ETA
  Dp->>G: CAS driver 7 from AVAILABLE to RESERVED
  G-->>Dp: ok, version 42
  Dp->>Dr: offer trip, expires in 15 s
  alt driver accepts
    Dr->>T: accept
    T->>T: MATCHING to DRIVER_ASSIGNED if version matches
    T-->>R: driver assigned, ETA 4 min
  else timeout or decline
    Dp->>G: release driver 7 and try the next candidate
  end` },
        { t: "diagram", caption: "Every transition is a conditional update on the trip row, so duplicate or late events cannot move a trip backwards.", code: `flowchart LR
  Req["REQUESTED"] --> Match["MATCHING"]
  Match -->|"driver accepts"| Asg["DRIVER_ASSIGNED"]
  Match -->|"no driver found"| NoCar["UNFULFILLED"]
  Asg -->|"driver at pickup"| Arr["ARRIVED"]
  Arr -->|"rider on board"| Prog["IN_PROGRESS"]
  Prog -->|"drop-off"| Fin["COMPLETED"]
  Fin -->|"charge succeeds"| Paid["PAID"]
  Match -->|"rider cancels"| Can["CANCELLED"]
  Asg -->|"rider or driver cancels"| Can
  Arr -->|"no-show after 5 min"| Can` },
        { t: "p", html: "<b>Deep dive C: surge and ETA.</b> Surge is a stream-processing job (Chapter 10). It consumes ride requests and app opens (demand) and available-driver counts (supply) per resolution-7 cell over a sliding window of a few minutes, turns the demand-to-supply ratio into a multiplier, smooths it across neighboring cells so the price doesn't jump at a street corner, and publishes it to Redis for the pricing service. A quote freezes the multiplier: the trip request references a <code>quoteId</code> that expires after a few minutes, so the price shown is the price charged, and the request stays idempotent. ETA comes from a routing engine over the road graph (precomputed shortcuts such as contraction hierarchies make city-scale shortest paths take milliseconds), fed with live speeds derived from the same location stream and corrected by a model trained on actual trip times." },
        { t: "callout", kind: "example", title: "How Uber did it", html: "Uber's dispatch system, as described in its 2015 engineering talks, used Google S2 cells as the unit of geographic sharding and Ringpop, an open-source library combining consistent hashing with SWIM-style gossip, to route each cell's work to the node that owned it. In 2018 Uber open-sourced H3, its hexagonal hierarchical index, which it uses for dispatch, pricing and analytics." },
        { t: "callout", kind: "interview", title: "What earns senior-level credit", html: "Separate the two data paths out loud: <em>locations are 500k writes/s of data that is worthless after 30 seconds, so they live in memory and a Kafka log; trips are ~12k writes/s at peak that must be correct, so they live in a transactional store with a state machine.</em> Then show exactly where the one-driver-one-trip guarantee comes from (a CAS on driver state), rank by ETA rather than distance, and explain what happens when a city's geo shard dies: drivers re-report within 4 s and the shard rebuilds itself." },
        { t: "h", text: "7. Trade-offs and bottlenecks" },
        { t: "table", head: ["Decision", "Choice", "Trade-off"], rows: [
          ["Update interval", "4 s while online", "Shorter means a fresher map and better matching, but proportionally more writes and more battery and data use on the phone"],
          ["Geo index", "H3 cells in memory, sharded by city", "O(1) updates and uniform rings; trips near city borders and resharding hot cities need care"],
          ["Matching", "Greedy by ETA with a CAS reservation; batched in dense areas", "Greedy is fast and simple; batching lowers total wait time but adds 1–2 s"],
          ["Location durability", "Accept losing a few pings on a crash", "Fine, because the next ping arrives in 4 s; never acceptable for trip state"],
          ["Surge granularity", "Resolution-7 cells, recomputed about every minute", "Finer cells give noisy prices; coarser cells miss local spikes"],
          ["Bottleneck: event spikes", "Pre-scale gateways and the hot city's shards before concerts and holidays", "Over-provisioning cost versus failed requests at the worst possible moment"]
        ] }
      ]
    },
    {
      id: "file-storage-sync",
      title: "Design file storage and sync (Dropbox / Google Drive)",
      minutes: 18,
      blocks: [
        { t: "p", html: "Dropbox and Google Drive feel like one folder that exists everywhere at once. Underneath are two very different systems: a <b>block store</b> holding immutable chunks of files, each named by the hash of its content, and a <b>metadata service</b> that records which chunks make up each file at each revision and the order in which changes happened. The client does real work too. It watches the file system, chunks and hashes files, and reconciles local state with the server's. Almost all the bandwidth savings come from one rule: never upload a chunk the server already has." },
        { t: "h", text: "1. Requirements" },
        { t: "list", items: [
          "<b>Sync:</b> upload, download and sync files and folders across a user's desktop, mobile and web clients; a change on one device appears on the others within seconds.",
          "<b>Offline:</b> edit while offline and reconcile on reconnect, without losing anyone's work.",
          "<b>History:</b> keep version history and let users restore deleted files for, say, 30 days.",
          "<b>Sharing:</b> share folders with other users as viewer or editor, and share files by link. Out of scope: real-time co-editing of documents and full-text search."
        ] },
        { t: "list", items: [
          "<b>Durability:</b> an acknowledged file is never lost; target 11 nines for stored blocks (Chapter 10).",
          "<b>Consistency:</b> revisions of a file are strictly ordered, and a device never sees a revision whose blocks aren't all stored. Propagation to other devices is eventual (seconds).",
          "<b>Efficiency:</b> minimize bytes over the wire with delta sync, dedupe and compression; many users are on slow or metered links.",
          "<b>Scale:</b> hundreds of millions of users, an exabyte of data, hundreds of billions of files; metadata operations under ~200 ms."
        ] },
        { t: "h", text: "2. Estimates" },
        { t: "code", lang: "text", code: `Users: 500M registered, 100M daily active, 2 GB stored per user on average
  logical data      500M x 2 GB                  = 1 EB
  dedupe + compression save ~30%                 ~ 0.7 EB stored
  erasure coding at 1.5x                         ~ 1.05 EB raw disk (3x replicas: 2.1 EB)
Blocks: 0.7 EB / 4 MB                            ~ 1.75 x 10^11 blocks
  block index entry ~100 B                       ~ 17.5 TB, sharded by hash prefix
File metadata: 500M users x 1,000 files          = 5 x 10^11 file entries
  x ~300 B each (path, revision, block list)     ~ 150 TB, sharded by namespace
Commits: 100M DAU x 20 file changes/day          = 2B commits/day
  2B / 86,400                                    ~ 23k commits/s, ~70k/s at peak
Upload after delta sync: 100M x 30 MB/day        = 3 PB/day ~ 35 GB/s ~ 280 Gbps
Devices online at peak ~50M; ~100k idle long-polls per server -> ~500 servers` },
        { t: "p", html: "Storage, not request rate, is the cost center. At an exabyte, 1% better storage efficiency is 10 PB of disks, which is why dedupe, compression and erasure coding instead of triple replication matter so much. Metadata is large (~150 TB) and transactional (~70k commits/s at peak), so it needs a sharded relational store with a shard key that keeps each commit on one shard. The 50M connected devices are idle almost all the time, so notifications must be cheap per connection and carry no data." },
        { t: "h", text: "3. API" },
        { t: "code", lang: "http", code: `POST /v1/commit     { nsId, path, parentRev, size, blocks: ["9f2c...", "51ab...", ...] }
     -> 200 { status: "NEED_BLOCKS", missing: ["51ab..."] }      upload these, then retry
     -> 200 { status: "OK", rev: 8, journalId: 99812 }
     -> 409 { status: "CONFLICT", latestRev: 9 }
PUT  /v1/blocks/{sha256}           compressed bytes; the server re-hashes and rejects a mismatch
GET  /v1/blocks/{sha256}           -> block bytes (or a short-lived signed URL)
GET  /v1/changes?cursor=ns42:99790 -> { entries: [...], cursor: "ns42:99812", hasMore }
GET  /v1/changes/longpoll?cursor=...&timeout=90  -> { changes: true } or false at timeout
POST /v1/shares    { nsId, path, grantee or "link", role: "viewer|editor", expiresAt }` },
        { t: "h", text: "4. Data model" },
        { t: "table", head: ["Data", "Store", "Key / columns", "Why"], rows: [
          ["Namespaces", "Sharded MySQL or PostgreSQL", "<code>ns_id</code>, owner, kind (user root or shared folder)", "The unit of sharing <em>and</em> the shard key, so one commit touches one shard"],
          ["File journal", "Same shard as its namespace", "PK (<code>ns_id</code>, <code>journal_id</code>); path, file_id, rev, size, block list, deleted flag", "Append-only change feed; clients read it with a cursor"],
          ["Latest file state", "Same shard", "(<code>ns_id</code>, path) to latest journal entry and rev", "Fast listings; updated in the same transaction as the journal append"],
          ["Block index", "Key-value store sharded by hash (DynamoDB, Cassandra, or sharded MySQL)", "<code>sha256</code> to storage location, sizes", "Global dedupe lookups: does this block already exist?"],
          ["Blocks", "Object storage or an in-house erasure-coded store", "<code>sha256</code>", "Immutable, compressed, encrypted at rest (envelope encryption, Chapter 13)"],
          ["Mounts and share links", "Metadata DB plus cache", "(<code>user_id</code>, <code>ns_id</code>) to mount path and role; link token to ns, path, role, expiry", "What each user sees and with what rights"]
        ] },
        { t: "h", text: "5. High-level design" },
        { t: "diagram", caption: "Blocks and metadata travel separately: the client uploads only missing blocks, then commits a revision; other devices are woken by a hint and pull the changes.", code: `flowchart LR
  subgraph Dev["Desktop client"]
    Watch["File watcher"] --> Chunk["Chunker and hasher"]
    Chunk --> LDB[("Local index in SQLite")]
  end
  Chunk -->|"1. commit with hashes"| Meta["Metadata service"]
  Chunk -->|"2. upload missing blocks"| Blk["Block service"]
  Blk --> Obj[("Block store")]
  Blk --> BIdx[("Block index: hash to location")]
  Meta --> MDB[("Metadata DB: journal per namespace")]
  MDB -.->|"journal events"| K[["Kafka"]]
  K -.-> Notif["Notification service"]
  Notif -.->|"long-poll returns"| Other(("Other devices"))
  Other -->|"3. changes since cursor"| Meta
  Other -->|"4. download missing blocks"| Blk` },
        { t: "p", html: "<b>Upload path.</b> The desktop client's watcher (inotify, FSEvents or ReadDirectoryChangesW) sees a file change. The chunker splits the file into 4 MB blocks, hashes each with SHA-256, and records the result in a local SQLite index. It sends the metadata service a commit with the path, the parent revision it edited, and the ordered list of hashes. The service answers with the hashes it doesn't have. The client uploads only those to the block service, which re-hashes each block on arrival, so a buggy or malicious client can't store bytes under the wrong name. The client then repeats the commit, and the metadata service applies it atomically: append a journal entry to the namespace and update the latest-state row. <b>Download path.</b> The journal append emits an event. The notification service wakes every device long-polling on that namespace; each one asks for changes since its cursor, gets the new block list, and fetches only the blocks it doesn't already have locally. <b>Sharing.</b> A shared folder is its own namespace mounted into each member's tree, so a single commit becomes visible to every member, and permissions are checked per namespace. Share links are random 128-bit tokens mapped to a namespace, path, role and expiry, and downloads go through short-lived signed URLs." },
        { t: "h", text: "6. Deep dives" },
        { t: "p", html: "<b>Deep dive A: chunking and dedupe.</b> Splitting files into blocks buys three things. Uploads become resumable: a failure retries one 4 MB block, not a 2 GB file. Sync becomes a delta: an edit re-uploads only the changed blocks. And storage dedupes: a block is stored once however many files contain it, because its name is its hash. Fixed-size blocks are simple and work well for files edited in place, but inserting bytes near the start shifts every later boundary and changes every hash. <b>Content-defined chunking</b> (CDC) instead cuts wherever a rolling hash over a small sliding window (a Rabin fingerprint, or Gear hashing in FastCDC) matches a bit pattern, so boundaries move with the content and an insertion changes only the chunk it lands in; backup tools such as restic and Borg chunk this way. Dedupe <em>scope</em> is a policy decision. Deduping within a user or team is safe. Global cross-user dedupe saves more but leaks information: if an upload finishes instantly, the uploader learns that someone already has that exact file. Because blocks are immutable, deleting a file only removes references to them, and a background mark-and-sweep collector frees blocks that no revision within the retention window still references. That is safer than synchronous reference counts, which drift when a crash lands between two steps." },
        { t: "compare", items: [
          { title: "Fixed-size blocks (e.g. 4 MB)", pros: ["Trivial to compute and to seek: block k starts at byte k times 4 MB", "Predictable metadata size per file", "Great for files modified in place: databases, VM images, many media edits"], cons: ["An insertion shifts every later boundary, so all later hashes change", "Poor dedupe across slightly different versions of documents"], use: "The default for a sync product with a simple, fast client; Dropbox uses 4 MB blocks." },
          { title: "Content-defined chunking", pros: ["Boundaries follow content, so inserts and deletes touch one or two chunks", "Much better dedupe across versions and similar files"], cons: ["Variable chunk sizes need min and max limits", "Rolling-hash CPU cost on every byte", "Can't jump to byte offset N without the chunk list"], use: "Backup and archival systems, or sync where edits often insert into the middle of large files." }
        ] },
        { t: "p", html: "<b>Deep dive B: the sync protocol.</b> Each namespace has an append-only journal with a monotonically increasing <code>journal_id</code>, and a client's cursor is the last <code>journal_id</code> it has applied for each namespace it mounts. Sync is just: fetch changes since the cursor, apply them, advance the cursor. Notifications are <em>hints</em>: the long-poll returns only that namespace 42 changed, and the client pulls the details. That makes them cheap to fan out to 50M idle connections and harmless to lose or duplicate, because the journal is the source of truth and the same code path handles a laptop that was offline for a week. If a cursor is older than the journal's compaction horizon, the server tells the client to do a full re-list. One ordering rule is non-negotiable: never commit metadata before every block it references is durably stored, or another device could fetch a revision it can't download. The check, upload, commit loop enforces exactly that." },
        { t: "diagram", caption: "The server tells the client which blocks are missing; the commit only succeeds after they are stored, and the other device pulls just the new blocks.", code: `sequenceDiagram
  participant A as Laptop client
  participant M as Metadata service
  participant B as Block service
  participant N as Notification service
  participant P as Phone client
  A->>A: file saved, re-chunk and hash, 2 of 50 blocks changed
  A->>M: commit path, parentRev 7, 50 hashes
  M-->>A: NEED_BLOCKS h12 and h31
  A->>B: PUT h12 and h31
  B-->>A: stored, hashes verified
  A->>M: commit again with parentRev 7
  M->>M: latest rev is 7, append journal entry as rev 8
  M-->>A: OK rev 8
  M->>N: namespace 42 changed
  N-->>P: long-poll returns changes true
  P->>M: changes since cursor
  M-->>P: path at rev 8 with 50 hashes
  P->>B: GET h12 and h31 only` },
        { t: "p", html: "<b>Deep dive C: conflicts.</b> Every commit carries the parent revision the client edited, and the metadata service applies it only if the file's latest revision still equals that parent. That is optimistic concurrency: a compare-and-set on the latest-state row. If two laptops edit the same file offline, the first to reconnect wins. The second gets a 409, and its client keeps both versions by committing its copy under a new name such as <code>report (Bob's conflicted copy 2026-10-22).docx</code>. Last-writer-wins by device timestamp would silently throw away someone's work, and device clocks drift (Chapter 8). Automatic merging only works when the system understands the format; real-time co-editing uses operational transformation (as Google Docs does) or CRDTs (Chapter 14), not file sync. On the client, every decision comes from a three-way comparison of the local tree, the remote tree and the last synced state, which serves as the merge base. Only local differs from base: upload. Only remote differs: download. Both differ: conflict. Without the base you can't tell a local delete from a remote create." },
        { t: "callout", kind: "example", title: "How Dropbox does it", html: "Dropbox stores file content as 4 MB blocks addressed by their SHA-256 hash, so unchanged blocks are never uploaded again. In 2016 it finished moving the bulk of user data off Amazon S3 onto Magic Pocket, its own exabyte-scale, erasure-coded block storage system. In 2020 it described rewriting its desktop sync engine, Nucleus, in Rust, built around reconciling a remote tree, a local tree and a synced tree." },
        { t: "callout", kind: "interview", title: "What to say first", html: "State the split in the first two minutes: <em>content-addressed immutable blocks, plus a per-namespace metadata journal.</em> Then walk through the commit protocol (send hashes, the server answers with what's missing, upload those, commit with a parent revision). That one exchange shows dedupe, delta sync, the blocks-before-metadata rule and conflict detection together. Expect follow-ups on two devices editing the same file, how devices learn about changes, and how a one-line edit avoids re-uploading 2 GB." },
        { t: "h", text: "7. Trade-offs and bottlenecks" },
        { t: "table", head: ["Decision", "Choice", "Trade-off"], rows: [
          ["Block size", "4 MB", "Smaller blocks dedupe better and resend less per edit but multiply metadata rows and requests"],
          ["Dedupe scope", "Per user or team", "Global dedupe saves more storage but reveals that a given file already exists somewhere"],
          ["Notifications", "Long-poll hint, then pull by cursor", "One extra round trip versus pushing the data, in exchange for a simple, loss-tolerant protocol"],
          ["Conflicts", "Compare-and-set on parent revision, keep a conflicted copy", "Never loses data, but users must merge by hand"],
          ["Durability", "Erasure coding such as 6 data plus 3 parity", "1.5x overhead instead of 3x; reconstructing a lost block costs CPU and cross-node reads"],
          ["Bottleneck: huge shared namespaces", "A company-wide folder with millions of files and thousands of writers lands on one shard", "Split it into sub-namespaces, rate-limit per namespace, and paginate journal reads"]
        ] }
      ]
    },
    {
      id: "ticket-booking-flash-sale",
      title: "Design ticket booking and flash sales (BookMyShow / Ticketmaster)",
      minutes: 18,
      blocks: [
        { t: "p", html: "Ticket booking is the classic <em>inventory that must not be oversold</em> problem; a flash sale is the same problem with a stampede at the door. A normal day is small, a few dozen bookings per second. The real load arrives in bursts, when two million fans show up at 10:00 for 60,000 seats. Chapter 6 covered the database side of not double-booking. This walkthrough covers the whole system: holding seats while someone pays, charging exactly once, and keeping the stampede from reaching the database at all. The 2022 Taylor Swift Eras Tour presale, where Ticketmaster reported about 3.5 billion system requests, roughly four times its previous peak, shows what happens when the front door gives way." },
        { t: "h", text: "1. Requirements" },
        { t: "list", items: [
          "<b>Browse:</b> events, shows and venues, with a seat map showing near-live availability.",
          "<b>Hold:</b> select up to N seats and hold them for a fixed window (say 10 minutes) while paying.",
          "<b>Pay and ticket:</b> pay, then receive tickets (QR codes) in the app and by email; refunds follow event policy.",
          "<b>High-demand on-sales:</b> a fair queue, per-account purchase limits and bot defenses."
        ] },
        { t: "list", items: [
          "<b>Correctness:</b> no seat is sold twice; nobody is charged without getting a ticket (or is refunded automatically); nobody is charged twice.",
          "<b>Fairness:</b> queue position decides access, not refresh speed or a bot farm.",
          "<b>Availability:</b> browsing stays up even while booking is throttled; the sale must not fall over at 10:00.",
          "<b>Latency:</b> holds and confirmations under ~500 ms; queue position updates every few seconds."
        ] },
        { t: "h", text: "2. Estimates" },
        { t: "code", lang: "text", code: `Steady state (BookMyShow-like): 1M bookings/day
  1M / 86,400                             ~ 12 bookings/s, ~60/s on a Friday evening
  ~20 seat-map views per booking          ~ 250 reads/s, ~1,200/s at peak
Flash sale: one 60,000-seat stadium, 2M fans online at 10:00
  no queue: 2M fans refreshing every 2 s  = 1M requests/s at the front door
  orders needed: 60,000 seats / 3 per order        = 20,000 orders
  admit 5,000 fans/min; each takes ~3 min to pick seats and pay
    Little's Law: 5,000/min x 3 min       = 15,000 fans active at once
    hold attempts ~5,000/min              ~ 85 writes/s   -> one PostgreSQL primary is plenty
    if ~80% buy: 4,000 orders/min         -> sold out in ~5 minutes
  seat map: 60,000 seats x 2 bits         = 15 KB; 15,000 fans re-fetch every 2 s
                                          ~ 7,500 reads/s x 15 KB ~ 110 MB/s from cache
  the other ~1.98M fans need a fast, cheap "sold out" answer` },
        { t: "p", html: "This arithmetic is the whole argument for the design. The correctness-critical path, holds and confirmations, needs well under a thousand writes per second even during the biggest on-sale, because inventory caps it: only 60,000 seats exist. The danger is the million requests per second at the front door. Scaling the booking tier to match would be expensive and pointless, so instead the waiting room meters admission to what inventory and the booking tier can absorb. Chapter 4's flash-sale problem covered autoscaling the web tier; here the answer is to absorb the spike at the edge and never let it reach the database." },
        { t: "h", text: "3. API" },
        { t: "code", lang: "http", code: `GET  /v1/queue/{eventId}/status          -> { myNumber, nowServing, etaSec, token? }
GET  /v1/shows/{showId}/seatmap          -> { version, seats: bitmap, prices }  (cached ~1 s)
POST /v1/holds    Idempotency-Key: 4f1a...   Authorization: queue token
     { showId, seatIds: ["A12", "A13"] }
     -> 201 { holdId, expiresAt }   |   409 { unavailable: ["A13"] }
POST /v1/orders   Idempotency-Key: 9b2c...   { holdId }
     -> 201 { orderId, amount, paymentSession (expires before the hold) }
POST /v1/payments/webhook                (signed, from the gateway) { orderId, gatewayRef, status }
GET  /v1/orders/{orderId}                -> { status: PENDING_PAYMENT | CONFIRMED | REFUNDED, tickets }` },
        { t: "h", text: "4. Data model" },
        { t: "table", head: ["Table", "Store", "Key and columns", "Notes"], rows: [
          ["shows", "PostgreSQL, cached", "<code>show_id</code>; venue_id, starts_at, sale_opens_at, max_per_account, queued flag", "Small and read-mostly"],
          ["seats", "PostgreSQL sharded by <code>show_id</code>", "(<code>show_id</code>, <code>seat_id</code>); section, row, price_tier, status (AVAILABLE, HELD, BOOKED), hold_id, hold_expires_at, version", "All seats of a show on one shard, so a multi-seat hold is a single-shard transaction; even a stadium is only 60,000 rows and a few hundred writes/s"],
          ["holds and orders", "PostgreSQL, same shard", "<code>hold_id</code> (user, seats, expires_at); <code>order_id</code> with UNIQUE <code>hold_id</code> and UNIQUE idempotency key; amount, status, gateway_ref", "One order per hold; the order is a state machine"],
          ["tickets", "PostgreSQL, same shard", "<code>ticket_id</code>; UNIQUE (<code>show_id</code>, <code>seat_id</code>); order_id, QR secret", "The unique constraint is the last line of defense against double booking"],
          ["Seat-map snapshot, queue counters, rate limits", "Redis", "<code>seatmap:{show_id}</code> bitmap; <code>q:{event}:next</code> and <code>q:{event}:serving</code>", "Derived and disposable: rebuilt from PostgreSQL or reset if lost"]
        ] },
        { t: "h", text: "5. High-level design" },
        { t: "diagram", caption: "The waiting room absorbs the spike at the edge; only admitted fans with a signed token reach booking, and PostgreSQL stays the single source of truth for seats.", code: `flowchart LR
  U(("Fans")) --> Edge["CDN edge: static waiting room"]
  Edge -->|"position and now-serving"| WR["Waiting room service"]
  WR --> QS[("Redis: queue counters")]
  Edge -->|"admitted with signed token"| GW["API gateway verifies token"]
  GW --> Book["Booking service"]
  Book -->|"read"| Map[("Redis: seat-map snapshot")]
  Book -->|"hold and confirm"| Inv[("PostgreSQL: seats, holds, orders")]
  Book --> Pay["Payment service"]
  Pay --> PG["Payment gateway"]
  PG -.->|"signed webhook"| Pay
  Inv -.->|"CDC"| K[["Kafka"]]
  K -.-> Exp["Seat-map refresher and hold sweeper"]
  K -.-> Tix["Ticket issuing and email"]` },
        { t: "p", html: "On a normal day, requests go straight to the booking service. For a high-demand on-sale the event is flagged as queued, and any request for its pages without a valid access token is redirected to the waiting room: a static page served from the CDN that polls a tiny status endpoint. When a fan is admitted, the waiting room issues a signed token (account, event, expiry) that the API gateway checks without a database lookup. The booking service reads seat maps from a Redis snapshot refreshed about every second, takes holds with a conditional update in PostgreSQL, creates an order from the hold, and starts payment. The gateway's webhook confirms the order, which flips the seats from HELD to BOOKED and issues tickets. Change data capture streams every seat change to Kafka, which refreshes the seat-map snapshot, releases expired holds early and sends tickets." },
        { t: "h", text: "6. Deep dives" },
        { t: "p", html: "<b>Deep dive A: holds with a TTL and optimistic concurrency.</b> A seat is AVAILABLE, HELD (with <code>hold_id</code> and <code>hold_expires_at</code>) or BOOKED. Taking a hold is one UPDATE whose WHERE clause states what must be true: the seat is available, or its previous hold has expired. This is optimistic concurrency. Nothing is locked while the fan studies the seat map, and the write simply fails if someone got there first. The row lock lasts only the milliseconds of the statement. Under PostgreSQL's READ COMMITTED, a concurrent UPDATE on the same row waits for the first to commit, then re-checks the WHERE clause against the new row version and updates nothing. A multi-seat hold is all-or-nothing in one transaction. Two concurrent holds that share two or more seats can deadlock if they lock those rows in different orders, so lock in seat-ID order (a short <code>SELECT ... ORDER BY seat_id FOR UPDATE</code> before the UPDATE does it) and retry the rare deadlock. Expired holds don't need a sweeper for correctness, because the next hold attempt reclaims them. A sweeper, or a delayed message per hold (Chapter 9), just releases them sooner so the seat map is accurate. Version-based optimistic locking (<code>WHERE version = :v</code>) is equivalent and natural when the client sends back the version it saw." },
        { t: "code", lang: "sql", code: `-- Hold A12 and A13 for 10 minutes, all or nothing
BEGIN;
SELECT seat_id FROM seats                -- lock rows in a fixed order: no deadlocks
 WHERE show_id = :show_id AND seat_id = ANY(:seat_ids)
 ORDER BY seat_id FOR UPDATE;            -- held for milliseconds, not think time
UPDATE seats
   SET status = 'HELD', hold_id = :hold_id,
       hold_expires_at = now() + interval '10 minutes',
       version = version + 1
 WHERE show_id = :show_id
   AND seat_id = ANY(:seat_ids)
   AND (status = 'AVAILABLE'
        OR (status = 'HELD' AND hold_expires_at < now()));  -- reclaim expired holds
-- app: if rows updated != 2 then ROLLBACK and report which seat was taken
COMMIT;

-- Confirm after payment: succeeds only if this hold still owns the seats
UPDATE seats SET status = 'BOOKED', version = version + 1
 WHERE show_id = :show_id AND hold_id = :hold_id AND status = 'HELD';
-- 0 rows: someone reclaimed the seats after expiry, so refund automatically` },
        { t: "compare", items: [
          { title: "SELECT FOR UPDATE until payment", pros: ["Simple to reason about", "Strict serialization of buyers"], cons: ["Holds a DB lock and a connection for minutes of human think time", "Connection pool exhaustion under load", "An abandoned checkout blocks the seat until a timeout"], use: "Never across user think time; only for the milliseconds of a single transaction." },
          { title: "Conditional UPDATE with a TTL in PostgreSQL", pros: ["Durable, transactional and multi-seat atomic", "Expiry is a column, reclaimed lazily", "Hundreds to low thousands of writes/s per show is easy"], cons: ["Every hold is a database write", "The seat map must be a separate cached snapshot"], use: "The default: the inventory database stays the source of truth." },
          { title: "Redis SET NX EX per seat", pros: ["Very fast, around 100k ops/s per node", "TTL expiry is automatic", "Multi-seat atomicity with a Lua script"], cons: ["Async replication: a failover can lose holds and double-hold a seat", "Two stores must be kept in agreement"], use: "A front-line filter for extreme contention, with the database unique constraint as the final guard." }
        ] },
        { t: "p", html: "<b>Deep dive B: paying exactly once.</b> The order is created from the hold under an idempotency key, so a double-click or a client retry returns the same order (Chapter 11). The charge request to the gateway (Stripe, Razorpay, Adyen) passes the order ID as the gateway's own idempotency key, so a retried charge never becomes a second charge. Confirmation is driven by the gateway's signed webhook, which can arrive twice or late, so confirming is itself a conditional update: seats go from HELD to BOOKED only where <code>hold_id</code> matches and the status is still HELD. A duplicate webhook finds nothing to change and still returns 200. The dangerous race is a payment that succeeds <em>after</em> the hold expired and the seats were resold. Prevent most of it by making the payment session expire a minute or two before the hold. Handle the rest by refunding automatically, and idempotently, whenever confirmation updates zero rows. If the hold expired but nobody reclaimed the seats, the confirmation still succeeds, which is the kindest outcome. A daily reconciliation job matches gateway settlements against orders to catch anything a lost webhook missed." },
        { t: "diagram", caption: "Every step is idempotent, and the confirmation is conditional on the hold still owning the seats; the late-payment race ends in an automatic refund, not a double booking.", code: `sequenceDiagram
  participant F as Fan
  participant B as Booking service
  participant DB as PostgreSQL
  participant P as Payment gateway
  F->>B: POST /holds A12 A13 with Idempotency-Key
  B->>DB: conditional UPDATE to HELD, expires in 10 min
  DB-->>B: 2 rows updated
  B-->>F: holdId, expires 10:10
  F->>B: POST /orders holdId
  B->>DB: insert order PENDING_PAYMENT, unique on holdId
  B->>P: create payment, idempotency key orderId, session ends 10:08
  F->>P: pays
  P-->>B: webhook paid for orderId
  B->>DB: UPDATE seats to BOOKED where hold_id matches and status is HELD
  alt 2 rows updated
    B->>DB: order CONFIRMED, insert tickets
    B-->>F: tickets issued
  else 0 rows because the seats were reclaimed
    B->>P: refund with idempotency key
    B-->>F: payment refunded, seats no longer available
  end` },
        { t: "p", html: "<b>Deep dive C: the virtual waiting room.</b> You can't scale a relational database to a million writes per second in a minute, and you shouldn't try, because only 60,000 seats exist. The waiting room turns an uncontrolled spike into a metered flow. Fans who arrive early sit on a static pre-queue page served by the CDN. At the start time, everyone already waiting gets a random position, so arriving at 9:58 is no worse than 9:59:59 and refreshing gains nothing; later arrivals line up in arrival order. The state is two numbers per event: a counter that hands out queue numbers (Redis INCR) and a now-serving number that an admission controller raises by N per second based on booking-tier health (p99 latency, error rate, active checkouts). Clients poll the now-serving value, a single object cacheable at the edge for a second or two, so a million pollers cost almost nothing. When a fan's number comes up they get a signed token valid for about 10 minutes and bound to their account, with one active token per account. Bots are handled by pre-registration (Ticketmaster's Verified Fan), a CAPTCHA at queue entry, per-account ticket limits and rate limits per account, device and IP (Chapter 11). When inventory runs out, close the queue and tell everyone right away." },
        { t: "diagram", caption: "Queue state is just two counters; the admission rate follows the booking tier's health, so the database sees a steady stream instead of a spike.", code: `flowchart TD
  Early["Fan arrives before 10:00"] --> Pre["Static pre-queue page from CDN"]
  Pre -->|"10:00: random order for all early arrivals"| Num["Queue number assigned"]
  Late["Fan arrives after 10:00"] -->|"next number, arrival order"| Num
  Num --> Poll["Client polls now-serving, cached at the edge"]
  Ctrl["Admission controller"] -->|"raise now-serving by N per second"| Poll
  Health["Booking tier latency and errors"] --> Ctrl
  Poll -->|"my number at or below now-serving"| Tok["Signed token: account, event, 10 min"]
  Tok --> Book["Seat map, holds and checkout"]
  Book -->|"inventory gone"| Close["Close queue: show sold out to everyone"]` },
        { t: "callout", kind: "interview", title: "Separate correctness from load", html: "Say it explicitly: <em>correctness</em> comes from conditional writes (a hold is a compare-and-set with an expiry, and the unique constraint on (show_id, seat_id) is the last guard), while <em>load</em> is handled by the waiting room, so the booking tier sees hundreds of writes per second, not a million. Then walk through the late-payment race before the interviewer asks. <em>What if payment succeeds after the hold expires?</em> is the most common follow-up on this problem." },
        { t: "h", text: "7. Trade-offs and bottlenecks" },
        { t: "table", head: ["Decision", "Choice", "Trade-off"], rows: [
          ["Hold duration", "8–10 minutes", "Longer holds cut payment failures; shorter ones return abandoned seats to the pool sooner during a sale"],
          ["Hold store", "Conditional UPDATE in PostgreSQL", "Durable and simple; Redis is faster but can lose holds on failover"],
          ["Seat-map freshness", "Snapshot refreshed every ~1 s", "Fans sometimes pick a seat that was just taken; the hold rejects it and they pick again"],
          ["Queue ordering", "Random for early arrivals, then FIFO", "Removes the incentive to refresh and race bots, but people who arrived early may feel cheated"],
          ["Admission rate", "Adaptive, driven by booking-tier health", "Too slow leaves seats unsold while fans wait; too fast overloads checkout"],
          ["Countable stock (general admission, phones)", "<code>UPDATE ... SET available = available - :n WHERE available &gt;= :n</code>", "One hot row serializes every buyer; at thousands of buys/s, split stock across N bucket rows or decrement in Redis with a Lua script"]
        ] }
      ]
    }
  ],
  takeaways: [
    "Video streaming splits a control plane (metadata, auth, signed manifest URLs) from a data plane (segments from the CDN). App servers never stream video bytes, and egress bandwidth is the design.",
    "Transcoding is an asynchronous DAG: split at keyframes, encode chunk-and-rendition tasks in parallel, stitch and package. Tasks are idempotent, and low renditions are published first.",
    "Adaptive bitrate is a client decision. Keyframe-aligned segments plus HLS/DASH manifests let the player switch quality at any segment boundary, and CMAF lets one set of segments serve both formats.",
    "Pre-position a predictable catalog on ISP-embedded caches during off-peak fill windows (Netflix Open Connect); use pull-through tiered caching with an origin shield for the long tail.",
    "Ride-hailing has two data paths: a firehose of disposable locations held in memory and logged to Kafka, and a trickle of trips that must be correct, held in a transactional store with a state machine.",
    "Index moving drivers with cells (H3 or geohash) for O(1) updates, search ring by ring, rank by road ETA, and guarantee one driver per trip with a compare-and-set reservation. Shard by city.",
    "File sync is content-addressed immutable blocks plus a per-namespace metadata journal: send hashes, upload only missing blocks, then commit. Metadata is never committed before its blocks are durable.",
    "Sync notifications are hints; clients pull changes by cursor. Detect conflicts with a compare-and-set on the parent revision and keep a conflicted copy, never last-writer-wins on device clocks.",
    "A seat hold is a conditional UPDATE with an expiry, the unique constraint on (show, seat) is the last guard, and payment confirmation is conditional and idempotent, with an automatic refund if the hold was lost.",
    "A flash sale is solved at the edge: a virtual waiting room meters admission to what inventory needs, so the booking database sees hundreds of writes per second instead of a million requests."
  ],
  mcqs: [
    { q: "In HLS or DASH playback, what decides which bitrate rendition is fetched for the next segment?", options: [
        "The CDN edge, based on its current load and what it has cached",
        "The player, from its measured throughput and current buffer level",
        "The origin, based on the device type in the User-Agent header",
        "The transcoder, which writes one rendition per viewer at encode time"
      ], answer: 1, level: "easy",
      explain: "ABR is client-driven: the manifest lists every rendition, and the player picks one per segment from recent download throughput and buffer level. That keeps servers and CDNs stateless and lets the player react to network changes within one segment." },
    { q: "You expect 14 million concurrent streams at an average bitrate of 3 Mbps. Roughly what egress must the delivery layer sustain on average?", options: [
        "About 4.2 Tbps",
        "About 420 Gbps",
        "About 42 Tbps",
        "About 420 Tbps"
      ], answer: 2, level: "easy",
      explain: "14 × 10^6 × 3 × 10^6 bit/s = 4.2 × 10^13 bit/s = 42 Tbps, with evening peaks around twice that. No handful of data centers can egress that much, which is why video delivery is a CDN problem, ideally with caches inside ISPs." },
    { q: "A 2-hour upload takes 6 hours to transcode into 12 renditions on one large machine. Which change cuts time-to-publish the most?", options: [
        "Split the source at keyframes, encode chunk-and-rendition tasks in parallel, then stitch",
        "Move to the largest instance type available and run the 12 renditions one after another",
        "Start transcoding inside the upload request handler so work begins before the upload ends",
        "Encode only the top rendition and have CDN edges downscale it for each viewer on request"
      ], answer: 0, level: "medium",
      explain: "Chunks that start on keyframes encode independently, so 720 chunks × 12 renditions become thousands of parallel tasks and wall-clock time approaches the time to encode one chunk. A bigger machine gives only linear gains; transcoding in the request ties a long job to a fragile connection; per-request downscaling at the edge burns enormous compute and defeats caching." },
    { q: "Why must segments in every rendition start on a keyframe at the same timestamps?", options: [
        "So the CDN can dedupe identical segments across different renditions of a title",
        "So one DRM license can be shared across every rendition of the title",
        "So each rendition's media playlist can leave out segment durations",
        "So each segment decodes alone and the player can switch at any boundary"
      ], answer: 3, level: "hard",
      explain: "A segment that starts with an IDR keyframe needs no earlier frames to decode, and aligned boundaries mean segment N in 480p covers the same time range as segment N in 1080p, so the player can switch cleanly. Segments in different renditions contain different bytes, so nothing is deduped, and playlists still list segment durations." },
    { q: "A hit series releases its new season at midnight, and millions of viewers will press play within minutes. Which CDN approach protects the origin best?", options: [
        "Pull-through caching with a short TTL, so each edge fetches segments on first request",
        "Pre-position the episodes on ISP-embedded caches in an off-peak fill window",
        "Add origin servers in every region and spread viewers across them with GeoDNS",
        "Raise Cache-Control max-age on the manifests so edges keep them longer once fetched"
      ], answer: 1, level: "medium",
      explain: "Demand for a scheduled release is predictable, so push the files to the edge before anyone asks, as Netflix Open Connect does during nightly fill windows. Pull-through caching makes thousands of edges miss at the same moment, and more origin servers don't remove the backbone bottleneck." },
    { q: "A video goes viral at 200k views per minute, and <code>UPDATE videos SET views = views + 1</code> on its row starts timing out. What is the standard fix?", options: [
        "Wrap the increment in SELECT FOR UPDATE so concurrent writers queue up in order",
        "Add read replicas so the increments spread across more database servers",
        "Stream watch events to Kafka and apply aggregated deltas per time window",
        "Have each player compute the running total and report it to the server periodically"
      ], answer: 2, level: "medium",
      explain: "Stream aggregation turns 200k row updates per minute into one delta per video every few seconds, and it can dedupe and filter bots along the way. Replicas don't spread writes, explicit locking makes contention on a hot row worse, and clients can't be trusted to report totals." },
    { q: "Driver locations arrive at about 500k writes per second, and each one is useless after about 30 seconds. Where should the live positions be kept?", options: [
        "In an in-memory geo index sharded by city, with pings also logged to Kafka",
        "In a PostgreSQL table with a spatial index, updated in place on every ping",
        "In Elasticsearch with a geo_point field, refreshing the index after every update",
        "In object storage, with one object per driver overwritten every four seconds"
      ], answer: 0, level: "easy",
      explain: "The live set is only a few hundred MB and changes constantly, so memory is the right home, and a lost ping is replaced 4 s later. Kafka keeps the history for receipts and analytics. A transactional database would spend most of its effort on WAL and index churn for data that expires in seconds." },
    { q: "Why does Uber's H3 index use hexagonal cells rather than squares?", options: [
        "Hexagons tile the entire sphere exactly, with no exceptions at any resolution",
        "Every hexagon nests exactly inside one parent, so containment queries are exact",
        "Hexagon cell IDs need fewer bits than square cell IDs at the same resolution",
        "All six neighbors are equidistant from the center, so k-rings grow evenly"
      ], answer: 3, level: "medium",
      explain: "A square has 4 edge neighbors and 4 corner neighbors about 1.4 times farther away; a hexagon's 6 neighbors are equidistant, which keeps ring searches, smoothing and movement modeling uniform. The tempting options are false: H3 needs 12 pentagons at every resolution, and its children only approximately fit inside their parent." },
    { q: "Two dispatcher instances pick the same available driver for two different riders at the same moment. What prevents a double assignment with the least coordination?", options: [
        "Take a city-wide distributed lock in ZooKeeper before running every match",
        "Send both offers and let the driver pick whichever rider they prefer",
        "Atomically flip the driver from AVAILABLE to RESERVED; the loser moves on",
        "Run a two-phase commit across the trip database and the geo index shard"
      ], answer: 2, level: "hard",
      explain: "An atomic CAS on the one driver's state, at the shard that owns the driver, serializes only the contention that actually exists. A city-wide lock serializes every match in the city, letting the driver choose leaves the other rider waiting for nothing, and 2PC adds blocking coordination to every match." },
    { q: "An app overwrites 50 KB in the middle of a 2 GB file in place, without changing its length. The file is stored as 4 MB content-hashed blocks. What should the sync client upload?", options: [
        "The whole 2 GB file again, so the server can re-chunk it consistently",
        "Only the blocks the server reports missing from the new hash list",
        "A binary diff that the server computes against the previous revision",
        "Every block from the edited one to the end of the file, since offsets shift"
      ], answer: 1, level: "easy",
      explain: "The client re-hashes the file, sends the hash list, and uploads only the one or two blocks whose hashes changed. Nothing after them shifts because the length didn't change. An insertion would shift every later fixed-size boundary, which is the problem content-defined chunking solves." },
    { q: "A teammate proposes committing a new file revision as soon as the metadata service receives the block list, with the blocks uploaded afterwards to cut latency. What breaks?", options: [
        "Other devices can see a revision whose blocks are missing, possibly forever",
        "Dedupe stops working, because the block index is updated before the blocks are hashed",
        "Conflicts can no longer be detected, because parent revisions are not checked",
        "Cursors on other devices can move backwards and replay old journal entries"
      ], answer: 0, level: "hard",
      explain: "A revision must only become visible once every block it references is durable. Otherwise other devices are told about a file they can't download, and a crash mid-upload leaves a permanently broken revision. Conflict checks and cursors don't depend on when blocks arrive, which is why the check-upload-commit order exists." },
    { q: "Alice and Bob edit the same file in a shared folder while both are offline. Alice reconnects first. What should a Dropbox-style system do when Bob reconnects?", options: [
        "Keep whichever version has the later modification time on its device clock",
        "Merge the two versions line by line and save the result as the new revision",
        "Reject Bob's commit and discard his local edits so that all devices converge",
        "Reject Bob's stale-parent commit and keep his version as a conflicted copy"
      ], answer: 3, level: "medium",
      explain: "The parent-revision compare-and-set detects the conflict, and keeping a conflicted copy guarantees nobody's work disappears. Last-writer-wins on device clocks silently discards an edit and is skewed by clock drift; a line merge corrupts binary formats; discarding Bob's edits loses data." },
    { q: "How should the booking service hold seats while a fan spends up to 10 minutes paying?", options: [
        "Open a transaction with SELECT FOR UPDATE on the seats and commit it after payment",
        "Mark the seats as held in the browser's local storage and validate them at checkout",
        "Conditionally UPDATE the seats to HELD, with an expiry after which they are free",
        "Decrement a cached counter and write the seat assignments to the database after payment"
      ], answer: 2, level: "medium",
      explain: "A hold is state, not a lock: one short conditional write marks the seats HELD with an expiry, and any later attempt can reclaim them once the expiry passes. A transaction held open across human think time ties up locks and connections for minutes; client-side state and deferred writes cannot prevent double booking." },
    { q: "A payment webhook arrives after the fan's hold expired and the seats were sold to someone else. What is the correct behavior?", options: [
        "Confirm the order anyway and let the venue sort out the duplicate seat at the gate",
        "Confirmation updates zero rows, so refund automatically and notify the fan",
        "Cancel the second fan's booking, because the first fan started checking out earlier",
        "Retry the confirmation with backoff until the other fan's booking is released"
      ], answer: 1, level: "hard",
      explain: "Confirmation moves seats to BOOKED only where the hold still owns them, so a lost hold shows up as zero rows updated and triggers an idempotent refund. The second fan's booking is legitimate. Expiring the payment session a minute or two before the hold makes this race rare." },
    { q: "In a virtual waiting room, why give a random position to everyone who arrived before the sale opened instead of serving them strictly first come, first served?", options: [
        "Strict FIFO rewards whoever fires at 10:00:00, which favors bots and scripts",
        "Random positions spread fans evenly across the database shards that hold the show",
        "Random positions are what make the now-serving counter cacheable at the CDN edge",
        "Strict FIFO needs a distributed lock, while random positions need no coordination"
      ], answer: 0, level: "medium",
      explain: "Randomizing everyone who arrived early removes the race at 10:00:00.000 that scripts always win, so arriving early is enough and refreshing gains nothing. The queue is still two counters either way: it has nothing to do with shards, and the now-serving value is cacheable regardless of how positions are assigned." }
  ],
  design: [
    {
      id: "design-spotify",
      title: "Design Spotify (music streaming)",
      level: "Medium",
      prompt: "Design a music streaming service like Spotify. Users search a catalog of ~100 million tracks, play songs and podcasts instantly on phones, desktops and web, build and share playlists (including collaborative ones), download music for offline listening, and get personalized playlists. Artists are paid royalties based on how many times their tracks are streamed.",
      clarify: [
        "How large is the catalog, and how many daily active users and listening hours should I plan for?",
        "Which audio qualities do we offer, and does a free tier exist with lower quality and ads?",
        "Is offline download in scope, and what DRM rules apply to downloaded tracks?",
        "What counts as a stream for royalties, and how exact must those counts be?",
        "Do collaborative playlists need real-time co-editing, or is eventual merging of edits fine?",
        "Are podcasts and video podcasts in scope, or just music?"
      ],
      hints: [
        "Compare the numbers with video: a 3.5-minute song at 160 kbps is about 4 MB. What does that do to the delivery design and to caching on the client?",
        "Do you need HLS-style segments and mid-track quality switching for a 4 MB file, or is choosing one quality per track enough?",
        "Separate counting for royalties (exact, auditable, offline plays arrive days late) from counting for dashboards (approximate, real-time).",
        "Personalized playlists like Discover Weekly can be computed in batch once a week and stored as ordinary playlists; they don't need to be generated on each request.",
        "For collaborative playlists, model edits as operations against a base revision, with stable item IDs and fractional position keys so a move doesn't renumber the list."
      ],
      solution: [
        { t: "h", text: "1. Requirements" },
        { t: "list", items: [
          "<b>Functional:</b> search and browse the catalog; play with under ~300 ms to the first sound and gapless transitions; playlists (create, reorder, share, collaborate); offline downloads; listening history; personalized playlists; per-stream royalty reporting.",
          "<b>Non-functional:</b> 99.99% playback availability; offline plays still counted; royalty counts exact and auditable; catalog and metadata changes may propagate in minutes; bandwidth cost per listening hour kept low."
        ] },
        { t: "h", text: "2. Estimates" },
        { t: "code", lang: "text", code: `Users: 250M DAU, 2 hours of listening per day
  250M x 120 min = 3 x 10^10 min/day / 1,440   ~ 21M concurrent streams, ~40M at peak
  average bitrate 160 kbps: 21M x 160 kbps     ~ 3.4 Tbps average, ~7 Tbps peak
  (compare ~40-80 Tbps for the video service in this chapter)
Catalog: 100M tracks x 3.5 min = 210 s each
  96 + 160 + 320 kbps = 576 kbps x 210 s       ~ 15 MB per track for all qualities
  100M x 15 MB                                 ~ 1.5 PB (small for object storage)
  head of the catalog: top 1M tracks x 4 MB    ~ 4 TB -> fits on one edge server's SSDs
Plays: 120 min / 3.5 min ~ 34 tracks per user per day
  250M x 34 = 8.5B plays/day / 86,400          ~ 100k plays/s, ~200k/s at peak
  ~3 events per play (start, 30 s mark, end or skip) -> ~300k events/s into Kafka
  8.5B x 3 events x 200 B                      ~ 5 TB/day of play events` },
        { t: "p", html: "Music is a much smaller delivery problem than video: an order of magnitude less egress, and the head of the catalog fits on every edge node. The hard parts move elsewhere: starting playback instantly, counting plays correctly for royalties (including plays that happen offline), and playlists edited by many people." },
        { t: "h", text: "3. API" },
        { t: "code", lang: "http", code: `GET  /v1/tracks/{trackId}               -> { title, artists, album, durationMs, files }
GET  /v1/tracks/{trackId}/stream?quality=high
     -> { fileId, cdnUrls: [signed, expires in 1 h], keyId }
POST /v1/keys      { fileId, deviceId }  -> { contentKey wrapped for this device, expiresAt }
GET  /v1/playlists/{playlistId}?sinceRev=41 -> { rev: 44, ops or full snapshot }
POST /v1/playlists/{playlistId}/ops
     { baseRev: 44, ops: [{ op: "insert", itemId, trackId, after: itemId }] }
     -> 200 { rev: 45 }   (the server rebases ops on newer revisions)
POST /v1/events    [{ playId, trackId, event: "start|30s|end|skip", posMs, ts, offline }]` },
        { t: "h", text: "4. Data model" },
        { t: "table", head: ["Data", "Store", "Key", "Notes"], rows: [
          ["Catalog: tracks, albums, artists, rights by country", "PostgreSQL with read replicas and a cache; Elasticsearch for search", "<code>track_id</code>", "Read-mostly; ingested from label delivery feeds; rights decide where a track is playable"],
          ["Audio files", "Object storage behind CDNs", "<code>audio/{file_id}</code>, one file per codec and quality", "Encrypted with a per-file content key; immutable"],
          ["Content keys", "Key service backed by a KMS", "<code>key_id</code>", "Released only to authenticated, entitled devices"],
          ["Playlists", "Cassandra or Bigtable", "partition <code>playlist_id</code>; header row, item rows, op log by rev", "Items carry stable item IDs and fractional position keys"],
          ["Library and history", "Cassandra", "partition <code>user_id</code>, cluster by time", "Liked songs, follows, recently played"],
          ["Play events", "Kafka, then a data lake partitioned by date", "<code>play_id</code> for dedupe", "Immutable log; the source for royalty reports"]
        ] },
        { t: "h", text: "5. High-level design" },
        { t: "diagram", caption: "Playback touches the API only for authorization and keys; audio comes from CDNs, and every play event flows into one log that feeds royalties, dashboards and recommendations.", code: `flowchart LR
  App(("Listener app")) --> API["API gateway"]
  API --> Cat["Catalog and search"]
  API --> Auth["Stream authorization and keys"]
  API --> PL["Playlist service"]
  PL --> PDB[("Cassandra: playlists")]
  App -->|"audio files, range requests"| CDN["CDN edges"]
  CDN -->|"miss"| Obj[("Object store: encrypted audio")]
  App -.->|"play events, buffered if offline"| EvGW["Event gateway"]
  EvGW -.-> K[["Kafka: play events"]]
  K -.-> RT["Real-time counts for artist dashboards"]
  K -.-> Lake[("Data lake")]
  Lake -.-> Roy["Daily royalty batch"]
  Lake -.-> Rec["Weekly recommendation batch"]
  Rec -.->|"writes personalized playlists"| PL` },
        { t: "p", html: "To play a track, the app asks stream authorization for the file at the right quality. It gets back signed CDN URLs and fetches the content key from the key service, unless both are already cached locally. The audio itself comes from the CDN, and the API never carries audio bytes. Play events are batched by the app, buffered on disk while offline, and sent to an event gateway that writes them to Kafka. From there a streaming job updates approximate real-time counts, and the data lake feeds the exact daily royalty batch and the weekly recommendation batch, which writes personalized playlists back through the ordinary playlist service." },
        { t: "h", text: "6. Deep dives" },
        { t: "p", html: "<b>Instant, gapless playback.</b> A 4 MB track doesn't need HLS-style segmenting: pick one quality per track from the network type and the user's setting, then fetch the file with HTTP range requests, first a small range so audio starts within a couple of hundred milliseconds, then the rest. Mid-track quality switching matters much less than for video because the whole file downloads in seconds. Prefetch the next track in the queue some seconds before the current one ends, so transitions are gapless and work through brief signal loss. Keep a client cache of several GB: people replay the same songs constantly, and a cache hit costs no bandwidth at all. Offline downloads are the same encrypted files plus content keys bound to the device, with an expiry that forces the device online periodically to re-check the subscription. Spotify requires this at least once every 30 days." },
        { t: "p", html: "<b>Counting streams for royalties.</b> The rule is contractual: Spotify counts a stream once at least 30 seconds of the track have played. The client generates a unique <code>play_id</code> at the start of each play and sends events tagged with it. Offline plays sit in a local queue and arrive days later with their original timestamps. The pipeline is at-least-once from the client to Kafka, dedupes on <code>play_id</code> in the batch layer, and computes daily totals per track, country and product tier from the immutable log, so a statement can be recomputed and audited at any time. A separate fraud stage drops patterns such as accounts looping one track around the clock or bot farms pushing a release. Artist dashboards read approximate counts from the streaming job. That is the speed layer of the Lambda pattern in Chapter 10, while royalties come only from the batch layer." },
        { t: "p", html: "<b>Playlists edited by many people.</b> Store a playlist as a header plus item rows, each with a stable <code>item_id</code> (the same song can appear twice) and a fractional position key. Inserting between keys <code>a</code> and <code>b</code> picks a key between them, so a move rewrites one row instead of renumbering 5,000. Every change is an operation (insert, remove, move, rename) applied against a base revision. If the base is stale, the server rebases the operation onto the newer revision. That is simple here, because operations reference item IDs rather than positions, so most concurrent edits commute, and an operation on an item someone deleted becomes a no-op. Clients sync with <code>sinceRev</code> and receive either the missing operations or a full snapshot. Personalized playlists are written once a week by a batch job, which is far cheaper than generating them on each request." },
        { t: "callout", kind: "example", title: "How Spotify did it", html: "Spotify's early desktop client used a peer-to-peer network to share part of the delivery load between listeners, and the company phased it out around 2014 as CDN capacity became cheap and listening moved to phones. Starting in 2016 Spotify moved its back end from its own data centers to Google Cloud Platform." },
        { t: "h", text: "7. Trade-offs and bottlenecks" },
        { t: "table", head: ["Decision", "Choice", "Trade-off"], rows: [
          ["Delivery format", "Whole encrypted files with range requests, quality chosen per track", "Simpler than segments and good for caching; no adaptation mid-track on a collapsing network"],
          ["Client cache", "Several GB on device", "Cuts bandwidth for repeat plays a lot; uses storage people may want back"],
          ["Royalty counting", "Exact batch over an immutable log; approximate real-time for dashboards", "Statements lag by a day, but they are auditable and handle late offline plays"],
          ["Playlist edits", "Operations on stable item IDs with server-side rebase", "Not real-time co-editing, but cheap, convergent and correct for list operations"],
          ["Personalized playlists", "Weekly batch", "Cheap and stable; can't react to today's listening without a separate real-time path"]
        ] }
      ],
      followups: [
        "A superstar drops an album at midnight and 30 million people press play at once. What happens at the CDN, the key service and the catalog cache?",
        "How would you add a lossless tier at around 1 Mbps without breaking the cost model?",
        "How do you make the next track start instantly on a bad mobile connection, and what does prefetching cost?",
        "A label disputes last month's stream counts. How do you prove them?",
        "How do you show friends' listening activity in near real time without fanning out every play event?"
      ]
    },
    {
      id: "design-food-delivery",
      title: "Design a food-delivery app (Swiggy / DoorDash)",
      level: "Hard",
      prompt: "Design a food-delivery platform like Swiggy or DoorDash. Customers browse restaurants that can deliver to their location, order from menus and track the delivery live. Restaurants receive and accept orders on a tablet and set preparation times. Delivery partners (couriers) receive pickup offers on their phones. Demand spikes sharply at lunch and dinner.",
      clarify: [
        "How many orders per day, how concentrated are they at meal peaks, and how many couriers are online at peak?",
        "Does a restaurant set its own delivery radius, or does the platform decide serviceability dynamically?",
        "Can a courier carry several orders at once (batching or stacking)?",
        "When is payment authorized and when is it captured? What happens if the restaurant rejects or an item is out of stock?",
        "How precise does the delivery ETA need to be, and is it a promise or an estimate?",
        "Are grocery and multi-store orders in scope, or restaurant food only?"
      ],
      hints: [
        "Start from the ride-hailing walkthrough: courier locations and the geo index carry over. What is different? There are three parties, the food has to be cooked, and couriers can carry several orders.",
        "Restaurant discovery is a read-heavy geo query, and every customer in the same small area sees nearly the same candidate set. What can you precompute per H3 cell?",
        "Don't send a courier the moment the order is placed. Dispatch so the courier arrives when the food is ready: ready time = acceptance time + predicted prep time.",
        "Think of the order as a saga across payment, restaurant and courier, with compensations: void the authorization if the restaurant rejects, re-dispatch if the courier drops out.",
        "Use Little's Law to size live tracking: orders per second at peak times average delivery time gives concurrent active orders."
      ],
      solution: [
        { t: "h", text: "1. Requirements" },
        { t: "list", items: [
          "<b>Functional:</b> location-aware restaurant feed and search; menus with live item availability; cart and checkout; restaurant accept or reject with a prep-time estimate; courier dispatch, pickup and drop-off; live tracking and ETA; cancellations and refunds.",
          "<b>Non-functional:</b> checkout and order state are strongly consistent, with no lost or duplicate orders; the feed is fast (p99 under ~300 ms) but may be a minute stale; ETAs are accurate to within a few minutes; the system survives meal-peak spikes of 4–5x; failures stay contained to one city."
        ] },
        { t: "h", text: "2. Estimates" },
        { t: "code", lang: "text", code: `Orders: 5M/day; the busiest dinner hour carries ~15%
  5M / 86,400                       ~ 58 orders/s average
  0.15 x 5M / 3,600 s               ~ 210 orders/s, ~400/s in the peak minute
  ~12 state changes per order       ~ 5k order writes/s at peak
Live tracking, by Little's Law (use the peak-hour rate: a peak minute doesn't last 35 min)
  210 orders/s x 35 min delivery = 210 x 2,100 s ~ 440k active orders at peak
Couriers: 500k online at peak, a ping every 5 s ~ 100k location writes/s
  customer tracking screens: 440k orders / 5 s ~ 90k courier positions/s pushed
Browsing: 30M DAU x 8 feed or search loads = 240M/day ~ 2.8k/s, ~12k/s at peak
  menus: 500k restaurants x 100 items x 1 KB    ~ 50 GB -> fits in a cache cluster` },
        { t: "p", html: "Orders are modest OLTP. The real load is geo work (courier pings, the per-cell feed, tracking pushes) and peak concentration. Sizing for the average gives about a quarter of the capacity the dinner rush needs." },
        { t: "h", text: "3. API" },
        { t: "code", lang: "http", code: `GET  /v1/feed?lat=12.97&lng=77.59           -> [{ restaurantId, etaMin, fee, open }]
GET  /v1/restaurants/{id}/menu              -> { version, items: [{ id, price, available }] }
POST /v1/orders    Idempotency-Key: 3e7b...  { cartId, addressId, paymentMethodId }
     -> 201 { orderId, status: "PLACED", etaMin }
POST /v1/merchant/orders/{orderId}/accept   { prepMinutes: 15 }      (restaurant tablet)
POST /v1/courier/offers/{offerId}/accept    -> 200, or 409 if expired or taken
WS   /v1/orders/{orderId}/track             <- { status, courierLat, courierLng, etaMin }` },
        { t: "h", text: "4. Data model" },
        { t: "table", head: ["Data", "Store", "Key", "Notes"], rows: [
          ["Restaurants and delivery zones", "PostgreSQL with PostGIS; Elasticsearch for search", "<code>restaurant_id</code>", "A delivery polygon per restaurant, hours, cuisine, rating"],
          ["Serviceability per cell", "Redis, rebuilt about every minute", "(city, H3 res-8 cell) to restaurant IDs with base ETA", "Precomputed from the polygons, then filtered by open, busy and courier supply"],
          ["Menus and availability", "Document store plus cache", "<code>restaurant_id</code>, with a version", "Item toggles from the tablet invalidate the cache"],
          ["Orders", "PostgreSQL sharded by city", "<code>order_id</code>; UNIQUE idempotency key", "A state machine with a version column; outbox table for events"],
          ["Courier live state", "In-memory geo index by city", "<code>courier_id</code>, H3 cell", "Same as ride-hailing, plus the orders currently carried"],
          ["Prep-time and ETA features", "Feature store", "<code>restaurant_id</code>, time of day", "Recent prep times, current queue length"]
        ] },
        { t: "h", text: "5. High-level design" },
        { t: "diagram", caption: "Three apps meet in the order service; dispatch is timed against the predicted food-ready time, not the order time.", code: `flowchart LR
  C(("Customer app")) --> API["API gateway"]
  API --> Feed["Discovery and feed"]
  Feed --> Svc[("Redis: serviceability per cell")]
  API --> Ord["Order service"]
  Ord --> ODB[("Orders DB with outbox")]
  Ord --> Pay["Payment service"]
  ODB -.->|"outbox events"| K[["Kafka: order events"]]
  K -.-> Mer["Merchant gateway"]
  Mer -->|"push to tablet"| R(("Restaurant tablet"))
  K -.-> Disp["Dispatch optimizer"]
  Disp --> Geo[("Courier geo index")]
  Disp --> Prep["Prep-time and ETA models"]
  Disp -->|"offer"| Cou(("Courier app"))
  K -.-> Trk["Tracking service"]
  Trk -.->|"WebSocket"| C` },
        { t: "p", html: "The feed reads the customer's H3 cell from the serviceability cache, filters it (open now, not overloaded) and ranks it, with menus served from cache. Checkout creates the order under an idempotency key and <em>authorizes</em> payment. The capture happens at delivery, so a rejected order costs nothing to unwind. The order service writes state and an outbox row in one transaction (Chapter 9). Events go to the restaurant tablet through a merchant gateway, to the dispatch optimizer, and to the tracking service, which pushes status and courier position to the customer over a WebSocket." },
        { t: "h", text: "6. Deep dives" },
        { t: "p", html: "<b>Serviceability: who can deliver here, right now.</b> A plain radius search is wrong twice over: restaurants have irregular delivery zones (a river or a highway changes travel time), and a restaurant is only serviceable if couriers are nearby and it isn't swamped. Precompute the static part by rasterizing each delivery polygon into H3 resolution-8 cells (~0.7 km² each), giving a cell-to-restaurants index. Every minute or so, overlay the dynamic signals: open or closed, kitchen load, courier supply around the restaurant, rain. A 1,000 km² city has only ~1,400 such cells, and every customer in a cell shares the same candidate list, so the feed is a cache read plus a light personalized re-rank. Under heavy load the platform shrinks serviceability, temporarily dropping far-away restaurants from a cell, rather than accepting orders it can't deliver on time." },
        { t: "p", html: "<b>Dispatch timed to the food, with batching.</b> The goal isn't the nearest courier now; it's a courier who arrives as the food comes out. Ready time = acceptance time + predicted prep time (a model over the restaurant's history, the items and the current queue). A courier sent too early waits at the counter, wasting supply at peak; one sent too late delivers cold food. Instead of greedy one-at-a-time matching, run an optimizer every 30–60 s per zone over all pending orders and nearby couriers. It minimizes a cost of lateness, courier idle time and food wait, and it may <em>stack</em> two orders onto one courier when they come from the same restaurant or lie along one route. Offers and acceptance reuse the ride-hailing machinery: a compare-and-set reservation on courier state, an offer timeout, and re-dispatch if the courier declines or stops moving toward the restaurant." },
        { t: "diagram", caption: "The order is a saga: each step has a compensation, and payment is captured only after delivery so most failures just void an authorization.", code: `sequenceDiagram
  participant Cu as Customer
  participant O as Order service
  participant P as Payment
  participant R as Restaurant
  participant D as Dispatch
  Cu->>O: place order with Idempotency-Key
  O->>P: authorize amount
  P-->>O: authorized
  O->>R: new order on tablet
  alt restaurant accepts with prep 15 min
    R-->>O: accepted, ready at 19:40
    O->>D: dispatch so a courier arrives near 19:40
    D-->>O: courier assigned
    O-->>Cu: on the way, ETA 19:55
    O->>P: capture after delivery
  else rejects or no response in 3 min
    O->>P: void authorization
    O-->>Cu: order cancelled, nothing charged
  end` },
        { t: "p", html: "<b>The order saga and its failure cases.</b> Every transition is a conditional update on the order's version, published through the outbox, so a duplicate tablet tap or courier retry can't move an order backwards. Each failure has a defined compensation. Restaurant rejects or times out: void the authorization (after first escalating to a phone call to the restaurant). Item out of stock after acceptance: the customer approves a substitution, or the capture is reduced. Courier cancels after pickup: urgent re-dispatch to a courier near the current position. Customer cancels after cooking starts: charge per policy. Payment capture failure after delivery goes to a retry and collections queue and never blocks delivery. This is Chapter 8's orchestrated saga, with the order service as the orchestrator." },
        { t: "callout", kind: "tip", title: "Peaks are scheduled; use that", html: "Lunch and dinner happen every day, so scale on schedule: pre-warm gateways, dispatch and the serviceability job 30 minutes before the peak (Chapter 4's predictive scaling), and use surge delivery fees and courier incentives to move supply into the busy zones before the rush rather than during it." },
        { t: "h", text: "7. Trade-offs and bottlenecks" },
        { t: "table", head: ["Decision", "Choice", "Trade-off"], rows: [
          ["Dispatch", "Batched optimization every 30–60 s with stacking", "Better courier utilization and fresher food; up to a minute added before assignment and a harder system to debug"],
          ["Serviceability", "Precomputed per H3 cell, refreshed each minute", "Very cheap reads; a minute of staleness when a kitchen suddenly closes or gets swamped"],
          ["Payment", "Authorize at checkout, capture at delivery", "Clean compensations; authorizations can expire on very long orders, and some payment methods don't support it"],
          ["Order store", "Sharded by city", "Failures contained to one city and simple queries; cross-city analytics go through CDC into a warehouse"],
          ["Bottleneck: the restaurant", "Prep-time model plus throttling a busy kitchen in the feed", "Fewer orders accepted during peaks versus late, cold deliveries and angry customers"]
        ] }
      ],
      followups: [
        "How would you predict prep time, and what happens to dispatch when the prediction is 15 minutes wrong?",
        "A restaurant's tablet loses connectivity during the dinner peak. What does the system do with incoming orders?",
        "How would you support scheduled orders placed for tomorrow's lunch?",
        "How do you decide whether to stack a second order onto a courier who is already carrying one?",
        "Rain starts across the whole city and demand doubles in ten minutes. Walk through what changes."
      ]
    },
    {
      id: "design-instagram-stories",
      title: "Design Instagram Stories (24h expiring media)",
      level: "Medium",
      prompt: "Design Instagram Stories: users post photos and short videos that their followers can view for 24 hours, after which the story disappears. Viewers see a tray of rings for the accounts they follow, with unseen stories highlighted, and tap through stories that play instantly. Authors can see who viewed each story. Stories can be shared with all followers or only a Close Friends list.",
      clarify: [
        "How many daily viewers and posters, and how many stories does a typical poster publish per day?",
        "Must expiry be exact to the second, or is it fine if a story disappears a few minutes late?",
        "After 24 hours, is the story deleted for good, or kept in the author's private archive and Highlights?",
        "How long should the viewer list stay available to the author?",
        "How should the tray be ordered: by recency, or by closeness to the author?",
        "Are replies, reactions and stickers such as polls in scope?"
      ],
      hints: [
        "Separate logical expiry (when viewers stop seeing a story) from physical deletion (when bytes are removed). Can a read-time filter make the first exact while a lazy TTL handles the second?",
        "The tray is a feed problem from Chapter 16. Push the fact that an author has an active story to followers, and pull for celebrities.",
        "Check the fan-out arithmetic: 300M stories a day times an average of 200 followers is far too many writes if every story triggers fan-out. What is the minimum event that changes a viewer's tray?",
        "The seen state can be a single timestamp per viewer and author pair rather than a set of story IDs.",
        "Instant playback is mostly prefetching on the client: the next story and the next author's first story."
      ],
      solution: [
        { t: "h", text: "1. Requirements" },
        { t: "list", items: [
          "<b>Functional:</b> post photo or video stories to followers or Close Friends; the tray shows followed accounts with active stories, unseen first; tap-through playback; the author sees a viewer list; stories vanish for viewers 24 h after posting; the author can keep them in a private archive and add them to Highlights.",
          "<b>Non-functional:</b> a story is visible to followers within a few seconds; playback starts with no visible delay; expiry is exact for viewers; the tray loads in under ~200 ms at p99; storage cost reflects the fact that most media dies in a day."
        ] },
        { t: "h", text: "2. Estimates" },
        { t: "code", lang: "text", code: `Viewers: 500M per day; posters: 25% = 125M, 2.4 stories each ~ 300M stories/day
  300M / 86,400                     ~ 3.5k new stories/s, ~10k/s at peak
Media: 60% photos x 300 KB + 40% 15 s videos x 3.75 MB (2 Mbps) ~ 1.7 MB average
  x2 for renditions                 ~ 3.4 MB stored per story
  300M x 3.4 MB                     ~ 1 PB/day; the live 24 h window is ~1 PB
Tray loads: 500M x 12 app opens = 6B/day ~ 70k/s, ~200k/s at peak
Story plays: 500M x 40 stories = 20B/day ~ 230k/s, ~600k/s at peak (CDN)
  20B x 1.7 MB = 34 PB/day / 86,400  ~ 390 GB/s ~ 3.1 Tbps of egress
Seen events: 20B/day                ~ 230k writes/s; x 30 B ~ 600 GB/day of viewer rows
Fan-out if every story were pushed: 300M x 200 followers = 60B writes/day ~ 700k/s` },
        { t: "p", html: "Three numbers drive the design. Egress of ~3 Tbps means a CDN with aggressive prefetch. Seen-event writes of ~230k/s need a wide-column store with TTLs. And the naive fan-out of ~700k tray writes/s is the thing to cut down in the deep dive." },
        { t: "h", text: "3. API" },
        { t: "code", lang: "http", code: `POST /v1/stories/uploads              -> { mediaId, uploadUrl (presigned) }
POST /v1/stories      { mediaId, audience: "followers|close_friends", stickers }
     -> 201 { storyId, expiresAt }
GET  /v1/tray?cursor=                 -> [{ authorId, latestTs, hasUnseen, previewUrl }]
GET  /v1/users/{authorId}/stories     -> [{ storyId, mediaUrl (signed until expiresAt), durationMs }]
POST /v1/stories/seen                 [{ storyId, authorId, ts }]        (batched by the app)
GET  /v1/stories/{storyId}/viewers?cursor=  (author only) -> { count, viewers }` },
        { t: "h", text: "4. Data model" },
        { t: "table", head: ["Data", "Store", "Key", "Expiry"], rows: [
          ["Active stories", "Cassandra with time-window compaction", "partition <code>author_id</code>, cluster by <code>created_at</code> desc", "Row TTL of 24 h plus a grace period; reads also filter on <code>expires_at</code>"],
          ["Story archive and Highlights", "Cassandra, separate table", "partition <code>author_id</code>", "No TTL; private to the author unless added to a Highlight"],
          ["Media", "Object storage", "<code>stories/live/{date}/{mediaId}</code>; archived copies under <code>stories/archive/</code> in a cold class", "Lifecycle rule deletes the live prefix after 2 days"],
          ["Tray per viewer", "Redis sorted set", "<code>tray:{viewer_id}</code>, member author_id, score latest_ts", "Members trimmed when their stories expire; key TTL 48 h"],
          ["Seen state", "Redis hash backed by Cassandra", "<code>seen:{viewer_id}</code>, field author_id, value last seen ts", "TTL 48 h"],
          ["Viewer lists", "Cassandra", "partition <code>story_id</code>, cluster by <code>viewed_at</code>", "TTL 48 h; count kept in a counter"]
        ] },
        { t: "h", text: "5. High-level design" },
        { t: "diagram", caption: "Posting writes the story and fans out tray membership; viewing reads the tray, then pulls short-lived signed media URLs from the CDN.", code: `flowchart LR
  Au(("Author app")) -->|"upload media"| Obj[("Object store: live prefix")]
  Au -->|"create story"| SS["Story service"]
  SS --> SDB[("Cassandra: stories with TTL")]
  SS -.-> K[["Kafka: story created"]]
  K -.-> Fan["Tray fan-out workers"]
  Fan --> Tray[("Redis: tray per viewer")]
  V(("Viewer app")) -->|"tray"| TS["Tray service"]
  TS --> Tray
  TS -->|"pull celebrity authors"| SDB
  V -->|"stories of one author"| SS
  V -->|"media, prefetched"| CDN["CDN"]
  CDN --> Obj
  V -.->|"seen events"| Seen["Seen service"]
  Seen --> VDB[("Cassandra: viewer lists with TTL")]` },
        { t: "p", html: "The author's app compresses and uploads media while they are still adding stickers, then creates the story. The story service writes a row with <code>expires_at</code> and a TTL, and emits an event. Fan-out workers add the author to each follower's tray, or only to Close Friends for a restricted story. Opening the app reads the viewer's tray sorted set, merges in celebrity authors pulled at read time, marks rings unseen by comparing each author's latest timestamp with the viewer's seen timestamp, and ranks them. Tapping a ring fetches that author's active stories, with signed media URLs that expire at the story's expiry, and the app prefetches ahead. Seen events are batched to the seen service, which updates the viewer's seen state and appends to the story's viewer list." },
        { t: "h", text: "6. Deep dives" },
        { t: "p", html: "<b>Expiry done right.</b> Don't rely on a cron job deleting rows at exactly 24 h; a backlog would leave stories visible late. Use two layers. <em>Logical</em> expiry is a read-time filter, <code>expires_at &gt; now()</code>, on every query and tray entry, which makes expiry exact to the second however far behind cleanup is. <em>Physical</em> deletion is lazy and cheap: a Cassandra row TTL, an object-storage lifecycle rule on the live prefix, and Redis key TTLs. Cassandra TTLs leave tombstones, so use time-window compaction, which groups rows by write time into SSTables and drops a whole SSTable once everything in it has expired, instead of compacting tombstones row by row. Media URLs are signed to expire at <code>expires_at</code>, and the CDN's max-age is capped at the remaining lifetime, so a cached copy stops being reachable on time. Archiving copies the story row to the archive table and the media to the archive prefix at creation (a server-side copy), which keeps the live tier purely disposable." },
        { t: "diagram", caption: "Viewers stop seeing a story exactly at expiry because of the read filter and signed URLs; storage is reclaimed later by TTLs that need no cleanup job.", code: `flowchart TD
  Post["Story posted at T"] --> Row["Row with expires_at T plus 24 h and TTL"]
  Post --> Media["Media in live prefix, lifecycle 2 days"]
  Post -->|"if archive is on"| Arch["Copy to archive table and archive prefix"]
  Row --> Read["Every read filters expires_at after now"]
  Media --> URL["Signed URL valid until expires_at"]
  URL --> Edge["CDN max-age capped at remaining life"]
  Read --> Gone["Viewers stop seeing it exactly at T plus 24 h"]
  Edge --> Gone
  Row -.->|"later"| TWCS["TTL expiry, whole SSTables dropped"]
  Media -.->|"later"| LC["Lifecycle rule deletes objects"]` },
        { t: "p", html: "<b>The tray without a fan-out storm.</b> A viewer's tray changes membership only when an author goes from no active stories to some, or back. A third story posted the same afternoon only changes that author's latest timestamp. So fan out only on the <em>first</em> story in an author's active window, adding the author to followers' trays with the expiry of that window. Subsequent stories update one <code>latest_ts</code> in a per-author cache, which the tray service fetches in a single multi-get for the ~50–100 authors in a tray. That cuts fan-out from about 300M × 200 to about 125M × 200 = 25B writes a day, roughly 290k/s spread across a Redis cluster, and authors with millions of followers are never fanned out at all; they are pulled and merged at read time, the hybrid model from Chapter 16. The seen state is one timestamp per (viewer, author) pair, and a ring is unseen if the author's <code>latest_ts</code> is greater than the viewer's seen timestamp, which is far cheaper than storing a seen bit per story." },
        { t: "p", html: "<b>Playback with no visible delay.</b> The client does most of the work. On tray load it prefetches the first story of the first few rings. While story N plays, it prefetches N+1 and the first story of the next author. Videos are encoded short and small enough that the first bytes arrive in one round trip from the edge. Viewer lists are written at ~230k/s into Cassandra partitions keyed by <code>story_id</code>, which are wide but bounded (a story with 10M views is a large partition, so a celebrity's viewer list is split into bucketed partitions). The view count is a separate counter, so the author sees a number instantly and pages through names on demand." },
        { t: "h", text: "7. Trade-offs and bottlenecks" },
        { t: "table", head: ["Decision", "Choice", "Trade-off"], rows: [
          ["Expiry", "Read-time filter plus lazy TTL deletion", "Exact for viewers and no cleanup job; expired bytes linger for a day or two, which matters for strict deletion promises"],
          ["Tray fan-out", "Push on an author's first active story; pull celebrities", "Far fewer writes; the tray service does a multi-get and a merge on every load"],
          ["Seen state", "Last-seen timestamp per viewer and author", "Tiny and fast; skipping ahead marks earlier stories as seen too"],
          ["Media tiers", "Disposable live prefix, separate archive copy", "Cheap lifecycle deletes; archiving costs a copy for every story"],
          ["Bottleneck: celebrity viewer lists", "Bucketed partitions plus a separate counter", "More complex reads for a few accounts, in exchange for bounded partitions"]
        ] }
      ],
      followups: [
        "A user reports that a deleted story was still visible to a follower for a minute. Where could it have been served from, and how do you close the gap?",
        "How would you rank the tray by closeness instead of recency, and where does that computation run?",
        "Add replies and emoji reactions that go to the author's inbox. What changes?",
        "How would you support a user switching a story's audience from Close Friends to all followers after posting?",
        "Legal requires that expired media be unrecoverable within 24 hours of expiry. What changes in the storage design?"
      ]
    }
  ]
};
