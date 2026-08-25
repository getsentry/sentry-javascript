import {
  AWS_STEP_FUNCTIONS_ACTIVITY_ARN as ATTR_AWS_STEP_FUNCTIONS_ACTIVITY_ARN,
  AWS_STEP_FUNCTIONS_STATE_MACHINE_ARN as ATTR_AWS_STEP_FUNCTIONS_STATE_MACHINE_ARN,
} from '@sentry/conventions/attributes';
import type { NormalizedRequest } from '../types';
import type { RequestMetadata, ServiceExtension } from './ServiceExtension';

export class StepFunctionsServiceExtension implements ServiceExtension {
  public requestPreSpanHook(request: NormalizedRequest): RequestMetadata {
    const stateMachineArn = request.commandInput?.stateMachineArn;
    const activityArn = request.commandInput?.activityArn;
    const spanAttributes: Record<string, unknown> = {};

    if (stateMachineArn) {
      spanAttributes[ATTR_AWS_STEP_FUNCTIONS_STATE_MACHINE_ARN] = stateMachineArn;
    }

    if (activityArn) {
      spanAttributes[ATTR_AWS_STEP_FUNCTIONS_ACTIVITY_ARN] = activityArn;
    }

    return {
      spanAttributes,
    };
  }
}
