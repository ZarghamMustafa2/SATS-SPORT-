const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');
const lines = html.split('\n');

console.log('--- SETINTERVAL CALLS IN INDEX.HTML ---');
lines.forEach((line, i) => {
  if (line.includes('setInterval(')) {
    console.log(`Line ${i + 1}: ${line.trim()}`);
  }
});

console.log('\n--- FETCH CALLS IN INDEX.HTML ---');
lines.forEach((line, i) => {
  if (line.includes('fetch(')) {
    console.log(`Line ${i + 1}: ${line.trim()}`);
  }
});
