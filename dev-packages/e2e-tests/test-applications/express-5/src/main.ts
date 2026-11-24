import './instrument';

import { app } from './app';

const port = 3030;

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
