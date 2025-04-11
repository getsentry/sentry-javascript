import * as Sentry from '@sentry/node';

export function captureException(i: number): void {
  Sentry.captureException(new Error(`error in loop ${i}`));
}
