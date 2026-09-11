# MathAlarm — v1 hardening matrix

**Companion to:** `PRD.md` §12 (P8) and `ARCHITECTURE.md` §8–§9
**Last updated:** 2026-09-11

Everything in `domain/` and the wake-screen reducer is covered by host tests —
`npm test`, no device needed. What follows is what those tests *cannot* reach:
Android's own behaviour around a sleeping, locked, battery-managed phone. It has
to be run on hardware, on a development build, and it is the last gate before
daily use.

## Before starting

```bash
npm test                  # 117 host tests: math engine, occurrence, relative, metrics, wake reducer
npx tsc --noEmit          # type check
npx expo export --platform android   # proves the whole module graph bundles
```

Then install a development build on the test phone (`eas build --profile
development --platform android`) and grant all four permissions from the
first-run gate. Note the OEM and Android version in the results — behaviour
below the app is the thing being tested, and it varies by skin.

## The matrix

Each row is pass/fail on a real device. "Session row" means: open Analytics and
confirm the wake-up is listed with the outcome named.

| # | Scenario | Steps | Expected |
|---|---|---|---|
| 1 | Basic ring, app open | Alarm 2 minutes out, stay in the app | Wake screen takes over at the minute; sound on the alarm stream; solving stops it; session row `Solved` |
| 2 | Ring with the app killed | Set an alarm, swipe the app out of recents, lock the phone | Alarm still fires; wake screen appears over the lock screen; screen turns on |
| 3 | Ring over silent mode | Put the phone on silent, then repeat #2 | Audible on the alarm stream |
| 4 | Doze | Set an alarm 30+ minutes out, leave the phone still and unplugged | Fires at the minute, not late |
| 5 | Reboot | Set an alarm, reboot, unlock, do not open the app | Alarm fires at its time |
| 6 | Reboot with a missed occurrence | Set a repeating alarm, power off across its time, power on | The missed occurrence is dropped, not fired late; opening the app arms the next one (`ARCHITECTURE.md` §9, known gap) |
| 7 | App update | Reinstall the development build over itself | Alarms survive; Alarms tab shows them armed, no "Not scheduled" chips |
| 8 | Process death mid-challenge | While solving, force-stop the app from Android settings | Relaunching lands back on the wake screen, at the same step, with **the same equation** — never a fresh one |
| 9 | Wrong answers | Answer wrong three times | A brand-new problem each time; step counter does not advance; session row shows the wrong count |
| 10 | Multiple alarms | Two alarms, five minutes apart | Both fire and are solvable in turn; two session rows |
| 11 | Alarm during alarm | Two alarms one minute apart; leave the first unsolved | The screen moves to the second alarm; the first is recorded `Stopped by system` |
| 12 | Repeat re-arming | Weekday alarm; solve it | Alarms tab immediately shows the next weekday occurrence with a live countdown |
| 13 | One-time alarm | Solve a non-repeating alarm | It switches itself off and stays in the list, off |
| 14 | Never answered | Let an alarm ring itself out without touching it | Session row `Never answered`, not silently missing |
| 15 | Back button | Press back, and swipe back, during a challenge | Nothing happens; the challenge stays up |
| 16 | Permission revoked | Turn off "Alarms & reminders" in Android settings, return to the app | Alarms tab shows the red banner; affected alarms show "Not scheduled"; Settings names the missing permission |
| 17 | Permission restored | Grant it again and return | Banner clears; alarms re-arm on their own, no manual re-save |
| 18 | Battery saver | Enable the OEM's aggressive battery mode, then repeat #2 | Alarm still fires; if not, the battery-optimisation exemption is the mitigation to check |
| 19 | Timezone change | Change the device timezone, reopen the app | A 06:30 alarm is still 06:30 local, not shifted |
| 20 | DST | Set the device date to a spring-forward day with a daily alarm | Fires at the same wall-clock time; a 02:30 alarm rolls to 03:30 rather than being skipped |
| 21 | Analytics accuracy | After several sessions, hand-check the numbers | Counts, accuracy and streak match the rows in Recent wake-ups; nothing shows `0%` where there is no data |
| 22 | Empty states | Fresh install | Alarms and Analytics both show their empty state, not a dashboard of zeros |
| 23 | Gesture navigation | Set the phone to gesture navigation; visit all three tabs and scroll each to the bottom | Tab labels sit clear of the gesture pill; the last row of every list is fully readable above the tab bar; the strip behind the pill is the same void as the bar, with no lighter band |
| 24 | Three-button navigation | Switch the phone to three-button navigation and repeat #23 | The tab bar sits directly above the button row, not underneath it; no scrim or grey band between them; buttons are light on the void |
| 25 | Immersive challenge | Let an alarm fire on both navigation modes | Status bar and navigation bar are gone for the whole challenge; the equation and keypad clear the camera cutout; a swipe from an edge may reveal the bars transiently, and back still does nothing; solving restores both bars for the rest of the app |
| 26 | Time wheels | Open an existing alarm, fling all three wheels, edit a second alarm | Every wheel actually turns under a thumb; each opens already centred on the alarm's own time, never scrolling up to it; flings snap cleanly to a row; the centred values are the ones saved; ticks are felt but not machine-gunned |
| 26a | Meridiem follows the hour | Step the hour wheel 11 → 12, then 12 → 11; then fling from 3 straight to 12 | The step across 11/12 flips AM/PM in both directions and the meridiem wheel visibly scrolls itself; the fling that never passed 11 leaves it alone |
| 26b | One clock everywhere | Save an evening alarm | The list card, the next-alarm summary and the wheels all read the same 12-hour time; nothing anywhere shows the 24-hour form |
| 26c | Endless wheels | Fling the hour wheel past 12 and the minute wheel past 59, repeatedly and in both directions | Both wrap straight round to 1 and 00 and keep going; no end stop is ever reached, and no visible jump or stutter when the strip recentres itself |
| 26d | Wheel always lands in the band | Drag a wheel a little way and let go *slowly*, with no flick, several times on each wheel | It snaps into the band in the same moment the finger lifts — no pause, no drift, never parked half in and half out. Repeat with hard flings and with a tap on a neighbour; same result every time. No vibration at any point while scrolling |
| 26d | Tap a neighbour | Tap the row directly above and below the selected value on each wheel, then tap a row two out | The neighbour scrolls to the centre and becomes the value; the row two out does nothing and the wheel still drags normally over it |
| 26e | Next-alarm card | Tap the next-alarm card on the Alarms tab | It opens that alarm in the editor, the same as tapping its row in the list; the countdown below the clock is the largest number on the card and updates each minute |
| 27 | Wake feedback | Answer one problem right, then one wrong | Right: a success buzz, a filled segment, the next equation fades in from below; wrong: an error buzz, the answer field flashes red and shakes once, and the line beneath says a new problem is up. Neither outcome is identifiable by colour alone |
| 28 | Reduced motion | Turn on Android's "Remove animations", then fire an alarm | The ringing dot, the equation swap, the shake and the caret blink all stop; every one of them lands on its finished state, nothing is invisible or stuck mid-transition, and the challenge is still fully solvable |

## What a failure means

- **Rows 1–8, 12–15** are the product. A failure here blocks v1.
- **Rows 9–11, 16–28** (including the 26x set) are correctness around it. A failure is a bug to fix
  before daily use, not necessarily before the next build.
- **Row 18** is the one where the honest answer may be "this OEM is hostile".
  `PRD.md` §13 accepts that; the battery-optimisation exemption is the mitigation
  and Settings surfaces its state.

Only row 6's second half is a known, accepted gap. Everything else failing is a
defect.

## After the matrix

The last step of P8 is not a checklist: it is using MathAlarm as the real alarm,
every morning, for a week.
