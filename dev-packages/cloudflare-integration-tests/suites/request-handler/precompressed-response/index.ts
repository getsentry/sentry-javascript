interface Env {
  SENTRY_DSN: string;
}

const TEXT = 'precompressed';

export default {
  async fetch(): Promise<Response> {
    const gzipped = await new Response(
      new Blob([TEXT]).stream().pipeThrough(new CompressionStream('gzip')),
    ).arrayBuffer();

    // `text/plain` without a Content-Length is classified as streaming, so the SDK replaces the response.
    return new Response(gzipped, {
      encodeBody: 'manual',
      headers: { 'content-type': 'text/plain;charset=utf-8', 'content-encoding': 'gzip' },
    });
  },
} satisfies ExportedHandler<Env>;
