import { getCurrentHub } from '@sentry/core';
import type {
  Breadcrumb,
  BreadcrumbHint,
  FetchBreadcrumbData,
  TextEncoderInternal,
  XhrBreadcrumbData,
} from '@sentry/types';
import { addInstrumentationHandler, logger } from '@sentry/utils';

import type { FetchHint, ReplayContainer, ReplayNetworkOptions, XhrHint } from '../types';
import { handleFetchSpanListener } from './handleFetch';
import { handleXhrSpanListener } from './handleXhr';
import { captureFetchBreadcrumbToReplay, enrichFetchBreadcrumb } from './util/fetchUtils';
import { captureXhrBreadcrumbToReplay, enrichXhrBreadcrumb } from './util/xhrUtils';

interface ExtendedNetworkBreadcrumbsOptions extends ReplayNetworkOptions {
  replay: ReplayContainer;
  textEncoder: TextEncoderInternal;
}

/**
 * This method does two things:
 * - It enriches the regular XHR/fetch breadcrumbs with request/response size data
 * - It captures the XHR/fetch breadcrumbs to the replay
 *   (enriching it with further data that is _not_ added to the regular breadcrumbs)
 */
export function handleNetworkBreadcrumbs(replay: ReplayContainer): void {
  const client = getCurrentHub().getClient();

  try {
    const textEncoder = new TextEncoder();

    const {
      networkDetailAllowUrls,
      networkDetailDenyUrls,
      networkCaptureBodies,
      networkRequestHeaders,
      networkResponseHeaders,
    } = replay.getOptions();

    const options: ExtendedNetworkBreadcrumbsOptions = {
      replay,
      textEncoder,
      networkDetailAllowUrls,
      networkDetailDenyUrls,
      networkCaptureBodies,
      networkRequestHeaders,
      networkResponseHeaders,
    };

    if (client && client.on) {
      client.on('beforeAddBreadcrumb', (breadcrumb, hint) => beforeAddNetworkBreadcrumb(options, breadcrumb, hint));
    } else {
      // Fallback behavior
      addInstrumentationHandler('fetch', handleFetchSpanListener(replay));
      addInstrumentationHandler('xhr', handleXhrSpanListener(replay));
    }
  } catch {
    // Do nothing
  }
}

/** just exported for tests */
export function beforeAddNetworkBreadcrumb(
  options: ExtendedNetworkBreadcrumbsOptions,
  breadcrumb: Breadcrumb,
  hint?: BreadcrumbHint,
): void {
  if (!breadcrumb.data) {
    return;
  }

  try {
    if (_isXhrBreadcrumb(breadcrumb) && _isXhrHint(hint)) {
      // This has to be sync, as we need to ensure the breadcrumb is enriched in the same tick
      // Because the hook runs synchronously, and the breadcrumb is afterwards passed on
      // So any async mutations to it will not be reflected in the final breadcrumb
      enrichXhrBreadcrumb(breadcrumb, hint, options);

      void captureXhrBreadcrumbToReplay(breadcrumb, hint, options);
    }

    if (_isFetchBreadcrumb(breadcrumb) && _isFetchHint(hint)) {
      // This has to be sync, as we need to ensure the breadcrumb is enriched in the same tick
      // Because the hook runs synchronously, and the breadcrumb is afterwards passed on
      // So any async mutations to it will not be reflected in the final breadcrumb
      enrichFetchBreadcrumb(breadcrumb, hint, options);

      void captureFetchBreadcrumbToReplay(breadcrumb, hint, options);
    }
  } catch (e) {
    __DEBUG_BUILD__ && logger.warn('Error when enriching network breadcrumb');
  }
}

function _isXhrBreadcrumb(breadcrumb: Breadcrumb): breadcrumb is Breadcrumb & { data: XhrBreadcrumbData } {
  return breadcrumb.category === 'xhr';
}

function _isFetchBreadcrumb(breadcrumb: Breadcrumb): breadcrumb is Breadcrumb & { data: FetchBreadcrumbData } {
  return breadcrumb.category === 'fetch';
}

function _isXhrHint(hint?: BreadcrumbHint): hint is XhrHint {
  return hint && hint.xhr;
}

function _isFetchHint(hint?: BreadcrumbHint): hint is FetchHint {
  return hint && hint.response;
}
