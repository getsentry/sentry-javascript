import { init } from "@sentry/browser";

init({
  dsn: "https://00000000000000000000000000000000@o000000.ingest.sentry.io/0000000",
  release: "my-app@1.2.3",
  autoSessionTracking: false,
});
