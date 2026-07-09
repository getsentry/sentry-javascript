import type { Span } from '@sentry/core';
import { debug, SPAN_KIND } from '@sentry/core';
import { DEBUG_BUILD } from '../../../../debug-build';
import {
  ATTR_FAAS_EXECUTION,
  ATTR_FAAS_INVOKED_NAME,
  ATTR_FAAS_INVOKED_PROVIDER,
  ATTR_FAAS_INVOKED_REGION,
} from '../constants';
import type { NormalizedRequest, NormalizedResponse } from '../types';
import { getPropagationHeaders } from './MessageAttributes';
import type { RequestMetadata, ServiceExtension } from './ServiceExtension';

const INVOKE_COMMAND = 'Invoke';

export class LambdaServiceExtension implements ServiceExtension {
  public requestPreSpanHook(request: NormalizedRequest): RequestMetadata {
    const functionName = request.commandInput?.FunctionName;

    let spanAttributes: Record<string, unknown> = {};
    let spanName: string | undefined;

    switch (request.commandName) {
      case INVOKE_COMMAND:
        spanAttributes = {
          [ATTR_FAAS_INVOKED_NAME]: functionName,
          [ATTR_FAAS_INVOKED_PROVIDER]: 'aws',
        };
        if (request.region) {
          spanAttributes[ATTR_FAAS_INVOKED_REGION] = request.region;
        }
        spanName = `${functionName} ${INVOKE_COMMAND}`;
        break;
    }
    return {
      spanAttributes,
      spanKind: SPAN_KIND.CLIENT,
      spanName,
    };
  }

  public requestPostSpanHook(request: NormalizedRequest, span: Span): void {
    if (request.commandName === INVOKE_COMMAND && request.commandInput) {
      request.commandInput.ClientContext = injectLambdaPropagationContext(request.commandInput.ClientContext, span);
    }
  }

  public responseHook(response: NormalizedResponse, span: Span): void {
    if (response.request.commandName === INVOKE_COMMAND) {
      span.setAttribute(ATTR_FAAS_EXECUTION, response.requestId);
    }
  }
}

function injectLambdaPropagationContext(clientContext: string | undefined, span: Span): string | undefined {
  try {
    const propagatedContext = getPropagationHeaders(span);

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
      DEBUG_BUILD &&
        debug.warn(
          '[orchestrion:aws-sdk] cannot set trace propagation on lambda invoke parameters due to ClientContext length limitations.',
        );
      return clientContext;
    }

    return encodedClientContext;
  } catch (e) {
    DEBUG_BUILD && debug.log('[orchestrion:aws-sdk] failed to set trace propagation on lambda ClientContext', e);
    return clientContext;
  }
}
