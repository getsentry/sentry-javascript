const Sentry = require("@sentry/node");

class CustomTransport extends Sentry.Transports.BaseTransport {
  constructor(options) {
    super(options);
  }

  sendEvent(event) {
    console.log("Sending Event");
    return super.sendEvent(event);
  }

  sendSession(session) {
    console.log("Sending Session");
    return super.sendSession(session);
  }
}

Sentry.init({
  dsn: "https://00000000000000000000000000000000@o000000.ingest.sentry.io/0000000",
  transport: CustomTransport,
});
