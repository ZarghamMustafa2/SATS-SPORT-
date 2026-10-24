const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const sportsHandler = require('../api/sports/index');

// Start a lightweight local server for verification
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, 'http://localhost:3000');
  
  if (parsedUrl.pathname.startsWith('/api/sports')) {
    return sportsHandler(req, res);
  }

  // Serve static files
  let filePath = parsedUrl.pathname === '/' ? '/index.html' : parsedUrl.pathname;
  let fullPath = path.join(__dirname, '..', filePath);
  
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    let ext = path.extname(fullPath).toLowerCase();
    let mimeTypes = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml'
    };
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    fs.createReadStream(fullPath).pipe(res);
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

async function run() {
  await new Promise((resolve) => server.listen(3456, resolve));
  console.log('Local test server running on http://localhost:3456');

  const browser = await chromium.launch({ headless: true });

  const viewports = [
    { name: 'Mobile 375px', width: 375, height: 667 },
    { name: 'Mobile 390px', width: 390, height: 844 },
    { name: 'Mobile 414px', width: 414, height: 896 },
    { name: 'Desktop 1280px', width: 1280, height: 800 }
  ];

  for (const vp of viewports) {
    console.log(`\n--- Testing ${vp.name} ---`);
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', err => errors.push(err.message));

    await page.goto('http://localhost:3456/', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    // Check page horizontal overflow
    const hasHOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    console.log(`Page horizontal overflow: ${hasHOverflow ? 'YES (BAD)' : 'NO (PASSED)'}`);

    // Check sports pill row
    const pillRow = page.locator('.mobile-sports-pills-row, .sports-filter-pills, .sports-categories-scroll').first();
    const pillCount = await page.locator('.mobile-sports-pill, .sport-filter-pill').count();
    console.log(`Sports pills rendered: ${pillCount}`);

    // Check cricket section or feed state
    const bodyText = await page.evaluate(() => document.body.innerText);
    const hasCricketTab = bodyText.includes('Cricket');
    console.log(`Cricket tab present: ${hasCricketTab ? 'YES' : 'NO'}`);

    console.log(`Console errors count: ${errors.length}`);
    if (errors.length > 0) {
      console.log('Sample errors:', errors.slice(0, 3));
    }

    await page.close();
  }

  await browser.close();
  server.close();
  console.log('\nAll viewport tests completed successfully!');
}

run().catch(err => {
  console.error(err);
  server.close();
  process.exit(1);
});
