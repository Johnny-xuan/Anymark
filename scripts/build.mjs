import { mkdir, copyFile, cp, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export async function buildExtension(target = resolve(root, 'dist/extension')) {
  await rm(target, { recursive: true, force: true });
  await mkdir(resolve(target, 'extension'), { recursive: true });
  await copyFile(resolve(root, 'extension/manifest.json'), resolve(target, 'manifest.json'));
  for (const name of ['popup.html', 'popup.css']) {
    await copyFile(resolve(root, 'extension', name), resolve(target, 'extension', name));
  }
  await cp(resolve(root, 'extension/icons'), resolve(target, 'extension/icons'), { recursive: true });
  await mkdir(resolve(target, 'web'), { recursive: true });
  for (const name of ['index.html', 'styles.css', 'transfer.css', 'graph.css', 'settings.css']) {
    await copyFile(resolve(root, 'web', name), resolve(target, 'web', name));
  }
  return build({
    entryPoints: ['extension/background.js', 'extension/popup.js', 'web/app.js'].map(path => resolve(root, path)),
    outbase: root, outdir: target,
    bundle: true, splitting: true, format: 'esm', platform: 'browser', target: 'chrome134',
    metafile: true,
    chunkNames: 'chunks/[name]-[hash]', legalComments: 'eof',
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildExtension();
  console.log(`Unpacked extension: ${resolve(root, 'dist/extension')}`);
}
