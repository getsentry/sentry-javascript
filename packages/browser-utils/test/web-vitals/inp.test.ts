/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Loaded for its side effect: importing the mocked specifier here runs the factory below at collect
// time, so the one-time transform of the `@sentry/core` graph is not charged to whichever test
// imports it first. That timed out on slower CI runners.
import '@sentry/core';

const windowListeners = vi.hoisted(() => new Map<string, (event: unknown) => void>());
const performanceHandlers = vi.hoisted(() => new Map<string, (data: { entries: unknown[] }) => void>());

// `isBrowser()` is false under vitest even with the jsdom environment, and it gates the listeners.
vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  return { ...actual, isBrowser: () => true };
});

vi.mock('../../src/types', () => ({
  WINDOW: {
    addEventListener: (type: string, listener: (event: unknown) => void) => windowListeners.set(type, listener),
  },
}));

vi.mock('../../src/instrumentation/performanceObserver', async () => {
  const actual = await vi.importActual('../../src/instrumentation/performanceObserver');
  return {
    ...actual,
    addPerformanceInstrumentationHandler: (type: string, callback: (data: { entries: unknown[] }) => void) => {
      performanceHandlers.set(type, callback);
      return () => undefined;
    },
  };
});

/** Each test needs a fresh module: the element name cache is per page, so it's module-level. */
async function loadInp() {
  vi.resetModules();
  return import('../../src/web-vitals/inp');
}

/** A target `htmlTreeAsString` can describe, versus one it cannot (yields `<unknown>`). */
function element(id: string): unknown {
  return { tagName: 'DIV', id, nodeType: 1 };
}

/** Names the interaction by feeding an entry whose `target` is gone, forcing the timestamp lookup. */
function nameFor(interactionId: number, startTime: number): void {
  performanceHandlers.get('event')?.({
    entries: [{ entryType: 'event', name: 'click', interactionId, startTime, duration: 100, target: null }],
  });
}

describe('INP element name cache', () => {
  beforeEach(() => {
    windowListeners.clear();
    performanceHandlers.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the first name when later events of the same interaction describe a different element', async () => {
    const { getCachedInteractionContext, registerInpInteractionListener } = await loadInp();
    registerInpInteractionListener();

    // The whole sequence shares a timestamp. The trailing `pointerover` is what the browser fires
    // once the click handler has swapped out the element under the cursor.
    windowListeners.get('click')?.({ target: element('clicked'), timeStamp: 1000 });
    windowListeners.get('pointerover')?.({ target: element('replacement'), timeStamp: 1000 });

    nameFor(42, 1000);

    expect(getCachedInteractionContext({ interactionId: 42 } as any)?.elementName).toBe('div#clicked');
  });

  it('replaces an unresolvable name with a real one from the same interaction', async () => {
    const { getCachedInteractionContext, registerInpInteractionListener } = await loadInp();
    registerInpInteractionListener();

    // Targets that are not elements cannot be described, and they can come first in the sequence.
    windowListeners.get('pointerover')?.({ target: {}, timeStamp: 2000 });
    windowListeners.get('click')?.({ target: element('clicked'), timeStamp: 2000 });

    nameFor(43, 2000);

    expect(getCachedInteractionContext({ interactionId: 43 } as any)?.elementName).toBe('div#clicked');
  });

  it('reports an unresolvable name when nothing in the interaction resolves', async () => {
    const { getCachedInteractionContext, registerInpInteractionListener } = await loadInp();
    registerInpInteractionListener();

    windowListeners.get('click')?.({ target: {}, timeStamp: 3000 });

    nameFor(44, 3000);

    expect(getCachedInteractionContext({ interactionId: 44 } as any)?.elementName).toBe('<unknown>');
  });
});

describe('INP subparts', () => {
  beforeEach(() => {
    windowListeners.clear();
    performanceHandlers.clear();
  });

  function eventEntry(interactionId: number, startTime: number, duration: number, processing: [number, number]) {
    return {
      entryType: 'event',
      name: 'click',
      interactionId,
      startTime,
      duration,
      processingStart: processing[0],
      processingEnd: processing[1],
      target: null,
    };
  }

  async function observe(...entries: unknown[]) {
    const inp = await loadInp();
    inp.registerInpInteractionListener();
    performanceHandlers.get('event')?.({ entries });

    return inp;
  }

  it('merges every event presented in the same frame', async () => {
    // The slow handler is on `click`, which starts after the `pointerdown` web-vitals reports.
    const pointerdown = eventEntry(7, 500, 520, [505, 506]);
    const { getInpSubpartAttributes } = await observe(pointerdown, eventEntry(7, 510, 504, [515, 965]));

    expect(getInpSubpartAttributes(pointerdown as any)).toEqual({
      'browser.web_vital.inp.input_delay': 5,
      'browser.web_vital.inp.processing_duration': 460,
      'browser.web_vital.inp.presentation_delay': 55,
    });
  });

  it('counts a handler of another event in the same frame as processing', async () => {
    // A slow `pointerover` handler (not an interaction) was still running when the click came in.
    const click = eventEntry(9, 500, 520, [905, 910]);
    const { getInpSubpartAttributes } = await observe(eventEntry(0, 495, 525, [496, 900]), click);

    expect(getInpSubpartAttributes(click as any)).toEqual({
      'browser.web_vital.inp.input_delay': 0,
      'browser.web_vital.inp.processing_duration': 410,
      'browser.web_vital.inp.presentation_delay': 110,
    });
  });

  it('caps processing at the next paint so the subparts add up to the interaction', async () => {
    // A sync `alert()` in the handler keeps processing running long after the next paint.
    const entry = eventEntry(8, 100, 200, [120, 900]);
    const { getInpSubpartAttributes } = await observe(entry);

    expect(getInpSubpartAttributes(entry as any)).toEqual({
      'browser.web_vital.inp.input_delay': 20,
      'browser.web_vital.inp.processing_duration': 180,
      'browser.web_vital.inp.presentation_delay': 0,
    });
  });

  it('ignores entries below the duration web-vitals observes INP with', async () => {
    const entry = eventEntry(10, 100, 32, [105, 120]);
    const { getInpSubpartAttributes } = await observe(entry);

    expect(getInpSubpartAttributes(entry as any)).toBeUndefined();
  });
});
