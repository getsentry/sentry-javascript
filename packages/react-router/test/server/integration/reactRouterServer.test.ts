import * as SentryNode from '@sentry/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReactRouterInstrumentation } from '../../../src/server/instrumentation/reactRouter';
import { reactRouterServerIntegration } from '../../../src/server/integration/reactRouterServer';

vi.mock('../../../src/server/instrumentation/reactRouter', () => {
  return {
    ReactRouterInstrumentation: vi.fn(),
  };
});

vi.mock('@sentry/node', () => {
  return {
    generateInstrumentOnce: vi.fn((_name: string, callback: () => any) => {
      return Object.assign(callback, { id: 'test' });
    }),
    NODE_VERSION: {
      major: 0,
      minor: 0,
      patch: 0,
    },
  };
});

describe('reactRouterServerIntegration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets up ReactRouterInstrumentation for Node 20.18', () => {
    vi.spyOn(SentryNode, 'NODE_VERSION', 'get').mockReturnValue({ major: 20, minor: 18, patch: 0 });

    const integration = reactRouterServerIntegration();
    integration.setupOnce!();

    expect(ReactRouterInstrumentation).toHaveBeenCalled();
  });

  it('sets up ReactRouterInstrumentationfor Node.js 22.11', () => {
    vi.spyOn(SentryNode, 'NODE_VERSION', 'get').mockReturnValue({ major: 22, minor: 11, patch: 0 });

    const integration = reactRouterServerIntegration();
    integration.setupOnce!();

    expect(ReactRouterInstrumentation).toHaveBeenCalled();
  });

  it('does not set up ReactRouterInstrumentation for Node.js 20.19', () => {
    vi.spyOn(SentryNode, 'NODE_VERSION', 'get').mockReturnValue({ major: 20, minor: 19, patch: 0 });

    const integration = reactRouterServerIntegration();
    integration.setupOnce!();

    expect(ReactRouterInstrumentation).not.toHaveBeenCalled();
  });

  it('does not set up ReactRouterInstrumentation for Node.js 22.12', () => {
    vi.spyOn(SentryNode, 'NODE_VERSION', 'get').mockReturnValue({ major: 22, minor: 12, patch: 0 });

    const integration = reactRouterServerIntegration();
    integration.setupOnce!();

    expect(ReactRouterInstrumentation).not.toHaveBeenCalled();
  });
});
