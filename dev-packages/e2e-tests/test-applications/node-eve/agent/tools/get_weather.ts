import * as Sentry from '@sentry/node';
import { defineTool } from 'eve/tools';
import { z } from 'zod';

export default defineTool({
  description: 'Get the current weather for a city.',
  inputSchema: z.object({ city: z.string().min(1) }),
  async execute({ city }) {
    // Manual instrumentation inside a tool call: eve runs `execute` while the
    // SDK's `gen_ai.execute_tool` span is active, so this user span should nest
    // under it. The e2e test asserts that parent/child link.
    return Sentry.startSpan(
      { name: 'resolve-weather', op: 'gen_ai.tool.manual', attributes: { 'weather.city': city } },
      () => ({ city, condition: 'Sunny', temperatureC: 22 }),
    );
  },
});
