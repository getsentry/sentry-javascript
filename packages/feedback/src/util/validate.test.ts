import { getMissingFields } from './validate';

const BASE_FEEDBACK = {
  message: '',
  name: '',
  email: '',
  attachments: undefined,
};
const BASE_OPTIONS = {
  emailLabel: 'Email',
  isEmailRequired: false,
  isNameRequired: false,
  messageLabel: 'Message',
  nameLabel: 'Name',
};

describe('validate', () => {
  it('should be invalid when message is falsey', () => {
    const result = getMissingFields(BASE_FEEDBACK, BASE_OPTIONS);

    expect(result).toEqual(['Message']);
  });

  it('should be valid when message is filled out', () => {
    const result = getMissingFields({ ...BASE_FEEDBACK, message: 'Hello world' }, BASE_OPTIONS);

    expect(result).toEqual([]);
  });

  it('should be invalid when name & email are required', () => {
    const result = getMissingFields(BASE_FEEDBACK, { ...BASE_OPTIONS, isNameRequired: true, isEmailRequired: true });

    expect(result).toEqual(['Name', 'Email', 'Message']);
  });

  it('should be valid when name & email are required and not falsey', () => {
    const result = getMissingFields(
      { message: 'Hello world', name: 'Alice', email: 'alice@example.com', attachments: undefined },
      { ...BASE_OPTIONS, isNameRequired: true, isEmailRequired: true },
    );

    expect(result).toEqual([]);
  });
});
