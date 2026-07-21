/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-aws-sdk
 * - Upstream version: @opentelemetry/instrumentation-aws-sdk@0.73.0
 */

import { InstrumentationConfig } from '@opentelemetry/instrumentation';

export type CommandInput = Record<string, any>;

/**
 * These are normalized request and response.
 * They organize the relevant data in one interface which can be processed in a
 * uniform manner in hooks
 */
export interface NormalizedRequest {
  serviceName: string;
  commandName: string;
  commandInput: CommandInput;
  region?: string;
}
export interface NormalizedResponse {
  data: any;
  request: NormalizedRequest;
  requestId: string;
}

export type AwsSdkInstrumentationConfig = InstrumentationConfig;
