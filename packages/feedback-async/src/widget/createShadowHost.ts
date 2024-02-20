import { logger } from '@sentry/utils';

import { WINDOW } from '../constants';
import type { FeedbackInternalOptions } from '../types';
import { createMainStyles } from './Main.css';

type CreateShadowHostParams = Pick<FeedbackInternalOptions, 'id' | 'colorScheme' | 'themeDark' | 'themeLight'>;

/**
 * Creates shadow host
 */
export function createShadowHost({ id, colorScheme, themeDark, themeLight }: CreateShadowHostParams): {
  shadow: ShadowRoot;
  host: HTMLDivElement;
} {
  try {
    const doc = WINDOW.document;

    // Create the host
    const host = doc.createElement('div');
    host.id = id;
    // set data attribute on host for different themes
    host.dataset.sentryFeedbackColorscheme = colorScheme;

    // Create the shadow root
    const shadow = host.attachShadow({ mode: 'open' });

    shadow.appendChild(createMainStyles(doc, colorScheme, { dark: themeDark, light: themeLight }));

    return { shadow, host };
  } catch {
    // Shadow DOM probably not supported
    logger.warn('[Feedback] Browser does not support shadow DOM API');
    throw new Error('Browser does not support shadow DOM API.');
  }
}
