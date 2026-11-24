import type { Client } from '@sentry/core';
import { GLOBAL_OBJ } from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { capturePrepareResponse } from '../../../src/integrations/nitro/capturePrepareResponse';
import { captureStorageEvents } from '../../../src/integrations/nitro/captureStorageEvents';
import { captureTracingEvents } from '../../../src/integrations/nitro/captureTracingEvents';
import { captureServerTimingHeaders } from '../../../src/integrations/nitro/setServerTimingHeaders';
import { nitroIntegration } from '../../../src/integrations/nitro';

vi.mock('../../../src/integrations/nitro/capturePrepareResponse', () => ({ capturePrepareResponse: vi.fn() }));
vi.mock('../../../src/integrations/nitro/captureStorageEvents', () => ({ captureStorageEvents: vi.fn() }));
vi.mock('../../../src/integrations/nitro/captureTracingEvents', () => ({ captureTracingEvents: vi.fn() }));
vi.mock('../../../src/integrations/nitro/setServerTimingHeaders', () => ({ captureServerTimingHeaders: vi.fn() }));

describe('nitroIntegration', () => {
  afterEach(() => {
    vi.clearAllMocks();
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = undefined;
  });

  it('enables all instrumentation by default', () => {
    nitroIntegration().setupOnce!();

    expect(captureTracingEvents).toHaveBeenCalledTimes(1);
    expect(captureStorageEvents).toHaveBeenCalledTimes(1);
    expect(captureServerTimingHeaders).toHaveBeenCalledTimes(1);
  });

  it('skips Server-Timing headers when `serverTiming` is disabled', () => {
    nitroIntegration({ serverTiming: false }).setupOnce!();

    expect(captureTracingEvents).toHaveBeenCalledTimes(1);
    expect(captureStorageEvents).toHaveBeenCalledTimes(1);
    expect(captureServerTimingHeaders).not.toHaveBeenCalled();
  });

  it('skips storage spans when `storage` is disabled', () => {
    nitroIntegration({ storage: false }).setupOnce!();

    expect(captureTracingEvents).toHaveBeenCalledTimes(1);
    expect(captureStorageEvents).not.toHaveBeenCalled();
    expect(captureServerTimingHeaders).toHaveBeenCalledTimes(1);
  });

  it('subscribes to h3 `prepareResponse` without Server-Timing headers when `serverTiming` is disabled', () => {
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = { runtime: ['h3'] };

    nitroIntegration({ serverTiming: false }).setup!({ on: vi.fn() } as unknown as Client);

    expect(capturePrepareResponse).toHaveBeenCalledWith(false);
  });
});
