const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8');
let count = 0;

// Exclude top-of-page header elements
const excludePatterns = [
  'satsport_logo_header',
  'collapse-menu',
  'rotate-icon',
  'header-user-icon',
  'finalwelcomegif'
];

const newHtml = html.replace(/<img\s+([^>]+)>/gi, (match, attrs) => {
  if (/loading=/i.test(attrs)) return match;
  for (const ex of excludePatterns) {
    if (attrs.includes(ex)) return match;
  }
  count++;
  return `<img loading="lazy" decoding="async" ${attrs}>`;
});

console.log(`Images converted to loading="lazy" decoding="async": ${count}`);
fs.writeFileSync('index.html', newHtml, 'utf8');
console.log('Successfully updated index.html');
