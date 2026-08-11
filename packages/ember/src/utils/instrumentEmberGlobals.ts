import { subscribe } from '@ember/instrumentation';
import { scheduleOnce } from '@ember/runloop';
import { SENTRY_OP, UI_COMPONENT_NAME } from '@sentry/conventions/attributes';
import { BROWSER_UI_RENDER_SPAN_OP, BROWSER_UI_TASK_SPAN_OP, GENERAL_FUNCTION_SPAN_OP } from '@sentry/conventions/op';
import { getActiveSpan, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startInactiveSpan } from '@sentry/browser';
import type { Span } from '@sentry/core';
import { browserPerformanceTimeOrigin, timestampInSeconds } from '@sentry/core';
import { getBackburner } from './utils.ts';

// Ember runloop queue names
type EmberRunQueues = 'actions' | 'afterRender' | 'destroy' | 'render' | 'routerTransitions' | 'sync';

type Payload = {
  containerKey: string;
  initialRender: true;
  object: string;
};

type RenderEntry = {
  now: number;
};

export type RenderEntries = WeakMap<Payload, RenderEntry>;

/** This is global, so should only be run once in tests! */
export function instrumentGlobalsForPerformance(config: {
  disableRunloopPerformance?: boolean;
  minimumRunloopQueueDuration?: number;
  disableInstrumentComponents?: boolean;
  minimumComponentRenderDuration?: number;
  enableComponentDefinitions?: boolean;
  disableInitialLoadInstrumentation?: boolean;
}): void {
  const {
    disableRunloopPerformance,
    minimumRunloopQueueDuration,
    disableInstrumentComponents,
    minimumComponentRenderDuration,
    enableComponentDefinitions,
    disableInitialLoadInstrumentation,
  } = config;

  if (!disableRunloopPerformance) {
    _instrumentEmberRunloop({
      minimumRunloopQueueDuration,
    });
  }
  if (!disableInstrumentComponents) {
    _instrumentComponents({
      minimumComponentRenderDuration,
      enableComponentDefinitions,
    });
  }
  if (!disableInitialLoadInstrumentation) {
    _instrumentInitialLoad();
  }
}

function _instrumentEmberRunloop(config: { minimumRunloopQueueDuration?: number }): void {
  const { minimumRunloopQueueDuration } = config;
  let currentQueueStart: number | undefined;
  let currentQueueSpan: Span | undefined;
  const instrumentedEmberQueues = [
    'actions',
    'routerTransitions',
    'render',
    'afterRender',
    'destroy',
  ] as EmberRunQueues[];

  getBackburner().on('begin', (_: unknown, previousInstance: unknown) => {
    if (previousInstance) {
      return;
    }
    const activeSpan = getActiveSpan();
    if (!activeSpan) {
      return;
    }
    if (currentQueueSpan) {
      currentQueueSpan.end();
    }
    currentQueueStart = timestampInSeconds();

    const processQueue = (queue: EmberRunQueues): void => {
      // Process this queue using the end of the previous queue.
      if (currentQueueStart) {
        const now = timestampInSeconds();
        const minQueueDuration = minimumRunloopQueueDuration ?? 5;

        if ((now - currentQueueStart) * 1000 >= minQueueDuration) {
          startInactiveSpan({
            attributes: {
              [SENTRY_OP]: BROWSER_UI_TASK_SPAN_OP,
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.ember',
              'ember.runloop.queue': queue,
            },
            name: 'runloop',
            startTime: currentQueueStart,
            onlyIfParent: true,
          })?.end(now);
        }
        currentQueueStart = undefined;
      }

      // Setup for next queue

      const stillActiveSpan = getActiveSpan();
      if (!stillActiveSpan) {
        return;
      }
      currentQueueStart = timestampInSeconds();
    };

    instrumentedEmberQueues.forEach(queue => {
      scheduleOnce(queue, null, processQueue, queue);
    });
  });
  getBackburner().on('end', (_: unknown, nextInstance: unknown) => {
    if (nextInstance) {
      return;
    }
    if (currentQueueSpan) {
      currentQueueSpan.end();
      currentQueueSpan = undefined;
    }
  });
}

export function _processComponentRenderBefore(payload: Payload, beforeEntries: RenderEntries): void {
  beforeEntries.set(payload, { now: timestampInSeconds() });
}

export function _processComponentRenderAfter(
  payload: Payload,
  beforeEntries: RenderEntries,
  op: string,
  minComponentDuration: number,
): void {
  const begin = beforeEntries.get(payload);

  if (!begin) {
    return;
  }

  // A WeakMap entry cannot outlive its payload, but delete promptly anyway
  // so a long-lived payload doesn't keep the entry around between renders.
  beforeEntries.delete(payload);

  const now = timestampInSeconds();
  const componentRenderDuration = now - begin.now;

  const name = payload.containerKey || payload.object;

  if (componentRenderDuration * 1000 >= minComponentDuration) {
    startInactiveSpan({
      name,
      startTime: begin.now,
      attributes: {
        [SENTRY_OP]: op,
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.ember',
        [UI_COMPONENT_NAME]: name,
      },
      onlyIfParent: true,
    })?.end(now);
  }
}

function _instrumentComponents(config: {
  minimumComponentRenderDuration?: number;
  enableComponentDefinitions?: boolean;
}): void {
  const { minimumComponentRenderDuration, enableComponentDefinitions } = config;

  const minComponentDuration = minimumComponentRenderDuration ?? 2;

  const beforeEntries: RenderEntries = new WeakMap();
  const beforeComponentDefinitionEntries: RenderEntries = new WeakMap();

  function _subscribeToRenderEvents(): void {
      before(_name: string, _timestamp: number, payload: object) {
        _processComponentRenderBefore(payload as Payload, beforeEntries);
      },

      after(_name: string, _timestamp: number, payload: object) {
        _processComponentRenderAfter(payload as Payload, beforeEntries, BROWSER_UI_RENDER_SPAN_OP, minComponentDuration);
      },
    });
    if (enableComponentDefinitions) {
      subscribe<void>('render.getComponentDefinition', {
        before(_name: string, _timestamp: number, payload: object) {
          _processComponentRenderBefore(payload as Payload, beforeComponentDefinitionEntries);
        },

        after(_name: string, _timestamp: number, payload: object) {
          _processComponentRenderAfter(
            payload as Payload,
            beforeComponentDefinitionEntries,
            GENERAL_FUNCTION_SPAN_OP,
            0,
          );
        },
      });
    }
  }
  _subscribeToRenderEvents();
}

function _instrumentInitialLoad(): void {
  const startName = '@sentry/ember:initial-load-start';
  const endName = '@sentry/ember:initial-load-end';

  const { HAS_PERFORMANCE, HAS_PERFORMANCE_TIMING } = _hasPerformanceSupport();

  if (!HAS_PERFORMANCE) {
    return;
  }

  const { performance } = window;

  const origin = browserPerformanceTimeOrigin();
  // Split performance check in two so clearMarks still happens even if timeOrigin isn't available.
  if (!HAS_PERFORMANCE_TIMING || origin === undefined) {
    return;
  }
  const measureName = '@sentry/ember:initial-load';

  const startMarkExists = performance.getEntriesByName(startName).length > 0;
  const endMarkExists = performance.getEntriesByName(endName).length > 0;
  if (!startMarkExists || !endMarkExists) {
    return;
  }

  performance.measure(measureName, startName, endName);
  const measures = performance.getEntriesByName(measureName);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const measure = measures[0]!;

  const startTime = (measure.startTime + origin) / 1000;
  const endTime = startTime + measure.duration / 1000;

  startInactiveSpan({
    name: 'init',
    attributes: {
      // TODO(v11): Replace with the `ui.mount` constant from `@sentry/conventions/op` once it is registered there.
      [SENTRY_OP]: 'ui.mount',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.ember',
    },
    startTime,
    onlyIfParent: true,
  })?.end(endTime);
  performance.clearMarks(startName);
  performance.clearMarks(endName);

  performance.clearMeasures(measureName);
}

function _hasPerformanceSupport(): { HAS_PERFORMANCE: boolean; HAS_PERFORMANCE_TIMING: boolean } {
  // TS says that all of these methods are always available, but some of them may not be supported in older browsers
  // So we "pretend" they are all optional in order to be able to check this properly without TS complaining
  const _performance = window.performance as {
    clearMarks?: Performance['clearMarks'];
    clearMeasures?: Performance['clearMeasures'];
    measure?: Performance['measure'];
    getEntriesByName?: Performance['getEntriesByName'];
  };
  const HAS_PERFORMANCE = Boolean(_performance?.clearMarks && _performance.clearMeasures);
  const HAS_PERFORMANCE_TIMING = Boolean(
    _performance.measure && _performance.getEntriesByName && browserPerformanceTimeOrigin !== undefined,
  );

  return {
    HAS_PERFORMANCE,
    HAS_PERFORMANCE_TIMING,
  };
}
