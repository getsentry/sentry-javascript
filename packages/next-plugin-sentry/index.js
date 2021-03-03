const { serverConfig, clientConfig } = require('./config.js');

const Sentry = require('@sentry/nextjs');
Sentry.showReportDialog = (...args) => {
  Sentry._callOnClient('showReportDialog', ...args);
};

exports.Sentry = Sentry;
exports.serverConfig = serverConfig;
exports.clientConfig = clientConfig;
