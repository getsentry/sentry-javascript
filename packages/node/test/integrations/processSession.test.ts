import { getIsolationScope, setCurrentClient } from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { processSessionIntegration } from '../../src/integrations/processSession';
import { NodeClient } from '../../src/sdk/client';
import { getDefaultNodeClientOptions } from '../helpers/getDefaultNodeClientOptions';

describe('processSessionIntegration', () => {
  let client: NodeClient;
  let sendSession: ReturnType<typeof vi.spyOn>;
  let beforeExitHandler: () => void;

  beforeEach(() => {
    getIsolationScope().setSession(undefined);

    client = new NodeClient(getDefaultNodeClientOptions({ release: '1.0.0' }));
    setCurrentClient(client);
    client.init();
    sendSession = vi.spyOn(client, 'sendSession').mockImplementation(() => undefined);

    const processOn = vi.spyOn(process, 'on').mockImplementation(((event: string, listener: () => void) => {
      if (event === 'beforeExit') {
        beforeExitHandler = listener;
      }
      return process;
    }) as never);

    processSessionIntegration().setupOnce!();
    processOn.mockRestore();
  });

  it('has a name', () => {
    expect(processSessionIntegration().name).toBe('ProcessSession');
  });

  it('starts a session on setup', () => {
    expect(getIsolationScope().getSession()).toEqual(expect.objectContaining({ status: 'ok' }));
  });

  it('ends the session with status "exited" on a healthy exit', () => {
    beforeExitHandler();

    expect(sendSession).toHaveBeenCalledTimes(1);
    expect(sendSession).toHaveBeenCalledWith(expect.objectContaining({ status: 'exited', errors: 0 }));
  });

  it('ends a session that recorded a handled error', () => {
    const session = getIsolationScope().getSession()!;
    session.errors = 1;

    beforeExitHandler();

    expect(sendSession).toHaveBeenCalledWith(expect.objectContaining({ status: 'exited', errors: 1 }));
  });

  it.each(['exited', 'crashed', 'abnormal', 'unhandled'] as const)('does not update an already-%s session', status => {
    const session = getIsolationScope().getSession()!;
    session.status = status;
    sendSession.mockClear();

    beforeExitHandler();

    expect(sendSession).not.toHaveBeenCalled();
  });

  it('does nothing when no session is on the scope', () => {
    getIsolationScope().setSession(undefined);
    sendSession.mockClear();

    beforeExitHandler();

    expect(sendSession).not.toHaveBeenCalled();
  });
});
