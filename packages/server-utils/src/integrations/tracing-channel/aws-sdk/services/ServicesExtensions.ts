import type { Span } from '@sentry/core';
import type { NormalizedRequest, NormalizedResponse, RequestMetadata } from '../types';
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
  // Per-service extensions, keyed by the client's `serviceId` (e.g. `'S3'`). Services without a
  // registered extension still get the base rpc span from the subscriber.
  private _services: Map<string, ServiceExtension> = new Map<string, ServiceExtension>([
    ['SecretsManager', new SecretsManagerServiceExtension()],
    ['SFN', new StepFunctionsServiceExtension()],
    ['SQS', new SqsServiceExtension()],
    ['SNS', new SnsServiceExtension()],
    ['DynamoDB', new DynamodbServiceExtension()],
    ['Lambda', new LambdaServiceExtension()],
    ['S3', new S3ServiceExtension()],
    ['Kinesis', new KinesisServiceExtension()],
  ]);

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

  public responseHook(response: NormalizedResponse, span: Span): void {
    const serviceExtension = this._services.get(response.request.serviceName);
    serviceExtension?.responseHook?.(response, span);
  }
}
