import { Transaction, TransactionContext } from '@sentry/types';
import { addInstrumentationHandler, getGlobalObject, logger } from '@sentry/utils';

const global = getGlobalObject<Window>();

const PATHNAME_PARAMETER_PATTERNS = {
  number: /^\d+$/,
  'sha1-hash': /^[0-9a-f]{40}$/i,
  'md-hash': /^[0-9a-f]{32}$/i,
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
};

/**
 * Tries to parameterize a provided pathname based on some heuristics.
 *
 * @param pathname - A pathname, usually obtained via `window.location.pathname`.
 * @returns a parameterized version of the pathname alongside the values behind the parameters
 */
function extractPathnameParametersWithHeuristics(pathname: string): {
  parameterizedPathname: string;
  pathnameParameterValues: Record<string, string>;
  hasParameters: boolean;
} {
  /**
   * Keeps track of the number of occurences of each pattern in the provided pathname.
   */
  const patternCounts: Partial<Record<keyof typeof PATHNAME_PARAMETER_PATTERNS, number>> = {};

  /**
   * Keeps track of what found parameters in the URL evaluate to, e.g:
   * { "uuid-1": "2778216e-b40c-46...", "uuid-2": "86024957-1789-47ec-be7..." }
   */
  const pathnameParameterValues: Record<string, string> = {};

  const parameterizedPathname = pathname
    .split('/')
    .map(originalPart => {
      for (const patternName of Object.keys(
        PATHNAME_PARAMETER_PATTERNS,
      ) as (keyof typeof PATHNAME_PARAMETER_PATTERNS)[]) {
        if (originalPart.match(PATHNAME_PARAMETER_PATTERNS[patternName])) {
          // Set patternCounts to 1 if it hasn't been set yet
          patternCounts[patternName] = (patternCounts[patternName] || 0) + 1;

          // Record what the parameter evaluated to
          pathnameParameterValues[`${patternName}-${patternCounts[patternName]}`] = originalPart;

          return `{${patternName}}`;
        }
      }

      return originalPart;
    })
    .join('/');

  return {
    parameterizedPathname,
    pathnameParameterValues,
    hasParameters: Object.keys(pathnameParameterValues).length > 0,
  };
}

/**
 * Default function implementing pageload and navigation transactions
 */
export function instrumentRoutingWithDefaults<T extends Transaction>(
  customStartTransaction: (context: TransactionContext) => T | undefined,
  startTransactionOnPageLoad: boolean = true,
  startTransactionOnLocationChange: boolean = true,
): void {
  if (!global || !global.location) {
    __DEBUG_BUILD__ && logger.warn('Could not initialize routing instrumentation due to invalid location');
    return;
  }

  let startingUrl: string | undefined = global.location.href;

  let activeTransaction: T | undefined;
  if (startTransactionOnPageLoad) {
    const { parameterizedPathname, pathnameParameterValues, hasParameters } = extractPathnameParametersWithHeuristics(
      global.location.pathname,
    );

    activeTransaction = customStartTransaction({
      name: parameterizedPathname,
      op: 'pageload',
      data: hasParameters
        ? {
            params: pathnameParameterValues,
            originalPathname: global.location.pathname,
          }
        : undefined,
      // For now, we will not define the transaction source as 'route' - even when we find a parameterizable
      // pattern in the URL. Reason for that is, that we might run into URLs which both have parts that we identify
      // as parameters, as well as parts that we didn't identify as such, even though they would be.
      // An example: 'https://sentry.io/organization/some-random-org/user/14'
      // Here we would identify '14' as parameter but not 'some-random-org'. To be on the safe side regarding
      // transaction name cardinality, we still fall back to the source being 'url'.
      metadata: { source: 'url' },
    });
  }

  if (startTransactionOnLocationChange) {
    addInstrumentationHandler('history', ({ to, from }: { to: string; from?: string }) => {
      /**
       * This early return is there to account for some cases where a navigation transaction starts right after
       * long-running pageload. We make sure that if `from` is undefined and a valid `startingURL` exists, we don't
       * create an uneccessary navigation transaction.
       *
       * This was hard to duplicate, but this behavior stopped as soon as this fix was applied. This issue might also
       * only be caused in certain development environments where the usage of a hot module reloader is causing
       * errors.
       */
      if (from === undefined && startingUrl && startingUrl.indexOf(to) !== -1) {
        startingUrl = undefined;
        return;
      }

      if (from !== to) {
        startingUrl = undefined;
        if (activeTransaction) {
          __DEBUG_BUILD__ && logger.log(`[Tracing] Finishing current transaction with op: ${activeTransaction.op}`);
          // If there's an open transaction on the scope, we need to finish it before creating an new one.
          activeTransaction.finish();
        }

        const { parameterizedPathname, pathnameParameterValues, hasParameters } =
          extractPathnameParametersWithHeuristics(global.location.pathname);

        activeTransaction = customStartTransaction({
          name: parameterizedPathname,
          op: 'navigation',
          data: hasParameters
            ? {
                params: pathnameParameterValues,
                originalPathname: global.location.pathname,
              }
            : undefined,
          // For now, we will not define the transaction source as 'route' - even when we find a parameterizable
          // pattern in the URL. Reason for that is, that we might run into URLs which both have parts that we identify
          // as parameters, as well as parts that we didn't identify as such, even though they would be.
          // An example: 'https://sentry.io/organization/some-random-org/user/14'
          // Here we would identify '14' as parameter but not 'some-random-org'. To be on the safe side regarding
          // transaction name cardinality, we still fall back to the source being 'url'.
          metadata: { source: 'url' },
        });
      }
    });
  }
}
