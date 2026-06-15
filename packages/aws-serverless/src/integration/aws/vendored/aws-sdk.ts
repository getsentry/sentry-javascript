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
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-aws-sdk
 * - Upstream version: @opentelemetry/instrumentation-aws-sdk@0.73.0
 * - Backported the `@smithy/core` >= 3.24.0 support from upstream 0.74.0
 *   (https://github.com/open-telemetry/opentelemetry-js-contrib/pull/3530)
 */
/* eslint-disable */

import { Span, SpanKind, context, trace, diag, SpanStatusCode } from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import { AttributeNames } from './enums';
import { ServicesExtensions } from './services';
import {
  AwsSdkInstrumentationConfig,
  AwsSdkRequestHookInformation,
  AwsSdkResponseHookInformation,
  NormalizedRequest,
  NormalizedResponse,
} from './types';
import {
  InstrumentationBase,
  InstrumentationModuleDefinition,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
  isWrapped,
  safeExecuteInTheMiddle,
  SemconvStability,
  semconvStabilityFromStr,
} from '@opentelemetry/instrumentation';
import type {
  MiddlewareStack,
  HandlerExecutionContext,
  Command as AwsV3Command,
  Handler as AwsV3MiddlewareHandler,
  InitializeHandlerArguments,
} from '@aws-sdk/types';
import {
  bindPromise,
  extractAttributesFromNormalizedRequest,
  normalizeV3Request,
  removeSuffixFromStringIfExists,
} from './utils';
import { propwrap } from './propwrap';
import { RequestMetadata } from './services/ServiceExtension';
import { ATTR_HTTP_STATUS_CODE } from './semconv';
import { ATTR_HTTP_RESPONSE_STATUS_CODE } from '@opentelemetry/semantic-conventions';
import { SDK_VERSION, timestampInSeconds } from '@sentry/core';

const PACKAGE_NAME = '@sentry/instrumentation-aws-sdk';

const V3_CLIENT_CONFIG_KEY = Symbol('opentelemetry.instrumentation.aws-sdk.client.config');
type V3PluginCommand = AwsV3Command<any, any, any, any, any> & {
  [V3_CLIENT_CONFIG_KEY]?: any;
};

export class AwsInstrumentation extends InstrumentationBase<AwsSdkInstrumentationConfig> {
  static readonly component = 'aws-sdk';
  // need declare since initialized in callbacks from super constructor
  declare private servicesExtensions: ServicesExtensions;

  private _httpSemconvStability: SemconvStability;
  private _dbSemconvStability: SemconvStability;

  constructor(config: AwsSdkInstrumentationConfig = {}) {
    super(PACKAGE_NAME, SDK_VERSION, config);
    this._httpSemconvStability = semconvStabilityFromStr('http', process.env.OTEL_SEMCONV_STABILITY_OPT_IN);
    this._dbSemconvStability = semconvStabilityFromStr('database', process.env.OTEL_SEMCONV_STABILITY_OPT_IN);
  }

  protected init(): InstrumentationModuleDefinition[] {
    const v3MiddlewareStackFileOldVersions = new InstrumentationNodeModuleFile(
      '@aws-sdk/middleware-stack/dist/cjs/MiddlewareStack.js',
      ['>=3.1.0 <3.35.0'],
      this.patchV3ConstructStack.bind(this),
      this.unpatchV3ConstructStack.bind(this),
    );
    const v3MiddlewareStackFileNewVersions = new InstrumentationNodeModuleFile(
      '@aws-sdk/middleware-stack/dist-cjs/MiddlewareStack.js',
      ['>=3.35.0'],
      this.patchV3ConstructStack.bind(this),
      this.unpatchV3ConstructStack.bind(this),
    );

    // as for aws-sdk v3.13.1, constructStack is exported from @aws-sdk/middleware-stack as
    // getter instead of function, which fails shimmer.
    // so we are patching the MiddlewareStack.js file directly to get around it.
    const v3MiddlewareStack = new InstrumentationNodeModuleDefinition(
      '@aws-sdk/middleware-stack',
      ['^3.1.0'],
      undefined,
      undefined,
      [v3MiddlewareStackFileOldVersions, v3MiddlewareStackFileNewVersions],
    );

    // Patch for @smithy/middleware-stack for @aws-sdk/* packages v3.363.0+.
    // As of @smithy/middleware-stack@2.1.0 `constructStack` is only available
    // as a getter, so we cannot use `this._wrap()`.
    const self = this;
    const v3SmithyMiddlewareStack = new InstrumentationNodeModuleDefinition(
      '@smithy/middleware-stack',
      ['>=2.0.0'],
      (moduleExports, moduleVersion) => {
        const newExports = propwrap(moduleExports, 'constructStack', (orig: any) => {
          self._diag.debug('propwrapping aws-sdk v3 constructStack');
          return self._getV3ConstructStackPatch(moduleVersion, orig);
        });
        return newExports;
      },
    );

    // Patch for @smithy/core >= 3.24.0: the `Client` class moved from @smithy/smithy-client
    // into the @smithy/core/client bundle, and `constructStack` became a closed-over local in
    // that bundle (so wrapping the @smithy/middleware-stack export no longer applies). We patch
    // `Client.prototype.send` there, and patch the live middleware stack from within `send`.
    const v3SmithyCoreClientFile = new InstrumentationNodeModuleFile(
      '@smithy/core/dist-cjs/submodules/client/index.js',
      ['>=3.24.0'],
      this.patchV3SmithyClient.bind(this),
      this.unpatchV3SmithyClient.bind(this),
    );
    const v3SmithyCore = new InstrumentationNodeModuleDefinition('@smithy/core', ['>=3.24.0'], undefined, undefined, [
      v3SmithyCoreClientFile,
    ]);

    const v3SmithyClient = new InstrumentationNodeModuleDefinition(
      '@aws-sdk/smithy-client',
      ['^3.1.0'],
      this.patchV3SmithyClient.bind(this),
      this.unpatchV3SmithyClient.bind(this),
    );

    // patch for new @smithy/smithy-client for aws-sdk packages v3.363.0+
    const v3NewSmithyClient = new InstrumentationNodeModuleDefinition(
      '@smithy/smithy-client',
      ['>=1.0.3'],
      this.patchV3SmithyClient.bind(this),
      this.unpatchV3SmithyClient.bind(this),
    );

    return [v3MiddlewareStack, v3SmithyMiddlewareStack, v3SmithyCore, v3SmithyClient, v3NewSmithyClient];
  }

  protected patchV3ConstructStack(moduleExports: any, moduleVersion?: string) {
    this._wrap(moduleExports, 'constructStack', this._getV3ConstructStackPatch.bind(this, moduleVersion));
    return moduleExports;
  }

  protected unpatchV3ConstructStack(moduleExports: any) {
    this._unwrap(moduleExports, 'constructStack');
    return moduleExports;
  }

  protected patchV3SmithyClient(moduleExports: any, moduleVersion?: string) {
    this._wrap(moduleExports.Client.prototype, 'send', this._getV3SmithyClientSendPatch.bind(this, moduleVersion));
    return moduleExports;
  }

  protected unpatchV3SmithyClient(moduleExports: any) {
    this._unwrap(moduleExports.Client.prototype, 'send');
    return moduleExports;
  }

  private _startAwsV3Span(normalizedRequest: NormalizedRequest, metadata: RequestMetadata): Span {
    const name = metadata.spanName ?? `${normalizedRequest.serviceName}.${normalizedRequest.commandName}`;
    const newSpan = this.tracer.startSpan(name, {
      kind: metadata.spanKind ?? SpanKind.CLIENT,
      attributes: {
        ...extractAttributesFromNormalizedRequest(normalizedRequest),
        ...metadata.spanAttributes,
      },
    });

    return newSpan;
  }

  private _callUserPreRequestHook(span: Span, request: NormalizedRequest, moduleVersion: string | undefined) {
    const { preRequestHook } = this.getConfig();
    if (preRequestHook) {
      const requestInfo: AwsSdkRequestHookInformation = {
        moduleVersion,
        request,
      };
      safeExecuteInTheMiddle(
        () => preRequestHook(span, requestInfo),
        (e: Error | undefined) => {
          if (e) diag.error(`${AwsInstrumentation.component} instrumentation: preRequestHook error`, e);
        },
        true,
      );
    }
  }

  private _callUserResponseHook(span: Span, response: NormalizedResponse) {
    const { responseHook } = this.getConfig();
    if (!responseHook) return;

    const responseInfo: AwsSdkResponseHookInformation = {
      response,
    };
    safeExecuteInTheMiddle(
      () => responseHook(span, responseInfo),
      (e: Error | undefined) => {
        if (e) diag.error(`${AwsInstrumentation.component} instrumentation: responseHook error`, e);
      },
      true,
    );
  }

  private _callUserExceptionResponseHook(span: Span, request: NormalizedRequest, err: any) {
    const { exceptionHook } = this.getConfig();
    if (!exceptionHook) return;
    const requestInfo: AwsSdkRequestHookInformation = {
      request,
    };

    safeExecuteInTheMiddle(
      () => exceptionHook(span, requestInfo, err),
      (e: Error | undefined) => {
        if (e) diag.error(`${AwsInstrumentation.component} instrumentation: exceptionHook error`, e);
      },
      true,
    );
  }

  private _getV3ConstructStackPatch(
    moduleVersion: string | undefined,
    original: (...args: unknown[]) => MiddlewareStack<any, any>,
  ) {
    const self = this;
    return function constructStack(this: any, ...args: unknown[]): MiddlewareStack<any, any> {
      const stack: MiddlewareStack<any, any> = original.apply(this, args);
      self.patchV3MiddlewareStack(moduleVersion, stack);
      return stack;
    };
  }

  private _getV3SmithyClientSendPatch(
    moduleVersion: string | undefined,
    original: (...args: unknown[]) => Promise<any>,
  ) {
    const self = this;
    return function send(this: any, command: V3PluginCommand, ...args: unknown[]): Promise<any> {
      command[V3_CLIENT_CONFIG_KEY] = this.config;
      // For @smithy/core >= 3.24.0 `constructStack` is no longer patchable via its export, so we
      // patch the live middleware stack instance here instead. This is a no-op (guarded by
      // `isWrapped`) for older versions where the stack was already patched via `constructStack`.
      self.patchV3MiddlewareStack(moduleVersion, this.middlewareStack);
      return original.apply(this, [command, ...args]);
    };
  }

  private patchV3MiddlewareStack(moduleVersion: string | undefined, middlewareStackToPatch: MiddlewareStack<any, any>) {
    if (!isWrapped(middlewareStackToPatch.resolve)) {
      this._wrap(middlewareStackToPatch, 'resolve', this._getV3MiddlewareStackResolvePatch.bind(this, moduleVersion));
    }

    // 'clone' and 'concat' functions are internally calling 'constructStack' which is in same
    // module, thus not patched, and we need to take care of it specifically.
    if (!isWrapped(middlewareStackToPatch.clone)) {
      this._wrap(middlewareStackToPatch, 'clone', this._getV3MiddlewareStackClonePatch.bind(this, moduleVersion));
    }
    if (!isWrapped(middlewareStackToPatch.concat)) {
      this._wrap(middlewareStackToPatch, 'concat', this._getV3MiddlewareStackClonePatch.bind(this, moduleVersion));
    }
  }

  private _getV3MiddlewareStackClonePatch(
    moduleVersion: string | undefined,
    original: (...args: any[]) => MiddlewareStack<any, any>,
  ) {
    const self = this;
    return function (this: any, ...args: any[]) {
      const newStack = original.apply(this, args);
      self.patchV3MiddlewareStack(moduleVersion, newStack);
      return newStack;
    };
  }

  private _getV3MiddlewareStackResolvePatch(
    moduleVersion: string | undefined,
    original: (_handler: any, context: HandlerExecutionContext) => AwsV3MiddlewareHandler<any, any>,
  ) {
    const self = this;
    return function (
      this: any,
      _handler: any,
      awsExecutionContext: HandlerExecutionContext,
    ): AwsV3MiddlewareHandler<any, any> {
      const origHandler = original.call(this, _handler, awsExecutionContext);
      const patchedHandler = function (
        this: any,
        command: InitializeHandlerArguments<any> & {
          [V3_CLIENT_CONFIG_KEY]?: any;
        },
      ): Promise<any> {
        const clientConfig = command[V3_CLIENT_CONFIG_KEY];
        const regionPromise = clientConfig?.region?.();
        const serviceName =
          clientConfig?.serviceId ??
          removeSuffixFromStringIfExists(
            // Use 'AWS' as a fallback serviceName to match type definition.
            // In practice, `clientName` should always be set.
            awsExecutionContext.clientName || 'AWS',
            'Client',
          );
        const commandName = awsExecutionContext.commandName ?? command.constructor?.name;
        const normalizedRequest = normalizeV3Request(serviceName, commandName, command.input, undefined);
        const requestMetadata = self.servicesExtensions.requestPreSpanHook(
          normalizedRequest,
          self.getConfig(),
          self._diag,
          self._dbSemconvStability,
        );
        const startTime = timestampInSeconds();
        const span = self._startAwsV3Span(normalizedRequest, requestMetadata);
        const activeContextWithSpan = trace.setSpan(context.active(), span);

        const handlerPromise = new Promise((resolve, reject) => {
          Promise.resolve(regionPromise)
            .then(resolvedRegion => {
              normalizedRequest.region = resolvedRegion;
              span.setAttribute(AttributeNames.CLOUD_REGION, resolvedRegion);
            })
            .catch(e => {
              // there is nothing much we can do in this case.
              // we'll just continue without region
              diag.debug(
                `${AwsInstrumentation.component} instrumentation: failed to extract region from async function`,
                e,
              );
            })
            .finally(() => {
              self._callUserPreRequestHook(span, normalizedRequest, moduleVersion);
              const resultPromise = context.with(activeContextWithSpan, () => {
                self.servicesExtensions.requestPostSpanHook(normalizedRequest);
                return self._callOriginalFunction(() => origHandler.call(this, command));
              });
              const promiseWithResponseLogic = resultPromise
                .then((response: any) => {
                  const requestId = response.output?.$metadata?.requestId;
                  if (requestId) {
                    span.setAttribute(AttributeNames.AWS_REQUEST_ID, requestId);
                  }

                  const httpStatusCode = response.output?.$metadata?.httpStatusCode;
                  if (httpStatusCode) {
                    if (self._httpSemconvStability & SemconvStability.OLD) {
                      span.setAttribute(ATTR_HTTP_STATUS_CODE, httpStatusCode);
                    }
                    if (self._httpSemconvStability & SemconvStability.STABLE) {
                      span.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, httpStatusCode);
                    }
                  }

                  const extendedRequestId = response.output?.$metadata?.extendedRequestId;
                  if (extendedRequestId) {
                    span.setAttribute(AttributeNames.AWS_REQUEST_EXTENDED_ID, extendedRequestId);
                  }

                  const normalizedResponse: NormalizedResponse = {
                    data: response.output,
                    request: normalizedRequest,
                    requestId: requestId,
                  };
                  const override = self.servicesExtensions.responseHook(
                    normalizedResponse,
                    span,
                    self.tracer,
                    self.getConfig(),
                    startTime,
                  );
                  if (override) {
                    response.output = override;
                    normalizedResponse.data = override;
                  }
                  self._callUserResponseHook(span, normalizedResponse);
                  return response;
                })
                .catch((err: any) => {
                  const requestId = err?.RequestId;
                  if (requestId) {
                    span.setAttribute(AttributeNames.AWS_REQUEST_ID, requestId);
                  }

                  const httpStatusCode = err?.$metadata?.httpStatusCode;
                  if (httpStatusCode) {
                    if (self._httpSemconvStability & SemconvStability.OLD) {
                      span.setAttribute(ATTR_HTTP_STATUS_CODE, httpStatusCode);
                    }
                    if (self._httpSemconvStability & SemconvStability.STABLE) {
                      span.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, httpStatusCode);
                    }
                  }

                  const extendedRequestId = err?.extendedRequestId;
                  if (extendedRequestId) {
                    span.setAttribute(AttributeNames.AWS_REQUEST_EXTENDED_ID, extendedRequestId);
                  }

                  span.setStatus({
                    code: SpanStatusCode.ERROR,
                    message: err.message,
                  });
                  span.recordException(err);
                  self._callUserExceptionResponseHook(span, normalizedRequest, err);
                  throw err;
                })
                .finally(() => {
                  if (!requestMetadata.isStream) {
                    span.end();
                  }
                });
              promiseWithResponseLogic
                .then((res: any) => {
                  resolve(res);
                })
                .catch((err: any) => reject(err));
            });
        });

        return requestMetadata.isIncoming ? bindPromise(handlerPromise, activeContextWithSpan, 2) : handlerPromise;
      };
      return patchedHandler;
    };
  }

  private _callOriginalFunction<T>(originalFunction: (...args: any[]) => T): T {
    if (this.getConfig().suppressInternalInstrumentation) {
      return context.with(suppressTracing(context.active()), originalFunction);
    } else {
      return originalFunction();
    }
  }

  override _updateMetricInstruments() {
    if (!this.servicesExtensions) {
      this.servicesExtensions = new ServicesExtensions();
    }
    this.servicesExtensions.updateMetricInstruments(this.meter);
  }
}
