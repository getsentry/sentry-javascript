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
} from '../../src/constants';
import type { FeedbackInternalOptions } from '../../src/types';
import { sendFeedbackRequest } from '../../src/util/sendFeedbackRequest';
import { createShadowHost } from '../../src/widget/createShadowHost';
import { createWidget } from '../../src/widget/createWidget';

const flushPromises = () => new Promise(jest.requireActual('timers').setImmediate);
jest.useFakeTimers();

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

  onFormClose: jest.fn(),
  onFormOpen: jest.fn(),
  onSubmitError: jest.fn(),
  onSubmitSuccess: jest.fn(),
};

jest.mock('../../src/util/sendFeedbackRequest', () => {
  const original = jest.requireActual('../../src/util/sendFeedbackRequest');
  return {
    ...original,
    sendFeedbackRequest: jest.fn(),
  };
});

function createShadowAndWidget(
  feedbackOptions?: Partial<FeedbackInternalOptions> & { shouldCreateActor?: boolean },
  createWidgetOptions?: Partial<Parameters<typeof createWidget>[0]>,
) {
  const { shadow } = createShadowHost({
    id: 'feedback',
    colorScheme: 'system',
    themeLight: DEFAULT_THEME.light,
    themeDark: DEFAULT_THEME.dark,
  });
  const widget = createWidget({
    shadow,
    options: {
      ...DEFAULT_OPTIONS,
      ...feedbackOptions,
    },
    ...createWidgetOptions,
  });

  return { shadow, widget };
}

describe('createWidget', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates widget with actor', () => {
    const { shadow, widget } = createShadowAndWidget();
    expect(widget.actor?.el).toBeInstanceOf(HTMLButtonElement);
    const actorEl = widget.actor?.el as HTMLButtonElement;
    expect(actorEl.textContent).toBe(DEFAULT_OPTIONS.buttonLabel);
    // No dialog until actor is clicked
    expect(widget.dialog).toBeUndefined();
    expect(shadow.contains(actorEl)).toBe(true);
  });

  it('creates widget without actor', () => {
    const { widget } = createShadowAndWidget({
      shouldCreateActor: false,
    });
    expect(widget.actor?.el).toBeUndefined();
    // No dialog until actor is clicked
    expect(widget.dialog).toBeUndefined();
  });

  it('clicking on actor opens dialog and hides the actor', () => {
    const onFormOpen = jest.fn();
    const { widget } = createShadowAndWidget({ onFormOpen });
    widget.actor?.el?.dispatchEvent(new Event('click'));

    // Dialog is now visible
    expect(widget.dialog?.el).toBeInstanceOf(HTMLDialogElement);

    // Actor should be hidden
    expect(widget.actor?.el?.getAttribute('aria-hidden')).toBe('true');

    expect(onFormOpen).toHaveBeenCalledTimes(1);
  });

  it('submits feedback successfully', async () => {
    const onSubmitSuccess = jest.fn(() => {});
    const { shadow, widget } = createShadowAndWidget({
      onSubmitSuccess,
    });

    (sendFeedbackRequest as jest.Mock).mockImplementation(() => {
      return Promise.resolve(true);
    });
    widget.actor?.el?.dispatchEvent(new Event('click'));

    const nameEl = widget.dialog?.el?.querySelector('[name="name"]') as HTMLInputElement;
    nameEl.value = 'Jane Doe';
    const emailEl = widget.dialog?.el?.querySelector('[name="email"]') as HTMLInputElement;
    emailEl.value = 'jane@example.com';
    const messageEl = widget.dialog?.el?.querySelector('[name="message"]') as HTMLTextAreaElement;
    messageEl.value = 'My feedback';

    nameEl.dispatchEvent(new Event('change'));
    emailEl.dispatchEvent(new Event('change'));
    messageEl.dispatchEvent(new Event('change'));

    widget.dialog?.el?.querySelector('form')?.dispatchEvent(new Event('submit'));
    expect(sendFeedbackRequest).toHaveBeenCalledWith(
      {
        feedback: {
          name: 'Jane Doe',
          email: 'jane@example.com',
          message: 'My feedback',
          url: 'http://localhost/',
          source: 'widget',
        },
      },
      {},
    );

    // sendFeedbackRequest is async
    await flushPromises();

    expect(onSubmitSuccess).toHaveBeenCalledTimes(1);

    expect(widget.dialog).toBeUndefined();
    expect(shadow.querySelector('.success-message')?.textContent).toBe(SUCCESS_MESSAGE_TEXT);

    jest.runAllTimers();
    expect(shadow.querySelector('.success-message')).toBeNull();
  });

  it('only submits feedback successfully when all required fields are filled', async () => {
    const onSubmitSuccess = jest.fn(() => {});
    const { shadow, widget } = createShadowAndWidget({
      isNameRequired: true,
      isEmailRequired: true,
      onSubmitSuccess,
    });

    (sendFeedbackRequest as jest.Mock).mockImplementation(() => {
      return true;
    });
    widget.actor?.el?.dispatchEvent(new Event('click'));

    const nameEl = widget.dialog?.el?.querySelector('[name="name"]') as HTMLInputElement;
    const emailEl = widget.dialog?.el?.querySelector('[name="email"]') as HTMLInputElement;
    const messageEl = widget.dialog?.el?.querySelector('[name="message"]') as HTMLTextAreaElement;

    nameEl.value = '';
    emailEl.value = '';
    messageEl.value = '';

    widget.dialog?.el?.querySelector('form')?.dispatchEvent(new Event('submit'));
    expect(sendFeedbackRequest).toHaveBeenCalledTimes(0);

    // sendFeedbackRequest is async
    await flushPromises();
    expect(onSubmitSuccess).toHaveBeenCalledTimes(0);

    nameEl.value = '';
    emailEl.value = '';
    messageEl.value = 'My feedback';

    widget.dialog?.el?.querySelector('form')?.dispatchEvent(new Event('submit'));
    expect(sendFeedbackRequest).toHaveBeenCalledTimes(0);

    // sendFeedbackRequest is async
    await flushPromises();
    expect(onSubmitSuccess).toHaveBeenCalledTimes(0);

    nameEl.value = 'Jane Doe';
    emailEl.value = 'jane@example.com';
    messageEl.value = 'My feedback';

    widget.dialog?.el?.querySelector('form')?.dispatchEvent(new Event('submit'));
    expect(sendFeedbackRequest).toHaveBeenCalledWith(
      {
        feedback: {
          name: 'Jane Doe',
          email: 'jane@example.com',
          message: 'My feedback',
          url: 'http://localhost/',
          source: 'widget',
        },
      },
      {},
    );

    // sendFeedbackRequest is async
    await flushPromises();
    expect(onSubmitSuccess).toHaveBeenCalledTimes(1);

    expect(widget.dialog).toBeUndefined();
    expect(shadow.querySelector('.success-message')?.textContent).toBe(SUCCESS_MESSAGE_TEXT);

    jest.runAllTimers();
    expect(shadow.querySelector('.success-message')).toBeNull();
  });

  it('submits feedback with error on request', async () => {
    const onSubmitError = jest.fn(() => {});
    const { shadow, widget } = createShadowAndWidget({
      onSubmitError,
    });

    (sendFeedbackRequest as jest.Mock).mockImplementation(() => {
      throw new Error('Unable to send feedback');
    });
    widget.actor?.el?.dispatchEvent(new Event('click'));

    const messageEl = widget.dialog?.el?.querySelector('[name="message"]') as HTMLTextAreaElement;
    messageEl.value = 'My feedback';

    messageEl.dispatchEvent(new Event('change'));

    widget.dialog?.el?.querySelector('form')?.dispatchEvent(new Event('submit'));
    expect(sendFeedbackRequest).toHaveBeenCalledWith(
      {
        feedback: {
          name: '',
          email: '',
          message: 'My feedback',
          url: 'http://localhost/',
          source: 'widget',
        },
      },
      {},
    );

    // sendFeedbackRequest is async
    await flushPromises();

    expect(onSubmitError).toHaveBeenCalledTimes(1);

    expect(widget.dialog).not.toBeUndefined();
    expect(shadow.querySelector('.form__error-container')?.textContent).toBe(
      'There was a problem submitting feedback, please wait and try again.',
    );
  });

  it('closes when Cancel button is clicked', () => {
    const onFormClose = jest.fn();
    const { widget } = createShadowAndWidget({ onFormClose });

    widget.actor?.el?.dispatchEvent(new Event('click'));
    expect(widget.dialog?.el).toBeInstanceOf(HTMLDialogElement);
    expect(widget.dialog?.el?.open).toBe(true);
    expect(widget.actor?.el?.getAttribute('aria-hidden')).toBe('true');

    // Click cancel button
    widget.dialog?.el?.querySelector('[aria-label="Cancel"]')?.dispatchEvent(new Event('click'));

    // Element/component should still exist, but it will be in a closed state
    expect(widget.dialog?.el).toBeInstanceOf(HTMLDialogElement);
    expect(widget.dialog?.el?.open).toBe(false);
    expect(onFormClose).toHaveBeenCalledTimes(1);

    // Actor should now be visible too
    expect(widget.actor?.el?.getAttribute('aria-hidden')).toBe('false');

    // Open it up again
    widget.actor?.el?.dispatchEvent(new Event('click'));
    expect(widget.dialog?.el).toBeInstanceOf(HTMLDialogElement);
    expect(widget.dialog?.el?.open).toBe(true);
    expect(widget.actor?.el?.getAttribute('aria-hidden')).toBe('true');
  });

  it('closes when dialog (background)) is clicked', () => {
    const onFormClose = jest.fn();
    const { widget } = createShadowAndWidget({ onFormClose });

    widget.actor?.el?.dispatchEvent(new Event('click'));
    expect(widget.dialog?.el).toBeInstanceOf(HTMLDialogElement);
    expect(widget.dialog?.el?.open).toBe(true);
    expect(widget.actor?.el?.getAttribute('aria-hidden')).toBe('true');

    // Click the actual dialog element (which serves as modal backdrop)
    widget.dialog?.el?.dispatchEvent(new Event('click'));

    // Element/component should still exist, but it will be in a closed state
    expect(widget.dialog?.el).toBeInstanceOf(HTMLDialogElement);
    expect(widget.dialog?.el?.open).toBe(false);
    expect(onFormClose).toHaveBeenCalledTimes(1);

    // Actor should now be visible too
    expect(widget.actor?.el?.getAttribute('aria-hidden')).toBe('false');

    // Open it up again
    widget.actor?.el?.dispatchEvent(new Event('click'));
    expect(widget.dialog?.el).toBeInstanceOf(HTMLDialogElement);
    expect(widget.dialog?.el?.open).toBe(true);
    expect(widget.actor?.el?.getAttribute('aria-hidden')).toBe('true');
  });

  it('attaches to a custom actor element', () => {
    const onFormOpen = jest.fn();
    // This element is in the normal DOM
    const myActor = document.createElement('div');
    myActor.textContent = 'my button';

    const { widget } = createShadowAndWidget(
      {
        autoInject: false,
        onFormOpen,
      },
      {
        attachTo: myActor,
      },
    );

    myActor.dispatchEvent(new Event('click'));
    expect(widget.dialog?.el).toBeInstanceOf(HTMLDialogElement);
    expect(widget.dialog?.el?.open).toBe(true);
    expect(onFormOpen).toHaveBeenCalledTimes(1);
    // This is all we do with `attachTo` (open dialog)
  });
});
