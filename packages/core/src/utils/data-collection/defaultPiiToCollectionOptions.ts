// oxlint-disable-next-line typescript/no-explicit-any -> will be replaced with the new dataCollection type
export function defaultPiiToCollectionOptions(sendDefaultPii?: boolean): any {
  return sendDefaultPii === true
    ? {
        userInfo: true,
        cookies: true,
        httpHeaders: { request: true, response: true },
        httpBodies: ['incomingRequest', 'outgoingRequest', 'incomingResponse', 'outgoingResponse'],
        queryParams: true,
        genAI: { inputs: true, outputs: true },
        stackFrameVariables: true,
        frameContextLines: 5,
      }
    : {
        userInfo: false,
        cookies: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
        httpHeaders: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
        httpBodies: [],
        queryParams: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
        genAI: { inputs: false, outputs: false },
        stackFrameVariables: true,
        frameContextLines: 5,
      };
}
