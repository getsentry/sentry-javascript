"use strict";

module.exports = function (environment) {
  const ENV = {
    modulePrefix: "ember-vite",
    environment,
    rootURL: "/",
    locationType: "history",
    EmberENV: {
      EXTEND_PROTOTYPES: false,
      FEATURES: {},
    },
    APP: {},
  };

  ENV.sentryDsn = process.env.E2E_TEST_DSN;

  if (environment === "development") {
  }

  if (environment === "test") {
    ENV.locationType = "none";
    ENV.APP.LOG_ACTIVE_GENERATION = false;
    ENV.APP.LOG_VIEW_LOOKUPS = false;
    ENV.APP.rootElement = "#ember-testing";
    ENV.APP.autoboot = false;
  }

  if (environment === "production") {
  }

  return ENV;
};
