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
];

const MAX_LINES_WARNING = 150;
const MAX_LINES_ERROR = 300;

function parseMdcFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const frontmatter = {};
  const lines = match[1].split('\n');
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (value === 'true') frontmatter[key] = true;
    else if (value === 'false') frontmatter[key] = false;
    else frontmatter[key] = value;
  }
  return frontmatter;
}

function lintFile(filePath, content) {
  const issues = [];
  const fileName = path.basename(filePath);
  const ext = path.extname(filePath);
  const lines = content.split('\n');
  const lineCount = lines.length;

  // .cursorrules agent mode warning
  if (fileName === '.cursorrules') {
    issues.push({
      type: 'warning',
      message: '.cursorrules may be ignored in agent mode',
      hint: 'Use .cursor/rules/*.mdc with alwaysApply: true for agent mode compatibility',
    });
  }

  // .mdc-specific checks
  if (ext === '.mdc') {
    const frontmatter = parseMdcFrontmatter(content);

    if (!frontmatter) {
      issues.push({
        type: 'error',
        message: 'Missing YAML frontmatter',
        hint: 'Add --- block with description and alwaysApply: true',
      });
    } else {
      if (!frontmatter.alwaysApply) {
        issues.push({
          type: 'error',
          message: 'Missing alwaysApply: true',
          hint: 'Add alwaysApply: true to frontmatter for agent mode',
        });
      }
      if (!frontmatter.description) {
        issues.push({
          type: 'warning',
          message: 'Missing description in frontmatter',
          hint: 'Add a description so Cursor knows when to apply this rule',
        });
      }
      // Bad glob syntax
      if (frontmatter.globs && typeof frontmatter.globs === 'string') {
        if (frontmatter.globs.includes(',') && !frontmatter.globs.startsWith('[')) {
          issues.push({
            type: 'error',
            message: 'Bad glob syntax: use YAML array, not comma-separated string',
            hint: 'Use globs:\\n  - "*.ts"\\n  - "*.tsx"',
          });
        }
      }
    }
  }

  // Vague rule detection
  const contentLower = content.toLowerCase();
  for (const pattern of VAGUE_PATTERNS) {
    const idx = contentLower.indexOf(pattern);
    if (idx !== -1) {
      const lineNum = content.slice(0, idx).split('\n').length;
      issues.push({
        type: 'warning',
        message: `Vague rule detected: "${pattern}"`,
        line: lineNum,
      });
    }
  }

  // File length
  if (lineCount > MAX_LINES_ERROR) {
    issues.push({
      type: 'error',
      message: `File is ${lineCount} lines (max recommended: ${MAX_LINES_WARNING})`,
      hint: 'Long files may exceed context window. Split into multiple .mdc files.',
    });
  } else if (lineCount > MAX_LINES_WARNING) {
    issues.push({
      type: 'warning',
      message: `File is ${lineCount} lines — consider splitting`,
      hint: 'Shorter files are more reliably loaded into context.',
    });
  }

  return issues;
}

function findRuleFiles(dir) {
  const files = [];

  // Check .cursorrules in root
  const cursorrules = path.join(dir, '.cursorrules');
  if (fs.existsSync(cursorrules)) {
    files.push(cursorrules);
  }

  // Check .cursor/rules/
  const rulesDir = path.join(dir, '.cursor', 'rules');
  if (fs.existsSync(rulesDir) && fs.statSync(rulesDir).isDirectory()) {
    const entries = fs.readdirSync(rulesDir);
    for (const entry of entries) {
      if (entry.endsWith('.mdc')) {
        files.push(path.join(rulesDir, entry));
      }
    }
  }

  return files;
}

function lint(dir) {
  const files = findRuleFiles(dir);
  const results = [];

  if (files.length === 0) {
    return { files: [], totalErrors: 0, totalWarnings: 0, totalPassed: 0, noFiles: true };
  }

  let totalErrors = 0;
  let totalWarnings = 0;
  let totalPassed = 0;

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const issues = lintFile(filePath, content);
    const errors = issues.filter(i => i.type === 'error').length;
    const warnings = issues.filter(i => i.type === 'warning').length;

    if (issues.length === 0) totalPassed++;
    totalErrors += errors;
    totalWarnings += warnings;

    results.push({
      file: path.relative(dir, filePath),
      issues,
      errors,
      warnings,
    });
  }

  return { files: results, totalErrors, totalWarnings, totalPassed, noFiles: false };
}

module.exports = { lint, lintFile, findRuleFiles };
