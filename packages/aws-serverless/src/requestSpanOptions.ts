// The attribute-extraction logic in this file was ported from the vendored (and since removed)
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
import {
  CLOUD_ACCOUNT_ID,
  CLOUD_PLATFORM,
  CLOUD_PROVIDER,
  CLOUD_RESOURCE_ID,
  FAAS_COLDSTART,
  FAAS_INVOCATION_ID,
  FAAS_NAME,
  SENTRY_KIND,
  SENTRY_OP,
  SENTRY_ORIGIN,
  SENTRY_SEGMENT_NAME_SOURCE,
} from '@sentry/conventions/attributes';
import { FUNCTION_AWS } from '@sentry/conventions/op';
import type { StartSpanOptions } from '@sentry/core';
import { getClient, hasSpanStreamingEnabled, SERVERLESS_FUNCTION_SPAN_NAME_FALLBACK } from '@sentry/core';
import type { Context } from 'aws-lambda';
import { getHttpRequestAttributes } from './httpEventAttributes';

/**
 * Builds the options for the `function.aws` transaction started for each invocation.
 */
export function getRequestSpanOptions(event: unknown, context: Context, requestIsColdStart: boolean): StartSpanOptions {
  const client = getClient();

  const functionName = getFunctionName(context);

  // The span is started within the surrounding `continueTrace`, so it continues the incoming trace.
  return {
    name:
      client && hasSpanStreamingEnabled(client)
        ? functionName || SERVERLESS_FUNCTION_SPAN_NAME_FALLBACK
        : context.functionName,
    attributes: {
      [SENTRY_OP]: FUNCTION_AWS,
      [SENTRY_ORIGIN]: 'auto.function.aws_serverless',
      [SENTRY_SEGMENT_NAME_SOURCE]: 'component',
      [SENTRY_KIND]: 'server',
      [FAAS_INVOCATION_ID]: context.awsRequestId,
      [CLOUD_RESOURCE_ID]: context.invokedFunctionArn,
      [CLOUD_ACCOUNT_ID]: extractAccountId(context.invokedFunctionArn),
      [CLOUD_PROVIDER]: 'aws',
      [CLOUD_PLATFORM]: 'aws_lambda',
      [FAAS_NAME]: functionName,
      [FAAS_COLDSTART]: requestIsColdStart,
      ...getHttpRequestAttributes(event, client),
    },
  };
}

/**
 * Resolves the name of the currently executing Lambda function.
 *
 * The runtime always populates `context.functionName`; `AWS_LAMBDA_FUNCTION_NAME` covers custom
 * runtimes and local emulators that only partially fill in the invocation context.
 */
function getFunctionName(context: Context): string | undefined {
  return context.functionName || process.env.AWS_LAMBDA_FUNCTION_NAME || undefined;
}

function extractAccountId(arn: string): string | undefined {
  const parts = arn.split(':');
  if (parts.length >= 5) {
    return parts[4];
  }
  return undefined;
}
