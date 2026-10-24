import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BridgeTokenStore, SecretBox, isValidToken, tokenKey } from './bridgeTokens';

// Reversible stand-in for safeStorage
const box = (canEncrypt = true): SecretBox => ({
  canEncrypt: () => canEncrypt,
  encrypt: (s) => Buffer.from([...s].reverse().join('')),
  decrypt: (b) => [...b.toString()].reverse().join(''),
});

function tmpFile(t: { after: (fn: () => void) => void }): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tokens-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, 'bridge-tokens.json');
}

const TOKEN = 'correct-horse-battery-staple';

test('a saved token is read back for the same bridge, in any spelling', (t) => {
  const store = new BridgeTokenStore(tmpFile(t), box());
  store.set('tcp://Tattlestone.local:35000', TOKEN);
  assert.equal(store.get('tcp://tattlestone.local:35000'), TOKEN);
  assert.equal(store.get('tcp://tattlestone.local'), TOKEN, 'the port defaults to 35000');
  assert.equal(store.get('tcp://192.168.1.33:35000'), null);
  assert.equal(store.has('tcp://tattlestone.local:35000'), true);
});

test('tokens are stored encrypted, the file private', (t) => {
  const file = tmpFile(t);
  new BridgeTokenStore(file, box()).set('tcp://10.0.0.5:35000', TOKEN);
  assert.ok(!fs.readFileSync(file, 'utf8').includes(TOKEN));
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});

test('without a real keychain the token is kept in plaintext rather than lost', (t) => {
  const store = new BridgeTokenStore(tmpFile(t), box(false));
  store.set('tcp://10.0.0.5:35000', TOKEN);
  assert.equal(store.get('tcp://10.0.0.5:35000'), TOKEN);
});

test('clearing forgets the token; an undecryptable one reads as none', (t) => {
  const file = tmpFile(t);
  const store = new BridgeTokenStore(file, box());
  store.set('tcp://10.0.0.5:35000', TOKEN);
  store.set('tcp://10.0.0.5:35000', null);
  assert.equal(store.get('tcp://10.0.0.5:35000'), null);
  assert.equal(store.has('tcp://10.0.0.5:35000'), false);

  store.set('tcp://10.0.0.5:35000', TOKEN);
  const broken = new BridgeTokenStore(file, { ...box(), decrypt: () => { throw new Error('keychain denied'); } });
  assert.equal(broken.get('tcp://10.0.0.5:35000'), null);
});

test('bad tokens and addresses are refused', (t) => {
  const store = new BridgeTokenStore(tmpFile(t), box());
  assert.throws(() => store.set('tcp://10.0.0.5:35000', 'short'), /at least 16/);
  assert.throws(() => store.set('tcp://10.0.0.5:35000', 'has a space in the middle'), /no spaces/);
  assert.throws(() => store.set('/dev/cu.OBDLink', TOKEN), /Not a network adapter/);
  assert.equal(isValidToken(TOKEN), true);
  assert.equal(isValidToken(42), false);
  assert.equal(tokenKey('SIMULATOR'), null);
});

test('an unreadable token file counts as no tokens', (t) => {
  const file = tmpFile(t);
  fs.writeFileSync(file, '{not json');
  assert.equal(new BridgeTokenStore(file, box()).get('tcp://10.0.0.5:35000'), null);
});
