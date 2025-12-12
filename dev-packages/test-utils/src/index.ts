export {
  startProxyServer,
  startEventProxyServer,
  waitForEnvelopeItem,
  waitForError,
  waitForRequest,
  waitForTransaction,
  waitForSession,
  waitForPlainRequest,
} from './event-proxy-server';

export { getPlaywrightConfig } from './playwright-config';
export { createBasicSentryServer } from './server';

// Spotlight helpers - experimental, not yet ready for production use
// The architecture needs work: tests must call startSpotlight() directly
// in the same process to populate the event buffer
export {
  startSpotlight,
  getSpotlightDsn,
  waitForEnvelopeItem as waitForSpotlightEnvelopeItem,
  waitForError as waitForSpotlightError,
  waitForSession as waitForSpotlightSession,
  waitForTransaction as waitForSpotlightTransaction,
  clearEventBuffer as clearSpotlightEventBuffer,
  getCurrentSpotlightInstance,
} from './spotlight';
