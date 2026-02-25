const fs = require('fs');
const path = require('path');

function addFrontmatter(content, filePath) {
  const name = path.basename(filePath, '.mdc');
  const frontmatter = `---
description: ${name} rules
alwaysApply: true
---
`;
  return { fixed: frontmatter + content, changes: ['Added YAML frontmatter with alwaysApply: true'] };
}

function addAlwaysApply(content) {
  // Insert alwaysApply: true after the first ---
  const match = content.match(/^(---\n)([\s\S]*?)(---)/);
  if (!match) return { fixed: content, changes: [] };
  
  const frontmatterBody = match[2];
  if (frontmatterBody.includes('alwaysApply')) return { fixed: content, changes: [] };
  
  const newFm = match[1] + 'alwaysApply: true\n' + frontmatterBody + match[3];
  const rest = content.slice(match[0].length);
  return { fixed: newFm + rest, changes: ['Added alwaysApply: true to frontmatter'] };
}

function addDescription(content, filePath) {
  const match = content.match(/^(---\n)([\s\S]*?)(---)/);
  if (!match) return { fixed: content, changes: [] };
  
  const frontmatterBody = match[2];
  if (frontmatterBody.includes('description')) return { fixed: content, changes: [] };
  
  const name = path.basename(filePath, '.mdc');
  const newFm = match[1] + `description: ${name} rules\n` + frontmatterBody + match[3];
  const rest = content.slice(match[0].length);
  return { fixed: newFm + rest, changes: [`Added description: "${name} rules" to frontmatter`] };
}

async function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  const allChanges = [];

  // Check if frontmatter exists
  const hasFm = content.match(/^---\n[\s\S]*?\n---/);
  
  if (!hasFm) {
    const result = addFrontmatter(content, filePath);
    content = result.fixed;
    allChanges.push(...result.changes);
  } else {
    // Fix missing alwaysApply
    const r1 = addAlwaysApply(content);
    if (r1.changes.length) {
      content = r1.fixed;
      allChanges.push(...r1.changes);
    }
    
    // Fix missing description
    const r2 = addDescription(content, filePath);
    if (r2.changes.length) {
      content = r2.fixed;
      allChanges.push(...r2.changes);
    }
  }

  if (allChanges.length > 0) {
    fs.writeFileSync(filePath, content, 'utf-8');
  }

  return { file: filePath, changes: allChanges };
}

async function fixProject(dir) {
  const results = [];
  const rulesDir = path.join(dir, '.cursor', 'rules');
  
  if (fs.existsSync(rulesDir) && fs.statSync(rulesDir).isDirectory()) {
    for (const entry of fs.readdirSync(rulesDir)) {
      if (entry.endsWith('.mdc')) {
        results.push(await fixFile(path.join(rulesDir, entry)));
      }
    }
  }

  return results;
}

module.exports = { fixProject, fixFile };
