/* eslint-disable max-lines */
import type { TransactionContext } from '@sentry/types';
import { logger, timestampInSeconds } from '@sentry/utils';

import { DEBUG_BUILD } from '../debug-build';
import { getClient, getCurrentScope } from '../exports';
import type { Span } from './span';
import { getActiveSpan, startSpanManual } from './trace';

export const TRACING_DEFAULTS = {
  idleTimeout: 1000,
  finalTimeout: 30000,
  heartbeatInterval: 5000,
};

const FINISH_REASON_TAG = 'finishReason';

const FINISH_REASON_HEARTBEAT_FAILED = 'heartbeatFailed';
const FINISH_REASON_IDLE_TIMEOUT = 'idleTimeout';
const FINISH_REASON_FINAL_TIMEOUT = 'finalTimeout';
const FINISH_REASON_EXTERNAL_FINISH = 'externalFinish';
const FINISH_REASON_CANCELLED = 'cancelled';

// unused
const FINISH_REASON_DOCUMENT_HIDDEN = 'documentHidden';

// unusued in this file, but used in BrowserTracing
const FINISH_REASON_INTERRUPTED = 'interactionInterrupted';

type IdleSpanFinishReason =
  | typeof FINISH_REASON_CANCELLED
  | typeof FINISH_REASON_DOCUMENT_HIDDEN
  | typeof FINISH_REASON_EXTERNAL_FINISH
  | typeof FINISH_REASON_FINAL_TIMEOUT
  | typeof FINISH_REASON_HEARTBEAT_FAILED
  | typeof FINISH_REASON_IDLE_TIMEOUT
  | typeof FINISH_REASON_INTERRUPTED;

interface IdleSpanOptions {
  transactionContext: TransactionContext;
  idleTimeout: number;
  finalTimeout: number;
  // TODO FN: Do we need this??
  // customSamplingContext?: CustomSamplingContext;
  heartbeatInterval?: number;
}

/**
 * An idle span is a span that automatically finishes. It does this by tracking child spans as activities.
 * An idle span is always the active span.
 */
export function startIdleSpan(options: IdleSpanOptions): Span | undefined {
  // Activities store a list of active spans
  const activities = new Map<string, boolean>();

  // Track state of activities in previous heartbeat
  let _prevHeartbeatString: string | undefined;

  // Amount of times heartbeat has counted. Will cause span to finish after 3 beats.
  let _heartbeatCounter = 0;

  // We should not use heartbeat if we finished a span
  let _finished = false;

  // Idle timeout was canceled and we should finish the span with the last span end.
  let _idleTimeoutCanceledPermanently = false;

  // Timer that tracks span idleTimeout
  let _idleTimeoutID: ReturnType<typeof setTimeout> | undefined;

  // The reason why the span was finished
  let _finishReason: IdleSpanFinishReason = FINISH_REASON_EXTERNAL_FINISH;

  const {
    transactionContext,
    idleTimeout,
    finalTimeout,
    heartbeatInterval = TRACING_DEFAULTS.heartbeatInterval,
  } = options;

  const client = getClient();

  if (!client || !client.on) {
    return;
  }

  const scope = getCurrentScope();
  const previousActiveSpan = getActiveSpan();
  const _span = _startIdleSpan(transactionContext);

  // Span _should_ always be defined here, but TS does not know that...
  if (!_span) {
    return;
  }

  // For TS, so that we know everything below here has a span
  const span = _span;
  const spanId = span.spanId;

  // We keep all child spans (and children of children) here,
  // so we can force end them when we end the idle span
  const childSpans: Span[] = [];

  /**
   * Cancels the existing idle timeout, if there is one.
   * @param restartOnChildSpanChange If set to false the transaction will end with the last child span.
   */
  function cancelIdleTimeout(
    endTimestamp?: number,
    { restartOnChildSpanChange } = {
      restartOnChildSpanChange: true,
    },
  ): void {
    _idleTimeoutCanceledPermanently = restartOnChildSpanChange === false;
    if (_idleTimeoutID) {
      clearTimeout(_idleTimeoutID);
      _idleTimeoutID = undefined;

      if (activities.size === 0 && _idleTimeoutCanceledPermanently) {
        _finishReason = FINISH_REASON_CANCELLED;
        span.end(endTimestamp);
      }
    }
  }

  /**
   * Restarts idle timeout, if there is no running idle timeout it will start one.
   */
  function _restartIdleTimeout(endTimestamp?: number): void {
    cancelIdleTimeout();
    _idleTimeoutID = setTimeout(() => {
      if (!_finished && activities.size === 0) {
        _finishReason = FINISH_REASON_IDLE_TIMEOUT;
        span.end(endTimestamp);
      }
    }, idleTimeout);
  }

  /**
   * Start tracking a specific activity.
   * @param spanId The span id that represents the activity
   */
  function _pushActivity(spanId: string): void {
    cancelIdleTimeout(undefined, { restartOnChildSpanChange: !_idleTimeoutCanceledPermanently });
    activities.set(spanId, true);
    DEBUG_BUILD && logger.log(`[Tracing] pushActivity: ${spanId}`);
    DEBUG_BUILD && logger.log('[Tracing] new activities count', activities.size);
  }

  /**
   * Remove an activity from usage
   * @param spanId The span id that represents the activity
   */
  function _popActivity(spanId: string): void {
    if (activities.has(spanId)) {
      DEBUG_BUILD && logger.log(`[Tracing] popActivity ${spanId}`);
      activities.delete(spanId);
      DEBUG_BUILD && logger.log('[Tracing] new activities count', activities.size);
    }

    if (activities.size === 0) {
      const endTimestamp = timestampInSeconds();
      if (_idleTimeoutCanceledPermanently) {
        _finishReason = FINISH_REASON_CANCELLED;
        span.end(endTimestamp);
      } else {
        // We need to add the timeout here to have the real endtimestamp of the transaction
        // Remember timestampInSeconds is in seconds, timeout is in ms
        _restartIdleTimeout(endTimestamp + idleTimeout / 1000);
      }
    }
  }

  /**
   * Checks when entries of activities are not changing for 3 beats.
   * If this occurs we finish the transaction.
   */
  function _beat(): void {
    // We should not be running heartbeat if the idle transaction is finished.
    if (_finished) {
      return;
    }

    const heartbeatString = Array.from(activities.keys()).join('');

    if (heartbeatString === _prevHeartbeatString) {
      _heartbeatCounter++;
    } else {
      _heartbeatCounter = 1;
    }

    _prevHeartbeatString = heartbeatString;

    if (_heartbeatCounter >= 3) {
      DEBUG_BUILD && logger.log('[Tracing] Transaction finished because of no change for 3 heart beats');
      span.setStatus('deadline_exceeded');
      _finishReason = FINISH_REASON_HEARTBEAT_FAILED;
      span.end();
    } else {
      _pingHeartbeat();
    }
  }

  /**
   * Pings the heartbeat
   */
  function _pingHeartbeat(): void {
    DEBUG_BUILD && logger.log(`pinging Heartbeat -> current counter: ${_heartbeatCounter}`);
    setTimeout(() => {
      _beat();
    }, heartbeatInterval);
  }

  function endIdleSpan(): void {
    scope.setSpan(previousActiveSpan);
    const endTimestamp = span.endTimestamp;

    // This should never happen, but to make TS happy...
    if (!endTimestamp) {
      return;
    }

    _finished = true;
    activities.clear();

    if (span.op === 'ui.action.click' && !span.tags[FINISH_REASON_TAG]) {
      span.setTag(FINISH_REASON_TAG, _finishReason);
    }

    DEBUG_BUILD && logger.log('[Tracing] finishing idle span', new Date(endTimestamp * 1000).toISOString(), span.op);

    childSpans.forEach(childSpan => {
      // We cancel all pending spans with status "cancelled" to indicate the idle span was finished early
      if (!childSpan.endTimestamp) {
        childSpan.endTimestamp = endTimestamp;
        childSpan.setStatus('cancelled');
        DEBUG_BUILD &&
          logger.log('[Tracing] cancelling span since span ended early', JSON.stringify(childSpan, undefined, 2));
      }

      const spanStartedBeforeIdleSpanEnd = childSpan.startTimestamp < endTimestamp;

      // Add a delta with idle timeout so that we prevent false positives
      const timeoutWithMarginOfError = (finalTimeout + idleTimeout) / 1000;
      const spanEndedBeforeFinalTimeout = childSpan.endTimestamp - span.startTimestamp < timeoutWithMarginOfError;

      if (DEBUG_BUILD) {
        const stringifiedSpan = JSON.stringify(childSpan, undefined, 2);
        if (!spanStartedBeforeIdleSpanEnd) {
          logger.log('[Tracing] discarding Span since it happened after idle span was finished', stringifiedSpan);
        } else if (!spanEndedBeforeFinalTimeout) {
          logger.log('[Tracing] discarding Span since it finished after idle span final timeout', stringifiedSpan);
        }
      }
    });

    DEBUG_BUILD && logger.log('[Tracing] flushing idle span');

    // Clear array of child spans
    childSpans.splice(0, childSpans.length);
  }

  client.on('spanStart', span => {
    if (_finished) {
      return;
    }

    const { parentSpanId } = span;
    // We only care about spans that are direct children of the idle span or its children
    // and about spans that are not immediately closed
    if (parentSpanId && (activities.has(parentSpanId) || parentSpanId === spanId) && span.endTimestamp === undefined) {
      _pushActivity(span.spanId);
      childSpans.push(span);
    }
  });

  client.on('spanEnd', span => {
    if (_finished) {
      return;
    }

    _popActivity(span.spanId);

    if (span.spanId === spanId) {
      endIdleSpan();
    }
  });

  _restartIdleTimeout();

  setTimeout(() => {
    if (!_finished) {
      span.setStatus('deadline_exceeded');
      _finishReason = FINISH_REASON_FINAL_TIMEOUT;
      span.end();
    }
  }, finalTimeout);

  // Start heartbeat so that spans do not run forever.
  DEBUG_BUILD && logger.log('Starting heartbeat');
  _pingHeartbeat();

  return span;
}

function _startIdleSpan(transactionContext: TransactionContext): Span | undefined {
  // We cannot use `startSpan()` here because that ends the current span when the callback finishes :()
  let span: Span | undefined;
  startSpanManual(transactionContext, _span => {
    span = _span;
  });

  getCurrentScope().setSpan(span);

  if (span) {
    DEBUG_BUILD && logger.log(`Setting idle span on scope. Span ID: ${span.spanId}`);
  }

  return span;
}
