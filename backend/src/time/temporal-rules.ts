import { ApiError } from '../http/api-error.ts';
import type { Clock } from './clock.ts';

export const BUSINESS_TIME_ZONE = 'America/Argentina/Buenos_Aires';
export const MIN_RENTAL_DURATION_MS = 60 * 60 * 1000;
export const MAX_RENTAL_DURATION_MS = 336 * MIN_RENTAL_DURATION_MS;
export const MAX_PICKUP_ADVANCE_MS = 90 * 24 * MIN_RENTAL_DURATION_MS;

export interface RentalInterval {
  startsAt: Date;
  endsAt: Date;
}

export interface ValidatedRentalInterval extends RentalInterval {
  durationMilliseconds: number;
}

export interface BusinessDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const instantPattern = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.(\d{1,3}))?(Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))$/i;

function isValidDate(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function clockMilliseconds(clock: Clock): number {
  const now = clock.now();
  if (!isValidDate(now)) throw new RangeError('Clock debe devolver un instante válido.');
  return now.getTime();
}

export function parseApiInstant(value: unknown): Date {
  if (typeof value !== 'string') {
    throw new ApiError(400, 'invalid_instant', 'La fecha debe ser ISO-8601 con zona horaria explícita.');
  }
  const match = instantPattern.exec(value);
  if (!match || match[8]?.toUpperCase() === '-00:00') {
    throw new ApiError(400, 'invalid_instant', 'La fecha debe ser ISO-8601 con zona horaria explícita.');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const millisecond = Number((match[7] ?? '').padEnd(3, '0'));
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  calendar.setUTCHours(hour, minute, second, millisecond);
  if (
    year === 0
    || calendar.getUTCFullYear() !== year
    || calendar.getUTCMonth() !== month - 1
    || calendar.getUTCDate() !== day
    || calendar.getUTCHours() !== hour
    || calendar.getUTCMinutes() !== minute
    || calendar.getUTCSeconds() !== second
    || calendar.getUTCMilliseconds() !== millisecond
  ) {
    throw new ApiError(400, 'invalid_instant', 'La fecha no representa un instante válido.');
  }

  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw new ApiError(400, 'invalid_instant', 'La fecha no representa un instante válido.');
  }
  return new Date(milliseconds);
}

export function validateRentalInterval(
  pickupInput: unknown,
  returnInput: unknown,
  clock: Clock,
): ValidatedRentalInterval {
  const startsAt = parseApiInstant(pickupInput);
  const endsAt = parseApiInstant(returnInput);
  const durationMilliseconds = endsAt.getTime() - startsAt.getTime();

  if (durationMilliseconds <= 0) {
    throw new ApiError(400, 'invalid_rental_period', 'La devolución debe ser posterior al retiro.');
  }
  if (durationMilliseconds < MIN_RENTAL_DURATION_MS) {
    throw new ApiError(400, 'rental_too_short', 'El alquiler debe durar al menos una hora.');
  }
  if (durationMilliseconds > MAX_RENTAL_DURATION_MS) {
    throw new ApiError(400, 'rental_too_long', 'El alquiler no puede superar 336 horas.');
  }

  const now = clockMilliseconds(clock);
  if (startsAt.getTime() <= now) {
    throw new ApiError(400, 'pickup_not_future', 'El retiro debe comenzar en el futuro.');
  }
  if (startsAt.getTime() > now + MAX_PICKUP_ADVANCE_MS) {
    throw new ApiError(400, 'pickup_too_far_ahead', 'El retiro no puede superar los 90 días de anticipación.');
  }

  return { startsAt, endsAt, durationMilliseconds };
}

export function intervalsOverlap(first: RentalInterval, second: RentalInterval): boolean {
  if (!isValidDate(first.startsAt) || !isValidDate(first.endsAt) || !isValidDate(second.startsAt) || !isValidDate(second.endsAt)) {
    throw new RangeError('Los intervalos deben contener instantes válidos.');
  }
  return first.startsAt.getTime() < second.endsAt.getTime()
    && second.startsAt.getTime() < first.endsAt.getTime();
}

export function formatBusinessDateTime(instant: Date): BusinessDateTime {
  if (!isValidDate(instant)) throw new RangeError('Se requiere un instante válido para formatear la fecha.');
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const values = new Map(parts.map(({ type, value }) => [type, value]));
  return {
    year: Number(values.get('year')),
    month: Number(values.get('month')),
    day: Number(values.get('day')),
    hour: Number(values.get('hour')),
    minute: Number(values.get('minute')),
    second: Number(values.get('second')),
  };
}

export function isReservationExpired(status: string, pickupAt: Date, clock: Clock): boolean {
  return status === 'confirmed' && isValidDate(pickupAt) && pickupAt.getTime() <= clockMilliseconds(clock);
}

export function canClientCancelReservation(status: string, pickupAt: Date, clock: Clock): boolean {
  return status === 'confirmed' && isValidDate(pickupAt) && pickupAt.getTime() > clockMilliseconds(clock);
}

export function isReservationOverdue(status: string, returnAt: Date, clock: Clock): boolean {
  return status === 'delivered' && isValidDate(returnAt) && returnAt.getTime() <= clockMilliseconds(clock);
}
