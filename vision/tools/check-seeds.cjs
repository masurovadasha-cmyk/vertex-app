'use strict';
const fs = require('node:fs');
const path = require('node:path');
// Heuristic guard, not a general secret scanner. Keep comments in the input:
// a credential in a comment is still a credential committed to Git.
function containsSensitiveValue(text) {
  return /(?:password|secret|door[ _-]?codes?|passport)["']?\s*[:=]\s*["']?\S|[A-Z0-9._%+-]+@(gmail|mail|yahoo)\./i.test(text);
}
module.exports = { containsSensitiveValue };
if (require.main === module) {
  for (const name of fs.readdirSync('vision/database/seeds')) {
    const file = path.join('vision/database/seeds', name);
    if (fs.statSync(file).isFile() && containsSensitiveValue(fs.readFileSync(file, 'utf8'))) {
      throw new Error(`Potential sensitive value in ${file}; content withheld`);
    }
  }
  console.log('PASS demo seed value guard');
}
