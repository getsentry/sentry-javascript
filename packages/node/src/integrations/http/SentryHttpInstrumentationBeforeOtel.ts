import { VERSION } from '@opentelemetry/core';
import { InstrumentationBase, InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation';
import { flush, logger, vercelWaitUntil } from '@sentry/core';
import type * as http from 'node:http';
import type * as https from 'node:https';
import { DEBUG_BUILD } from '../../debug-build';
import { stealthWrap } from './utils';

type Http = typeof http;
type Https = typeof https;

// The reason this "before OTEL" integration even exists is due to timing reasons. We need to be able to register a
// `res.on('close')` handler **after** OTEL registers its own handler (which it uses to end spans), so that we can do
// something (ie. flush) after OTEL has ended a span for a request. If you think about it like an onion:
//
// (Sentry after OTEL instrumentation
//   (OTEL instrumentation
//     (Sentry before OTEL instrumentation
//       (orig HTTP request handler))))
//
// registering an instrumentation before OTEL allows us to do this for incoming requests.

/**
 * A Sentry specific http instrumentation that is applied before the otel instrumentation.
 */
export class SentryHttpInstrumentationBeforeOtel extends InstrumentationBase {
  public constructor() {
    super('@sentry/instrumentation-http-before-otel', VERSION, {});
  }

  // eslint-disable-next-line jsdoc/require-jsdoc
  public init(): [InstrumentationNodeModuleDefinition, InstrumentationNodeModuleDefinition] {
    return [this._getHttpsInstrumentation(), this._getHttpInstrumentation()];
  }

  /** Get the instrumentation for the http module. */
  private _getHttpInstrumentation(): InstrumentationNodeModuleDefinition {
    return new InstrumentationNodeModuleDefinition('http', ['*'], (moduleExports: Http): Http => {
      // Patch incoming requests
      stealthWrap(moduleExports.Server.prototype, 'emit', this._getPatchIncomingRequestFunction());

      return moduleExports;
    });
  }

  /** Get the instrumentation for the https module. */
  private _getHttpsInstrumentation(): InstrumentationNodeModuleDefinition {
    return new InstrumentationNodeModuleDefinition('https', ['*'], (moduleExports: Https): Https => {
      // Patch incoming requests
      stealthWrap(moduleExports.Server.prototype, 'emit', this._getPatchIncomingRequestFunction());

      return moduleExports;
    });
  }

  /**
   * Patch the incoming request function for request isolation.
   */
  private _getPatchIncomingRequestFunction(): (
    original: (event: string, ...args: unknown[]) => boolean,
  ) => (this: unknown, event: string, ...args: unknown[]) => boolean {
    return (
      original: (event: string, ...args: unknown[]) => boolean,
    ): ((this: unknown, event: string, ...args: unknown[]) => boolean) => {
      return function incomingRequest(this: unknown, event: string, ...args: unknown[]): boolean {
        // Only traces request events
        if (event !== 'request') {
          return original.apply(this, [event, ...args]);
        }

        const response = args[1] as http.OutgoingMessage;

        patchResponseToFlushOnServerlessPlatforms(response);

        return original.apply(this, [event, ...args]);
      };
    };
  }
}

function patchResponseToFlushOnServerlessPlatforms(res: http.OutgoingMessage): void {
  // Freely extend this function with other platforms if necessary
  if (process.env.VERCEL) {
    let markOnEndDone = (): void => undefined;
    const onEndDonePromise = new Promise<void>(res => {
      markOnEndDone = res;
    });

    res.on('close', () => {
      markOnEndDone();
    });

    // eslint-disable-next-line @typescript-eslint/unbound-method
    res.end = new Proxy(res.end, {
      apply(target, thisArg, argArray) {
        vercelWaitUntil(
          new Promise<void>(finishWaitUntil => {
            // Define a timeout that unblocks the lambda just to be safe so we're not indefinitely keeping it alive, exploding server bills
            const timeout = setTimeout(() => {
              finishWaitUntil();
            }, 2000);

            onEndDonePromise
              .then(() => {
                DEBUG_BUILD && logger.log('Flushing events before Vercel Lambda freeze');
                return flush(2000);
              })
              .then(
                () => {
                  clearTimeout(timeout);
                  finishWaitUntil();
                },
                e => {
                  clearTimeout(timeout);
                  DEBUG_BUILD && logger.log('Error while flushing events for Vercel:\n', e);
                  finishWaitUntil();
                },
              );
          }),
        );

        return target.apply(thisArg, argArray);
      },
    });
  }
}
