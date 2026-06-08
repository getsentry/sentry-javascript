/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-aws-sdk
 * - Upstream version: @opentelemetry/instrumentation-aws-sdk@0.73.0
 */

import { Attributes, SpanKind } from '@opentelemetry/api';
import { AttributeNames } from '../enums';
import { AwsSdkInstrumentationConfig, NormalizedRequest } from '../types';
import { RequestMetadata, ServiceExtension } from './ServiceExtension';

export class KinesisServiceExtension implements ServiceExtension {
  requestPreSpanHook(request: NormalizedRequest, _config: AwsSdkInstrumentationConfig): RequestMetadata {
    const streamName = request.commandInput?.StreamName;
    const spanKind: SpanKind = SpanKind.CLIENT;
    const spanAttributes: Attributes = {};

    if (streamName) {
      spanAttributes[AttributeNames.AWS_KINESIS_STREAM_NAME] = streamName;
    }

    const isIncoming = false;

    return {
      isIncoming,
      spanAttributes,
      spanKind,
    };
  }
}
