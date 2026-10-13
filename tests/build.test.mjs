import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { buildProject, renderDocument } from '../scripts/build.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const deploymentBase = new URL('https://example.github.io/kids-phillosophy/');

function localReferences(source) {
  return [...source.matchAll(/(?:href|src)=["']([^"']+)["']/g)]
    .map((match) => match[1])
    .filter((path) => !path.includes('${') && !path.startsWith('#') && !/^[a-z][a-z\d+.-]*:/i.test(path));
}

test('project build produces complete documents and paths under the Pages repository base', async (t) => {
  const originals = Object.fromEntries(await Promise.all(['index.html', 'app.js'].map(async (filename) => [
    filename, await readFile(resolve(projectRoot, 'public', filename), 'utf8'),
  ])));
  const documents = (await readdir(resolve(projectRoot, 'docs'))).filter((filename) => filename.endsWith('.md'));
  const documentSources = Object.fromEntries(await Promise.all(documents.map(async (filename) => [
    filename, await readFile(resolve(projectRoot, 'docs', filename), 'utf8'),
  ])));
  const { outputDir, documentCount } = await buildProject();
  assert.equal(documentCount, documents.length);

  await t.test('all web asset and document links resolve inside /kids-phillosophy/', async () => {
    for (const filename of ['index.html', 'app.js']) {
      const source = await readFile(resolve(outputDir, filename), 'utf8');
      const references = localReferences(source);
      if (filename === 'index.html') assert.ok(references.length > 0, filename);
      for (const path of references) {
        assert.ok(path.startsWith('./'), `${filename}: ${path}`);
        const resolved = new URL(path, deploymentBase);
        assert.ok(resolved.pathname.startsWith(deploymentBase.pathname), `${filename}: ${path}`);
        const outputPath = decodeURIComponent(resolved.pathname.slice(deploymentBase.pathname.length));
        await access(resolve(outputDir, outputPath));
      }
      assert.doesNotMatch(source, /["']\.\/docs\/[^"']+\.md["']/);
    }
    const moduleSource = await readFile(resolve(outputDir, 'app.js'), 'utf8');
    for (const match of moduleSource.matchAll(/^import\s+.+\s+from\s+["']([^"']+)["']/gm)) {
      assert.ok(match[1].startsWith('./'));
      await access(resolve(outputDir, match[1]));
    }
    for (const match of moduleSource.matchAll(/new URL\(['"]([^'"]+)['"],\s*import\.meta\.url\)/g)) {
      const resource = new URL(match[1], new URL('app.js', deploymentBase));
      assert.ok(resource.pathname.startsWith(deploymentBase.pathname));
      await access(resolve(outputDir, decodeURIComponent(resource.pathname.slice(deploymentBase.pathname.length))));
    }
    const index = await readFile(resolve(outputDir, 'index.html'), 'utf8');
    assert.equal((index.match(/name="question-club-docs-format" content="html"/g) ?? []).length, 1);
  });

  await t.test('HTML readers preserve UTF-8 Markdown and expose relative reader navigation', async () => {
    for (const filename of documents) {
      const original = documentSources[filename];
      const raw = await readFile(resolve(outputDir, 'docs', filename), 'utf8');
      const reader = await readFile(resolve(outputDir, 'docs', filename.replace(/\.md$/, '.html')), 'utf8');
      assert.equal(raw, original);
      assert.equal(reader, renderDocument(original, filename));
      assert.match(reader, /^<!doctype html>/);
      assert.match(reader, /<meta charset="utf-8">/);
      assert.match(reader, /<html lang="ko">/);
      assert.match(reader, /<title>[^<]+ · 물음표 클럽<\/title>/);
      assert.match(reader, /<h1>[^<]+<\/h1>/);
      assert.ok(reader.includes(`<a href="./${encodeURIComponent(filename)}" download>`));
      assert.ok(reader.includes('<a href="../">'));
      const readerBase = new URL(`docs/${filename.replace(/\.md$/, '.html')}`, deploymentBase);
      assert.equal(new URL('../', readerBase).href, deploymentBase.href);
    }
  });

  await t.test('build leaves source links and source Markdown unchanged', async () => {
    for (const [filename, original] of Object.entries(originals)) {
      assert.equal(await readFile(resolve(projectRoot, 'public', filename), 'utf8'), original);
    }
    assert.match(originals['index.html'], /href="\.\/docs\/[^"']+\.md"/);
    for (const [filename, original] of Object.entries(documentSources)) {
      assert.equal(await readFile(resolve(projectRoot, 'docs', filename), 'utf8'), original);
    }
    assert.equal(await readFile(resolve(outputDir, '.nojekyll'), 'utf8'), '');
  });
});

test('document readers escape HTML in titles, bodies and download attributes', () => {
  const markdown = '# <script>alert("title")</script> & 질문\n\n<img src=x onerror="alert(1)"> \'quoted\'';
  const reader = renderDocument(markdown, 'a\"<b>.md');
  assert.doesNotMatch(reader, /<script>|<img\s|onerror="/);
  assert.ok(reader.includes('&lt;script&gt;alert(&quot;title&quot;)&lt;/script&gt; &amp; 질문'));
  assert.ok(reader.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &#39;quoted&#39;'));
  assert.ok(reader.includes('href="./a%22%3Cb%3E.md" download'));
});

test('document build remains optional and rebuild removes stale document output', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'kids-build-test-'));
  try {
    await mkdir(join(fixture, 'public'));
    await writeFile(join(fixture, 'public', 'index.html'), '<html lang="ko">웹</html>');
    const first = await buildProject({ projectRoot: fixture });
    assert.equal(first.documentCount, 0);
    await access(join(first.outputDir, '.nojekyll'));
    await mkdir(join(fixture, 'docs'));
    await writeFile(join(fixture, 'docs', 'episode.md'), '# 임시 문서\n본문');
    const second = await buildProject({ projectRoot: fixture });
    assert.equal(second.documentCount, 1);
    await access(join(second.outputDir, 'docs', 'episode.html'));
    await rm(join(fixture, 'docs'), { recursive: true });
    const third = await buildProject({ projectRoot: fixture });
    await assert.rejects(access(join(third.outputDir, 'docs')), { code: 'ENOENT' });
    assert.equal(third.documentCount, 0);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
