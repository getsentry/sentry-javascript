import { feedbackModalIntegration } from './integration';

describe('feedbackModalIntegration', () => {
  it('should have createDialog', () => {
    const instance = feedbackModalIntegration();
    expect(instance).toHaveProperty('createDialog');
  });
});
