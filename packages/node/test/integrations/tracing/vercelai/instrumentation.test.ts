import { describe, expect, test } from 'vitest';
import { determineRecordingSettings } from '../../../../src/integrations/tracing/vercelai/instrumentation';

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
