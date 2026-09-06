import { describe, expect, it } from 'vitest';
import {
  CRON_PRESETS,
  CronParseError,
  describeCron,
  fieldBreakdown,
  nextExecutions,
  parseCron,
} from './cron';

const FIXED_NOW = new Date(2024, 0, 1, 0, 0, 0, 0); // Mon Jan 1 2024, 00:00:00 local time

describe('parseCron — field parsing', () => {
  it('parses "*" as every value', () => {
    const parsed = parseCron('* * * * *');
    expect(parsed.minute).toHaveLength(60);
    expect(parsed.hour).toHaveLength(24);
  });

  it('parses a single numeric value', () => {
    expect(parseCron('30 9 * * *').minute).toEqual([30]);
    expect(parseCron('30 9 * * *').hour).toEqual([9]);
  });

  it('parses a range', () => {
    expect(parseCron('0 9-17 * * *').hour).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
  });

  it('parses a list', () => {
    expect(parseCron('0,30 * * * *').minute).toEqual([0, 30]);
  });

  it('parses a step', () => {
    expect(parseCron('*/15 * * * *').minute).toEqual([0, 15, 30, 45]);
  });

  it('parses a stepped range', () => {
    expect(parseCron('0 8-18/2 * * *').hour).toEqual([8, 10, 12, 14, 16, 18]);
  });

  it('parses a combination of list and range', () => {
    expect(parseCron('0 0,12 1,15 * *').hour).toEqual([0, 12]);
    expect(parseCron('0 0,12 1,15 * *').dayOfMonth).toEqual([1, 15]);
  });

  it('parses month names case-insensitively', () => {
    expect(parseCron('0 0 1 JAN,jul *').month).toEqual([1, 7]);
  });

  it('parses day-of-week names and ranges', () => {
    expect(parseCron('0 9 * * MON-FRI').dayOfWeek).toEqual([1, 2, 3, 4, 5]);
  });

  it('normalizes day-of-week 7 to 0 (both mean Sunday)', () => {
    expect(parseCron('0 0 * * 7').dayOfWeek).toEqual([0]);
    expect(parseCron('0 0 * * 0,7').dayOfWeek).toEqual([0]);
  });

  it('parses the 6-field form with a leading seconds field', () => {
    const parsed = parseCron('30 0 9 * * *');
    expect(parsed.hasSeconds).toBe(true);
    expect(parsed.seconds).toEqual([30]);
    expect(parsed.minute).toEqual([0]);
    expect(parsed.hour).toEqual([9]);
  });

  it('defaults seconds to [0] for the 5-field form', () => {
    expect(parseCron('* * * * *').seconds).toEqual([0]);
  });
});

describe('parseCron — validation', () => {
  it('rejects an expression with the wrong number of fields', () => {
    expect(() => parseCron('* * * *')).toThrow(CronParseError);
    expect(() => parseCron('* * * * * * *')).toThrow(CronParseError);
  });

  it('rejects an out-of-range value', () => {
    expect(() => parseCron('0 25 * * *')).toThrow(CronParseError);
    expect(() => parseCron('60 * * * *')).toThrow(CronParseError);
    expect(() => parseCron('0 0 32 * *')).toThrow(CronParseError);
    expect(() => parseCron('0 0 1 13 *')).toThrow(CronParseError);
  });

  it('rejects a non-numeric, non-name value', () => {
    expect(() => parseCron('a * * * *')).toThrow(CronParseError);
  });

  it('rejects an invalid range (start after end)', () => {
    expect(() => parseCron('0 17-9 * * *')).toThrow(CronParseError);
  });

  it('rejects an invalid or zero step', () => {
    expect(() => parseCron('*/0 * * * *')).toThrow(CronParseError);
  });
});

describe('nextExecutions — common schedules', () => {
  it('every minute', () => {
    const runs = nextExecutions('* * * * *', 3, FIXED_NOW);
    expect(runs).toHaveLength(3);
    expect(runs.map((d) => d.getTime() - FIXED_NOW.getTime())).toEqual([60_000, 120_000, 180_000]);
  });

  it('hourly', () => {
    const runs = nextExecutions('0 * * * *', 2, FIXED_NOW);
    expect(runs[0]!.getHours()).toBe(1);
    expect(runs[0]!.getMinutes()).toBe(0);
    expect(runs[1]!.getHours()).toBe(2);
  });

  it('daily at a fixed time', () => {
    const runs = nextExecutions('0 9 * * *', 2, FIXED_NOW);
    expect(runs[0]!.getDate()).toBe(1);
    expect(runs[0]!.getHours()).toBe(9);
    expect(runs[1]!.getDate()).toBe(2);
  });

  it('weekdays only', () => {
    // Jan 1 2024 is a Monday; asking from Friday should skip the weekend.
    const friday = new Date(2024, 0, 5, 10, 0, 0);
    const runs = nextExecutions('0 9 * * 1-5', 2, friday);
    expect(runs[0]!.getDay()).toBe(1); // next Monday
    expect(runs[0]!.getDate()).toBe(8);
  });

  it('weekly on Sunday', () => {
    const runs = nextExecutions('0 0 * * 0', 1, FIXED_NOW);
    expect(runs[0]!.getDay()).toBe(0);
  });

  it('monthly on the 1st', () => {
    const runs = nextExecutions('0 0 1 * *', 2, FIXED_NOW);
    expect(runs[0]!.getDate()).toBe(1);
    expect(runs[0]!.getMonth()).toBe(1); // February — next month after Jan 1 00:00
    expect(runs[1]!.getMonth()).toBe(2);
  });

  it('produces results in strictly increasing order', () => {
    const runs = nextExecutions('*/7 * * * *', 5, FIXED_NOW);
    for (let i = 1; i < runs.length; i += 1) {
      expect(runs[i]!.getTime()).toBeGreaterThan(runs[i - 1]!.getTime());
    }
  });
});

describe('nextExecutions — 6-field (seconds) form', () => {
  it('respects an explicit seconds field', () => {
    const runs = nextExecutions('30 0 * * * *', 2, FIXED_NOW);
    expect(runs[0]!.getSeconds()).toBe(30);
    expect(runs[0]!.getMinutes()).toBe(0);
  });
});

describe('nextExecutions — day-of-month vs day-of-week semantics', () => {
  it('is OR when both fields are restricted: matches day 1 OR every Monday', () => {
    // 1st of every month, or any Monday.
    const runs = nextExecutions('0 0 1 * 1', 5, FIXED_NOW);
    for (const run of runs) {
      expect(run.getDate() === 1 || run.getDay() === 1).toBe(true);
    }
  });

  it('is governed by day-of-month alone when day-of-week is "*"', () => {
    const runs = nextExecutions('0 0 15 * *', 2, FIXED_NOW);
    expect(runs.every((r) => r.getDate() === 15)).toBe(true);
  });

  it('is governed by day-of-week alone when day-of-month is "*"', () => {
    const runs = nextExecutions('0 0 * * 1', 3, FIXED_NOW);
    expect(runs.every((r) => r.getDay() === 1)).toBe(true);
  });
});

describe('nextExecutions — calendar edge cases', () => {
  it('handles a leap-day expression correctly, skipping non-leap years entirely', () => {
    // Feb 29 only exists in leap years — 2024 is one, so it is found; the next
    // occurrence (2028) falls just outside the 4-year search horizon from
    // Jan 1 2024, so asking for 2 results correctly yields only 1.
    const runs = nextExecutions('0 0 29 2 *', 2, FIXED_NOW);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.getFullYear()).toBe(2024);
    expect(runs[0]!.getMonth()).toBe(1);
    expect(runs[0]!.getDate()).toBe(29);
  });

  it('finds the 2028 leap day when the horizon is anchored closer to it', () => {
    const runs = nextExecutions('0 0 29 2 *', 1, new Date(2025, 0, 1));
    expect(runs).toHaveLength(1);
    expect(runs[0]!.getFullYear()).toBe(2028);
  });

  it('crosses a month boundary correctly', () => {
    const lateInMonth = new Date(2024, 0, 31, 23, 0, 0);
    const runs = nextExecutions('0 0 * * *', 1, lateInMonth);
    expect(runs[0]!.getMonth()).toBe(1);
    expect(runs[0]!.getDate()).toBe(1);
  });

  it('crosses a year boundary correctly', () => {
    const endOfYear = new Date(2024, 11, 31, 23, 59, 30);
    const runs = nextExecutions('0 0 1 1 *', 1, endOfYear);
    expect(runs[0]!.getFullYear()).toBe(2025);
    expect(runs[0]!.getMonth()).toBe(0);
    expect(runs[0]!.getDate()).toBe(1);
  });

  it('terminates within a reasonable number of results for an impossible schedule (Feb 30)', () => {
    const runs = nextExecutions('0 0 30 2 *', 10, FIXED_NOW);
    expect(runs).toEqual([]);
  });

  it('terminates for a schedule matching nothing across the whole 4-year horizon', () => {
    // Day 31 in a month that never has one combined with a fixed weekday restriction is still
    // theoretically reachable via OR semantics unless day-of-week is also "*" — use AND-only
    // day-of-month with an impossible day to force zero matches deterministically.
    const start = performance.now();
    const runs = nextExecutions('0 0 31 4 *', 5, FIXED_NOW); // April never has a 31st
    const elapsedMs = performance.now() - start;
    expect(runs).toEqual([]);
    expect(elapsedMs).toBeLessThan(2000);
  });
});

describe('describeCron', () => {
  it('describes a simple expression in plain English', () => {
    expect(describeCron('*/5 * * * *')).toMatch(/every 5 minutes/i);
  });

  it('throws CronParseError for invalid syntax', () => {
    expect(() => describeCron('not a cron')).toThrow(CronParseError);
  });

  it('throws CronParseError for too few fields', () => {
    expect(() => describeCron('* * *')).toThrow(CronParseError);
  });

  it('does not leak a redundant "Error:" prefix from cronstrue', () => {
    // cronstrue's own toString() catches its internal parse error and
    // re-throws it as `"" + error`, which runs the Error through
    // Error.prototype.toString and bakes a literal "Error: " prefix into the
    // resulting string. That prefix must be stripped so cron's messages read
    // like every other tool's inline errors.
    let caught: unknown;
    try {
      describeCron('99 99 99 99 99');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CronParseError);
    const message = (caught as CronParseError).message;
    expect(message).toBe('minutes part must be >= 0 and <= 59');
    expect(message).not.toMatch(/^Error:/);
  });
});

describe('fieldBreakdown', () => {
  it('breaks a 5-field expression into 5 rows', () => {
    const rows = fieldBreakdown('*/15 9-17 * * 1-5');
    expect(rows.map((r) => r.label)).toEqual(['Minute', 'Hour', 'Day of month', 'Month', 'Day of week']);
  });

  it('breaks a 6-field expression into 6 rows, including seconds', () => {
    const rows = fieldBreakdown('30 0 9 * * *');
    expect(rows[0]).toMatchObject({ label: 'Second', raw: '30' });
  });

  it('summarizes a wildcard field as "every value"', () => {
    const rows = fieldBreakdown('* * * * *');
    expect(rows.find((r) => r.label === 'Minute')?.summary).toBe('every value');
  });

  it('summarizes day-of-week names for a range', () => {
    const rows = fieldBreakdown('0 9 * * 1-5');
    const dow = rows.find((r) => r.label === 'Day of week');
    expect(dow?.summary).toBe('Mon, Tue, Wed, Thu, Fri');
  });

  it('summarizes month names for a list', () => {
    const rows = fieldBreakdown('0 0 1 1,6,12 *');
    const month = rows.find((r) => r.label === 'Month');
    expect(month?.summary).toBe('Jan, Jun, Dec');
  });
});

describe('CRON_PRESETS', () => {
  it('every preset expression parses and describes without throwing', () => {
    for (const preset of CRON_PRESETS) {
      expect(() => parseCron(preset.expression)).not.toThrow();
      expect(() => describeCron(preset.expression)).not.toThrow();
    }
  });
});
