// Ambient Deno type definitions for the IDE language server
declare namespace Deno {
  export interface ServeOptions {
    port?: number;
    hostname?: string;
    signal?: AbortSignal;
    onListen?: (params: { hostname: string; port: number }) => void;
    onError?: (error: unknown) => Response | Promise<Response>;
  }

  export function serve(
    handler: (request: Request) => Response | Promise<Response>
  ): void;
  export function serve(
    options: ServeOptions,
    handler: (request: Request) => Response | Promise<Response>
  ): void;

  export const env: {
    get(key: string): string | undefined;
    set(key: string, value: string): void;
    has(key: string): boolean;
    delete(key: string): void;
    toObject(): Record<string, string>;
  };
}
