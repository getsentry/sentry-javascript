/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-aws-sdk
 * - Upstream version: @opentelemetry/instrumentation-aws-sdk@0.73.0
 */

import { Span, DiagLogger } from '@opentelemetry/api';
import { ServiceExtension, RequestMetadata } from './ServiceExtension';
import { SqsServiceExtension } from './sqs';
import { AwsSdkInstrumentationConfig, NormalizedRequest, NormalizedResponse } from '../types';
import { BedrockRuntimeServiceExtension } from './bedrock-runtime';
import { DynamodbServiceExtension } from './dynamodb';
import { SecretsManagerServiceExtension } from './secretsmanager';
import { SnsServiceExtension } from './sns';
import { StepFunctionsServiceExtension } from './stepfunctions';
import { LambdaServiceExtension } from './lambda';
import { S3ServiceExtension } from './s3';
import { KinesisServiceExtension } from './kinesis';

export class ServicesExtensions implements ServiceExtension {
  services: Map<string, ServiceExtension> = new Map();

  constructor() {
    this.registerServices();
  }

  private registerServices() {
    this.services.set('SecretsManager', new SecretsManagerServiceExtension());
    this.services.set('SFN', new StepFunctionsServiceExtension());
    this.services.set('SQS', new SqsServiceExtension());
    this.services.set('SNS', new SnsServiceExtension());
    this.services.set('DynamoDB', new DynamodbServiceExtension());
    this.services.set('Lambda', new LambdaServiceExtension());
    this.services.set('S3', new S3ServiceExtension());
    this.services.set('Kinesis', new KinesisServiceExtension());
    this.services.set('BedrockRuntime', new BedrockRuntimeServiceExtension());
  }

  requestPreSpanHook(
    request: NormalizedRequest,
    config: AwsSdkInstrumentationConfig,
    diag: DiagLogger,
  ): RequestMetadata {
    const serviceExtension = this.services.get(request.serviceName);
    if (!serviceExtension)
      return {
        isIncoming: false,
      };
    return serviceExtension.requestPreSpanHook(request, config, diag);
  }

  requestPostSpanHook(request: NormalizedRequest) {
    const serviceExtension = this.services.get(request.serviceName);
    if (!serviceExtension?.requestPostSpanHook) return;
    return serviceExtension.requestPostSpanHook(request);
  }

  responseHook(response: NormalizedResponse, span: Span) {
    const serviceExtension = this.services.get(response.request.serviceName);

    return serviceExtension?.responseHook?.(response, span);
  }
}
