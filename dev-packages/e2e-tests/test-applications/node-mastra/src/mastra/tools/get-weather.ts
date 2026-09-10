import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const getWeatherTool = createTool({
  id: 'get_weather',
  description: 'Get the current weather for a city.',
  inputSchema: z.object({ city: z.string().min(1) }),
  outputSchema: z.object({
    city: z.string(),
    condition: z.string(),
    temperatureC: z.number(),
  }),
  async execute({ context }) {
    return { city: context.city, condition: 'Sunny', temperatureC: 22 };
  },
});
