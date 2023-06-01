import type { BreadcrumbFrame } from '../types/replayFrame';

/**
 * Create a breadcrumb for a replay.
 */
export function createBreadcrumb(
  breadcrumb: Omit<BreadcrumbFrame, 'timestamp' | 'type'> & Partial<Pick<BreadcrumbFrame, 'timestamp'>>,
): BreadcrumbFrame {
  return {
    timestamp: Date.now() / 1000,
    type: 'default',
    ...breadcrumb,
  };
}
