/* eslint-disable max-lines */
import type { Hub, IdleTransaction } from '@sentry/core';
import { getClient, getCurrentScope } from '@sentry/core';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  TRACING_DEFAULTS,
  addTracingExtensions,
  getActiveTransaction,
  startIdleTransaction,
} from '@sentry/core';
import type { EventProcessor, Integration, Transaction, TransactionContext, TransactionSource } from '@sentry/types';
import { getDomElement, logger, propagationContextFromHeaders } from '@sentry/utils';

import { DEBUG_BUILD } from '../common/debug-build';
import { registerBackgroundTabDetection } from './backgroundtab';
import { addPerformanceInstrumentationHandler } from './instrument';
import {
  addPerformanceEntries,
  startTrackingINP,
  startTrackingInteractions,
  startTrackingLongTasks,
  startTrackingWebVitals,
} from './metrics';
import type { RequestInstrumentationOptions } from './request';
import { defaultRequestInstrumentationOptions, instrumentOutgoingRequests } from './request';
import { instrumentRoutingWithDefaults } from './router';
import { WINDOW } from './types';
import type { InteractionRouteNameMapping } from './web-vitals/types';

export const BROWSER_TRACING_INTEGRATION_ID = 'BrowserTracing';

/** Options for Browser Tracing integration */
export interface BrowserTracingOptions extends RequestInstrumentationOptions {
  /**
   * The time to wait in ms until the transaction will be finished during an idle state. An idle state is defined
   * by a moment where there are no in-progress spans.
   *
   * The transaction will use the end timestamp of the last finished span as the endtime for the transaction.
   * If there are still active spans when this the `idleTimeout` is set, the `idleTimeout` will get reset.
   * Time is in ms.
   *
   * Default: 1000
   */
  idleTimeout: number;

  /**
   * The max duration for a transaction. If a transaction duration hits the `finalTimeout` value, it
   * will be finished.
   * Time is in ms.
   *
   * Default: 30000
   */
  finalTimeout: number;

  /**
   * The heartbeat interval. If no new spans are started or open spans are finished within 3 heartbeats,
   * the transaction will be finished.
   * Time is in ms.
   *
   * Default: 5000
   */
  heartbeatInterval: number;

  /**
   * Flag to enable/disable creation of `navigation` transaction on history changes.
   *
   * Default: true
   */
  startTransactionOnLocationChange: boolean;

  /**
   * Flag to enable/disable creation of `pageload` transaction on first pageload.
   *
   * Default: true
   */
  startTransactionOnPageLoad: boolean;

  /**
   * Flag Transactions where tabs moved to background with "cancelled". Browser background tab timing is
   * not suited towards doing precise measurements of operations. By default, we recommend that this option
   * be enabled as background transactions can mess up your statistics in nondeterministic ways.
   *
   * Default: true
   */
  markBackgroundTransactions: boolean;

  /**
   * If true, Sentry will capture long tasks and add them to the corresponding transaction.
   *
   * Default: true
   */
  enableLongTask: boolean;

  /**
   * If true, Sentry will capture INP web vitals as standalone spans .
   *
   * Default: false
   */
  enableInp: boolean;

  /**
   * _metricOptions allows the user to send options to change how metrics are collected.
   *
   * _metricOptions is currently experimental.
   *
   * Default: undefined
   */
  _metricOptions?: Partial<{
    /**
     * @deprecated This property no longer has any effect and will be removed in v8.
     */
    _reportAllChanges: boolean;
  }>;

  /**
   * _experiments allows the user to send options to define how this integration works.
   * Note that the `enableLongTask` options is deprecated in favor of the option at the top level, and will be removed in v8.
   *
   * TODO (v8): Remove enableLongTask
   *
   * Default: undefined
   */
  _experiments: Partial<{
    enableLongTask: boolean;
    enableInteractions: boolean;
    onStartRouteTransaction: (t: Transaction | undefined, ctx: TransactionContext, getCurrentHub: () => Hub) => void;
  }>;

  /**
   * beforeNavigate is called before a pageload/navigation transaction is created and allows users to modify transaction
   * context data, or drop the transaction entirely (by setting `sampled = false` in the context).
   *
   * Note: For legacy reasons, transactions can also be dropped by returning `undefined`.
   *
   * @param context: The context data which will be passed to `startTransaction` by default
   *
   * @returns A (potentially) modified context object, with `sampled = false` if the transaction should be dropped.
   */
  beforeNavigate?(this: void, context: TransactionContext): TransactionContext | undefined;

  /**
   * Instrumentation that creates routing change transactions. By default creates
   * pageload and navigation transactions.
   */
  routingInstrumentation<T extends Transaction>(
    this: void,
    customStartTransaction: (context: TransactionContext) => T | undefined,
    startTransactionOnPageLoad?: boolean,
    startTransactionOnLocationChange?: boolean,
  ): void;
}

const DEFAULT_BROWSER_TRACING_OPTIONS: BrowserTracingOptions = {
  ...TRACING_DEFAULTS,
  markBackgroundTransactions: true,
  routingInstrumentation: instrumentRoutingWithDefaults,
  startTransactionOnLocationChange: true,
  startTransactionOnPageLoad: true,
  enableLongTask: true,
  enableInp: false,
  _experiments: {},
  ...defaultRequestInstrumentationOptions,
};

/** We store up to 10 interaction candidates max to cap memory usage. This is the same cap as getINP from web-vitals */
const MAX_INTERACTIONS = 10;

/**
 * The Browser Tracing integration automatically instruments browser pageload/navigation
 * actions as transactions, and captures requests, metrics and errors as spans.
 *
 * The integration can be configured with a variety of options, and can be extended to use
 * any routing library. This integration uses {@see IdleTransaction} to create transactions.
 *
 * @deprecated Use `browserTracingIntegration()` instead.
 */
export class BrowserTracing implements Integration {
  // This class currently doesn't have a static `id` field like the other integration classes, because it prevented
  // @sentry/tracing from being treeshaken. Tree shakers do not like static fields, because they behave like side effects.
  // TODO: Come up with a better plan, than using static fields on integration classes, and use that plan on all
  // integrations.

  /** Browser Tracing integration options */
  public options: BrowserTracingOptions;

  /**
   * @inheritDoc
   */
  public name: string;

  private _getCurrentHub?: () => Hub;

  private _collectWebVitals: () => void;

  private _hasSetTracePropagationTargets: boolean;
  private _interactionIdToRouteNameMapping: InteractionRouteNameMapping;
  private _latestRoute: {
    name: string | undefined;
    context: TransactionContext | undefined;
  };

  public constructor(_options?: Partial<BrowserTracingOptions>) {
    this.name = BROWSER_TRACING_INTEGRATION_ID;
    this._hasSetTracePropagationTargets = false;

    addTracingExtensions();

    if (DEBUG_BUILD) {
      this._hasSetTracePropagationTargets = !!(
        _options &&
        // eslint-disable-next-line deprecation/deprecation
        (_options.tracePropagationTargets || _options.tracingOrigins)
      );
    }

    this.options = {
      ...DEFAULT_BROWSER_TRACING_OPTIONS,
      ..._options,
    };

    // Special case: enableLongTask can be set in _experiments
    // TODO (v8): Remove this in v8
    if (this.options._experiments.enableLongTask !== undefined) {
      this.options.enableLongTask = this.options._experiments.enableLongTask;
    }

    // TODO (v8): remove this block after tracingOrigins is removed
    // Set tracePropagationTargets to tracingOrigins if specified by the user
    // In case both are specified, tracePropagationTargets takes precedence
    // eslint-disable-next-line deprecation/deprecation
    if (_options && !_options.tracePropagationTargets && _options.tracingOrigins) {
      // eslint-disable-next-line deprecation/deprecation
      this.options.tracePropagationTargets = _options.tracingOrigins;
    }

    this._collectWebVitals = startTrackingWebVitals();
    /** Stores a mapping of interactionIds from PerformanceEventTimings to the origin interaction path */
    this._interactionIdToRouteNameMapping = {};

    if (this.options.enableInp) {
      startTrackingINP(this._interactionIdToRouteNameMapping);
    }
    if (this.options.enableLongTask) {
      startTrackingLongTasks();
    }
    if (this.options._experiments.enableInteractions) {
      startTrackingInteractions();
    }

    this._latestRoute = {
      name: undefined,
      context: undefined,
    };
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    this._getCurrentHub = getCurrentHub;
    const hub = getCurrentHub();
    // eslint-disable-next-line deprecation/deprecation
    const client = hub.getClient();
    const clientOptions = client && client.getOptions();

    const {
      routingInstrumentation: instrumentRouting,
      startTransactionOnLocationChange,
      startTransactionOnPageLoad,
      markBackgroundTransactions,
      traceFetch,
      traceXHR,
      shouldCreateSpanForRequest,
      enableHTTPTimings,
      _experiments,
    } = this.options;

    const clientOptionsTracePropagationTargets = clientOptions && clientOptions.tracePropagationTargets;
    // There are three ways to configure tracePropagationTargets:
    // 1. via top level client option `tracePropagationTargets`
    // 2. via BrowserTracing option `tracePropagationTargets`
    // 3. via BrowserTracing option `tracingOrigins` (deprecated)
    //
    // To avoid confusion, favour top level client option `tracePropagationTargets`, and fallback to
    // BrowserTracing option `tracePropagationTargets` and then `tracingOrigins` (deprecated).
    // This is done as it minimizes bundle size (we don't have to have undefined checks).
    //
    // If both 1 and either one of 2 or 3 are set (from above), we log out a warning.
    // eslint-disable-next-line deprecation/deprecation
    const tracePropagationTargets = clientOptionsTracePropagationTargets || this.options.tracePropagationTargets;
    if (DEBUG_BUILD && this._hasSetTracePropagationTargets && clientOptionsTracePropagationTargets) {
      logger.warn(
        '[Tracing] The `tracePropagationTargets` option was set in the BrowserTracing integration and top level `Sentry.init`. The top level `Sentry.init` value is being used.',
      );
    }

    instrumentRouting(
      (context: TransactionContext) => {
        const transaction = this._createRouteTransaction(context);

        this.options._experiments.onStartRouteTransaction &&
          this.options._experiments.onStartRouteTransaction(transaction, context, getCurrentHub);

        return transaction;
      },
      startTransactionOnPageLoad,
      startTransactionOnLocationChange,
    );

    if (markBackgroundTransactions) {
      registerBackgroundTabDetection();
    }

    if (_experiments.enableInteractions) {
      this._registerInteractionListener();
    }

    if (this.options.enableInp) {
      this._registerInpInteractionListener();
    }

    instrumentOutgoingRequests({
      traceFetch,
      traceXHR,
      tracePropagationTargets,
      shouldCreateSpanForRequest,
      enableHTTPTimings,
    });
  }

  /** Create routing idle transaction. */
  private _createRouteTransaction(context: TransactionContext): Transaction | undefined {
    if (!this._getCurrentHub) {
      DEBUG_BUILD &&
        logger.warn(`[Tracing] Did not create ${context.op} transaction because _getCurrentHub is invalid.`);
      return undefined;
    }

    const hub = this._getCurrentHub();

    const { beforeNavigate, idleTimeout, finalTimeout, heartbeatInterval } = this.options;

    const isPageloadTransaction = context.op === 'pageload';

    let expandedContext: TransactionContext;
    if (isPageloadTransaction) {
      const sentryTrace = isPageloadTransaction ? getMetaContent('sentry-trace') : '';
      const baggage = isPageloadTransaction ? getMetaContent('baggage') : undefined;
      const { traceId, dsc, parentSpanId, sampled } = propagationContextFromHeaders(sentryTrace, baggage);
      expandedContext = {
        traceId,
        parentSpanId,
        parentSampled: sampled,
        ...context,
        metadata: {
          // eslint-disable-next-line deprecation/deprecation
          ...context.metadata,
          dynamicSamplingContext: dsc,
        },
        trimEnd: true,
      };
    } else {
      expandedContext = {
        trimEnd: true,
        ...context,
      };
    }

    const modifiedContext = typeof beforeNavigate === 'function' ? beforeNavigate(expandedContext) : expandedContext;

    // For backwards compatibility reasons, beforeNavigate can return undefined to "drop" the transaction (prevent it
    // from being sent to Sentry).
    const finalContext = modifiedContext === undefined ? { ...expandedContext, sampled: false } : modifiedContext;

    // If `beforeNavigate` set a custom name, record that fact
    // eslint-disable-next-line deprecation/deprecation
    finalContext.metadata =
      finalContext.name !== expandedContext.name
        ? // eslint-disable-next-line deprecation/deprecation
          { ...finalContext.metadata, source: 'custom' }
        : // eslint-disable-next-line deprecation/deprecation
          finalContext.metadata;

    this._latestRoute.name = finalContext.name;
    this._latestRoute.context = finalContext;

    // eslint-disable-next-line deprecation/deprecation
    if (finalContext.sampled === false) {
      DEBUG_BUILD && logger.log(`[Tracing] Will not send ${finalContext.op} transaction because of beforeNavigate.`);
    }

    DEBUG_BUILD && logger.log(`[Tracing] Starting ${finalContext.op} transaction on scope`);

    const { location } = WINDOW;

    const idleTransaction = startIdleTransaction(
      hub,
      finalContext,
      idleTimeout,
      finalTimeout,
      true,
      { location }, // for use in the tracesSampler
      heartbeatInterval,
      isPageloadTransaction, // should wait for finish signal if it's a pageload transaction
    );

    if (isPageloadTransaction) {
      WINDOW.document.addEventListener('readystatechange', () => {
        if (['interactive', 'complete'].includes(WINDOW.document.readyState)) {
          idleTransaction.sendAutoFinishSignal();
        }
      });

      if (['interactive', 'complete'].includes(WINDOW.document.readyState)) {
        idleTransaction.sendAutoFinishSignal();
      }
    }

    idleTransaction.registerBeforeFinishCallback(transaction => {
      this._collectWebVitals();
      addPerformanceEntries(transaction);
    });

    return idleTransaction as Transaction;
  }

  /** Start listener for interaction transactions */
  private _registerInteractionListener(): void {
    let inflightInteractionTransaction: IdleTransaction | undefined;
    const registerInteractionTransaction = (): void => {
      const { idleTimeout, finalTimeout, heartbeatInterval } = this.options;
      const op = 'ui.action.click';

      // eslint-disable-next-line deprecation/deprecation
      const currentTransaction = getActiveTransaction();
      if (currentTransaction && currentTransaction.op && ['navigation', 'pageload'].includes(currentTransaction.op)) {
        DEBUG_BUILD &&
          logger.warn(
            `[Tracing] Did not create ${op} transaction because a pageload or navigation transaction is in progress.`,
          );
        return undefined;
      }

      if (inflightInteractionTransaction) {
        inflightInteractionTransaction.setFinishReason('interactionInterrupted');
        inflightInteractionTransaction.end();
        inflightInteractionTransaction = undefined;
      }

      if (!this._getCurrentHub) {
        DEBUG_BUILD && logger.warn(`[Tracing] Did not create ${op} transaction because _getCurrentHub is invalid.`);
        return undefined;
      }

      if (!this._latestRoute.name) {
        DEBUG_BUILD && logger.warn(`[Tracing] Did not create ${op} transaction because _latestRouteName is missing.`);
        return undefined;
      }

      const hub = this._getCurrentHub();
      const { location } = WINDOW;

      const context: TransactionContext = {
        name: this._latestRoute.name,
        op,
        trimEnd: true,
        data: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: this._latestRoute.context
            ? getSource(this._latestRoute.context)
            : undefined || 'url',
        },
      };

      inflightInteractionTransaction = startIdleTransaction(
        hub,
        context,
        idleTimeout,
        finalTimeout,
        true,
        { location }, // for use in the tracesSampler
        heartbeatInterval,
      );
    };

    ['click'].forEach(type => {
      addEventListener(type, registerInteractionTransaction, { once: false, capture: true });
    });
  }

  /** Creates a listener on interaction entries, and maps interactionIds to the origin path of the interaction */
  private _registerInpInteractionListener(): void {
    const handleEntries = ({ entries }: { entries: PerformanceEntry[] }): void => {
      const client = getClient();
      // We need to get the replay, user, and activeTransaction from the current scope
      // so that we can associate replay id, profile id, and a user display to the span
      const replay =
        client !== undefined && client.getIntegrationByName !== undefined
          ? (client.getIntegrationByName('Replay') as Integration & { getReplayId: () => string })
          : undefined;
      const replayId = replay !== undefined ? replay.getReplayId() : undefined;
      // eslint-disable-next-line deprecation/deprecation
      const activeTransaction = getActiveTransaction();
      const currentScope = getCurrentScope();
      const user = currentScope !== undefined ? currentScope.getUser() : undefined;
      entries.forEach(entry => {
        if (isPerformanceEventTiming(entry)) {
          const interactionId = entry.interactionId;
          if (interactionId === undefined) {
            return;
          }
          const existingInteraction = this._interactionIdToRouteNameMapping[interactionId];
          const duration = entry.duration;
          const startTime = entry.startTime;
          const keys = Object.keys(this._interactionIdToRouteNameMapping);
          const minInteractionId =
            keys.length > 0
              ? keys.reduce((a, b) => {
                  return this._interactionIdToRouteNameMapping[a].duration <
                    this._interactionIdToRouteNameMapping[b].duration
                    ? a
                    : b;
                })
              : undefined;
          // For a first input event to be considered, we must check that an interaction event does not already exist with the same duration and start time.
          // This is also checked in the web-vitals library.
          if (entry.entryType === 'first-input') {
            const matchingEntry = keys
              .map(key => this._interactionIdToRouteNameMapping[key])
              .some(interaction => {
                return interaction.duration === duration && interaction.startTime === startTime;
              });
            if (matchingEntry) {
              return;
            }
          }
          // Interactions with an id of 0 and are not first-input are not valid.
          if (!interactionId) {
            return;
          }
          // If the interaction already exists, we want to use the duration of the longest entry, since that is what the INP metric uses.
          if (existingInteraction) {
            existingInteraction.duration = Math.max(existingInteraction.duration, duration);
          } else if (
            keys.length < MAX_INTERACTIONS ||
            minInteractionId === undefined ||
            duration > this._interactionIdToRouteNameMapping[minInteractionId].duration
          ) {
            // If the interaction does not exist, we want to add it to the mapping if there is space, or if the duration is longer than the shortest entry.
            const routeName = this._latestRoute.name;
            const parentContext = this._latestRoute.context;
            if (routeName && parentContext) {
              if (minInteractionId && Object.keys(this._interactionIdToRouteNameMapping).length >= MAX_INTERACTIONS) {
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete this._interactionIdToRouteNameMapping[minInteractionId];
              }
              this._interactionIdToRouteNameMapping[interactionId] = {
                routeName,
                duration,
                parentContext,
                user,
                activeTransaction,
                replayId,
                startTime,
              };
            }
          }
        }
      });
    };
    addPerformanceInstrumentationHandler('event', handleEntries);
    addPerformanceInstrumentationHandler('first-input', handleEntries);
  }
}

/** Returns the value of a meta tag */
export function getMetaContent(metaName: string): string | undefined {
  // Can't specify generic to `getDomElement` because tracing can be used
  // in a variety of environments, have to disable `no-unsafe-member-access`
  // as a result.
  const metaTag = getDomElement(`meta[name=${metaName}]`);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return metaTag ? metaTag.getAttribute('content') : undefined;
}

function getSource(context: TransactionContext): TransactionSource | undefined {
  const sourceFromAttributes = context.attributes && context.attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE];
  // eslint-disable-next-line deprecation/deprecation
  const sourceFromData = context.data && context.data[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE];
  // eslint-disable-next-line deprecation/deprecation
  const sourceFromMetadata = context.metadata && context.metadata.source;

  return sourceFromAttributes || sourceFromData || sourceFromMetadata;
}

function isPerformanceEventTiming(entry: PerformanceEntry): entry is PerformanceEventTiming {
  return 'duration' in entry;
}
