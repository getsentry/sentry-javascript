import { DOCUMENT, TRIGGER_LABEL } from '../../constants';
import { createActorStyles } from './Actor.css';
import { FeedbackIcon } from './FeedbackIcon';

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
      el.remove();
      style.remove();
    },
    show(): void {
      el.ariaHidden = 'false';
    },
    hide(): void {
      el.ariaHidden = 'true';
    },
  };
}
