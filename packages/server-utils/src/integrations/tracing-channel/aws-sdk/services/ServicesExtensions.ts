import type { Span } from '@sentry/core';
import type { NormalizedRequest, NormalizedResponse, RequestMetadata } from '../types';
import { BedrockRuntimeServiceExtension } from './bedrock-runtime';
import { DynamodbServiceExtension } from './dynamodb';
import { KinesisServiceExtension } from './kinesis';
import { LambdaServiceExtension } from './lambda';
import { S3ServiceExtension } from './s3';
import { SecretsManagerServiceExtension } from './secretsmanager';
import type { ServiceExtension } from './ServiceExtension';
import { SnsServiceExtension } from './sns';
import { SqsServiceExtension } from './sqs';
import { StepFunctionsServiceExtension } from './stepfunctions';

export class ServicesExtensions implements ServiceExtension {
  private _services: Map<string, ServiceExtension>;

  public constructor() {
    this._services = new Map();
    this._services.set('SecretsManager', new SecretsManagerServiceExtension());
    this._services.set('SFN', new StepFunctionsServiceExtension());
    this._services.set('SQS', new SqsServiceExtension());
    this._services.set('SNS', new SnsServiceExtension());
    this._services.set('DynamoDB', new DynamodbServiceExtension());
    this._services.set('Lambda', new LambdaServiceExtension());
    this._services.set('S3', new S3ServiceExtension());
    this._services.set('Kinesis', new KinesisServiceExtension());
    this._services.set('BedrockRuntime', new BedrockRuntimeServiceExtension());
  }

  public requestPreSpanHook(request: NormalizedRequest): RequestMetadata {
    const serviceExtension = this._services.get(request.serviceName);
    if (!serviceExtension) {
      return {};
    }
    return serviceExtension.requestPreSpanHook(request);
  }

  public requestPostSpanHook(request: NormalizedRequest, span: Span): void {
    const serviceExtension = this._services.get(request.serviceName);
    serviceExtension?.requestPostSpanHook?.(request, span);
  }

  public responseHook(response: NormalizedResponse, span: Span): any | undefined {
    const serviceExtension = this._services.get(response.request.serviceName);
    return serviceExtension?.responseHook?.(response, span);
  }
}
