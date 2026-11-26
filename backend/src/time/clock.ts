export interface Clock {
  now(): Date;
}

const zonedIsoPattern = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.(\d{1,3}))?(Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))$/i;

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

function instantMilliseconds(value: Date | string): number {
  if (value instanceof Date) {
    const milliseconds = value.getTime();
    if (Number.isFinite(milliseconds)) return milliseconds;
    throw new RangeError('El reloj fijo requiere un instante válido.');
  }

  const match = zonedIsoPattern.exec(value);
  if (!match || match[8]?.toUpperCase() === '-00:00') {
    throw new RangeError('El reloj fijo requiere una zona horaria explícita.');
  }
  const localTime = new Date(0);
  localTime.setUTCFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  localTime.setUTCHours(
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
    Number((match[7] ?? '').padEnd(3, '0')),
  );
  if (
    Number(match[1]) === 0
    || localTime.getUTCFullYear() !== Number(match[1])
    || localTime.getUTCMonth() !== Number(match[2]) - 1
    || localTime.getUTCDate() !== Number(match[3])
  ) {
    throw new RangeError('El reloj fijo requiere un instante válido.');
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new RangeError('El reloj fijo requiere un instante válido.');
  return milliseconds;
}

export class FixedClock implements Clock {
  private currentMilliseconds: number;

  constructor(initialInstant: Date | string) {
    this.currentMilliseconds = instantMilliseconds(initialInstant);
  }

  now(): Date {
    return new Date(this.currentMilliseconds);
  }

  set(instant: Date | string): Date {
    this.currentMilliseconds = instantMilliseconds(instant);
    return this.now();
  }

  advance(milliseconds: number): Date {
    if (!Number.isSafeInteger(milliseconds)) {
      throw new RangeError('El avance del reloj debe ser un entero seguro de milisegundos.');
    }
    const next = this.currentMilliseconds + milliseconds;
    if (!Number.isSafeInteger(next) || !Number.isFinite(new Date(next).getTime())) {
      throw new RangeError('El avance excede el intervalo de fechas representable.');
    }
    this.currentMilliseconds = next;
    return this.now();
  }
}

export const systemClock: Clock = new SystemClock();
