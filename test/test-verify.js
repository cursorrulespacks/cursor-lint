const { verifyProject, checkFile } = require('../src/verify');
const path = require('path');

async function runTests() {
  console.log('Testing verify functionality...\n');
  
  let passed = 0;
  let failed = 0;

  // Test 1: checkFile with antipattern
  {
    const violations = checkFile(
      'test.ts',
      'const x: any = 5;\nconsole.log(x);',
      [
        { antipattern: 'console\\.log', message: 'No console.log' },
        { antipattern: 'any', message: 'No any type' }
      ],
      'test.mdc'
    );
    
    if (violations.length === 2) {
      console.log('✓ Test 1: antipattern detection');
      passed++;
    } else {
      console.log(`✗ Test 1: expected 2 violations, got ${violations.length}`);
      failed++;
    }
  }

  // Test 2: checkFile with required
  {
    const violations = checkFile(
      'test.ts',
      'function foo() {}',
      [{ required: 'export', message: 'Must export' }],
      'test.mdc'
    );
    
    if (violations.length === 1 && violations[0].type === 'missing-required') {
      console.log('✓ Test 2: required string detection');
      passed++;
    } else {
      console.log(`✗ Test 2: expected missing-required violation`);
      failed++;
    }
  }

  // Test 3: checkFile with pattern
  {
    const violations = checkFile(
      'test.ts',
      'import { foo } from "./local"',
      [{ pattern: "from '@/", message: 'Use @/ imports' }],
      'test.mdc'
    );
    
    if (violations.length === 1 && violations[0].type === 'missing-pattern') {
      console.log('✓ Test 3: missing pattern detection');
      passed++;
    } else {
      console.log(`✗ Test 3: expected missing-pattern violation`);
      failed++;
    }
  }

  // Test 4: checkFile with forbidden
  {
    const violations = checkFile(
      'test.ts',
      '// TODO: fix this later',
      [{ forbidden: 'TODO', message: 'No TODOs' }],
      'test.mdc'
    );
    
    if (violations.length === 1 && violations[0].type === 'forbidden') {
      console.log('✓ Test 4: forbidden string detection');
      passed++;
    } else {
      console.log(`✗ Test 4: expected forbidden violation`);
      failed++;
    }
  }

  // Test 5: clean file passes
  {
    const violations = checkFile(
      'test.ts',
      'export function foo(): string { return "bar"; }',
      [
        { antipattern: 'console\\.log', message: 'No console.log' },
        { required: 'export', message: 'Must export' }
      ],
      'test.mdc'
    );
    
    if (violations.length === 0) {
      console.log('✓ Test 5: clean file passes');
      passed++;
    } else {
      console.log(`✗ Test 5: expected 0 violations, got ${violations.length}`);
      failed++;
    }
  }

  // Test 6: verifyProject with test-project
  {
    const testProjectPath = path.join(__dirname, '..', 'test-project');
    const results = await verifyProject(testProjectPath);
    
    if (results.stats.rulesWithVerify >= 1 && results.violations.length >= 1) {
      console.log('✓ Test 6: verifyProject finds violations');
      passed++;
    } else {
      console.log(`✗ Test 6: verifyProject didn't find expected violations`);
      failed++;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
