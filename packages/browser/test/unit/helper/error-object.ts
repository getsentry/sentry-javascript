// Convert an Error-like object into something TS recognizes as an `Error`, getting around read-only properties
export function makeMockError(obj: { [key: string]: any; message: string; name: string; stack?: string }): Error {
  const anyObj = obj as any;
  anyObj.constructor = { name: obj.name };
  return anyObj as Error;
}
