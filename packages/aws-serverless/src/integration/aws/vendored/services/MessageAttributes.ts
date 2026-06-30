/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-aws-sdk
 * - Upstream version: @opentelemetry/instrumentation-aws-sdk@0.73.0
 */

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

export const extractPropagationContext = (message: SQS.Message): AwsSdkContextObject | undefined => {
  const propagationFields = propagation.fields();
  const hasPropagationFields = Object.keys(message.MessageAttributes || []).some(attr =>
    propagationFields.includes(attr),
  );
  if (hasPropagationFields) {
    return message.MessageAttributes;
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
