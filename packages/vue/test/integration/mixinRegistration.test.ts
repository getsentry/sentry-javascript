/**
 * @vitest-environment jsdom
 */

import { spanToJSON } from '@sentry/core';
import type { MockInstance } from 'vitest';
import { afterEach, beforeEach, describe, expect, it as baseIt, vi } from 'vitest';
import type { App, Ref } from 'vue';
import { createApp, h, nextTick, ref } from 'vue';
import * as Sentry from '../../src';
import type { Options, TracingOptions } from '../../src/types';

const PUBLIC_DSN = 'https://username@domain/123';
const ROOT_SPAN_TIMEOUT_MS = 100;

// Not imported from `@sentry/conventions` to catch changed OPs
const SENTRY_OP_ATTRIBUTE = 'sentry.op';
const SENTRY_ORIGIN_ATTRIBUTE = 'sentry.origin';
const VUE_SPAN_ORIGIN = 'auto.ui.vue';
const UI_MOUNT_SPAN_OP = 'ui.mount';
const UI_RENDER_SPAN_OP = 'ui.render';
const UI_UPDATE_SPAN_OP = 'ui.update';

interface UiSpan {
  name: string;
  op: unknown;
}

/**
 * A two-component app where `<Root>` renders `<ChildComponent>`. Both use render functions, so the
 * tree mounts the same way with and without the Options API.
 */
function createTestApp(): App {
  const child = { name: 'ChildComponent', render: () => h('p', 'child') };
  return createApp({ name: 'RootComponent', render: () => h('div', [h(child)]) });
}

/** Like `createTestApp`, but the root render reads a ref, so mutating it re-renders the root. */
function createReactiveTestApp(): { app: App; message: Ref<string> } {
  const message = ref('initial message');
  const child = { name: 'ChildComponent', render: () => h('p', 'child') };
  const app = createApp({ name: 'RootComponent', render: () => h('div', [h('span', message.value), h(child)]) });
  return { app, message };
}

/** Reads the mixins Vue accepted. `app.mixin()` is a silent no-op without the Options API. */
function getRegisteredMixins(app: App): unknown[] {
  return (app as unknown as { _context: { mixins: unknown[] } })._context.mixins;
}

/** Mounts `app` inside an active root span, because the Vue UI spans use `onlyIfParent`. */
function mountUnderActiveSpan(app: App): HTMLElement {
  const container = document.createElement('div');

  Sentry.startSpan({ name: 'pageload' }, () => {
    app.mount(container);
    vi.advanceTimersByTime(ROOT_SPAN_TIMEOUT_MS + 1);
  });

  return container;
}

interface Fixtures {
  fakeTimers: void;
  app: App;
  /** Vue UI spans that ended, in the order they ended. `initSentry` starts the recording. */
  uiSpans: UiSpan[];
  initSentry: (overrides?: { tracing?: Partial<TracingOptions>; sdk?: Partial<Options> }) => void;
}

// Vitest reads the destructured keys of the first parameter to resolve fixture dependencies, so a
// fixture without dependencies has to spell out an empty pattern.
/* oxlint-disable no-empty-pattern */
const it = baseIt.extend<Fixtures>({
  // The root render span ends on a debounce, so the tests need to drive the clock.
  fakeTimers: [
    async ({}, use) => {
      vi.useFakeTimers();
      await use();
      vi.useRealTimers();
    },
    { auto: true },
  ],

  app: async ({}, use) => {
    await use(createTestApp());
  },

  uiSpans: async ({}, use) => {
    await use([]);
  },

  initSentry: async ({ app, uiSpans }, use) => {
    await use(({ tracing, sdk } = {}) => {
      const client = Sentry.init({
        dsn: PUBLIC_DSN,
        defaultIntegrations: false,
        traceLifecycle: 'static',
        tracesSampleRate: 1,
        app,
        integrations: [Sentry.vueIntegration({ tracingOptions: { timeout: ROOT_SPAN_TIMEOUT_MS, ...tracing } })],
        ...sdk,
      });

      client?.on('spanEnd', span => {
        const { name, attributes } = spanToJSON(span);
        if (attributes?.[SENTRY_ORIGIN_ATTRIBUTE] === VUE_SPAN_ORIGIN) {
          uiSpans.push({ name, op: attributes[SENTRY_OP_ATTRIBUTE] });
        }
      });
    });
  },
});
/* oxlint-enable no-empty-pattern */

describe('tracing mixin registration', () => {
  it('registers the tracing mixin on the app when tracing is enabled', ({ app, initSentry }) => {
    initSentry();

    expect(getRegisteredMixins(app)).toHaveLength(1);
  });

  it('registers no mixin when tracing is disabled', ({ app, initSentry }) => {
    initSentry({ sdk: { tracesSampleRate: undefined } });

    expect(getRegisteredMixins(app)).toEqual([]);
  });

  it('registers the tracing mixin on every app when an array of apps is passed', ({ initSentry }) => {
    const firstApp = createTestApp();
    const secondApp = createTestApp();

    initSentry({ sdk: { app: [firstApp, secondApp] } });

    expect(getRegisteredMixins(firstApp)).toHaveLength(1);
    expect(getRegisteredMixins(secondApp)).toHaveLength(1);
  });

  it('registers the tracing mixin on the constructor passed as `Vue` (Vue 2 setup)', ({ app, initSentry }) => {
    initSentry({ sdk: { app: undefined, Vue: app } });

    expect(getRegisteredMixins(app)).toHaveLength(1);
  });
});

describe('tracing mixin span creation', () => {
  it('creates a root render span and a root component span when trackComponents is off', ({
    app,
    uiSpans,
    initSentry,
  }) => {
    initSentry();

    mountUnderActiveSpan(app);

    expect(uiSpans).toEqual([
      { name: 'Vue <Root>', op: UI_MOUNT_SPAN_OP },
      { name: 'Application Render', op: UI_RENDER_SPAN_OP },
    ]);
  });

  it('creates a component span for a name listed in trackComponents', ({ app, uiSpans, initSentry }) => {
    initSentry({ tracing: { trackComponents: ['ChildComponent'] } });

    mountUnderActiveSpan(app);

    expect(uiSpans).toEqual([
      { name: 'Vue <ChildComponent>', op: UI_MOUNT_SPAN_OP },
      { name: 'Vue <Root>', op: UI_MOUNT_SPAN_OP },
      { name: 'Application Render', op: UI_RENDER_SPAN_OP },
    ]);
  });

  it('creates no component span for a name missing from trackComponents', ({ app, uiSpans, initSentry }) => {
    initSentry({ tracing: { trackComponents: ['SomeOtherComponent'] } });

    mountUnderActiveSpan(app);

    expect(uiSpans).toEqual([
      { name: 'Vue <Root>', op: UI_MOUNT_SPAN_OP },
      { name: 'Application Render', op: UI_RENDER_SPAN_OP },
    ]);
  });

  // The mixin always tracks the root component: `isRootComponent || …` short-circuits before the
  // `trackComponents` filter runs. The next four tests record what that means for each hook, so a
  // mixin replacement can prove which parts it keeps.

  it('tracks the root component for update hooks without trackComponents', async ({ uiSpans, initSentry }) => {
    const { app, message } = createReactiveTestApp();
    initSentry({ tracing: { hooks: ['update'] }, sdk: { app } });
    const container = document.createElement('div');

    await Sentry.startSpan({ name: 'pageload' }, async () => {
      app.mount(container);
      message.value = 'updated message';
      // Works under fake timers: Vue flushes re-renders through microtasks, not timers.
      await nextTick();
      vi.advanceTimersByTime(ROOT_SPAN_TIMEOUT_MS + 1);
    });

    expect(uiSpans).toEqual([
      { name: 'Vue <Root>', op: UI_MOUNT_SPAN_OP },
      { name: 'Vue <Root>', op: UI_UPDATE_SPAN_OP },
      { name: 'Application Render', op: UI_RENDER_SPAN_OP },
    ]);
  });

  // `beforeCreate` fires very early in `app.mount()`, but the mixin creates the root render span
  // first, in the same handler. So the `create` span has a parent and is emitted, as `ui.mount`,
  // which is the op the `create` operation maps to.
  it('tracks the root component for create hooks without trackComponents', ({ app, uiSpans, initSentry }) => {
    initSentry({ tracing: { hooks: ['create'] } });

    mountUnderActiveSpan(app);

    expect(uiSpans).toEqual([
      { name: 'Vue <Root>', op: UI_MOUNT_SPAN_OP }, // create
      { name: 'Vue <Root>', op: UI_MOUNT_SPAN_OP }, // mount (DEFAULT_HOOKS is always merged in)
      { name: 'Application Render', op: UI_RENDER_SPAN_OP },
    ]);
  });

  // `activate` maps to the `activated`/`deactivated` hooks, which Vue only calls inside
  // `<KeepAlive>`. A root component is never kept alive, so `activate` produces no root span.
  it('does not track the root component for activate hooks', ({ app, uiSpans, initSentry }) => {
    initSentry({ tracing: { hooks: ['activate'] } });

    mountUnderActiveSpan(app);

    expect(uiSpans).toEqual([
      { name: 'Vue <Root>', op: UI_MOUNT_SPAN_OP },
      { name: 'Application Render', op: UI_RENDER_SPAN_OP },
    ]);
  });

  // Component spans are keyed by operation, not by span op, so `create` and `mount` each emit their
  // own root span even though both map to `ui.mount`.
  it('emits two root mount spans when both create and mount hooks are enabled', ({ app, uiSpans, initSentry }) => {
    initSentry({ tracing: { hooks: ['create', 'mount'] } });

    mountUnderActiveSpan(app);

    expect(uiSpans).toEqual([
      { name: 'Vue <Root>', op: UI_MOUNT_SPAN_OP }, // create
      { name: 'Vue <Root>', op: UI_MOUNT_SPAN_OP }, // mount
      { name: 'Application Render', op: UI_RENDER_SPAN_OP },
    ]);
  });

  // Vue 3 compiles `app.mixin()` down to a no-op returning the app when the `__VUE_OPTIONS_API__`
  // build flag is `false`. Nuxt 5 sets that flag by default (nuxt/nuxt#35791), so this stub matches
  // what those users run. The real build is covered by the `vue-3 (no Options API)` e2e variant.
  describe('when the Options API is disabled', () => {
    function disableOptionsApi(app: App): void {
      app.mixin = () => app;
    }

    // Drop `.fails` once tracing no longer depends on `app.mixin()`. Vitest then reports this as a
    // failure, which is the signal to delete the modifier.
    it.fails('creates the same UI spans as with the Options API enabled', ({ app, uiSpans, initSentry }) => {
      disableOptionsApi(app);
      initSentry();

      mountUnderActiveSpan(app);

      expect(uiSpans).toEqual([
        { name: 'Vue <Root>', op: UI_MOUNT_SPAN_OP },
        { name: 'Application Render', op: UI_RENDER_SPAN_OP },
      ]);
    });

    it('mounts the component tree', ({ app, initSentry }) => {
      disableOptionsApi(app);
      initSentry();

      const container = mountUnderActiveSpan(app);

      expect(container.innerHTML).toBe('<div><p>child</p></div>');
    });

    it('attaches the Vue error handler', ({ app, initSentry }) => {
      disableOptionsApi(app);

      initSentry();

      expect(app.config.errorHandler).toBeDefined();
    });
  });
});

describe('Options API detection guard', () => {
  const OPTIONS_API_WARNING = expect.stringContaining('The Vue Options API is disabled');

  let consoleWarn: MockInstance<Console['warn']>;

  beforeEach(() => {
    consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarn.mockRestore();
  });

  it('warns when the app dropped the tracing mixin', ({ app, initSentry }) => {
    app.mixin = () => app;

    initSentry();

    expect(consoleWarn).toHaveBeenCalledWith(OPTIONS_API_WARNING);
  });

  it('points a plain Vue app at its bundler config', ({ app, initSentry }) => {
    app.mixin = () => app;

    initSentry();

    expect(consoleWarn).toHaveBeenCalledWith(expect.stringContaining('`define` config of your bundler'));
    expect(consoleWarn).not.toHaveBeenCalledWith(expect.stringContaining('nuxt.config.ts'));
  });

  // `createNuxtApp()` sets `$nuxt` on the Vue app before the `app:created` hook the Nuxt SDK uses.
  it('points a Nuxt app at `nuxt.config.ts`', ({ app, initSentry }) => {
    app.mixin = () => app;
    Object.defineProperty(app, '$nuxt', { get: () => ({}) });

    initSentry();

    expect(consoleWarn).toHaveBeenCalledWith(expect.stringContaining('`vue: { optionsApi: true }`'));
  });

  it('does not warn when the app accepted the tracing mixin', ({ initSentry }) => {
    initSentry();

    expect(consoleWarn).not.toHaveBeenCalledWith(OPTIONS_API_WARNING);
  });

  it('does not warn when tracing is disabled, because no mixin is registered', ({ app, initSentry }) => {
    app.mixin = () => app;

    initSentry({ sdk: { tracesSampleRate: undefined } });

    expect(consoleWarn).not.toHaveBeenCalledWith(OPTIONS_API_WARNING);
  });

  // A Vue 2 constructor has no `_context`, so the guard has nothing to read back and must stay quiet.
  it('does not warn for a Vue 2 constructor', ({ initSentry }) => {
    const vue2Constructor = { config: {}, mixin: () => {} };

    initSentry({ sdk: { app: undefined, Vue: vue2Constructor } });

    expect(consoleWarn).not.toHaveBeenCalledWith(OPTIONS_API_WARNING);
  });
});
