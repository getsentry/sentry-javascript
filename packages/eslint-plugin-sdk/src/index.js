/**
 * @fileoverview eslint plugins for Sentry SDKs
 * @author Abhijeet Prasad
 */
'use strict';

//------------------------------------------------------------------------------
// Plugin Definition
//------------------------------------------------------------------------------

module.exports = {
  rules: {
    'no-async-await': require('./rules/no-async-await'),
    'no-eq-empty': require('./rules/no-eq-empty'),
  },
};
