import { startSession } from '..';
import { getIsolationScope } from '../currentScopes';
import { defineIntegration } from '../integration';

export const serverRequestSessionIntegration = defineIntegration(() => {
  return {
    name: 'ServerRequestSession',
    setup(client) {
      client.on('preprocessEvent', event => {
        const isException =
          event.type === undefined && event.exception && event.exception.values && event.exception.values.length > 0;

        // If the event is of type Exception, then a request session should be captured
        if (isException) {
          const requestSession = getIsolationScope().getRequestSession();

          // Ensure that this is happening within the bounds of a request, and make sure not to override
          // Session Status if Errored / Crashed
          if (requestSession && requestSession.status === 'ok') {
            requestSession.status = 'errored';
          }
        }
      });

      // TODO(v9): Remove this start session call
      startSession();
    },
  };
});
