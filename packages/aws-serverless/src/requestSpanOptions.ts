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
  FAAS_COLDSTART,
  FAAS_NAME,
  SENTRY_KIND,
  SENTRY_OP,
  URL_FULL,
} from '@sentry/conventions/attributes';
import { FUNCTION_AWS } from '@sentry/conventions/op';
import type { SpanAttributes, StartSpanOptions } from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, filterCollectedUrl } from '@sentry/core';
import type { Context } from 'aws-lambda';
import { ATTR_FAAS_EXECUTION, ATTR_FAAS_ID } from './semconv';

interface ApiGatewayLikeEvent {
  headers?: Record<string, string | undefined>;
  path?: string;
  rawPath?: string;
  queryStringParameters?: Record<string, string | undefined>;
}

/**
 * Builds the options for the `function.aws` transaction started for each invocation.
 */
export function getRequestSpanOptions(event: unknown, context: Context, requestIsColdStart: boolean): StartSpanOptions {
  // The span is started within the surrounding `continueTrace`, so it continues the incoming trace.
  return {
    name: context.functionName,
    forceTransaction: true,
    attributes: {
      [SENTRY_OP]: FUNCTION_AWS,
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.aws_lambda',
      [SENTRY_KIND]: 'server',
      [ATTR_FAAS_EXECUTION]: context.awsRequestId,
      [ATTR_FAAS_ID]: context.invokedFunctionArn,
      [CLOUD_ACCOUNT_ID]: extractAccountId(context.invokedFunctionArn),
      [CLOUD_PROVIDER]: 'aws',
      [CLOUD_PLATFORM]: 'aws_lambda',
      [FAAS_NAME]: context.functionName,
      [FAAS_COLDSTART]: requestIsColdStart,
      ...extractOtherEventFields(event),
    },
  };
}

function extractAccountId(arn: string): string | undefined {
  const parts = arn.split(':');
  if (parts.length >= 5) {
    return parts[4];
  }
  return undefined;
}

function extractOtherEventFields(event: unknown): SpanAttributes {
  const answer: SpanAttributes = {};
  const fullUrl = extractFullUrl(event as ApiGatewayLikeEvent);
  if (fullUrl) {
    answer[URL_FULL] = filterCollectedUrl(fullUrl);
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
