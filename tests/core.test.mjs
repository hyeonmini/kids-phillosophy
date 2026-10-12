import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TOTAL_CHIPS,
  emptyAllocation,
  isCompleteAllocation,
  adjustAllocation,
  makeNote,
  loadNotes,
  saveNote,
  deleteNote,
  noteToMarkdown,
} from '../public/core.js';

const STORAGE_KEY = 'question-club-notes-v1';

function memoryStorage(initial = null) {
  let value = initial;
  return {
    getItem(key) {
      assert.equal(key, STORAGE_KEY);
      return value;
    },
    setItem(key, next) {
      assert.equal(key, STORAGE_KEY);
      value = next;
    },
  };
}

function completeNote(overrides = {}) {
  return makeNote({
    initial: [4, 3, 3],
    final: [3, 3, 4],
    firstReason: '처음에는 코드를 가장 중요하게 생각했다.',
    finalReason: '테스트와 홍보의 역할도 알게 되었다.',
    reflection: '보이지 않는 일도 기여일까?',
    ...overrides,
  });
}

test('칩 조정은 0과 총 10칩의 경계를 지키고 기존 배열을 보존한다', () => {
  assert.equal(TOTAL_CHIPS, 10);
  const empty = emptyAllocation();
  assert.deepEqual(empty, [0, 0, 0]);
  assert.notStrictEqual(emptyAllocation(), empty);

  const floor = adjustAllocation(empty, 1, -1);
  assert.deepEqual(floor, empty);
  assert.notStrictEqual(floor, empty);
  const increased = adjustAllocation(empty, 1, 1);
  assert.deepEqual(increased, [0, 1, 0]);
  assert.deepEqual(empty, [0, 0, 0]);

  const full = [4, 3, 3];
  const ceiling = adjustAllocation(full, 0, 1);
  assert.deepEqual(ceiling, full);
  assert.notStrictEqual(ceiling, full);
  assert.deepEqual(adjustAllocation(full, 0, -1), [3, 3, 3]);
  assert.deepEqual(full, [4, 3, 3]);
  assert.deepEqual(adjustAllocation([8, 0, 1], 2, 1), [8, 0, 2]);
});

test('완성 배분은 정확히 세 사람의 음이 아닌 정수 합계 10이다', () => {
  assert.equal(isCompleteAllocation([0, 0, 10]), true);
  assert.equal(isCompleteAllocation([3, 3, 4]), true);
  for (const invalid of [null, {}, '10', [], [5, 5], [5, 5, 0, 0], [3, 3, 3],
    [4, 4, 4], [-1, 5, 6], [3.5, 3.5, 3], ['4', 3, 3], [NaN, 5, 5],
    new Array(3), [Infinity, 0, 0]]) {
    assert.equal(isCompleteAllocation(invalid), false);
  }
});

test('잘못된 칩 조정 인자는 RangeError를 던진다', () => {
  for (const args of [
    [null, 0, 1], [[0, 0], 0, 1], [[11, 0, 0], 0, -1], [[-1, 0, 0], 0, 1],
    [[0.5, 0, 0], 0, 1], [[0, 0, 0], -1, 1], [[0, 0, 0], 3, 1],
    [[0, 0, 0], 1.5, 1], [[0, 0, 0], '1', 1], [[0, 0, 0], 0, 0],
    [[0, 0, 0], 0, 2], [[0, 0, 0], 0, '-1'],
  ]) {
    assert.throws(() => adjustAllocation(...args), RangeError);
  }
});

test('생각 노트는 독립 배분 스냅샷, UUID, ISO 시간을 만들고 글을 다듬는다', () => {
  const initial = [4, 3, 3];
  const final = [3, 3, 4];
  const note = completeNote({ initial, final, firstReason: '  내 이유  ', reflection: `  ${'🙂'.repeat(405)}  ` });
  initial[0] = 99;
  final[1] = 99;
  assert.deepEqual(note.initial, [4, 3, 3]);
  assert.deepEqual(note.final, [3, 3, 4]);
  assert.match(note.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(new Date(note.createdAt).toISOString(), note.createdAt);
  assert.equal(note.firstReason, '내 이유');
  assert.equal(Array.from(note.reflection).length, 400);
  const minimal = makeNote({ initial: [10, 0, 0], final: [0, 10, 0] });
  assert.equal(minimal.firstReason, '');
  assert.equal(minimal.finalReason, '');
  assert.equal(minimal.reflection, '');
  const boundary = completeNote({ firstReason: `${'가'.repeat(399)} 다음 문장` });
  assert.equal(boundary.firstReason, '가'.repeat(399));
  assert.equal(saveNote(memoryStorage(), boundary).ok, true);
});

test('불완전 배분과 잘못된 글은 노트로 만들거나 저장할 수 없다', () => {
  assert.throws(() => makeNote(), RangeError);
  assert.throws(() => completeNote({ initial: [3, 3, 3] }), RangeError);
  assert.throws(() => completeNote({ final: [4, 4, 4] }), RangeError);
  assert.throws(() => completeNote({ firstReason: 42 }), RangeError);
  assert.throws(() => completeNote({ reflection: null }), RangeError);
  const note = completeNote();
  const storage = memoryStorage();
  for (const invalid of [null, {}, { ...note, id: 'unknown' }, { ...note, createdAt: 'today' },
    { ...note, createdAt: '2026-02-30T00:00:00.000Z' }, { ...note, final: [0, 0, 0] },
    { ...note, firstReason: 5 }, { ...note, reflection: 'x'.repeat(401) }]) {
    assert.throws(() => saveNote(storage, invalid), RangeError);
    assert.throws(() => noteToMarkdown(invalid), RangeError);
  }
  assert.deepEqual(loadNotes(storage), []);
});

test('저장, 복원, 같은 ID 수정, 삭제를 수행하고 반환값은 입력과 독립적이다', () => {
  const storage = memoryStorage();
  const note = completeNote();
  const saved = saveNote(storage, note);
  assert.equal(saved.ok, true);
  assert.equal(saved.error, null);
  assert.deepEqual(saved.notes, [note]);
  assert.notStrictEqual(saved.notes[0].initial, note.initial);
  note.initial[0] = 99;
  const restored = loadNotes(storage);
  assert.deepEqual(restored[0].initial, [4, 3, 3]);

  restored[0].firstReason = '다시 설명한 이유';
  restored[0].final = [2, 4, 4];
  const updated = saveNote(storage, restored[0]);
  assert.equal(updated.notes.length, 1);
  assert.equal(updated.notes[0].firstReason, '다시 설명한 이유');
  assert.deepEqual(loadNotes(storage)[0].final, [2, 4, 4]);
  restored[0].final[0] = 99;
  assert.deepEqual(updated.notes[0].final, [2, 4, 4]);
  assert.equal(deleteNote(storage, updated.notes[0].id).ok, true);
  assert.deepEqual(loadNotes(storage), []);
  assert.throws(() => deleteNote(storage, 'invalid-id'), RangeError);
});

test('최근 20개만 유지하고 수정한 노트를 맨 앞으로 옮긴다', () => {
  const storage = memoryStorage();
  const notes = Array.from({ length: 23 }, () => completeNote());
  for (const note of notes) saveNote(storage, note);
  let restored = loadNotes(storage);
  assert.equal(restored.length, 20);
  assert.equal(restored[0].id, notes[22].id);
  assert.equal(restored[19].id, notes[3].id);
  saveNote(storage, { ...restored[19], finalReason: '새로 적은 이유' });
  restored = loadNotes(storage);
  assert.equal(restored.length, 20);
  assert.equal(restored[0].id, notes[3].id);
  assert.equal(restored[0].finalReason, '새로 적은 이유');
});

test('손상된 JSON과 잘못된 기록은 안전하게 건너뛴다', () => {
  for (const raw of ['not-json', '{', '{}', 'null', '42']) {
    assert.deepEqual(loadNotes(memoryStorage(raw)), []);
  }
  const note = completeNote();
  const storage = memoryStorage(JSON.stringify([
    null,
    { ...note, id: 'invalid' },
    { ...note, createdAt: '2026-02-30T00:00:00.000Z' },
    { ...note, initial: [3, 3, 3] },
    { ...note, reflection: {} },
    { ...note, finalReason: ' padded ' },
    { ...note, extra: 'ignored' },
    note,
  ]));
  assert.deepEqual(loadNotes(storage), [note]);
  const corrupted = memoryStorage('{broken');
  assert.equal(saveNote(corrupted, note).ok, true);
  assert.deepEqual(loadNotes(corrupted), [note]);
});

test('읽기 차단·저장 한도 실패에도 저장하려던 세션 노트를 돌려준다', () => {
  const note = completeNote();
  for (const storage of [undefined, null, {}, {
    getItem() { throw new Error('SecurityError'); },
    setItem() { throw new Error('must not write after failed read'); },
  }]) {
    assert.deepEqual(loadNotes(storage), []);
    const result = saveNote(storage, note);
    assert.equal(result.ok, false);
    assert.ok(result.error);
    assert.deepEqual(result.notes, [note]);
    const deleted = deleteNote(storage, note.id);
    assert.equal(deleted.ok, false);
    assert.deepEqual(deleted.notes, []);
  }

  const existing = completeNote();
  const quotaStorage = {
    getItem() { return JSON.stringify([existing]); },
    setItem() { throw new Error('QuotaExceededError'); },
  };
  const failedSave = saveNote(quotaStorage, note);
  assert.equal(failedSave.ok, false);
  assert.deepEqual(failedSave.notes, [note, existing]);
  assert.deepEqual(loadNotes(quotaStorage), [existing]);
  const failedDelete = deleteNote(quotaStorage, existing.id);
  assert.equal(failedDelete.ok, false);
  assert.deepEqual(failedDelete.notes, []);
  assert.deepEqual(loadNotes(quotaStorage), [existing]);
});

test('내려받는 한국어 노트에는 배분, 역할, 이유와 돌아보기 내용이 들어간다', () => {
  const note = completeNote();
  const markdown = noteToMarkdown(note);
  assert.match(markdown, /물음표 클럽 · 내 생각 노트/);
  assert.match(markdown, /1칩 = 1만 원/);
  assert.match(markdown, /지우 · 코드: 4칩 \(4만 원\)/);
  assert.match(markdown, /서윤 · 그림: 3칩 \(3만 원\)/);
  assert.match(markdown, /민호 · 테스트·홍보: 4칩 \(4만 원\)/);
  assert.ok(markdown.includes(note.firstReason));
  assert.ok(markdown.includes(note.finalReason));
  assert.ok(markdown.includes(note.reflection));
  assert.ok(markdown.endsWith('\n'));
});
