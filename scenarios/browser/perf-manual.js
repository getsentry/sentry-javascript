import { init, startTransaction } from "@sentry/browser";
import "@sentry/tracing";

init({
  dsn: "https://00000000000000000000000000000000@o000000.ingest.sentry.io/0000000",
  tracesSampleRate: 1.0,
});

const transaction = startTransaction({ op: "task", name: "Important Stuff" });

setTimeout(() => {
  transaction.finish();
}, 1000);
