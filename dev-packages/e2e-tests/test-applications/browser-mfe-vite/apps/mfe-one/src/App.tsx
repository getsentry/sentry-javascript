import React, { useEffect } from 'react';
import * as Sentry from '@sentry/browser';

function MfeOne() {
  useEffect(() => {
    Sentry.withScope(scope => {
      scope.setTag('mfe.name', 'mfe-one');
      fetch('http://localhost:6969/api/mfe-one-data');
    });
  }, []);

  return <div id="mfe-one">MFE One</div>;
}

export default MfeOne;
