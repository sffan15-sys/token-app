/**
 * Local fallback declaration so this repository can typecheck before the
 * newly-added package has been downloaded. The package ships its own richer
 * declarations and those take precedence once dependencies are installed.
 */
declare module "@neondatabase/serverless" {
  export function neon(connectionString: string): {
    <T = Record<string, unknown>>(
      strings: TemplateStringsArray,
      ...params: unknown[]
    ): Promise<T[]>;
  };
}
