/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

    expect(getCachedInteractionContext(42)?.elementName).toBe('div#clicked');
  });

  it('replaces an unresolvable name with a real one from the same interaction', async () => {
    const { getCachedInteractionContext, registerInpInteractionListener } = await loadInp();
    registerInpInteractionListener();

    // Targets that are not elements cannot be described, and they can come first in the sequence.
    windowListeners.get('pointerover')?.({ target: {}, timeStamp: 2000 });
    windowListeners.get('click')?.({ target: element('clicked'), timeStamp: 2000 });

    nameFor(43, 2000);

    expect(getCachedInteractionContext(43)?.elementName).toBe('div#clicked');
  });

  it('reports an unresolvable name when nothing in the interaction resolves', async () => {
    const { getCachedInteractionContext, registerInpInteractionListener } = await loadInp();
    registerInpInteractionListener();

    windowListeners.get('click')?.({ target: {}, timeStamp: 3000 });

    nameFor(44, 3000);

    expect(getCachedInteractionContext(44)?.elementName).toBe('<unknown>');
  });
});
