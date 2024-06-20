import {  addBreadcrumb, flush, setCurrentClient } from '../../../src';
import { TestClient, getDefaultTestClientOptions } from '../../mocks/client';

describe('Breadcrumbs', () => {
  it('addBreadcrumb should emit `preprocessAddBreadcrumb` event', async () => {
    const onPreprocessAddBreadcrumb = jest.fn();

    const client = new TestClient(getDefaultTestClientOptions());
    setCurrentClient(client);
    client.init();

    client.on('preprocessAddBreadcrumb', onPreprocessAddBreadcrumb);

    addBreadcrumb({ message: 'test breadcrumb' }, { data: 'test hint' });
    await flush(2000);

    expect(onPreprocessAddBreadcrumb).toHaveBeenCalledTimes(1);
    expect(onPreprocessAddBreadcrumb).toBeCalledWith({ message: 'test breadcrumb' }, { data: 'test hint' });
  });
});
