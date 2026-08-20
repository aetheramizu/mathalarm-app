# MathAlarm — Product Requirements Document

**Status:** Draft v0.1
**Last updated:** 2026-08-20
**Owner:** (you)
**Platform:** Android (Kotlin + Jetpack Compose)

---

## 1. Overview

**One-liner:** An alarm clock that won't shut off until you solve math problems — forcing your brain awake so you actually get out of bed.

**The problem:** Heavy sleepers dismiss or snooze normal alarms half-asleep and fall back asleep. "Solve-a-problem-to-dismiss" alarms fix this, but the popular apps on the Play Store **paywall the math feature** — you have to pay to unlock the one thing that makes the app work.

**The solution:** A free, clean math alarm where the core wake-up mechanic is never behind a paywall. Built Android-first, for real personal use and as a portfolio piece.

**Why it matters (portfolio angle):** Demonstrates native Android skills (reliable background alarms, full-screen intents, audio, local persistence) plus product thinking — solving a real, personally-felt problem with a clear market gap.

---

## 2. Goals & Non-Goals

### Goals (v1)
- Fire a reliable alarm at a set time, even when the app is closed and the phone is locked.
- Require the user to solve math problem(s) to dismiss the alarm.
- Make the alarm hard to bypass without solving (can't just swipe it away).
- Play sound over silent/vibrate mode.
- Keep the core math mechanic 100% free.

### Non-Goals (explicitly out of scope for v1)
- iOS support.
- Accounts, cloud sync, or backend of any kind (fully local, offline app).
- Streaks, stats, adaptive difficulty, gamification.
- Multiple alarm sounds / music library / Spotify.
- Social features, sharing, leaderboards.
- Monetization (no ads, no IAP in v1).

---

## 3. Target User

- **Primary:** The builder (you) — an Android user and heavy sleeper who wants a free math alarm.
- **Secondary:** Heavy sleepers and students who want a wake-up that forces mental engagement, without paying for the core feature.

---

## 4. Core Features (v1)

| # | Feature | Description |
|---|---------|-------------|
| F1 | Create alarm | Pick a time; optionally a label and repeat days. |
| F2 | Alarm list | See all alarms; toggle each on/off; edit; delete. |
| F3 | Reliable firing | Alarm triggers at the set time even if app is killed / phone locked / dozing. |
| F4 | Full-screen wake screen | On fire, a full-screen UI takes over showing the math challenge. |
| F5 | Sound + vibration | Plays audibly over silent mode; vibrates. Stops only on success. |
| F6 | Math challenge | User must solve N problems to dismiss. Difficulty selectable. |
| F7 | Difficulty settings | Easy / Medium / Hard — controls problem type and number required. |
| F8 | Dismiss on success | Alarm stops only after the required problems are answered correctly. |

### Snooze — DECIDED: no snooze in v1
Snooze undermines the whole concept, so v1 ships without it. The only way to stop the alarm is to solve the math. (May revisit "solve-to-snooze" in v2.)

### Repeat alarms — DECIDED: day-of-week repeats supported in v1
An alarm can repeat on chosen weekdays (e.g. Mon–Fri). After firing, a repeat alarm reschedules itself for its next occurrence. Single-fire (one-time) alarms are also supported.

---

## 5. User Flows

### 5.1 Setting an alarm
1. Open app → see list of alarms (empty state on first launch).
2. Tap "+" → time picker → set time.
3. (Optional) label, repeat days, difficulty.
4. Save → alarm appears in list, toggled on.

### 5.2 Alarm fires
1. At set time, alarm triggers (works with app closed / phone locked).
2. Phone wakes → full-screen wake screen appears over lock screen.
3. Sound plays (over silent) + vibration.
4. Math challenge is shown.

### 5.3 Dismissing
1. User solves problem → if correct, advance; if wrong, new/retry problem.
2. After N correct answers, alarm sound stops and screen dismisses.
3. If a repeat alarm, it's rescheduled for the next occurrence.

---

## 6. Math Engine Spec

**Difficulty levels (initial proposal — tune later):**

| Level | Problem types | Number to solve |
|-------|---------------|-----------------|
| Easy | Single-digit +/− | 1 |
| Medium | Two-digit +/−/×, simple order | 3 |
| Hard | Multi-digit ×, mixed operations, maybe simple algebra (e.g. `3x + 4 = 19`) | 5 |

**Rules:**
- Problems generated randomly at fire time (not pre-stored).
- **Answers are integers only** in v1 (no decimals/fractions) to keep input simple. *(Decided.)*
- **Wrong answer → a brand-new problem** is generated, so users can't guess-spam a fixed one. *(Decided.)*
- Numeric keypad input on the wake screen (big, thumb-friendly).

---

## 7. Technical Requirements

- **Language:** Kotlin
- **UI:** Jetpack Compose
- **Min SDK:** TBD (target a reasonable modern floor, e.g. Android 8+/API 26 — confirm during setup)
- **Alarm scheduling:** `AlarmManager` with `setAlarmClock()` / exact alarms for reliability.
- **Wake screen:** Full-screen notification intent + Activity shown over lock screen (`setShowWhenLocked`, `setTurnScreenOn`).
- **Audio:** Alarm-stream playback that overrides silent/vibrate; vibration via Vibrator API.
- **Persistence:** Local only — Room database (or DataStore) for saved alarms. No network.
- **Background/reliability:** Handle reboot (reschedule alarms via `BOOT_COMPLETED`), Doze mode, and battery-optimization exemptions.
- **Permissions:** Exact alarm permission (Android 12+), notifications (Android 13+), full-screen intent, boot-completed.

### Key technical risks (build/prototype first)
1. **Reliable firing** when app is killed + phone locked + Doze mode.
2. **Full-screen wake screen** appearing over the lock screen.
3. **Sound over silent mode.**
> These three are the risky 20%. Prototype them before building polished UI.

---

## 8. UI / Design

> **PLACEHOLDER — pending references from the user.**
>
> Design will be driven by reference screenshots/apps the user provides, so the app looks intentional rather than templated.
>
> To fill in:
> - Overall mood (minimal / bold / playful; light / dark)
> - Color palette
> - Typography
> - Key screens: alarm list, create/edit alarm, **wake screen** (most important), settings
> - Reference images (drop into project folder)

---

## 9. Success Metrics ("done and working")

v1 is successful when:
- An alarm set for a future time **fires reliably** with the app closed and phone locked.
- The **full-screen wake screen** appears and plays sound over silent mode.
- The alarm **cannot be dismissed** without solving the required math.
- Alarms **persist** across app restarts and device reboots.
- The builder can **use it daily** as their real alarm.

---

## 10. Future Ideas (v2+)

- Streaks & wake-up history/stats.
- Adaptive difficulty (ramps based on solve speed).
- "Snooze tax" — each snooze makes the next problem harder.
- Escalating alarm (harder the longer you ignore it).
- Multiple sounds / custom audio.
- Themes / customization.
- Other dismiss mini-games (memory, typing, barcode scan).
- Wake-up quality score based on solve speed.

---

## 11. Decisions Log

- **Snooze:** ✅ No snooze in v1. Only solving the math stops the alarm.
- **Repeat alarms:** ✅ Day-of-week repeats supported in v1 (plus one-time alarms).
- **Wrong answer behavior:** ✅ Generate a brand-new problem (no guess-spam).
- **Answer types:** ✅ Integer-only in v1.

### Still open (resolve during technical setup)
- **Min SDK / target devices:** proposed floor Android 8 / API 26 — confirm when scaffolding.
