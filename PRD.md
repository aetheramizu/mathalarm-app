# MathAlarm — Product Requirements Document

**Status:** v1.0 — scope locked
**Last updated:** 2026-09-10
**Owner:** (you)
**Platform:** Android (Expo / React Native + TypeScript)

---

## 1. Overview

**One-liner:** An alarm clock that won't shut off until you solve math problems — forcing your brain awake so you actually get out of bed.

**The problem:** Heavy sleepers dismiss or snooze normal alarms half-asleep and fall back asleep. "Solve-a-problem-to-dismiss" alarms fix this, but the popular apps on the Play Store **paywall the math feature** — you have to pay to unlock the one thing that makes the app work.

**The solution:** A free, clean math alarm where the core wake-up mechanic is never behind a paywall. Built Android-first, for real personal use and as a portfolio piece.

**Why it matters (portfolio angle):** Demonstrates cross-platform app development plus the native Android integration the hard parts demand (reliable background alarms, full-screen intents, alarm-stream audio, local persistence), and product thinking — solving a real, personally-felt problem with a clear market gap.

---

## 2. Goals & Non-Goals

### The v1 spine

Everything in this document serves one chain. A feature that is not on it is not v1:

> Set alarm → alarm is persisted → alarm fires reliably → full-screen wake screen appears → user solves math → correct completion dismisses the alarm → the session is recorded → the user can see basic performance history in Analytics.

### Goals (v1)
- Fire a reliable alarm at a set time, even when the app is closed and the phone is locked.
- Require the user to solve math problem(s) to dismiss the alarm.
- Make the alarm hard to bypass without solving (can't just swipe it away).
- Play sound over silent/vibrate mode.
- Record every wake session and show honest history in Analytics.
- Keep the core math mechanic 100% free.

### Non-Goals (explicitly out of scope for v1)
- iOS support.
- Accounts, profiles, cloud sync, or a backend of any kind (fully local, offline app).
- **Sleep tracking of any kind** — sleep stages/architecture, REM/deep/light breakdown, sleep duration, sleep quality score, heart rate, audio sensing, cortisol or "brain fog" style commentary. MathAlarm has no sensors and no wearable integration, and **no sleep metric may be fabricated or estimated**.
- Mood check-in.
- Snooze.
- Multiple alarm sounds, a sound library, custom audio, or gradual volume ramp.
- Adaptive difficulty, gamification beyond a plain solved-day streak.
- Social features, sharing, leaderboards.
- Monetization (no ads, no IAP in v1).

---

## 3. Target User

- **Primary:** The builder (you) — an Android user and heavy sleeper who wants a free math alarm.
- **Secondary:** Heavy sleepers and students who want a wake-up that forces mental engagement, without paying for the core feature.

Device support is broad by requirement: the app must work across Android OEMs and skins, not only on the builder's own handset, which is a test device rather than the target.

---

## 4. Information Architecture

v1 has **three** top-level sections, in a bottom tab bar:

| Tab | Purpose |
|-----|---------|
| **Alarms** | The list of alarms, plus create/edit/delete. The home screen. |
| **Analytics** | Wake history and performance, built only from data the app itself collects. |
| **Settings** | Permissions health, default difficulty, and app info. |

**Challenge is not a tab.** It is the full-screen experience that takes over the device when an alarm fires, rendered on a route that lives *outside* the tab navigator, with the tab bar and any header hidden and system back disabled. A visible tab bar during a ringing alarm would be an escape hatch out of the challenge, which defeats the product.

**Check-in is not a tab.** Mood check-in is deferred to v1.1+.

---

## 5. Core Features (v1)

| # | Feature | Description |
|---|---------|-------------|
| F1 | Create alarm | Pick a time; optionally a label; optionally repeat days; pick difficulty. |
| F2 | Alarm list | See all alarms, sorted by next occurrence; toggle each on/off; edit; delete. |
| F3 | Reliable firing | Alarm triggers at the set time even if the app is killed, the phone is locked, or the device is dozing. |
| F4 | Full-screen wake screen | On fire, a full-screen UI takes over — over the lock screen — showing the math challenge. |
| F5 | Sound + vibration | Plays audibly over silent mode on the alarm stream; vibrates. Stops only on success. |
| F6 | Math challenge | User must solve N problems to dismiss. Difficulty selectable per alarm. |
| F7 | Difficulty settings | Easy / Medium / Hard — controls problem type and number required. |
| F8 | Dismiss on success | The alarm stops only after the required problems are answered correctly. |
| F9 | Reboot survival | Alarms are re-armed after reboot and after app update. |
| F10 | Permission onboarding | A guided first-run flow for exact alarms, notifications, full-screen intent, and battery-optimisation exemption, plus a permanent health panel in Settings. |
| F11 | Session recording | Every ring is recorded: when it fired, when it was dismissed, how it ended, how many answers were right and wrong, how long solving took. |
| F12 | Analytics | Wake history and performance derived only from F11 data. |

### 5.1 Decisions carried into v1

- **Snooze:** none. Solving the math is the only way to stop the alarm. This is the core concept, not a missing feature.
- **Repeat alarms:** day-of-week repeats are supported, alongside one-time alarms.
- **Wrong answer:** generates a brand-new problem, so a fixed question cannot be guess-spammed. It does not advance the step counter, and it is recorded as a wrong attempt.
- **Answers:** integers only. No decimals or fractions.
- **Sound:** the device's default alarm ringtone, looped, on the alarm stream. Not selectable in v1. The existing native implementation already does exactly this, so this costs nothing.

---

## 6. User Flows

### 6.1 First launch
1. App opens on Alarms with an empty state.
2. A permission gate explains, in plain language, why each Android permission is needed and offers a button per permission (exact alarms, notifications, full-screen intent, battery-optimisation exemption).
3. The user can proceed with permissions missing; the Alarms screen then shows a persistent warning banner, because an alarm with missing permissions may not ring.

### 6.2 Setting an alarm
1. From Alarms, tap the primary "New alarm" action.
2. A sheet opens: time entered on a large numeric keypad (HH:MM, no wheel or dial), label, repeat days, difficulty. Difficulty is pre-filled from `settings.default_difficulty`.
3. Save → the alarm appears in the list, enabled, and is armed with the native kernel.
4. The list shows the time until the next alarm fires.

### 6.3 Alarm fires
1. At the set time the native kernel fires, regardless of app state.
2. A foreground service starts alarm-stream audio and vibration.
3. A full-screen intent brings up the wake screen over the lock screen; the device screen turns on.
4. The wake screen shows the alarm label, elapsed ring time, progress through the required problems, the current problem, and a numeric keypad.

### 6.4 Dismissing
1. The user answers. Correct → advance one step. Wrong → a brand-new problem, wrong count incremented, no advance.
2. After N correct answers, the app tells the native kernel to dismiss; audio and vibration stop and the wake screen closes.
3. The session is written to the database.
4. If the alarm repeats, the next occurrence is computed and re-armed. If it was one-time, it is switched off.

### 6.5 Reviewing
1. Analytics shows recent sessions and simple aggregates over the last 7 and 30 days.
2. Every number shown traces back to a recorded session. Nothing is inferred about sleep.

---

## 7. Math Engine Spec

| Level | Problem types | Number to solve |
|-------|---------------|-----------------|
| **Easy** | Single-digit `+` / `−` | 1 |
| **Medium** | Two-digit `+` / `−`, single-digit × two-digit `×` | 3 |
| **Hard** | Multi-digit `×`, mixed operations with precedence, simple linear equations (e.g. `3x + 4 = 19`) | 5 |

**Rules:**
- Problems are generated at fire time, never pre-stored.
- Answers are integers only; subtraction never produces a negative answer.
- A wrong answer generates a brand-new problem.
- Input is an on-screen numeric keypad — large, thumb-friendly, no reliance on the system keyboard.
- The generator is a pure TypeScript module with no React or native dependencies, so it can be unit-tested and exercised without a device.
- "Nightmare" difficulty is not part of v1.

---

## 8. Data Model

Local SQLite (`expo-sqlite`). No network, no sync. Three tables plus a key–value store.

### `alarms`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID, also the id handed to the native kernel. |
| `hour` | INTEGER | 0–23. Stored as wall-clock, not an absolute timestamp. |
| `minute` | INTEGER | 0–59. |
| `label` | TEXT NULL | Shown on the wake screen and in the status-bar alarm affordance. |
| `repeat_days` | INTEGER | Bitmask, Mon=1 … Sun=64. `0` means one-time. |
| `difficulty` | TEXT | `easy` \| `medium` \| `hard`. |
| `enabled` | INTEGER | 0/1. |
| `next_trigger_at` | INTEGER NULL | Cached absolute ms, recomputed on every reconciliation. Derived, never authoritative. |
| `created_at` / `updated_at` | INTEGER | ms since epoch. |

Wall-clock time is stored rather than a timestamp so that a repeat alarm still means "06:30" after a timezone change or DST shift.

### `wake_sessions`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID. |
| `alarm_id` | TEXT | No foreign key: history outlives a deleted alarm. |
| `alarm_label` | TEXT NULL | Snapshot at fire time. |
| `difficulty` | TEXT | Snapshot at fire time. |
| `required_problems` | INTEGER | Snapshot — so history stays readable if the ladder changes. |
| `fired_at` | INTEGER | ms. |
| `first_answer_at` | INTEGER NULL | ms; how long it took to engage at all. |
| `dismissed_at` | INTEGER NULL | ms. |
| `outcome` | TEXT | `solved` \| `system_stopped` \| `cancelled` \| `abandoned`. |
| `correct_count` | INTEGER | |
| `wrong_count` | INTEGER | |
| `solve_ms` | INTEGER NULL | `dismissed_at − first_answer_at`. |

Per-problem timing detail is deliberately not stored in v1; the aggregate is enough for every metric in §9. The model is nevertheless shaped so a `question_attempts` table can be added later without redesigning `wake_sessions` — see `ARCHITECTURE.md` §3.

### `active_challenge`
A single-row table holding the in-flight challenge — session id, alarm id, current step, wrong count, and the current problem — written on every state change. If the OS kills the app mid-challenge while the alarm is still ringing, the relaunched wake screen resumes at the same step instead of restarting from problem one.

### `settings`
Key–value: `default_difficulty`, `onboarding_completed`, and similar. Not a place for alarm state.

`default_difficulty` is inherited **only when a new alarm is created**. Each alarm stores its own difficulty, and that stored value is what the alarm uses when it fires. Changing the global default never modifies an existing alarm.

### Ownership boundary
The SQLite database is the **single source of truth for alarm definitions**. The native kernel's own store is a projection of it, holding only what native needs to answer two questions without a JS context: what to re-arm after reboot, and what is ringing now. JS reconciles the two on every app launch and every foreground.

---

## 9. Analytics Scope

Analytics may show **only** values computed from `wake_sessions`:

- Recent sessions: date, alarm label, actual dismissal time, outcome.
- Time to dismiss: `dismissed_at − fired_at` — how long the alarm rang.
- Solve speed: `solve_ms`, and per-problem average.
- Accuracy: `correct_count / (correct_count + wrong_count)`.
- Streak: consecutive local calendar days with at least one `solved` session. This is derived history, not a gamification system — there is no XP, level, badge, reward, or leaderboard attached to it.
- Counts over the last 7 and 30 days: alarms fired, solved, stopped by the system.

Anything requiring a sensor, a wearable, or an inference about sleep is out. If a future version integrates Health Connect, sleep data enters through that door and is labelled as coming from the user's own device data — never synthesised.

---

## 10. Design Direction

The visual reference is the **Stitch "Cyber Chrono"** prototype in `D:\AppDev\stitch_mathalarm_mobile_prototype`. It is a *visual reference, not a specification*: its four-tab structure, sleep telemetry, snooze button, profile avatar, notification bell, sound library, and "Nightmare" difficulty are all outside the scope locked in this document.

**What is adopted:**
- Dark-only, OLED-friendly. Void black background (`#09090E`), card surface `#1A1A24`, elevated `#242432`.
- Accents: magenta `#FF2E93` primary, cyan `#00F0FF` secondary/positive, peach `#FFA07A` for gradient warmth.
- Typography: **Geist** for UI text, **JetBrains Mono** for times, equations, and numeric readouts — tabular figures stop the digits jittering as a timer ticks.
- 20px card radius, pill-shaped primary actions, monospace uppercase micro-labels with wide tracking.

**How it is adapted:**
- Styling is a **design-token module plus React Native `StyleSheet`**. No NativeWind; the Stitch markup is not ported one-to-one.
- Glassmorphism and backdrop blur are not reproduced on the wake screen, where instant, reliable rendering matters more than an effect. Elsewhere, translucent flat fills stand in for blur.
- Neon glow is approximated with layered translucent views and gradients rather than CSS shadow. If a glow costs frames, the glow loses.
- Magenta at 10–12px on void black does not clear a 4.5:1 contrast ratio; small labels use a lighter tint or the neutral `#A5A5B8`.
- Wake-screen touch targets are at least 64dp, above the 48dp Android minimum, because the user is half-asleep.
- No fake device chrome — no drawn status bar, no "HUD ACTIVE" pill, no avatar, no notification bell.

**Priority rule:** functionality over visual polish. Where a visual decision costs reliability, performance, or an extra dependency, the working behaviour wins.

---

## 11. Technical Requirements

- **Framework:** Expo (SDK 57) — React Native 0.86 + TypeScript. Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing code.
- **Routing:** Expo Router. A tab group for Alarms/Analytics/Settings, and the wake screen on a separate route outside it.
- **Builds:** EAS Build in the cloud. Keeps multi-gigabyte SDK and Gradle caches off a nearly full C: drive.
- **On-device target:** a development build produced with `expo-dev-client`. Expo Go cannot do exact alarms, full-screen intents, or alarm-stream audio, and is only useful for previewing pure-UI screens.
- **Min SDK:** 26 (Android 8), set through `expo-build-properties`.
- **Theme:** dark only. `userInterfaceStyle` is `dark`, not `automatic`.
- **Persistence:** `expo-sqlite`, local only.
- **New dependencies for v1:** `expo-sqlite`, `expo-font` (bundling Geist and JetBrains Mono — both OFL), `expo-linear-gradient`, `@expo/vector-icons`, `expo-haptics`. `react-native-svg` is **not** taken on in v1: step progress uses dots and bars built from plain views rather than an SVG ring.

### 11.1 Native alarm kernel — built and proven

The `modules/alarm-core` local Expo Module (Kotlin) is implemented and verified on a physical device: exact scheduling via `setAlarmClock`, a foreground ring service, alarm-stream audio that beats silent mode, vibration, a full-screen wake intent over the lock screen, device-protected storage, and re-arming on `BOOT_COMPLETED` / `MY_PACKAGE_REPLACED`. Its TypeScript surface is `scheduleAlarm`, `cancelAlarm`, `getScheduledAlarmIds`, `dismissAlarm`, `getActiveAlarm`, the four permission queries and their request calls, and the `onAlarmFired` / `onAlarmDismissed` events.

The boundary is deliberate: **native is told when to fire and which id; it never knows what a math problem is.** The math engine, difficulty, repeat-day expansion, persistence, and analytics all live in TypeScript.

### 11.2 Scheduling and reconciliation rules

- JS computes the next occurrence from `hour`, `minute`, and `repeat_days`, then arms exactly that one occurrence with the kernel. Native holds no repeat rule.
- The next occurrence of a repeating alarm is armed at **dismissal time**, when the app is guaranteed to be running.
- On every app launch and every foreground, JS reconciles: for each enabled alarm, if no matching id is scheduled or the trigger time has drifted, re-arm it; cancel any scheduled id with no enabled alarm behind it.
- After a reboot, native re-arms from its own store and drops occurrences whose time passed while the device was off — deliberately, since a 3am alarm firing at 9am is worse than not firing. **Known hole:** if the device is powered off across a repeating alarm's fire time, that alarm's next occurrence is not armed until the app is next opened. Accepted for v1 and documented in §13.
- Timezone and DST changes are handled by storing wall-clock time and recomputing on reconciliation.

### 11.3 Permissions

`SCHEDULE_EXACT_ALARM` / `USE_EXACT_ALARM` (API 31+), `POST_NOTIFICATIONS` (API 33+), `USE_FULL_SCREEN_INTENT` (API 34+), `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`, `VIBRATE`, `FOREGROUND_SERVICE`, and an optional battery-optimisation exemption which materially improves reliability on aggressive OEM skins. Each is queried and requested separately, because Android gates each behind a different API level and settings screen.

### 11.4 Wake-screen requirements

- Rendered outside the tab navigator; no header, no tab bar, no visible route back into the app.
- System back is disabled while the challenge is unsolved.
- Progress is persisted to `active_challenge` on every step, so process death does not reset the challenge.
- The developer escape hatch (long-press abort) exists only in development builds, never in a release build.
- The screen must render fast and without blur or heavy effects; it appears when the device has just woken.

---

## 12. Implementation Phases

Ordered by dependency. Each phase ends in something demonstrable on the phone.

| Phase | Content | Depends on |
|---|---|---|
| **P0 — Foundations** | Design tokens, fonts, dark-only config, new dependencies, app shell with the three tabs plus the wake route outside them. The spike rig is retired from the main route. | — |
| **P1 — Data layer** | SQLite schema and migrations, repositories for alarms/sessions/settings. Headless, unit-testable. | P0 |
| **P2 — Math engine** | Pure TypeScript generator for the three tiers, with tests. | — |
| **P3 — Scheduling service** | Next-occurrence computation from the repeat bitmask, the JS↔kernel sync layer, reconciliation on launch and foreground, reschedule on dismiss. | P1 |
| **P4 — Alarms UI** | List, empty state, next-alarm summary, create/edit sheet with a real time input, toggle, delete. | P0, P1, P3 |
| **P5 — Wake screen** | Full-screen challenge route, keypad, step progress, crash-resilient progress, session recording, dismissal into the kernel. | P2, P3 |
| **P6 — Permissions & Settings** | First-run permission gate, Settings screen with a live permission health panel, default difficulty. | P0, P1 |
| **P7 — Analytics** | Session list and the aggregates in §9. Real data only. | P1, P5 |
| **P8 — Hardening** | Doze, reboot, app-kill, OEM battery-saver, multiple alarms, DST, process death mid-challenge. Preview build, then daily real use. | all |

P2 has no dependencies and can be built at any point before P5.

---

## 13. Known Limitations (v1)

- **No direct-boot ringing.** If the device reboots and is never unlocked before an alarm's time, that alarm does not fire. Ringing pre-unlock would need a direct-boot-aware service *and* activity, and React Native cannot run in that state, so the wake screen could not appear and the alarm could not be dismissed. Alarms are re-armed at `BOOT_COMPLETED`, which arrives after first unlock.
- **Extended power-off gap.** A repeating alarm whose occurrence passed while the device was off is dropped at boot, and its next occurrence is only armed when the app is next opened.
- **OEM variance.** Aggressive battery management on some skins can still delay or kill a foreground service. The battery-optimisation exemption is the mitigation, and the permission panel surfaces its state.
- **No sleep data.** By design — see §2.

---

## 14. Decisions Log

- **Snooze:** ✅ None in v1. Solving the math is the only way to stop the alarm. *(2026-08-22, reaffirmed 2026-09-10)*
- **Repeat alarms:** ✅ Day-of-week repeats plus one-time alarms. *(2026-08-22)*
- **Wrong answer behaviour:** ✅ Generate a brand-new problem. *(2026-08-22)*
- **Answer types:** ✅ Integer-only. *(2026-08-22)*
- **Stack:** ✅ Expo (React Native + TypeScript + Expo Router) instead of Kotlin/Jetpack Compose. *(2026-08-22)*
- **Build pipeline:** ✅ EAS Build in the cloud, not local Android builds. *(2026-08-22)*
- **On-device runtime:** ✅ An `expo-dev-client` development build, not Expo Go. *(2026-08-22)*
- **Native alarm module:** ✅ A custom local Expo Module in Kotlin rather than a third-party notification library. `@notifee/react-native` was archived in April 2026; `expo-notifications` documents no full-screen intent support and respects silent mode; `react-native-notify-kit` targets RN 0.85.3 and leaves alarm-stream audio unsolved. Alarm-stream audio needs custom Kotlin regardless, so one self-owned module covering scheduling, wake screen, and audio removes a third party from the critical path. *(2026-08-22)*
- **Min SDK:** ✅ 26 (Android 8). *(2026-08-23)*
- **Navigation:** ✅ Three tabs — Alarms, Analytics, Settings. Challenge is a full-screen route outside the tabs, not a tab. *(2026-09-10)*
- **Sleep data:** ✅ Removed entirely from v1. No sleep stages, duration, quality, heart rate, or audio sensing, and no fabricated metrics. Analytics uses only data MathAlarm collects itself. *(2026-09-10)*
- **Mood check-in:** ✅ Not part of the v1 flow; reconsidered at v1.1+. *(2026-09-10)*
- **Difficulty ladder:** ✅ Easy 1 / Medium 3 / Hard 5. No "Nightmare" tier. *(2026-09-10)*
- **Sound:** ✅ Default alarm ringtone, looped, alarm stream. No sound library and no volume ramp in v1 — the existing native implementation already provides exactly this at no extra cost. *(2026-09-10)*
- **Styling:** ✅ Design tokens plus React Native `StyleSheet`. NativeWind rejected: adding a styling framework purely to reproduce the Stitch HTML is not worth the dependency. *(2026-09-10)*
- **Design status:** ✅ The Stitch "Cyber Chrono" prototype is a visual reference, not a product specification, and is adapted for native rather than ported. *(2026-09-10)*
- **Priority:** ✅ Functionality over visual polish, as a product and engineering constraint. *(2026-09-10)*
- **Charts:** ✅ No `react-native-svg` in v1; progress and simple bars are built from plain views. *(2026-09-10)*
- **Time input:** ✅ A touch-friendly numeric keypad for HH:MM. No wheel picker and no dial, and not a reproduction of the Stitch web control. *(2026-09-10)*
- **Difficulty inheritance:** ✅ Difficulty is stored per alarm and is what that alarm uses when it fires. `settings.default_difficulty` is inherited only at creation time and never rewrites existing alarms. *(2026-09-10)*
- **Streak:** ✅ Kept as a derived analytics metric computed from solved wake sessions. Historical data only — no XP, levels, badges, rewards, or leaderboards. *(2026-09-10)*
- **Per-question persistence:** ✅ Aggregate timing only in v1; the data layer is structured so a `question_attempts` table is a purely additive change. *(2026-09-10)*

---

## 15. Success Metrics ("done and working")

v1 is successful when:
- An alarm set for a future time **fires reliably** with the app closed and the phone locked.
- The **full-screen wake screen** appears over the lock screen and plays sound over silent mode.
- The alarm **cannot be dismissed** without solving the required math.
- Alarms **persist** across app restarts and device reboots.
- Every ring produces a **session record**, and Analytics reflects it accurately.
- The builder can **use it daily** as their real alarm.

---

## 16. Future Ideas (v1.1+)

- Mood check-in after a solved alarm, and the morning summary it feeds.
- Health Connect integration, so sleep data comes from the user's own wearable rather than being invented.
- Multiple alarm sounds, custom audio, gradual volume ramp.
- Adaptive difficulty that ramps with solve speed.
- Escalating alarm that hardens the longer it is ignored.
- Other dismiss mini-games: memory, typing, barcode scan.
- Richer analytics: per-problem timing, weekday patterns.
