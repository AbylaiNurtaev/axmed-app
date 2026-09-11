const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { fixSource, patchInstalledFmdb } = require('../scripts/patch-fmdb-ios.cjs');
const { addFmdbHook } = require('../plugins/with-fmdb-system-header.js');

test('backports only the system import and preserves line endings', () => {
  for (const eol of ['\n', '\r\n']) {
    const source = ['#import "FMResultSet.h"', '#import "FMDatabase.h"', '#import "unistd.h"', ''].join(eol);
    const patched = fixSource(source);
    assert.equal(patched, source.replace('"unistd.h"', '<unistd.h>'));
    assert.equal(fixSource(patched), patched);
  }
});

test('unexpected or duplicate imports fail instead of silently continuing', () => {
  assert.throws(() => fixSource('#import "different.h"\n'), /Unexpected FMDB/);
  assert.throws(() => fixSource('#import "unistd.h"\n#import "unistd.h"\n'), /Unexpected FMDB/);
  assert.throws(() => fixSource('#import "unistd.h"\n#import <unistd.h>\n'), /Unexpected FMDB/);
});

test('CocoaPods hook is idempotent and preserves React Native setup', () => {
  const podfile = "target 'AxMed' do\n  post_install do |installer|\n    react_native_post_install(installer)\n  end\nend\n";
  const patched = addFmdbHook(podfile);
  assert.equal(addFmdbHook(patched), patched);
  assert.equal(patched.match(/patch-fmdb-ios.cjs/g).length, 1);
  assert.ok(patched.includes('react_native_post_install(installer)'));
  assert.ok(patched.indexOf('patch-fmdb-ios.cjs') > patched.indexOf('post_install do |installer|'));
  assert.throws(() => addFmdbHook("target 'ChangedTemplate' do\nend\n"), /Failed to match/);
});

test('both installed sources are patched once; read-only modes are restored', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'axmed-fmdb-test-'));
  const sourceDir = path.join(temporaryRoot, 'Pods', 'FMDB', 'src', 'fmdb');
  const targets = ['FMDatabase.m', 'FMResultSet.m'].map(name => path.join(sourceDir, name));
  try {
    fs.mkdirSync(sourceDir, { recursive: true });
    for (const target of targets) {
      fs.writeFileSync(target, '#import "unistd.h"\n');
      fs.chmodSync(target, 0o444);
    }
    const modes = targets.map(target => fs.statSync(target).mode);
    assert.equal(patchInstalledFmdb(temporaryRoot), 2);
    targets.forEach((target, i) => {
      assert.equal(fs.readFileSync(target, 'utf8'), '#import <unistd.h>\n');
      assert.equal(fs.statSync(target).mode, modes[i]);
    });
    assert.equal(patchInstalledFmdb(temporaryRoot), 0);
  } finally {
    for (const target of targets) if (fs.existsSync(target)) fs.chmodSync(target, 0o644);
    fs.rmSync(temporaryRoot, { recursive: true });
  }
});

test('missing second source is caught before patching the first', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'axmed-fmdb-test-'));
  const sourceDir = path.join(temporaryRoot, 'Pods', 'FMDB', 'src', 'fmdb');
  const target = path.join(sourceDir, 'FMDatabase.m');
  try {
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(target, '#import "unistd.h"\n');
    assert.throws(() => patchInstalledFmdb(temporaryRoot), /ENOENT/);
    assert.equal(fs.readFileSync(target, 'utf8'), '#import "unistd.h"\n');
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true });
  }
});

test('additional legacy import is detected before any source is changed', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'axmed-fmdb-test-'));
  const sourceDir = path.join(temporaryRoot, 'Pods', 'FMDB', 'src', 'fmdb');
  try {
    fs.mkdirSync(sourceDir, { recursive: true });
    for (const name of ['FMDatabase.m', 'FMResultSet.m', 'Extra.m']) {
      fs.writeFileSync(path.join(sourceDir, name), '#import "unistd.h"\n');
    }
    assert.throws(() => patchInstalledFmdb(temporaryRoot), /Uncovered FMDB system import in Extra.m/);
    for (const name of ['FMDatabase.m', 'FMResultSet.m']) {
      assert.equal(fs.readFileSync(path.join(sourceDir, name), 'utf8'), '#import "unistd.h"\n');
    }
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true });
  }
});
