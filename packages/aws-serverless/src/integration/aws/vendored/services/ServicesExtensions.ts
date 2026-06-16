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

import { Tracer, Span, DiagLogger } from '@opentelemetry/api';
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

  responseHook(
    response: NormalizedResponse,
    span: Span,
    tracer: Tracer,
    config: AwsSdkInstrumentationConfig,
    startTime: number,
  ) {
    const serviceExtension = this.services.get(response.request.serviceName);

    return serviceExtension?.responseHook?.(response, span, tracer, config, startTime);
  }
}
