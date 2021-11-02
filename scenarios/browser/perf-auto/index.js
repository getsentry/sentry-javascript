import { init } from "@sentry/browser";
import { Integrations } from "@sentry/tracing";

init({
  dsn: "https://00000000000000000000000000000000@o000000.ingest.sentry.io/0000000",
  integrations: [new Integrations.BrowserTracing()],
  tracesSampleRate: 1.0,
});
