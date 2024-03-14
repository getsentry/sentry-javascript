import type { Integration } from '@sentry/types';
import { consoleSandbox } from '@sentry/utils';
import { FAKE_FUNCTION } from './common';

const REPLAY_INTEGRATION_METHODS = ['start', 'stop', 'flush'] as const;

type ReplaySpecificMethods = Record<(typeof REPLAY_INTEGRATION_METHODS)[number], () => void>;

interface ReplayIntegration extends Integration, ReplaySpecificMethods {}

/**
 * This is a shim for the Replay integration.
 * It is needed in order for the CDN bundles to continue working when users add/remove replay
 * from it, without changing their config. This is necessary for the loader mechanism.
 */
export function replayIntegrationShim(_options: unknown): ReplayIntegration {
  consoleSandbox(() => {
    // eslint-disable-next-line no-console
    console.warn('You are using replayIntegration() even though this bundle does not include replay.');
  });

  return {
    name: 'Replay',
    ...(REPLAY_INTEGRATION_METHODS.reduce((acc, method) => {
      acc[method] = FAKE_FUNCTION;
      return acc;
    }, {} as ReplaySpecificMethods) as ReplaySpecificMethods),
  };
}
