const { chromium } = require('playwright');
const https = require('https');
const fs = require('fs');

function measureApi(url) {
  return new Promise((resolve) => {
    const start = Date.now();
    https.get(url, (res) => {
      let bytes = 0;
      res.on('data', chunk => bytes += chunk.length);
      res.on('end', () => {
        resolve({
          url,
          status: res.statusCode,
          durationMs: Date.now() - start,
          bytes
        });
      });
    }).on('error', (err) => {
      resolve({ url, status: 500, durationMs: Date.now() - start, error: err.message, bytes: 0 });
    });
  });
}

async function measurePage(browser, options) {
  const { name, viewport, isMobile, throttleNetwork } = options;
  const context = await browser.newContext({
    viewport,
    isMobile: !!isMobile,
    userAgent: isMobile
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1'
      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  let requestCount = 0;
  let totalTransferredBytes = 0;
  const requestDetails = [];

  page.on('request', req => {
    requestCount++;
  });

  page.on('response', async res => {
    try {
      const headers = res.headers();
      const len = parseInt(headers['content-length'] || '0', 10);
      totalTransferredBytes += len;
      requestDetails.push({
        url: res.url(),
        status: res.status(),
        size: len,
        contentType: headers['content-type'] || ''
      });
    } catch(e) {}
  });

  if (throttleNetwork) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: (1.6 * 1024 * 1024) / 8, // 1.6 Mbps
      uploadThroughput: (750 * 1024) / 8,         // 750 kbps
      latency: 150                                // 150ms RTT
    });
  }

  console.log(`Starting ${name}...`);
  const startTime = Date.now();
  await page.goto('https://satsportco.vercel.app', { waitUntil: 'domcontentloaded', timeout: 30000 });
  console.log(`  DOM content loaded in ${Date.now() - startTime}ms. Observing for 5s...`);
  await page.waitForTimeout(5000);
  const totalObservedTime = Date.now() - startTime;

  const perfMetrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {};
    const paint = performance.getEntriesByType('paint') || [];
    const fcpEntry = paint.find(p => p.name === 'first-contentful-paint');

    return new Promise((resolve) => {
      let lcp = 0;
      let cls = 0;

      try {
        const lcpObserver = new PerformanceObserver((entryList) => {
          const entries = entryList.getEntries();
          if (entries.length > 0) {
            lcp = entries[entries.length - 1].startTime;
          }
        });
        lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
      } catch (e) {}

      try {
        const clsObserver = new PerformanceObserver((entryList) => {
          for (const entry of entryList.getEntries()) {
            if (!entry.hadRecentInput) {
              cls += entry.value;
            }
          }
        });
        clsObserver.observe({ type: 'layout-shift', buffered: true });
      } catch (e) {}

      setTimeout(() => {
        resolve({
          ttfb: nav.responseStart ? (nav.responseStart - nav.requestStart) : 0,
          domContentLoaded: nav.domContentLoadedEventEnd ? (nav.domContentLoadedEventEnd - nav.startTime) : 0,
          fullLoad: nav.loadEventEnd ? (nav.loadEventEnd - nav.startTime) : 0,
          fcp: fcpEntry ? fcpEntry.startTime : 0,
          lcp: lcp || (fcpEntry ? fcpEntry.startTime : 0),
          cls: cls,
          domInteractive: nav.domInteractive || 0,
          transferSize: nav.transferSize || 0
        });
      }, 500);
    });
  });

  await context.close();

  return {
    name,
    perfMetrics,
    requestCount,
    totalTransferredBytes,
    totalObservedTime,
    requestDetails
  };
}

async function runBenchmark() {
  console.log('================================================================');
  console.log('       SATS SPORT PHASE 25 - PRODUCTION BENCHMARK (AFTER)       ');
  console.log('================================================================');
  console.log('Target: https://satsportco.vercel.app');
  console.log('Timestamp:', new Date().toISOString(), '\n');

  console.log('--- 1. API RESPONSE TIMES (Direct) ---');
  const apiUrls = [
    'https://satsportco.vercel.app/api/sports?action=allmatches&sport=cricket',
    'https://satsportco.vercel.app/api/sports?action=allmatches&sport=soccer',
    'https://satsportco.vercel.app/api/sports?action=allmatches&sport=tennis',
    'https://satsportco.vercel.app/api/sports?action=fetchmatch&sport=cricket&match=640154297',
    'https://satsportco.vercel.app/api/auth/me'
  ];

  const apiResults = [];
  for (const url of apiUrls) {
    const res = await measureApi(url);
    apiResults.push(res);
    console.log(`Endpoint: ${url.replace('https://satsportco.vercel.app', '')}`);
    console.log(`  Status: ${res.status} | Latency: ${res.durationMs}ms | Size: ${(res.bytes / 1024).toFixed(2)} KB`);
  }

  console.log('\n--- 2. BROWSER PERFORMANCE METRICS ---');
  const browser = await chromium.launch({ headless: true });

  const desktop = await measurePage(browser, {
    name: 'Desktop (1280x800, Unthrottled)',
    viewport: { width: 1280, height: 800 },
    isMobile: false,
    throttleNetwork: false
  });

  const mobile = await measurePage(browser, {
    name: 'Mobile (375x667, Unthrottled)',
    viewport: { width: 375, height: 667 },
    isMobile: true,
    throttleNetwork: false
  });

  const mobileThrottled = await measurePage(browser, {
    name: 'Mobile (375x667, Throttled 4G 1.6Mbps/150ms)',
    viewport: { width: 375, height: 667 },
    isMobile: true,
    throttleNetwork: true
  });

  await browser.close();

  const printSummary = (res) => {
    console.log(`\n[${res.name}]`);
    console.log(`  TTFB:             ${res.perfMetrics.ttfb.toFixed(1)} ms`);
    console.log(`  FCP:              ${res.perfMetrics.fcp.toFixed(1)} ms`);
    console.log(`  LCP:              ${res.perfMetrics.lcp.toFixed(1)} ms`);
    console.log(`  CLS:              ${res.perfMetrics.cls.toFixed(4)}`);
    console.log(`  DOMContentLoaded: ${res.perfMetrics.domContentLoaded.toFixed(1)} ms`);
    console.log(`  Full Load:        ${res.perfMetrics.fullLoad.toFixed(1)} ms`);
    console.log(`  Total Requests:   ${res.requestCount} requests (during first 5s)`);
    console.log(`  Total Transferred: ${(res.totalTransferredBytes / 1024).toFixed(1)} KB`);
  };

  printSummary(desktop);
  printSummary(mobile);
  printSummary(mobileThrottled);

  const afterData = {
    timestamp: new Date().toISOString(),
    apiResults,
    desktop: {
      name: desktop.name,
      metrics: desktop.perfMetrics,
      requestCount: desktop.requestCount,
      totalTransferredBytes: desktop.totalTransferredBytes
    },
    mobile: {
      name: mobile.name,
      metrics: mobile.perfMetrics,
      requestCount: mobile.requestCount,
      totalTransferredBytes: mobile.totalTransferredBytes
    },
    mobileThrottled: {
      name: mobileThrottled.name,
      metrics: mobileThrottled.perfMetrics,
      requestCount: mobileThrottled.requestCount,
      totalTransferredBytes: mobileThrottled.totalTransferredBytes
    }
  };

  fs.writeFileSync('benchmark_after.json', JSON.stringify(afterData, null, 2));
  console.log('\nBenchmark data saved to benchmark_after.json successfully.');

  // Side-by-side comparison
  if (fs.existsSync('benchmark_before.json')) {
    const beforeData = JSON.parse(fs.readFileSync('benchmark_before.json', 'utf8'));
    console.log('\n================================================================');
    console.log('              BEFORE vs AFTER BENCHMARK COMPARISON              ');
    console.log('================================================================\n');

    console.log('--- API METRICS ---');
    beforeData.apiResults.forEach((bRes, i) => {
      const aRes = afterData.apiResults[i];
      const ep = bRes.url.replace('https://satsportco.vercel.app', '');
      const latDelta = ((aRes.durationMs - bRes.durationMs) / bRes.durationMs * 100).toFixed(1);
      const sizeDelta = ((aRes.bytes - bRes.bytes) / bRes.bytes * 100).toFixed(1);
      console.log(`${ep}:`);
      console.log(`  Latency: ${bRes.durationMs}ms -> ${aRes.durationMs}ms (${latDelta}%)`);
      console.log(`  Payload: ${(bRes.bytes / 1024).toFixed(1)} KB -> ${(aRes.bytes / 1024).toFixed(1)} KB (${sizeDelta}%)`);
    });

    const compareDevice = (label, beforeDev, afterDev) => {
      console.log(`\n--- ${label} ---`);
      const bM = beforeDev.metrics;
      const aM = afterDev.metrics;
      console.log(`  TTFB:             ${bM.ttfb.toFixed(1)}ms -> ${aM.ttfb.toFixed(1)}ms`);
      console.log(`  FCP:              ${bM.fcp.toFixed(1)}ms -> ${aM.fcp.toFixed(1)}ms`);
      console.log(`  LCP:              ${bM.lcp.toFixed(1)}ms -> ${aM.lcp.toFixed(1)}ms`);
      console.log(`  DOMContentLoaded: ${bM.domContentLoaded.toFixed(1)}ms -> ${aM.domContentLoaded.toFixed(1)}ms`);
      console.log(`  CLS:              ${bM.cls.toFixed(4)} -> ${aM.cls.toFixed(4)}`);
      console.log(`  Requests (5s):    ${beforeDev.requestCount} -> ${afterDev.requestCount} (${afterDev.requestCount - beforeDev.requestCount})`);
      console.log(`  Transferred:      ${(beforeDev.totalTransferredBytes / 1024).toFixed(1)} KB -> ${(afterDev.totalTransferredBytes / 1024).toFixed(1)} KB`);
    };

    compareDevice('DESKTOP (1280x800)', beforeData.desktop, afterData.desktop);
    compareDevice('MOBILE (375x667)', beforeData.mobile, afterData.mobile);
    compareDevice('MOBILE THROTTLED 4G', beforeData.mobileThrottled, afterData.mobileThrottled);
  }
}

runBenchmark().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
