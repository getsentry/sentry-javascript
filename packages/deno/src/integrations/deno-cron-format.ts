/**
 * These functions were copied from the Deno source code here:
 * https://github.com/denoland/deno/blob/cd480b481ee1b4209910aa7a8f81ffa996e7b0f9/ext/cron/01_cron.ts
 * Below is the original license:
 *
 * MIT License
 *
 * Copyright 2018-2023 the Deno authors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

function formatToCronSchedule(
  value?:
    | number
    | { exact: number | number[] }
    | {
        start?: number;
        end?: number;
        every?: number;
      },
): string {
  if (value === undefined) {
    return '*';
  } else if (typeof value === 'number') {
    return value.toString();
  } else {
    const { exact } = value as { exact: number | number[] };
    if (exact === undefined) {
      const { start, end, every } = value as {
        start?: number;
        end?: number;
        every?: number;
      };
      if (start !== undefined && end !== undefined && every !== undefined) {
        return `${start}-${end}/${every}`;
      } else if (start !== undefined && end !== undefined) {
        return `${start}-${end}`;
      } else if (start !== undefined && every !== undefined) {
        return `${start}/${every}`;
      } else if (start !== undefined) {
        return `${start}/1`;
      } else if (end === undefined && every !== undefined) {
        return `*/${every}`;
      } else {
        throw new TypeError('Invalid cron schedule');
      }
    } else {
      if (typeof exact === 'number') {
        return exact.toString();
      } else {
        return exact.join(',');
      }
    }
  }
}

/** */
export function parseScheduleToString(schedule: string | Deno.CronSchedule): string {
  if (typeof schedule === 'string') {
    return schedule;
  } else {
    const { minute, hour, dayOfMonth, month, dayOfWeek } = schedule;

    return `${formatToCronSchedule(minute)} ${formatToCronSchedule(hour)} ${formatToCronSchedule(
      dayOfMonth,
    )} ${formatToCronSchedule(month)} ${formatToCronSchedule(dayOfWeek)}`;
  }
}
