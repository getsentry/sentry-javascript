import { afterEach } from 'node:test';
import { describe, expect, it, vi } from 'vitest';
import { _onInp, _trackINP } from '../../src/metrics/inp';
import * as instrument from '../../src/metrics/instrument';
import * as utils from '../../src/metrics/utils';

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
  it('early-returns if the INP metric entry has no value', () => {
    const startStandaloneWebVitalSpanSpy = vi.spyOn(utils, 'startStandaloneWebVitalSpan');

    const metric = {
      value: undefined,
      entries: [],
    };
    // @ts-expect-error - incomplete metric object
    _onInp({ metric });

    expect(startStandaloneWebVitalSpanSpy).not.toHaveBeenCalled();
  });

  it('early-returns if the INP metric value is greater than 60 seconds', () => {
    const startStandaloneWebVitalSpanSpy = vi.spyOn(utils, 'startStandaloneWebVitalSpan');

    const metric = {
      value: 60_001,
      entries: [
        { name: 'click', duration: 60_001, interactionId: 1 },
        { name: 'click', duration: 60_000, interactionId: 2 },
      ],
    };
    // @ts-expect-error - incomplete metric object
    _onInp({ metric });

    expect(startStandaloneWebVitalSpanSpy).not.toHaveBeenCalled();
  });

  it('early-returns if the inp metric has an unknown interaction type', () => {
    const startStandaloneWebVitalSpanSpy = vi.spyOn(utils, 'startStandaloneWebVitalSpan');

    const metric = {
      value: 10,
      entries: [{ name: 'unknown', duration: 10, interactionId: 1 }],
    };
    // @ts-expect-error - incomplete metric object
    _onInp({ metric });

    expect(startStandaloneWebVitalSpanSpy).not.toHaveBeenCalled();
  });

  it('starts a span for a valid INP metric entry', () => {
    const startStandaloneWebVitalSpanSpy = vi.spyOn(utils, 'startStandaloneWebVitalSpan');

    const metric = {
      value: 10,
      entries: [{ name: 'click', duration: 10, interactionId: 1 }],
    };
    // @ts-expect-error - incomplete metric object
    _onInp({ metric });

    expect(startStandaloneWebVitalSpanSpy).toHaveBeenCalledTimes(1);
    expect(startStandaloneWebVitalSpanSpy).toHaveBeenCalledWith({
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

  it('takes the correct entry based on the metric value', () => {
    const startStandaloneWebVitalSpanSpy = vi.spyOn(utils, 'startStandaloneWebVitalSpan');

    const metric = {
      value: 10,
      entries: [
        { name: 'click', duration: 10, interactionId: 1 },
        { name: 'click', duration: 9, interactionId: 2 },
      ],
    };
    // @ts-expect-error - incomplete metric object
    _onInp({ metric });

    expect(startStandaloneWebVitalSpanSpy).toHaveBeenCalledTimes(1);
    expect(startStandaloneWebVitalSpanSpy).toHaveBeenCalledWith({
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

  it('uses <unknown> as element name when entry.target is null and no cached name exists', () => {
    const startStandaloneWebVitalSpanSpy = vi.spyOn(utils, 'startStandaloneWebVitalSpan');

    const metric = {
      value: 150,
      entries: [
        {
          name: 'click',
          duration: 150,
          interactionId: 999,
          target: null, // Element was removed from DOM
          startTime: 1234567,
        },
      ],
    };
    // @ts-expect-error - incomplete metric object
    _onInp({ metric });

    expect(startStandaloneWebVitalSpanSpy).toHaveBeenCalledTimes(1);
    expect(startStandaloneWebVitalSpanSpy).toHaveBeenCalledWith({
      attributes: {
        'sentry.exclusive_time': 150,
        'sentry.op': 'ui.interaction.click',
        'sentry.origin': 'auto.http.browser.inp',
      },
      name: '<unknown>', // Should fall back to <unknown> when element cannot be determined
      startTime: expect.any(Number),
      transaction: undefined,
    });
  });
});
