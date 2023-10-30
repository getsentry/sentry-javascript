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
import { createShadowHost } from '../../src/widget/createShadowHost';
import { createWidget } from '../../src/widget/createWidget';

const DEFAULT_OPTIONS = {
  id: 'sentry-feedback',
  autoInject: true,
  showEmail: true,
  showName: true,
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

describe('createWidget', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates widget with actor', () => {
    const { shadow } = createShadowHost({
      id: 'feedback',
      colorScheme: 'system',
      themeLight: DEFAULT_THEME.light,
      themeDark: DEFAULT_THEME.dark,
    });
    const widget = createWidget({
      shadow,
      options: DEFAULT_OPTIONS,
    });

    expect(widget.actor?.el).toBeInstanceOf(HTMLButtonElement);
    expect(widget.actor?.el.textContent).toBe(DEFAULT_OPTIONS.buttonLabel);
    // No dialog until actor is clicked
    expect(widget.dialog).toBeUndefined();
  });

  it('clicking on actor opens dialog', () => {
    const { shadow } = createShadowHost({
      id: 'feedback',
      colorScheme: 'system',
      themeLight: DEFAULT_THEME.light,
      themeDark: DEFAULT_THEME.dark,
    });
    const widget = createWidget({
      shadow,
      options: DEFAULT_OPTIONS,
    });

    widget.actor?.el.dispatchEvent(new Event('click'));
    // No dialog until actor is clicked
    expect(widget.dialog?.el).toBeInstanceOf(HTMLDialogElement);
  });
});
