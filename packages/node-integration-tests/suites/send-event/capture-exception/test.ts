import { getEventRequest, runServer, updateForSnapshot } from '../../../utils';

test('should send captureException', async () => {
  const url = await runServer(__dirname);
  const requestBody = await getEventRequest(url);

  expect(updateForSnapshot(requestBody)).toMatchSnapshot();
});
