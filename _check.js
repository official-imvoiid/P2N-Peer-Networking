// Quick syntax check for main.js and preload.js
const fs = require('fs');
const vm = require('vm');

['electron/main.js', 'electron/preload.js'].forEach(f => {
  try {
    const code = fs.readFileSync(f, 'utf8');
    new vm.Script(code, { filename: f });
    console.log(f + ': SYNTAX OK');
  } catch (e) {
    console.log(f + ': SYNTAX ERROR at line ' + (e.lineNumber || '?') + ': ' + e.message);
  }
});
console.log('Done');
