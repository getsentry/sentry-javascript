export const sentryConfig = {
  telemetry: false,
  // We need to specify these so that upload is attempted. Debug IDs will be injected before then...
  authToken: "fake-auth",
  org: "fake-org",
  project: "fake-project",
};
