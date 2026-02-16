import { getClient, withScope } from '../currentScopes';
import { captureException } from '../exports';
import { addConsoleInstrumentationHandler } from '../instrument/console';
import { defineIntegration } from '../integration';
import type { CaptureContext } from '../scope';
import type { IntegrationFn } from '../types-hoist/integration';
import { CONSOLE_LEVELS } from '../utils/debug-logger';
import { addExceptionMechanism } from '../utils/misc';
import { severityLevelFromString } from '../utils/severity';
import { safeJoin } from '../utils/string';
import { GLOBAL_OBJ } from '../utils/worldwide';

type WeakClientRef = { deref: () => object | undefined };

/**
 * Wraps a client in a WeakRef if available.
 * Returns undefined if WeakRef is not available, indicating the caller should
 * skip instrumentation to avoid memory leaks in serverless/edge environments.
 *
 * IMPORTANT: This MUST be a separate function from the handler closure scope.
 * V8 creates a shared closure context for all inner functions in a scope. If we
 * had a WeakRef fallback `{ deref: () => client }` in the same scope as the handler,
 * V8 would capture `client` in the shared context, defeating the WeakRef's purpose.
 */
function _makeWeakClientRef(client: object): WeakClientRef | undefined {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
  const weakRefImpl = (GLOBAL_OBJ as any).WeakRef;
  if (typeof weakRefImpl === 'function') {
    return new weakRefImpl(client) as WeakClientRef;
  }
  // Return undefined to indicate WeakRef is not available
  // The caller should skip adding handlers to prevent memory leaks
  return undefined;
}

interface CaptureConsoleOptions {
  levels?: string[];

  /**
   * By default, Sentry will mark captured console messages as handled.
   * Set this to `false` if you want to mark them as unhandled instead.
   *
   * @default true
   */
  handled?: boolean;
}

const INTEGRATION_NAME = 'CaptureConsole';

const _captureConsoleIntegration = ((options: CaptureConsoleOptions = {}) => {
  const levels = options.levels || CONSOLE_LEVELS;
  const handled = options.handled ?? true;

  return {
    name: INTEGRATION_NAME,
    setup(client) {
      if (!('console' in GLOBAL_OBJ)) {
        return;
      }

      // Wrap client in WeakRef via a separate function to avoid retaining it
      // in the handler closure. See _makeWeakClientRef in console.ts for details
      // on why this must be a separate function scope.
      const clientRef = _makeWeakClientRef(client);

      // If WeakRef is not available (e.g., Cloudflare Workers without enable_weak_ref flag),
      // skip adding handlers to prevent memory leaks in serverless environments
      // where a new client is created per request.
      if (!clientRef) {
        return;
      }

      addConsoleInstrumentationHandler(({ args, level }) => {
        if (getClient() !== clientRef.deref() || !levels.includes(level)) {
          return;
        }

        consoleHandler(args, level, handled);
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Send Console API calls as Sentry Events.
 */
export const captureConsoleIntegration = defineIntegration(_captureConsoleIntegration);

function consoleHandler(args: unknown[], level: string, handled: boolean): void {
  const severityLevel = severityLevelFromString(level);

  /*
    We create this error here already to attach a stack trace to captured messages,
    if users set `attachStackTrace` to `true` in Sentry.init.
    We do this here already because we want to minimize the number of Sentry SDK stack frames
    within the error. Technically, Client.captureMessage will also do it but this happens several
    stack frames deeper.
  */
  const syntheticException = new Error();

  const captureContext: CaptureContext = {
    level: severityLevelFromString(level),
    extra: {
      arguments: args,
    },
  };

  withScope(scope => {
    scope.addEventProcessor(event => {
      event.logger = 'console';

      addExceptionMechanism(event, {
        handled,
        type: 'auto.core.capture_console',
      });

      return event;
    });

    if (level === 'assert') {
      if (!args[0]) {
        const message = `Assertion failed: ${safeJoin(args.slice(1), ' ') || 'console.assert'}`;
        scope.setExtra('arguments', args.slice(1));
        scope.captureMessage(message, severityLevel, { captureContext, syntheticException });
      }
      return;
    }

    const error = args.find(arg => arg instanceof Error);
    if (error) {
      captureException(error, captureContext);
      return;
    }

    const message = safeJoin(args, ' ');
    scope.captureMessage(message, severityLevel, { captureContext, syntheticException });
  });
}
