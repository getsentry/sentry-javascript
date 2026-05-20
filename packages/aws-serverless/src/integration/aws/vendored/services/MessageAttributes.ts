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
 */
/* eslint-disable */

import { TextMapGetter, TextMapSetter, context, propagation, diag } from '@opentelemetry/api';
import type { SQS, SNS } from '../aws-sdk.types';

// https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-quotas.html
export const MAX_MESSAGE_ATTRIBUTES = 10;
class ContextSetter implements TextMapSetter<SQS.MessageBodyAttributeMap | SNS.MessageAttributeMap> {
  set(carrier: SQS.MessageBodyAttributeMap | SNS.MessageAttributeMap, key: string, value: string) {
    carrier[key] = {
      DataType: 'String',
      StringValue: value as string,
    };
  }
}
export const contextSetter = new ContextSetter();

export interface AwsSdkContextObject {
  [key: string]: {
    StringValue?: string;
    Value?: string;
  };
}

class ContextGetter implements TextMapGetter<SQS.MessageBodyAttributeMap | SNS.MessageAttributeMap> {
  keys(carrier: SQS.MessageBodyAttributeMap | SNS.MessageAttributeMap): string[] {
    if (carrier == null) {
      return [];
    }
    return Object.keys(carrier);
  }

  get(carrier: AwsSdkContextObject, key: string): undefined | string | string[] {
    return carrier?.[key]?.StringValue || carrier?.[key]?.Value;
  }
}
export const contextGetter = new ContextGetter();

export const injectPropagationContext = (
  attributesMap?: SQS.MessageBodyAttributeMap | SNS.MessageAttributeMap,
): SQS.MessageBodyAttributeMap | SNS.MessageAttributeMap => {
  const attributes = attributesMap ?? {};
  if (Object.keys(attributes).length + propagation.fields().length <= MAX_MESSAGE_ATTRIBUTES) {
    propagation.inject(context.active(), attributes, contextSetter);
  } else {
    diag.warn(
      'aws-sdk instrumentation: cannot set context propagation on SQS/SNS message due to maximum amount of MessageAttributes',
    );
  }
  return attributes;
};

export const extractPropagationContext = (
  message: SQS.Message,
  sqsExtractContextPropagationFromPayload: boolean | undefined,
): AwsSdkContextObject | undefined => {
  const propagationFields = propagation.fields();
  const hasPropagationFields = Object.keys(message.MessageAttributes || []).some(attr =>
    propagationFields.includes(attr),
  );
  if (hasPropagationFields) {
    return message.MessageAttributes;
  } else if (sqsExtractContextPropagationFromPayload && message.Body) {
    try {
      const payload = JSON.parse(message.Body);
      return payload.MessageAttributes;
    } catch {
      diag.debug('failed to parse SQS payload to extract context propagation, trace might be incomplete.');
    }
  }
  return undefined;
};

export const addPropagationFieldsToAttributeNames = (
  messageAttributeNames: string[] = [],
  propagationFields: string[],
) => {
  return messageAttributeNames.length
    ? Array.from(new Set([...messageAttributeNames, ...propagationFields]))
    : propagationFields;
};
