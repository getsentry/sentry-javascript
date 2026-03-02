import { HttpApiEndpoint, HttpApiGroup } from '@effect/platform';
import { Schema } from 'effect';

export const TestResult = Schema.Struct({
  status: Schema.String,
});

export const NestedResult = Schema.Struct({
  result: Schema.String,
});

export const ErrorResult = Schema.Struct({
  error: Schema.String,
});

export const LogResult = Schema.Struct({
  logged: Schema.Boolean,
});

export const MetricResult = Schema.Struct({
  incremented: Schema.Number,
});

export class TestApi extends HttpApiGroup.make('test')
  .add(HttpApiEndpoint.get('success', '/test-success').addSuccess(TestResult))
  .add(HttpApiEndpoint.get('effectSpan', '/test-effect-span').addSuccess(TestResult))
  .add(HttpApiEndpoint.get('nestedSpans', '/test-nested-spans').addSuccess(NestedResult))
  .add(HttpApiEndpoint.get('effectError', '/test-effect-error').addSuccess(ErrorResult))
  .add(HttpApiEndpoint.get('effectLog', '/test-effect-log').addSuccess(LogResult))
  .add(HttpApiEndpoint.get('effectMetric', '/test-effect-metric').addSuccess(MetricResult))
  .add(HttpApiEndpoint.get('effectWithHttp', '/test-effect-with-http').addSuccess(TestResult)) {}
