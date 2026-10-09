const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');
const imgs = html.match(/<img[^>]*>/gi) || [];
console.log('Total img tags in index.html:', imgs.length);

const withLazy = imgs.filter(i => /loading=["']lazy["']/i.test(i));
console.log('Img tags with loading="lazy":', withLazy.length);

const withoutLazy = imgs.filter(i => !/loading=["']lazy["']/i.test(i));
console.log('Img tags WITHOUT loading="lazy":', withoutLazy.length);

// Check casino and sidebar images
const sidebarImgs = imgs.filter(i => i.includes('casino') || i.includes('sidebar'));
console.log('Casino/sidebar img tags:', sidebarImgs.length);

// Check external CDN images
const cdnImgs = imgs.filter(i => i.includes('http://') || i.includes('https://'));
console.log('External CDN img tags:', cdnImgs.length);
