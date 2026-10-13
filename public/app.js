import { characters, topics, perspectives, reasons, sceneSteps } from './content.js';
import { TOTAL_CHIPS, emptyAllocation, isCompleteAllocation, adjustAllocation, makeNote, loadNotes, saveNote, deleteNote, noteToMarkdown } from './core.js';

const main = document.querySelector('#main');
const dialog = document.querySelector('#detail-dialog');
let storage;
try { storage = window.localStorage; } catch { storage = null; }
let notes = loadNotes(storage);
const unsavedNoteIds = new Set();
let activity = null;
let toastTimer;
const escape = (value = '') => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const prizeImage = new URL('./assets/prize.svg', import.meta.url).href;

function docUrl(filename) {
  const format = document.querySelector('meta[name="question-club-docs-format"]')?.content;
  const documentName = format === 'html' ? filename.replace(/\.md$/, '.html') : filename;
  return new URL(`./docs/${documentName}`, document.baseURI).href;
}

function icon(name, size = 24) {
  const paths = {
    heart: '<path d="M20.5 5.5c-2-2-5-1.5-6.5.5L12 8l-2-2C8.5 4 5.5 3.5 3.5 5.5c-2 2-2 5 0 7L12 21l8.5-8.5c2-2 2-5 0-7Z"/>',
    spark: '<path d="m12 2 2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6L12 2Z"/>',
    people: '<circle cx="8" cy="7" r="3"/><path d="M2 21v-4a6 6 0 0 1 12 0v4M16 4a3 3 0 0 1 0 6M17 13a5 5 0 0 1 5 5v3"/>',
    balance: '<path d="M12 3v18M6 21h12M4 7h16M5 7l-3 7h6L5 7Zm14 0-3 7h6l-3-7Z"/>',
    star: '<path d="m12 2 3 6.5 7 1-5 5 1.2 7-6.2-3.3-6.2 3.3 1.2-7-5-5 7-1L12 2Z"/>',
    world: '<circle cx="12" cy="12" r="10"/><ellipse cx="12" cy="12" rx="4" ry="10"/><path d="M2 12h20"/>',
    leaf: '<path d="M20 3C8 1 1 8 5 17c9 4 16-3 15-14ZM3 21 15 9"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    book: '<path d="M12 5v16M2 3c4-1 7 0 10 2 3-2 6-3 10-2v16c-4-1-7 0-10 2-3-2-6-3-10-2V3Z"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.spark}</svg>`;
}

function avatar(index, small = false) {
  const colors = ['#7f94c7', '#e4a07f', '#91a678'];
  const skin = ['#efd2b4', '#eed0b0', '#dfb792'];
  return `<span class="avatar${small ? ' small' : ''} ${characters[index].color}" aria-hidden="true"><svg viewBox="0 0 90 90"><path d="M10 90V76c0-33 70-33 70 0v14" fill="${colors[index]}"/><circle cx="45" cy="38" r="25" fill="${skin[index]}"/><path d="M20 34Q16 6 45 10q29-5 25 24L52 19 37 28l-12-5Z" fill="#37453b"/><path d="M36 39v4m18-4v4m-13 10q5 4 10 0" stroke="#37453b" stroke-width="2.4" stroke-linecap="round" fill="none"/></svg></span>`;
}

function updateNoteCount() {
  const badge = document.querySelector('#note-count');
  badge.hidden = notes.length === 0;
  badge.textContent = String(notes.length);
}

function home() {
  main.className = 'home-main';
  main.innerHTML = `
    <section class="hero wrap" aria-labelledby="hero-title">
      <div class="hero-copy"><p class="eyebrow"><span class="tiny-star">✦</span> 작은 질문, 커다란 모험</p>
        <h1 id="hero-title">잠깐,<br>너는 어떻게<br><span class="hand-underline">생각해?</span></h1>
        <p class="hero-description">친구와 다퉜을 때도, 게임을 할 때도.<br>우리의 매일에는 재미있는 철학이 숨어 있어.<br>다른 생각을 만나고, 너만의 이유를 찾아봐.</p>
        <div class="hero-buttons"><button class="button primary" data-action="start">오늘의 사건 속으로 ${icon('arrow', 20)}</button><a class="text-link" href="#roadmap">성장 지도 둘러보기 <span aria-hidden="true">↘</span></a></div>
        <div class="hero-caption"><span class="mini-avatars">${[0, 1, 2].map(i => avatar(i, true)).join('')}</span><span>서로 다른 생각이 만나면, 이야기가 시작돼.</span></div>
      </div>
      <div class="hero-art"><div class="art-topline"><span class="pill dark">오늘의 사건 01</span><span class="art-scribble">우리 셋이 만든 게임인데…</span></div><img src="${escape(prizeImage)}" alt="게임 상금 봉투 앞에서 각자의 기여를 말하는 세 친구" width="580" height="430" fetchpriority="high"><div class="art-caption"><span>공정함과 책임</span><strong>10만 원, 어떻게 나눌까?</strong><span class="art-arrow" aria-hidden="true">↗</span></div></div>
    </section>
    <div class="intro-strip"><div class="wrap"><span>${icon('spark', 19)} 선택해 보고</span><i aria-hidden="true">·</i><span>${icon('people', 21)} 다른 이유를 만나고</span><i aria-hidden="true">·</i><span>${icon('book', 20)} 내 생각을 남겨요</span></div></div>
    <section id="roadmap" class="section wrap" aria-labelledby="roadmap-title"><div class="section-heading"><div><p class="eyebrow">생각이 자라는 여덟 걸음</p><h2 id="roadmap-title">나에게서 시작해, 세상으로.</h2><p>순서대로 걸어도, 지금 궁금한 질문부터 시작해도 좋아.</p></div><span class="section-aside">초등학생부터 중학생까지<br>같은 질문을, 더 깊이.</span></div>
      <div class="roadmap-grid">${topics.map((topic, i) => `<button class="topic-card ${topic.color}${topic.live ? ' live' : ''}" data-action="topic" data-index="${i}"><div class="topic-top"><span class="topic-number">${String(i + 1).padStart(2, '0')}</span>${topic.live ? '<span class="live-label">지금 체험</span>' : ''}</div><span class="topic-icon">${icon(topic.icon, 29)}</span><h3>${topic.title}</h3><p>${topic.question}</p><span class="topic-bottom">${topic.live ? '첫 번째 사건을 만나봐' : '주제와 질문 살펴보기'} ${icon('arrow', 17)}</span></button>`).join('')}</div>
    </section>
    <section id="episodes" class="section episode-section"><div class="wrap"><div class="section-heading"><div><p class="eyebrow">오늘, 함께 풀어 볼 질문</p><h2>이야기 속으로 들어가 볼까?</h2><p>다른 이야기를 듣고, 네 이유를 다시 살펴봐.</p></div><span class="pill light">시즌 01</span></div>
      <div class="episode-feature"><div class="feature-illustration"><span class="float-chip chip-one">₩</span><span class="float-chip chip-two">?</span><span class="feature-amount">100,000<span>원</span></span><div class="feature-people">${[0, 1, 2].map(i => avatar(i)).join('')}</div><span class="feature-label">세 명의 친구 · 열 개의 칩</span></div><div class="feature-copy"><div class="episode-meta"><span class="pill light">직접 선택하는 이야기</span><span>초등 4학년부터 · 내 속도로</span></div><h3>우리 게임이 상금<br>10만 원을 탔다.<br><span>누구 돈일까?</span></h3><p>코드를 만든 지우, 그림을 그린 서윤,<br>테스트하고 알린 민호. 셋의 이야기를 듣고<br>너만의 기준으로 상금을 나눠 봐.</p><button class="button primary" data-action="start">상금 나누러 가기 ${icon('arrow', 20)}</button><a class="subtle-link" href="${escape(docUrl('episode-01.md'))}" target="_blank" rel="noopener">영상 대본 읽기 ↗</a></div></div>
      <div class="upcoming-row"><p><span class="pill outline">다음 이야기 · 기획 중</span> 어떤 질문을 더 만나게 될까?</p><button data-action="topic" data-index="0">감정을 삭제할 수 있다면? ${icon('arrow', 18)}</button><button data-action="topic" data-index="2">단짝이 비밀번호를 달라고 한다 ${icon('arrow', 18)}</button></div>
    </div></section>
    <section class="section wrap approach-section"><div><p class="eyebrow">오래된 지혜, 오늘의 질문</p><h2>다른 곳에서 온 생각이<br>한자리에 모였어.</h2><p>동서양 철학과 여러 종교의 관점을 만나 봐.<br>각각의 이야기에서 새로운 질문을 발견할 수 있어.</p><a href="#library" class="text-link">생각 도서관 만나기 ${icon('arrow', 18)}</a></div><div class="perspective-mini-grid">${perspectives.map((p, i) => `<button class="perspective-mini ${p.color}" data-action="source" data-index="${i}"><span>${icon(p.icon, 24)}</span><small>${p.tradition}</small><strong>${p.name}</strong><p>${p.title}</p>${icon('arrow', 19)}</button>`).join('')}</div></section>
  `;
}

function newActivity() {
  return { step: 0, first: emptyAllocation(), final: emptyAllocation(), firstReason: '', finalReason: '', reflection: '', revealed: new Set(), viewed: new Set(), perspective: 0, noteId: null, createdAt: null, saved: false };
}

function sceneShell(body, hint, canContinue = true, nextLabel = '다음 장면으로') {
  const step = activity.step;
  return `<div class="activity-wrap"><div class="activity-top"><a href="#episodes" class="text-link">← 오늘의 사건</a><span>공정함과 책임 · 사건 01</span></div>
    <ol class="step-track" aria-label="이야기 진행">${sceneSteps.map((label, i) => `<li class="${i === step ? 'current' : i < step ? 'done' : ''}" ${i === step ? 'aria-current="step"' : ''}><span>${i < step ? icon('check', 15) : i + 1}</span><small>${label}</small></li>`).join('')}</ol>
    <section class="scene-panel" aria-labelledby="scene-title">${body}</section>
    <div class="scene-actions">${step > 0 ? '<button id="previous-step" class="button secondary" data-action="previous">이전 장면</button>' : '<span></span>'}<p id="continue-hint" aria-live="polite">${hint}</p>${step < 5 ? `<button id="next-step" class="button primary" data-action="next" aria-describedby="continue-hint" ${canContinue ? '' : 'disabled'}>${nextLabel} ${icon('arrow', 19)}</button>` : '<a class="button secondary" href="#notes">내 노트 모아보기 →</a>'}</div>
  </div>`;
}

function allocationView(isFinal) {
  const values = isFinal ? activity.final : activity.first;
  const reason = isFinal ? activity.finalReason : activity.firstReason;
  const field = isFinal ? 'finalReason' : 'firstReason';
  const remaining = TOTAL_CHIPS - values.reduce((sum, n) => sum + n, 0);
  return `<p class="eyebrow">${isFinal ? '05 · 새로운 이유로, 다시 선택' : '02 · 먼저 네 생각대로'}</p><h1 id="scene-title" tabindex="-1">${isFinal ? '이제, 어떻게 나누고 싶어?' : '10만 원, 네가 나눠 본다면?'}</h1><p class="scene-intro">${isFinal ? '배분을 바꿔도, 그대로 두어도 좋아. 지금 중요하게 생각하는 이유를 골라 봐.' : '한 개의 칩은 1만 원이야. 세 친구에게 열 개의 칩을 나눠 줘.'}</p>
    ${isFinal ? `<div class="initial-recap"><span>처음에는</span>${characters.map((c, i) => `<span>${c.name} <strong>${activity.first[i]}만 원</strong></span>`).join('')}<span>이라고 생각했어.</span></div>` : ''}
    <div class="chip-bank"><div><strong id="remaining-count" aria-live="polite">${remaining}</strong><span>개 남았어</span></div><div class="bank-tokens" aria-hidden="true">${Array.from({ length: TOTAL_CHIPS }, (_, i) => `<span class="token ${i >= remaining ? 'used' : ''}">₩</span>`).join('')}</div></div>
    <div class="allocation-grid">${characters.map((c, i) => `<article class="allocation-card ${c.color}">${avatar(i)}<h2>${c.name}</h2><p>${c.role}</p><div class="amount"><span id="amount-${i}">${values[i]}</span><small>만 원</small></div><div class="amount-controls"><button id="minus-${i}" aria-label="${c.name}에게 줄 칩 하나 빼기" data-action="adjust" data-index="${i}" data-delta="-1" ${values[i] === 0 ? 'disabled' : ''}>−</button><span>${values[i]}개</span><button id="plus-${i}" aria-label="${c.name}에게 칩 하나 주기" data-action="adjust" data-index="${i}" data-delta="1" ${remaining === 0 ? 'disabled' : ''}>+</button></div></article>`).join('')}</div>
    <p class="unit-note">여기서는 1만 원 단위로 생각해 봐. 더 작게 나누거나 함께 쓰는 방법은 마지막 노트에 적어도 좋아.</p>
    <fieldset class="reason-field"><legend>어떤 이유로 나눴어?</legend><p>이유를 고르거나, 아래에 직접 적어 줘.</p><div class="reason-options">${reasons.map((r, i) => `<button id="reason-${i}" class="reason-option${reason === r ? ' selected' : ''}" data-action="reason" data-value="${escape(r)}" aria-pressed="${reason === r}">${r}</button>`).join('')}</div><label class="sr-only" for="reason-text">상금을 이렇게 나눈 이유</label><textarea id="reason-text" data-field="${field}" maxlength="400" rows="2" placeholder="나는 …을 중요하게 생각했어.">${escape(reason)}</textarea></fieldset>`;
}

function comparison(note) {
  return `<div class="comparison"><div class="comparison-head"><span>친구</span><span>처음 선택</span><span>다시 선택</span></div>${characters.map((c, i) => `<div class="comparison-row"><span>${avatar(i, true)}<strong>${c.name}</strong></span><span>${note.initial[i]}만 원</span><span class="${note.initial[i] !== note.final[i] ? 'changed' : ''}">${note.final[i]}만 원 ${note.initial[i] !== note.final[i] ? '<small>바뀌었어</small>' : '<small>그대로</small>'}</span></div>`).join('')}</div>`;
}

function renderEpisode(preserveFocus = false) {
  if (!activity) activity = newActivity();
  const focused = preserveFocus ? document.activeElement?.id : null;
  const step = activity.step;
  main.className = 'episode-main';
  let body; let hint = ''; let ready = true;
  if (step === 0) {
    body = `<p class="eyebrow">01 · 세 친구의 첫 번째 고민</p><h1 id="scene-title" tabindex="-1">우리 게임이 상금 10만 원을 탔다.<br>누구 돈일까?</h1><p class="scene-intro">학교 축제에서 ‘달토끼 점프’가 상을 받았어.<br>봉투를 열어 보니 10만 원! 그런데 셋의 생각이 달랐어.<br>셋은 상금을 어떻게 나눌지 미리 약속하지 않았어.</p><div class="story-visual"><img src="${escape(prizeImage)}" alt="게임 상금을 받은 지우, 서윤, 민호" width="580" height="430"><span class="story-label">이야기 미리보기</span></div><div class="dialogue-grid">${characters.map((c, i) => `<article>${avatar(i, true)}<strong>${c.name} <small>${c.role}</small></strong><p>“${c.initial}”</p></article>`).join('')}</div><div class="gentle-callout">네가 이 팀의 네 번째 친구라면, 어떤 기준으로 나눌까?</div>`;
    hint = '정해진 정답은 없어. 너의 이유가 궁금해.';
  } else if (step === 1 || step === 4) {
    const isFinal = step === 4;
    body = allocationView(isFinal);
    const values = isFinal ? activity.final : activity.first;
    const reason = isFinal ? activity.finalReason : activity.firstReason;
    ready = isCompleteAllocation(values) && reason.trim().length > 0;
    hint = !isCompleteAllocation(values) ? '열 개의 칩을 모두 나눠 줘.' : !reason.trim() ? '이유 한 가지를 고르거나 적어 줘.' : isFinal ? '같은 배분이어도 이유는 달라질 수 있어.' : '네 첫 생각을 가지고, 다음 이야기를 만나 보자.';
  } else if (step === 2) {
    body = `<p class="eyebrow">03 · 잠깐, 아직 못 들은 이야기가 있어</p><h1 id="scene-title" tabindex="-1">눈에 안 보이는 노력도 있었어.</h1><p class="scene-intro">친구들의 카드를 하나씩 열어 봐.<br>처음에는 몰랐던 일이 숨어 있어.</p><div class="reveal-grid">${characters.map((c, i) => `<button id="reveal-${i}" class="reveal-card ${c.color}${activity.revealed.has(i) ? ' revealed' : ''}" data-action="reveal" data-index="${i}" aria-expanded="${activity.revealed.has(i)}">${avatar(i)}<h2>${c.name}</h2><span class="reveal-role">${c.role}</span>${activity.revealed.has(i) ? `<p>${c.reveal}</p><strong>${c.question}</strong><span class="reveal-bottom">${icon('check', 17)} 이야기를 들었어</span>` : `<p class="card-mystery">?</p><span class="reveal-bottom">숨은 이야기 열기 ${icon('arrow', 18)}</span>`}</button>`).join('')}</div>`;
    ready = activity.revealed.size === 3;
    hint = `세 친구의 이야기를 모두 들어 줘. (${activity.revealed.size}/3)`;
  } else if (step === 3) {
    const p = perspectives[activity.perspective];
    body = `<p class="eyebrow">04 · 오래된 생각에서 새로운 질문을</p><h1 id="scene-title" tabindex="-1">세 가지 렌즈로 바라볼까?</h1><p class="scene-intro">철학과 종교에서 온 질문들이야.<br>적어도 두 관점을 만나 보고, 네가 놓친 이유가 있는지 살펴봐.</p><div class="perspective-tabs" role="tablist" aria-label="다른 관점">${perspectives.map((p, i) => `<button id="perspective-${i}" role="tab" aria-selected="${activity.perspective === i}" aria-controls="perspective-panel" tabindex="${activity.perspective === i ? 0 : -1}" data-action="perspective" data-index="${i}" class="${activity.perspective === i ? 'active' : ''}">${icon(p.icon, 20)}${p.name}${activity.viewed.has(i) ? '<span class="viewed-mark" aria-label="살펴본 관점">✓</span>' : ''}</button>`).join('')}</div><article id="perspective-panel" class="perspective-panel ${p.color}" role="tabpanel" aria-labelledby="perspective-${activity.perspective}"><span class="perspective-symbol">${icon(p.icon, 50)}</span><p class="eyebrow">${p.tradition}</p><h2>${p.title}</h2><p class="perspective-text">${p.text}</p><div class="perspective-question">${icon('spark', 22)}<strong>${p.prompt}</strong></div><details><summary>이 질문은 어디에서 왔을까?</summary><p>${p.source}</p><p>${p.note}</p></details></article>`;
    ready = activity.viewed.size >= 2;
    hint = `만나 본 관점 ${activity.viewed.size}/3 · 두 관점 이상 살펴봐 줘.`;
  } else {
    const note = { initial: activity.first, final: activity.final };
    body = `<p class="eyebrow">06 · 오늘 네가 발견한 생각</p><h1 id="scene-title" tabindex="-1">처음의 이유와 지금의 이유를 돌아볼까?</h1><p class="scene-intro">배분이 달라졌어도, 그대로여도 좋아.<br>무엇을 새롭게 알게 되었는지 돌아보자.</p>${comparison(note)}<div class="reason-comparison"><div><small>처음에는 이런 이유였어</small><p>${escape(activity.firstReason)}</p></div><div><small>지금은 이렇게 생각해</small><p>${escape(activity.finalReason)}</p></div></div><div class="reflection-field"><label for="reflection">오늘 새롭게 발견한 생각은?</label><p>생각이 바뀐 이유, 더 궁금한 질문, 다른 배분 방법을 적어도 좋아.</p><textarea id="reflection" data-field="reflection" rows="4" maxlength="400" placeholder="처음에는 …라고 생각했는데, …을 알고 나니 …"></textarea></div><div class="note-actions"><button id="save-note" class="button primary" data-action="save">${icon('book', 20)} ${activity.saved ? '노트 다시 저장하기' : '내 생각 노트에 저장'}</button><button class="button secondary" data-action="download-current">${icon('download', 20)} 파일로 간직하기</button></div><p class="storage-explanation">노트는 이 기기의 브라우저에만 저장돼. 함께 쓰는 기기라면 파일로 간직하는 방법도 있어.</p><div class="gentle-callout"><strong>오늘의 작은 실험</strong>다음에 친구들과 무언가를 나눌 때, 먼저 각자가 한 일을 한 가지씩 들어 봐.</div>`;
    hint = activity.saved ? '오늘의 생각을 남겼어. 언제든 다시 읽어 봐.' : '글을 쓰는 건 선택이야. 너의 선택만 저장해도 좋아.';
  }
  main.innerHTML = sceneShell(body, hint, ready, step === 0 ? '내가 나눠 볼래' : step === 4 ? '내 생각 돌아보기' : '다음 장면으로');
  if (step === 5) document.querySelector('#reflection').value = activity.reflection;
  if (focused) {
    let target = document.getElementById(focused);
    if (target?.disabled && focused.startsWith('plus-')) target = document.getElementById(focused.replace('plus-', 'minus-'));
    if (target?.disabled && focused.startsWith('minus-')) target = document.getElementById(focused.replace('minus-', 'plus-'));
    target?.focus({ preventScroll: true });
  }
}

function sourceCard(p, i) {
  return `<article class="library-card ${p.color}"><span class="library-icon">${icon(p.icon, 32)}</span><p class="eyebrow">${p.tradition}</p><h2>${p.name}</h2><h3>${p.title}</h3><p>${p.text}</p><button class="text-link" data-action="source" data-index="${i}">출처와 해석 살펴보기 ${icon('arrow', 18)}</button></article>`;
}

function library() {
  main.className = 'library-main wrap';
  main.innerHTML = `<section class="page-heading"><p class="eyebrow">생각 도서관</p><h1>오늘의 질문에,<br>오래된 지혜를 더해 봐.</h1><p>첫 번째 사건에서 만나는 세 가지 관점이야.<br>각 생각의 출처와, 오늘의 이야기로 연결한 방법을 살펴봐.</p></section><div class="library-grid">${perspectives.map(sourceCard).join('')}</div><section class="reading-room"><div><p class="eyebrow">함께 만드는 어른들에게</p><h2>이야기 뒤의 자료도 열어 두었어요.</h2><p>같은 질문을 연령에 따라 깊게 다루고, 전통마다 다른 맥락을 존중합니다.</p></div><div><a href="${escape(docUrl('episode-01.md'))}" target="_blank" rel="noopener">첫 에피소드 영상 대본 ${icon('arrow', 19)}</a><a href="${escape(docUrl('editorial-guide.md'))}" target="_blank" rel="noopener">출처와 편집 원칙 ${icon('arrow', 19)}</a><a href="${escape(docUrl('content-roadmap.md'))}" target="_blank" rel="noopener">전체 콘텐츠 로드맵 ${icon('arrow', 19)}</a></div></section>`;
}

function renderNotes() {
  main.className = 'notes-main wrap';
  main.innerHTML = `<section class="page-heading"><p class="eyebrow">내 생각 노트</p><h1>그날의 선택,<br>오늘 다시 읽어 볼까?</h1><p>정답 대신 네가 발견한 이유를 모았어.<br>지금 남긴 생각과 이 브라우저에 저장한 노트가 여기에 보여.</p></section>${notes.length ? `<div class="notes-grid">${notes.map(note => `<article class="saved-note"><div class="note-topline"><span class="pill light">${unsavedNoteIds.has(note.id) ? '현재 화면에만 있어' : '공정함과 책임'}</span><time datetime="${escape(note.createdAt)}">${new Date(note.createdAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</time></div><h2>10만 원, 어떻게 나눌까?</h2>${comparison(note)}<div class="saved-reasons"><p><small>처음의 이유</small>${escape(note.firstReason) || '이유를 적지 않았어.'}</p><p><small>마지막 이유</small>${escape(note.finalReason) || '이유를 적지 않았어.'}</p>${note.reflection ? `<p class="saved-reflection"><small>새롭게 발견한 생각</small>${escape(note.reflection)}</p>` : ''}</div>${unsavedNoteIds.has(note.id) ? '<p class="storage-explanation">브라우저에 저장하지 못했어. 화면을 닫기 전에 파일로 간직해 줘.</p>' : ''}<div class="saved-note-actions"><button class="text-link" data-action="download-note" data-id="${escape(note.id)}">${icon('download', 18)} 파일로 간직하기</button><button class="delete-link" data-action="delete-confirm" data-id="${escape(note.id)}">삭제</button></div></article>`).join('')}</div><p class="storage-explanation">최근 20개의 노트를 보관해. 오래 간직할 노트는 파일로 내려받아 줘.</p>` : `<div class="empty-notes"><span>${icon('book', 56)}</span><h2>첫 번째 생각을 기다리고 있어.</h2><p>이야기 속으로 들어가서 네 선택과 이유를 남겨 봐.</p><button class="button primary" data-action="start">첫 번째 사건 만나기 ${icon('arrow', 20)}</button></div>`}`;
}

function showTopic(index) {
  const topic = topics[index];
  dialog.innerHTML = `<div class="dialog-header"><p class="eyebrow">성장 지도 · ${String(index + 1).padStart(2, '0')}</p><button class="icon-button" aria-label="닫기" data-action="close">${icon('close')}</button></div><span class="dialog-topic-icon ${topic.color}">${icon(topic.icon, 38)}</span><h2 id="dialog-title">${topic.title}</h2><p class="dialog-question">${topic.question}</p><p>${topic.description}</p><h3>이 주제에서 만날 이야기</h3><ul class="topic-episodes">${topic.episodes.map((title, i) => `<li><span>${title}</span><small>${topic.live && i === 0 ? '지금 체험할 수 있어' : '기획 중'}</small></li>`).join('')}</ul><div class="age-guide"><strong>같은 질문을, 더 깊이</strong><p>초등 저학년은 이야기와 선택으로, 고학년은 이유와 반례로, 중학생은 규칙과 사회까지 연결해 볼 수 있어.</p></div>${topic.live ? `<button class="button primary" data-action="start">첫 번째 사건 시작 ${icon('arrow', 19)}</button>` : '<button class="button secondary" data-action="close">다른 질문도 살펴보기</button>'}`;
  dialog.showModal();
}

function showSource(index) {
  const p = perspectives[index];
  dialog.innerHTML = `<div class="dialog-header"><p class="eyebrow">${p.tradition}</p><button class="icon-button" aria-label="닫기" data-action="close">${icon('close')}</button></div><h2 id="dialog-title">${p.name}</h2><p class="dialog-question">${p.title}</p><p>${p.text}</p><div class="source-detail"><strong>원전 위치</strong><p>${p.source}</p><strong>오늘의 이야기로 연결한 방법</strong><p>${p.note}</p></div><p class="source-context">한 전통 안에도 여러 해석이 있어. 이 카드는 그중 한 개념에서 출발해, 우리가 생각해 볼 질문을 만든 것이야.</p><a class="text-link" href="${escape(docUrl('editorial-guide.md'))}" target="_blank" rel="noopener">자세한 편집 자료 읽기 ↗</a>`;
  dialog.showModal();
}

function notify(message) {
  const toast = document.querySelector('#status-message');
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('visible');
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 4500);
}

function currentNote() {
  const note = makeNote({ initial: activity.first, final: activity.final, firstReason: activity.firstReason, finalReason: activity.finalReason, reflection: activity.reflection });
  if (activity.noteId) { note.id = activity.noteId; note.createdAt = activity.createdAt; }
  return note;
}

function download(note) {
  const blob = new Blob([noteToMarkdown(note)], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `물음표클럽-생각노트-${note.createdAt.slice(0, 10)}.md`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function goToStep(step) {
  activity.step = step;
  renderEpisode();
  document.querySelector('#scene-title')?.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'instant' });
}

document.addEventListener('click', event => {
  if (event.target.closest('.skip-link')) { event.preventDefault(); main.focus(); return; }
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  const index = Number(button.dataset.index);
  if (action === 'start') {
    dialog.close();
    if (activity && activity.step > 0 && activity.step < 5) {
      dialog.innerHTML = `<div class="dialog-header"><h2 id="dialog-title">이야기를 이어서 볼까?</h2><button class="icon-button" aria-label="닫기" data-action="close">${icon('close')}</button></div><p>지금까지 선택한 내용이 남아 있어.</p><div class="resume-actions"><button class="button primary" data-action="resume">이어서 생각하기</button><button class="button secondary" data-action="restart">처음부터 시작</button></div>`;
      dialog.showModal();
    } else { activity = newActivity(); location.hash = 'episode'; if (location.hash === '#episode') renderEpisode(); }
  } else if (action === 'resume' || action === 'restart') {
    dialog.close();
    if (action === 'restart') activity = newActivity();
    location.hash = 'episode';
    renderEpisode();
    document.querySelector('#scene-title')?.focus();
  } else if (action === 'topic') showTopic(index);
  else if (action === 'source') showSource(index);
  else if (action === 'close') dialog.close();
  else if (action === 'adjust' && activity) {
    const field = activity.step === 4 ? 'final' : 'first';
    activity[field] = adjustAllocation(activity[field], index, Number(button.dataset.delta));
    activity.saved = false;
    renderEpisode(true);
  } else if (action === 'reason' && activity) {
    activity[activity.step === 4 ? 'finalReason' : 'firstReason'] = button.dataset.value;
    activity.saved = false;
    renderEpisode(true);
  } else if (action === 'reveal' && activity) {
    activity.revealed.add(index);
    renderEpisode(true);
  } else if (action === 'perspective' && activity) {
    activity.perspective = index;
    activity.viewed.add(index);
    renderEpisode(true);
  } else if (action === 'next' && activity) {
    if (activity.step === 1 && (!isCompleteAllocation(activity.first) || !activity.firstReason.trim())) return;
    if (activity.step === 2 && activity.revealed.size !== 3) return;
    if (activity.step === 3 && activity.viewed.size < 2) return;
    if (activity.step === 4 && (!isCompleteAllocation(activity.final) || !activity.finalReason.trim())) return;
    if (activity.step === 2) activity.viewed.add(activity.perspective);
    if (activity.step === 3 && !activity.finalReason) { activity.final = [...activity.first]; activity.finalReason = activity.firstReason; }
    goToStep(Math.min(activity.step + 1, 5));
  } else if (action === 'previous' && activity) goToStep(Math.max(activity.step - 1, 0));
  else if (action === 'save' && activity) {
    const note = currentNote();
    const result = saveNote(storage, note);
    if (result.ok) unsavedNoteIds.delete(note.id); else unsavedNoteIds.add(note.id);
    notes = [...result.notes, ...notes.filter(n => unsavedNoteIds.has(n.id) && !result.notes.some(stored => stored.id === n.id))].slice(0, 20);
    activity.noteId = note.id;
    activity.createdAt = note.createdAt;
    activity.saved = result.ok;
    updateNoteCount();
    renderEpisode(true);
    notify(result.ok ? '네 생각을 이 브라우저에 저장했어.' : '브라우저에 저장할 수 없었어. 파일로 간직해 줘.');
  } else if (action === 'download-current' && activity) download(currentNote());
  else if (action === 'download-note') { const note = notes.find(n => n.id === button.dataset.id); if (note) download(note); }
  else if (action === 'delete-confirm') {
    dialog.innerHTML = `<div class="dialog-header"><h2 id="dialog-title">이 노트를 지울까?</h2><button class="icon-button" aria-label="닫기" data-action="close">${icon('close')}</button></div><p>간직하고 싶다면 먼저 파일로 내려받아 줘.</p><div class="resume-actions"><button class="button secondary" data-action="close">남겨 둘래</button><button class="button danger" data-action="delete-note" data-id="${escape(button.dataset.id)}">노트 삭제</button></div>`;
    dialog.showModal();
  } else if (action === 'delete-note') {
    const result = deleteNote(storage, button.dataset.id);
    const deletedId = button.dataset.id;
    unsavedNoteIds.delete(deletedId);
    notes = result.ok ? [...result.notes, ...notes.filter(n => unsavedNoteIds.has(n.id) && !result.notes.some(stored => stored.id === n.id))].slice(0, 20) : notes.filter(n => n.id !== deletedId);
    if (activity?.noteId === button.dataset.id) { activity.noteId = null; activity.createdAt = null; activity.saved = false; }
    dialog.close(); updateNoteCount(); renderNotes();
    notify(result.ok ? '노트를 삭제했어.' : '이 화면에서는 지웠지만 브라우저 저장 내용은 바꾸지 못했어.');
    main.focus({ preventScroll: true });
  }
});

document.addEventListener('input', event => {
  const field = event.target.dataset.field;
  if (!field || !activity) return;
  activity[field] = event.target.value;
  activity.saved = false;
  if (field === 'reflection') document.querySelector('#continue-hint').textContent = '내용을 바꿨어. 저장하면 노트에도 반영돼.';
  if (field !== 'reflection') {
    document.querySelectorAll('.reason-option').forEach(button => { const selected = button.dataset.value === event.target.value; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); });
    const values = activity.step === 4 ? activity.final : activity.first;
    const next = document.querySelector('#next-step');
    next.disabled = !(isCompleteAllocation(values) && event.target.value.trim());
    document.querySelector('#continue-hint').textContent = !isCompleteAllocation(values) ? '열 개의 칩을 모두 나눠 줘.' : !event.target.value.trim() ? '이유 한 가지를 고르거나 적어 줘.' : '네 이유를 가지고 다음 장면으로 가 보자.';
  }
});

document.addEventListener('keydown', event => {
  const tab = event.target.closest('[role="tab"]');
  if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const current = Number(tab.dataset.index);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? perspectives.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + perspectives.length) % perspectives.length;
  activity.perspective = next; activity.viewed.add(next); renderEpisode();
  document.querySelector(`#perspective-${next}`).focus({ preventScroll: true });
});

dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });

function route() {
  const path = location.hash.slice(1) || 'home';
  document.querySelectorAll('[data-nav]').forEach(link => { const active = link.dataset.nav === path || (path === 'episode' && link.dataset.nav === 'episodes'); if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
  if (path === 'episode') renderEpisode();
  else if (path === 'notes') renderNotes();
  else if (path === 'library') library();
  else home();
  document.title = `${path === 'episode' ? '10만 원, 어떻게 나눌까?' : path === 'notes' ? '내 생각 노트' : path === 'library' ? '생각 도서관' : '생각이 자라는 모험'} · 물음표 클럽`;
  requestAnimationFrame(() => {
    if (path === 'roadmap' || path === 'episodes') document.querySelector(`#${path}`)?.scrollIntoView({ block: 'start', behavior: 'instant' });
    else { window.scrollTo({ top: 0, behavior: 'instant' }); main.focus({ preventScroll: true }); }
  });
}

window.addEventListener('hashchange', route);
updateNoteCount();
route();
