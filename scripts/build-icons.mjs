import sharp from 'sharp';
import toIco from 'to-ico';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const iconsDir = join(root, 'build', 'icons');
mkdirSync(iconsDir, { recursive: true });

const svg = readFileSync(join(iconsDir, 'posgro-icon.svg'));

// ICO needs multiple sizes
const icoSizes = [16, 32, 48, 64, 128, 256];

console.log('Rendering PNG sizes for ICO...');
const pngBuffers = await Promise.all(
  icoSizes.map(size =>
    sharp(svg, { density: Math.ceil(size * 96 / 256) })
      .resize(size, size)
      .png()
      .toBuffer()
  )
);

console.log('Building ICO...');
const ico = await toIco(pngBuffers);
writeFileSync(join(iconsDir, 'posgro-icon.ico'), ico);
console.log('✓ build/icons/posgro-icon.ico');

// Also save a 1024px PNG for future use
await sharp(svg, { density: 384 })
  .resize(1024, 1024)
  .png()
  .toFile(join(iconsDir, 'posgro-icon-1024.png'));
console.log('✓ build/icons/posgro-icon-1024.png');
