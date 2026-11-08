import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { SharedRateLimiter } from '../app/lib/sharedRateLimit.server';

const run = promisify(execFile);
test('request windows survive worker changes and reset at the exact boundary', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'clinic-limit-'));
  const file = path.join(root, 'limit.sqlite');
  const a = new SharedRateLimiter(file, 8, 60_000);
  const b = new SharedRateLimiter(file, 8, 60_000);
  try {
    for (let i = 0; i < 8; i++) assert.equal((i % 2 ? a : b).consume('same-client', 100_000), false);
    assert.equal(b.consume('same-client', 159_999), true);
    assert.equal(a.consume('another-client', 159_999), false);
    assert.equal(b.consume('same-client', 160_000), false);
  } finally { a.close(); b.close(); rmSync(root, { recursive: true, force: true }); }
});

test('simultaneous independent processes cannot exceed the shared request budget', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'clinic-workers-'));
  const file = path.join(root, 'limit.sqlite');
  new SharedRateLimiter(file, 8, 60_000).close();
  try {
    const source = `import { SharedRateLimiter } from './app/lib/sharedRateLimit.server.ts'; const limiter = new SharedRateLimiter(${JSON.stringify(file)},8,60000); console.log(limiter.consume('shared-client')); limiter.close();`;
    const results = await Promise.all(Array.from({ length: 12 }, () => run(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', source])));
    assert.equal(results.filter((result) => result.stdout.trim() === 'false').length, 8);
    assert.equal(results.filter((result) => result.stdout.trim() === 'true').length, 4);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
