// Global type aliases
type NextFunction = (err?: any) => void;

// Global function/type used by controllers without import
declare function Router(): any;
interface Router {
  get(path: string, handler: any): void;
  post(path: string, handler: any): void;
  put(path: string, handler: any): void;
  delete(path: string, handler: any): void;
  patch(path: string, handler: any): void;
  use(...handlers: any[]): void;
}

// Global Express Request/Response augmentation.
// These DO NOT conflict with Web API Fetch Request/Response except for:
//   - json() is overloaded to accept 0 args (Fetch) or 1 arg (Express)
//   - status is declared as a method (Express) — code uses response.status as a
//     number in only one place (tts.service.ts:78) which gets a cast.
interface Request {
  method: string;
  query: any;
  body: any;
  params: any;
  ip: string;
  path: string;
  originalUrl: string;
  secure: boolean;
  protocol: string;
  hostname: string;
  get(name: string): string | undefined;
  header(name: string): string | undefined;
  connection: any;
  user?: any;
  requestId?: string;
}

interface Response {
  statusCode: number;
  status(code: number): Response;
  json(data?: any): Response | Promise<any>;
  set(field: string | any, value?: string): void;
  setHeader(name: string, value: string): void;
  send(body?: any): void;
  end(): void;
  on(event: string, listener: (...args: any[]) => void): this;
}

// Global declarations for modules used without imports
declare function express(): express.Application;
declare function cors(options?: any): any;
declare function compression(options?: any): any;
declare function morgan(format: string, options?: any): any;
declare namespace express {
  interface Request {
    method: string;
    headers: any;
    query: any;
    body: any;
    params: any;
    ip: string;
    path: string;
    originalUrl: string;
    secure: boolean;
    protocol: string;
    hostname: string;
    get(name: string): string | undefined;
    header(name: string): string | undefined;
    connection: any;
    user?: any;
    requestId?: string;
  }
  interface Response {
    statusCode: number;
    status(code: number): Response;
    json(data: any): Response;
    set(field: string | any, value?: string): void;
    setHeader(name: string, value: string): void;
    send(body?: any): void;
    end(): void;
    on(event: string, listener: (...args: any[]) => void): this;
  }
  interface Router {
    get(path: string, ...handlers: any[]): void;
    post(path: string, ...handlers: any[]): void;
    put(path: string, ...handlers: any[]): void;
    delete(path: string, ...handlers: any[]): void;
    patch(path: string, ...handlers: any[]): void;
    use(...handlers: any[]): void;
  }
  interface Application {
    use(...handlers: any[]): void;
    set(setting: string, value: any): void;
    get(path: string, ...handlers: any[]): void;
    listen(port: number, host?: string, callback?: () => void): any;
  }
  type NextFunction = (err?: any) => void;
  function json(options?: any): any;
  function urlencoded(options?: any): any;
  function static(root: string, options?: any): any;
  function Router(): Router;
}

// Module declarations for import-based usage
declare module 'express' {
  export = express;
}

declare module 'cors' {
  export = cors;
}

declare module 'compression' {
  export = compression;
}

declare module 'morgan' {
  export = morgan;
}

declare module 'pg' {
  class Pool {
    constructor(config?: any);
    query(text: string, params?: any[]): Promise<any>;
    connect(): Promise<any>;
    end(): Promise<void>;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: string, listener: (...args: any[]) => void): this;
  }
  export { Pool };
}

declare module 'jsonwebtoken' {
  function sign(payload: any, secret: string): string;
  function verify(token: string, secret: string): any;
}
