export const WEATHER_TOOL_DEFINITION = JSON.stringify([
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get the current weather in a given location',
      parameters: {
        type: 'object',
        properties: {
          latitude: { type: 'number', description: 'The latitude of the location' },
          longitude: { type: 'number', description: 'The longitude of the location' },
        },
        required: ['latitude', 'longitude'],
      },
    },
  },
]);

export const CHAT_TOOL_CALLS = JSON.stringify([
  {
    id: 'call_12345xyz',
    type: 'function',
    function: {
      name: 'get_weather',
      arguments: '{"latitude":48.8566,"longitude":2.3522}',
    },
  },
]);

export const CHAT_STREAM_TOOL_CALLS = JSON.stringify([
  {
    index: 0,
    id: 'call_12345xyz',
    type: 'function',
    function: {
      name: 'get_weather',
      arguments: '{"latitude":48.8566,"longitude":2.3522}',
    },
  },
]);

export const CHAT_GEMINI_STREAM_TOOL_CALLS = JSON.stringify([
  {
    id: 'call_paris',
    type: 'function',
    function: {
      name: 'get_weather',
      arguments: '{"latitude":48.8566,"longitude":2.3522}',
    },
  },
  {
    id: 'call_london',
    type: 'function',
    function: {
      name: 'get_weather',
      arguments: '{"latitude":51.5072,"longitude":-0.1276}',
    },
  },
]);

export const RESPONSES_TOOL_CALLS = JSON.stringify([
  {
    type: 'function_call',
    id: 'fc_12345xyz',
    call_id: 'call_12345xyz',
    name: 'get_weather',
    arguments: '{"latitude":48.8566,"longitude":2.3522}',
  },
]);
