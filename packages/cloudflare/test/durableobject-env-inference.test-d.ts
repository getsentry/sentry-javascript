import { instrumentDurableObjectWithSentry } from '../src/durableobject';

interface Env {
  E2E_TEST_DSN: string;
}

type AgentContext = DurableObjectState;

declare class AgentBase {
  constructor(ctx: AgentContext, env: Env);
}

class MyBaseAgent extends AgentBase {}

export const MyAgent = instrumentDurableObjectWithSentry(
  env => ({
    dsn: env.E2E_TEST_DSN,
    tracesSampleRate: 1,
  }),
  MyBaseAgent,
);
