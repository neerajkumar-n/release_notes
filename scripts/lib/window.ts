const IST_OFFSET_MINUTES = 5 * 60 + 30;

function toIstWallClock(date: Date): Date {
  return new Date(date.getTime() + IST_OFFSET_MINUTES * 60_000);
}

function istDateOnly(date: Date): string {
  return toIstWallClock(date).toISOString().slice(0, 10);
}

export interface WeeklyWindow {
  /** ISO instant. Exclusive lower bound (previous Wednesday 10:00 IST). */
  startTime: string;
  /** ISO instant. Inclusive upper bound (current Wednesday 10:00 IST). */
  endTime: string;
  /** IST calendar date of startTime. Entries dated on this day are excluded. */
  startDateIst: string;
  /** IST calendar date of endTime. Entries dated on this day are included. */
  endDateIst: string;
}

/**
 * Computes the (previous Wednesday 10:00 IST, current Wednesday 10:00 IST]
 * window. `now` defaults to the actual invocation time, which under the
 * cron schedule below is already a Wednesday 10:00 IST run.
 *
 * Override via WINDOW_START_ISO / WINDOW_END_ISO for local testing or
 * backfills — both must be full ISO 8601 instants.
 *
 * Caveat: the changelog source records calendar dates only, not
 * time-of-day, so boundary inclusion is resolved at IST day granularity
 * (see parseMarkdownChangelog in changelogSource.ts).
 */
export function computeWeeklyWindow(now: Date = new Date()): WeeklyWindow {
  const overrideEnd = process.env.WINDOW_END_ISO;
  const overrideStart = process.env.WINDOW_START_ISO;

  const end = overrideEnd ? new Date(overrideEnd) : now;
  const start = overrideStart
    ? new Date(overrideStart)
    : new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

  if (Number.isNaN(end.getTime())) {
    throw new Error(`Invalid WINDOW_END_ISO override: ${overrideEnd}`);
  }
  if (Number.isNaN(start.getTime())) {
    throw new Error(`Invalid WINDOW_START_ISO override: ${overrideStart}`);
  }

  return {
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    startDateIst: istDateOnly(start),
    endDateIst: istDateOnly(end),
  };
}
