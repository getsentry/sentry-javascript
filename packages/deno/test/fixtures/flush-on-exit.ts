import { init, logger, metrics } from '../../build/esm/index.js';

init({
  dsn: Deno.args[0],
  defaultIntegrations: [],
  enableOpenTelemetrySetup: false,
  sendClientReports: false,
  // Exercise exit flushing independently of the periodic flush.
  _flushInterval: 0,
});

metrics.count('orders.completed', 3);
logger.info('Orders processed');
