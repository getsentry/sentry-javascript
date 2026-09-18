import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reactRouterServerIntegration } from '../../../src/server/integration/reactRouterServer';
import * as serverBuild from '../../../src/server/serverBuild';

describe('reactRouterServerIntegration', () => {
  let registerServerBuildGlobalSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    registerServerBuildGlobalSpy = vi.spyOn(serverBuild, 'registerServerBuildGlobal');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers the server build global callback on setupOnce', () => {
    const integration = reactRouterServerIntegration();
    integration.setupOnce!();

    expect(registerServerBuildGlobalSpy).toHaveBeenCalledTimes(1);
  });
});
