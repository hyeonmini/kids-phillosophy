import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildProject, withHtmlDocumentMeta } from './build.mjs';

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function preparePagesBranch({ projectRoot = projectDir } = {}) {
  const result = await buildProject({ projectRoot });
  const source = await readFile(resolve(projectRoot, 'public/index.html'), 'utf8');
  const rootEntry = withHtmlDocumentMeta(source
    .replace(/(\s(?:href|src)\s*=\s*)(["'])(\.\/(?:assets\/[^"']+|style\.css|app\.js))\2/gi,
      (_match, attribute, quote, path) => `${attribute}${quote}./public/${path.slice(2)}${quote}`)
    .replace(/(\shref\s*=\s*)(["'])(\.\/docs\/[^"'?#]+)\.md((?:[?#][^"']*)?)\2/gi,
      (_match, attribute, quote, path, suffix) => `${attribute}${quote}${path}.html${suffix}${quote}`));
  const entryFile = resolve(projectRoot, 'index.html');
  await writeFile(entryFile, rootEntry, 'utf8');

  const outputDocsDir = resolve(result.outputDir, 'docs');
  let documents = [];
  try {
    documents = (await readdir(outputDocsDir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && /\.html$/i.test(entry.name));
  } catch (error) {
    if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error;
  }
  if (documents.length > 0) {
    const rootDocsDir = resolve(projectRoot, 'docs');
    await mkdir(rootDocsDir, { recursive: true });
    for (const entry of documents) {
      await copyFile(resolve(outputDocsDir, entry.name), resolve(rootDocsDir, entry.name));
    }
  }
  await writeFile(resolve(projectRoot, '.nojekyll'), '');
  return { ...result, entryFile };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { documentCount } = await preparePagesBranch();
  console.log(`Prepared repository root for Pages with ${documentCount} HTML document readers.`);
}
