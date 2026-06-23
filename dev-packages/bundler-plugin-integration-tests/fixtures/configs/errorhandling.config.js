export function getErrorHandlingConfig(port) {
  return {
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    url: `http://localhost:${port}`,
    authToken: "fake-auth",
    org: "fake-org",
    project: "fake-project",
    release: {
      name: "1.0.0",
    },
    debug: true,
  };
}
