import { NEXT_PHASE_PRODUCTION_BUILD } from './phases';

/**
 * Decide if the currently running process is part of the build phase or happening at runtime.
 */
export function isBuild(): boolean {
  return process.env.NEXT_PHASE === NEXT_PHASE_PRODUCTION_BUILD;
}
