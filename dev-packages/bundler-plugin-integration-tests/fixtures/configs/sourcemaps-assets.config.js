export const sentryConfig = {
  telemetry: false,
  authToken: "fake-auth",
  org: "fake-org",
  project: "fake-project",
  release: { inject: false },
  sourcemaps: {
    assets: ["out/sourcemaps-assets/entry1.js"],
  },
};
