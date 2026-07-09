import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { IntegrationFn, Span } from '@sentry/core';
import {
  debug,
  defineIntegration,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_KIND,
  startInactiveSpan,
  waitForTracingChannelBinding,
} from '@sentry/core';
import { HTTP_STATUS_CODE } from '@sentry/conventions/attributes';
import { DEBUG_BUILD } from '../../../debug-build';
import { CHANNELS } from '../../../orchestrion/channels';
import type { TracingChannelLifeCycleOptions } from '../../../tracing-channel';
import { bindTracingChannelToSpan } from '../../../tracing-channel';
import { AWS_REQUEST_EXTENDED_ID, AWS_REQUEST_ID, AWS_SDK_ORIGIN, CLOUD_REGION } from './constants';
import { ServicesExtensions } from './services';
import type { NormalizedRequest, NormalizedResponse, RequestMetadata } from './types';
import { extractAttributesFromNormalizedRequest, normalizeV3Request, removeSuffixFromStringIfExists } from './utils';

// Same name as the OTel `Aws` integration by design, so enabling injection swaps this in for it.
const INTEGRATION_NAME = 'Aws' as const;

// The context orchestrion's transform attaches to the channel: `arguments` is the live args of the
// wrapped `Client.prototype.send` call (`[command, ...]`), `self` the client, `result`/`error` the
// settled value. The `_sentry*` fields are stashed by us across the call's lifecycle.
interface AwsSendChannelContext {
  arguments: unknown[];
  self?: { config?: AwsClientConfig; constructor?: { name?: string } };
  result?: unknown;
  error?: unknown;
  _sentryNormalizedRequest?: NormalizedRequest;
  _sentryRequestMetadata?: RequestMetadata;
}

interface AwsClientConfig {
  serviceId?: string;
  region?: () => string | Promise<string> | undefined;
}

interface AwsV3Command {
  input?: Record<string, unknown>;
  constructor?: { name?: string };
}

/** Runs a span-building callback so a throw inside it can never break the user's aws-sdk call. */
function safe<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch (error) {
    DEBUG_BUILD && debug.warn('[orchestrion:aws-sdk] error building span', error);
    return undefined;
  }
}

function setMetadataAttributes(span: Span, metadata: Record<string, any> | undefined): void {
  if (!metadata) {
    return;
  }
  if (metadata.requestId) {
    span.setAttribute(AWS_REQUEST_ID, metadata.requestId);
  }
  if (metadata.httpStatusCode) {
    // oxlint-disable-next-line typescript/no-deprecated
    span.setAttribute(HTTP_STATUS_CODE, metadata.httpStatusCode);
  }
  if (metadata.extendedRequestId) {
    span.setAttribute(AWS_REQUEST_EXTENDED_ID, metadata.extendedRequestId);
  }
}

const _awsChannelIntegration = (() => {
  const servicesExtensions = new ServicesExtensions();

  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // `tracingChannel` is unavailable before Node 18.19 so do nothing in that case.
      if (!diagnosticsChannel.tracingChannel) {
        return;
      }

      const getSpan = (data: AwsSendChannelContext): Span | undefined =>
        safe(() => {
          const command = data.arguments[0] as AwsV3Command | undefined;
          const commandInput = command?.input;
          const commandName = command?.constructor?.name;
          if (!command || !commandName || !commandInput) {
            // Not a recognizable v3 command call; leave the active context untouched.
            return undefined;
          }

          const clientConfig = data.self?.config;
          const serviceName =
            clientConfig?.serviceId ??
            // `clientName` isn't available at the `send` boundary; fall back to the client's
            // constructor name (e.g. `S3Client` -> `S3`). `serviceId` is set for all AWS clients.
            removeSuffixFromStringIfExists(data.self?.constructor?.name || 'AWS', 'Client');

          const normalizedRequest = normalizeV3Request(serviceName, commandName, commandInput, undefined);
          const requestMetadata = servicesExtensions.requestPreSpanHook(normalizedRequest);

          const span = startInactiveSpan({
            name: requestMetadata.spanName ?? `${normalizedRequest.serviceName}.${normalizedRequest.commandName}`,
            kind: requestMetadata.spanKind ?? SPAN_KIND.CLIENT,
            attributes: {
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: AWS_SDK_ORIGIN,
              ...extractAttributesFromNormalizedRequest(normalizedRequest),
              ...requestMetadata.spanAttributes,
            },
          });

          data._sentryNormalizedRequest = normalizedRequest;
          data._sentryRequestMetadata = requestMetadata;

          // `region` resolves asynchronously; set it on the span (still open until `send` settles)
          // and backfill it on the normalized request once available.
          Promise.resolve(clientConfig?.region?.())
            .then(region => {
              if (region) {
                normalizedRequest.region = region;
                span.setAttribute(CLOUD_REGION, region);
              }
            })
            .catch(() => {
              // Nothing to do; continue without a region.
            });

          // Inject trace-propagation headers into outgoing messages (SQS/SNS/Lambda). Runs before
          // `send` proceeds, so the mutated `commandInput` is used to build the request.
          safe(() => servicesExtensions.requestPostSpanHook(normalizedRequest, span));

          return span;
        });

      const opts: TracingChannelLifeCycleOptions<AwsSendChannelContext> = {
        deferSpanEnd({ span, data }) {
          const normalizedRequest = data._sentryNormalizedRequest;
          const requestMetadata = data._sentryRequestMetadata;
          if (!normalizedRequest) {
            return false;
          }

          const failed = 'error' in data;

          safe(() => {
            if (failed) {
              const err = data.error as { $metadata?: Record<string, any>; RequestId?: string } | undefined;
              setMetadataAttributes(span, { requestId: err?.RequestId, ...err?.$metadata });
              return;
            }

            const output = data.result as { $metadata?: Record<string, any> } | undefined;
            setMetadataAttributes(span, output?.$metadata);

            const normalizedResponse: NormalizedResponse = {
              data: output,
              request: normalizedRequest,
              requestId: output?.$metadata?.requestId,
            };
            servicesExtensions.responseHook(normalizedResponse, span);
          });

          // Streaming responses end the span when their wrapped stream is consumed (see
          // bedrock-runtime); the helper must not end it on `send` settling. Errors always end here.
          return !!requestMetadata?.isStream && !failed;
        },
      };

      // The AWS SDK's `Client.prototype.send` lives in different smithy packages across versions; the
      // transform injects one channel per package. Only the package hosting the app's client fires, so
      // subscribing to all of them is safe and never double-instruments a single call.
      const awsSendChannels = [
        CHANNELS.AWS_SMITHY_CORE_SEND,
        CHANNELS.AWS_SMITHY_CLIENT_SEND,
        CHANNELS.AWS_SDK_SMITHY_CLIENT_SEND,
      ] as const;

      DEBUG_BUILD && debug.log(`[orchestrion:aws-sdk] subscribing to channels "${awsSendChannels.join('", "')}"`);

      waitForTracingChannelBinding(() => {
        for (const channelName of awsSendChannels) {
          bindTracingChannelToSpan(
            diagnosticsChannel.tracingChannel<AwsSendChannelContext>(channelName),
            getSpan,
            opts,
          );
        }
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * EXPERIMENTAL — orchestrion-driven aws-sdk (v3) integration.
 *
 * Subscribes to the `orchestrion:@smithy/smithy-client:send` (and equivalent) diagnostics_channel
 * the orchestrion code transform injects into the AWS SDK's smithy `Client.prototype.send`, emitting
 * spans identical to the OTel `@opentelemetry/instrumentation-aws-sdk` integration (with a distinct
 * `auto.aws.orchestrion.aws-sdk` origin). Requires the orchestrion runtime hook or bundler plugin —
 * wire it up via `experimentalUseDiagnosticsChannelInjection()`.
 *
 * @experimental
 */
export const awsChannelIntegration = defineIntegration(_awsChannelIntegration);
