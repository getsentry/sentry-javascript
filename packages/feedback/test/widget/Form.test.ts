import type { FormComponentProps } from '../../src/widget/Form';
import { Form } from '../../src/widget/Form';

type NonNullableFields<T> = {
  [P in keyof T]: NonNullable<T[P]>;
};

function renderForm({
  showName = true,
  showEmail = true,
  isAnonymous = false,
  isNameRequired = false,
  isEmailRequired = false,
  defaultName = 'Foo Bar',
  defaultEmail = 'foo@example.com',
  nameLabel = 'Name',
  namePlaceholder = 'Your full name',
  emailLabel = 'Email',
  emailPlaceholder = 'foo@example.org',
  messageLabel = 'Description',
  messagePlaceholder = 'What is the issue?',
  cancelButtonLabel = 'Cancel!',
  submitButtonLabel = 'Submit!',
  ...rest
}: Partial<FormComponentProps> = {}) {
  return Form({
    isAnonymous,
    showName,
    showEmail,
    isNameRequired,
    isEmailRequired,
    defaultName,
    defaultEmail,
    nameLabel,
    namePlaceholder,
    emailLabel,
    emailPlaceholder,
    messageLabel,
    messagePlaceholder,
    cancelButtonLabel,
    submitButtonLabel,
    ...rest,
  }) as NonNullableFields<ReturnType<typeof Form>>;
}

describe('Form', () => {
  it('renders a form', () => {
    const formComponent = renderForm();

    expect(formComponent.el).toBeInstanceOf(HTMLFormElement);
    const nameInput = formComponent.el.querySelector('[name="name"][type="text"]') as HTMLInputElement;
    const emailInput = formComponent.el.querySelector('[name="email"][type="text"]') as HTMLInputElement;
    expect(nameInput).not.toBeNull();
    expect(emailInput).not.toBeNull();
    expect(nameInput.value).toBe('Foo Bar');
    expect(emailInput.value).toBe('foo@example.com');
    expect(formComponent.el.querySelector('[name="message"]')).not.toBeNull();

    const button = formComponent.el.querySelector('button[type="submit"]') as HTMLButtonElement | null;
    expect(button?.textContent).toBe('Submit!');
    expect(formComponent.el.querySelector('button[type="button"]')?.textContent).toBe('Cancel!');
  });

  it('can hide name and email inputs', () => {
    const formComponent = renderForm({
      showName: false,
      showEmail: false,
    });

    const nameInput = formComponent.el.querySelector('[name="name"][type="hidden"]') as HTMLInputElement;
    const emailInput = formComponent.el.querySelector('[name="email"][type="hidden"]') as HTMLInputElement;
    expect(nameInput).not.toBeNull();
    expect(emailInput).not.toBeNull();
    expect(nameInput.value).toBe('Foo Bar');
    expect(emailInput.value).toBe('foo@example.com');
    expect(formComponent.el.querySelector('[name="message"]')).not.toBeNull();
  });

  it('can change text labels', () => {
    const formComponent = renderForm({
      nameLabel: 'Name!',
      namePlaceholder: 'Your full name!',
      emailLabel: 'Email!',
      emailPlaceholder: 'foo@example.org!',
      messageLabel: 'Description!',
      messagePlaceholder: 'What is the issue?!',
      isNameRequired: true,
      isEmailRequired: true,
    });

    const nameLabel = formComponent.el.querySelector('label[htmlFor="name"]') as HTMLLabelElement;
    const emailLabel = formComponent.el.querySelector('label[htmlFor="email"]') as HTMLLabelElement;
    const messageLabel = formComponent.el.querySelector('label[htmlFor="message"]') as HTMLLabelElement;
    expect(nameLabel.textContent).toBe('Name! (required)');
    expect(emailLabel.textContent).toBe('Email! (required)');
    expect(messageLabel.textContent).toBe('Description! (required)');

    const nameInput = formComponent.el.querySelector('[name="name"]') as HTMLInputElement;
    const emailInput = formComponent.el.querySelector('[name="email"]') as HTMLInputElement;
    const messageInput = formComponent.el.querySelector('[name="message"]') as HTMLTextAreaElement;

    expect(nameInput.placeholder).toBe('Your full name!');
    expect(emailInput.placeholder).toBe('foo@example.org!');
    expect(messageInput.placeholder).toBe('What is the issue?!');
  });

  it('submit is enabled if message is not empty', () => {
    const formComponent = renderForm();

    const message = formComponent.el.querySelector('[name="message"]') as HTMLTextAreaElement;

    message.value = 'Foo (message)';
    message.dispatchEvent(new KeyboardEvent('keyup'));

    message.value = '';
    message.dispatchEvent(new KeyboardEvent('keyup'));
  });

  it('submit is enabled if name is required and is not empty', () => {
    const formComponent = renderForm({isNameRequired: true});

    const name = formComponent.el.querySelector('[name="name"]') as HTMLTextAreaElement;

    name.value = 'Foo Bar';
    name.dispatchEvent(new KeyboardEvent('keyup'));

    name.value = '';
    name.dispatchEvent(new KeyboardEvent('keyup'));
  });

  it('submit is enabled if email is required and is not empty', () => {
    const formComponent = renderForm({isEmailRequired: true});

    const email = formComponent.el.querySelector('[name="email"]') as HTMLTextAreaElement;

    email.value = 'foo@example.org';
    email.dispatchEvent(new KeyboardEvent('keyup'));

    email.value = '';
    email.dispatchEvent(new KeyboardEvent('keyup'));
  });

  it('can show error', () => {
    const formComponent = renderForm();
    const errorEl = formComponent.el.querySelector('.form__error-container') as HTMLDivElement;
    expect(errorEl.getAttribute('aria-hidden')).toBe('true');

    formComponent.showError('My Error');
    expect(errorEl.getAttribute('aria-hidden')).toBe('false');
    expect(errorEl.textContent).toBe('My Error');

    formComponent.hideError();
    expect(errorEl.getAttribute('aria-hidden')).toBe('true');
    expect(errorEl.textContent).toBe('');
  });

  it('calls `onCancel` callback', () => {
    const onCancel = jest.fn(() => {});
    const formComponent = renderForm({ onCancel });
    (formComponent.el.querySelector('button[type="button"]') as HTMLButtonElement)?.click();
    expect(onCancel).toHaveBeenCalled();
  });

  it('calls `onSubmit` callback when submitting', () => {
    const onSubmit = jest.fn();
    const formComponent = renderForm({ onSubmit });
    const submitEvent = new Event('submit');

    formComponent.el.dispatchEvent(submitEvent);

    expect(onSubmit).toHaveBeenCalledWith({
      email: 'foo@example.com',
      message: '',
      name: 'Foo Bar',
    });
  });

  it('does not show name or email inputs for anonymous mode', () => {
    const onSubmit = jest.fn();
    const formComponent = renderForm({
      isNameRequired: true,
      isEmailRequired: true,
      isAnonymous: true,
      onSubmit,
    });
    const submitEvent = new Event('submit');

    expect(formComponent.el).toBeInstanceOf(HTMLFormElement);
    const nameInput = formComponent.el.querySelector('[name="name"][type="text"]') as HTMLInputElement;
    const emailInput = formComponent.el.querySelector('[name="email"][type="text"]') as HTMLInputElement;
    expect(nameInput).toBeNull();
    expect(emailInput).toBeNull();
    expect(formComponent.el.querySelector('[name="message"]')).not.toBeNull();

    const message = formComponent.el.querySelector('[name="message"]') as HTMLTextAreaElement;
    message.value = 'Foo (message)';
    message.dispatchEvent(new KeyboardEvent('keyup'));

    formComponent.el.dispatchEvent(submitEvent);
    expect(onSubmit).toHaveBeenCalledWith({
      email: '',
      message: 'Foo (message)',
      name: '',
    });
  });
});
