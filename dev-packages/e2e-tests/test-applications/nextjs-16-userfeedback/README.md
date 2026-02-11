# Next.js 16 User Feedback E2E Tests

This test application verifies the Sentry User Feedback SDK functionality with Next.js 16.

## Tests

The tests cover various feedback APIs:

- `attachTo()` - Attaching feedback to custom buttons
- `createWidget()` - Creating/removing feedback widget triggers
- `createForm()` - Creating feedback forms with custom labels
- `captureFeedback()` - Programmatic feedback submission
- ThumbsUp/ThumbsDown sentiment tagging
- Dialog cancellation

## Credits

Shoutout to [Ryan Albrecht](https://github.com/ryan953) for the underlying [testing app](https://github.com/ryan953/nextjs-test-feedback)!
