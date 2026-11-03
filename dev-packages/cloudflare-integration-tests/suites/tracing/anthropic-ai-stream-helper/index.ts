import Anthropic from '@anthropic-ai/sdk';

// The Sentry Vite plugin instruments this worker at build time, so the `@anthropic-ai/sdk` calls below
// go through the diagnostics-channel integration (not `instrumentAnthropicAiClient`), the way an app
// built with the plugin does.

/** A canned SSE body for a streamed message, named after the prompt so a test can tell the calls apart. */
function streamedMessage(id: string, model: string): string {
  const events = [
    {
      type: 'message_start',
      message: { id, type: 'message', role: 'assistant', model, content: [], usage: { input_tokens: 10 } },
    },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello!' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 15 } },
    { type: 'message_stop' },
  ];
  return events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('');
}

const mockFetch: typeof fetch = async (_input, init) => {
  const body = JSON.parse(String(init?.body)) as { model: string; messages: { content: string }[] };
  return new Response(streamedMessage(`msg_${body.messages[0]!.content}`, body.model), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
};

export default {
  async fetch(request) {
    const client = new Anthropic({ apiKey: 'mock-api-key', fetch: mockFetch });
    const url = new URL(request.url);

    // `messages.stream()` calls `messages.create({ stream: true })` underneath, tagged with a helper
    // header. Its own channel covers the call, so the nested create must not get a second span.
    if (url.pathname === '/stream') {
      const message = await client.messages
        .stream({ model: 'claude-3-haiku-20240307', max_tokens: 10, messages: [{ role: 'user', content: 'stream' }] })
        .finalMessage();
      return Response.json(message);
    }

    // `beta.messages.stream()` sends the same header, but no channel covers the beta helper, so its
    // nested create is the only chance for a span and must keep it.
    if (url.pathname === '/beta-stream') {
      const message = await client.beta.messages
        .stream({
          model: 'claude-3-haiku-20240307',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'beta_stream' }],
        })
        .finalMessage();
      return Response.json(message);
    }

    return new Response('not found', { status: 404 });
  },
} satisfies ExportedHandler;
