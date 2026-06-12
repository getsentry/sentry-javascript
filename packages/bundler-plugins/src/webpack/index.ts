import type { SentryWebpackPluginOptions } from "./webpack4and5";
import { sentryWebpackPluginFactory } from "./webpack4and5";
import * as webpack4or5 from "webpack";

const BannerPlugin = webpack4or5?.BannerPlugin || webpack4or5?.default?.BannerPlugin;

const DefinePlugin = webpack4or5?.DefinePlugin || webpack4or5?.default?.DefinePlugin;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const sentryWebpackPlugin: (options?: SentryWebpackPluginOptions) => any =
  sentryWebpackPluginFactory({
    BannerPlugin,
    DefinePlugin,
  });

export { sentryCliBinaryExists } from "../core";

export type { SentryWebpackPluginOptions };
