import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReactRouterInstrumentation } from '../../../src/server/instrumentation/reactRouter';
import { reactRouterServerIntegration } from '../../../src/server/integration/reactRouterServer';
import * as serverBuild from '../../../src/server/serverBuild';

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
  };
});

describe('reactRouterServerIntegration', () => {
  let registerServerBuildGlobalSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    registerServerBuildGlobalSpy = vi.spyOn(serverBuild, 'registerServerBuildGlobal');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sets up ReactRouterInstrumentation on setupOnce', () => {
    const integration = reactRouterServerIntegration();
    integration.setupOnce!();

    expect(ReactRouterInstrumentation).toHaveBeenCalledTimes(1);
  });

  it('registers the server build global callback on setupOnce', () => {
    const integration = reactRouterServerIntegration();
    integration.setupOnce!();

    expect(registerServerBuildGlobalSpy).toHaveBeenCalledTimes(1);
  });
});
