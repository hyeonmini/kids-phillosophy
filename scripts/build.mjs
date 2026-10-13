import { cp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

export function renderDocument(markdown, filename) {
  const title = markdown.match(/^#\s+(.+)$/m)?.[1].trim() ?? filename.replace(/\.md$/i, '');
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)} · 물음표 클럽</title>
    <style>
      :root { color-scheme: light; }
      body { margin: 0; background: #f7f8f3; color: #263d33; font-family: system-ui, -apple-system, "Noto Sans KR", sans-serif; }
      main { max-width: 58rem; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
      nav { display: flex; flex-wrap: wrap; gap: 1.5rem; margin-bottom: 2.5rem; }
      a { color: #285c49; text-underline-offset: .2em; }
      a:focus-visible { outline: 3px solid #285c49; outline-offset: 4px; }
      h1 { font-size: clamp(1.6rem, 4vw, 2.4rem); line-height: 1.4; overflow-wrap: anywhere; }
      .document-body { padding: 1.5rem; background: #fff; border: 1px solid #dce4dc; border-radius: 1rem; font: inherit; line-height: 1.85; white-space: pre-wrap; overflow-wrap: anywhere; }
      @media (max-width: 480px) { .document-body { padding: 1rem; } }
    </style>
  </head>
  <body>
    <main>
      <nav aria-label="문서 이동">
        <a href="../">← 물음표 클럽 메인으로</a>
        <a href="./${escapeHtml(encodeURIComponent(filename))}" download>원래 Markdown 내려받기</a>
      </nav>
      <h1>${escapeHtml(title)}</h1>
      <pre class="document-body">${escapeHtml(markdown)}</pre>
    </main>
  </body>
</html>
`;
}

function rewriteDocumentLinks(source) {
  return source.replace(/(["'])(\.\/docs\/[^"'?#]+)\.md((?:[?#][^"']*)?)\1/g,
    (_match, quote, path, suffix) => `${quote}${path}.html${suffix}${quote}`);
}

export function withHtmlDocumentMeta(html) {
  if (/<meta\b[^>]*\bname\s*=\s*["']question-club-docs-format["'][^>]*>/i.test(html)) {
    return html;
  }
  const marker = '<meta name="question-club-docs-format" content="html">';
  if (/<\/head\s*>/i.test(html)) {
    return html.replace(/<\/head\s*>/i, `  ${marker}\n  </head>`);
  }
  const head = `<head>\n  ${marker}\n</head>`;
  if (/<html\b[^>]*>/i.test(html)) {
    return html.replace(/<html\b[^>]*>/i, (tag) => `${tag}\n${head}`);
  }
  return `${head}\n${html}`;
}

export async function buildProject({ projectRoot = projectDir } = {}) {
  const sourceDir = resolve(projectRoot, 'public');
  const outputDir = resolve(projectRoot, 'dist');
  const docsDir = resolve(projectRoot, 'docs');

  if (!(await stat(sourceDir)).isDirectory()) {
    throw new Error('public/ must be a directory.');
  }

  await rm(outputDir, { recursive: true, force: true });
  await cp(sourceDir, outputDir, { recursive: true });

  let docsStat;
  try {
    docsStat = await stat(docsDir);
  } catch (error) {
    if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error;
  }

  let documentCount = 0;
  if (docsStat?.isDirectory()) {
    const outputDocsDir = resolve(outputDir, 'docs');
    await cp(docsDir, outputDocsDir, { recursive: true });
    for (const entry of await readdir(docsDir, { withFileTypes: true })) {
      if (!entry.isFile() || !/\.md$/i.test(entry.name)) continue;
      const markdown = await readFile(resolve(docsDir, entry.name), 'utf8');
      await writeFile(resolve(outputDocsDir, entry.name.replace(/\.md$/i, '.html')),
        renderDocument(markdown, entry.name), 'utf8');
      documentCount += 1;
    }
  }

  for (const filename of ['index.html', 'app.js']) {
    const filePath = resolve(outputDir, filename);
    let source;
    try {
      source = await readFile(filePath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    const rewritten = rewriteDocumentLinks(source);
    await writeFile(filePath, filename === 'index.html' ? withHtmlDocumentMeta(rewritten) : rewritten, 'utf8');
  }
  await writeFile(resolve(outputDir, '.nojekyll'), '');
  return { outputDir, documentCount };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { documentCount } = await buildProject();
  console.log(`Built dist/ with ${documentCount} HTML document readers.`);
}
