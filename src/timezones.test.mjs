import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultTimezone, timezoneChoices, formatClock } from './timezones.ts';

test('Nairobi / Kampala is available as the East Africa UTC+3 choice', () => {
  assert.equal(defaultTimezone, 'Africa/Nairobi');
  assert.ok(timezoneChoices('Etc/UTC').some(zone => zone.value === defaultTimezone && zone.label === '(UTC+3) Nairobi / Kampala'));
});
test('East Africa clock advances UTC by three hours, including date rollover', () => {
  assert.equal(formatClock(new Date('2026-11-01T10:00:00Z'), defaultTimezone), '13:00:00');
  assert.equal(formatClock(new Date('2026-11-01T22:30:00Z'), defaultTimezone), '01:30:00');
  assert.equal(formatClock(new Date('2026-11-01T22:30:00Z'), 'Africa/Kampala'), '01:30:00');
  assert.equal(formatClock(new Date('2026-11-01T10:00:00Z'), 'Etc/UTC'), '10:00:00');
});
test('an existing saved time zone remains selectable without duplicated options', () => {
  assert.equal(timezoneChoices('Africa/Nairobi').filter(zone => zone.value === 'Africa/Nairobi').length, 1);
  assert.ok(timezoneChoices('Australia/Sydney').some(zone => zone.value === 'Australia/Sydney'));
});
