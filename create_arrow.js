const fs = require('fs');
const buffer = Buffer.from(fs.readFileSync('arrow_base64.txt', 'utf-8'), 'base64');
fs.writeFileSync('arrow.png', buffer);
console.log('Arrow asset created.');