import type { SentryWebpackPluginOptions } from "./webpack4and5";
import { sentryWebpackPluginFactory } from "./webpack4and5";

const createSentryWebpackPlugin = sentryWebpackPluginFactory();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const sentryWebpackPlugin: (options?: SentryWebpackPluginOptions) => any =
  createSentryWebpackPlugin;

export { sentryCliBinaryExists } from "../core";

export type { SentryWebpackPluginOptions };
