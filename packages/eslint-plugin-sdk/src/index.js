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
    'no-optional-chaining': require('./rules/no-optional-chaining'),
    'no-nullish-coalescing': require('./rules/no-nullish-coalescing'),
    'no-eq-empty': require('./rules/no-eq-empty'),
    'no-class-field-initializers': require('./rules/no-class-field-initializers'),
    'no-regexp-constructor': require('./rules/no-regexp-constructor'),
  },
};
