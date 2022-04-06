const startTransaction = jest.fn(() => ({
  traceId: 'trace_id',
  spanId: 'span_id',
  finish: jest.fn(() => 'transaction_id'),
}));
const getCurrentHub = jest.fn(() => ({
  startTransaction,
}));
export { getCurrentHub };
