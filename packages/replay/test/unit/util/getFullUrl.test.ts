import { getFullURL } from '../../../src/util/getFullUrl';

jest.mock('../../../src/constants', () => {
  return {
    WINDOW: {
      location: {
        origin: 'https://myDomain.com',
        pathname: '/users/123',
        hash: '#edit',
        search: '?mode=admin',
      },
    },
  };
});

describe('Unit | util | getFullURL', () => {
  it('returns the concatenated full URL form `window.location`', () => {
    expect(getFullURL()).toBe('https://myDomain.com/users/123#edit?mode=admin');
  });
});
