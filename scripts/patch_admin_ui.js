const fs = require('fs');

function patchFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const isCrlf = content.includes('\r\n');
  const nl = isCrlf ? '\r\n' : '\n';

  // 1. Add alert container
  const target1 = `                                                        <span class="text-muted ml-2">| Last Success: <span id="apiProviderLastSuccess">Just now</span></span>` + nl +
`                                                    </div>` + nl +
`                                                </div>` + nl +
`                                            </div>`;

  const repl1 = `                                                        <span class="text-muted ml-2">| Last Success: <span id="apiProviderLastSuccess">Just now</span></span>` + nl +
`                                                    </div>` + nl +
`                                                </div>` + nl +
`                                                <div id="apiAuthAlertContainer" style="display: none; margin-top: 12px;"></div>` + nl +
`                                            </div>`;

  if (content.includes(target1)) {
    content = content.replace(target1, repl1);
    console.log(`[${filePath}] Added apiAuthAlertContainer`);
  } else {
    console.warn(`[${filePath}] target1 not found`);
  }

  // 2. Patch renderApiOverview
  const target2 = `            if (statusBadge) {` + nl +
`                var isConn = data.activeStatus === 'CONNECTED';` + nl +
`                statusBadge.innerText = 'OVERALL STATUS: ' + (data.activeStatus || (isDiamond ? 'CONNECTED' : 'NOT CONNECTED'));` + nl +
`                statusBadge.className = 'badge ' + (isConn ? 'badge-success' : 'badge-danger');` + nl +
`            }` + nl +
nl +
`            if (authBadge) {` + nl +
`                var isAuth = data.activeAuth === 'AUTHENTICATED';` + nl +
`                authBadge.innerText = 'AUTH: ' + (data.activeAuth || (isDiamond ? 'AUTHENTICATED' : 'IP WHITELIST REQUIRED'));` + nl +
`                authBadge.className = 'badge ' + (isAuth ? 'badge-success' : 'badge-warning');` + nl +
`            }` + nl +
nl +
`            if (sourceBadge) {` + nl +
`                var isLive = data.dataSource === 'LIVE' || data.dataSource === 'LIVE_API' || data.dataSource === 'LIVE_DIAMOND';` + nl +
`                sourceBadge.innerText = 'DATA SOURCE: ' + (isLive ? (data.dataSource || 'LIVE') : 'FALLBACK');` + nl +
`                sourceBadge.className = 'badge ' + (isLive ? 'badge-success' : 'badge-secondary');` + nl +
`            }` + nl +
nl +
`            if (pHealthBadge) {` + nl +
`                var isHealthy = pSummary.providerHealth === 'HEALTHY' || data.activeStatus === 'CONNECTED';` + nl +
`                pHealthBadge.innerText = isHealthy ? 'HEALTHY (LIVE)' : 'DEGRADED';` + nl +
`                pHealthBadge.className = 'badge ' + (isHealthy ? 'badge-success' : 'badge-warning');` + nl +
`            }` + nl +
nl +
`            if (pLatencyDisplay) {` + nl +
`                var lat = pSummary.latestLatencyMs || pSummary.averageLatencyMs || (isDiamond ? 428 : 0);` + nl +
`                pLatencyDisplay.innerText = lat + 'ms';` + nl +
`            }` + nl +
nl +
`            if (pLastSuccess) {` + nl +
`                var lastTime = pSummary.lastSuccessTimestamp ? new Date(pSummary.lastSuccessTimestamp).toLocaleTimeString() : 'Just now';` + nl +
`                pLastSuccess.innerText = lastTime;` + nl +
`            }` + nl +
nl +
`            // 2. Active Provider Operational Summary Card` + nl +
`            if (document.getElementById('psProviderName')) document.getElementById('psProviderName').innerText = pSummary.providerName || (isDiamond ? 'Diamond Betting API (v1.0.0)' : 'Shubdx International');` + nl +
`            if (document.getElementById('psBaseUrl')) document.getElementById('psBaseUrl').innerText = pSummary.baseUrl || (isDiamond ? 'http://46.202.166.33:3009' : 'https://shubdxinternational.com');` + nl +
`            if (document.getElementById('psMode')) document.getElementById('psMode').innerText = pSummary.mode || 'READ-ONLY LIVE (7/13 LIVE)';` + nl +
`            if (document.getElementById('psKeyConfigured')) document.getElementById('psKeyConfigured').innerText = pSummary.keyConfigured || 'NO';` + nl +
`            if (document.getElementById('psLatencyDisplay')) document.getElementById('psLatencyDisplay').innerText = (pSummary.averageLatencyMs || 428) + 'ms';` + nl +
`            if (document.getElementById('psDataSource')) document.getElementById('psDataSource').innerText = pSummary.dataSource || 'LIVE_DIAMOND';` + nl +
`            if (document.getElementById('psLastSuccess')) document.getElementById('psLastSuccess').innerText = pSummary.lastSuccessTimestamp ? new Date(pSummary.lastSuccessTimestamp).toLocaleString() : 'Just now';` + nl +
`            if (document.getElementById('psLastError')) document.getElementById('psLastError').innerText = pSummary.lastError ? (pSummary.lastError.message || 'Error recorded') : 'None';` + nl +
`            if (document.getElementById('psHealthBadge')) {` + nl +
`                var hBadge = document.getElementById('psHealthBadge');` + nl +
`                hBadge.innerText = pSummary.providerHealth || 'HEALTHY';` + nl +
`                hBadge.className = 'badge ' + (pSummary.providerHealth === 'HEALTHY' ? 'badge-success' : 'badge-warning');` + nl +
`            }`;

  const repl2 = `            var isDiamondAuthorized = isDiamond && (data.activeStatus === 'CONNECTED' || data.isAuthorized === true);` + nl +
`            if (statusBadge) {` + nl +
`                var isConn = data.activeStatus === 'CONNECTED';` + nl +
`                statusBadge.innerText = 'OVERALL STATUS: ' + (data.activeStatus || 'NOT CONNECTED');` + nl +
`                statusBadge.className = 'badge ' + (isConn ? 'badge-success' : 'badge-danger');` + nl +
`            }` + nl +
nl +
`            if (authBadge) {` + nl +
`                var isAuth = data.activeAuth === 'AUTHENTICATED';` + nl +
`                authBadge.innerText = 'AUTH: ' + (data.activeAuth || 'IP WHITELIST OR KEY REQUIRED');` + nl +
`                authBadge.className = 'badge ' + (isAuth ? 'badge-success' : 'badge-danger');` + nl +
`            }` + nl +
nl +
`            if (sourceBadge) {` + nl +
`                var isLive = (data.dataSource === 'LIVE' || data.dataSource === 'LIVE_API' || data.dataSource === 'LIVE_DIAMOND') && isDiamondAuthorized;` + nl +
`                sourceBadge.innerText = 'DATA SOURCE: ' + (isLive ? (data.dataSource || 'LIVE') : 'FALLBACK');` + nl +
`                sourceBadge.className = 'badge ' + (isLive ? 'badge-success' : 'badge-secondary');` + nl +
`            }` + nl +
nl +
`            if (pHealthBadge) {` + nl +
`                var isHealthy = pSummary.providerHealth === 'HEALTHY' && isDiamondAuthorized;` + nl +
`                pHealthBadge.innerText = isHealthy ? 'HEALTHY (LIVE)' : 'DEGRADED / UNAUTHORIZED';` + nl +
`                pHealthBadge.className = 'badge ' + (isHealthy ? 'badge-success' : 'badge-danger');` + nl +
`            }` + nl +
nl +
`            if (pLatencyDisplay) {` + nl +
`                var lat = pSummary.latestLatencyMs || pSummary.averageLatencyMs || 0;` + nl +
`                pLatencyDisplay.innerText = lat + 'ms';` + nl +
`            }` + nl +
nl +
`            if (pLastSuccess) {` + nl +
`                var lastTime = pSummary.lastSuccessTimestamp ? new Date(pSummary.lastSuccessTimestamp).toLocaleTimeString() : 'None recorded';` + nl +
`                pLastSuccess.innerText = lastTime;` + nl +
`            }` + nl +
nl +
`            // Active Provider Operational Summary Card` + nl +
`            if (document.getElementById('psProviderName')) document.getElementById('psProviderName').innerText = pSummary.providerName || (isDiamond ? 'Diamond Betting API (v1.0.0)' : 'Shubdx International');` + nl +
`            if (document.getElementById('psBaseUrl')) document.getElementById('psBaseUrl').innerText = pSummary.baseUrl || (isDiamond ? 'http://46.202.166.33:3009' : 'https://shubdxinternational.com');` + nl +
`            if (document.getElementById('psMode')) document.getElementById('psMode').innerText = pSummary.mode || (isDiamond ? (isDiamondAuthorized ? 'READ-ONLY LIVE (7/13 LIVE)' : 'OFFLINE / UNAUTHORIZED (HTTP 401)') : 'STANDALONE');` + nl +
`            if (document.getElementById('psKeyConfigured')) document.getElementById('psKeyConfigured').innerText = pSummary.keyConfigured || 'NO';` + nl +
`            if (document.getElementById('psLatencyDisplay')) document.getElementById('psLatencyDisplay').innerText = (pSummary.averageLatencyMs || pSummary.latestLatencyMs || 0) + 'ms';` + nl +
`            if (document.getElementById('psDataSource')) document.getElementById('psDataSource').innerText = (isDiamondAuthorized ? (pSummary.dataSource || 'LIVE_DIAMOND') : 'FALLBACK');` + nl +
`            if (document.getElementById('psLastSuccess')) document.getElementById('psLastSuccess').innerText = pSummary.lastSuccessTimestamp ? new Date(pSummary.lastSuccessTimestamp).toLocaleString() : 'None';` + nl +
`            if (document.getElementById('psLastError')) document.getElementById('psLastError').innerText = pSummary.lastError ? (pSummary.lastError.message || 'Error recorded') : 'None';` + nl +
`            if (document.getElementById('psHealthBadge')) {` + nl +
`                var hBadge = document.getElementById('psHealthBadge');` + nl +
`                var isH = pSummary.providerHealth === 'HEALTHY' && isDiamondAuthorized;` + nl +
`                hBadge.innerText = isH ? 'HEALTHY' : 'DEGRADED / UNAUTHORIZED';` + nl +
`                hBadge.className = 'badge ' + (isH ? 'badge-success' : 'badge-danger');` + nl +
`            }` + nl +
nl +
`            // Provider Alert Container` + nl +
`            var alertCont = document.getElementById('apiAuthAlertContainer');` + nl +
`            if (alertCont) {` + nl +
`                if (!isDiamondAuthorized && (data.activeStatus !== 'CONNECTED' || (data.activeAuth && (data.activeAuth.includes('UNAUTHORIZED') || data.activeAuth.includes('WHITELIST'))))) {` + nl +
`                    var seenIp = data.serverEgressIp || pSummary.clientIpSeen || 'Detecting...';` + nl +
`                    alertCont.style.display = 'block';` + nl +
`                    alertCont.innerHTML = '<div class=\"alert alert-danger mb-0\" style=\"background: #fef2f2; border: 1px solid #f87171; border-left: 5px solid #dc2626; color: #991b1b; padding: 12px 16px; border-radius: 6px;\">' +` + nl +
`                        '<div style=\"font-weight: 700; font-size: 14px; margin-bottom: 4px;\"><i class=\"fas fa-exclamation-triangle mr-1\"></i> Provider Authorization Required (HTTP 401 Unauthorized)</div>' +` + nl +
`                        '<div style=\"font-size: 13px; line-height: 1.5;\">' +` + nl +
`                        'The Diamond API provider at <code>' + (data.activeBaseUrl || 'http://46.202.166.33:3009') + '</code> requires client authorization. The provider reported server egress IP: <code style=\"background: #fee2e2; color: #b91c1c; font-weight: 700; padding: 2px 6px; border-radius: 4px;\">' + seenIp + '</code>.<br>' +` + nl +
`                        '<strong>Actions to restore live data:</strong>' +` + nl +
`                        '<ul style=\"margin: 6px 0 0 18px; padding: 0;\">' +` + nl +
`                        '<li>Whitelist this IP (<code>' + seenIp + '</code>) in the provider server\\'s authorized IP list.</li>' +` + nl +
`                        '<li>OR click <strong>Configure Diamond API</strong> above and enter your provider <strong>API Key</strong>.</li>' +` + nl +
`                        '</ul>' +` + nl +
`                        '</div></div>';` + nl +
`                } else {` + nl +
`                    alertCont.style.display = 'none';` + nl +
`                    alertCont.innerHTML = '';` + nl +
`                }` + nl +
`            }`;

  if (content.includes(target2)) {
    content = content.replace(target2, repl2);
    console.log(`[${filePath}] Updated renderApiOverview operational summary & alert`);
  } else {
    console.warn(`[${filePath}] target2 not found`);
  }

  // 3. Patch Diamond Card row
  const target3 = `                var diamondBadge = document.getElementById('diamondStatusBadge');` + nl +
`                if (diamondBadge) {` + nl +
`                    diamondBadge.innerText = d.overallStatus || 'READ-ONLY LIVE (7/13)';` + nl +
`                    diamondBadge.className = 'badge badge-success';` + nl +
`                }` + nl +
`                var dNet = document.getElementById('diamondNetworkBadge');` + nl +
`                if (dNet) dNet.innerText = d.networkReachability || 'REACHABLE';` + nl +
`                var dAuth = document.getElementById('diamondAuthBadge');` + nl +
`                if (dAuth) dAuth.innerText = d.authentication || 'AUTHENTICATED';` + nl +
`                var dData = document.getElementById('diamondDataBadge');` + nl +
`                if (dData) dData.innerText = d.dataAvailability || 'REAL LIVE DATA';` + nl +
`                var dOver = document.getElementById('diamondOverallBadge');` + nl +
`                if (dOver) dOver.innerText = d.overallStatus || 'READ-ONLY LIVE';`;

  const repl3 = `                var isDLive = d.isAuthorized === true;` + nl +
`                var diamondBadge = document.getElementById('diamondStatusBadge');` + nl +
`                if (diamondBadge) {` + nl +
`                    diamondBadge.innerText = isDLive ? (d.overallStatus || 'LIVE') : 'NOT CONNECTED (HTTP 401)';` + nl +
`                    diamondBadge.className = 'badge ' + (isDLive ? 'badge-success' : 'badge-danger');` + nl +
`                }` + nl +
`                var dNet = document.getElementById('diamondNetworkBadge');` + nl +
`                if (dNet) dNet.innerText = d.networkReachability || 'REACHABLE';` + nl +
`                var dAuth = document.getElementById('diamondAuthBadge');` + nl +
`                if (dAuth) {` + nl +
`                    dAuth.innerText = isDLive ? (d.authentication || 'AUTHENTICATED') : 'UNAUTHORIZED (HTTP 401)';` + nl +
`                    dAuth.className = 'badge ' + (isDLive ? 'badge-success' : 'badge-danger');` + nl +
`                }` + nl +
`                var dData = document.getElementById('diamondDataBadge');` + nl +
`                if (dData) {` + nl +
`                    dData.innerText = isDLive ? (d.dataAvailability || 'REAL LIVE DATA') : 'NO DATA (AUTH REQUIRED)';` + nl +
`                    dData.className = 'badge ' + (isDLive ? 'badge-success' : 'badge-secondary');` + nl +
`                }` + nl +
`                var dOver = document.getElementById('diamondOverallBadge');` + nl +
`                if (dOver) {` + nl +
`                    dOver.innerText = isDLive ? (d.overallStatus || 'LIVE') : 'NOT CONNECTED (HTTP 401)';` + nl +
`                    dOver.className = 'badge ' + (isDLive ? 'badge-success' : 'badge-danger');` + nl +
`                }`;

  if (content.includes(target3)) {
    content = content.replace(target3, repl3);
    console.log(`[${filePath}] Updated Diamond Card row`);
  } else {
    console.warn(`[${filePath}] target3 not found`);
  }

  fs.writeFileSync(filePath, content, 'utf8');
}

patchFile('admin.html');
patchFile('admin/index.html');
