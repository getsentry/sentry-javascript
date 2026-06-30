/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-aws-sdk
 * - Upstream version: @opentelemetry/instrumentation-aws-sdk@0.73.0
 */

import { Span, SpanKind, diag, Attributes } from '@opentelemetry/api';
import { ATTR_FAAS_INVOKED_NAME, ATTR_FAAS_INVOKED_PROVIDER, ATTR_FAAS_INVOKED_REGION } from '../semconv';
import { ATTR_FAAS_EXECUTION } from '../semconv-obsolete';
import { AwsSdkInstrumentationConfig, NormalizedRequest, NormalizedResponse } from '../types';
import { RequestMetadata, ServiceExtension } from './ServiceExtension';
import { context, propagation } from '@opentelemetry/api';

class LambdaCommands {
  public static readonly Invoke: string = 'Invoke';
}

export class LambdaServiceExtension implements ServiceExtension {
  requestPreSpanHook(request: NormalizedRequest, _config: AwsSdkInstrumentationConfig): RequestMetadata {
    const functionName = this.extractFunctionName(request.commandInput);

    let spanAttributes: Attributes = {};
    let spanName: string | undefined;

    switch (request.commandName) {
      case 'Invoke':
        spanAttributes = {
          [ATTR_FAAS_INVOKED_NAME]: functionName,
          [ATTR_FAAS_INVOKED_PROVIDER]: 'aws',
        };
        if (request.region) {
          spanAttributes[ATTR_FAAS_INVOKED_REGION] = request.region;
        }
        spanName = `${functionName} ${LambdaCommands.Invoke}`;
        break;
    }
    return {
      isIncoming: false,
      spanAttributes,
      spanKind: SpanKind.CLIENT,
      spanName,
    };
  }

  requestPostSpanHook = (request: NormalizedRequest) => {
    switch (request.commandName) {
      case LambdaCommands.Invoke:
        {
          if (request.commandInput) {
            request.commandInput.ClientContext = injectLambdaPropagationContext(request.commandInput.ClientContext);
          }
        }
        break;
    }
  };

  responseHook(response: NormalizedResponse, span: Span) {
    switch (response.request.commandName) {
      case LambdaCommands.Invoke:
        {
          // oxlint-disable-next-line typescript/no-deprecated
          span.setAttribute(ATTR_FAAS_EXECUTION, response.requestId);
        }
        break;
    }
  }

  extractFunctionName = (commandInput: Record<string, any>): string => {
    return commandInput?.FunctionName;
  };
}

const injectLambdaPropagationContext = (clientContext: string | undefined): string | undefined => {
  try {
    const propagatedContext = {};
    propagation.inject(context.active(), propagatedContext);

    const parsedClientContext = clientContext ? JSON.parse(Buffer.from(clientContext, 'base64').toString('utf8')) : {};

    const updatedClientContext = {
      ...parsedClientContext,
      custom: {
        ...parsedClientContext.custom,
        ...propagatedContext,
      },
    };

    const encodedClientContext = Buffer.from(JSON.stringify(updatedClientContext)).toString('base64');

    // The length of client context is capped at 3583 bytes of base64 encoded data
    // (https://docs.aws.amazon.com/lambda/latest/dg/API_Invoke.html#API_Invoke_RequestSyntax)
    if (encodedClientContext.length > 3583) {
      diag.warn(
        'lambda instrumentation: cannot set context propagation on lambda invoke parameters due to ClientContext length limitations.',
      );
      return clientContext;
    }

    return encodedClientContext;
  } catch (e) {
    diag.debug('lambda instrumentation: failed to set context propagation on ClientContext', e);
    return clientContext;
  }
};
