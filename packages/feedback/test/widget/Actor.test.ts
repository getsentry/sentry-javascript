import { ACTOR_LABEL } from '../../src/constants';
import type { ActorProps } from '../../src/widget/Actor';
import { Actor } from '../../src/widget/Actor';

function renderActor(props?: Partial<ActorProps>) {
  return Actor({
    buttonLabel: ACTOR_LABEL,
    ...props,
  });
}

describe('Actor', () => {
  it('renders the actor button', () => {
    const actorComponent = renderActor();

    expect(actorComponent.el).toBeInstanceOf(HTMLButtonElement);
    expect(actorComponent.el.textContent).toBe(ACTOR_LABEL);
  });

  it('calls `onClick` callback when clicked on', () => {
    const onClick = jest.fn();
    const actorComponent = renderActor({
      onClick,
    });

    const event = new Event('click');
    actorComponent.el.dispatchEvent(event);
    expect(onClick).toHaveBeenCalledWith(event);
  });

  it('can manually show and hide the actor', () => {
    const actorComponent = renderActor();

    expect(actorComponent.el.getAttribute('ariaHidden')).toBe('false');

    actorComponent.hide();
    expect(actorComponent.el.getAttribute('ariaHidden')).toBe('true');

    actorComponent.show();
    expect(actorComponent.el.getAttribute('ariaHidden')).toBe('false');
  });
});
