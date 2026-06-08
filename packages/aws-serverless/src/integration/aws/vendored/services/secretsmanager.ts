/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-aws-sdk
 * - Upstream version: @opentelemetry/instrumentation-aws-sdk@0.73.0
 */
/* eslint-disable */

import { Attributes, Span, SpanKind, Tracer } from '@opentelemetry/api';
import { ATTR_AWS_SECRETSMANAGER_SECRET_ARN } from '../semconv';
import { RequestMetadata, ServiceExtension } from './ServiceExtension';
import { NormalizedRequest, NormalizedResponse, AwsSdkInstrumentationConfig } from '../types';

export class SecretsManagerServiceExtension implements ServiceExtension {
  requestPreSpanHook(request: NormalizedRequest, _config: AwsSdkInstrumentationConfig): RequestMetadata {
    const secretId = request.commandInput?.SecretId;
    const spanKind: SpanKind = SpanKind.CLIENT;
    let spanName: string | undefined;
    const spanAttributes: Attributes = {};
    if (typeof secretId === 'string' && secretId.startsWith('arn:aws:secretsmanager:')) {
      spanAttributes[ATTR_AWS_SECRETSMANAGER_SECRET_ARN] = secretId;
    }

    return {
      isIncoming: false,
      spanAttributes,
      spanKind,
      spanName,
    };
  }

  responseHook(response: NormalizedResponse, span: Span, tracer: Tracer, config: AwsSdkInstrumentationConfig): void {
    const secretArn = response.data?.ARN;
    if (secretArn) {
      span.setAttribute(ATTR_AWS_SECRETSMANAGER_SECRET_ARN, secretArn);
    }
  }
}
