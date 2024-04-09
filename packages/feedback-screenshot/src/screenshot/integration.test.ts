import { feedbackScreenshotIntegration } from './integration';

describe('feedbackScreenshotIntegration', () => {
  it('should have createInput', () => {
    const instance = feedbackScreenshotIntegration();
    expect(instance).toHaveProperty('createInput');
  });
});
