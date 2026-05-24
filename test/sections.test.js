// test/sections.test.js — node test/sections.test.js
const s = require('../sections.js');
const assert = require('assert');

let pass = 0, fail = 0;
function test(name, fn){
  try { fn(); console.log('  ok', name); pass++; }
  catch(e){ console.log('  FAIL', name, '\n   ', e.message); fail++; }
}

console.log('slugify:');
test('basic ASCII', () => assert.strictEqual(s.slugify('Hello World'), 'hello-world'));
test('accents', () => assert.strictEqual(s.slugify('Praticar Música'), 'praticar-musica'));
test('special chars', () => assert.strictEqual(s.slugify('AI & LLMs!!!'), 'ai-llms'));
test('empty', () => assert.strictEqual(s.slugify(''), 'section'));
test('truncate long', () => assert.strictEqual(s.slugify('a'.repeat(60)).length, 40));

console.log('uniqueSectionId:');
test('no conflict', () => assert.strictEqual(s.uniqueSectionId('foo', ['a','b']), 'foo'));
test('one conflict -> -2', () => assert.strictEqual(s.uniqueSectionId('foo', ['foo','b']), 'foo-2'));
test('two conflicts -> -3', () => assert.strictEqual(s.uniqueSectionId('foo', ['foo','foo-2']), 'foo-3'));

console.log('seedCategorize:');
const ytMusic = { url: 'https://youtube.com/watch?v=abc', folderList: ['Bookmarks Bar','Music'] };
const ytSolo  = { url: 'https://youtube.com/watch?v=xyz', folderList: ['Bookmarks Bar'] };
const ghRepo  = { url: 'https://github.com/foo/bar',     folderList: ['Bookmarks Bar','Nice repos'] };
const random  = { url: 'https://example.com',            folderList: ['Bookmarks Bar'] };
const ecomm   = { url: 'https://shop.example.com',       folderList: ['🟠 Ecomm'] };

test('YouTube em pasta Music -> music (pasta vence URL)',
  () => assert.strictEqual(s.seedCategorize(ytMusic, s.SEED_RULES), 'music'));
test('YouTube solto -> watch',
  () => assert.strictEqual(s.seedCategorize(ytSolo, s.SEED_RULES), 'watch'));
test('GitHub em pasta Nice repos -> code',
  () => assert.strictEqual(s.seedCategorize(ghRepo, s.SEED_RULES), 'code'));
test('Pasta "🟠 Ecomm" -> work',
  () => assert.strictEqual(s.seedCategorize(ecomm, s.SEED_RULES), 'work'));
test('Sem match -> null (inbox)',
  () => assert.strictEqual(s.seedCategorize(random, s.SEED_RULES), null));

console.log('reconcileMembership:');
test('Mantém existentes, adiciona novos ao inbox', () => {
  const r = s.reconcileMembership(
    { 'a': 'music' },
    [ { id:'a' }, { id:'b' } ],
    'inbox'
  );
  assert.deepStrictEqual(r.membership, { a:'music', b:'inbox' });
  assert.deepStrictEqual(r.added, ['b']);
  assert.deepStrictEqual(r.removed, []);
});

test('Remove órfãos', () => {
  const r = s.reconcileMembership(
    { 'a':'music', 'gone':'study' },
    [ { id:'a' } ],
    'inbox'
  );
  assert.deepStrictEqual(r.membership, { a:'music' });
  assert.deepStrictEqual(r.removed, ['gone']);
});

console.log('\nResult:', pass, 'passed,', fail, 'failed');
process.exit(fail === 0 ? 0 : 1);
