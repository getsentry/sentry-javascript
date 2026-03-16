import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getCurrentScope, getGlobalScope, getIsolationScope, setCurrentClient } from '../../../../src';
import { resolveAIRecordingOptions } from '../../../../src/tracing/ai/utils';
import { getDefaultTestClientOptions, TestClient } from '../../../mocks/client';

describe('resolveAIRecordingOptions', () => {
  beforeEach(() => {
    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();
  });

  afterEach(() => {
    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();
  });

  function setup(sendDefaultPii: boolean): void {
    const options = getDefaultTestClientOptions({ tracesSampleRate: 1, sendDefaultPii });
    const client = new TestClient(options);
    setCurrentClient(client);
    client.init();
  }

  it('defaults to false when sendDefaultPii is false', () => {
    setup(false);
    expect(resolveAIRecordingOptions()).toEqual({ recordInputs: false, recordOutputs: false });
  });

  it('respects sendDefaultPii: true', () => {
    setup(true);
    expect(resolveAIRecordingOptions()).toEqual({ recordInputs: true, recordOutputs: true });
  });

  it('explicit options override sendDefaultPii', () => {
    setup(true);
    expect(resolveAIRecordingOptions({ recordInputs: false })).toEqual({ recordInputs: false, recordOutputs: true });
  });
});
