import { Package } from './package';

/**
 * The SDK Interface describes the Sentry SDK and its configuration used to capture and transmit an event.
 * @external https://develop.sentry.dev/sdk/event-payloads/sdk/
 */
export interface SdkInfo {
  /**
   * The name of the SDK. The format is entity.ecosystem[.flavor] where entity
   * identifies the developer of the SDK, ecosystem refers to the programming
   * language or platform where the SDK is to be used and the optional flavor
   * is used to identify standalone SDKs that are part of a major ecosystem.
   */
  name: string;

  /**
   * The version of the SDK.
   * It should have the Semantic Versioning format MAJOR.MINOR.PATCH,
   * without any prefix (no v or anything else in front of the major version number).
   */
  version: string;

  /**
   * A list of names identifying enabled integrations.
   * The list should have all enabled integrations,
   * including default integrations.
   * Default integrations are included because different SDK releases may
   * contain different default integrations.
   */
  integrations?: string[];

  /**
   * A list of packages that were installed as part of this SDK or the activated integrations.
   * Each package consists of a name in the format source:identifier and version.
   * If the source is a Git repository, the source should be git,
   * the identifier should be a checkout link and the version should be a
   * Git reference (branch, tag or SHA).
   */
  packages?: Package[];
}
