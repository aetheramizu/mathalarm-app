# MathAlarm — v1 Architecture Blueprint

**Status:** proposed, awaiting review
**Companion to:** `PRD.md` v1.0 (scope locked)
**Last updated:** 2026-09-10

This document is the engineering contract for v1. It assumes the product scope in
`PRD.md` and does not reopen it.

---

## 1. Project / module structure

```
D:\AppDev\MathAlarm
├─ PRD.md, ARCHITECTURE.md, AGENTS.md, app.json, eas.json
├─ modules/alarm-core/                  # Kotlin kernel — built, proven, frozen for v1
│  ├─ android/.../alarmcore/*.kt        # AlarmCoreModule, Receiver, Scheduler, Service,
│  │                                    # Store, WakeLock, BootReceiver
│  ├─ app.plugin.js                     # manifest entries for the wake activity
│  └─ src/AlarmCore.types.ts | AlarmCoreModule.ts
└─ src/
   ├─ app/                              # expo-router routes only; thin, no logic
   │  ├─ _layout.tsx                    # root stack, providers, db init, cold-start routing
   │  ├─ (tabs)/_layout.tsx             # Alarms · Analytics · Settings
   │  ├─ (tabs)/index.tsx               # Alarms
   │  ├─ (tabs)/analytics.tsx
   │  ├─ (tabs)/settings.tsx
   │  ├─ onboarding.tsx                 # permission gate (modal)
   │  └─ wake.tsx                       # full-screen challenge — OUTSIDE (tabs)
   ├─ design/                           # tokens.ts, typography.ts, fonts.ts
   ├─ ui/                               # dumb presentational components
   │                                    # Button, Card, Chip, Toggle, Keypad, Sheet, reduced-motion hook
   ├─ features/                         # screen-level React: components + hooks
   │  ├─ alarms/    AlarmCard, AlarmForm, TimePicker, useAlarms
   │  ├─ wake/      WakeChallenge, machine.ts, useWakeMachine
   │  ├─ analytics/ useAnalytics, SessionRow, StatTile
   │  └─ settings/  PermissionRow, usePermissions
   ├─ domain/                           # PURE TypeScript — no React, no native, no db
   │  ├─ math/      engine.ts, generators.ts, types.ts
   │  ├─ schedule/  occurrence.ts       # repeat bitmask → next trigger
   │  └─ analytics/ metrics.ts          # sessions[] → summary
   ├─ data/                             # persistence
   │  ├─ db.ts, migrations/001_init.ts
   │  ├─ repositories/ alarms.ts, sessions.ts, activeChallenge.ts, settings.ts
   │  └─ models.ts                      # row types + mappers
   └─ services/                         # orchestration — the ONLY callers of AlarmCore
      ├─ alarm-scheduler.ts             # arm / cancel / reconcile
      ├─ wake-session.ts                # session lifecycle
      └─ permissions.ts
```

**Dependency rule, enforced by review:**

```
app/ ──► features/ ──► services/ ──► data/ ──► domain/
                └─────► ui/ ──► design/
```

`domain/` imports nothing but its own types — that is what makes the math engine,
the occurrence calculator, and the analytics maths testable without a device.
Only `services/` may import `modules/alarm-core`.

`src/spike/` is deleted in P0. The route it backs (`src/app/index.tsx`) becomes the
real Alarms screen.

---

## 2. React Native ↔ Kotlin boundary

The kernel is **frozen for v1**. No Kotlin changes are planned; if the P8 hardening
matrix turns up an OEM defect, that is the only phase that may reopen it.

### What crosses the boundary

| Direction | Call / event | Payload |
|---|---|---|
| JS → native | `scheduleAlarm({ id, triggerAtMs, label })` | one absolute occurrence |
| JS → native | `cancelAlarm(id)` | |
| JS → native | `getScheduledAlarmIds()` | reconciliation input |
| JS → native | `dismissAlarm(id)` | stops audio, vibration, wake lock |
| JS → native | `getActiveAlarm()` | cold-start path: what is ringing right now |
| JS → native | `getPermissionStatus()` + four request calls | |
| native → JS | `onAlarmFired({ id, label, firedAtMs })` | only useful while JS is alive |
| native → JS | `onAlarmDismissed({ id, reason })` | `solved` \| `cancelled` \| `systemStopped` |

### What does not cross it

Native knows nothing about math problems, difficulty, repeat days, sessions,
analytics, or the database. It is told *when* to fire and *which id*. All product
logic is TypeScript. This is what keeps the risky, hard-to-debug half small and
stable.

### The cold-start path is the important one

An alarm normally fires when no JS context exists. The full-screen intent launches
the app; JS then discovers the ringing alarm by **polling `getActiveAlarm()` at
boot**, not by waiting for `onAlarmFired` — that event was broadcast before this JS
context existed. The event listener exists only for the case where the app is
already open when an alarm fires.

Native keeps the active record in device-protected storage, so this works even if
the app was launched cold by the intent.

---

## 3. SQLite schema

`expo-sqlite`, local, no sync. Version tracked with `PRAGMA user_version`.

```sql
-- 001_init
CREATE TABLE alarms (
  id              TEXT    PRIMARY KEY NOT NULL,   -- uuid; also the kernel's alarm id
  hour            INTEGER NOT NULL CHECK (hour BETWEEN 0 AND 23),
  minute          INTEGER NOT NULL CHECK (minute BETWEEN 0 AND 59),
  label           TEXT,
  repeat_days     INTEGER NOT NULL DEFAULT 0 CHECK (repeat_days BETWEEN 0 AND 127),
                                                  -- bitmask Mon=1..Sun=64; 0 = one-time
  difficulty      TEXT    NOT NULL CHECK (difficulty IN ('easy','medium','hard')),
  enabled         INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  next_trigger_at INTEGER,                        -- cache of the armed occurrence; derived
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX idx_alarms_enabled_next ON alarms (enabled, next_trigger_at);

CREATE TABLE wake_sessions (
  id                TEXT    PRIMARY KEY NOT NULL, -- uuid
  alarm_id          TEXT    NOT NULL,             -- no FK: history outlives a deleted alarm
  alarm_label       TEXT,                         -- snapshot at fire time
  difficulty        TEXT    NOT NULL,             -- snapshot
  required_problems INTEGER NOT NULL,             -- snapshot; history survives ladder changes
  fired_at          INTEGER NOT NULL,
  first_answer_at   INTEGER,
  dismissed_at      INTEGER,
  outcome           TEXT    NOT NULL DEFAULT 'ringing'
                    CHECK (outcome IN ('ringing','solved','system_stopped','cancelled','abandoned')),
  correct_count     INTEGER NOT NULL DEFAULT 0,
  wrong_count       INTEGER NOT NULL DEFAULT 0,
  solve_ms          INTEGER                       -- dismissed_at - first_answer_at
);
CREATE INDEX idx_sessions_fired_at ON wake_sessions (fired_at DESC);

CREATE TABLE active_challenge (                   -- at most one row, ever
  id                INTEGER PRIMARY KEY CHECK (id = 1),
  session_id        TEXT    NOT NULL,
  alarm_id          TEXT    NOT NULL,
  step_index        INTEGER NOT NULL,
  required_problems INTEGER NOT NULL,
  wrong_count       INTEGER NOT NULL,
  problem_json      TEXT    NOT NULL,             -- the exact question on screen
  started_at        INTEGER NOT NULL,
  first_answer_at   INTEGER,
  updated_at        INTEGER NOT NULL
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
-- seeded: default_difficulty='medium', onboarding_completed='false'
```

A session row is inserted **at fire time** with `outcome='ringing'`, not at dismissal.
An alarm that the system kills, or that the user never solves, must still leave a
record — otherwise Analytics only ever shows successes, which is a lie by omission.

### Forward compatibility with `question_attempts`

Per-question rows are **not** in v1. The model is nonetheless shaped so they can be
added without touching `wake_sessions`:

- `wake_sessions.id` is a stable UUID, ready to be a foreign-key parent.
- `correct_count` / `wrong_count` / `solve_ms` are stored columns, so a future child
  table becomes a detail source, not a replacement — the aggregates stay valid and
  simply become a denormalised cache.
- `Problem.id` (see §6) is generated per shown question and carried in
  `active_challenge.problem_json`, so the identifier a future attempts row would key
  on already exists.
- The repository exposes a single write path,
  `sessions.recordAnswer(sessionId, { problem, given, correct, shownAt, answeredAt })`.
  In v1 it increments counters. In a later version the same call also inserts an
  attempts row. **No caller changes.**

The future migration is purely additive:

```sql
-- 002_question_attempts (NOT v1)
CREATE TABLE question_attempts (
  id          TEXT PRIMARY KEY NOT NULL,
  session_id  TEXT NOT NULL REFERENCES wake_sessions(id) ON DELETE CASCADE,
  step_index  INTEGER NOT NULL,
  prompt      TEXT NOT NULL,
  expected    INTEGER NOT NULL,
  given       INTEGER,
  correct     INTEGER NOT NULL,
  shown_at    INTEGER NOT NULL,
  answered_at INTEGER
);
```

---

## 4. Alarm scheduling and reconciliation

### Occurrence calculation — `domain/schedule/occurrence.ts`

```ts
nextOccurrence(alarm: { hour; minute; repeatDays }, from: Date): number | null
```

- `repeatDays === 0` (one-time): today at `HH:MM` if still ahead of `from`, else tomorrow.
- Otherwise: scan the next 8 local days, return the first whose weekday bit is set and
  whose wall-clock time is after `from`.
- Wall-clock is stored rather than an absolute timestamp, so "06:30" stays 06:30
  across a DST shift or a timezone change. The occurrence is built from local
  calendar fields; on the spring-forward hour that does not exist, the platform
  rolls forward, which is the correct behaviour for an alarm.

### Arming

JS arms **exactly one occurrence** at a time. The kernel holds no repeat rule.

- Save / enable an alarm → compute occurrence → `scheduleAlarm` → store `next_trigger_at`.
- Disable / delete → `cancelAlarm(id)` → null `next_trigger_at`.
- On dismissal → repeating alarm: compute and arm the next occurrence.
  One-time alarm: set `enabled = 0`.

Rescheduling at dismissal is deliberate: that is the one moment the app is
guaranteed to be running.

### Reconciliation — `services/alarm-scheduler.ts#reconcile()`

Triggered on: cold start (after the database is ready), every `AppState → active`,
after any alarm mutation, after a dismissal, and after returning from a permission
settings screen. Guarded by a single-flight mutex so a foreground event and a
native event cannot run it concurrently.

1. `ids = new Set(await AlarmCore.getScheduledAlarmIds())`
2. For each **enabled** alarm: `expected = nextOccurrence(alarm, now)`.
   If `!ids.has(alarm.id)` or `alarm.next_trigger_at !== expected` → `scheduleAlarm`
   (rescheduling with an existing id replaces it) and update the row.
3. For each id in `ids` with no enabled alarm behind it → `cancelAlarm(id)`.
4. Sweep stale sessions: any row still `outcome='ringing'` while
   `getActiveAlarm()` is null and `fired_at` is more than 30 s old →
   `outcome='abandoned'`. The 30-second floor keeps the sweep from racing a ring
   that has only just started.

Reconciliation is idempotent and cheap; running it more often than strictly
necessary is the intended trade.

---

## 5. Wake-screen state machine

`features/wake/machine.ts` — a plain reducer, no state-machine library.

```
                 ┌────────────┐
   app boot ────►│  RESOLVING │  getActiveAlarm()
                 └─────┬──────┘
              null ◄───┤
                       │ active alarm
                 ┌─────▼──────┐
                 │  RESUMING  │  read active_challenge
                 └─────┬──────┘
                       │
                 ┌─────▼──────┐  DIGIT / CLEAR
                 │  SOLVING   │◄──────────────┐
                 └─────┬──────┘               │
       SUBMIT wrong ───┤──────────────────────┘  new problem, wrong_count++
       SUBMIT correct ─┤
                       │ step + 1 < required ──┘
                       │ step + 1 === required
                 ┌─────▼──────┐
                 │ DISMISSING │  session write → clear challenge → dismissAlarm
                 └─────┬──────┘
                       │
                 ┌─────▼──────┐
                 │   CLOSED   │  navigate back to (tabs)
                 └────────────┘
```

**RESUMING** decides between resume and fresh start:

- `active_challenge` exists **and** its `alarm_id` matches the ringing alarm → restore
  `step_index`, `wrong_count`, and the exact `problem_json`. The user continues where
  they were.
- Its session is already `outcome='solved'` (death between the session write and the
  native dismiss) → call `dismissAlarm` again and go straight to `CLOSED`.
  `dismissAlarm` is idempotent.
- Otherwise → insert a session (`outcome='ringing'`, snapshots of label, difficulty
  and required count), generate problem 1, write `active_challenge`, enter `SOLVING`.

**SOLVING** events:

| Event | Effect |
|---|---|
| `DIGIT` | append to entry, capped at 6 characters |
| `CLEAR` | entry = '' |
| `SUBMIT` correct | first answer sets `first_answer_at`; `correct_count++`; step+1; last step → `DISMISSING`, else new problem |
| `SUBMIT` wrong | `wrong_count++`, brand-new problem, entry cleared, wrong flash; step unchanged |
| `NATIVE_DISMISSED(reason)` | native stopped ringing underneath us → close the session with that reason → `CLOSED` |

**DISMISSING** ordering matters, and is chosen so that every crash point is recoverable:

1. write the session: `outcome='solved'`, `dismissed_at`, `solve_ms`
2. delete `active_challenge`
3. `AlarmCore.dismissAlarm(id)`
4. reschedule the next occurrence, or disable a one-time alarm
5. `CLOSED`

Death between 1 and 3 leaves the alarm ringing with a solved session — RESUMING
detects exactly that and re-issues the dismiss. The reverse order would strand a
solved wake as `abandoned`.

**Invariants**

- Every transition that changes step, wrong count, or the current problem writes
  `active_challenge` **before** rendering. Process death can therefore lose at most
  the digits typed since the last submit.
- System back is disabled in `SOLVING` and `DISMISSING`.
- "Is it still ringing" is answered by `getActiveAlarm()` on foreground, never by a
  JS timer.
- An alarm firing while the app is already open arrives as `onAlarmFired` →
  `router.replace('/wake')`.
- The long-press abort escape hatch exists only under `__DEV__`.

---

## 6. Math engine interface

`domain/math` — pure, synchronous, dependency-free.

```ts
export type Difficulty = 'easy' | 'medium' | 'hard';

export type ProblemKind = 'add' | 'sub' | 'mul' | 'mixed' | 'linear';

export type Problem = {
  id: string;            // uuid per shown question — the future attempts key
  prompt: string;        // "47 + 28"   |   "3x + 4 = 19"
  answer: number;        // always an integer
  kind: ProblemKind;
  difficulty: Difficulty;
};

export type RNG = () => number;   // injected so tests are deterministic

export const REQUIRED_PROBLEMS: Record<Difficulty, number> =
  { easy: 1, medium: 3, hard: 5 };

export function generateProblem(
  difficulty: Difficulty,
  options?: { rng?: RNG; avoidAnswer?: number },
): Problem;
```

Guarantees the generator upholds, and the tests assert:

- The answer is always a non-negative integer — subtraction never goes below zero,
  division is not used, and linear equations are constructed from the solution
  backwards so `x` is a whole number.
- `avoidAnswer` prevents a replacement problem from happening to share the previous
  answer, which would let a wrong guess accidentally succeed on the retry.
- Prompts are ASCII and fit one line at the display size.
- Difficulty content: **easy** single-digit `+`/`−`; **medium** two-digit `+`/`−` and
  single-digit × two-digit `×`; **hard** multi-digit `×`, mixed operations with real
  precedence, and simple linear equations.
- Seeded with a fixed RNG, output is reproducible.

---

## 7. Permission flow

Four independently gated capabilities, from `AlarmCore.getPermissionStatus()`:
`canScheduleExactAlarms`, `canPostNotifications`, `canUseFullScreenIntent`,
`isIgnoringBatteryOptimizations`.

- **First launch** (`settings.onboarding_completed !== 'true'`) opens `/onboarding`:
  one row per permission, plain-language reason, a button each, and an honest
  "Continue anyway".
- **Settings tab** keeps the same rows permanently as a live health panel.
- **Alarms tab** shows a warning banner whenever exact alarms or notifications are
  missing — those two break ringing outright. The battery-optimisation exemption is
  advisory, and matters most on aggressive OEM skins.
- Only the notifications request resolves in-process. The other three open a system
  settings screen and their true state arrives on the next foreground, so the status
  is re-read on every `AppState → active`.
- A missing permission never blocks saving an alarm. It warns; the user decides.

---

## 8. App lifecycle and process-death handling

**Cold start**, in `src/app/_layout.tsx`, in this order:

1. open the database and run migrations; load fonts
2. `getActiveAlarm()` — non-null → `router.replace('/wake')` **before** the tabs
   render, so a ringing alarm never flashes the alarm list first
3. otherwise → `reconcile()` and render the tabs

**On `AppState → active`:** refresh permission status, `reconcile()`, and re-check
`getActiveAlarm()`.

**Process-death matrix**

| Death point | Recovery |
|---|---|
| Mid-challenge, alarm still ringing | `active_challenge` restores the step and the exact problem |
| After session marked solved, before `dismissAlarm` | RESUMING sees a solved session for a ringing alarm and re-issues the dismiss |
| After `dismissAlarm`, before the reschedule | `reconcile()` on next launch re-arms the occurrence |
| Ringing, app killed and never reopened | Native reports `systemStopped`; the session is swept to `abandoned` |

**On the JS side there is no in-memory alarm state that matters.** Everything a
restart needs is in SQLite or in the kernel's own store.

---

## 9. Reboot handling

- The kernel's `BootReceiver` handles `BOOT_COMPLETED`, `MY_PACKAGE_REPLACED`, and two
  OEM quick-boot variants; it clears any stale active record and re-arms from its own
  device-protected store.
- Occurrences whose time passed while the device was off are **dropped, not fired
  late** — a 3 a.m. alarm going off at 9 a.m. is worse than silence.
- `LOCKED_BOOT_COMPLETED` is deliberately not handled: nothing downstream can run
  before first unlock, because the wake screen is React Native.
- JS `reconcile()` on the next launch restores anything native dropped.
- A stale `active_challenge` row surviving a reboot, with `getActiveAlarm()` null, is
  closed out as `system_stopped` and deleted.
- **Known gap (accepted, PRD §13):** if the device is powered off across a repeating
  alarm's fire time, that alarm's next occurrence is not armed until the app is next
  opened. The durable fix is moving the repeat rule into native, which is out of v1.

---

## 10. Analytics calculation rules

All maths lives in `domain/analytics/metrics.ts` as one pure function
`summarise(sessions, now) → AnalyticsSummary`. Only `wake_sessions` rows feed it, and
rows still `outcome='ringing'` are excluded.

| Metric | Rule |
|---|---|
| Session list | `fired_at`, label, `dismissed_at`, outcome, correct/wrong, `solve_ms` |
| Time to dismiss | `dismissed_at − fired_at`, solved sessions only |
| Solve speed | `solve_ms / required_problems`, solved sessions with a `first_answer_at` |
| Accuracy | `correct / (correct + wrong)` over the window; denominator 0 → `null` |
| Fired / solved / stopped counts | grouped by outcome over the window |
| Streak | distinct **local calendar days** carrying at least one `solved` session, counted backwards; the streak is "current" only if its most recent day is today or yesterday |

Windows are 7 and 30 days, cut on local midnight boundaries.

**Honesty rules.** A `null` metric renders as `—`, never as `0%`. Empty history renders
an empty state, not a dashboard of zeros. No metric may be derived from anything
other than these rows — no sleep, no sensors, no inference. Streak is historical
data only: no XP, levels, badges, rewards, or leaderboards.

---

## 11. Implementation order and dependencies

| Phase | Deliverable | Depends on | Verified by |
|---|---|---|---|
| **P0 Foundations** | Design tokens, Geist + JetBrains Mono bundled, dark-only config, new deps, three-tab shell with `wake` outside the tabs, `src/spike/` deleted | — | App boots to an empty Alarms tab on the phone |
| **P1 Data layer** | Schema, migrations, four repositories, models | P0 | Repository tests; database inspected on device |
| **P2 Math engine** | Generator for three tiers, `REQUIRED_PROBLEMS`, seeded-RNG tests | — (any time before P5) | Unit tests, no device needed |
| **P3 Scheduling service** | `nextOccurrence`, arm/cancel, `reconcile()`, dismissal rescheduling | P1 | Occurrence unit tests; armed ids match the database on device |
| **P4 Alarms UI** | List, empty state, next-alarm summary, create/edit sheet with the scrolling time wheels, toggle, swipe-delete with undo | P0, P1, P3 | Create an alarm, kill the app, reopen — it persists and stays armed |
| **P5 Wake screen** | Full-screen route, keypad, step dots, the §5 machine, session recording, dismissal | P2, P3 | Alarm fires locked → solve → silence → session row written |
| **P6 Permissions & Settings** | Onboarding gate, Settings health panel, `default_difficulty` | P0, P1 | Each permission toggled in system settings is reflected on return |
| **P7 Analytics** | Session list and the §10 aggregates | P1, P5 | Numbers hand-checked against the session rows |
| **P8 Hardening** | Doze, reboot, app-kill, OEM battery saver, several alarms, alarm during alarm, DST, process death mid-challenge | all | The device matrix, then daily real use |

P2 is on nobody's critical path and can absorb any waiting time. The MVP spine is
complete at the end of P5; P6–P8 make it trustworthy.

---

## 12. Explicitly NOT implemented in v1

**Product**
Snooze. Mood check-in and the morning-summary flow. Sleep tracking of every kind —
stages, architecture, duration, quality score, heart rate, audio sensing, cortisol
or brain-fog commentary. Any fabricated or estimated sleep metric. Accounts,
profiles, avatars, greetings by name, cloud sync, any backend. A notification
centre or bell. Multiple alarm sounds, a sound library, custom audio, gradual volume
ramp, per-alarm sound. A "Nightmare" difficulty tier. Adaptive difficulty. XP,
levels, badges, rewards, leaderboards, sharing. Ads or IAP. iOS.

**Technical**
NativeWind or any styling framework. `react-native-svg` and chart libraries —
progress uses step dots and bars built from plain views. `expo-blur` and
backdrop-filter glassmorphism. CSS-shadow neon glow reproduced literally. A
`question_attempts` table. Per-problem timing storage. Direct-boot ringing. A repeat
rule inside the Kotlin kernel. Light mode. Any change to `modules/alarm-core` unless
P8 uncovers a defect. The shipped long-press abort escape hatch — it stays behind
`__DEV__`. Fake device chrome: drawn status bars, "HUD ACTIVE" pills.
