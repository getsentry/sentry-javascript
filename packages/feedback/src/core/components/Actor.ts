import { DOCUMENT } from '../../constants';
import { createActorStyles } from './Actor.css';
import { FeedbackIcon } from './FeedbackIcon';

export interface ActorProps {
  buttonLabel: string;
  shadow: ShadowRoot;
}

export interface ActorComponent {
  el: HTMLElement;

  appendToDom: () => void;

  removeFromDom: () => void;
}

/**
 * The sentry-provided button to open the feedback modal
 */
export function Actor({ buttonLabel, shadow }: ActorProps): ActorComponent {
  const el = DOCUMENT.createElement('button');
  el.type = 'button';
  el.className = 'widget__actor';
  el.ariaHidden = 'false';
  el.ariaLabel = buttonLabel;
  el.appendChild(FeedbackIcon());
  if (buttonLabel) {
    const label = DOCUMENT.createElement('span');
    label.className = 'widget__actor__text';
    label.appendChild(DOCUMENT.createTextNode(buttonLabel));
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
  };
}
