import * as Sentry from '@sentry/cloudflare';
import { McpAgent } from 'agents/mcp';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';

class MyMCPAgentBase extends McpAgent<Env, unknown, Record<string, unknown>> {
  #mcpServer = new McpServer({
    name: 'cloudflare-mcp-agent',
    version: '1.0.0',
  });

  get server() {
    return Sentry.wrapMcpServerWithSentry(this.#mcpServer);
  }

  async init(): Promise<void> {
    this.#mcpServer.registerTool(
      'my-tool',
      {
        title: 'My Tool',
        description: 'My Tool Description',
        inputSchema: {
          message: z.string(),
        },
      },
      async ({ message }) => {
        const span = Sentry.getActiveSpan();

        await new Promise(resolve => setTimeout(resolve, 500));

        if (span) {
          span.setAttribute('mcp.tool.name', 'my-tool');
          span.setAttribute('mcp.tool.extra', 'from-mcpagent');
          span.setAttribute('mcp.tool.input', JSON.stringify({ message }));
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: `Tool my-tool: ${message}`,
            },
          ],
        };
      },
    );
  }
}

export const MyMCPAgent = Sentry.instrumentDurableObjectWithSentry(
  (env: Env) => ({
    dsn: env.E2E_TEST_DSN,
    environment: 'qa',
    tunnel: `http://localhost:3031/`,
    tracesSampleRate: 1.0,
    sendDefaultPii: true,
    debug: true,
    transportOptions: {
      bufferSize: 1000,
    },
  }),
  MyMCPAgentBase,
);

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.E2E_TEST_DSN,
    environment: 'qa',
    tunnel: `http://localhost:3031/`,
    tracesSampleRate: 1.0,
    sendDefaultPii: true,
    debug: true,
    transportOptions: {
      bufferSize: 1000,
    },
  }),
  MyMCPAgent.serve('/mcp', { binding: 'MCP_AGENT' }),
);
