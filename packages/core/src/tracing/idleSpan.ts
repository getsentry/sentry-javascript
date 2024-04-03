import type { Span, SpanAttributes, StartSpanOptions } from '@sentry/types';
import { logger, timestampInSeconds } from '@sentry/utils';
import { getClient, getCurrentScope } from '../currentScopes';

import { DEBUG_BUILD } from '../debug-build';
import { SEMANTIC_ATTRIBUTE_SENTRY_IDLE_SPAN_FINISH_REASON } from '../semanticAttributes';
import { hasTracingEnabled } from '../utils/hasTracingEnabled';
import { _setSpanForScope } from '../utils/spanOnScope';
import {
  getActiveSpan,
  getSpanDescendants,
  removeChildSpanFromSpan,
  spanTimeInputToSeconds,
  spanToJSON,
} from '../utils/spanUtils';
import { SentryNonRecordingSpan } from './sentryNonRecordingSpan';
import { SPAN_STATUS_ERROR } from './spanstatus';
import { startInactiveSpan } from './trace';

export const TRACING_DEFAULTS = {
  idleTimeout: 1_000,
  finalTimeout: 30_000,
  childSpanTimeout: 15_000,
};

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
  /**
   * The time that has to pass without any span being created.
   * If this time is exceeded, the idle span will finish.
   */
  idleTimeout: number;
  /**
   * The max. time an idle span may run.
   * If this time is exceeded, the idle span will finish no matter what.
   */
  finalTimeout: number;
  /**
   * The max. time a child span may run.
   * If the time since the last span was started exceeds this time, the idle span will finish.
   */
  childSpanTimeout?: number;
  /**
   * When set to `true`, will disable the idle timeout and child timeout
   * until the `idleSpanEnableAutoFinish` hook is emitted for the idle span.
   * The final timeout mechanism will not be affected by this option,
   * meaning the idle span will definitely be finished when the final timeout is
   * reached, no matter what this option is configured to.
   *
   * Defaults to `false`.
   */
  disableAutoFinish?: boolean;
  /** Allows to configure a hook that is called when the idle span is ended, before it is processed. */
  beforeSpanEnd?: (span: Span) => void;
}

/**
 * An idle span is a span that automatically finishes. It does this by tracking child spans as activities.
 * An idle span is always the active span.
 */
export function startIdleSpan(startSpanOptions: StartSpanOptions, options: Partial<IdleSpanOptions> = {}): Span {
  // Activities store a list of active spans
  const activities = new Map<string, boolean>();

  // We should not use heartbeat if we finished a span
  let _finished = false;

  // Timer that tracks idleTimeout
  let _idleTimeoutID: ReturnType<typeof setTimeout> | undefined;

  // Timer that tracks maxSpanTime for child spans
  let _childSpanTimeoutID: ReturnType<typeof setTimeout> | undefined;

  // The reason why the span was finished
  let _finishReason: IdleSpanFinishReason = FINISH_REASON_EXTERNAL_FINISH;

  let _autoFinishAllowed: boolean = !options.disableAutoFinish;

  const {
    idleTimeout = TRACING_DEFAULTS.idleTimeout,
    finalTimeout = TRACING_DEFAULTS.finalTimeout,
    childSpanTimeout = TRACING_DEFAULTS.childSpanTimeout,
    beforeSpanEnd,
  } = options;

  const client = getClient();

  if (!client || !hasTracingEnabled()) {
    return new SentryNonRecordingSpan();
  }

  const scope = getCurrentScope();
  const previousActiveSpan = getActiveSpan();
  const span = _startIdleSpan(startSpanOptions);

  function _endSpan(timestamp: number = timestampInSeconds()): void {
    // Ensure we end with the last span timestamp, if possible
    const spans = getSpanDescendants(span).filter(child => child !== span);

    // If we have no spans, we just end, nothing else to do here
    if (!spans.length) {
      span.end(timestamp);
      return;
    }

    const childEndTimestamps = spans
      .map(span => spanToJSON(span).timestamp)
      .filter(timestamp => !!timestamp) as number[];
    const latestSpanEndTimestamp = childEndTimestamps.length ? Math.max(...childEndTimestamps) : undefined;

    const spanEndTimestamp = spanTimeInputToSeconds(timestamp);
    const spanStartTimestamp = spanToJSON(span).start_timestamp;

    // The final endTimestamp should:
    // * Never be before the span start timestamp
    // * Be the latestSpanEndTimestamp, if there is one, and it is smaller than the passed span end timestamp
    // * Otherwise be the passed end timestamp
    const endTimestamp = Math.max(
      spanStartTimestamp || -Infinity,
      Math.min(spanEndTimestamp, latestSpanEndTimestamp || Infinity),
    );

    span.end(endTimestamp);
  }

  /**
   * Cancels the existing idle timeout, if there is one.
   */
  function _cancelIdleTimeout(): void {
    if (_idleTimeoutID) {
      clearTimeout(_idleTimeoutID);
      _idleTimeoutID = undefined;
    }
  }

  /**
   * Cancels the existing child span timeout, if there is one.
   */
  function _cancelChildSpanTimeout(): void {
    if (_childSpanTimeoutID) {
      clearTimeout(_childSpanTimeoutID);
      _childSpanTimeoutID = undefined;
    }
  }

  /**
   * Restarts idle timeout, if there is no running idle timeout it will start one.
   */
  function _restartIdleTimeout(endTimestamp?: number): void {
    _cancelIdleTimeout();
    _idleTimeoutID = setTimeout(() => {
      if (!_finished && activities.size === 0 && _autoFinishAllowed) {
        _finishReason = FINISH_REASON_IDLE_TIMEOUT;
        _endSpan(endTimestamp);
      }
    }, idleTimeout);
  }

  /**
   * Restarts child span timeout, if there is none running it will start one.
   */
  function _restartChildSpanTimeout(endTimestamp?: number): void {
    _cancelChildSpanTimeout();
    _idleTimeoutID = setTimeout(() => {
      if (!_finished && _autoFinishAllowed) {
        _finishReason = FINISH_REASON_HEARTBEAT_FAILED;
        _endSpan(endTimestamp);
      }
    }, childSpanTimeout);
  }

  /**
   * Start tracking a specific activity.
   * @param spanId The span id that represents the activity
   */
  function _pushActivity(spanId: string): void {
    _cancelIdleTimeout();
    activities.set(spanId, true);

    const endTimestamp = timestampInSeconds();
    // We need to add the timeout here to have the real endtimestamp of the idle span
    // Remember timestampInSeconds is in seconds, timeout is in ms
    _restartChildSpanTimeout(endTimestamp + childSpanTimeout / 1000);
  }

  /**
   * Remove an activity from usage
   * @param spanId The span id that represents the activity
   */
  function _popActivity(spanId: string): void {
    if (activities.has(spanId)) {
      activities.delete(spanId);
    }

    if (activities.size === 0) {
      const endTimestamp = timestampInSeconds();
      // We need to add the timeout here to have the real endtimestamp of the idle span
      // Remember timestampInSeconds is in seconds, timeout is in ms
      _restartIdleTimeout(endTimestamp + idleTimeout / 1000);
      _cancelChildSpanTimeout();
    }
  }

  function onIdleSpanEnded(): void {
    _finished = true;
    activities.clear();

    if (beforeSpanEnd) {
      beforeSpanEnd(span);
    }

    _setSpanForScope(scope, previousActiveSpan);

    const spanJSON = spanToJSON(span);

    const { timestamp: endTimestamp, start_timestamp: startTimestamp } = spanJSON;
    // This should never happen, but to make TS happy...
    if (!endTimestamp || !startTimestamp) {
      return;
    }

    const attributes: SpanAttributes = spanJSON.data || {};
    if (spanJSON.op === 'ui.action.click' && !attributes[SEMANTIC_ATTRIBUTE_SENTRY_IDLE_SPAN_FINISH_REASON]) {
      span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_IDLE_SPAN_FINISH_REASON, _finishReason);
    }

    logger.log(`[Tracing] Idle span "${spanJSON.op}" finished`);

    const childSpans = getSpanDescendants(span).filter(child => child !== span);

    childSpans.forEach(childSpan => {
      // We cancel all pending spans with status "cancelled" to indicate the idle span was finished early
      if (childSpan.isRecording()) {
        childSpan.setStatus({ code: SPAN_STATUS_ERROR, message: 'cancelled' });
        childSpan.end(endTimestamp);
        DEBUG_BUILD &&
          logger.log('[Tracing] Cancelling span since span ended early', JSON.stringify(childSpan, undefined, 2));
      }

      const childSpanJSON = spanToJSON(childSpan);
      const { timestamp: childEndTimestamp = 0, start_timestamp: childStartTimestamp = 0 } = childSpanJSON;

      const spanStartedBeforeIdleSpanEnd = childStartTimestamp <= endTimestamp;

      // Add a delta with idle timeout so that we prevent false positives
      const timeoutWithMarginOfError = (finalTimeout + idleTimeout) / 1000;
      const spanEndedBeforeFinalTimeout = childEndTimestamp - childStartTimestamp < timeoutWithMarginOfError;

      if (DEBUG_BUILD) {
        const stringifiedSpan = JSON.stringify(childSpan, undefined, 2);
        if (!spanStartedBeforeIdleSpanEnd) {
          logger.log('[Tracing] Discarding span since it happened after idle span was finished', stringifiedSpan);
        } else if (!spanEndedBeforeFinalTimeout) {
          logger.log('[Tracing] Discarding span since it finished after idle span final timeout', stringifiedSpan);
        }
      }

      if (!spanEndedBeforeFinalTimeout || !spanStartedBeforeIdleSpanEnd) {
        removeChildSpanFromSpan(span, childSpan);
      }
    });
  }

  client.on('spanStart', startedSpan => {
    // If we already finished the idle span,
    // or if this is the idle span itself being started,
    // or if the started span has already been closed,
    // we don't care about it for activity
    if (_finished || startedSpan === span || !!spanToJSON(startedSpan).timestamp) {
      return;
    }

    const allSpans = getSpanDescendants(span);

    // If the span that was just started is a child of the idle span, we should track it
    if (allSpans.includes(startedSpan)) {
      _pushActivity(startedSpan.spanContext().spanId);
    }
  });

  client.on('spanEnd', endedSpan => {
    if (_finished) {
      return;
    }

    _popActivity(endedSpan.spanContext().spanId);

    if (endedSpan === span) {
      onIdleSpanEnded();
    }
  });

  client.on('idleSpanEnableAutoFinish', spanToAllowAutoFinish => {
    if (spanToAllowAutoFinish === span) {
      _autoFinishAllowed = true;
      _restartIdleTimeout();

      if (activities.size) {
        _restartChildSpanTimeout();
      }
    }
  });

  // We only start the initial idle timeout if we are not delaying the auto finish
  if (!options.disableAutoFinish) {
    _restartIdleTimeout();
  }

  setTimeout(() => {
    if (!_finished) {
      span.setStatus({ code: SPAN_STATUS_ERROR, message: 'deadline_exceeded' });
      _finishReason = FINISH_REASON_FINAL_TIMEOUT;
      _endSpan();
    }
  }, finalTimeout);

  return span;
}

function _startIdleSpan(options: StartSpanOptions): Span {
  const span = startInactiveSpan(options);

  _setSpanForScope(getCurrentScope(), span);

  DEBUG_BUILD && logger.log('[Tracing] Started span is an idle span');

  return span;
}
