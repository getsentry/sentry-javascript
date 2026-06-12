// Config that uses a Promise for filesToDeleteAfterUpload
// This tests that the plugin can handle async file deletion patterns
export function getSentryConfig(outDir) {
  const fileDeletionPromise = new Promise((resolve) => {
    setTimeout(() => {
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      resolve([`${outDir}/basic.js.map`]);
    }, 100);
  });

  return {
    telemetry: false,
    sourcemaps: {
      filesToDeleteAfterUpload: fileDeletionPromise,
    },
  };
}
