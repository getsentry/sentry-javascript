import { afterEach } from 'node:test';
import { describe, expect, it, vi } from 'vitest';
import { _onInp, _trackINP } from '../../../src/metrics/inp';
import * as instrument from '../../../src/metrics/instrument';
import * as utils from '../../../src/metrics/utils';

describe('_trackINP', () => {
  const addInpInstrumentationHandler = vi.spyOn(instrument, 'addInpInstrumentationHandler');

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('adds an instrumentation handler', () => {
    _trackINP();
    expect(addInpInstrumentationHandler).toHaveBeenCalledOnce();
  });

  it('returns an unsubscribe dunction', () => {
    const handler = _trackINP();
    expect(typeof handler).toBe('function');
  });
});

describe('_onInp', () => {
  const startStandaloneWebVitalSpan = vi.spyOn(utils, 'startStandaloneWebVitalSpan');

  it('early-returns if the INP metric entry has no value', () => {
    const metric = {
      value: undefined,
      entries: [],
    };
    // @ts-expect-error - incomplete metric object
    _onInp({ metric });
    expect(startStandaloneWebVitalSpan).not.toHaveBeenCalled();
  });

  it('early-returns if the INP metric value is greater than 60 seconds', () => {
    const metric = {
      value: 60_001,
      entries: [],
    };
    // @ts-expect-error - incomplete metric object
    _onInp({ metric });
    expect(startStandaloneWebVitalSpan).not.toHaveBeenCalled();
  });
});
