import type { FeedbackComponent, FeedbackConfigurationWithDefaults } from '../types';
import { Icon } from './Icon';
import { createElement as h } from './util/createElement';

interface Props {
  options: FeedbackConfigurationWithDefaults;
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
export function Actor({ options, onClick }: Props): ActorComponent {
  function _handleClick(e: MouseEvent): void {
    onClick && onClick(e);
  }

  const $el = h(
    'button',
    {
      type: 'button',
      className: 'widget__actor',
      ariaLabel: options.buttonLabel,
    },
    Icon().$el,
    h(
      'span',
      {
        className: 'widget__actor__text',
      },
      options.buttonLabel,
    ),
  );

  $el.addEventListener('click', _handleClick);

  return {
    $el,
    show: (): void => {
      $el.classList.remove('widget__actor--hidden');
    },
    hide: (): void => {
      $el.classList.add('widget__actor--hidden');
    },
  };
}
