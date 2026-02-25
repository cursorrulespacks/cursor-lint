const fs = require('fs');
const path = require('path');
const { lintProject, parseFrontmatter } = require('./index');
const { loadRules, findRedundancy } = require('./audit');

function fixFrontmatter(content) {
  const fm = parseFrontmatter(content);
  
  // No frontmatter at all — add minimal one
  if (!fm.found) {
    return `---\ndescription: \nalwaysApply: false\n---\n${content}`;
  }
  
  // Frontmatter has errors — try to repair
  if (fm.found && fm.error) {
    // Try to fix common YAML issues
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (match) {
      let yaml = match[1];
      // Fix missing spaces after colons
      yaml = yaml.replace(/^(\w+):([^\s])/gm, '$1: $2');
      // Fix inconsistent quoting
      yaml = yaml.replace(/globs:\s*\[([^\]]*)\]/g, (m, inner) => {
        const items = inner.split(',').map(i => {
          const trimmed = i.trim().replace(/^["']|["']$/g, '');
          return `"${trimmed}"`;
        });
        return `globs: [${items.join(', ')}]`;
      });
      return content.replace(/^---\n[\s\S]*?\n---/, `---\n${yaml}\n---`);
    }
  }
  
  return content;
}

function splitOversizedFile(filePath, maxTokens = 1500) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const tokens = Math.ceil(content.length / 4);
  
  if (tokens <= maxTokens) return null; // no split needed
  
  const fm = parseFrontmatter(content);
  const body = content.replace(/^---\n[\s\S]*?\n---\n?/, '');
  
  // Split by sections (## headers)
  const sections = body.split(/(?=^## )/m).filter(s => s.trim());
  
  if (sections.length <= 1) {
    // No sections to split on — split by paragraph
    const paragraphs = body.split(/\n\n+/).filter(p => p.trim());
    const mid = Math.ceil(paragraphs.length / 2);
    return {
      original: filePath,
      parts: [
        { body: paragraphs.slice(0, mid).join('\n\n'), suffix: '-part1' },
        { body: paragraphs.slice(mid).join('\n\n'), suffix: '-part2' },
      ],
      frontmatter: fm,
    };
  }
  
  // Group sections to stay under token limit
  const parts = [];
  let current = [];
  let currentTokens = 0;
  
  for (const section of sections) {
    const sectionTokens = Math.ceil(section.length / 4);
    if (currentTokens + sectionTokens > maxTokens && current.length > 0) {
      parts.push(current.join('\n'));
      current = [section];
      currentTokens = sectionTokens;
    } else {
      current.push(section);
      currentTokens += sectionTokens;
    }
  }
  if (current.length > 0) parts.push(current.join('\n'));
  
  return {
    original: filePath,
    parts: parts.map((body, i) => ({ body, suffix: `-part${i + 1}` })),
    frontmatter: fm,
  };
}

async function autoFix(dir, options = {}) {
  const results = { fixed: [], splits: [], deduped: [], errors: [] };
  const rulesDir = path.join(dir, '.cursor', 'rules');
  
  if (!fs.existsSync(rulesDir)) {
    results.errors.push('No .cursor/rules/ directory found');
    return results;
  }
  
  // 1. Fix broken frontmatter
  for (const entry of fs.readdirSync(rulesDir)) {
    if (!entry.endsWith('.mdc')) continue;
    const filePath = path.join(rulesDir, entry);
    const original = fs.readFileSync(filePath, 'utf-8');
    const fixed = fixFrontmatter(original);
    
    if (fixed !== original) {
      if (!options.dryRun) {
        fs.writeFileSync(filePath, fixed, 'utf-8');
      }
      results.fixed.push({ file: entry, change: 'frontmatter repaired' });
    }
  }
  
  // 2. Split oversized files
  if (options.split !== false) {
    for (const entry of fs.readdirSync(rulesDir)) {
      if (!entry.endsWith('.mdc')) continue;
      const filePath = path.join(rulesDir, entry);
      const split = splitOversizedFile(filePath, options.maxTokens || 1500);
      
      if (split && split.parts.length > 1) {
        const baseName = entry.replace('.mdc', '');
        
        if (!options.dryRun) {
          for (let i = 0; i < split.parts.length; i++) {
            const part = split.parts[i];
            const newName = `${baseName}${part.suffix}.mdc`;
            const newPath = path.join(rulesDir, newName);
            
            // Rebuild with original frontmatter
            let newContent = '';
            if (split.frontmatter.found && split.frontmatter.data) {
              const fmLines = [];
              for (const [k, v] of Object.entries(split.frontmatter.data)) {
                if (typeof v === 'boolean') fmLines.push(`${k}: ${v}`);
                else if (typeof v === 'string' && (v.startsWith('[') || v === 'true' || v === 'false')) fmLines.push(`${k}: ${v}`);
                else fmLines.push(`${k}: ${v}`);
              }
              newContent = `---\n${fmLines.join('\n')}\n---\n${part.body}`;
            } else {
              newContent = part.body;
            }
            
            fs.writeFileSync(newPath, newContent, 'utf-8');
          }
          // Remove original
          fs.unlinkSync(filePath);
        }
        
        results.splits.push({
          file: entry,
          parts: split.parts.map((p, i) => `${baseName}${p.suffix}.mdc`),
        });
      }
    }
  }
  
  // 3. Remove redundancy (just flag, don't auto-delete)
  const rules = loadRules(dir);
  const redundant = findRedundancy(rules);
  for (const r of redundant) {
    results.deduped.push({
      fileA: r.fileA,
      fileB: r.fileB,
      overlapPct: r.overlapPct,
      action: 'manual review needed — run `cursor-doctor audit` for details',
    });
  }
  
  return results;
}

module.exports = { autoFix, fixFrontmatter, splitOversizedFile };
