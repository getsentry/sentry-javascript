import { addBreadcrumb } from '../breadcrumbs';
import { getClient } from '../currentScopes';
import { addConsoleInstrumentationHandler } from '../instrument/console';
import { defineIntegration } from '../integration';
import type { ConsoleLevel } from '../types-hoist/instrument';
import { CONSOLE_LEVELS } from '../utils/debug-logger';
import { severityLevelFromString } from '../utils/severity';
import { safeJoin } from '../utils/string';
import { GLOBAL_OBJ } from '../utils/worldwide';

interface ConsoleIntegrationOptions {
  levels: ConsoleLevel[];
}

type GlobalObjectWithUtil = typeof GLOBAL_OBJ & {
  util: {
    format: (...args: unknown[]) => string;
  };
};

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

const INTEGRATION_NAME = 'Console';

/**
 * Captures calls to the `console` API as breadcrumbs in Sentry.
 *
 * By default the integration instruments `console.debug`, `console.info`, `console.warn`, `console.error`,
 * `console.log`, `console.trace`, and `console.assert`. You can use the `levels` option to customize which
 * levels are captured.
 *
 * @example
 *
 * ```js
 * Sentry.init({
 *   integrations: [Sentry.consoleIntegration({ levels: ['error', 'warn'] })],
 * });
 * ```
 */
export const consoleIntegration = defineIntegration((options: Partial<ConsoleIntegrationOptions> = {}) => {
  const levels = new Set(options.levels || CONSOLE_LEVELS);

  return {
    name: INTEGRATION_NAME,
    setup(client) {
      // Wrap client in WeakRef via a separate function to avoid retaining it
      // in the handler closure. See _makeWeakClientRef for details on why
      // this must be a separate function scope.
      const clientRef = _makeWeakClientRef(client);

      // If WeakRef is not available (e.g., Cloudflare Workers without enable_weak_ref flag),
      // skip adding handlers to prevent memory leaks in serverless environments
      // where a new client is created per request.
      if (!clientRef) {
        return;
      }

      addConsoleInstrumentationHandler(({ args, level }) => {
        if (getClient() !== clientRef.deref() || !levels.has(level)) {
          return;
        }

        addConsoleBreadcrumb(level, args);
      });
    },
  };
});

/**
 * Capture a console breadcrumb.
 *
 * Exported just for tests.
 */
export function addConsoleBreadcrumb(level: ConsoleLevel, args: unknown[]): void {
  const breadcrumb = {
    category: 'console',
    data: {
      arguments: args,
      logger: 'console',
    },
    level: severityLevelFromString(level),
    message: formatConsoleArgs(args),
  };

  if (level === 'assert') {
    if (args[0] === false) {
      const assertionArgs = args.slice(1);
      breadcrumb.message =
        assertionArgs.length > 0 ? `Assertion failed: ${formatConsoleArgs(assertionArgs)}` : 'Assertion failed';
      breadcrumb.data.arguments = assertionArgs;
    } else {
      // Don't capture a breadcrumb for passed assertions
      return;
    }
  }

  addBreadcrumb(breadcrumb, {
    input: args,
    level,
  });
}

function formatConsoleArgs(values: unknown[]): string {
  return 'util' in GLOBAL_OBJ && typeof (GLOBAL_OBJ as GlobalObjectWithUtil).util.format === 'function'
    ? (GLOBAL_OBJ as GlobalObjectWithUtil).util.format(...values)
    : safeJoin(values, ' ');
}
