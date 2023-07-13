import type { Sampled } from '../types';
import { isSampled } from './isSampled';

/**
 * Sample a session based on the provided sample rates.
 */
export function sampleSession({
  errorSampleRate,
  sessionSampleRate,
}: {
  errorSampleRate: number;
  sessionSampleRate: number;
}): Sampled {
  if (errorSampleRate <= 0 && sessionSampleRate <= 0) {
    return false;
  }

  if (isSampled(sessionSampleRate)) {
    return 'session';
  }

  return errorSampleRate > 0 ? 'buffer' : false;
}
