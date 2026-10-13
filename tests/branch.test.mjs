import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { preparePagesBranch } from '../scripts/prepare-pages-branch.mjs';

test('branch preparation generates a root entry and documents without changing sources', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'kids-pages-branch-'));
  try {
    await mkdir(join(fixture, 'public/assets'), { recursive: true });
    await mkdir(join(fixture, 'docs'));
    const sources = {
      'public/index.html': `<!doctype html>
<html lang="ko"><head>
<title>물음표 클럽</title>
<link rel="icon" href="./assets/mark.svg">
<link rel="stylesheet" href="./style.css">
<script type="module" src="./app.js"></script>
</head><body>
<img src='./assets/prize.svg' alt="세 친구">
<a href="#home">메인</a>
<a href="https://example.com/">외부</a>
<noscript><a href="./docs/episode.md">영상 대본 읽기</a></noscript>
<span data-src="./assets/mark.svg">본문 ./assets/mark.svg</span>
</body></html>`,
      'public/app.js': "export const documentName = 'episode.md';\n",
      'public/style.css': 'body { color: green; }',
      'public/assets/mark.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
      'public/assets/prize.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
      'docs/episode.md': '# 함께 생각하기\n\n<어떤 기준>이 좋을까? & 질문',
      'docs/manual.html': '<!doctype html><title>기존 사용자 자료</title>',
    };
    for (const [filename, source] of Object.entries(sources)) {
      await writeFile(join(fixture, filename), source, 'utf8');
    }

    const result = await preparePagesBranch({ projectRoot: fixture });
    assert.equal(result.documentCount, 1);
    const entry = await readFile(result.entryFile, 'utf8');
    assert.match(entry, /href="\.\/public\/assets\/mark\.svg"/);
    assert.match(entry, /href="\.\/public\/style\.css"/);
    assert.match(entry, /src="\.\/public\/app\.js"/);
    assert.match(entry, /src='\.\/public\/assets\/prize\.svg'/);
    assert.match(entry, /href="\.\/docs\/episode\.html"/);
    assert.ok(entry.includes('data-src="./assets/mark.svg"'));
    assert.ok(entry.includes('본문 ./assets/mark.svg'));
    assert.ok(entry.includes('href="#home"'));
    assert.ok(entry.includes('href="https://example.com/"'));
    assert.equal((entry.match(/name="question-club-docs-format" content="html"/g) ?? []).length, 1);

    const base = new URL('https://example.github.io/kids-phillosophy/');
    for (const match of entry.matchAll(/\s(?:href|src)=["'](\.\/[^"']+)["']/g)) {
      const resource = new URL(match[1], base);
      assert.ok(resource.pathname.startsWith(base.pathname));
      await access(resolve(fixture, resource.pathname.slice(base.pathname.length)));
    }
    const rootReader = await readFile(join(fixture, 'docs/episode.html'), 'utf8');
    assert.equal(rootReader, await readFile(join(result.outputDir, 'docs/episode.html'), 'utf8'));
    assert.match(rootReader, /&lt;어떤 기준&gt;이 좋을까\? &amp; 질문/);
    assert.equal(await readFile(join(fixture, '.nojekyll'), 'utf8'), '');
    assert.equal(await readFile(join(result.outputDir, '.nojekyll'), 'utf8'), '');
    assert.match(await readFile(join(result.outputDir, 'index.html'), 'utf8'),
      /name="question-club-docs-format" content="html"/);
    for (const [filename, source] of Object.entries(sources)) {
      assert.equal(await readFile(join(fixture, filename), 'utf8'), source);
    }

    await preparePagesBranch({ projectRoot: fixture });
    assert.equal(await readFile(result.entryFile, 'utf8'), entry);
    for (const [filename, source] of Object.entries(sources)) {
      assert.equal(await readFile(join(fixture, filename), 'utf8'), source);
    }
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
