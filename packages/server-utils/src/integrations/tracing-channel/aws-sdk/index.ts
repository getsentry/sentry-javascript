import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { IntegrationFn, Span } from '@sentry/core';
import {
  debug,
  defineIntegration,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  startInactiveSpan,
  waitForTracingChannelBinding,
} from '@sentry/core';
import {
  _AWS_REQUEST_ID as AWS_REQUEST_ID,
  AWS_REQUEST_EXTENDED_ID,
  CLOUD_REGION,
  HTTP_STATUS_CODE,
  SENTRY_KIND,
  SENTRY_OP,
} from '@sentry/conventions/attributes';
import { DEBUG_BUILD } from '../../../debug-build';
import { CHANNELS } from '../../../orchestrion/channels';
import type { TracingChannelLifeCycleOptions } from '../../../tracing-channel';
import { bindTracingChannelToSpan, safeChannelCallback } from '../../../tracing-channel';
import { AWS_SDK_ORIGIN } from './constants';
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
  _sentryRegion?: { settled: boolean; promise: Promise<void> };
}

interface AwsClientConfig {
  serviceId?: string;
  region?: () => string | Promise<string> | undefined;
}

interface AwsV3Command {
  input?: Record<string, unknown>;
  constructor?: { name?: string };
}

// `metadata` is smithy's `ResponseMetadata`, read off the untyped channel result/error (`any` for the
// same reason as `CommandInput`, see types.ts).
function setMetadataAttributes(span: Span, metadata: Record<string, any> | undefined): void {
  if (!metadata) {
    return;
  }
  if (metadata.requestId) {
    // oxlint-disable-next-line typescript/no-deprecated
    span.setAttribute(AWS_REQUEST_ID, metadata.requestId);
  }
  if (metadata.httpStatusCode) {
    // oxlint-disable-next-line typescript/no-deprecated
    span.setAttribute(HTTP_STATUS_CODE, metadata.httpStatusCode);
  }
  if (metadata.extendedRequestId) {
    // oxlint-disable-next-line typescript/no-deprecated
    span.setAttribute(AWS_REQUEST_EXTENDED_ID, metadata.extendedRequestId);
  }
}

const _awsIntegration = (() => {
  const servicesExtensions = new ServicesExtensions();

  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // `tracingChannel` is unavailable before Node 18.19 so do nothing in that case.
      if (!diagnosticsChannel.tracingChannel) {
        return;
      }

      const getSpan = (data: AwsSendChannelContext): Span | undefined =>
        safeChannelCallback(() => {
          const command = data.arguments[0] as AwsV3Command | undefined;
          const commandName = command?.constructor?.name;
          if (!command || !commandName) {
            // Not a recognizable v3 command call; leave the active context untouched.
            return undefined;
          }

          const clientConfig = data.self?.config;
          const serviceName =
            clientConfig?.serviceId ??
            // `clientName` isn't available at the `send` boundary; fall back to the client's
            // constructor name (e.g. `S3Client` -> `S3`). `serviceId` is set for all AWS clients.
            removeSuffixFromStringIfExists(data.self?.constructor?.name || 'AWS', 'Client');

          // Commands with all-optional members can be constructed without an input (`new
          // ListBucketsCommand()`); the OTel path traces those too, so default rather than bail.
          // The default is assigned back onto the command (not kept detached) because service hooks
          // mutate `commandInput` (trace-propagation headers, `MessageAttributeNames`) and those
          // writes must reach the serialized request. Current smithy clients already default `input`
          // to `{}` in the command constructor; this only affects older clients in our range.
          if (!command.input) {
            command.input = {};
          }
          const normalizedRequest = normalizeV3Request(serviceName, commandName, command.input, undefined);
          const requestMetadata = servicesExtensions.requestPreSpanHook(normalizedRequest);

          const span = startInactiveSpan({
            name: requestMetadata.spanName ?? `${normalizedRequest.serviceName}.${normalizedRequest.commandName}`,
            attributes: {
              // `rpc` matches what the exporter infers from `rpc.service` for the OTel aws-sdk spans;
              // service extensions override it where inference yields a different op (DynamoDB: `db`).
              [SENTRY_OP]: requestMetadata.spanOp || 'rpc',
              [SENTRY_KIND]: 'client',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: AWS_SDK_ORIGIN,
              ...extractAttributesFromNormalizedRequest(normalizedRequest),
              ...requestMetadata.spanAttributes,
            },
          });

          data._sentryNormalizedRequest = normalizedRequest;
          data._sentryRequestMetadata = requestMetadata;

          // `region` resolves asynchronously while `send` proceeds (a channel subscriber cannot delay
          // the traced call the way the OTel middleware does). Backfill it onto the span and the
          // normalized request once available; `deferSpanEnd` holds the span open until this settles
          // so `cloud.region` cannot be lost when `send` settles first (e.g. an early failure).
          //
          // The provider call is guarded separately: the span is already started, so a synchronous
          // throw bubbling into the enclosing `safeChannelCallback` would discard it without ending it (a leaked
          // open span).
          let regionResult: string | Promise<string> | undefined;
          try {
            regionResult = clientConfig?.region?.();
          } catch {
            // Nothing to do; continue without a region.
          }
          // The `.finally` self-reference is safe: the callback only runs after initialization.
          const regionHolder: { settled: boolean; promise: Promise<void> } = {
            settled: false,
            promise: Promise.resolve(regionResult)
              .then(region => {
                if (region) {
                  normalizedRequest.region = region;
                  span.setAttribute(CLOUD_REGION, region);
                }
              })
              .catch(() => {
                // Nothing to do; continue without a region.
              })
              .finally(() => {
                regionHolder.settled = true;
              }),
          };
          data._sentryRegion = regionHolder;

          // Inject trace-propagation headers into outgoing messages (SQS/SNS/Lambda). Runs before
          // `send` proceeds, so the mutated `commandInput` is used to build the request.
          safeChannelCallback(() => servicesExtensions.requestPostSpanHook(normalizedRequest, span));

          return span;
        });

      const opts: TracingChannelLifeCycleOptions<AwsSendChannelContext> = {
        deferSpanEnd({ span, data, end }) {
          const normalizedRequest = data._sentryNormalizedRequest;
          const requestMetadata = data._sentryRequestMetadata;
          if (!normalizedRequest) {
            return false;
          }

          const failed = 'error' in data;

          // The channel `result`/`error` are untyped; the `$metadata` casts below name smithy's
          // `ResponseMetadata` shape (`any`-valued, see `setMetadataAttributes`).
          safeChannelCallback(() => {
            if (failed) {
              const err = data.error as
                | { $metadata?: Record<string, any>; RequestId?: string; extendedRequestId?: string }
                | undefined;
              const errMetadata = err?.$metadata;
              // Like the OTel path, read RequestId/extendedRequestId off the error itself, with
              // `$metadata` (which smithy service errors also carry) as the fallback. A spread won't
              // do: `$metadata` includes these keys with `undefined` values, clobbering the fallback.
              setMetadataAttributes(span, {
                requestId: err?.RequestId ?? errMetadata?.requestId,
                httpStatusCode: errMetadata?.httpStatusCode,
                extendedRequestId: err?.extendedRequestId ?? errMetadata?.extendedRequestId,
              });
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
          if (requestMetadata?.isStream && !failed) {
            return true;
          }

          // Normally the region settles long before `send` does (the SDK awaits it internally to
          // build the endpoint), but when `send` settles first (e.g. an early failure) hold the span
          // open until the region backfill lands. The error status was already applied by the
          // helper's `error` subscriber, so a plain `end()` suffices.
          const region = data._sentryRegion;
          if (region && !region.settled) {
            void region.promise.then(() => end());
            return true;
          }

          return false;
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
 * Orchestrion-driven aws-sdk (v3) integration.
 *
 * Subscribes to the `orchestrion:@smithy/smithy-client:send` (and equivalent) diagnostics_channel
 * the orchestrion code transform injects into the AWS SDK's smithy `Client.prototype.send`, emitting
 * spans identical to the OTel `@opentelemetry/instrumentation-aws-sdk` integration (with a distinct
 * `auto.aws.orchestrion.aws_sdk` origin). Requires the orchestrion runtime hook or bundler plugin.
 */
export const awsIntegration = defineIntegration(_awsIntegration);
