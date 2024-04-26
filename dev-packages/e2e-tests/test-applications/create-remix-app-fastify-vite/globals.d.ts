interface Window {
  recordedTransactions?: string[];
  capturedExceptionId?: string;
  ENV: {
    SENTRY_DSN: string;
  };
}
