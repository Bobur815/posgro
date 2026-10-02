import { fetchTasnifPicture } from './tasnif-pictures';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');

/** A fake tasnif: `list` is the picture-names answer, `files` the bytes (or status) per name. */
function tasnif(list: unknown, files: Record<string, Uint8Array | number> = {}) {
  const asked: string[] = [];
  const impl = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('/picture-names')) return new Response(JSON.stringify(list), { status: 200 });
    const name = decodeURIComponent(url.split('/file/')[1] ?? '');
    asked.push(name);
    const file = files[name];
    if (typeof file === 'number') return new Response('', { status: file });
    return new Response(Buffer.from(file ?? SVG), { status: 200 });
  }) as typeof fetch;
  return { impl, asked };
}

describe('fetchTasnifPicture', () => {
  it('tries numbered names first and returns the first real picture', async () => {
    const t = tasnif(['m_ab12.jpg', 'm_2.png', 'm_1.png'], { 'm_1.png': SVG, 'm_2.png': PNG });
    const result = await fetchTasnifPicture('02202002001010009', t.impl);
    expect(t.asked).toEqual(['m_1.png', 'm_2.png']);
    expect(result).toEqual({
      status: 'found',
      candidates: [{ bytes: PNG, sourceName: 'm_2.png' }],
    });
  });

  it('without a numbered picture, returns up to four random-suffix ones to choose from', async () => {
    const names = ['m_a.jpg', 'm_b.jpg', 'm_c.jpg', 'm_d.jpg', 'm_e.jpg', 'm_f.jpg'];
    const files = Object.fromEntries(names.map((n) => [n, PNG]));
    const t = tasnif(names, { ...files, 'm_b.jpg': SVG });
    const result = await fetchTasnifPicture('02202002001010009', t.impl);
    expect(result.status === 'found' && result.candidates.map((c) => c.sourceName)).toEqual([
      'm_a.jpg',
      'm_c.jpg',
      'm_d.jpg',
      'm_e.jpg',
    ]);
    expect(t.asked).not.toContain('m_f.jpg');
  });

  it('is "none" when tasnif lists nothing or only placeholders', async () => {
    expect(await fetchTasnifPicture('02202002001010009', tasnif([]).impl)).toEqual({
      status: 'none',
    });
    expect(await fetchTasnifPicture('02202002001010009', tasnif(['m_1.png']).impl)).toEqual({
      status: 'none',
    });
  });

  it('is an error — never "none" — when tasnif or the network fails', async () => {
    expect(
      (await fetchTasnifPicture('x', tasnif(['m_1.png'], { 'm_1.png': 502 }).impl)).status,
    ).toBe('error');
    expect((await fetchTasnifPicture('x', tasnif({ success: false }).impl)).status).toBe('error');
    const offline = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    expect(await fetchTasnifPicture('x', offline)).toEqual({
      status: 'error',
      message: 'fetch failed',
    });
  });
});
