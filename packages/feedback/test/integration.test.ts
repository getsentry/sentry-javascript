import * as SentryUtils from '@sentry/utils';
import {
  ACTOR_LABEL,
  CANCEL_BUTTON_LABEL,
  DEFAULT_THEME,
  EMAIL_LABEL,
  EMAIL_PLACEHOLDER,
  FORM_TITLE,
  MESSAGE_LABEL,
  MESSAGE_PLACEHOLDER,
  NAME_LABEL,
  NAME_PLACEHOLDER,
  SUBMIT_BUTTON_LABEL,
  SUCCESS_MESSAGE_TEXT,
} from '../src/constants';
import type { FeedbackInternalOptions } from '../src/types';
import { sendFeedbackRequest } from '../src/util/sendFeedbackRequest';
// import { createShadowHost } from '../../src/widget/createShadowHost';
// import { createWidget } from '../../src/widget/createWidget';
import { Feedback } from '../src/integration';

const flushPromises = () => new Promise(jest.requireActual('timers').setImmediate);
jest.useFakeTimers();

jest.spyOn(SentryUtils, 'isBrowser').mockImplementation(() => true);

const DEFAULT_OPTIONS = {
  id: 'sentry-feedback',
  autoInject: true,
  showEmail: true,
  showName: true,
  showBranding: false,
  useSentryUser: {
    email: 'email',
    name: 'username',
  },
  isAnonymous: false,
  isEmailRequired: false,
  isNameRequired: false,

  themeDark: DEFAULT_THEME.dark,
  themeLight: DEFAULT_THEME.light,
  colorScheme: 'system' as const,

  buttonLabel: ACTOR_LABEL,
  cancelButtonLabel: CANCEL_BUTTON_LABEL,
  submitButtonLabel: SUBMIT_BUTTON_LABEL,
  formTitle: FORM_TITLE,
  emailPlaceholder: EMAIL_PLACEHOLDER,
  emailLabel: EMAIL_LABEL,
  messagePlaceholder: MESSAGE_PLACEHOLDER,
  messageLabel: MESSAGE_LABEL,
  namePlaceholder: NAME_PLACEHOLDER,
  nameLabel: NAME_LABEL,
  successMessageText: SUCCESS_MESSAGE_TEXT,

  onActorClick: jest.fn(),
  onDialogClose: jest.fn(),
  onDialogOpen: jest.fn(),
  onSubmitError: jest.fn(),
  onSubmitSuccess: jest.fn(),
};

jest.mock('../src/util/sendFeedbackRequest', () => {
  const original = jest.requireActual('../src/util/sendFeedbackRequest');
  return {
    ...original,
    sendFeedbackRequest: jest.fn(),
  };
});

// function createShadowAndWidget(
//   feedbackOptions?: Partial<FeedbackInternalOptions> & { shouldCreateActor?: boolean },
//   createWidgetOptions?: Partial<Parameters<typeof createWidget>[0]>,
// ) {
//   const { shadow } = createShadowHost({
//     id: 'feedback',
//     colorScheme: 'system',
//     themeLight: DEFAULT_THEME.light,
//     themeDark: DEFAULT_THEME.dark,
//   });
//   const widget = createWidget({
//     shadow,
//     options: {
//       ...DEFAULT_OPTIONS,
//       ...feedbackOptions,
//     },
//     ...createWidgetOptions,
//   });
//
//   return { shadow, widget };
// }

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
    expect(actorEl.textContent).toBe(DEFAULT_OPTIONS.buttonLabel);
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
