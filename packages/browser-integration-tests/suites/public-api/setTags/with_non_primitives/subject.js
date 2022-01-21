Sentry.setTags({
  tag_1: {},
  tag_2: [],
  tag_3: ['a', new Map()],
  tag_4: () => {},
});

Sentry.captureMessage('non_primitives');
