import { DOCUMENT } from '../../constants';
import { createActorStyles } from './Actor.css';
import { FeedbackIcon } from './FeedbackIcon';

export interface ActorProps {
  buttonLabel: string;
}

export interface ActorComponent {
  /**
   * The button element itself
   */
  el: HTMLButtonElement;

  /**
   * The style element for this component
   */
  style: HTMLStyleElement;

  /**
   * Show the actor element
   */
  show: () => void;

  /**
   * Hide the actor element
   */
  hide: () => void;
}

/**
 * The sentry-provided button to open the feedback modal
 */
export function Actor({ buttonLabel }: ActorProps): ActorComponent {
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
    get el() {
      return el;
    },
    get style() {
      return style;
    },
    show: (): void => {
      el.classList.remove('widget__actor--hidden');
      el.setAttribute('aria-hidden', 'false');
    },
    hide: (): void => {
      el.classList.add('widget__actor--hidden');
      el.setAttribute('aria-hidden', 'true');
    },
  };
}
