import { DOCUMENT } from '../../constants';
import { createActorStyles } from './Actor.css';
import { FeedbackIcon } from './FeedbackIcon';

export interface ActorProps {
  triggerLabel: string;
  shadow: ShadowRoot;
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
export function Actor({ triggerLabel, shadow }: ActorProps): ActorComponent {
  const el = DOCUMENT.createElement('button');
  el.type = 'button';
  el.className = 'widget__actor';
  el.ariaHidden = 'false';
  el.ariaLabel = triggerLabel;
  el.appendChild(FeedbackIcon());
  if (triggerLabel) {
    const label = DOCUMENT.createElement('span');
    label.appendChild(DOCUMENT.createTextNode(triggerLabel));
    el.appendChild(label);
  }

  const style = createActorStyles();

  return {
    el,
    appendToDom(): void {
      shadow.appendChild(style);
      shadow.appendChild(el);
    },
    removeFromDom(): void {
      shadow.removeChild(el);
      shadow.removeChild(style);
    },
    show(): void {
      el.ariaHidden = 'false';
    },
    hide(): void {
      el.ariaHidden = 'true';
    },
  };
}
