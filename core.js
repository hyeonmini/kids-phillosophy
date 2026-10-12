export const TOTAL_CHIPS = 10;

const STORAGE_KEY = 'question-club-notes-v1';
const MAX_NOTES = 20;
const MAX_TEXT_LENGTH = 400;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TEXT_FIELDS = ['firstReason', 'finalReason', 'reflection'];
const PEOPLE = ['지우 · 코드', '서윤 · 그림', '민호 · 테스트·홍보'];

function isAllocation(allocation) {
  return Array.isArray(allocation)
    && allocation.length === 3
    && [0, 1, 2].every((index) => Number.isInteger(allocation[index]) && allocation[index] >= 0)
    && allocation.reduce((sum, amount) => sum + amount, 0) <= TOTAL_CHIPS;
}

export function emptyAllocation() {
  return [0, 0, 0];
}

export function isCompleteAllocation(allocation) {
  return isAllocation(allocation)
    && allocation.reduce((sum, amount) => sum + amount, 0) === TOTAL_CHIPS;
}

export function adjustAllocation(allocation, index, delta) {
  if (!isAllocation(allocation)
    || !Number.isInteger(index)
    || index < 0
    || index > 2
    || (delta !== 1 && delta !== -1)) {
    throw new RangeError('세 사람의 칩 수와 조정할 칩 수를 확인해 주세요.');
  }

  const next = [...allocation];
  const total = next.reduce((sum, amount) => sum + amount, 0);
  if ((delta === -1 && next[index] > 0) || (delta === 1 && total < TOTAL_CHIPS)) {
    next[index] += delta;
  }
  return next;
}

function normalizeText(value = '') {
  if (typeof value !== 'string') {
    throw new RangeError('생각과 이유는 글로 적어 주세요.');
  }
  return Array.from(value.trim()).slice(0, MAX_TEXT_LENGTH).join('').trim();
}

export function makeNote({ initial, final, firstReason = '', finalReason = '', reflection = '' } = {}) {
  if (!isCompleteAllocation(initial) || !isCompleteAllocation(final)) {
    throw new RangeError('첫 선택과 마지막 선택에서 칩 10개를 모두 나눠 주세요.');
  }

  return {
    id: globalThis.crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    initial: [...initial],
    final: [...final],
    firstReason: normalizeText(firstReason),
    finalReason: normalizeText(finalReason),
    reflection: normalizeText(reflection),
  };
}

function snapshotNote(note) {
  if (!note || typeof note !== 'object' || Array.isArray(note)
    || typeof note.id !== 'string' || !UUID_PATTERN.test(note.id)
    || typeof note.createdAt !== 'string'
    || !isCompleteAllocation(note.initial) || !isCompleteAllocation(note.final)) {
    return null;
  }

  const date = new Date(note.createdAt);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== note.createdAt) {
    return null;
  }
  if (!TEXT_FIELDS.every((field) => typeof note[field] === 'string'
    && note[field] === note[field].trim()
    && Array.from(note[field]).length <= MAX_TEXT_LENGTH)) {
    return null;
  }

  return {
    id: note.id,
    createdAt: note.createdAt,
    initial: [...note.initial],
    final: [...note.final],
    firstReason: note.firstReason,
    finalReason: note.finalReason,
    reflection: note.reflection,
  };
}

function readNotes(storage) {
  let raw;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { notes: [], error: '이 브라우저에서 생각 노트를 읽을 수 없어요.' };
  }

  if (raw === null || raw === undefined) return { notes: [], error: null };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { notes: [], error: null };
  }
  if (!Array.isArray(parsed)) return { notes: [], error: null };

  const notes = [];
  const seen = new Set();
  for (const value of parsed) {
    const note = snapshotNote(value);
    if (note && !seen.has(note.id)) {
      notes.push(note);
      seen.add(note.id);
      if (notes.length === MAX_NOTES) break;
    }
  }
  return { notes, error: null };
}

export function loadNotes(storage) {
  return readNotes(storage).notes;
}

function writeNotes(storage, notes, readError) {
  if (readError) return { ok: false, notes, error: readError };
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(notes));
    return { ok: true, notes, error: null };
  } catch {
    return {
      ok: false,
      notes,
      error: '브라우저에 저장하지 못했어요. 이 화면의 노트를 파일로 내려받아 주세요.',
    };
  }
}

export function saveNote(storage, note) {
  const snapshot = snapshotNote(note);
  if (!snapshot) throw new RangeError('저장할 생각 노트의 내용을 확인해 주세요.');

  const existing = readNotes(storage);
  const notes = [snapshot, ...existing.notes.filter((item) => item.id !== snapshot.id)]
    .slice(0, MAX_NOTES);
  return writeNotes(storage, notes, existing.error);
}

export function deleteNote(storage, id) {
  if (typeof id !== 'string' || !UUID_PATTERN.test(id)) {
    throw new RangeError('삭제할 생각 노트를 확인해 주세요.');
  }
  const existing = readNotes(storage);
  const notes = existing.notes.filter((note) => note.id !== id);
  return writeNotes(storage, notes, existing.error);
}

function allocationMarkdown(allocation) {
  return PEOPLE.map((person, index) => `- ${person}: ${allocation[index]}칩 (${allocation[index]}만 원)`)
    .join('\n');
}

export function noteToMarkdown(note) {
  const snapshot = snapshotNote(note);
  if (!snapshot) throw new RangeError('내려받을 생각 노트의 내용을 확인해 주세요.');

  return [
    '# 물음표 클럽 · 내 생각 노트',
    '',
    '우리 게임이 상금 10만 원을 탔다. 누구 돈일까?',
    '',
    `기록한 시간: ${new Date(snapshot.createdAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} (서울 시간)`,
    '총 10칩 · 1칩 = 1만 원',
    '',
    '## 첫 선택',
    '',
    allocationMarkdown(snapshot.initial),
    '',
    '### 처음에 이렇게 나눈 이유',
    '',
    snapshot.firstReason || '(적지 않았어요)',
    '',
    '## 마지막 선택',
    '',
    allocationMarkdown(snapshot.final),
    '',
    '### 마지막에 이렇게 나눈 이유',
    '',
    snapshot.finalReason || '(적지 않았어요)',
    '',
    '## 생각이 달라진 점 또는 새롭게 생긴 질문',
    '',
    snapshot.reflection || '(적지 않았어요)',
    '',
  ].join('\n');
}
