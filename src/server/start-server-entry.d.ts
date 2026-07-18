/**
 * TanStack Start の Workers 用エントリ（型定義が同梱されないため最小宣言）。
 * default export は { fetch } を持つ（wrangler の main に指定できる形）。
 */
declare module '@tanstack/react-start/server-entry' {
  const handler: {
    fetch(request: Request, env: unknown, ctx: unknown): Promise<Response>;
  };
  export default handler;
}
