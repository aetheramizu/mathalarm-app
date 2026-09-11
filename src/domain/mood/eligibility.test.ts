import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isMorningAlarm } from './eligibility';
import { MOODS, moodMeta, type Mood } from './types';

describe('mood constants', () => {
  it('contains exactly the 4 approved moods', () => {
    const keys = MOODS.map((m) => m.key);
    assert.deepEqual(keys, ['happy', 'sad', 'angry', 'excited']);
  });

  it('provides meta for each mood with emoji, label, and color', () => {
    for (const mood of ['happy', 'sad', 'angry', 'excited'] as Mood[]) {
      const meta = moodMeta(mood);
      assert.ok(meta);
      assert.equal(meta.key, mood);
      assert.ok(meta.emoji.length > 0);
      assert.ok(meta.label.length > 0);
      assert.ok(meta.color.length > 0);
    }
  });
});

describe('morning alarm eligibility window [04:00, 14:00)', () => {
  it('rejects hours before 04:00', () => {
    assert.equal(isMorningAlarm(-1), false);
    assert.equal(isMorningAlarm(0), false);
    assert.equal(isMorningAlarm(2), false);
    assert.equal(isMorningAlarm(3), false);
  });

  it('accepts hours from 04:00 inclusive to 14:00 exclusive', () => {
    assert.equal(isMorningAlarm(4), true);
    assert.equal(isMorningAlarm(5), true);
    assert.equal(isMorningAlarm(7), true);
    assert.equal(isMorningAlarm(12), true);
    assert.equal(isMorningAlarm(13), true);
  });

  it('rejects hours at or after 14:00', () => {
    assert.equal(isMorningAlarm(14), false);
    assert.equal(isMorningAlarm(15), false);
    assert.equal(isMorningAlarm(20), false);
    assert.equal(isMorningAlarm(23), false);
  });
});
