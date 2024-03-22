import type { ReplayBreadcrumbFrame } from '../types/replayFrame';

/**
 * Create a breadcrumb for a replay.
 */
export function createBreadcrumb(
  breadcrumb: Omit<ReplayBreadcrumbFrame, 'timestamp' | 'type'> & Partial<Pick<ReplayBreadcrumbFrame, 'timestamp'>>,
): ReplayBreadcrumbFrame {
  return {
    timestamp: Date.now() / 1000,
    type: 'default',
    ...breadcrumb,
  };
}
