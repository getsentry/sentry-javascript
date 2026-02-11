import * as Sentry from '@sentry/cloudflare';

interface Env {
  SENTRY_DSN: string;
}

// Mock Agent class for testing
class MockAgent {
  public state: { count: number };

  public constructor() {
    this.state = { count: 0 };
  }

  public setState(newState: { count: number }): void {
    this.state = newState;
  }

  // Simulate a callable method
  public async increment(value: number): Promise<number> {
    const newCount = this.state.count + value;
    this.setState({ count: newCount });
    return newCount;
  }

  // Simulate a callable method with complex input/output
  public async processTask(task: { id: string; action: string }): Promise<{ result: string; timestamp: number }> {
    return {
      result: `Processed task ${task.id} with action ${task.action}`,
      timestamp: Date.now(),
    };
  }

  // Simulate a callable method that returns Response
  public async handleRequest(message: string): Promise<Response> {
    return new Response(JSON.stringify({ message: `Received: ${message}` }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Instrument the agent with different options based on query params
function getInstrumentedAgent(recordInputs: boolean, recordOutputs: boolean, recordStateChanges: boolean): MockAgent {
  const InstrumentedAgent = Sentry.instrumentCloudflareAgent(MockAgent as any, {
    recordInputs,
    recordOutputs,
    recordStateChanges,
  });
  return new InstrumentedAgent();
}

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
  }),
  {
    async fetch(request: Request, _env, _ctx) {
      const url = new URL(request.url);
      const path = url.pathname;

      // Parse options from query params
      const recordInputs = url.searchParams.get('recordInputs') === 'true';
      const recordOutputs = url.searchParams.get('recordOutputs') === 'true';
      const recordStateChanges = url.searchParams.get('recordStateChanges') === 'true';

      const agent = getInstrumentedAgent(recordInputs, recordOutputs, recordStateChanges);

      if (path === '/increment') {
        const result = await agent.increment(5);
        return new Response(JSON.stringify({ count: result }));
      }

      if (path === '/process-task') {
        const result = await agent.processTask({ id: 'task-1', action: 'analyze' });
        return new Response(JSON.stringify(result));
      }

      if (path === '/handle-request') {
        const response = await agent.handleRequest('Hello, Agent!');
        return response;
      }

      return new Response('Not found', { status: 404 });
    },
  },
);
