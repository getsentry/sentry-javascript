// Vendored and modified from: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/cc7eff47e2e7bad7678241b766753d5bd6dbc85f/packages/instrumentation-aws-lambda/src/instrumentation.ts
// Modifications:
// - Added Sentry `wrapHandler` around the OTel patch handler.
// - Cancel init when handler string is invalid (TS)
// - Hardcoded package version and name
/* eslint-disable */
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

import type {
  Attributes,
  Context as OtelContext,
  MeterProvider,
  Span,
  TextMapGetter,
  TracerProvider,
} from '@opentelemetry/api';
import {
  context as otelContext,
  diag,
  propagation,
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
  isWrapped,
  safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import {
  ATTR_URL_FULL,
  SEMATTRS_FAAS_EXECUTION,
  SEMRESATTRS_CLOUD_ACCOUNT_ID,
  SEMRESATTRS_FAAS_ID,
} from '@opentelemetry/semantic-conventions';
import type { APIGatewayProxyEventHeaders, Callback, Context, Handler } from 'aws-lambda';
import * as fs from 'fs';
import * as path from 'path';
import type { LambdaModule } from './internal-types';
import { ATTR_FAAS_COLDSTART } from './semconv';
import type { AwsLambdaInstrumentationConfig, EventContextExtractor } from './types';
import { wrapHandler } from '../../sdk';
import { SDK_VERSION } from '@sentry/core';

// OpenTelemetry package version was 0.54.0 at time of vendoring.
const PACKAGE_VERSION = SDK_VERSION;
const PACKAGE_NAME = '@sentry/instrumentation-aws-lambda';

const headerGetter: TextMapGetter<APIGatewayProxyEventHeaders> = {
  keys(carrier): string[] {
    return Object.keys(carrier);
  },
  get(carrier, key: string) {
    return carrier[key];
  },
};

export const lambdaMaxInitInMilliseconds = 10_000;

/**
 *
 */
export class AwsLambdaInstrumentation extends InstrumentationBase<AwsLambdaInstrumentationConfig> {
  private declare _traceForceFlusher?: () => Promise<void>;
  private declare _metricForceFlusher?: () => Promise<void>;

  constructor(config: AwsLambdaInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
  }

  /**
   *
   */
  init() {
    const taskRoot = process.env.LAMBDA_TASK_ROOT;
    const handlerDef = this.getConfig().lambdaHandler ?? process.env._HANDLER;

    // _HANDLER and LAMBDA_TASK_ROOT are always defined in Lambda but guard bail out if in the future this changes.
    if (!taskRoot || !handlerDef) {
      this._diag.debug('Skipping lambda instrumentation: no _HANDLER/lambdaHandler or LAMBDA_TASK_ROOT.', {
        taskRoot,
        handlerDef,
      });
      return [];
    }

    const handler = path.basename(handlerDef);
    const moduleRoot = handlerDef.substring(0, handlerDef.length - handler.length);

    const [module, functionName] = handler.split('.', 2);

    if (!module || !functionName) {
      this._diag.warn('Invalid handler definition', {
        handler,
        moduleRoot,
        module,
      });
      return [];
    }

    // Lambda loads user function using an absolute path.
    let filename = path.resolve(taskRoot, moduleRoot, module);
    if (!filename.endsWith('.js')) {
      // It's impossible to know in advance if the user has a js, mjs or cjs file.
      // Check that the .js file exists otherwise fallback to the next known possibilities (.mjs, .cjs).
      try {
        fs.statSync(`${filename}.js`);
        filename += '.js';
      } catch (e) {
        try {
          fs.statSync(`${filename}.mjs`);
          // fallback to .mjs (ESM)
          filename += '.mjs';
        } catch (e2) {
          try {
            fs.statSync(`${filename}.cjs`);
            // fallback to .cjs (CommonJS)
            filename += '.cjs';
          } catch (e3) {
            this._diag.warn(
              'No handler file was able to resolved with one of the known extensions for the file',
              filename,
            );
          }
        }
      }
    }

    diag.debug('Instrumenting lambda handler', {
      taskRoot,
      handlerDef,
      handler,
      moduleRoot,
      module,
      filename,
      functionName,
    });

    const lambdaStartTime = this.getConfig().lambdaStartTime || Date.now() - Math.floor(1000 * process.uptime());

    return [
      new InstrumentationNodeModuleDefinition(
        // NB: The patching infrastructure seems to match names backwards, this must be the filename, while
        // InstrumentationNodeModuleFile must be the module name.
        filename,
        ['*'],
        undefined,
        undefined,
        [
          new InstrumentationNodeModuleFile(
            module,
            ['*'],
            (moduleExports: LambdaModule) => {
              if (isWrapped(moduleExports[functionName])) {
                this._unwrap(moduleExports, functionName);
              }
              this._wrap(moduleExports, functionName, this._getHandler(lambdaStartTime));
              return moduleExports;
            },
            (moduleExports?: LambdaModule) => {
              if (moduleExports == null) return;
              this._unwrap(moduleExports, functionName);
            },
          ),
        ],
      ),
    ];
  }

  /**
   *
   */
  private _getHandler(handlerLoadStartTime: number) {
    return (original: Handler) => {
      return wrapHandler(this._getPatchHandler(original, handlerLoadStartTime));
    };
  }

  /**
   *
   */
  private _getPatchHandler(original: Handler, lambdaStartTime: number) {
    diag.debug('patch handler function');
    const plugin = this;

    let requestHandledBefore = false;
    let requestIsColdStart = true;

    /**
     *
     */
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
          const passedTimeSinceHandlerLoad: number = Date.now() - lambdaStartTime;
          const proactiveInitialization: boolean = passedTimeSinceHandlerLoad > lambdaMaxInitInMilliseconds;

          // If sandbox has been initialized proactively before the actual request,
          // even the first requests should not be considered as coldstart.
          requestIsColdStart = !proactiveInitialization;
        }
        requestHandledBefore = true;
      }
    }

    return function patchedHandler(
      this: never,
      // The event can be a user type, it truly is any.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      event: any,
      context: Context,
      callback: Callback,
    ) {
      _onRequest();

      const config = plugin.getConfig();
      const parent = AwsLambdaInstrumentation._determineParent(
        event,
        context,
        config.eventContextExtractor || AwsLambdaInstrumentation._defaultEventContextExtractor,
      );

      const name = context.functionName;
      const span = plugin.tracer.startSpan(
        name,
        {
          kind: SpanKind.SERVER,
          attributes: {
            [SEMATTRS_FAAS_EXECUTION]: context.awsRequestId,
            [SEMRESATTRS_FAAS_ID]: context.invokedFunctionArn,
            [SEMRESATTRS_CLOUD_ACCOUNT_ID]: AwsLambdaInstrumentation._extractAccountId(context.invokedFunctionArn),
            [ATTR_FAAS_COLDSTART]: requestIsColdStart,
            ...AwsLambdaInstrumentation._extractOtherEventFields(event),
          },
        },
        parent,
      );

      const { requestHook } = config;
      if (requestHook) {
        safeExecuteInTheMiddle(
          () => requestHook(span, { event, context }),
          e => {
            if (e) diag.error('aws-lambda instrumentation: requestHook error', e);
          },
          true,
        );
      }

      return otelContext.with(trace.setSpan(parent, span), () => {
        // Lambda seems to pass a callback even if handler is of Promise form, so we wrap all the time before calling
        // the handler and see if the result is a Promise or not. In such a case, the callback is usually ignored. If
        // the handler happened to both call the callback and complete a returned Promise, whichever happens first will
        // win and the latter will be ignored.
        const wrappedCallback = plugin._wrapCallback(callback, span);
        const maybePromise = safeExecuteInTheMiddle(
          () => original.apply(this, [event, context, wrappedCallback]),
          error => {
            if (error != null) {
              // Exception thrown synchronously before resolving callback / promise.
              plugin._applyResponseHook(span, error);
              plugin._endSpan(span, error, () => {});
            }
          },
        ) as Promise<{}> | undefined;
        if (typeof maybePromise?.then === 'function') {
          return maybePromise.then(
            value => {
              plugin._applyResponseHook(span, null, value);
              return new Promise(resolve => plugin._endSpan(span, undefined, () => resolve(value)));
            },
            (err: Error | string) => {
              plugin._applyResponseHook(span, err);
              return new Promise((resolve, reject) => plugin._endSpan(span, err, () => reject(err)));
            },
          );
        }
        return maybePromise;
      });
    };
  }

  /**
   *
   */
  override setTracerProvider(tracerProvider: TracerProvider) {
    super.setTracerProvider(tracerProvider);
    this._traceForceFlusher = this._traceForceFlush(tracerProvider);
  }

  /**
   *
   */
  private _traceForceFlush(tracerProvider: TracerProvider) {
    if (!tracerProvider) return undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let currentProvider: any = tracerProvider;

    if (typeof currentProvider.getDelegate === 'function') {
      currentProvider = currentProvider.getDelegate();
    }

    if (typeof currentProvider.forceFlush === 'function') {
      return currentProvider.forceFlush.bind(currentProvider);
    }

    return undefined;
  }

  /**
   *
   */
  override setMeterProvider(meterProvider: MeterProvider) {
    super.setMeterProvider(meterProvider);
    this._metricForceFlusher = this._metricForceFlush(meterProvider);
  }

  /**
   *
   */
  private _metricForceFlush(meterProvider: MeterProvider) {
    if (!meterProvider) return undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const currentProvider: any = meterProvider;

    if (typeof currentProvider.forceFlush === 'function') {
      return currentProvider.forceFlush.bind(currentProvider);
    }

    return undefined;
  }

  /**
   *
   */
  private _wrapCallback(original: Callback, span: Span): Callback {
    const plugin = this;
    return function wrappedCallback(this: never, err, res) {
      diag.debug('executing wrapped lookup callback function');
      plugin._applyResponseHook(span, err, res);

      plugin._endSpan(span, err, () => {
        diag.debug('executing original lookup callback function');
        return original.apply(this, [err, res]);
      });
    };
  }

  /**
   *
   */
  private _endSpan(span: Span, err: string | Error | null | undefined, callback: () => void) {
    if (err) {
      span.recordException(err);
    }

    let errMessage;
    if (typeof err === 'string') {
      errMessage = err;
    } else if (err) {
      errMessage = err.message;
    }
    if (errMessage) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: errMessage,
      });
    }

    span.end();

    const flushers = [];
    if (this._traceForceFlusher) {
      flushers.push(this._traceForceFlusher());
    } else {
      diag.debug(
        'Spans may not be exported for the lambda function because we are not force flushing before callback.',
      );
    }
    if (this._metricForceFlusher) {
      flushers.push(this._metricForceFlusher());
    } else {
      diag.debug(
        'Metrics may not be exported for the lambda function because we are not force flushing before callback.',
      );
    }

    Promise.all(flushers).then(callback, callback);
  }

  /**
   *
   */
  private _applyResponseHook(span: Span, err?: Error | string | null, res?: any) {
    const { responseHook } = this.getConfig();
    if (responseHook) {
      safeExecuteInTheMiddle(
        () => responseHook(span, { err, res }),
        e => {
          if (e) diag.error('aws-lambda instrumentation: responseHook error', e);
        },
        true,
      );
    }
  }

  /**
   *
   */
  private static _extractAccountId(arn: string): string | undefined {
    const parts = arn.split(':');
    if (parts.length >= 5) {
      return parts[4];
    }
    return undefined;
  }

  /**
   *
   */
  private static _defaultEventContextExtractor(event: any): OtelContext {
    // The default extractor tries to get sampled trace header from HTTP headers.
    const httpHeaders = event.headers || {};
    return propagation.extract(otelContext.active(), httpHeaders, headerGetter);
  }

  /**
   *
   */
  private static _extractOtherEventFields(event: any): Attributes {
    const answer: Attributes = {};
    const fullUrl = this._extractFullUrl(event);
    if (fullUrl) {
      answer[ATTR_URL_FULL] = fullUrl;
    }
    return answer;
  }

  /**
   *
   */
  private static _extractFullUrl(event: any): string | undefined {
    // API gateway encodes a lot of url information in various places to recompute this
    if (!event.headers) {
      return undefined;
    }
    // Helper function to deal with case variations (instead of making a tolower() copy of the headers)
    /**
     *
     */
    function findAny(event: any, key1: string, key2: string): string | undefined {
      return event.headers[key1] ?? event.headers[key2];
    }
    const host = findAny(event, 'host', 'Host');
    const proto = findAny(event, 'x-forwarded-proto', 'X-Forwarded-Proto');
    const port = findAny(event, 'x-forwarded-port', 'X-Forwarded-Port');
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
      for (const key in event.queryStringParameters) {
        answer += first ? '?' : '&';
        answer += encodeURIComponent(key);
        answer += '=';
        answer += encodeURIComponent(event.queryStringParameters[key]);
        first = false;
      }
    }
    return answer;
  }

  /**
   *
   */
  private static _determineParent(
    event: any,
    context: Context,
    eventContextExtractor: EventContextExtractor,
  ): OtelContext {
    const extractedContext = safeExecuteInTheMiddle(
      () => eventContextExtractor(event, context),
      e => {
        if (e) diag.error('aws-lambda instrumentation: eventContextExtractor error', e);
      },
      true,
    );
    if (trace.getSpan(extractedContext)?.spanContext()) {
      return extractedContext;
    }
    return ROOT_CONTEXT;
  }
}
