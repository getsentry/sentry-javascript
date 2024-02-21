import type { DialogProps } from '../../src/widget/Dialog';
import { Dialog } from '../../src/widget/Dialog';

type NonNullableFields<T> = {
  [P in keyof T]: NonNullable<T[P]>;
};

function renderDialog({
  showName = true,
  showEmail = true,
  showBranding = false,
  isNameRequired = false,
  isEmailRequired = false,
  formTitle = 'Feedback',
  defaultName = 'Foo Bar',
  defaultEmail = 'foo@example.com',
  colorScheme = 'light',
  nameLabel = 'Name',
  namePlaceholder = 'Your full name',
  emailLabel = 'Email',
  emailPlaceholder = 'foo@example.org',
  messageLabel = 'Description',
  messagePlaceholder = 'What is the issue?',
  cancelButtonLabel = 'Cancel!',
  submitButtonLabel = 'Submit!',
  ...rest
}: Partial<DialogProps> = {}) {
  return Dialog({
    formTitle,

    showName,
    showEmail,
    isNameRequired,
    isEmailRequired,
    showBranding,
    defaultName,
    defaultEmail,
    colorScheme,
    nameLabel,
    namePlaceholder,
    emailLabel,
    emailPlaceholder,
    messageLabel,
    messagePlaceholder,
    cancelButtonLabel,
    submitButtonLabel,
    ...rest,
  }) as NonNullableFields<ReturnType<typeof Dialog>>;
}

describe('Dialog', () => {
  it('renders the dialog w/ form', () => {
    const dialogComponent = renderDialog({
      formTitle: 'Feedback!',
    });

    expect(dialogComponent.el).toBeInstanceOf(HTMLDialogElement);
    expect(dialogComponent.el.querySelector('form')).toBeInstanceOf(HTMLFormElement);
    expect(dialogComponent.el.querySelector('h2')?.textContent).toBe('Feedback!');
  });

  it('can open and close dialog', () => {
    const dialogComponent = renderDialog();

    expect(dialogComponent.checkIsOpen()).toBe(true);

    dialogComponent.close();
    expect(dialogComponent.checkIsOpen()).toBe(false);

    dialogComponent.open();
    expect(dialogComponent.checkIsOpen()).toBe(true);
  });

  it('calls `onClosed` callback when clicked', () => {
    const onClosed = jest.fn();
    const dialogComponent = renderDialog({
      onClosed,
    });

    dialogComponent.el.dispatchEvent(new Event('click'));
    expect(onClosed).toHaveBeenCalledWith();
  });

  it('stops event propagation when dialog contents is clicked', () => {
    const onClosed = jest.fn();
    const dialogComponent = renderDialog({
      onClosed,
    });

    const event = new Event('click');
    jest.spyOn(event, 'stopPropagation');
    dialogComponent.el.querySelector('.dialog__content')?.dispatchEvent(event);

    expect(event.stopPropagation).toHaveBeenCalled();
    expect(onClosed).not.toHaveBeenCalled();
  });
});
