import { FAAS_COLDSTART, FAAS_INVOCATION_ID } from '@sentry/conventions/attributes';
import type { IntegrationFn, SpanAttributes } from '@sentry/core';
import { defineIntegration, getIsolationScope, safeSetSpanJSONAttributes } from '@sentry/core';

let requestHandled = false;

const _awsLambdaWebIntegration = (() => {
  const enabled = !!process.env.AWS_LAMBDA_HTTP_ENDPOINT;
  const memory = Number(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE) * 1024 * 1024;
  const lambdaContext = {
    memory_size: Number.isFinite(memory) && memory > 0 ? memory : undefined,
    initialization_type: process.env.AWS_LAMBDA_INITIALIZATION_TYPE,
  };
  const environmentAttributes = {
    'faas.max_memory': lambdaContext.memory_size,
    'aws.lambda.initialization_type': lambdaContext.initialization_type,
  };

  return {
    name: 'AwsLambdaWeb',
    setup(client) {
      if (!enabled) return;

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
      if (!enabled) return event;
      event.contexts = {
        ...event.contexts,
        'aws.lambda': { ...lambdaContext, ...event.contexts?.['aws.lambda'] },
      };
      return event;
    },
    processSegmentSpan(span) {
      if (!enabled) return;

      const requestContext = getIsolationScope().getScopeData().contexts['aws.lambda'];
      const attributes: SpanAttributes = { ...environmentAttributes };
      if (typeof requestContext?.cold_start === 'boolean') {
        attributes[FAAS_COLDSTART] = requestContext.cold_start;
      }
      if (typeof requestContext?.aws_request_id === 'string') {
        attributes[FAAS_INVOCATION_ID] = requestContext.aws_request_id;
      }
      if (typeof requestContext?.endpoint_name === 'string') {
        attributes['aws.lambda.web.endpoint_name'] = requestContext.endpoint_name;
      }
      safeSetSpanJSONAttributes(span, attributes);
    },
  };
}) satisfies IntegrationFn;

/** Enrich AWS Lambda Web Function spans and error contexts with platform metadata. */
export const awsLambdaWebIntegration = defineIntegration(_awsLambdaWebIntegration);
