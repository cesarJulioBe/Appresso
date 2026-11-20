const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const SlidingWindow = require('../../../../src/domain/fraud/SlidingWindow');

describe('Domain - Fraud: SlidingWindow', () => {
  const windowSeconds = 3;

  it('counts rapid transactions within the time window for the same user', () => {
    const window = new SlidingWindow();
    assert.equal(window.addTransaction('b@b.com', new Date('2026-09-23T10:00:01Z'), windowSeconds), 1);
    assert.equal(window.addTransaction('b@b.com', new Date('2026-09-23T10:00:02Z'), windowSeconds), 2);
    assert.equal(window.addTransaction('b@b.com', new Date('2026-09-23T10:00:03Z'), windowSeconds), 3);
  });

  it('evicts transactions outside the sliding window', () => {
    const window = new SlidingWindow();
    assert.equal(window.addTransaction('c@c.com', new Date('2026-09-23T10:00:01Z'), windowSeconds), 1);
    assert.equal(window.addTransaction('c@c.com', new Date('2026-09-23T10:00:10Z'), windowSeconds), 1);
    assert.equal(window.addTransaction('c@c.com', new Date('2026-09-23T10:01:20Z'), windowSeconds), 1);
  });

  it('isolates sliding windows per user email', () => {
    const window = new SlidingWindow();
    assert.equal(window.addTransaction('u1@test.com', new Date('2026-09-23T10:00:01Z'), windowSeconds), 1);
    assert.equal(window.addTransaction('u2@test.com', new Date('2026-09-23T10:00:02Z'), windowSeconds), 1);
    assert.equal(window.addTransaction('u3@test.com', new Date('2026-09-23T10:00:03Z'), windowSeconds), 1);
  });
});
