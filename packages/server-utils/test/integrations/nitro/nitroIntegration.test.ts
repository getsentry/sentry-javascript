import type { Client } from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureNitroAppErrors } from '../../../src/integrations/nitro/captureAppErrors';
import { captureStorageEvents } from '../../../src/integrations/nitro/captureStorageEvents';
import { captureTracingEvents } from '../../../src/integrations/nitro/captureTracingEvents';
import { captureServerTimingHeaders } from '../../../src/integrations/nitro/setServerTimingHeaders';
import { nitroIntegration } from '../../../src/integrations/nitro';
import { invokeOrchestrionInstrumentation } from '../../../src/orchestrion/instrumentation';

vi.mock('../../../src/integrations/nitro/captureStorageEvents', () => ({ captureStorageEvents: vi.fn() }));
vi.mock('../../../src/integrations/nitro/captureTracingEvents', () => ({ captureTracingEvents: vi.fn() }));
vi.mock('../../../src/integrations/nitro/setServerTimingHeaders', () => ({ captureServerTimingHeaders: vi.fn() }));
vi.mock('../../../src/orchestrion/instrumentation', () => ({ invokeOrchestrionInstrumentation: vi.fn() }));

describe('nitroIntegration', () => {
  afterEach(() => {
    vi.clearAllMocks();
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

  it('subscribes to the `useNitroApp` channel once `nitro` is injected', () => {
    const client = {} as Client;

    nitroIntegration().setup!(client);

    expect(invokeOrchestrionInstrumentation).toHaveBeenCalledWith(client, ['nitro'], captureNitroAppErrors, [], {
      requiresTracingChannelBinding: false,
    });
  });
});
