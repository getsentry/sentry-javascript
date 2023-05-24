import type { Breadcrumb } from '@sentry/types';

import { WINDOW } from '../constants';
import type { ReplayContainer, SlowClickConfig } from '../types';
import { addBreadcrumbEvent } from './util/addBreadcrumbEvent';

type ClickBreadcrumb = Breadcrumb & {
  timestamp: number;
};

/**
 * Detect a slow click on a button/a tag,
 * and potentially create a corresponding breadcrumb.
 */
export function detectSlowClick(
  replay: ReplayContainer,
  config: SlowClickConfig,
  clickBreadcrumb: ClickBreadcrumb,
  node: HTMLElement,
): void {
  if (ignoreElement(node, config)) {
    return;
  }

  /*
    We consider a slow click a click on a button/a, which does not trigger one of:
     - DOM mutation
     - Scroll (within 100ms)
     Within the given threshold time.
     After time timeout time, we stop listening and mark it as a slow click anyhow.
  */

  let cleanup: () => void = () => {
    // replaced further down
  };

  // After timeout time, def. consider this a slow click, and stop watching for mutations
  const timeout = setTimeout(() => {
    handleSlowClick(replay, clickBreadcrumb, config.timeout, 'timeout');
    cleanup();
  }, config.timeout);

  const mutationHandler = (): void => {
    maybeHandleSlowClick(replay, clickBreadcrumb, config.threshold, config.timeout, 'mutation');
    cleanup();
  };

  const scrollHandler = (): void => {
    maybeHandleSlowClick(replay, clickBreadcrumb, config.scrollTimeout, config.timeout, 'scroll');
    cleanup();
  };

  const obs = new MutationObserver(mutationHandler);

  obs.observe(WINDOW.document.documentElement, {
    attributes: true,
    characterData: true,
    childList: true,
    subtree: true,
  });

  WINDOW.addEventListener('scroll', scrollHandler);

  // Stop listening to scroll timeouts early
  const scrollTimeout = setTimeout(() => {
    WINDOW.removeEventListener('scroll', scrollHandler);
  }, config.scrollTimeout);

  cleanup = (): void => {
    clearTimeout(timeout);
    clearTimeout(scrollTimeout);
    obs.disconnect();
    WINDOW.removeEventListener('scroll', scrollHandler);
  };
}

function maybeHandleSlowClick(
  replay: ReplayContainer,
  clickBreadcrumb: ClickBreadcrumb,
  threshold: number,
  timeout: number,
  endReason: string,
): boolean {
  const now = Date.now();
  const timeAfterClickMs = now - clickBreadcrumb.timestamp * 1000;

  if (timeAfterClickMs > threshold) {
    handleSlowClick(replay, clickBreadcrumb, Math.min(timeAfterClickMs, timeout), endReason);
    return true;
  }

  return false;
}

function handleSlowClick(
  replay: ReplayContainer,
  clickBreadcrumb: ClickBreadcrumb,
  timeAfterClickMs: number,
  endReason: string,
): void {
  const breadcrumb = {
    message: clickBreadcrumb.message,
    timestamp: clickBreadcrumb.timestamp,
    category: 'ui.slowClickDetected' as const,
    data: {
      ...clickBreadcrumb.data,
      url: WINDOW.location.href,
      // TODO FN: add parametrized route, when possible
      timeAfterClickMs,
      endReason,
    },
  };

  addBreadcrumbEvent(replay, breadcrumb);
}

const SLOW_CLICK_IGNORE_TAGS = ['SELECT', 'OPTION'];

function ignoreElement(node: HTMLElement, config: SlowClickConfig): boolean {
  // If <input> tag, we only want to consider input[type='submit'] & input[type='button']
  if (node.tagName === 'INPUT' && !['submit', 'button'].includes(node.getAttribute('type') || '')) {
    return true;
  }

  if (SLOW_CLICK_IGNORE_TAGS.includes(node.tagName)) {
    return true;
  }

  // If <a> tag, detect special variants that may not lead to an action
  // If target !== _self, we may open the link somewhere else, which would lead to no action
  // Also, when downloading a file, we may not leave the page, but still not trigger an action
  if (
    node.tagName === 'A' &&
    (node.hasAttribute('download') || (node.hasAttribute('target') && node.getAttribute('target') !== '_self'))
  ) {
    return true;
  }

  if (config.ignoreSelector && node.matches(config.ignoreSelector)) {
    return true;
  }

  return false;
}
