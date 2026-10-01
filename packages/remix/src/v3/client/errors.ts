import { captureException } from '@sentry/browser';
import { tracingChannel } from './diagnosticsChannelShim';

/** The `AppRuntime` returned by `run()` from `remix/ui`, an EventTarget emitting `error`. */
export interface AppRuntimeLike {
  addEventListener(type: 'error', listener: (event: Event) => void): void;
}

const MECHANISM_TYPE = 'auto.ui.remix_v3';

// The channel orchestrion will inject into `@remix-run/ui`'s `run()` once the asset server transforms
// browser modules. Nothing publishes to it yet, so the subscription below is dormant. The name is
// written out because the channel names live in `@sentry/server-utils`, which must not reach the
// browser.
const UI_RUN_CHANNEL = 'orchestrion:@remix-run/ui:run';

const attached = new WeakSet<object>();

// `subscribe()` takes a fresh object literal and the channel keys handlers by identity, so a second
// call would add a second handler rather than replace the first.
let subscribed = false;

/**
 * Report a Remix 3 client runtime's errors to Sentry.
 *
 * The runtime sends every render, scheduler, frame and hydration error to the event target `run()`
 * returns. Dispatching an event does not rethrow, so `window.onerror` and `unhandledrejection` never
 * see them, and without this listener the SDK sees nothing from the component layer.
 *
 * Called by {@link instrumentClientRuntime}, and exported for apps that do not serve their browser
 * modules through an instrumented asset server.
 */
export function captureRuntimeErrors(app: AppRuntimeLike): void {
  if (attached.has(app)) {
    return;
  }
  attached.add(app);

  app.addEventListener('error', event => {
    captureException(readComponentError(event), {
      mechanism: { handled: false, type: MECHANISM_TYPE },
    });
  });
}

/**
 * Attach to every `run()` call automatically, so the app never has to call `captureRuntimeErrors()`
 * itself. A no-op when the browser module was not transformed, because the channel never fires.
 */
export function instrumentClientRuntime(): void {
  if (subscribed) {
    return;
  }
  subscribed = true;

  tracingChannel(UI_RUN_CHANNEL).subscribe({
    end(context) {
      const app = (context as { result?: unknown }).result;
      if (isAppRuntime(app)) {
        captureRuntimeErrors(app);
      }
    },
  });
}

function isAppRuntime(value: unknown): value is AppRuntimeLike {
  return typeof (value as AppRuntimeLike | undefined)?.addEventListener === 'function';
}

// The runtime puts the thrown value on `error`, and it may be any value, not just an `Error`.
function readComponentError(event: Event): unknown {
  const error = (event as ErrorEvent).error;
  return error !== undefined ? error : event;
}
