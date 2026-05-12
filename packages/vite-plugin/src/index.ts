import type { SentryRollupPluginOptions } from "@sentry/rollup-plugin";
import { _rollupPluginInternal } from "@sentry/rollup-plugin";
import { createRequire } from "node:module";

interface SentryVitePlugin {
  name: string;
  enforce: "pre";
}

function getViteMajorVersion(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - Rollup already transpiles this for us
    const req = createRequire(import.meta.url);
    const vite = req("vite") as { version?: string };
    return vite.version?.split(".")[0];
  } catch (err) {
    // do nothing, we'll just not report a version
  }

  return undefined;
}

export const sentryVitePlugin = (options?: SentryRollupPluginOptions): SentryVitePlugin[] => {
  return [
    {
      enforce: "pre",
      ..._rollupPluginInternal(options, "vite", getViteMajorVersion()),
    },
  ];
};

export type { Options as SentryVitePluginOptions } from "@sentry/bundler-plugin-core";
export { sentryCliBinaryExists } from "@sentry/bundler-plugin-core";
