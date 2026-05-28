import { getCurrentScope, setCurrentClient } from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { _onInp, _trackINP } from '../../src/metrics/inp';
import * as instrument from '../../src/metrics/instrument';
import { getDefaultClientOptions, TestClient } from '../utils/TestClient';

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
  afterEach(() => {
    setCurrentClient(undefined);
    getCurrentScope().setPropagationContext({
      traceId: '4c79f60c11214eb38604f4ae0781bfb2',
      sampleRand: 0.1,
    });
  });

  function setupClient() {
    const client = new TestClient(getDefaultClientOptions({ tracesSampleRate: 1 }));
    setCurrentClient(client);
    return vi.spyOn(client, 'sendEnvelope');
  }

  it('early-returns if the INP metric entry has no value', () => {
    const sendEnvelopeSpy = setupClient();

    const metric = {
      value: undefined,
      entries: [],
    };
    // @ts-expect-error - incomplete metric object
    _onInp({ metric });

    expect(sendEnvelopeSpy).not.toHaveBeenCalled();
  });

  it('early-returns if the INP metric value is greater than 60 seconds', () => {
    const sendEnvelopeSpy = setupClient();

    const metric = {
      value: 60_001,
      entries: [
        { name: 'click', duration: 60_001, interactionId: 1 },
        { name: 'click', duration: 60_000, interactionId: 2 },
      ],
    };
    // @ts-expect-error - incomplete metric object
    _onInp({ metric });

    expect(sendEnvelopeSpy).not.toHaveBeenCalled();
  });

  it('early-returns if the inp metric has an unknown interaction type', () => {
    const sendEnvelopeSpy = setupClient();

    const metric = {
      value: 10,
      entries: [{ name: 'unknown', duration: 10, interactionId: 1 }],
    };
    // @ts-expect-error - incomplete metric object
    _onInp({ metric });

    expect(sendEnvelopeSpy).not.toHaveBeenCalled();
  });

  it('sends a v2 span envelope for a valid INP metric entry', () => {
    const sendEnvelopeSpy = setupClient();

    const metric = {
      value: 10,
      entries: [{ name: 'click', duration: 10, interactionId: 1 }],
    };
    // @ts-expect-error - incomplete metric object
    _onInp({ metric });

    expect(sendEnvelopeSpy).toHaveBeenCalledTimes(1);

    const envelope = sendEnvelopeSpy.mock.calls[0]![0];
    const [headers, items] = envelope;
    expect(headers).toMatchObject({
      trace: {
        sampled: 'true',
        trace_id: '4c79f60c11214eb38604f4ae0781bfb2',
      },
    });
    expect(items[0]![0]).toMatchObject({
      content_type: 'application/vnd.sentry.items.span.v2+json',
      item_count: 1,
      type: 'span',
    });

    const span = items[0]![1].items[0]!;
    expect(span).toMatchObject({
      trace_id: '4c79f60c11214eb38604f4ae0781bfb2',
      is_segment: true,
      name: '<unknown>',
      status: 'ok',
      attributes: {
        'browser.web_vital.inp.value': {
          type: 'integer',
          value: 10,
        },
        'sentry.exclusive_time': {
          type: 'integer',
          value: 10,
        },
        'sentry.op': {
          type: 'string',
          value: 'ui.interaction.click',
        },
        'sentry.origin': {
          type: 'string',
          value: 'auto.http.browser.inp',
        },
      },
    });
  });

  it('takes the correct entry based on the metric value', () => {
    const sendEnvelopeSpy = setupClient();

    const metric = {
      value: 10,
      entries: [
        { name: 'click', duration: 10, interactionId: 1 },
        { name: 'click', duration: 9, interactionId: 2 },
      ],
    };
    // @ts-expect-error - incomplete metric object
    _onInp({ metric });

    expect(sendEnvelopeSpy).toHaveBeenCalledTimes(1);
    expect(sendEnvelopeSpy.mock.calls[0]![0][1][0]![1].items[0]!.attributes['sentry.exclusive_time']).toEqual({
      type: 'integer',
      value: 10,
    });
  });

  it('uses <unknown> as element name when entry.target is null and no cached name exists', () => {
    const sendEnvelopeSpy = setupClient();

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

    expect(sendEnvelopeSpy).toHaveBeenCalledTimes(1);
    expect(sendEnvelopeSpy.mock.calls[0]![0][1][0]![1].items[0]!.name).toBe('<unknown>');
  });
});
