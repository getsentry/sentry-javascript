interface Env {
  PRODUCER: Fetcher;
}

// Nothing is wrapped manually, the Vite plugin wraps the default export.
export default {
  async fetch(_request, env) {
    return env.PRODUCER.fetch('http://fake-host/');
  },
  // workerd calls `tailStream()` with the producer's onset event, then calls
  // the returned object for the later events of that invocation.
  tailStream() {
    return {
      outcome() {
        throw new Error('Error from the tailStream outcome handler');
      },
    };
  },
} satisfies ExportedHandler<Env>;
