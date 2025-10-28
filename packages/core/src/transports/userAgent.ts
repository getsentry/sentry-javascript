import type { ClientOptions } from '../types-hoist/options';

/**
 * Takes the SDK metadata and adds the user-agent header to the transport options.
 * This ensures that the SDK sends the user-agent header with SDK name and version to
 * all requests made by the transport.
 *
 * @see https://develop.sentry.dev/sdk/overview/#user-agent
 */
export function addUserAgentToTransportHeaders(options: ClientOptions): void {
  const sdkMetadata = options._metadata?.sdk;
  const sdkUserAgent =
    sdkMetadata?.name && sdkMetadata?.version ? `${sdkMetadata?.name}/${sdkMetadata?.version}` : undefined;

  options.transportOptions = {
    ...options.transportOptions,
    headers: {
      ...(sdkUserAgent && { 'user-agent': sdkUserAgent }),
      ...options.transportOptions?.headers,
    },
  };
}
