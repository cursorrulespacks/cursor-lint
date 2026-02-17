const fs = require('fs');
const path = require('path');

const VAGUE_PATTERNS = [
  'write clean code',
  'follow best practices',
  'be consistent',
  'write maintainable code',
  'handle errors properly',
  'use proper naming',
  'keep it simple',
  'write readable code',
  'follow conventions',
  'use good patterns',
  'write efficient code',
  'be careful',
  'think before coding',
  'write good tests',
  'follow solid principles',
  'use common sense',
  'write quality code',
  'follow the style guide',
  'be thorough',
  'write robust code',
  'use good naming',
  'be helpful',
  'use appropriate patterns',
  'be concise',
];

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { found: false, data: null, error: null };

  try {
    const data = {};
    const lines = match[1].split('\n');
    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const rawVal = line.slice(colonIdx + 1).trim();
      // Check for bad indentation (key starts with space = likely nested/broken YAML)
      if (line.match(/^\s+\S/) && !line.match(/^\s+-/)) {
        // Indented non-list line where we don't expect it
        const prevLine = lines[lines.indexOf(line) - 1];
        if (prevLine && !prevLine.endsWith(':')) {
          return { found: true, data: null, error: 'Invalid YAML indentation' };
        }
      }
      if (rawVal === 'true') data[key] = true;
      else if (rawVal === 'false') data[key] = false;
      else if (rawVal.startsWith('"') && rawVal.endsWith('"')) data[key] = rawVal.slice(1, -1);
      else data[key] = rawVal;
    }
    return { found: true, data, error: null };
  } catch (e) {
    return { found: true, data: null, error: e.message };
  }
}

async function lintMdcFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const issues = [];

  const fm = parseFrontmatter(content);

  if (!fm.found) {
    issues.push({ severity: 'error', message: 'Missing YAML frontmatter', hint: 'Add --- block with description and alwaysApply: true' });
  } else if (fm.error) {
    issues.push({ severity: 'error', message: `YAML frontmatter error: ${fm.error}`, hint: 'Fix frontmatter indentation/syntax' });
  } else {
    if (!fm.data.alwaysApply) {
      issues.push({ severity: 'error', message: 'Missing alwaysApply: true', hint: 'Add alwaysApply: true to frontmatter for agent mode' });
    }
    if (!fm.data.description) {
      issues.push({ severity: 'warning', message: 'Missing description in frontmatter', hint: 'Add a description so Cursor knows when to apply this rule' });
    }
    if (fm.data.globs && typeof fm.data.globs === 'string' && fm.data.globs.includes(',')) {
      issues.push({ severity: 'error', message: 'Globs should be YAML array, not comma-separated string', hint: 'Use globs:\\n  - "*.ts"\\n  - "*.tsx"' });
    }
  }

  // Vague rules
  const contentLower = content.toLowerCase();
  for (const pattern of VAGUE_PATTERNS) {
    const idx = contentLower.indexOf(pattern);
    if (idx !== -1) {
      const lineNum = content.slice(0, idx).split('\n').length;
      issues.push({ severity: 'warning', message: `Vague rule detected: "${pattern}"`, line: lineNum });
    }
  }

  return { file: filePath, issues };
}

async function lintCursorrules(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const issues = [];

  issues.push({
    severity: 'warning',
    message: '.cursorrules may be ignored in agent mode',
    hint: 'Use .cursor/rules/*.mdc with alwaysApply: true for agent mode compatibility',
  });

  // Vague rules
  const contentLower = content.toLowerCase();
  for (const pattern of VAGUE_PATTERNS) {
    const idx = contentLower.indexOf(pattern);
    if (idx !== -1) {
      const lineNum = content.slice(0, idx).split('\n').length;
      issues.push({ severity: 'warning', message: `Vague rule detected: "${pattern}"`, line: lineNum });
    }
  }

  return { file: filePath, issues };
}

async function lintProject(dir) {
  const results = [];

  const cursorrules = path.join(dir, '.cursorrules');
  if (fs.existsSync(cursorrules)) {
    results.push(await lintCursorrules(cursorrules));
  }

  const rulesDir = path.join(dir, '.cursor', 'rules');
  if (fs.existsSync(rulesDir) && fs.statSync(rulesDir).isDirectory()) {
    for (const entry of fs.readdirSync(rulesDir)) {
      if (entry.endsWith('.mdc')) {
        results.push(await lintMdcFile(path.join(rulesDir, entry)));
      }
    }
  }

  if (results.length === 0) {
    results.push({
      file: dir,
      issues: [{ severity: 'warning', message: 'No Cursor rules found in this directory' }],
    });
  }

  return results;
}

module.exports = { lintProject, lintMdcFile, lintCursorrules };
