import * as SentryUtils from '@sentry/utils';

import { ACTOR_LABEL } from '../src/constants';
import { Feedback } from '../src/integration';

jest.spyOn(SentryUtils, 'isBrowser').mockImplementation(() => true);

jest.mock('../src/util/sendFeedbackRequest', () => {
  const original = jest.requireActual('../src/util/sendFeedbackRequest');
  return {
    ...original,
    sendFeedbackRequest: jest.fn(),
  };
});

describe('Feedback integration', () => {
  let feedback: Feedback;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (feedback) {
      feedback.remove();
    }
  });

  it('autoinjects widget with actor', () => {
    feedback = new Feedback();
    feedback.setupOnce();
    const widget = feedback.getWidget();
    expect(widget?.actor?.el).toBeInstanceOf(HTMLButtonElement);
    const actorEl = widget?.actor?.el as HTMLButtonElement;
    expect(actorEl.textContent).toBe(ACTOR_LABEL);
    // No dialog until actor is clicked
    expect(widget?.dialog).toBeUndefined();
    // @ts-expect-error _shadow is private
    expect(feedback._shadow.contains(actorEl)).toBe(true);
  });

  it('does not create a widget with `autoInject: false`', () => {
    feedback = new Feedback({ autoInject: false });
    feedback.setupOnce();
    const widget = feedback.getWidget();
    expect(widget?.actor?.el).toBeUndefined();
    // No dialog until actor is clicked
    expect(widget?.dialog).toBeUndefined();
  });

  it('opens (and closes) dialog when calling `openDialog` without injecting an actor', () => {
    feedback = new Feedback({ autoInject: false });
    feedback.setupOnce();

    let widget = feedback.getWidget();
    expect(widget?.actor?.el).toBeUndefined();
    // No dialog until actor is clicked
    expect(widget?.dialog).toBeUndefined();

    feedback.openDialog();
    widget = feedback.getWidget();
    expect(widget?.actor?.el).toBeUndefined();
    expect(widget?.dialog).not.toBeUndefined();
    expect(widget?.dialog?.checkIsOpen()).toBe(true);
    // @ts-expect-error _shadow is private
    expect(feedback._shadow.contains(widget.dialog.el)).toBe(true);

    feedback.closeDialog();
    expect(widget?.dialog?.checkIsOpen()).toBe(false);
  });

  it('attaches to a custom actor element', () => {
    const onDialogOpen = jest.fn();
    // This element is in the normal DOM
    const myActor = document.createElement('div');
    myActor.textContent = 'my button';

    feedback = new Feedback({ autoInject: false });
    let widget = feedback.getWidget();
    expect(widget).toBe(null);

    feedback.attachTo(myActor, { onDialogOpen });

    myActor.dispatchEvent(new Event('click'));

    widget = feedback.getWidget();

    expect(widget?.dialog?.el).toBeInstanceOf(HTMLDialogElement);
    expect(widget?.dialog?.el?.open).toBe(true);
    expect(onDialogOpen).toHaveBeenCalledTimes(1);
    // This is all we do with `attachTo` (open dialog)
  });

  it('creates multiple widgets and removes them', () => {
    feedback = new Feedback({ autoInject: false });

    feedback.createWidget();
    expect(feedback.getWidget()?.actor?.el).toBeInstanceOf(HTMLButtonElement);
    // @ts-expect-error  _widgets is private
    expect(feedback._widgets.size).toBe(1);

    feedback.createWidget();
    // @ts-expect-error  _widgets is private
    expect(feedback._widgets.size).toBe(2);

    // @ts-expect-error  _widgets is private
    const widgets = Array.from(feedback._widgets.values());
    expect(widgets[0]).not.toEqual(widgets[1]);

    // Both actors will be in the DOM

    // @ts-expect-error _shadow is private
    expect(feedback._shadow.contains(widgets[0].actor.el)).toBe(true);
    // @ts-expect-error _shadow is private
    expect(feedback._shadow.contains(widgets[1].actor.el)).toBe(true);

    feedback.removeWidget(widgets[0]);
    // @ts-expect-error _shadow is private
    expect(feedback._shadow.contains(widgets[0].actor.el)).toBe(false);

    feedback.removeWidget(widgets[1]);
    // @ts-expect-error _shadow is private
    expect(feedback._shadow.contains(widgets[1].actor.el)).toBe(false);

    // @ts-expect-error  _widgets is private
    expect(feedback._widgets.size).toBe(0);
  });
});
