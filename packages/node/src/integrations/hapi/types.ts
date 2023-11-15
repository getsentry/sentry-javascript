// Vendored and simplified from @types/hapi__hapi and @types/boom
export interface Boom<Data = unknown> extends Error {
  isBoom: boolean;
  isServer: boolean;
  message: string;
  reformat: () => string;
  isMissing?: boolean | undefined;
  data: Data;
}

export interface RequestEvent {
  timestamp: string;
  tags: string[];
  channel: 'internal' | 'app' | 'error';
  data: object | string;
  error: object;
}

export interface Server<A = ServerApplicationState> {
  app: A;
  events: ServerEvents;
  ext(event: ServerExtType, method: LifecycleMethod, options?: unknown | undefined): void;
  initialize(): Promise<void>;
  register<T, D>(plugins: Plugin<T>, options?: unknown | undefined): Promise<this & D>;
  start(): Promise<void>;
}

export interface ResponseObject {
  statusCode: number;
  header: (key: string, value: string) => void;
}

type RequestEventHandler = (request: Request, event: RequestEvent, tags: { [key: string]: true }) => void;
type LifecycleMethod = (request: Request, h: ResponseToolkit, err?: Error | undefined) => unknown;
type Plugin<T> = PluginBase<T> & (PluginNameVersion | PluginPackage);
type ServerExtType =
  | 'onPreStart'
  | 'onPostStart'
  | 'onPreStop'
  | 'onPostStop'
  | 'onPreAuth'
  | 'onCredentials'
  | 'onPostAuth'
  | 'onPreHandler'
  | 'onPostHandler'
  | 'onPreResponse'
  | 'onPostResponse';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface ServerApplicationState {}
// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface RequestEvents {}

interface ServerEvents {
  on(criteria: 'request', listener: RequestEventHandler): this;
}

interface PluginBase<T> {
  register: (server: Server, options: T) => void | Promise<void>;
}

interface PluginPackage {
  pkg: PluginNameVersion;
}

interface ResponseToolkit {
  readonly continue: symbol;
}

interface PluginNameVersion {
  name: string;
  version?: string | undefined;
}

interface Request {
  events: RequestEvents;
  response: ResponseObject | Boom;
  headers: Record<string, string>;
  path: string;
  route: {
    path: string;
  };
}
