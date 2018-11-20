// Very happy integration that'll prepend and append very happy stick figure to the message
class HappyIntegration {
  constructor() {
    this.name = "HappyIntegration";
  }

  setupOnce() {
    Sentry.addGlobalEventProcessor(async (event) => {
      const self = getCurrentHub().getIntegration(HappyIntegration);
      // Run the integration ONLY when it was installed on the current Hub
      if (self) {
        if (event.message === "Happy Message") {
          event.message = `\\o/ ${event.message} \\o/`;
        }
      }
      return event;
    });
  }
}

class HappyTransport extends Sentry.Transports.BaseTransport {
  captureEvent(event) {
    console.log(`This is the place where you'd implement your own sending logic. It'd get url: ${this.url} and an event itself:`, event);

    return {
      status: 'success'
    }
  }
}

Sentry.init({
  // Client's DSN.
  dsn: "https://363a337c11a64611be4845ad6e24f3ac@sentry.io/297378",
  // An array of strings or regexps that'll be used to ignore specific errors based on their type/message
  ignoreErrors: [/PickleRick_\d\d/, "RangeError"],
  // // An array of strings or regexps that'll be used to ignore specific errors based on their origin url
  blacklistUrls: ["external-lib.js"],
  // // An array of strings or regexps that'll be used to allow specific errors based on their origin url
  whitelistUrls: ["http://localhost:5000", "https://browser.sentry-cdn"],
  // // Debug mode with valuable initialization/lifecycle informations.
  debug: true,
  // Whether SDK should be enabled or not.
  enabled: true,
  // Custom integrations callback
  integrations(integrations) {
    return [new HappyIntegration(), ...integrations];
  },
  // A release identifier.
  release: "1537345109360",
  // An environment identifier.
  environment: "staging",
  // Custom event transport that will be used to send things to Sentry
  transport: HappyTransport,
  // Method called for every captured event
  async beforeSend(event, hint) {
    // Because beforeSend and beforeBreadcrumb are async, user can fetch some data
    // return a promise, or whatever he wants
    // Our CustomError defined in errors.js has `someMethodAttachedToOurCustomError`
    // which can mimick something like a network request to grab more detailed error info or something.
    // hint is original exception that was triggered, so we check for our CustomError name
    if (hint.originalException.name === "CustomError") {
      const serverData = await hint.originalException.someMethodAttachedToOurCustomError();
      event.extra = {
        ...event.extra,
        serverData
      };
    }
    console.log(event);
    return event;
  },
  // Method called for every captured breadcrumb
  beforeBreadcrumb(breadcrumb, hint) {
    // We ignore our own logger and rest of the buttons just for presentation purposes
    if (breadcrumb.message.startsWith("Sentry Logger")) return null;
    if (breadcrumb.category !== "ui.click" || hint.event.target.id !== "breadcrumb-hint") return null;

    // If we have a `ui.click` type of breadcrumb, eg. clicking on a button we defined in index.html
    // We will extract a `data-label` attribute from it and use it as a part of the message
    if (breadcrumb.category === "ui.click") {
      const label = hint.event.target.dataset.label;
      if (label) {
        breadcrumb.message = `User clicked on a button with label "${label}"`;
      }
    }
    console.log(breadcrumb);
    return breadcrumb;
  }
});

// Testing code, irrelevant vvvvv

document.addEventListener("DOMContentLoaded", () => {
  document.querySelector("#blacklist-url").addEventListener("click", () => {
    const script = document.createElement("script");
    script.crossOrigin = "anonymous";
    script.src =
      "https://rawgit.com/kamilogorek/cfbe9f92196c6c61053b28b2d42e2f5d/raw/3aef6ff5e2fd2ad4a84205cd71e2496a445ebe1d/external-lib.js";
    document.body.appendChild(script);
  });

  document.querySelector("#whitelist-url").addEventListener("click", () => {
    const script = document.createElement("script");
    script.crossOrigin = "anonymous";
    script.src =
      "https://rawgit.com/kamilogorek/cb67dafbd0e12b782bdcc1fbcaed2b87/raw/3aef6ff5e2fd2ad4a84205cd71e2496a445ebe1d/lib.js";
    document.body.appendChild(script);
  });

  document.querySelector("#ignore-message").addEventListener("click", () => {
    throw new Error("Exception that will be ignored because of this keyword => PickleRick_42 <=");
  });

  document.querySelector("#ignore-type").addEventListener("click", () => {
    throw new RangeError("Exception that will be ignored because of it's type");
  });

  document.querySelector("#regular-exception").addEventListener("click", () => {
    throw new Error(`Regular exception no. ${Date.now()}`);
  });

  document.querySelector("#capture-exception").addEventListener("click", () => {
    Sentry.captureException(new Error(`captureException call no. ${Date.now()}`));
  });

  document.querySelector("#capture-message").addEventListener("click", () => {
    Sentry.captureMessage(`captureMessage call no. ${Date.now()}`);
  });

  document.querySelector("#duplicate-exception").addEventListener("click", () => {
    Sentry.captureException(new Error("duplicated exception"));
  });

  document.querySelector("#duplicate-message").addEventListener("click", () => {
    Sentry.captureMessage("duplicate captureMessage");
  });

  document.querySelector("#integration-example").addEventListener("click", () => {
    Sentry.captureMessage("Happy Message");
  });

  document.querySelector("#exception-hint").addEventListener("click", () => {
    class CustomError extends Error {
      constructor(...args) {
        super(...args);
        this.name = "CustomError";
      }
      someMethodAttachedToOurCustomError() {
        return new Promise(resolve => {
          resolve("some data, who knows what exactly");
        });
      }
    }

    throw new CustomError("Hey there");
  });

  document.querySelector("#breadcrumb-hint").addEventListener("click", () => {});
});
