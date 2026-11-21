import type { AnyRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchDisclosure, fetchShell } from '../src/server/functions';
import { safeRedirect } from '../src/web/nav';

// ルート定義そのもの（ガード・分岐）を検証する。サーバー関数と重い表示部品は差し替える。
vi.mock('../src/server/functions', () => ({
  fetchShell: vi.fn(),
  fetchDisclosure: vi.fn(),
}));
vi.mock('../src/web/analytics', () => ({ identify: vi.fn(), track: vi.fn() }));
vi.mock('../src/web/NotFoundCard', () => ({ NotFoundCard: () => 'NOT_FOUND' }));
vi.mock('../src/web/MessageDisclosure', () => ({
  MessageDisclosure: (p: { fromName: string; messages: unknown[] }) =>
    `DISCLOSED:${p.fromName}:${p.messages.length}`,
}));

const { Route: AppRoute } = await import('../src/routes/_app');
const { Route: DisclosureRoute } = await import(
  '../src/routes/disclosure.$connectionId'
);

/** beforeLoad が投げた redirect の行き先を取り出す（投げなければ null）。 */
async function guard(route: AnyRoute, pathname: string) {
  try {
    // biome-ignore lint/suspicious/noExplicitAny: ルートの beforeLoad を直接呼ぶ
    await (route.options.beforeLoad as any)({ location: { pathname } });
    return null;
  } catch (e) {
    return (e as { options: Record<string, unknown> }).options;
  }
}

beforeEach(() => vi.clearAllMocks());

describe('_app 認可ガード', () => {
  it('未ログインは /login へ、元の場所を redirect に載せる', async () => {
    vi.mocked(fetchShell).mockResolvedValue({ status: 'signed_out' });
    expect(await guard(AppRoute, '/death/u1')).toMatchObject({
      to: '/login',
      search: { redirect: '/death/u1' },
    });
  });

  it('未設定はランディング / へ', async () => {
    vi.mocked(fetchShell).mockResolvedValue({
      status: 'unconfigured',
      message: 'x',
    });
    expect(await guard(AppRoute, '/me')).toMatchObject({ to: '/' });
  });

  it('ログイン済みは通し、user をコンテキストに渡す', async () => {
    const user = { id: 'u1', name: 'A', image: null };
    vi.mocked(fetchShell).mockResolvedValue({ status: 'ok', user });
    // biome-ignore lint/suspicious/noExplicitAny: 同上
    const ctx = await (AppRoute.options.beforeLoad as any)({
      location: { pathname: '/me' },
    });
    expect(ctx).toEqual({ user });
  });
});

describe('ログインの戻り先検証（オープンリダイレクト防止）', () => {
  it.each(['/me', '/death/u1', '/watch?x=1'])('許可: %s', (v) => {
    expect(safeRedirect(v)).toBe(v);
  });
  it.each([
    '//evil.com',
    '/\\evil.com',
    'https://evil.com',
    'evil.com',
    '/',
    '',
    undefined,
    ['/me'],
  ])('拒否: %j', (v) => {
    expect(safeRedirect(v)).toBeUndefined();
  });
});

describe('開示ページの分岐', () => {
  function render(data: unknown) {
    vi.spyOn(DisclosureRoute, 'useLoaderData').mockReturnValue(data as never);
    const Page = DisclosureRoute.options.component as () => ReactElement;
    return renderToString(<Page />);
  }

  it('loader は URL の connectionId をそのままサーバーへ渡す', async () => {
    vi.mocked(fetchDisclosure).mockResolvedValue({ status: 'unavailable' });
    // biome-ignore lint/suspicious/noExplicitAny: loader を直接呼ぶ
    await (DisclosureRoute.options.loader as any)({
      params: { connectionId: 'c1' },
    });
    expect(fetchDisclosure).toHaveBeenCalledWith({
      data: { connectionId: 'c1' },
    });
  });

  it('ok のときだけ伝言を出す', () => {
    const html = render({
      status: 'ok',
      fromName: 'A',
      hint: 'h',
      messages: [{}, {}],
    });
    expect(html).toContain('DISCLOSED:A:2');
  });

  it.each([
    { status: 'unavailable' },
    { status: 'unconfigured', message: 'x' },
  ])('$status は中立の404と同じ表示で、伝言を出さない', (data) => {
    const html = render(data);
    expect(html).toContain('NOT_FOUND');
    expect(html).not.toContain('DISCLOSED');
  });
});
