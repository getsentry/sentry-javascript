import type { FeedbackComponent, FeedbackConfigurationWithDefaults } from '../types';
import { Icon } from './Icon';
import { createElement } from './util/createElement';

export interface ActorProps extends Pick<FeedbackConfigurationWithDefaults, 'buttonLabel'> {
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
  function _handleClick(e: MouseEvent): void {
    onClick && onClick(e);
  }

  const el = createElement(
    'button',
    {
      type: 'button',
      className: 'widget__actor',
      ['aria-label']: buttonLabel,
      ['aria-hidden']: 'false',
    },
    Icon().el,
    createElement(
      'span',
      {
        className: 'widget__actor__text',
      },
      buttonLabel,
    ),
  );

  el.addEventListener('click', _handleClick);

  return {
    get el() { return el },
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
