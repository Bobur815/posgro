import {
  categoryNameKey,
  isGenericMxik,
  pickUpright,
  preferredPictureOrder,
  sniffImageMime,
  wantsMxikPicture,
} from './image-bytes';

const bytes = (...b: number[]) => Uint8Array.from(b);
const ascii = (s: string) => Uint8Array.from(Buffer.from(s, 'latin1'));

describe('sniffImageMime', () => {
  it('recognises JPEG, PNG and WebP by their leading bytes', () => {
    expect(sniffImageMime(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(sniffImageMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe(
      'image/png',
    );
    expect(sniffImageMime(ascii('RIFF\x00\x00\x00\x00WEBPVP8 '))).toBe('image/webp');
  });

  it("rejects tasnif's SVG placeholder, HTML/JSON error bodies and truncated files", () => {
    expect(sniffImageMime(ascii('<?xml version="1.0"?><svg'))).toBeNull();
    expect(sniffImageMime(ascii('<svg xmlns='))).toBeNull();
    expect(sniffImageMime(ascii('{"success":false}'))).toBeNull();
    expect(sniffImageMime(bytes(0xff, 0xd8))).toBeNull();
    expect(sniffImageMime(ascii('RIFF\x00\x00\x00\x00WAVE'))).toBeNull();
    expect(sniffImageMime(bytes())).toBeNull();
  });
});

describe('MXIK picture eligibility', () => {
  it('skips generic sub-position codes and anything that is not 17 digits', () => {
    expect(isGenericMxik('01905007001000000')).toBe(true);
    expect(wantsMxikPicture('01905007001000000')).toBe(false);
    expect(wantsMxikPicture('02202002001010009')).toBe(true);
    expect(wantsMxikPicture('0220200200101000')).toBe(false);
    expect(wantsMxikPicture('0220200200101000x')).toBe(false);
    expect(wantsMxikPicture(null)).toBe(false);
    expect(wantsMxikPicture(undefined)).toBe(false);
  });
});

describe('picture choice', () => {
  it('orders numbered names first, by number', () => {
    expect(preferredPictureOrder(['m_ab.jpg', 'm_10.png', 'm_2.png', 'm_cd.jpg'])).toEqual([
      'm_2.png',
      'm_10.png',
      'm_ab.jpg',
      'm_cd.jpg',
    ]);
  });

  it('picks the tallest picture: an upright bottle over a cap from above or a flat print', () => {
    const cap = { name: 'cap', width: 256, height: 256 };
    const print = { name: 'print', width: 256, height: 140 };
    const bottle = { name: 'bottle', width: 90, height: 256 };
    expect(pickUpright([cap, print, bottle])?.name).toBe('bottle');
    expect(pickUpright([cap, { name: 'cap2', width: 256, height: 256 }])?.name).toBe('cap');
    expect(pickUpright([{ name: 'broken', width: 0, height: 0 }])).toBeUndefined();
    expect(pickUpright([])).toBeUndefined();
  });
});

describe('categoryNameKey', () => {
  it('folds case, spacing and Uzbek apostrophe variants', () => {
    expect(categoryNameKey('  Uy-ro‘zg‘or ')).toBe("uy-ro'zg'or");
    expect(categoryNameKey("Uy-ro'zg'or")).toBe("uy-ro'zg'or");
    expect(categoryNameKey('Uy-roʻzgʻor')).toBe("uy-ro'zg'or");
    expect(categoryNameKey('Kiyim-kechak ')).toBe('kiyim-kechak');
    expect(categoryNameKey('Ун ва  ун маҳсулотлари ')).toBe('ун ва ун маҳсулотлари');
  });
});
