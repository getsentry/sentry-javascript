# OpenAI Codex SDK Integration

This integration provides automatic instrumentation for the OpenAI Codex SDK, capturing telemetry data following OpenTelemetry Semantic Conventions for Generative AI.

## Installation

```bash
npm install @openai/codex-sdk @sentry/node
# or
yarn add @openai/codex-sdk @sentry/node
```

## Basic Usage

### Step 1: Initialize Sentry with the Integration

```typescript
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'your-dsn-here',
  integrations: [
    Sentry.openaiCodexIntegration({
      recordInputs: true, // Record prompts (respects sendDefaultPii by default)
      recordOutputs: true, // Record responses (respects sendDefaultPii by default)
    }),
  ],
});
```

### Step 2: Use the Instrumented Codex SDK

```typescript
import { createInstrumentedCodex } from '@sentry/node';

// Create instrumented Codex instance
const codex = await createInstrumentedCodex();

// Use non-streaming mode
const thread = codex.startThread();
const result = await thread.run('Diagnose the test failure and propose a fix');
console.log(result.finalResponse);

// Use streaming mode
for await (const event of thread.runStreamed('Fix the authentication bug')) {
  if (event.type === 'item.completed') {
    console.log('Tool completed:', event.item);
  }
}
```

## Advanced Usage

### Multiple Agents with Different Names

You can differentiate between multiple Codex agents by providing custom names:

```typescript
const devAgent = await createInstrumentedCodex({}, { name: 'dev-agent' });
const qaAgent = await createInstrumentedCodex({}, { name: 'qa-agent' });
const deployAgent = await createInstrumentedCodex({}, { name: 'deploy-agent' });

// Each agent will be tracked separately in Sentry with its respective name
const devThread = devAgent.startThread();
const qaThread = qaAgent.startThread();
```

### Resuming Previous Threads

```typescript
const codex = await createInstrumentedCodex();

// Start a new thread
const thread = codex.startThread();
const firstResult = await thread.run('Create a plan for the feature');
console.log('Thread ID:', thread.id);

// Later, resume the same thread
const resumedThread = codex.resumeThread(thread.id!);
const secondResult = await resumedThread.run('Now implement step 1 of the plan');
```

### Custom Thread Options

```typescript
const codex = await createInstrumentedCodex();

const thread = codex.startThread({
  workingDirectory: '/path/to/project',
  skipGitRepoCheck: false,
});

const result = await thread.run('Review the code in this directory');
```

### Structured Output with JSON Schema

```typescript
const codex = await createInstrumentedCodex();
const thread = codex.startThread();

const schema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    status: { type: 'string', enum: ['ok', 'action_required'] },
    next_steps: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['summary', 'status'],
};

const result = await thread.run('Summarize the current state of the repository', {
  outputSchema: schema,
});

console.log(JSON.parse(result.finalResponse));
```

## Configuration Options

### Integration Options

Configure at the integration level (applies to all Codex instances):

```typescript
Sentry.init({
  integrations: [
    Sentry.openaiCodexIntegration({
      recordInputs: true, // Record input prompts (default: sendDefaultPii)
      recordOutputs: true, // Record outputs and tool results (default: sendDefaultPii)
      agentName: 'my-agent', // Default agent name (default: 'openai-codex')
    }),
  ],
});
```

### Instance Options

Override at the instance level (takes precedence over integration options):

```typescript
const codex = await createInstrumentedCodex(
  {
    /* Codex options */
  },
  {
    name: 'custom-agent', // Override agent name
    recordInputs: false, // Override input recording
    recordOutputs: false, // Override output recording
  },
);
```

## Captured Data

### Span Hierarchy

The integration creates the following span structure:

```
invoke_agent (Agent invocation)
└── chat (Turn completion)
    ├── execute_tool command_execution (Shell commands)
    ├── execute_tool web_search (Web searches)
    ├── execute_tool file_change (File modifications)
    ├── execute_tool mcp_tool_call (MCP tool calls)
    └── execute_tool agent_message (Agent messages)
```

### Attributes Captured

#### Agent Invocation Span

- `gen_ai.system`: 'openai-codex'
- `gen_ai.operation.name`: 'invoke_agent'
- `gen_ai.agent.name`: Custom agent name
- `gen_ai.request.model`: 'codex'
- `gen_ai.request.messages`: Input prompt (if recordInputs enabled)
- `gen_ai.response.id`: Thread ID
- `gen_ai.response.text`: Final response (if recordOutputs enabled)

#### Chat Span

- `gen_ai.system`: 'openai-codex'
- `gen_ai.operation.name`: 'chat'
- `gen_ai.request.model`: 'codex'
- `gen_ai.response.text`: Turn response text (if recordOutputs enabled)
- `gen_ai.usage.input_tokens`: Input tokens used
- `gen_ai.usage.output_tokens`: Output tokens used
- `gen_ai.usage.total_tokens`: Total tokens (including cached)

#### Tool Execution Spans

- `gen_ai.system`: 'openai-codex'
- `gen_ai.operation.name`: 'execute_tool'
- `gen_ai.tool.name`: Tool name (e.g., 'ls', 'grep', web query)
- `gen_ai.tool.type`: 'function', 'extension', or 'datastore'
- `gen_ai.tool.input`: Tool input (if recordInputs enabled)
- `gen_ai.tool.output`: Tool output (if recordOutputs enabled)

## Tool Types

The integration classifies Codex tools into three OpenTelemetry categories:

### Function Tools (Client-side execution)

- `command_execution`: Shell commands
- `file_change`: File modifications
- `reasoning`: Agent reasoning
- `agent_message`: Agent messages
- `todo_list`: Task management

### Extension Tools (External APIs)

- `web_search`: Web search queries
- `mcp_tool_call`: MCP server tool calls

### Datastore Tools

(Currently none, but future-proof)

## Privacy Considerations

By default, the integration respects your `sendDefaultPii` setting:

```typescript
// Default behavior: respects sendDefaultPii
Sentry.init({
  sendDefaultPii: true, // Enables recordInputs and recordOutputs
  integrations: [Sentry.openaiCodexIntegration()],
});

// Explicitly disable even when sendDefaultPii is true
Sentry.init({
  sendDefaultPii: true,
  integrations: [
    Sentry.openaiCodexIntegration({
      recordInputs: false,
      recordOutputs: false,
    }),
  ],
});

// Explicitly enable even when sendDefaultPii is false
Sentry.init({
  sendDefaultPii: false,
  integrations: [
    Sentry.openaiCodexIntegration({
      recordInputs: true,
      recordOutputs: true,
    }),
  ],
});
```

## Error Handling

The integration automatically captures exceptions and failed tool executions:

```typescript
const codex = await createInstrumentedCodex();
const thread = codex.startThread();

try {
  const result = await thread.run('Invalid command that will fail');
} catch (error) {
  // Error is automatically captured by Sentry
  // Tool execution failures are marked with span status = error
}
```

## Streaming Events

When using `runStreamed()`, all events are captured:

```typescript
for await (const event of thread.runStreamed('Build and test the application')) {
  switch (event.type) {
    case 'thread.started':
      console.log('Thread ID:', event.thread_id);
      break;
    case 'turn.started':
      console.log('Turn started');
      break;
    case 'item.started':
      console.log('Tool started:', event.item.type);
      break;
    case 'item.completed':
      console.log('Tool completed:', event.item.type);
      break;
    case 'turn.completed':
      console.log('Turn completed. Usage:', event.usage);
      break;
  }
}
```

## Limitations

Due to ESM module and bundler limitations, this integration **cannot be automatically patched**. You must use the `createInstrumentedCodex()` helper function.

## TypeScript

Full TypeScript support is included:

```typescript
import type { Codex, Thread, Turn, StreamedTurn, ThreadEvent } from '@sentry/node';

const codex: Codex = await createInstrumentedCodex();
const thread: Thread = codex.startThread();
const result: Turn = await thread.run('prompt');
const stream: StreamedTurn = thread.runStreamed('prompt');
```

## Comparison with Claude Code Integration

This integration follows a similar pattern to the Claude Code integration:

- **Manual wrapping required** (both)
- **Streaming support** (both)
- **Multiple agent support** (both)
- **Thread management**: Codex has explicit `startThread()`/`resumeThread()`, Claude Code is implicit
- **Tool types**: Codex has more granular tool types (command, file, web, MCP)
- **Event structure**: Different event schemas but mapped to same OpenTelemetry conventions

## Links

- [OpenAI Codex SDK Documentation](https://developers.openai.com/codex/sdk)
- [OpenAI Codex GitHub](https://github.com/openai/codex)
- [Sentry AI Monitoring](https://docs.sentry.io/platforms/javascript/guides/node/ai-monitoring/)
- [OpenTelemetry Semantic Conventions for GenAI](https://opentelemetry.io/docs/specs/semconv/gen-ai/)
