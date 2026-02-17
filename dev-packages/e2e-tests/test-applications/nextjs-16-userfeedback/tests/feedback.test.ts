import { expect, test } from '@playwright/test';
import { waitForEnvelopeItem } from '@sentry-internal/test-utils';
import type { FeedbackEvent } from '@sentry/core';

test('FeedbackButton opens and submits feedback', async ({ page }) => {
  const feedbackPromise = waitForEnvelopeItem('nextjs-16-userfeedback', envelopeItem => {
    const [envelopeItemHeader] = envelopeItem;
    return envelopeItemHeader.type === 'feedback';
  });

  await page.goto('/');
  await page.getByTestId('feedback-button').click();

  const feedbackDialog = page.locator('[data-sentry-feedback]');
  await expect(feedbackDialog).toBeVisible({ timeout: 5000 });

  await feedbackDialog.locator('[name="name"]').fill('Feedback Button User');
  await feedbackDialog.locator('[name="email"]').fill('button@example.com');
  await feedbackDialog.locator('[name="message"]').fill('Feedback from FeedbackButton');
  await feedbackDialog.locator('.btn--primary').click();

  const envelopeItem = await feedbackPromise;
  const feedbackEvent = envelopeItem[1] as FeedbackEvent;

  expect(feedbackEvent.contexts?.feedback).toMatchObject({
    name: 'Feedback Button User',
    contact_email: 'button@example.com',
    message: 'Feedback from FeedbackButton',
    source: 'widget',
  });
  expect(feedbackEvent.tags).toMatchObject({ component: 'FeedbackButton' });
});

test('createWidget adds and removes feedback trigger', async ({ page }) => {
  await page.goto('/');

  const toggleButton = page.getByTestId('toggle-feedback-button');
  await expect(toggleButton).toHaveText('Create Widget');

  await toggleButton.click();
  await expect(toggleButton).toHaveText('Remove Widget', { timeout: 5000 });
  await expect(page.locator('.widget__actor')).toBeVisible({ timeout: 5000 });

  await toggleButton.click();
  await expect(toggleButton).toHaveText('Create Widget', { timeout: 5000 });
  await expect(page.locator('.widget__actor')).not.toBeVisible();
});

test('createWidget trigger opens feedback form and submits', async ({ page }) => {
  const feedbackPromise = waitForEnvelopeItem('nextjs-16-userfeedback', envelopeItem => {
    const [envelopeItemHeader] = envelopeItem;
    return envelopeItemHeader.type === 'feedback';
  });

  await page.goto('/');
  await page.getByTestId('toggle-feedback-button').click();
  await expect(page.locator('.widget__actor')).toBeVisible({ timeout: 5000 });

  await page.locator('.widget__actor').click();

  const feedbackDialog = page.locator('[data-sentry-feedback]');
  await expect(feedbackDialog).toBeVisible({ timeout: 5000 });

  await feedbackDialog.locator('[name="name"]').fill('Widget User');
  await feedbackDialog.locator('[name="email"]').fill('widget@example.com');
  await feedbackDialog.locator('[name="message"]').fill('Feedback from widget trigger');
  await feedbackDialog.locator('.btn--primary').click();

  const envelopeItem = await feedbackPromise;
  const feedbackEvent = envelopeItem[1] as FeedbackEvent;

  expect(feedbackEvent.contexts?.feedback).toMatchObject({
    name: 'Widget User',
    contact_email: 'widget@example.com',
    message: 'Feedback from widget trigger',
    source: 'widget',
  });
  expect(feedbackEvent.tags).toMatchObject({ component: 'ToggleFeedbackButton' });
});

test('attachTo opens feedback dialog', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('attach-to-button').click();
  await expect(page.locator('[data-sentry-feedback]')).toBeVisible({ timeout: 5000 });
});

test('createForm opens feedback dialog', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('create-form-button').click();
  await expect(page.locator('[data-sentry-feedback]')).toBeVisible({ timeout: 5000 });
});

test('captureFeedback sends feedback envelope', async ({ page }) => {
  const feedbackPromise = waitForEnvelopeItem('nextjs-16-userfeedback', envelopeItem => {
    const [envelopeItemHeader] = envelopeItem;
    return envelopeItemHeader.type === 'feedback';
  });

  await page.goto('/');

  await page.getByTestId('my-form-name').fill('Custom Form User');
  await page.getByTestId('my-form-email').fill('custom@example.com');
  await page.getByTestId('my-form-message').fill('Feedback via captureFeedback API');
  await page.getByTestId('my-form-submit').click();

  const envelopeItem = await feedbackPromise;
  const feedbackEvent = envelopeItem[1] as FeedbackEvent;

  expect(feedbackEvent.contexts?.feedback).toMatchObject({
    name: 'Custom Form User',
    contact_email: 'custom@example.com',
    message: 'Feedback via captureFeedback API',
  });
  expect(feedbackEvent.tags).toMatchObject({ component: 'MyFeedbackForm' });
});

test('ThumbsUp sends feedback with positive tag', async ({ page }) => {
  const feedbackPromise = waitForEnvelopeItem('nextjs-16-userfeedback', envelopeItem => {
    const [envelopeItemHeader] = envelopeItem;
    return envelopeItemHeader.type === 'feedback';
  });

  await page.goto('/');
  await page.getByTestId('thumbs-up-button').click();

  const feedbackDialog = page.locator('[data-sentry-feedback]');
  await expect(feedbackDialog).toBeVisible({ timeout: 5000 });

  await feedbackDialog.locator('[name="name"]').fill('Happy User');
  await feedbackDialog.locator('[name="email"]').fill('happy@example.com');
  await feedbackDialog.locator('[name="message"]').fill('Great experience!');
  await feedbackDialog.locator('.btn--primary').click();

  const envelopeItem = await feedbackPromise;
  const feedbackEvent = envelopeItem[1] as FeedbackEvent;

  expect(feedbackEvent.contexts?.feedback).toMatchObject({
    message: 'Great experience!',
    source: 'widget',
  });
  expect(feedbackEvent.tags).toMatchObject({
    component: 'ThumbsUpDownButtons',
    'feedback.type': 'positive',
  });
});

test('ThumbsDown sends feedback with negative tag', async ({ page }) => {
  const feedbackPromise = waitForEnvelopeItem('nextjs-16-userfeedback', envelopeItem => {
    const [envelopeItemHeader] = envelopeItem;
    return envelopeItemHeader.type === 'feedback';
  });

  await page.goto('/');
  await page.getByTestId('thumbs-down-button').click();

  const feedbackDialog = page.locator('[data-sentry-feedback]');
  await expect(feedbackDialog).toBeVisible({ timeout: 5000 });

  await feedbackDialog.locator('[name="name"]').fill('Unhappy User');
  await feedbackDialog.locator('[name="email"]').fill('unhappy@example.com');
  await feedbackDialog.locator('[name="message"]').fill('Could be better');
  await feedbackDialog.locator('.btn--primary').click();

  const envelopeItem = await feedbackPromise;
  const feedbackEvent = envelopeItem[1] as FeedbackEvent;

  expect(feedbackEvent.contexts?.feedback).toMatchObject({
    message: 'Could be better',
    source: 'widget',
  });
  expect(feedbackEvent.tags).toMatchObject({
    component: 'ThumbsUpDownButtons',
    'feedback.type': 'negative',
  });
});

test('createForm supports custom labels', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('translated-feedback-button').click();

  const feedbackDialog = page.locator('[data-sentry-feedback]');
  await expect(feedbackDialog).toBeVisible({ timeout: 5000 });

  await expect(page.locator('#sentry-feedback .dialog__title')).toHaveText('Feedback Test Area');
  await expect(page.locator('#sentry-feedback').getByPlaceholder('Tell me about it')).toBeVisible();
  await expect(page.locator('#sentry-feedback').getByPlaceholder('you@example.com or (555) 555-5555')).toBeVisible();
  await expect(page.locator('#sentry-feedback').getByPlaceholder('Name, nickname, etc.')).toBeVisible();
});

test('feedback dialog can be cancelled', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('feedback-button').click();

  const feedbackDialog = page.locator('[data-sentry-feedback]');
  await expect(feedbackDialog).toBeVisible({ timeout: 5000 });

  await feedbackDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(feedbackDialog).not.toBeVisible({ timeout: 5000 });
});

test('crash report button triggers error for user feedback modal', async ({ page }) => {
  const errorPromise = waitForEnvelopeItem('nextjs-16-userfeedback', envelopeItem => {
    const [envelopeItemHeader, envelopeItemBody] = envelopeItem;
    if (envelopeItemHeader.type !== 'event') return false;
    const event = envelopeItemBody as { exception?: { values?: Array<{ value?: string }> } };
    return event.exception?.values?.[0]?.value === 'Crash Report Button Clicked';
  });

  await page.goto('/');
  await page.getByTestId('crash-report-button').click();

  const envelopeItem = await errorPromise;
  const errorEvent = envelopeItem[1] as { exception?: { values?: Array<{ value?: string }> } };

  expect(errorEvent.exception?.values?.[0]?.value).toBe('Crash Report Button Clicked');
});
