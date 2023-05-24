import type { CrumbFrame } from '../types/replayFrame';

/**
 * Create a breadcrumb for a replay.
 */
export function createBreadcrumb(
  breadcrumb: Omit<CrumbFrame, 'timestamp' | 'type'> & Partial<Pick<CrumbFrame, 'timestamp'>>,
): CrumbFrame {
  return {
    timestamp: Date.now() / 1000,
    type: 'default',
    ...breadcrumb,
  };
}
