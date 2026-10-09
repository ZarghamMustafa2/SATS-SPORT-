const { chromium } = require('playwright');
const https = require('https');

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

  // Network tracking
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

  // Optional CDP Throttling (Regular 4G / Slow 4G: 1.6 Mbps download, 750 kbps upload, 150ms RTT)
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

  // Extract Web Vitals & Performance Timings from browser
  const perfMetrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {};
    const paint = performance.getEntriesByType('paint') || [];
    const fcpEntry = paint.find(p => p.name === 'first-contentful-paint');

    return new Promise((resolve) => {
      let lcp = 0;
      let cls = 0;

      // Observe LCP
      try {
        const lcpObserver = new PerformanceObserver((entryList) => {
          const entries = entryList.getEntries();
          if (entries.length > 0) {
            lcp = entries[entries.length - 1].startTime;
          }
        });
        lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
      } catch (e) {}

      // Observe CLS
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
  console.log('       SATS SPORT PHASE 1 - PRODUCTION BENCHMARK (BEFORE)       ');
  console.log('================================================================');
  console.log('Target: https://satsportco.vercel.app');
  console.log('Timestamp:', new Date().toISOString(), '\n');

  // 1. API Response Times Benchmark
  console.log('--- 1. API RESPONSE TIMES (Direct Parallel/Sequential) ---');
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

  // 2. Browser Tests
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

  // Write results to JSON for comparison in Phase 25
  const fs = require('fs');
  fs.writeFileSync('benchmark_before.json', JSON.stringify({
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
  }, null, 2));

  console.log('\nBenchmark data saved to benchmark_before.json successfully.');
}

runBenchmark().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
