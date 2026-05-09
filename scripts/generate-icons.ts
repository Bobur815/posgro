// Run after installing sharp: npm install --save-dev sharp @types/sharp
// Usage: npm run generate-icons  (requires build/icons/posgro-icon-1024.png first)
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';

const sizes = [16, 32, 48, 64, 128, 256];
async function generateIcons() {
  const buildDir = path.join(__dirname, '../build/icons');
  const sourcePath = path.join(buildDir, 'posgro-icon-1024.png');

  await fs.mkdir(buildDir, { recursive: true });

  console.log('Generating POSGRO icons...\n');

  for (const size of sizes) {
    const outputPath = path.join(buildDir, `${size}x${size}.png`);

    await sharp(sourcePath)
      .resize(size, size, {
        kernel: sharp.kernel.lanczos3,
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png({ quality: 100 })
      .toFile(outputPath);

    console.log(`Generated ${size}x${size}.png`);
  }

  console.log('\nAll POSGRO icons generated.');
  console.log('Next: convert posgro-icon-1024.png to .ico using electron-icon-maker or png-to-ico');
}

generateIcons().catch(console.error);
