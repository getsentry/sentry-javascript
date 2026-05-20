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

import { Attributes, SpanKind } from '@opentelemetry/api';
import { ATTR_AWS_STEP_FUNCTIONS_ACTIVITY_ARN, ATTR_AWS_STEP_FUNCTIONS_STATE_MACHINE_ARN } from '../semconv';
import { RequestMetadata, ServiceExtension } from './ServiceExtension';
import { NormalizedRequest, AwsSdkInstrumentationConfig } from '../types';

export class StepFunctionsServiceExtension implements ServiceExtension {
  requestPreSpanHook(request: NormalizedRequest, _config: AwsSdkInstrumentationConfig): RequestMetadata {
    const stateMachineArn = request.commandInput?.stateMachineArn;
    const activityArn = request.commandInput?.activityArn;
    const spanKind: SpanKind = SpanKind.CLIENT;
    const spanAttributes: Attributes = {};

    if (stateMachineArn) {
      spanAttributes[ATTR_AWS_STEP_FUNCTIONS_STATE_MACHINE_ARN] = stateMachineArn;
    }

    if (activityArn) {
      spanAttributes[ATTR_AWS_STEP_FUNCTIONS_ACTIVITY_ARN] = activityArn;
    }

    return {
      isIncoming: false,
      spanAttributes,
      spanKind,
    };
  }
}
