import { DEBUG_BUILD } from 'src/util/debug-build';
import { DOCUMENT, TRIGGER_LABEL } from '../../constants';
import { createActorStyles } from './Actor.css';
import { FeedbackIcon } from './FeedbackIcon';
import { logger } from '@sentry/core';

export interface ActorProps {
  triggerLabel: string;
  triggerAriaLabel: string;
  shadow: ShadowRoot;
  styleNonce?: string;
}

export interface ActorComponent {
  el: HTMLElement;

  appendToDom: () => void;

  removeFromDom: () => void;

  show: () => void;

  hide: () => void;
}

/**
 * The sentry-provided button to open the feedback modal
 */
export function Actor({ triggerLabel, triggerAriaLabel, shadow, styleNonce }: ActorProps): ActorComponent {
  const el = DOCUMENT.createElement('button');
  el.type = 'button';
  el.className = 'widget__actor';
  el.ariaHidden = 'false';
  el.ariaLabel = triggerAriaLabel || triggerLabel || TRIGGER_LABEL;
  el.appendChild(FeedbackIcon());
  if (triggerLabel) {
    const label = DOCUMENT.createElement('span');
    label.appendChild(DOCUMENT.createTextNode(triggerLabel));
    el.appendChild(label);
  }

  const style = createActorStyles(styleNonce);

  return {
    el,
    appendToDom(): void {
      shadow.appendChild(style);
      shadow.appendChild(el);
    },
    removeFromDom(): void {
      try {
        el.remove();
        style.remove();
      } catch {
        DEBUG_BUILD &&
        logger.error(
          '[Feedback] Error when trying to remove Actor from the DOM. It is not appended to the DOM yet!',
        );
        throw new Error('[Feedback] Actor is not appended to DOM, nothing to remove.');
      }
    },
    show(): void {
      el.ariaHidden = 'false';
    },
    hide(): void {
      el.ariaHidden = 'true';
    },
  };
}
