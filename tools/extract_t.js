// Prints the studio-type copy (const T in index.html) as JSON, so the studio pages use the same words.
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const a = src.indexOf('const T = {');
const b = src.indexOf('const $ = id', a);
const body = src.slice(a, b).replace('const T =', 'module.exports =');
const m = { exports: {} }; new Function('module', body)(m);
process.stdout.write(JSON.stringify(m.exports));
