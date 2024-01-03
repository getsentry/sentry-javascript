Sentry.setTags({
  tag_1: 'foo',
  tag_2: Math.PI,
  tag_3: false,
  tag_4: null,
  tag_5: undefined,
  tag_6: -1,
});

Sentry.captureMessage('primitive_tags');
