import { WINDOW } from '../constants';
import type { FeedbackComponent, FeedbackInternalOptions } from '../types';
import { Icon } from './components/Icon';

export interface ActorProps extends Pick<FeedbackInternalOptions, 'buttonLabel'> {
  onClick?: (e: MouseEvent) => void;
}

export interface ActorComponent extends FeedbackComponent<HTMLButtonElement> {
  /**
   * Shows the actor element
   */
  show: () => void;
  /**
   * Hides the actor element
   */
  hide: () => void;
}

/**
 *
 */
export function Actor({ buttonLabel, onClick }: ActorProps): ActorComponent {
  const doc = WINDOW.document;
  const el = doc.createElement('button');
  el.type = 'button';
  el.className = 'widget__actor';
  el.ariaHidden = 'false';
  el.ariaLabel = buttonLabel;
  el.addEventListener('click', (e: MouseEvent): void => {
    onClick && onClick(e);
  });
  el.appendChild(Icon());
  if (buttonLabel) {
    const label = doc.createElement('span');
    label.className = 'widget__actor__text';
    label.appendChild(doc.createTextNode(buttonLabel));
    el.appendChild(label);
  }

  return {
    get el() {
      return el;
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
