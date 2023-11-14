import type { Breadcrumb } from '@sentry/types';
import { htmlTreeAsString } from '@sentry/utils';

import type { ReplayContainer } from '../types';
import { createBreadcrumb } from '../util/createBreadcrumb';
import { getBaseDomBreadcrumb } from './handleDom';
import { addBreadcrumbEvent } from './util/addBreadcrumbEvent';

/** Handle keyboard events & create breadcrumbs. */
export function handleKeyboardEvent(replay: ReplayContainer, event: KeyboardEvent): void {
  if (!replay.isEnabled()) {
    return;
  }

  // Update user activity, but do not restart recording as it can create
  // noisy/low-value replays (e.g. user comes back from idle, hits alt-tab, new
  // session with a single "keydown" breadcrumb is created)
  replay.updateUserActivity();

  const breadcrumb = getKeyboardBreadcrumb(event);

  if (!breadcrumb) {
    return;
  }

  addBreadcrumbEvent(replay, breadcrumb);
}

/** exported only for tests */
export function getKeyboardBreadcrumb(event: KeyboardEvent): Breadcrumb | null {
  const { metaKey, shiftKey, ctrlKey, altKey, key, target } = event;

  // never capture for input fields
  if (!target || isInputElement(target as HTMLElement) || !key) {
    return null;
  }

  // Note: We do not consider shift here, as that means "uppercase"
  const hasModifierKey = metaKey || ctrlKey || altKey;
  const isCharacterKey = key.length === 1; // other keys like Escape, Tab, etc have a longer length

  // Do not capture breadcrumb if only a word key is pressed
  // This could leak e.g. user input
  if (!hasModifierKey && isCharacterKey) {
    return null;
  }

  const message = htmlTreeAsString(target, { maxStringLength: 200 }) || '<unknown>';
  const baseBreadcrumb = getBaseDomBreadcrumb(target as Node, message);

  return createBreadcrumb({
    category: 'ui.keyDown',
    message,
    data: {
      ...baseBreadcrumb.data,
      metaKey,
      shiftKey,
      ctrlKey,
      altKey,
      key,
    },
  });
}

function isInputElement(target: HTMLElement): boolean {
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}
