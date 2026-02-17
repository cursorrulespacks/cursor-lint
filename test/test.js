const { lintProject, lintMdcFile, lintCursorrules } = require('../src/index');
const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, 'fixtures');

// Setup test fixtures
function setup() {
  // Clean up
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true });
  }
  
  // Create test directories
  fs.mkdirSync(path.join(TEST_DIR, '.cursor', 'rules'), { recursive: true });
}

// Test cases
const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

async function runTests() {
  console.log('\n🧪 Running cursor-lint tests\n');
  
  let passed = 0;
  let failed = 0;
  
  for (const t of tests) {
    try {
      setup();
      await t.fn();
      console.log(`  ✓ ${t.name}`);
      passed++;
    } catch (err) {
      console.log(`  ✗ ${t.name}`);
      console.log(`    Error: ${err.message}`);
      failed++;
    }
  }
  
  // Cleanup
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true });
  }
  
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

// Helper
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// ============ TESTS ============

test('detects missing alwaysApply in .mdc file', async () => {
  const mdcPath = path.join(TEST_DIR, '.cursor', 'rules', 'test.mdc');
  fs.writeFileSync(mdcPath, `---
description: Test rule
---

# Test Rule
Do something specific.
`);
  
  const result = await lintMdcFile(mdcPath);
  const hasError = result.issues.some(i => 
    i.severity === 'error' && i.message.includes('alwaysApply')
  );
  assert(hasError, 'Should detect missing alwaysApply');
});

test('passes valid .mdc file with alwaysApply', async () => {
  const mdcPath = path.join(TEST_DIR, '.cursor', 'rules', 'good.mdc');
  fs.writeFileSync(mdcPath, `---
description: Good rule
alwaysApply: true
---

# Good Rule
When creating async functions, return Result types.
`);
  
  const result = await lintMdcFile(mdcPath);
  const errors = result.issues.filter(i => i.severity === 'error');
  assert(errors.length === 0, `Should have no errors, got: ${errors.map(e => e.message).join(', ')}`);
});

test('detects vague rules', async () => {
  const mdcPath = path.join(TEST_DIR, '.cursor', 'rules', 'vague.mdc');
  fs.writeFileSync(mdcPath, `---
description: Vague rule
alwaysApply: true
---

# Code Standards
Write clean code and follow best practices.
`);
  
  const result = await lintMdcFile(mdcPath);
  const vagueWarnings = result.issues.filter(i => 
    i.message.includes('Vague rule')
  );
  assert(vagueWarnings.length >= 2, 'Should detect multiple vague phrases');
});

test('warns about .cursorrules in agent mode', async () => {
  const rulesPath = path.join(TEST_DIR, '.cursorrules');
  fs.writeFileSync(rulesPath, `# Rules
Use TypeScript strictly.
`);
  
  const result = await lintCursorrules(rulesPath);
  const agentWarning = result.issues.some(i => 
    i.message.includes('agent mode')
  );
  assert(agentWarning, 'Should warn about agent mode');
});

test('detects invalid YAML frontmatter', async () => {
  const mdcPath = path.join(TEST_DIR, '.cursor', 'rules', 'bad-yaml.mdc');
  fs.writeFileSync(mdcPath, `---
description: Bad YAML
  invalid: indentation
---

# Rule
`);
  
  const result = await lintMdcFile(mdcPath);
  const yamlError = result.issues.some(i => 
    i.severity === 'error' && i.message.includes('YAML')
  );
  assert(yamlError, 'Should detect YAML error');
});

test('detects missing frontmatter entirely', async () => {
  const mdcPath = path.join(TEST_DIR, '.cursor', 'rules', 'no-frontmatter.mdc');
  fs.writeFileSync(mdcPath, `# Rule Without Frontmatter
Do something.
`);
  
  const result = await lintMdcFile(mdcPath);
  const missingFrontmatter = result.issues.some(i => 
    i.severity === 'error' && i.message.includes('Missing YAML frontmatter')
  );
  assert(missingFrontmatter, 'Should detect missing frontmatter');
});

test('warns about long files', async () => {
  const mdcPath = path.join(TEST_DIR, '.cursor', 'rules', 'long.mdc');
  const longContent = `---
description: Long file
alwaysApply: true
---

# Long File
` + 'Line of content.\n'.repeat(250);
  
  fs.writeFileSync(mdcPath, longContent);
  
  const result = await lintMdcFile(mdcPath);
  const lengthWarning = result.issues.some(i => 
    i.message.includes('long')
  );
  assert(lengthWarning, 'Should warn about file length');
});

test('detects bad glob syntax', async () => {
  const mdcPath = path.join(TEST_DIR, '.cursor', 'rules', 'bad-glob.mdc');
  fs.writeFileSync(mdcPath, `---
description: Bad glob
alwaysApply: true
globs: "*.ts, *.tsx"
---

# Rule
`);
  
  const result = await lintMdcFile(mdcPath);
  const globError = result.issues.some(i => 
    i.severity === 'error' && i.message.includes('Globs')
  );
  assert(globError, 'Should detect bad glob syntax');
});

test('lintProject finds no rules', async () => {
  const emptyDir = path.join(TEST_DIR, 'empty');
  fs.mkdirSync(emptyDir, { recursive: true });
  
  const results = await lintProject(emptyDir);
  const noRulesWarning = results.some(r => 
    r.issues.some(i => i.message.includes('No Cursor rules found'))
  );
  assert(noRulesWarning, 'Should warn when no rules found');
});

test('lintProject scans both .cursorrules and .mdc files', async () => {
  // Create .cursorrules
  fs.writeFileSync(path.join(TEST_DIR, '.cursorrules'), '# Rules');
  
  // Create .mdc
  fs.writeFileSync(path.join(TEST_DIR, '.cursor', 'rules', 'test.mdc'), `---
description: Test
alwaysApply: true
---
# Test
`);
  
  const results = await lintProject(TEST_DIR);
  assert(results.length === 2, `Should find 2 files, found ${results.length}`);
});

// Run
runTests();
