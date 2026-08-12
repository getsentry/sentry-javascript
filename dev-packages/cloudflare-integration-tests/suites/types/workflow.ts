/**
 * Type tests for `instrumentWorkflowWithSentry`.
 *
 * The env of the options callback must be inferred from the Workflow class, and the
 * payload type must keep flowing into `run`.
 */
import { WorkflowEntrypoint } from 'cloudflare:workers';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { instrumentWorkflowWithSentry } from '@sentry/cloudflare';
import { expectTypeOf } from 'vitest';

interface WorkflowEnv {
  SENTRY_DSN: string;
}

interface WorkflowPayload {
  orderId: string;
}

// ---------------------------------------------------------------------------
// 1. Env and payload inferred from the `WorkflowEntrypoint<Env, Payload>` base class
// ---------------------------------------------------------------------------
class MyWorkflow extends WorkflowEntrypoint<WorkflowEnv, WorkflowPayload> {
  override async run(event: WorkflowEvent<WorkflowPayload>, step: WorkflowStep): Promise<void> {
    expectTypeOf(event.payload.orderId).toEqualTypeOf<string>();
    await step.do('step', async () => {
      void event.payload.orderId;
    });
  }
}

export const instrumentedWorkflow = instrumentWorkflowWithSentry(env => {
  expectTypeOf(env).toEqualTypeOf<WorkflowEnv>();
  return { dsn: env.SENTRY_DSN };
}, MyWorkflow);

const _workflowClass: typeof MyWorkflow = instrumentedWorkflow;

// ---------------------------------------------------------------------------
// 2. Explicit constructor with env annotation, bare base class
// ---------------------------------------------------------------------------
class MyWorkflowCustomCtor extends WorkflowEntrypoint {
  constructor(ctx: ExecutionContext, env: WorkflowEnv) {
    super(ctx, env);
  }
}

export const instrumentedWorkflowCustomCtor = instrumentWorkflowWithSentry(env => {
  expectTypeOf(env).toEqualTypeOf<WorkflowEnv>();
  return { dsn: env.SENTRY_DSN };
}, MyWorkflowCustomCtor);
