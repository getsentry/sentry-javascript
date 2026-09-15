import { subscribe } from '@ember/instrumentation';
import { startInactiveSpan } from '@sentry/browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Subscriber = {
  before: (name: string, timestamp: number, payload: object) => void;
  after: (name: string, timestamp: number, payload: object) => void;
};

vi.mock('@ember/instrumentation', () => ({ subscribe: vi.fn() }));
vi.mock('@ember/runloop', () => ({ scheduleOnce: vi.fn(), _backburner: undefined, run: {} }));
vi.mock('@sentry/browser', () => ({
  getActiveSpan: vi.fn(() => undefined),
  startInactiveSpan: vi.fn(() => ({ end: vi.fn() })),
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN: 'sentry.origin',
}));

function getSubscriber(eventName: string): Subscriber | undefined {
  const call = vi.mocked(subscribe).mock.calls.find(([name]) => name === eventName);
  return call?.[1] as Subscriber | undefined;
}

async function instrumentComponents(enableComponentDefinitions: boolean): Promise<void> {
  const { instrumentGlobalsForPerformance } = await import('../src/utils/instrumentEmberGlobals.ts');
  instrumentGlobalsForPerformance({
    disableRunloopPerformance: true,
    disableInitialLoadInstrumentation: true,
    // The renders below take ~0ms, so drop the threshold that would skip them.
    minimumComponentRenderDuration: 0,
    enableComponentDefinitions,
  });
}

describe('component instrumentation', () => {
  const payload = { containerKey: 'component:test-component', initialRender: true as const, object: '<ember123>' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('starts a `ui.render` span for a component render', async () => {
    await instrumentComponents(false);

    const subscriber = getSubscriber('render.component');
    subscriber?.before('render.component', 0, payload);
    subscriber?.after('render.component', 0, payload);

    expect(startInactiveSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'component:test-component',
        attributes: expect.objectContaining({
          'sentry.op': 'ui.render',
          'sentry.origin': 'auto.ui.ember',
          'ui.component_name': 'component:test-component',
        }),
      }),
    );
  });

  it('starts a `ui.resolve` span for a component definition lookup', async () => {
    await instrumentComponents(true);

    const subscriber = getSubscriber('render.getComponentDefinition');
    subscriber?.before('render.getComponentDefinition', 0, payload);
    subscriber?.after('render.getComponentDefinition', 0, payload);

    expect(startInactiveSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'component:test-component',
        attributes: expect.objectContaining({
          'sentry.op': 'ui.resolve',
          'sentry.origin': 'auto.ui.ember',
          'ui.component_name': 'component:test-component',
        }),
      }),
    );
  });

  it('does not subscribe to component definition lookups unless they are enabled', async () => {
    await instrumentComponents(false);

    expect(getSubscriber('render.getComponentDefinition')).toBeUndefined();
    expect(getSubscriber('render.component')).toBeDefined();
  });
});
