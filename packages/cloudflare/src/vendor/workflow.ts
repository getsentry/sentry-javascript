/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/member-ordering */
/* eslint-disable jsdoc/require-jsdoc */
/* eslint-disable @typescript-eslint/explicit-member-accessibility */
// This file vendors in worker types in `cloudflare:workers` because they are not
// exported from `@cloudflare/workers-types` yet.

/* ! *****************************************************************************
Copyright (c) Cloudflare. All rights reserved.
Copyright (c) Microsoft Corporation. All rights reserved.

Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at http://www.apache.org/licenses/LICENSE-2.0
THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
MERCHANTABLITY OR NON-INFRINGEMENT.
See the Apache Version 2.0 License for specific language governing permissions
and limitations under the License.
***************************************************************************** */

import type { ExecutionContext, Rpc } from '@cloudflare/workers-types';

const __WORKFLOW_ENTRYPOINT_BRAND = '__WORKFLOW_ENTRYPOINT_BRAND' as const;

export type WorkflowEvent<T> = {
  payload: Readonly<T>;
  timestamp: Date;
  instanceId: string;
};

export type WorkflowStepEvent<T> = {
  payload: Readonly<T>;
  timestamp: Date;
  type: string;
};

export type WorkflowDurationLabel = 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';
export type WorkflowSleepDuration = `${number} ${WorkflowDurationLabel}${'s' | ''}` | number;
export type WorkflowDelayDuration = WorkflowSleepDuration;
export type WorkflowTimeoutDuration = WorkflowSleepDuration;
export type WorkflowRetentionDuration = WorkflowSleepDuration;

export type WorkflowBackoff = 'constant' | 'linear' | 'exponential';

export type WorkflowStepConfig = {
  retries?: {
    limit: number;
    delay: WorkflowDelayDuration | number;
    backoff?: WorkflowBackoff;
  };
  timeout?: WorkflowTimeoutDuration | number;
};

export abstract class WorkflowStep {
  do<T extends Rpc.Serializable<T>>(name: string, callback: () => Promise<T>): Promise<T>;
  // @ts-expect-error - This is a vendor file, so we don't need to implement the method.
  do<T extends Rpc.Serializable<T>>(name: string, config: WorkflowStepConfig, callback: () => Promise<T>): Promise<T>;
  // @ts-expect-error - This is a vendor file, so we don't need to implement the method.
  sleep: (name: string, duration: WorkflowSleepDuration) => Promise<void>;
  // @ts-expect-error - This is a vendor file, so we don't need to implement the method.
  sleepUntil: (name: string, timestamp: Date | number) => Promise<void>;
  // @ts-expect-error - This is a vendor file, so we don't need to implement the method.
  waitForEvent<T extends Rpc.Serializable<T>>(
    name: string,
    options: {
      type: string;
      timeout?: WorkflowTimeoutDuration | number;
    },
  ): Promise<WorkflowStepEvent<T>>;
}

export abstract class WorkflowEntrypoint<Env = unknown, T extends Rpc.Serializable<T> | unknown = unknown>
  implements Rpc.WorkflowEntrypointBranded
{
  // @ts-expect-error - This is a vendor file, so we don't need to implement the property.
  [__WORKFLOW_ENTRYPOINT_BRAND]: never;
  // @ts-expect-error - This is a vendor file, so we don't need to implement the property.
  protected ctx: ExecutionContext;
  // @ts-expect-error - This is a vendor file, so we don't need to implement the property.
  protected env: Env;
  // @ts-expect-error - This is a vendor file, so we don't need to implement the constructor.
  constructor(ctx: ExecutionContext, env: Env);
  // @ts-expect-error - This is a vendor file, so we don't need to implement the method.
  run(event: Readonly<WorkflowEvent<T>>, step: WorkflowStep): Promise<unknown>;
}
