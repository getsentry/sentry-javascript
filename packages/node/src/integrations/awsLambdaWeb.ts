import {
  CLOUD_ACCOUNT_ID,
  CLOUD_PLATFORM,
  CLOUD_PROVIDER,
  CLOUD_REGION,
  FAAS_COLDSTART,
  FAAS_INVOCATION_ID,
} from '@sentry/conventions/attributes';
import type { IntegrationFn, SpanAttributes } from '@sentry/core';
import { defineIntegration, getClient, getIsolationScope, safeSetSpanJSONAttributes } from '@sentry/core';

let requestHandled = false;

const _awsLambdaWebIntegration = (() => {
  const enabled = !!process.env.AWS_LAMBDA_HTTP_ENDPOINT;
  const cloudContext: SpanAttributes = {
    [CLOUD_PROVIDER]: 'aws',
    [CLOUD_PLATFORM]: 'aws_lambda',
    [CLOUD_REGION]: process.env.AWS_REGION,
    [CLOUD_ACCOUNT_ID]: process.env.AWS_ACCOUNT_ID,
  };
  const memory = Number(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE);
  const lambdaContext = {
    memory_size: Number.isFinite(memory) && memory > 0 ? memory : undefined,
    initialization_type: process.env.AWS_LAMBDA_INITIALIZATION_TYPE,
  };
  const environmentAttributes = {
    ...cloudContext,
    'faas.max_memory': lambdaContext.memory_size ? lambdaContext.memory_size * 1024 * 1024 : undefined,
    'aws.lambda.initialization_type': lambdaContext.initialization_type,
  };

  return {
    name: 'AwsLambdaWeb',
    setup(client) {
      if (!enabled) return;

      client.on('httpServerRequest', (_request, _response, request) => {
        if (getClient() !== client) {
          return;
        }

        const coldStart = !requestHandled;
        requestHandled = true;
        const requestId = request.headers?.['lambda-web-request-id'];
        const endpointName = request.headers?.['lambda-web-endpoint-name'];
        const scope = getIsolationScope();
        const requestContext: { cold_start: boolean; aws_request_id?: string; endpoint_name?: string } = {
          ...scope.getScopeData().contexts['aws.lambda'],
          cold_start: coldStart,
        };
        if (typeof requestId === 'string') {
          requestContext.aws_request_id = requestId;
        } else {
          delete requestContext.aws_request_id;
        }
        if (typeof endpointName === 'string') {
          requestContext.endpoint_name = endpointName;
        } else {
          delete requestContext.endpoint_name;
        }
        scope.setContext('aws.lambda', requestContext);
      });
    },
    processEvent(event) {
      if (!enabled) return event;
      event.contexts = {
        ...event.contexts,
        cloud_resource: { ...cloudContext, ...event.contexts?.cloud_resource },
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
