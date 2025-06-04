import { afterEach, beforeEach } from 'node:test';
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

  beforeEach(() => {
    vi.clearAllMocks();
  });

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
      entries: [{ name: 'click', duration: 60_001, interactionId: 1 }],
    };
    // @ts-expect-error - incomplete metric object
    _onInp({ metric });
    expect(startStandaloneWebVitalSpan).not.toHaveBeenCalled();
  });

  it('early-returns if the inp metric has an unknown interaction type', () => {
    const metric = {
      value: 10,
      entries: [{ name: 'unknown', duration: 10, interactionId: 1 }],
    };
    // @ts-expect-error - incomplete metric object
    _onInp({ metric });
    expect(startStandaloneWebVitalSpan).not.toHaveBeenCalled();
  });

  it('starts a span for a valid INP metric entry', () => {
    const metric = {
      value: 10,
      entries: [{ name: 'click', duration: 10, interactionId: 1 }],
    };
    // @ts-expect-error - incomplete metric object
    _onInp({ metric });
    expect(startStandaloneWebVitalSpan).toHaveBeenCalledWith({
      attributes: {
        'sentry.exclusive_time': 10,
        'sentry.op': 'ui.interaction.click',
        'sentry.origin': 'auto.http.browser.inp',
      },
      name: '<unknown>',
      startTime: NaN,
      transaction: undefined,
    });
  });
});
