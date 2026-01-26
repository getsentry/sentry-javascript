/**
 * @fileoverview eslint plugins for Sentry SDKs
 * @author Abhijeet Prasad
 */
'use strict';

// ------------------------------------------------------------------------------
// Plugin Definition
// ------------------------------------------------------------------------------

module.exports = {
  rules: {
    'no-eq-empty': require('./rules/no-eq-empty'),
    'no-class-field-initializers': require('./rules/no-class-field-initializers'),
    'no-regexp-constructor': require('./rules/no-regexp-constructor'),
    'no-focused-tests': require('./rules/no-focused-tests'),
    'no-skipped-tests': require('./rules/no-skipped-tests'),
    'no-unsafe-random-apis': require('./rules/no-unsafe-random-apis'),
  },
};
