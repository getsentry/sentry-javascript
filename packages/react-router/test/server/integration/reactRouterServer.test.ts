import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReactRouterInstrumentation } from '../../../src/server/instrumentation/reactRouter';
import { reactRouterServerIntegration } from '../../../src/server/integration/reactRouterServer';
import * as serverBuild from '../../../src/server/serverBuild';
import * as serverGlobals from '../../../src/server/serverGlobals';

vi.mock('../../../src/server/instrumentation/reactRouter', () => {
  return {
    ReactRouterInstrumentation: vi.fn(),
  };
});

const mockNodeVersion = { major: 20, minor: 18, patch: 0 };

vi.mock('@sentry/node', () => {
  return {
    generateInstrumentOnce: vi.fn((_name: string, callback: () => any) => {
      return Object.assign(callback, { id: 'test' });
    }),
    get NODE_VERSION() {
      return mockNodeVersion;
    },
  };
});

describe('reactRouterServerIntegration', () => {
  let registerServerBuildGlobalSpy: ReturnType<typeof vi.spyOn>;
  let enableOtelDataLoaderSpanCreationSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    registerServerBuildGlobalSpy = vi.spyOn(serverBuild, 'registerServerBuildGlobal');
    enableOtelDataLoaderSpanCreationSpy = vi.spyOn(serverGlobals, 'enableOtelDataLoaderSpanCreation');
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

  it('enables OTEL data-loader span creation on Node 20.18', () => {
    mockNodeVersion.major = 20;
    mockNodeVersion.minor = 18;

    const integration = reactRouterServerIntegration();
    integration.setupOnce!();

    expect(enableOtelDataLoaderSpanCreationSpy).toHaveBeenCalledTimes(1);
    expect(ReactRouterInstrumentation).toHaveBeenCalledTimes(1);
    expect(registerServerBuildGlobalSpy).toHaveBeenCalledTimes(1);
  });

  it('enables OTEL data-loader span creation on Node 22.11', () => {
    mockNodeVersion.major = 22;
    mockNodeVersion.minor = 11;

    const integration = reactRouterServerIntegration();
    integration.setupOnce!();

    expect(enableOtelDataLoaderSpanCreationSpy).toHaveBeenCalledTimes(1);
    expect(ReactRouterInstrumentation).toHaveBeenCalledTimes(1);
    expect(registerServerBuildGlobalSpy).toHaveBeenCalledTimes(1);
  });

  it('does not enable OTEL data-loader span creation on Node 20.19', () => {
    mockNodeVersion.major = 20;
    mockNodeVersion.minor = 19;

    const integration = reactRouterServerIntegration();
    integration.setupOnce!();

    expect(enableOtelDataLoaderSpanCreationSpy).not.toHaveBeenCalled();
    expect(ReactRouterInstrumentation).toHaveBeenCalledTimes(1);
    expect(registerServerBuildGlobalSpy).toHaveBeenCalledTimes(1);
  });

  it('does not enable OTEL data-loader span creation on Node 22.12', () => {
    mockNodeVersion.major = 22;
    mockNodeVersion.minor = 12;

    const integration = reactRouterServerIntegration();
    integration.setupOnce!();

    expect(enableOtelDataLoaderSpanCreationSpy).not.toHaveBeenCalled();
    expect(ReactRouterInstrumentation).toHaveBeenCalledTimes(1);
    expect(registerServerBuildGlobalSpy).toHaveBeenCalledTimes(1);
  });
});
