/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-aws-sdk
 * - Upstream version: @opentelemetry/instrumentation-aws-sdk@0.73.0
 */
/* eslint-disable */

import { Span, Tracer, SpanKind, Attributes } from '@opentelemetry/api';
import { ATTR_AWS_SNS_TOPIC_ARN, ATTR_MESSAGING_SYSTEM } from '../semconv';
import {
  ATTR_MESSAGING_DESTINATION,
  ATTR_MESSAGING_DESTINATION_KIND,
  MESSAGING_DESTINATION_KIND_VALUE_TOPIC,
} from '../semconv-obsolete';
import { NormalizedRequest, NormalizedResponse, AwsSdkInstrumentationConfig } from '../types';
import { injectPropagationContext } from './MessageAttributes';
import { RequestMetadata, ServiceExtension } from './ServiceExtension';

export class SnsServiceExtension implements ServiceExtension {
  requestPreSpanHook(request: NormalizedRequest, _config: AwsSdkInstrumentationConfig): RequestMetadata {
    let spanKind: SpanKind = SpanKind.CLIENT;
    let spanName = `SNS ${request.commandName}`;
    const spanAttributes: Attributes = {
      [ATTR_MESSAGING_SYSTEM]: 'aws.sns',
    };

    if (request.commandName === 'Publish') {
      spanKind = SpanKind.PRODUCER;

      spanAttributes[ATTR_MESSAGING_DESTINATION_KIND] = MESSAGING_DESTINATION_KIND_VALUE_TOPIC;
      const { TopicArn, TargetArn, PhoneNumber } = request.commandInput;
      spanAttributes[ATTR_MESSAGING_DESTINATION] = this.extractDestinationName(TopicArn, TargetArn, PhoneNumber);
      // ToDO: Use ATTR_MESSAGING_DESTINATION_NAME when implemented
      spanAttributes['messaging.destination.name'] = TopicArn || TargetArn || PhoneNumber || 'unknown';

      spanName = `${PhoneNumber ? 'phone_number' : spanAttributes[ATTR_MESSAGING_DESTINATION]} send`;
    }

    const topicArn = request.commandInput?.TopicArn;
    if (topicArn) {
      spanAttributes[ATTR_AWS_SNS_TOPIC_ARN] = topicArn;
    }

    return {
      isIncoming: false,
      spanAttributes,
      spanKind,
      spanName,
    };
  }

  requestPostSpanHook(request: NormalizedRequest): void {
    if (request.commandName === 'Publish') {
      const origMessageAttributes = request.commandInput['MessageAttributes'] ?? {};
      if (origMessageAttributes) {
        request.commandInput['MessageAttributes'] = injectPropagationContext(origMessageAttributes);
      }
    }
  }

  responseHook(response: NormalizedResponse, span: Span, tracer: Tracer, config: AwsSdkInstrumentationConfig): void {
    const topicArn = response.data?.TopicArn;
    if (topicArn) {
      span.setAttribute(ATTR_AWS_SNS_TOPIC_ARN, topicArn);
    }
  }

  extractDestinationName(topicArn: string, targetArn: string, phoneNumber: string): string {
    if (topicArn || targetArn) {
      const arn = topicArn ?? targetArn;
      try {
        return arn.substring(arn.lastIndexOf(':') + 1);
      } catch (err) {
        return arn;
      }
    } else if (phoneNumber) {
      return phoneNumber;
    } else {
      return 'unknown';
    }
  }
}
