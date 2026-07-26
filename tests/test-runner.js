/**
 * Minimal test runner for Node.js (no dependencies).
 * Usage: node tests/test-runner.js
 *
 * Tests are ES modules imported dynamically.
 * Each test file exports a default function that receives { describe, it, assert }.
 */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname, posix } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Simple assert ─────────────────────────────────────────────────────
const assert = {
  equal(actual, expected, msg) {
    if (actual !== expected) throw new Error(msg ? `${msg} (expected ${expected}, got ${actual})` : `expected ${expected}, got ${actual}`);
  },
  strictEqual(a, e, m) { this.equal(a, e, m); },
  deepEqual(actual, expected, msg) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(msg ? `${msg}` : `deepEqual failed`);
  },
  ok(value, msg) {
    if (!value) throw new Error(msg || 'ok failed');
  },
  notOk(value, msg) {
    if (value) throw new Error(msg || 'notOk failed');
  },
  throws(fn, msg) {
    try { fn(); throw new Error(msg || 'Expected function to throw'); } catch (e) { if (e.message === 'Expected function to throw') throw new Error('Function did not throw'); }
  },
  approx(actual, expected, delta = 0.01, msg) {
    if (Math.abs(actual - expected) > delta) throw new Error(msg ? `${msg} (expected ~${expected}, got ${actual})` : `expected ~${expected}, got ${actual}`);
  }
};

// ── Results tracking ──────────────────────────────────────────────────
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
let failures = [];
let currentSuite = '';

function describe(name, fn) {
  currentSuite = name;
  fn();
}

function it(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
  } catch (e) {
    failedTests++;
    failures.push({ suite: currentSuite, test: name, error: e.message });
  }
}

// ── Run test files ────────────────────────────────────────────────────
const testFiles = readdirSync(__dirname).filter(f => f.startsWith('test_') && f.endsWith('.js'));

for (const file of testFiles) {
  const path = join(__dirname, file);
  try {
    const mod = await import(pathToFileURL(path).href);
    if (typeof mod.default === 'function') {
      await mod.default({ describe, it, assert });
    }
  } catch (e) {
    console.error(`Failed to load ${file}: ${e.message}`);
    failures.push({ suite: file, test: 'load', error: e.message });
    failedTests++;
    totalTests++;
  }
}

// ── Print results ─────────────────────────────────────────────────────
console.log('');
console.log('═'.repeat(60));
console.log(`  Tests: ${totalTests}  |  Passed: ${passedTests}  |  Failed: ${failedTests}`);
console.log('═'.repeat(60));

if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) {
    console.log(`  [${f.suite}] ${f.test}`);
    console.log(`    ${f.error}`);
  }
}

process.exit(failedTests > 0 ? 1 : 0);
