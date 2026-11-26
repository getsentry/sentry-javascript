import './instrument';

import { server } from './app';

server.start().then(() => {
  console.log('Server running on %s', server.info.uri);
});
