// The span-handling logic in this file was ported from the vendored (and since removed)
// `@opentelemetry/instrumentation-aws-lambda`:
// https://github.com/open-telemetry/opentelemetry-js-contrib/blob/cc7eff47e2e7bad7678241b766753d5bd6dbc85f/packages/instrumentation-aws-lambda/src/instrumentation.ts
/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { CLOUD_ACCOUNT_ID, FAAS_COLDSTART, URL_FULL } from '@sentry/conventions/attributes';
import type { Span, SpanAttributes, StartSpanOptions } from '@sentry/core';
import {
  continueTrace,
  debug,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_KIND,
  SPAN_STATUS_ERROR,
  startSpanManual,
} from '@sentry/core';
import { captureException } from '@sentry/node';
import type { Callback, Context, Handler, StreamifyHandler } from 'aws-lambda';
import { DEBUG_BUILD } from './debug-build';
import {
  AWS_HANDLER_HIGHWATERMARK_SYMBOL,
  AWS_HANDLER_STREAMING_RESPONSE,
  AWS_HANDLER_STREAMING_SYMBOL,
  wrapHandler,
} from './sdk';
import { ATTR_FAAS_EXECUTION, ATTR_FAAS_ID } from './semconv';
import { getAwsTraceData, markEventUnhandled } from './utils';

export const lambdaMaxInitInMilliseconds = 10_000;

// The event truly is `any` from the runtime's point of view; the patched handlers only
// need the trace-header shape `getAwsTraceData` reads.
type LambdaEvent = Parameters<typeof getAwsTraceData>[0];

/**
 * Wraps a Lambda handler with full auto-instrumentation: a `function.aws.lambda`
 * transaction that continues incoming traces, plus the scope, error-capture, timeout
 * warning, and flushing behavior of {@link wrapHandler}.
 *
 * This is what the handler shim (`run-lambda-handler.mjs`) applies to the user's
 * handler when the `AwsLambda` integration has redirected `_HANDLER`.
 */
export function instrumentHandler<T extends Handler | StreamifyHandler>(original: T): T {
  const lambdaStartTime = Date.now() - Math.floor(1000 * process.uptime());
  const patched = getPatchedHandler(original, lambdaStartTime);

  if (isStreamingHandler(original)) {
    // Streaming handlers have special symbols that we need to copy over to the patched
    // handler, so the runtime (and `wrapHandler`) treat it as a streaming handler.
    const originalWithSymbols = original as unknown as Record<symbol, unknown>;
    const patchedWithSymbols = patched as unknown as Record<symbol, unknown>;
    patchedWithSymbols[AWS_HANDLER_STREAMING_SYMBOL] = originalWithSymbols[AWS_HANDLER_STREAMING_SYMBOL];
    patchedWithSymbols[AWS_HANDLER_HIGHWATERMARK_SYMBOL] = originalWithSymbols[AWS_HANDLER_HIGHWATERMARK_SYMBOL];
    return wrapHandler(patched as StreamifyHandler) as T;
  }

  return wrapHandler(patched as Handler) as T;
}

function isStreamingHandler<TEvent, TResult>(
  handler: Handler<TEvent, TResult> | StreamifyHandler<TEvent, TResult>,
): handler is StreamifyHandler<TEvent, TResult> {
  return (
    (handler as unknown as Record<symbol, unknown>)[AWS_HANDLER_STREAMING_SYMBOL] === AWS_HANDLER_STREAMING_RESPONSE
  );
}

function getPatchedHandler(original: Handler | StreamifyHandler, lambdaStartTime: number): Handler | StreamifyHandler {
  let requestHandledBefore = false;
  let requestIsColdStart = true;

  function _onRequest(): void {
    if (requestHandledBefore) {
      // Non-first requests cannot be coldstart.
      requestIsColdStart = false;
    } else {
      if (process.env.AWS_LAMBDA_INITIALIZATION_TYPE === 'provisioned-concurrency') {
        // If sandbox environment is initialized with provisioned concurrency,
        // even the first requests should not be considered as coldstart.
        requestIsColdStart = false;
      } else {
        // Check whether it is proactive initialization or not:
        // https://aaronstuyvenberg.com/posts/understanding-proactive-initialization
        const passedTimeSinceHandlerLoad = Date.now() - lambdaStartTime;
        const proactiveInitialization = passedTimeSinceHandlerLoad > lambdaMaxInitInMilliseconds;

        // If sandbox has been initialized proactively before the actual request,
        // even the first requests should not be considered as coldstart.
        requestIsColdStart = !proactiveInitialization;
      }
      requestHandledBefore = true;
    }
  }

  if (isStreamingHandler(original)) {
    return function patchedStreamingHandler(
      this: unknown,
      event: LambdaEvent,
      responseStream: Parameters<StreamifyHandler>[1],
      context: Context,
    ) {
      _onRequest();
      const { 'sentry-trace': sentryTrace, baggage } = getAwsTraceData(event, context);

      return continueTrace({ sentryTrace, baggage }, () =>
        startSpanManual(getRequestSpanOptions(event, context, requestIsColdStart), span => {
          let maybePromise: Promise<unknown> | undefined;
          try {
            maybePromise = original.apply(this, [event, responseStream, context]) as Promise<unknown> | undefined;
          } catch (error) {
            // Exception thrown synchronously before resolving the promise.
            captureLambdaError(error as Error);
            endSpan(span, error as Error);
            throw error;
          }

          return handlePromiseResult(span, maybePromise);
        }),
      );
    };
  }

  return function patchedHandler(this: unknown, event: LambdaEvent, context: Context, callback: Callback) {
    _onRequest();

    const { 'sentry-trace': sentryTrace, baggage } = getAwsTraceData(event, context);

    return continueTrace({ sentryTrace, baggage }, () =>
      // Ended manually: the span must stay open until either the Lambda callback fires or a
      // returned promise settles, whichever happens first.
      startSpanManual(getRequestSpanOptions(event, context, requestIsColdStart), span => {
        // Lambda seems to pass a callback even if handler is of Promise form, so we wrap all the time before calling
        // the handler and see if the result is a Promise or not. In such a case, the callback is usually ignored. If
        // the handler happened to both call the callback and complete a returned Promise, whichever happens first will
        // win and the latter will be ignored.
        const wrappedCallback = wrapCallback(callback, span);

        let maybePromise: Promise<unknown> | undefined;
        try {
          maybePromise = original.apply(this, [event, context, wrappedCallback]) as Promise<unknown> | undefined;
        } catch (error) {
          // Exception thrown synchronously before resolving callback / promise.
          captureLambdaError(error as Error);
          endSpan(span, error as Error);
          throw error;
        }

        return handlePromiseResult(span, maybePromise);
      }),
    );
  };
}

function getRequestSpanOptions(event: unknown, context: Context, requestIsColdStart: boolean): StartSpanOptions {
  // The span is started within the surrounding `continueTrace`, so it continues the incoming trace.
  return {
    name: context.functionName,
    op: 'function.aws.lambda',
    forceTransaction: true,
    kind: SPAN_KIND.SERVER,
    attributes: {
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.otel.aws_lambda',
      [ATTR_FAAS_EXECUTION]: context.awsRequestId,
      [ATTR_FAAS_ID]: context.invokedFunctionArn,
      [CLOUD_ACCOUNT_ID]: extractAccountId(context.invokedFunctionArn),
      [FAAS_COLDSTART]: requestIsColdStart,
      ...extractOtherEventFields(event),
    },
  };
}

function captureLambdaError(err: Error | string): void {
  captureException(err, scope => markEventUnhandled(scope, 'auto.function.aws_serverless.otel'));
}

function handlePromiseResult(span: Span, maybePromise: Promise<unknown> | undefined): Promise<unknown> | undefined {
  if (typeof maybePromise?.then === 'function') {
    return maybePromise.then(
      value => {
        endSpan(span, undefined);
        return value;
      },
      (err: Error | string) => {
        captureLambdaError(err);
        endSpan(span, err);
        throw err;
      },
    );
  }

  // Handle synchronous return values by ending the span
  endSpan(span, undefined);
  return maybePromise;
}

function wrapCallback(original: Callback, span: Span): Callback {
  return function wrappedCallback(this: unknown, err, res) {
    DEBUG_BUILD && debug.log('executing wrapped lambda callback function');
    if (err) {
      captureLambdaError(err);
    }

    endSpan(span, err);
    return original.apply(this, [err, res]);
  };
}

/**
 * Sets the span status on error and ends the span. Unlike the old OTel-based
 * instrumentation, this does not force-flush the tracer provider: the surrounding
 * `wrapHandler` flushes the client before the invocation result is returned to the
 * runtime, and `NodeClient.flush` force-flushes the tracer provider.
 */
function endSpan(span: Span, err: string | Error | null | undefined): void {
  const errMessage = typeof err === 'string' ? err : err?.message;
  if (errMessage) {
    span.setStatus({
      code: SPAN_STATUS_ERROR,
      message: errMessage,
    });
  }

  span.end();
}

function extractAccountId(arn: string): string | undefined {
  const parts = arn.split(':');
  if (parts.length >= 5) {
    return parts[4];
  }
  return undefined;
}

interface ApiGatewayLikeEvent {
  headers?: Record<string, string | undefined>;
  path?: string;
  rawPath?: string;
  queryStringParameters?: Record<string, string | undefined>;
}

function extractOtherEventFields(event: unknown): SpanAttributes {
  const answer: SpanAttributes = {};
  const fullUrl = extractFullUrl(event as ApiGatewayLikeEvent);
  if (fullUrl) {
    answer[URL_FULL] = fullUrl;
  }
  return answer;
}

function extractFullUrl(event: ApiGatewayLikeEvent): string | undefined {
  // API gateway encodes a lot of url information in various places to recompute this
  const headers = event.headers;
  if (!headers) {
    return undefined;
  }
  // Helper function to deal with case variations (instead of making a tolower() copy of the headers)
  function findAny(key1: string, key2: string): string | undefined {
    return headers?.[key1] ?? headers?.[key2];
  }
  const host = findAny('host', 'Host');
  const proto = findAny('x-forwarded-proto', 'X-Forwarded-Proto');
  const port = findAny('x-forwarded-port', 'X-Forwarded-Port');
  if (!(proto && host && (event.path || event.rawPath))) {
    return undefined;
  }
  let answer = `${proto}://${host}`;
  if (port) {
    answer += `:${port}`;
  }
  answer += event.path ?? event.rawPath;
  if (event.queryStringParameters) {
    let first = true;
    for (const [key, value] of Object.entries(event.queryStringParameters)) {
      answer += first ? '?' : '&';
      answer += encodeURIComponent(key);
      answer += '=';
      answer += encodeURIComponent(value ?? '');
      first = false;
    }
  }
  return answer;
}
