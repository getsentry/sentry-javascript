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

export const AWS_OPERATION = 'aws.operation';
export const CLOUD_REGION = 'cloud.region';
export const AWS_SERVICE_API = 'aws.service.api';
export const AWS_SERVICE_NAME = 'aws.service.name';
export const AWS_SERVICE_IDENTIFIER = 'aws.service.identifier';
export const AWS_REQUEST_ID = 'aws.request.id';
export const AWS_REQUEST_EXTENDED_ID = 'aws.request.extended_id';
export const AWS_SIGNATURE_VERSION = 'aws.signature.version';
export const AWS_S3_BUCKET = 'aws.s3.bucket';
export const AWS_KINESIS_STREAM_NAME = 'aws.kinesis.stream.name';
