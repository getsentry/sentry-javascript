export const sentryConfig = {
  telemetry: false,
  release: {
    name: "build-information-injection-test",
  },
  _experiments: { injectBuildInformation: true },
};
