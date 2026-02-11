/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.toml`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */
import * as Sentry from '@sentry/cloudflare';
import { createMcpHandler } from 'agents/mcp';
import * as z from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.E2E_TEST_DSN,
    environment: 'qa', // dynamic sampling bias to keep transactions
    tunnel: `http://localhost:3031/`, // proxy server
    tracesSampleRate: 1.0,
    sendDefaultPii: true,
    debug: true,
    transportOptions: {
      // We are doing a lot of events at once in this test
      bufferSize: 1000,
    },
  }),
  {
    async fetch(request, env, ctx) {
      const server = new McpServer({
        name: 'cloudflare-mcp',
        version: '1.0.0',
      });

      const span = Sentry.getActiveSpan();

      if (span) {
        span.setAttribute('mcp.server.extra', ' /|\ ^._.^ /|\ ');
      }

      server.registerTool(
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

          // simulate a long running tool
          await new Promise(resolve => setTimeout(resolve, 500));

          if (span) {
            span.setAttribute('mcp.tool.name', 'my-tool');
            span.setAttribute('mcp.tool.extra', 'ƸӜƷ');
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

      const handler = createMcpHandler(Sentry.wrapMcpServerWithSentry(server), {
        route: '/mcp',
      });

      return handler(request, env, ctx);
    },
  } satisfies ExportedHandler<Env>,
);
