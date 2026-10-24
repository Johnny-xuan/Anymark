import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { BRAND_SVG } from '../extension/icons.js';

const target = resolve(dirname(fileURLToPath(import.meta.url)), '../extension/icons');
const browser = await chromium.launch({ executablePath: process.env.ANYMARK_CHROME || chromium.executablePath(), headless: true });
try {
  const page = await browser.newPage();
  const images = await page.evaluate(async svg => {
    const image = new Image();
    image.src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    await image.decode();
    return [16, 32, 48, 128].map(size => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      canvas.getContext('2d').drawImage(image, 0, 0, size, size);
      return { size, png: canvas.toDataURL('image/png').split(',')[1] };
    });
  }, BRAND_SVG);
  await mkdir(target, { recursive: true });
  for (const { size, png } of images) await writeFile(resolve(target, `${size}.png`), Buffer.from(png, 'base64'));
  console.log(`Toolbar icons: ${target}`);
} finally { await browser.close(); }
