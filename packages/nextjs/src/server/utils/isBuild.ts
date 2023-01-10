import { PHASE_PRODUCTION_BUILD } from 'next/constants';

/**
 * Decide if the currently running process is part of the build phase or happening at runtime.
 */
export function isBuild(): boolean {
  return process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD;
}
