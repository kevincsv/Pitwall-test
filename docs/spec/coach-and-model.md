# Coach, lap analyzer and the model

How this part of Pitlane HQ behaves. Read it before changing this area; keep it up to date when the behaviour changes.

- One model per car and track (`cloud/src/model.js`, fed to the coach and the lap analyzer by
  `web/dist/pitwall-model.js`): it learns from every real lap it knows (the accounts' laps, shared
  or not; shared laps; the laps of the rivals of your races) and its references are real laps,
  never composites: the record (the fastest lap really driven) and, for your pace, the lap of the
  driver just ahead. It has no panel of its own: the coach shows the record, the next level and
  your pace among the drivers known there, and both views offer its references as lap B; the lap
  list is coloured by it. No second "ideal" or theoretical lap anywhere (the Mini-sectors widget and overlay show the
  current lap against your best only, never a lap made of the best pieces).
  Test drives never teach the model nor go to the leaderboards; the model learns only from practice,
  qualifying and race laps of official series and of sessions against iRacing's AI, whose people are real drivers
  (`ai` on the session and the lap, `hasAI` in journal.go, migration 0035; the bots' laps never go up); hosted and
  league laps still show on the boards.
  The car card (`car_cards`, one per car, `buildCarCard` in model.js, `/community/car`): what a car
  does on every track it was driven on (hardest braking, the speeds the fast drivers shift up at, top
  speed and where), from the model's memory. The coach shows it against lap A only when nobody known
  is ahead on that car and track; the phone apps show it in the lap analysis. It is a hint of what the
  car can do, never a reference lap. The ten-minute job (`rebuildDirty`) builds only what the uploads marked
  (`markModel`, `markCar`); the sweep that adds every car and track with laps but no model runs once a day (03:00 UTC),
  and a car card row is never left dirty after a try (a family badge is built under its family's id).
- The coach and the lap analyzer stay short: the coach is the gap, what to work on first, the plan,
  the map, the sectors and the corners that cost the most; the analyzer is the gap with its three
  key facts (plus the corners against the straights), every corner as a small bar you can press to pin the charts
  and the map at it (`la-corners`; `CornerStrip` on the phones, where a corner is "T3" too), the charts with the reference's corners as bands labelled by the official turns
  (`cmpCornerBands`), the "Line" chart (how far A was to one side of B, + left, `LAPCH.line`), the map, the sectors,
  the lap list and the braking points. The lap list has a column per sector (S1, S2, S3…: the game's official sectors that add
  up to the lap's time, `lapSecCols`; a session without them has no sector columns, on the phones neither), purple the
  session's best of each among the valid laps, green a valid lap's one better than your best lap's. The braking points are a table of lap A against lap B per corner of
  `coachCompare` in pitwall-analysis.js (`renderBrakeTable`): the turn ("T7"), where A and B brake, Δ m (+ A later; red when A brakes 3 m or more
  before B, muted otherwise), the speed at each apex, the gear at the apex ("3 / 4" when they differ), the time lost and what
  to do (the tip of the phase that loses the most in a few words, without the line tip added after it, `tipMain`/`tipShort` in pitwall-analysis.js, `todo` on the corners the phones get;
  a line tip that replaced a generic one stays); a row pins the charts and the map like the corner bars. The phones' lap
  list and lap analysis show the same. "Take the plan to the coach overlay" takes the turns of the plan's first four steps
  (`turns` on each step of `coachPlan`, `planTurns`), on the phones too when they run the module.
  The corner tips (`coachCompare` in pitwall-analysis.js wherever the app or the phones analyse a lap, `compareLaps` in
  ovnative4.go for the coach overlay; the phones' `corners` in LapMath/Models only as the fallback):
  the phase that loses the most says the tip, and every tip follows the measured facts, never against them: braking
  later than the reference and arriving slower at the apex is one mistake whatever phase pays for it ("brake a little
  earlier and carry the speed"); with the same braking point the tip is about the brake (harder at first, trail, or
  "brake hard at once, then release progressively"), never "brake later"; an apex reached as fast as the reference's
  says the time goes before it (entry) or in a longer slow part (apex); a throttle picked up earlier than the
  reference's but a slower apex says to carry the speed, never "full throttle sooner". A generic tip gives way to
  what the data shows plainly, in this order: the line (inside/outside), the gear at the apex against the reference's,
  throttle lifts after the apex (exit), steering corrections in the corner (wherever both laps carry steering, the phones
  too since they run the same module; never against a model reference, whose points have none). The plan's habit advice (`coachPlan`) takes its direction from the averages over the corners: where
  you brake against the reference, how fast you reach the apex and when you pick up the throttle. The PC's coach overlay
  measures the last lap against the model's next level when it is faster than the session's best, else the best.
- The lap analysis and the coach are one file, `web/dist/pitwall-analysis.js` (`PW_ANALYSIS`, pure JavaScript: no page, no
  storage, no network), run by the web and the PC app (index.html loads it with a relative script tag before its own script
  and calls it through thin wrappers, `anaCtx` hands it the language, units, official turns, `COACH_W`/`COACH_ME` and the
  model's corner cards) and by the phones (Android's JavaScriptSandbox, iOS's JavaScriptCore; they download
  pitlanehq.app/pitwall-analysis.js, served with `no-cache` and its ETag like every app file, keep it on disk and carry a
  copy in the app used until a download succeeds; the mobile repository's `tools/sync-analysis.sh` refreshes that copy). It has the corners and their tips, the plan, the sectors, the line, how
  the lap is driven, the analyzer's key facts and the next level's step (`stepText`), and what the coach learnt
  (`coachOf`: the plan's weights, the metres a braking tip asks for, the kinds turned off); `analyse(A, B, ctx)` gives all
  of it as plain JSON (`v`, the shape's version, 1: the phones run only the version they were built for, and a newer
  shape raises it) with the session's laps in `ctx.laps` for how steady each corner is, so the phones' plan is the PC's. Its
  texts are in English, Spanish and Portuguese (a corner's `tip` is [en, es, pt], `tipTx` on the web). A change there is
  a change on every device at once: `cloud/test/analysis.test.mjs` runs index.html's own functions and the module over
  realistic laps and keeps every answer as it was (`analysis.fixture.json`; a change meant to change them writes it again
  with `--capture web/dist/index.html` and says why in the commit). The Go copies (`compareLaps`, `cornerZones` in
  ovnative4.go, racingline.go) still serve the overlays.
- The coach learns from what happens after its tips (`cloud/src/coachtips.js`, migration 0051 `coach_tips`; never an LLM
  and never an outside API). Every tip has a kind (`kind` in `coachCompare`, the same names as the phones' `tip_*` keys:
  brake_later, trail, coast, apex_speed, line_apex…) and every corner a speed class (`cls`: slow, medium, fast at the
  reference's slowest point). When the coach shows a lap (web and PC, `coachReport`), its tips go to the account once per
  lap and reference (POST `/community/coach/tips`) with the time the session's best lap spent in every corner (`tbest`);
  the driver's next session on that car and track answers them (`outcome`, seconds gained in the same corner, matched by
  its slowest point within 60 m). Every tip card has 👍/👎 (web, PC and phones, POST `/community/coach/rate`, `TIPRATE` on
  the web, `tipRatings` on the phones). The drivers see none of the counts. The admin panel's Coach tab shows the buckets
  (kind × speed, cases, how many gained, the thumbs). From 30 answered cases a bucket's share of gains reorders the plan
  (`w` from GET `/community/coach/weights`, `coachOf` in pitwall-analysis.js, 0.7 to 1.3, and 15 % less for a kind the drivers
  mostly thumb down); the tips' texts never change by themselves and no lap is made of this. The corner card
  (`cornerCard` in model.js, `corners` in the model, MODEL_VERSION 8 and up): for every braking zone of the record lap, the range
  of braking points and of speeds at the slowest point among the fastest drivers here (one lap each, the fastest 30 %, 3 to
  12), shown under the tip as one line ("The fast drivers here brake between 312 and 328 m and pass the apex at
  112–118 km/h (6 drivers)", `cornerHint` in pitwall-model.js, `CornerCard` on the phones): a hint, never a reference lap.
  How the coach keeps learning (migration 0053), all of it counts over real laps, never an LLM: the metres a braking tip
  asks for are what the drivers who gained really moved their braking by (`dd`/`ddn` on the tips, `ask` per bucket from 10
  gains, `coachOf` in pitwall-analysis.js, never more than the gap seen); the driver's own memory (`/community/coach/me`: the kinds that
  repeat on 3 or more of their tracks are habits, shown first in the plan and on the phones, and their own buckets weigh
  from 10 cases, `COACH_ME`); the step to the next level (`levelStep` in model.js, `step` on every ladder entry: the
  corners where the laps just slower than that reference lose to it, "the drivers at your pace make the step in T4 and
  T9" under the Next level card); each corner's difficulty (`spread` of the drivers' corner times, weighing the plan with
  `dif`); laps in traffic (a car within a second ahead for a fifth of the lap, `traffic` in `Trace.f`, the agent checks
  twice a second), on cold tyres (the first lap of a run, `cold`) or on a wet track (`wet`, TrackWetness at 4 or more,
  lightly wet on iRacing's scale, at any point of the lap, "wet track" on the web) are tagged on the web (`lapOptText`;
  a damp track, `damp`, says "damp track" and a lap in the rain, `rain`, "rain", and neither is a disturbance),
  never the coach's default lap A (`lapClean`) and, traffic and wet, never the model's (`goodLap`; a cold lap is the
  driver's own); the tyre compound travels as `cmp:<n>` in `Trace.f` when the car has several (PlayerTireCompound over
  0, the value at the lap's end), shown nowhere and no disturbance for the coach's default lap; a corner taken
  differently every lap (its spread over twice its loss) hears
  "the same braking point every lap" first (kind `cons`); the corner card by track temperature band (cold under 25 °C,
  hot over 35, `bands`, `model_laps.temp`) when a band has enough laps, and the fast drivers' line at the apex against
  the record's (`lineRanges`, `line` on the corner, a range never a composite); a tip may say how many drivers it helped
  on corners like it only when the admin turns it on (Coach tab, `coach_confidence`); an admin turns a kind off for
  corners of one speed (`coach_off`, `off` in /coach/weights: web, PC and phones say the phase's plain tip instead).
- The model (`cloud/src/model.js`, see `MODEL_VERSION` there) learns clean traces only (a speed jump over 10 m/s between two
  points is a glitch), never a lap in traffic or on a wet track (`goodLap`: a wet lap teaches braking points of another
  track state) and marks a rival's lap (`field`: pedals and gears estimated from its speed against what that car really does at each speed, full-throttle acceleration, slowing with no pedal and full-brake deceleration learnt from the real laps of the car on any track, `pedals` in the car card, `cloud/src/pedals.js`, partial throttle and brake, never only 0 or 100 %; served that way by the model and `/community/laps/:id`); the next level prefers a
  lap with real pedals, and `idealField` says when the record is a rival's. A rival's lap whose pedals the game itself
  gave (Le Mans Ultimate's telemetry of the other cars, `Trace.src` "real" from field.go, kept as such by POST `/laps`)
  is a real lap: the model and `/community/laps/:id` estimate pedals only over src "field". It is "real" only when its
  pedals move (the throttle to half and the brake to a fifth at least; still or missing pedals are estimated), it keeps
  its src in `model_laps` and it never teaches the car card what the car does at each speed (`rival` in `goodLap`: no
  pedals' envelope, no shift speeds), its speed coming from its position. A rival's lap on a wet track carries `wet` too.
  Tyre compounds are never mixed in a reference: the memory keeps every lap's compound (`model_laps.cmp`, migration
  0066, `lapCompound`: the lap's `cmp:<n>`, 0 for an account's lap without it, -1 for a rival's whose tyres nobody
  knows), and when a car and track have laps on several compounds each one with 5 laps or more from 3 drivers or more
  (`CMP_MIN`, `CMP_DRIVERS`) gets its own record,
  next levels and corner card (`byCmp`, `compoundsOf`, `refsOf`); the model of every lap stays the default. A client
  asks for the compound of its lap A (`cmp` on `/community/model`, `forCompound`; `cmpOf` in pitwall-model.js, the
  phones' `Trace.cmp`, the PC's coach and braking overlays and the app's live compare and Braking markers widget by
  PlayerTireCompound, `liveCmp`, which the laps recorded live keep as `cmp`) and gets that compound's references
  when the model has them, else every lap's; `cmps` lists the compounds it has apart. The pace among the drivers
  (`times`) is every lap's.
