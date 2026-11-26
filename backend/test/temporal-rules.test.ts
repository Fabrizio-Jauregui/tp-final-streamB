import { describe, expect, it } from 'vitest';
import { FixedClock, SystemClock } from '../src/time/clock.ts';
import {
  BUSINESS_TIME_ZONE,
  canClientCancelReservation,
  formatBusinessDateTime,
  intervalsOverlap,
  isReservationExpired,
  isReservationOverdue,
  parseApiInstant,
  validateRentalInterval,
} from '../src/time/temporal-rules.ts';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function expectApiError(action: () => unknown, code: string): void {
  try {
    action();
  } catch (error) {
    expect(error).toMatchObject({ code, status: 400 });
    return;
  }
  throw new Error(`Se esperaba el error ${code}.`);
}

describe('injectable clocks', () => {
  it('returns defensive date copies and can set or advance the fixed instant', () => {
    const clock = new FixedClock('2026-01-01T00:00:00.000Z');
    const exposed = clock.now();
    exposed.setUTCFullYear(2000);
    expect(clock.now().toISOString()).toBe('2026-01-01T00:00:00.000Z');

    expect(clock.advance(1500).toISOString()).toBe('2026-01-01T00:00:01.500Z');
    expect(clock.set('2026-02-01T03:00:00-03:00').toISOString()).toBe('2026-02-01T06:00:00.000Z');
  });

  it('rejects invalid fixed instants and advances', () => {
    expect(() => new FixedClock('invalid')).toThrow(RangeError);
    expect(() => new FixedClock('2026-02-29T00:00:00Z')).toThrow(RangeError);
    const clock = new FixedClock('2026-01-01T00:00:00Z');
    expect(() => clock.set(new Date(Number.NaN))).toThrow(RangeError);
    expect(() => clock.advance(Number.NaN)).toThrow(RangeError);
  });

  it('provides the current instant through the production clock', () => {
    const instant = new SystemClock().now();
    expect(instant).toBeInstanceOf(Date);
    expect(Number.isFinite(instant.getTime())).toBe(true);
  });
});

describe('API instants and rental interval rules', () => {
  const clock = new FixedClock('2026-01-01T00:00:00.000Z');

  it('parses UTC and explicit offsets to the same instant', () => {
    expect(parseApiInstant('2026-01-01T03:00:00-03:00').toISOString())
      .toBe(parseApiInstant('2026-01-01T06:00:00Z').toISOString());
  });

  it.each([
    '2026-01-01T06:00:00',
    '2026-02-29T06:00:00Z',
    '2026-01-01T06:00:00+14:01',
    'not-a-date',
  ])('rejects an invalid or zone-free API instant: %s', (value) => {
    expectApiError(() => parseApiInstant(value), 'invalid_instant');
  });

  it('accepts exactly the minimum and maximum rental durations', () => {
    const start = clock.now().getTime() + 1;
    expect(validateRentalInterval(
      new Date(start).toISOString(),
      new Date(start + HOUR_MS).toISOString(),
      clock,
    ).durationMilliseconds).toBe(HOUR_MS);

    expect(validateRentalInterval(
      new Date(start).toISOString(),
      new Date(start + 336 * HOUR_MS).toISOString(),
      clock,
    ).durationMilliseconds).toBe(336 * HOUR_MS);
  });

  it('rejects past or present pickup, reversed ranges, and durations outside 1–336 hours', () => {
    const now = clock.now().getTime();
    expectApiError(() => validateRentalInterval(
      new Date(now).toISOString(), new Date(now + HOUR_MS).toISOString(), clock,
    ), 'pickup_not_future');
    expectApiError(() => validateRentalInterval(
      new Date(now - 1).toISOString(), new Date(now + HOUR_MS).toISOString(), clock,
    ), 'pickup_not_future');
    expectApiError(() => validateRentalInterval(
      new Date(now + 1).toISOString(), new Date(now + 1).toISOString(), clock,
    ), 'invalid_rental_period');
    expectApiError(() => validateRentalInterval(
      new Date(now + 2 * HOUR_MS).toISOString(), new Date(now + HOUR_MS).toISOString(), clock,
    ), 'invalid_rental_period');
    expectApiError(() => validateRentalInterval(
      new Date(now + 1).toISOString(), new Date(now + HOUR_MS).toISOString(), clock,
    ), 'rental_too_short');
    expectApiError(() => validateRentalInterval(
      new Date(now + 1).toISOString(), new Date(now + 1 + 336 * HOUR_MS + 1).toISOString(), clock,
    ), 'rental_too_long');
  });

  it('accepts pickup exactly 90 days ahead and rejects anything later', () => {
    const maximumPickup = clock.now().getTime() + 90 * DAY_MS;
    expect(() => validateRentalInterval(
      new Date(maximumPickup).toISOString(),
      new Date(maximumPickup + HOUR_MS).toISOString(),
      clock,
    )).not.toThrow();
    expectApiError(() => validateRentalInterval(
      new Date(maximumPickup + 1).toISOString(),
      new Date(maximumPickup + 1 + HOUR_MS).toISOString(),
      clock,
    ), 'pickup_too_far_ahead');
  });

  it('treats adjacent intervals as non-overlapping and a one-millisecond overlap as conflicting', () => {
    const first = {
      startsAt: new Date('2026-01-02T10:00:00Z'),
      endsAt: new Date('2026-01-02T11:00:00Z'),
    };
    const adjacent = {
      startsAt: new Date('2026-01-02T11:00:00Z'),
      endsAt: new Date('2026-01-02T12:00:00Z'),
    };
    const overlapping = {
      startsAt: new Date('2026-01-02T10:59:59.999Z'),
      endsAt: new Date('2026-01-02T12:00:00Z'),
    };
    expect(intervalsOverlap(first, adjacent)).toBe(false);
    expect(intervalsOverlap(first, overlapping)).toBe(true);
  });
});

describe('Buenos Aires time and lifecycle boundaries', () => {
  it('formats UTC instants using the business IANA timezone across the date boundary', () => {
    expect(BUSINESS_TIME_ZONE).toBe('America/Argentina/Buenos_Aires');
    expect(formatBusinessDateTime(new Date('2026-01-01T02:59:00Z')))
      .toEqual({ year: 2025, month: 12, day: 31, hour: 23, minute: 59, second: 0 });
    expect(formatBusinessDateTime(new Date('2026-01-01T03:00:00Z')))
      .toEqual({ year: 2026, month: 1, day: 1, hour: 0, minute: 0, second: 0 });
  });

  it('expires uncollected reservations and prevents client cancellation at the pickup instant', () => {
    const pickup = new Date('2026-01-01T01:00:00Z');
    const clock = new FixedClock('2026-01-01T00:59:59.999Z');
    expect(isReservationExpired('confirmed', pickup, clock)).toBe(false);
    expect(canClientCancelReservation('confirmed', pickup, clock)).toBe(true);

    clock.advance(1);
    expect(isReservationExpired('confirmed', pickup, clock)).toBe(true);
    expect(canClientCancelReservation('confirmed', pickup, clock)).toBe(false);
    clock.advance(1);
    expect(isReservationExpired('confirmed', pickup, clock)).toBe(true);
  });

  it('marks a delivered reservation overdue only after its return instant', () => {
    const returnTime = new Date('2026-01-01T01:00:00Z');
    const clock = new FixedClock(returnTime);
    expect(isReservationOverdue('delivered', returnTime, clock)).toBe(true);
    clock.advance(1);
    expect(isReservationOverdue('delivered', returnTime, clock)).toBe(true);
    expect(isReservationOverdue('confirmed', returnTime, clock)).toBe(false);
  });
});
