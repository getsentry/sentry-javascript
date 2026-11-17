interface Env {
  SENTRY_DSN: string;
}

export default {
  async fetch() {
    throw new Error('Error with a server name');
  },
} satisfies ExportedHandler<Env>;
