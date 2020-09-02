import { getActiveDomain, getMainCarrier, Hub } from '@sentry/hub';
import { CustomSampleContext, DefaultSampleContext, SampleContext, TransactionContext } from '@sentry/types';
import {
  dynamicRequire,
  extractNodeRequestData,
  getGlobalObject,
  isInstanceOf,
  isNodeEnv,
  logger,
} from '@sentry/utils';

import { registerErrorInstrumentation } from './errors';
import { IdleTransaction } from './idletransaction';
import { Transaction } from './transaction';
import { hasTracingEnabled } from './utils';

/** Returns all trace headers that are currently on the top scope. */
function traceHeaders(this: Hub): { [key: string]: string } {
  const scope = this.getScope();
  if (scope) {
    const span = scope.getSpan();
    if (span) {
      return {
        'sentry-trace': span.toTraceparent(),
      };
    }
  }
  return {};
}

/**
 * Use sample rate along with a random number generator to make a sampling decision, which all child spans and child
 * transactions inherit.
 *
 * Sample rate is set in SDK config, either as a constant (`tracesSampleRate`) or a function to compute the rate
 * (`tracesSampler`).
 *
 * Called every time a transaction is created. Only transactions which emerge with a `sampled` value of `true` will be
 * sent to Sentry.
 *
 * Mutates the given Transaction object and then returns the mutated object.
 */
function sample<T extends Transaction>(hub: Hub, transaction: T, sampleContext: SampleContext = {}): T {
  const client = hub.getClient();
  const options = (client && client.getOptions()) || {};

  // nothing to do if there's no client or if tracing is disabled
  if (!client || !hasTracingEnabled(options)) {
    transaction.sampled = false;
    return transaction;
  }

  // we have to test for a pre-existsing sampling decision, in case this transaction is a child transaction and has
  // inherited its parent's decision
  if (transaction.sampled === undefined) {
    // we would have bailed at the beginning if neither `tracesSampler` nor `tracesSampleRate` were defined, so one of
    // these should work; prefer the hook if so
    const sampleRate =
      typeof options.tracesSampler === 'function' ? options.tracesSampler(sampleContext) : options.tracesSampleRate;

    // since this is coming from the user, who knows what we might get
    if (!isValidSampleRate(sampleRate)) {
      logger.warn(`[Tracing] Discarding trace because of invalid sample rate.`);
      transaction.sampled = false;
      return transaction;
    }

    // if the function returned 0, or if the sample rate is set to 0, it's a sign the transaction should be dropped
    if (!sampleRate) {
      logger.log(
        `[Tracing] Discarding trace because ${
          typeof options.tracesSampler === 'function' ? 'tracesSampler returned 0' : 'tracesSampleRate is set to 0'
        }`,
      );
      transaction.sampled = false;
      return transaction;
    }

    // now we roll the dice (Math.random is inclusive of 0, but not of 1, so strict < is safe here)
    transaction.sampled = Math.random() < sampleRate;

    // if we're not going to keep it, we're done
    if (!transaction.sampled) {
      logger.log(
        `[Tracing] Discarding trace because it's not included in the random sample (sampling rate = ${sampleRate})`,
      );
      return transaction;
    }
  }

  // at this point we know we're keeping the transaction, whether because of an inherited decision or because it got
  // lucky with the dice roll
  const experimentsOptions = options._experiments || {};
  transaction.initSpanRecorder(experimentsOptions.maxSpans as number);

  return transaction;
}
/**
 * Gets the correct context to pass to the tracesSampler, based on the environment (i.e., which SDK is being used)
 *
 * @returns The default sample context
 */
function getDefaultSampleContext(): DefaultSampleContext {
  const defaultSampleContext: DefaultSampleContext = {};

  if (isNodeEnv()) {
    const domain = getActiveDomain();

    if (domain) {
      // for all node servers that we currently support, we store the incoming request object (which is an instance of
      // http.IncomingMessage) on the domain

      // the domain members are stored as an array, so our only way to find the request is to iterate through the array
      // and compare types

      const nodeHttpModule = dynamicRequire(module, 'http');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const requestType = nodeHttpModule.IncomingMessage;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const request = domain.members.find((member: any) => isInstanceOf(member, requestType));

      if (request) {
        defaultSampleContext.request = extractNodeRequestData(request);
      }
    }
  }

  // we must be in browser-js (or some derivative thereof)
  else {
    // we use `getGlobalObject()` rather than `window` since service workers also have a `location` property on `self`
    const globalObject = getGlobalObject<WindowOrWorkerGlobalScope>();

    if ('location' in globalObject) {
      // we take a copy of the location object rather than just a reference to it in case there's a navigation or
      // redirect in the instant between when the transaction starts and when the sampler is called
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      defaultSampleContext.location = { ...(globalObject as any).location };
    }
  }

  return defaultSampleContext;
}

/**
 * Checks the given sample rate to make sure it is valid (a number between 0 and 1).
 */
function isValidSampleRate(rate: unknown): boolean {
  if (!(typeof rate === 'number')) {
    logger.warn(
      `[Tracing] Given sample rate is invalid. Sample rate must be a number between 0 and 1. Got ${JSON.stringify(
        rate,
      )} of type ${JSON.stringify(typeof rate)}.`,
    );
    return false;
  }
  if (rate < 0 || rate > 1) {
    logger.warn(`[Tracing] Given sample rate is invalid. Sample rate must be between 0 and 1. Got ${rate}.`);
    return false;
  }
  return true;
}

/**
 * Creates a new transaction and adds a sampling decision if it doesn't yet have one.
 *
 * The Hub.startTransaction method delegates to this method to do its work, passing the Hub instance in as `this`.
 * Exists as a separate function so that it can be injected into the class as an "extension method."
 *
 * @returns The new transaction
 *
 * @see {@link Hub.startTransaction}
 */
function _startTransaction(
  this: Hub,
  context: TransactionContext,
  customSampleContext?: CustomSampleContext,
): Transaction {
  const transaction = new Transaction(context, this);
  return sample(this, transaction, { ...getDefaultSampleContext(), ...customSampleContext });
}

/**
 * Create new idle transaction.
 */
export function startIdleTransaction(
  hub: Hub,
  context: TransactionContext,
  idleTimeout?: number,
  onScope?: boolean,
): IdleTransaction {
  const transaction = new IdleTransaction(context, hub, idleTimeout, onScope);
  return sample(hub, transaction, getDefaultSampleContext());
}

/**
 * @private
 */
export function _addTracingExtensions(): void {
  const carrier = getMainCarrier();
  if (carrier.__SENTRY__) {
    carrier.__SENTRY__.extensions = carrier.__SENTRY__.extensions || {};
    if (!carrier.__SENTRY__.extensions.startTransaction) {
      carrier.__SENTRY__.extensions.startTransaction = _startTransaction;
    }
    if (!carrier.__SENTRY__.extensions.traceHeaders) {
      carrier.__SENTRY__.extensions.traceHeaders = traceHeaders;
    }
  }
}

/**
 * This patches the global object and injects the Tracing extensions methods
 */
export function addExtensionMethods(): void {
  _addTracingExtensions();

  // If an error happens globally, we should make sure transaction status is set to error.
  registerErrorInstrumentation();
}
