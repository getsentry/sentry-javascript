import * as SentryCore from '@sentry/core';
import type { Client } from '@sentry/types';

import { reportingObserverIntegration } from '../../../src/integrations/reportingobserver';

const mockScope = {
  setExtra: jest.fn(),
};

const withScope = jest.fn(callback => {
  return callback(mockScope);
});

const captureMessage = jest.fn();

const mockReportingObserverConstructor = jest.fn();
const mockObserve = jest.fn();

class MockReportingObserver {
  public observe: () => void = mockObserve;

  constructor(callback: () => void, options: unknown) {
    mockReportingObserverConstructor(callback, options);
  }
}

describe('ReportingObserver', () => {
  let mockClient: Client;

  beforeEach(() => {
    (global as any).ReportingObserver = MockReportingObserver;

    mockClient = {} as Client;

    jest.spyOn(SentryCore, 'captureMessage').mockImplementation(captureMessage);
    jest.spyOn(SentryCore, 'getClient').mockImplementation(() => mockClient);
    jest.spyOn(SentryCore, 'withScope').mockImplementation(withScope);
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete (global as any).ReportingObserver;
  });

  describe('setup', () => {
    it('should abort gracefully and not do anything when ReportingObserbver is not available in the runtime', () => {
      // Act like ReportingObserver is unavailable
      delete (global as any).ReportingObserver;

      const reportingObserver = reportingObserverIntegration();

      expect(() => {
        reportingObserver.setupOnce!();
      }).not.toThrow();

      expect(mockReportingObserverConstructor).not.toHaveBeenCalled();
      expect(mockObserve).not.toHaveBeenCalled();
    });

    it('should use default report types', () => {
      const reportingObserver = reportingObserverIntegration();
      reportingObserver.setupOnce!();
      reportingObserver.setup?.(mockClient);

      expect(mockReportingObserverConstructor).toHaveBeenCalledTimes(1);
      expect(mockReportingObserverConstructor).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ types: ['crash', 'deprecation', 'intervention'] }),
      );
    });

    it('should use user-provided report types', () => {
      const reportingObserver = reportingObserverIntegration({ types: ['crash'] });
      reportingObserver.setupOnce!();
      reportingObserver.setup?.(mockClient);

      expect(mockReportingObserverConstructor).toHaveBeenCalledTimes(1);
      expect(mockReportingObserverConstructor).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ types: ['crash'] }),
      );
    });

    it('should use `buffered` option', () => {
      const reportingObserver = reportingObserverIntegration();
      reportingObserver.setupOnce!();
      reportingObserver.setup?.(mockClient);

      expect(mockReportingObserverConstructor).toHaveBeenCalledTimes(1);
      expect(mockReportingObserverConstructor).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ buffered: true }),
      );
    });

    it('should call `observe` function', () => {
      const reportingObserver = reportingObserverIntegration();
      reportingObserver.setupOnce!();
      reportingObserver.setup?.(mockClient);

      expect(mockObserve).toHaveBeenCalledTimes(1);
    });
  });

  describe('handler', () => {
    it('should abort gracefully and not do anything when integration is not installed', () => {
      const reportingObserver = reportingObserverIntegration();
      reportingObserver.setupOnce!();
      // without calling setup, the integration is not registered

      const handler = mockReportingObserverConstructor.mock.calls[0][0];

      expect(() => {
        handler([{ type: 'crash', url: 'some url' }]);
      }).not.toThrow();

      expect(captureMessage).not.toHaveBeenCalled();
    });

    it('should capture messages', () => {
      const reportingObserver = reportingObserverIntegration();
      reportingObserver.setupOnce!();
      reportingObserver.setup?.(mockClient);
      const handler = mockReportingObserverConstructor.mock.calls[0][0];

      handler([
        { type: 'crash', url: 'some url' },
        { type: 'deprecation', url: 'some url' },
      ]);

      expect(captureMessage).toHaveBeenCalledTimes(2);
    });

    it('should set extra including the url of a report', () => {
      const reportingObserver = reportingObserverIntegration();
      reportingObserver.setupOnce!();
      reportingObserver.setup?.(mockClient);
      const handler = mockReportingObserverConstructor.mock.calls[0][0];

      handler([
        { type: 'crash', url: 'some url 1' },
        { type: 'deprecation', url: 'some url 2' },
      ]);

      expect(mockScope.setExtra).toHaveBeenCalledWith('url', 'some url 1');
      expect(mockScope.setExtra).toHaveBeenCalledWith('url', 'some url 2');
    });

    it('should set extra including the report body if available', () => {
      const reportingObserver = reportingObserverIntegration();
      reportingObserver.setupOnce!();
      reportingObserver.setup?.(mockClient);
      const handler = mockReportingObserverConstructor.mock.calls[0][0];

      const report1 = { type: 'crash', url: 'some url 1', body: { crashId: 'id1' } } as const;
      const report2 = { type: 'deprecation', url: 'some url 2', body: { id: 'id2', message: 'message' } } as const;

      handler([report1, report2]);

      expect(mockScope.setExtra).toHaveBeenCalledWith('body', report1.body);
      expect(mockScope.setExtra).toHaveBeenCalledWith('body', report2.body);
    });

    it('should not set extra report body extra when no body is set', () => {
      const reportingObserver = reportingObserverIntegration();
      reportingObserver.setupOnce!();
      reportingObserver.setup?.(mockClient);
      const handler = mockReportingObserverConstructor.mock.calls[0][0];

      handler([{ type: 'crash', url: 'some url' }]);

      expect(mockScope.setExtra).not.toHaveBeenCalledWith('body', expect.anything());
    });

    it('should capture report details from body on crash report', () => {
      const reportingObserver = reportingObserverIntegration();
      reportingObserver.setupOnce!();
      reportingObserver.setup?.(mockClient);
      const handler = mockReportingObserverConstructor.mock.calls[0][0];

      const report = {
        type: 'crash',
        url: 'some url',
        body: { crashId: 'some id', reason: 'some reason' },
      } as const;
      handler([report]);

      expect(captureMessage).toHaveBeenCalledWith(expect.stringContaining(report.type));
      expect(captureMessage).toHaveBeenCalledWith(expect.stringContaining(report.body.crashId));
      expect(captureMessage).toHaveBeenCalledWith(expect.stringContaining(report.body.reason));
    });

    it('should capture report message from body on deprecation report', () => {
      const reportingObserver = reportingObserverIntegration();
      reportingObserver.setupOnce!();
      reportingObserver.setup?.(mockClient);
      const handler = mockReportingObserverConstructor.mock.calls[0][0];

      const report = {
        type: 'deprecation',
        url: 'some url',
        body: { id: 'some id', message: 'some message' },
      } as const;
      handler([report]);

      expect(captureMessage).toHaveBeenCalledWith(expect.stringContaining(report.type));
      expect(captureMessage).toHaveBeenCalledWith(expect.stringContaining(report.body.message));
    });

    it('should capture report message from body on intervention report', () => {
      const reportingObserver = reportingObserverIntegration();
      reportingObserver.setupOnce!();
      reportingObserver.setup?.(mockClient);
      const handler = mockReportingObserverConstructor.mock.calls[0][0];

      const report = {
        type: 'intervention',
        url: 'some url',
        body: { id: 'some id', message: 'some message' },
      } as const;
      handler([report]);

      expect(captureMessage).toHaveBeenCalledWith(expect.stringContaining(report.type));
      expect(captureMessage).toHaveBeenCalledWith(expect.stringContaining(report.body.message));
    });

    it('should use fallback message when no body is available', () => {
      const reportingObserver = reportingObserverIntegration();
      reportingObserver.setupOnce!();
      reportingObserver.setup?.(mockClient);
      const handler = mockReportingObserverConstructor.mock.calls[0][0];

      const report = {
        type: 'intervention',
        url: 'some url',
      } as const;
      handler([report]);

      expect(captureMessage).toHaveBeenCalledWith(expect.stringContaining(report.type));
      expect(captureMessage).toHaveBeenCalledWith(expect.stringContaining('No details available'));
    });

    it('should use fallback message when no body details are available for crash report', () => {
      const reportingObserver = reportingObserverIntegration();
      reportingObserver.setupOnce!();
      reportingObserver.setup?.(mockClient);
      const handler = mockReportingObserverConstructor.mock.calls[0][0];

      const report = { type: 'crash', url: 'some url', body: { crashId: '', reason: '' } } as const;
      handler([report]);

      expect(captureMessage).toHaveBeenCalledWith(expect.stringContaining(report.type));
      expect(captureMessage).toHaveBeenCalledWith(expect.stringContaining('No details available'));
    });

    it('should use fallback message when no body message is available for deprecation report', () => {
      const reportingObserver = reportingObserverIntegration();
      reportingObserver.setupOnce!();
      reportingObserver.setup?.(mockClient);
      const handler = mockReportingObserverConstructor.mock.calls[0][0];

      const report = {
        type: 'deprecation',
        url: 'some url',
        body: { id: 'some id', message: '' },
      } as const;
      handler([report]);

      expect(captureMessage).toHaveBeenCalledWith(expect.stringContaining(report.type));
      expect(captureMessage).toHaveBeenCalledWith(expect.stringContaining('No details available'));
    });

    it('should use fallback message when no body message is available for intervention report', () => {
      const reportingObserver = reportingObserverIntegration();
      reportingObserver.setupOnce!();
      reportingObserver.setup?.(mockClient);
      const handler = mockReportingObserverConstructor.mock.calls[0][0];

      const report = {
        type: 'intervention',
        url: 'some url',
        body: { id: 'some id', message: '' },
      } as const;
      handler([report]);

      expect(captureMessage).toHaveBeenCalledWith(expect.stringContaining(report.type));
      expect(captureMessage).toHaveBeenCalledWith(expect.stringContaining('No details available'));
    });
  });
});
