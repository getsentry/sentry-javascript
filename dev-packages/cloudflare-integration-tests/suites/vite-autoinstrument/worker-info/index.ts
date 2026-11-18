interface Env {
  SENTRY_DSN: string;
}

export default {
  async fetch() {
    throw new Error('Error with the worker info');
  },
} satisfies ExportedHandler<Env>;
