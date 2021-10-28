const Sentry = require("@sentry/node");

Sentry.init({
  dsn: "https://00000000000000000000000000000000@o000000.ingest.sentry.io/0000000",
});

Sentry.captureException(new Error("error here!"));
