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
      ariaLabel: buttonLabel,
      ariaHidden: 'false',
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
    el,
    show: (): void => {
      el.classList.remove('widget__actor--hidden');
      el.setAttribute('ariaHidden', 'false');
    },
    hide: (): void => {
      el.classList.add('widget__actor--hidden');
      el.setAttribute('ariaHidden', 'true');
    },
  };
}
