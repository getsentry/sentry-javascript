import { _INTERNAL_getSpanContextForToolCallId, _INTERNAL_toolCallSpanContextMap } from '@sentry/core';
import { beforeEach, describe, expect, test } from 'vitest';
import {
  checkResultForToolErrors,
  determineRecordingSettings,
} from '../../../../src/integrations/tracing/vercelai/instrumentation';

describe('determineRecordingSettings', () => {
  test('should use integration recording options when provided (recordInputs: true, recordOutputs: false)', () => {
    const result = determineRecordingSettings(
      { recordInputs: true, recordOutputs: false }, // integrationRecordingOptions
      {}, // methodTelemetryOptions
      undefined, // telemetryExplicitlyEnabled
      false, // defaultRecordingEnabled
    );

    expect(result).toEqual({
      recordInputs: true,
      recordOutputs: false,
    });
  });

  test('should use integration recording options when provided (recordInputs: false, recordOutputs: true)', () => {
    const result = determineRecordingSettings(
      { recordInputs: false, recordOutputs: true }, // integrationRecordingOptions
      {}, // methodTelemetryOptions
      true, // telemetryExplicitlyEnabled
      true, // defaultRecordingEnabled
    );

    expect(result).toEqual({
      recordInputs: false,
      recordOutputs: true,
    });
  });

  test('should fall back to method telemetry options when integration options not provided', () => {
    const result = determineRecordingSettings(
      {}, // integrationRecordingOptions
      { recordInputs: true, recordOutputs: false }, // methodTelemetryOptions
      undefined, // telemetryExplicitlyEnabled
      false, // defaultRecordingEnabled
    );

    expect(result).toEqual({
      recordInputs: true,
      recordOutputs: false,
    });
  });

  test('should prefer integration recording options over method telemetry options', () => {
    const result = determineRecordingSettings(
      { recordInputs: false, recordOutputs: false }, // integrationRecordingOptions
      { recordInputs: true, recordOutputs: true }, // methodTelemetryOptions
      undefined, // telemetryExplicitlyEnabled
      true, // defaultRecordingEnabled
    );

    expect(result).toEqual({
      recordInputs: false,
      recordOutputs: false,
    });
  });

  test('should default to recording when telemetry is explicitly enabled', () => {
    const result = determineRecordingSettings(
      {}, // integrationRecordingOptions
      {}, // methodTelemetryOptions
      true, // telemetryExplicitlyEnabled
      false, // defaultRecordingEnabled
    );

    expect(result).toEqual({
      recordInputs: true,
      recordOutputs: true,
    });
  });

  test('should use default recording setting when telemetry is explicitly disabled', () => {
    const result = determineRecordingSettings(
      {}, // integrationRecordingOptions
      {}, // methodTelemetryOptions
      false, // telemetryExplicitlyEnabled
      true, // defaultRecordingEnabled
    );

    expect(result).toEqual({
      recordInputs: true,
      recordOutputs: true,
    });
  });

  test('should use default recording setting when telemetry enablement is undefined', () => {
    const result = determineRecordingSettings(
      {}, // integrationRecordingOptions
      {}, // methodTelemetryOptions
      undefined, // telemetryExplicitlyEnabled
      true, // defaultRecordingEnabled
    );

    expect(result).toEqual({
      recordInputs: true,
      recordOutputs: true,
    });
  });

  test('should not record when default recording is disabled and no explicit configuration', () => {
    const result = determineRecordingSettings(
      {}, // integrationRecordingOptions
      {}, // methodTelemetryOptions
      undefined, // telemetryExplicitlyEnabled
      false, // defaultRecordingEnabled
    );

    expect(result).toEqual({
      recordInputs: false,
      recordOutputs: false,
    });
  });

  test('should handle partial integration recording options (only recordInputs)', () => {
    const result = determineRecordingSettings(
      { recordInputs: true }, // integrationRecordingOptions
      {}, // methodTelemetryOptions
      false, // telemetryExplicitlyEnabled
      false, // defaultRecordingEnabled
    );

    expect(result).toEqual({
      recordInputs: true,
      recordOutputs: false, // falls back to defaultRecordingEnabled
    });
  });

  test('should handle partial integration recording options (only recordOutputs)', () => {
    const result = determineRecordingSettings(
      { recordOutputs: true }, // integrationRecordingOptions
      {}, // methodTelemetryOptions
      false, // telemetryExplicitlyEnabled
      false, // defaultRecordingEnabled
    );

    expect(result).toEqual({
      recordInputs: false, // falls back to defaultRecordingEnabled
      recordOutputs: true,
    });
  });

  test('should handle partial method telemetry options (only recordInputs)', () => {
    const result = determineRecordingSettings(
      {}, // integrationRecordingOptions
      { recordInputs: true }, // methodTelemetryOptions
      false, // telemetryExplicitlyEnabled
      false, // defaultRecordingEnabled
    );

    expect(result).toEqual({
      recordInputs: true,
      recordOutputs: false, // falls back to defaultRecordingEnabled
    });
  });

  test('should handle partial method telemetry options (only recordOutputs)', () => {
    const result = determineRecordingSettings(
      {}, // integrationRecordingOptions
      { recordOutputs: true }, // methodTelemetryOptions
      false, // telemetryExplicitlyEnabled
      false, // defaultRecordingEnabled
    );

    expect(result).toEqual({
      recordInputs: false, // falls back to defaultRecordingEnabled
      recordOutputs: true,
    });
  });

  test('should prefer integration recording options over method telemetry for partial configs', () => {
    const result = determineRecordingSettings(
      { recordInputs: false }, // integrationRecordingOptions
      { recordInputs: true, recordOutputs: true }, // methodTelemetryOptions
      false, // telemetryExplicitlyEnabled
      true, // defaultRecordingEnabled
    );

    expect(result).toEqual({
      recordInputs: false, // from integration recording options
      recordOutputs: true, // from method telemetry options
    });
  });

  test('complex scenario: sendDefaultPii enabled, telemetry enablement undefined, mixed options', () => {
    const result = determineRecordingSettings(
      { recordOutputs: false }, // integrationRecordingOptions
      { recordInputs: false }, // methodTelemetryOptions
      undefined, // telemetryExplicitlyEnabled
      true, // defaultRecordingEnabled (sendDefaultPii: true)
    );

    expect(result).toEqual({
      recordInputs: false, // from method telemetry options
      recordOutputs: false, // from integration recording options
    });
  });

  test('complex scenario: explicit telemetry enabled overrides sendDefaultPii disabled', () => {
    const result = determineRecordingSettings(
      {}, // integrationRecordingOptions
      {}, // methodTelemetryOptions
      true, // telemetryExplicitlyEnabled
      false, // defaultRecordingEnabled (sendDefaultPii: false)
    );

    expect(result).toEqual({
      recordInputs: true,
      recordOutputs: true,
    });
  });
});

describe('checkResultForToolErrors', () => {
  beforeEach(() => {
    _INTERNAL_toolCallSpanContextMap.clear();
  });

  test('cleans up span context map on successful tool-result', () => {
    _INTERNAL_toolCallSpanContextMap.set('tool-1', { traceId: 't1', spanId: 's1' });
    _INTERNAL_toolCallSpanContextMap.set('tool-2', { traceId: 't2', spanId: 's2' });

    checkResultForToolErrors({
      content: [{ type: 'tool-result', toolCallId: 'tool-1', toolName: 'bash' }],
    });

    expect(_INTERNAL_getSpanContextForToolCallId('tool-1')).toBeUndefined();
    // tool-2 should be unaffected
    expect(_INTERNAL_getSpanContextForToolCallId('tool-2')).toEqual({ traceId: 't2', spanId: 's2' });
  });

  test('cleans up span context map on tool-error', () => {
    _INTERNAL_toolCallSpanContextMap.set('tool-1', { traceId: 't1', spanId: 's1' });

    checkResultForToolErrors({
      content: [{ type: 'tool-error', toolCallId: 'tool-1', toolName: 'bash', error: new Error('fail') }],
    });

    expect(_INTERNAL_getSpanContextForToolCallId('tool-1')).toBeUndefined();
  });

  test('handles mixed tool-result and tool-error in same content array', () => {
    _INTERNAL_toolCallSpanContextMap.set('tool-1', { traceId: 't1', spanId: 's1' });
    _INTERNAL_toolCallSpanContextMap.set('tool-2', { traceId: 't2', spanId: 's2' });

    checkResultForToolErrors({
      content: [
        { type: 'tool-result', toolCallId: 'tool-1', toolName: 'bash' },
        { type: 'tool-error', toolCallId: 'tool-2', toolName: 'bash', error: new Error('fail') },
      ],
    });

    expect(_INTERNAL_getSpanContextForToolCallId('tool-1')).toBeUndefined();
    expect(_INTERNAL_getSpanContextForToolCallId('tool-2')).toBeUndefined();
  });

  test('does not throw for tool-error with unknown toolCallId', () => {
    checkResultForToolErrors({
      content: [{ type: 'tool-error', toolCallId: 'unknown', toolName: 'bash', error: new Error('fail') }],
    });

    // Should not throw, just captures without span linking
  });

  test('ignores results without content array', () => {
    _INTERNAL_toolCallSpanContextMap.set('tool-1', { traceId: 't1', spanId: 's1' });

    checkResultForToolErrors({});
    checkResultForToolErrors(null);
    checkResultForToolErrors({ content: 'not-an-array' });

    // Map should be untouched
    expect(_INTERNAL_getSpanContextForToolCallId('tool-1')).toEqual({ traceId: 't1', spanId: 's1' });
  });
});
