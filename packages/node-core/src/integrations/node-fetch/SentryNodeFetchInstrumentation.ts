import { context } from '@opentelemetry/api';
import { isTracingSuppressed } from '@opentelemetry/core';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import { InstrumentationBase } from '@opentelemetry/instrumentation';
import { LRUMap, SDK_VERSION } from '@sentry/core';
import * as diagch from 'diagnostics_channel';
import { NODE_MAJOR, NODE_MINOR } from '../../nodeVersion';
import {
  addFetchRequestBreadcrumb,
  addTracePropagationHeadersToFetchRequest,
  getAbsoluteUrl,
} from '../../utils/outgoingFetchRequest';
import type { UndiciRequest, UndiciResponse } from './types';

export type SentryNodeFetchInstrumentationOptions = InstrumentationConfig & {
  /**
   * Whether breadcrumbs should be recorded for requests.
   *
   * @default `true`
   */
  breadcrumbs?: boolean;

  /**
   * Do not capture breadcrumbs or inject headers for outgoing fetch requests to URLs where the given callback returns `true`.
   * The same option can be passed to the top-level httpIntegration where it controls both, breadcrumb and
   * span creation.
   *
   * @param url Contains the entire URL, including query string (if any), protocol, host, etc. of the outgoing request.
   */
  ignoreOutgoingRequests?: (url: string) => boolean;
};

interface ListenerRecord {
  name: string;
  unsubscribe: () => void;
}

/**
 * This custom node-fetch instrumentation is used to instrument outgoing fetch requests.
 * It does not emit any spans.
 *
 * The reason this is isolated from the OpenTelemetry instrumentation is that users may overwrite this,
 * which would lead to Sentry not working as expected.
 *
 * This is heavily inspired & adapted from:
 * https://github.com/open-telemetry/opentelemetry-js-contrib/blob/28e209a9da36bc4e1f8c2b0db7360170ed46cb80/plugins/node/instrumentation-undici/src/undici.ts
 */
export class SentryNodeFetchInstrumentation extends InstrumentationBase<SentryNodeFetchInstrumentationOptions> {
  // Keep ref to avoid https://github.com/nodejs/node/issues/42170 bug and for
  // unsubscribing.
  private _channelSubs: Array<ListenerRecord>;
  private _propagationDecisionMap: LRUMap<string, boolean>;
  private _ignoreOutgoingRequestsMap: WeakMap<UndiciRequest, boolean>;

  public constructor(config: SentryNodeFetchInstrumentationOptions = {}) {
    super('@sentry/instrumentation-node-fetch', SDK_VERSION, config);
    this._channelSubs = [];
    this._propagationDecisionMap = new LRUMap<string, boolean>(100);
    this._ignoreOutgoingRequestsMap = new WeakMap<UndiciRequest, boolean>();
  }

  /** No need to instrument files/modules. */
  public init(): void {
    return undefined;
  }

  /** Disable the instrumentation. */
  public disable(): void {
    super.disable();
    this._channelSubs.forEach(sub => sub.unsubscribe());
    this._channelSubs = [];
  }

  /** Enable the instrumentation. */
  public enable(): void {
    // "enabled" handling is currently a bit messy with InstrumentationBase.
    // If constructed with `{enabled: false}`, this `.enable()` is still called,
    // and `this.getConfig().enabled !== this.isEnabled()`, creating confusion.
    //
    // For now, this class will setup for instrumenting if `.enable()` is
    // called, but use `this.getConfig().enabled` to determine if
    // instrumentation should be generated. This covers the more likely common
    // case of config being given a construction time, rather than later via
    // `instance.enable()`, `.disable()`, or `.setConfig()` calls.
    super.enable();

    // This method is called by the super-class constructor before ours is
    // called. So we need to ensure the property is initalized.
    this._channelSubs = this._channelSubs || [];

    // Avoid to duplicate subscriptions
    if (this._channelSubs.length > 0) {
      return;
    }

    this._subscribeToChannel('undici:request:create', this._onRequestCreated.bind(this));
    this._subscribeToChannel('undici:request:headers', this._onResponseHeaders.bind(this));
  }

  /**
   * This method is called when a request is created.
   * You can still mutate the request here before it is sent.
   */
  private _onRequestCreated({ request }: { request: UndiciRequest }): void {
    const config = this.getConfig();
    const enabled = config.enabled !== false;

    if (!enabled) {
      return;
    }

    const shouldIgnore = this._shouldIgnoreOutgoingRequest(request);
    // We store this decisision for later so we do not need to re-evaluate it
    // Additionally, the active context is not correct in _onResponseHeaders, so we need to make sure it is evaluated here
    this._ignoreOutgoingRequestsMap.set(request, shouldIgnore);

    if (shouldIgnore) {
      return;
    }

    addTracePropagationHeadersToFetchRequest(request, this._propagationDecisionMap);
  }

  /**
   * This method is called when a response is received.
   */
  private _onResponseHeaders({ request, response }: { request: UndiciRequest; response: UndiciResponse }): void {
    const config = this.getConfig();
    const enabled = config.enabled !== false;

    if (!enabled) {
      return;
    }

    const _breadcrumbs = config.breadcrumbs;
    const breadCrumbsEnabled = typeof _breadcrumbs === 'undefined' ? true : _breadcrumbs;

    const shouldIgnore = this._ignoreOutgoingRequestsMap.get(request);

    if (breadCrumbsEnabled && !shouldIgnore) {
      addFetchRequestBreadcrumb(request, response);
    }
  }

  /** Subscribe to a diagnostics channel. */
  private _subscribeToChannel(
    diagnosticChannel: string,
    onMessage: (message: unknown, name: string | symbol) => void,
  ): void {
    // `diagnostics_channel` had a ref counting bug until v18.19.0.
    // https://github.com/nodejs/node/pull/47520
    const useNewSubscribe = NODE_MAJOR > 18 || (NODE_MAJOR === 18 && NODE_MINOR >= 19);

    let unsubscribe: () => void;
    if (useNewSubscribe) {
      diagch.subscribe?.(diagnosticChannel, onMessage);
      unsubscribe = () => diagch.unsubscribe?.(diagnosticChannel, onMessage);
    } else {
      const channel = diagch.channel(diagnosticChannel);
      channel.subscribe(onMessage);
      unsubscribe = () => channel.unsubscribe(onMessage);
    }

    this._channelSubs.push({
      name: diagnosticChannel,
      unsubscribe,
    });
  }

  /**
   * Check if the given outgoing request should be ignored.
   */
  private _shouldIgnoreOutgoingRequest(request: UndiciRequest): boolean {
    if (isTracingSuppressed(context.active())) {
      return true;
    }

    // Add trace propagation headers
    const url = getAbsoluteUrl(request.origin, request.path);
    const ignoreOutgoingRequests = this.getConfig().ignoreOutgoingRequests;

    if (typeof ignoreOutgoingRequests !== 'function' || !url) {
      return false;
    }

    return ignoreOutgoingRequests(url);
  }
}
