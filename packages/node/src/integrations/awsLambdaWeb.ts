import {
  AWS_LAMBDA_INITIALIZATION_TYPE,
  AWS_LAMBDA_WEB_ENDPOINT_NAME,
  FAAS_COLDSTART,
  FAAS_INVOCATION_ID,
  FAAS_MAX_MEMORY,
} from '@sentry/conventions/attributes';
import type { IntegrationFn, SpanAttributes } from '@sentry/core';
import { defineIntegration, getIsolationScope, safeSetSpanJSONAttributes } from '@sentry/core';

const INTEGRATION_NAME = 'AwsLambdaWeb';

let requestHandled = false;

const _awsLambdaWebIntegration = (() => {
  // Lambda Web Functions run ordinary HTTP servers without a Lambda handler to wrap.
  // We read their request metadata through the `httpServerRequest` hook. Since this hook
  // runs for all HTTP servers, we bail out early when we are not in a Lambda Web Function.
  // https://docs.aws.amazon.com/lambda/latest/dg/web-functions-revisions-env-vars.html
  if (!process.env.AWS_LAMBDA_HTTP_ENDPOINT) {
    return { name: INTEGRATION_NAME };
  }

  const memory = Number(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE) * 1024 * 1024;
  const lambdaContext = {
    memory_size: Number.isFinite(memory) && memory > 0 ? memory : undefined,
    initialization_type: process.env.AWS_LAMBDA_INITIALIZATION_TYPE,
  };
  const environmentAttributes = {
    [FAAS_MAX_MEMORY]: lambdaContext.memory_size,
    [AWS_LAMBDA_INITIALIZATION_TYPE]: lambdaContext.initialization_type,
  };

  return {
    name: INTEGRATION_NAME,
    setup(client) {
      client.on('httpServerRequest', (_request, _response, request) => {
        const coldStart = !requestHandled;
        requestHandled = true;
        const requestId = request.headers?.['lambda-web-request-id'];
        const endpointName = request.headers?.['lambda-web-endpoint-name'];
        const scope = getIsolationScope();
        scope.setContext('aws.lambda', {
          ...scope.getScopeData().contexts['aws.lambda'],
          cold_start: coldStart,
          aws_request_id: typeof requestId === 'string' ? requestId : undefined,
          endpoint_name: typeof endpointName === 'string' ? endpointName : undefined,
        });
      });
    },
    processEvent(event) {
      event.contexts = {
        ...event.contexts,
        'aws.lambda': { ...lambdaContext, ...event.contexts?.['aws.lambda'] },
      };
      return event;
    },
    processSegmentSpan(span) {
      const requestContext = getIsolationScope().getScopeData().contexts['aws.lambda'];
      const attributes: SpanAttributes = { ...environmentAttributes };
      if (typeof requestContext?.cold_start === 'boolean') {
        attributes[FAAS_COLDSTART] = requestContext.cold_start;
      }
      if (typeof requestContext?.aws_request_id === 'string') {
        attributes[FAAS_INVOCATION_ID] = requestContext.aws_request_id;
      }
      if (typeof requestContext?.endpoint_name === 'string') {
        attributes[AWS_LAMBDA_WEB_ENDPOINT_NAME] = requestContext.endpoint_name;
      }
      safeSetSpanJSONAttributes(span, attributes);
    },
  };
}) satisfies IntegrationFn;

/** Enrich AWS Lambda Web Function spans and error contexts with platform metadata. */
export const awsLambdaWebIntegration = defineIntegration(_awsLambdaWebIntegration);
