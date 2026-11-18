// Explicitly selected protected previews only. No production Books targets,
// app accounts, real recipients, or provider credentials are accepted.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { archiveVerificationCode } from './archive-verification-code.mjs';

assert.equal(process.argv.length, 2, 'Configure preview URLs and bypass credentials through environment variables only.');
function preview(name, pattern) {
  const value = process.env[name];
  assert.ok(value, `Provide ${name}`);
  const url = new URL(value);
  assert.equal(url.href, url.origin + '/', `${name} must be an origin without a path, query, or fragment`);
  assert.match(url.origin, pattern, `${name} must be this project's exact private deployment`);
  assert.equal(url.username + url.password, '');
  return url.origin;
}
const qr = preview('QR_TEST_PREVIEW_URL', /^https:\/\/mastra-qr-studio-[a-z0-9]+-ashwinm546\.vercel\.app$/);
const books = preview('BOOKS_TEST_PREVIEW_URL', /^https:\/\/mastrabooks-qr-preview-[a-z0-9]+-ashwinm546\.vercel\.app$/);
const keys = new Map([[qr, process.env.QR_TEST_PREVIEW_BYPASS], [books, process.env.BOOKS_TEST_PREVIEW_BYPASS]]);
for (const [origin, key] of keys) assert.ok(key && key.length >= 16, `Provide the automation credential for ${new URL(origin).hostname}`);
const roots = new Set(keys.keys());
const output = new URL('../outputs/books-attribution/', import.meta.url).pathname;
await fs.mkdir(output, { recursive: true });
const run = `Attribution verification ${Date.now()}-${randomUUID().slice(0, 8)}`;
const event = run;
const knownRequests = new Set();
const submissions = new Set();
const browserErrors = [];
const blockedRequests = [];
let code;
let browser;
let page;
let capturedBody;
let finalMetrics;
let completed = false;

function request(origin, path, options = {}) {
  assert.ok(roots.has(origin), 'Unknown preview origin');
  assert.ok(path.startsWith('/') && !path.startsWith('//'), 'Use a relative path on the selected preview');
  const url = new URL(path, origin);
  assert.equal(url.origin, origin, 'Never forward credentials to another origin');
  const headers = new Headers(options.headers);
  headers.set('x-vercel-protection-bypass', keys.get(origin));
  if (options.body) headers.set('Content-Type', 'application/json');
  if (options.method && !['GET', 'HEAD'].includes(options.method)) headers.set('Origin', origin);
  // Only the two selected origins receive these server request headers. All
  // redirects stay manual, including errors and Vercel authentication redirects.
  return fetch(url, { ...options, redirect: 'manual', headers });
}
async function json(origin, path, options = {}, expected = 200) {
  const response = await request(origin, path, options);
  assert.equal(response.status, expected, `${new URL(origin).hostname}${path.split('?')[0]} returned ${response.status}`);
  return response.json();
}
async function report() {
  const result = await json(qr, `/api/fulfillment?days=30&codeId=${code.id}`);
  assert.equal(result.status, 'connected');
  assert.equal(result.report.preview, true);
  assert.equal(result.previewOrigin, books);
  return result.report;
}
async function screenshot(name) {
  await page.evaluate(() => document.fonts.ready);
  if (new URL(page.url()).origin === qr) {
    await expect(page.locator('.qr-preview [role="status"]')).toHaveCount(0);
    await expect(page.locator('.qr-preview [role="alert"]')).toHaveCount(0);
    const refresh = page.getByRole('button', { name: 'Refresh analytics', exact: true });
    if (await refresh.count()) await expect(refresh).toBeEnabled();
    const dismiss = page.getByRole('button', { name: 'Dismiss notification', exact: true });
    if (await dismiss.count()) await dismiss.click();
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name}: horizontal overflow`);
  await page.screenshot({ path: output + name + '.png', fullPage: true });
}
async function unprotectedCheck(origin, path) {
  const response = await fetch(origin + path, { redirect: 'manual' });
  assert.ok([401, 403, 302, 303, 307, 308].includes(response.status), `Unsigned ${path} must remain protected`);
}

try {
  await Promise.all([
    unprotectedCheck(qr, '/api/fulfillment'),
    unprotectedCheck(books, '/api/qr/preview'),
  ]);
  const session = await json(qr, '/api/session');
  assert.equal(session.mode, 'private', 'This verifier never uses an app account');
  assert.equal(session.booksPreviewOrigin, books, 'QR Studio must point at the selected isolated Books preview');
  await json(books, '/api/qr/preview'); // Guard the isolated storage path before creating a code.
  const created = await json(qr, '/api/codes', {
    method: 'POST', body: JSON.stringify({ name: run, destination: 'https://www.mastrabooks.dev/', event, book: 'Both', placement: 'Private verification',
      utm: { enabled: true, source: 'event', medium: 'qr', campaign: run, content: 'private-verification' } }),
  }, 201);
  code = created.code;
  assert.ok(code.id && code.slug);
  assert.equal((await report()).totals.requests, 0);

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' });
  for (const origin of roots) {
    await context.request.get(origin, { headers: { 'x-vercel-protection-bypass': keys.get(origin), 'x-vercel-set-bypass-cookie': 'true' }, maxRedirects: 0 });
  }
  const allowedCookieHosts = new Set([...roots].map(origin => new URL(origin).hostname));
  for (const cookie of await context.cookies()) assert.ok(allowedCookieHosts.has(cookie.domain.replace(/^\./, '')), 'Protection cookies must be scoped to a selected preview host');
  await context.route('**/*', async route => {
    const req = route.request();
    const url = new URL(req.url());
    // The protected deployment toolbar may validate its own Vercel session.
    // It is not part of fulfillment; suppress it in this isolated test.
    if (url.hostname === 'vercel.live') { await route.abort(); return; }
    // Never open the production portal or send a mutation outside the two previews.
    if (['mastrabooks.dev', 'www.mastrabooks.dev'].includes(url.hostname) ||
      (!roots.has(url.origin) && !['GET', 'HEAD', 'OPTIONS'].includes(req.method()))) {
      blockedRequests.push(`${req.method()} ${url.origin}${url.pathname}`);
      await route.abort();
    } else await route.continue();
  });
  page = await context.newPage();
  page.on('pageerror', error => browserErrors.push(error.message));
  let landingToken;
  page.on('request', req => {
    const url = new URL(req.url());
    if (url.origin === books && url.pathname === '/' && url.searchParams.has('qr_ref')) landingToken = url.searchParams.get('qr_ref');
    if (url.origin === books && url.pathname === '/api/orders' && req.method() === 'POST') {
      capturedBody = req.postDataJSON();
      if (capturedBody?.qrSubmissionId) submissions.add(capturedBody.qrSubmissionId);
    }
  });
  await page.goto(qr + '/q/' + code.slug, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Private preview — no books or emails sent', { exact: true })).toBeVisible();
  await page.waitForFunction(() => !new URL(window.location.href).searchParams.has('qr_ref') && !!sessionStorage.getItem('mastra-books:qr-session:v1'));
  assert.equal(new URL(page.url()).origin, books);
  assert.ok(landingToken, 'The QR redirect must carry a signed visit reference');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('mastra-books:qr-session:v1')), landingToken);
  assert.equal(new URL(page.url()).searchParams.has('qr_ref'), false, 'Captured reference should be removed from the visible URL');

  // Country gates the existing form; quantity/country have section labels rather
  // than associated labels in the existing UI. All named shipping fields use labels.
  await page.locator('form select').first().selectOption('US');
  await page.getByRole('button', { name: /Both Books/ }).click();
  await page.locator('form input[type="number"]').fill('2');
  await page.getByLabel(/^Name/).fill('Fictional Preview Reader');
  await page.getByLabel(/^Email/).fill(`qr-preview-${Date.now()}@example.invalid`);
  await page.getByLabel(/^Phone/).fill('2025550142');
  await page.getByLabel(/^Address Line 1/).fill('123 Preview Lane');
  await page.getByLabel(/^City/).fill('Austin');
  await page.getByLabel(/^State/).selectOption('TX');
  await page.getByLabel(/^Postal Code/).fill('78701');
  await screenshot('books-form');
  const savedResponse = page.waitForResponse(response => new URL(response.url()).origin === books && new URL(response.url()).pathname === '/api/orders' && response.request().method() === 'POST');
  await page.locator('form button[type="submit"]').click();
  const saved = await savedResponse;
  assert.equal(saved.status(), 201, 'Private Books form should save a test request');
  const receipt = await saved.json();
  assert.equal(receipt.preview, true);
  assert.equal(receipt.success, true);
  knownRequests.add(receipt.orderId);
  assert.equal(capturedBody.qrAttribution, landingToken);
  assert.ok(capturedBody.qrSubmissionId);
  await expect(page.getByRole('heading', { name: 'Test request saved', exact: true })).toBeVisible();
  await screenshot('books-receipt');

  const replay = await json(books, '/api/orders', { method: 'POST', body: JSON.stringify(capturedBody) }, 201);
  assert.equal(replay.orderId, receipt.orderId, 'Identical transport replay must return the same logical request');
  const conflict = await request(books, '/api/orders', { method: 'POST', body: JSON.stringify({ ...capturedBody, quantity: 3 }) });
  assert.equal(conflict.status, 409, 'A changed body cannot reuse a submission identity');
  const firstReport = await report();
  assert.deepEqual(firstReport.totals, { requests: 1, booksRequested: 4, booksShipped: 0, deliveredOrders: 0, needsAttention: 0 });
  assert.equal(firstReport.byCode[0].event, event);
  assert.equal(JSON.stringify(firstReport).includes(capturedBody.email), false, 'Reporting cannot return recipient contact information');

  const unattributedId = randomUUID();
  submissions.add(unattributedId);
  const unattributed = await json(books, '/api/orders', { method: 'POST', body: JSON.stringify({ ...capturedBody, qrSubmissionId: unattributedId, qrAttribution: landingToken + 'tampered' }) }, 201);
  knownRequests.add(unattributed.orderId);
  const listing = await json(books, '/api/qr/preview');
  assert.equal(listing.requests.find(row => row.id === unattributed.orderId)?.attribution, null, 'Invalid attribution should not block the request or create a trusted attribution');
  assert.equal((await report()).totals.requests, 1, 'Unattributed requests do not inflate QR results');

  await page.getByRole('link', { name: 'View test requests', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Test book requests', exact: true })).toBeVisible();
  const row = page.locator('article').filter({ hasText: receipt.orderId });
  await expect(row).toHaveCount(1);
  for (const status of ['shipped', 'delivered']) {
    await row.getByLabel(/Next test status/).selectOption(status);
    const transitioned = page.waitForResponse(response => new URL(response.url()).origin === books && new URL(response.url()).pathname === '/api/qr/preview' && response.request().method() === 'PATCH');
    await row.getByRole('button', { name: 'Apply test status', exact: true }).click();
    const response = await transitioned;
    assert.equal(response.status(), 200);
    assert.equal((await response.json()).request.id, receipt.orderId);
    await expect(row.locator('span.capitalize')).toHaveText(status);
  }
  await screenshot('books-delivered');
  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot('books-status-mobile');
  const shortControls = await page.locator('main').evaluate(main => [...main.querySelectorAll('button,select,a')]
    .filter(control => control.getBoundingClientRect().width > 0 && control.getBoundingClientRect().height < 44)
    .map(control => control.tagName));
  assert.deepEqual(shortControls, [], 'Private status controls need usable phone touch targets');
  await page.setViewportSize({ width: 1440, height: 1050 });
  finalMetrics = (await report()).totals;
  assert.deepEqual(finalMetrics, { requests: 1, booksRequested: 4, booksShipped: 4, deliveredOrders: 1, needsAttention: 0 });

  const edited = await json(qr, '/api/codes/' + code.id, { method: 'PATCH', body: JSON.stringify({ destination: 'https://www.mastrabooks.dev/?review=updated#books' }) });
  assert.equal(edited.code.slug, code.slug, 'Destination changes preserve the printed link');
  const head = await request(qr, '/q/' + code.slug, { method: 'HEAD' });
  assert.equal(head.status, 302);
  const destination = new URL(head.headers.get('location'));
  assert.equal(destination.origin, books);
  assert.equal(destination.searchParams.get('review'), 'updated');
  assert.equal(destination.hash, '#books');
  assert.equal(destination.searchParams.has('qr_ref'), false, 'HEAD must not receive attribution');
  assert.equal((await json(qr, '/api/analytics?days=30&codeId=' + code.id)).totalScans, 1, 'Only the original real browser visit should be counted');

  await page.goto(qr, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Scan analytics', exact: true }).click();
  await page.getByLabel('Filter analytics by event', { exact: true }).selectOption(event);
  await page.getByLabel('Filter analytics by QR code', { exact: true }).selectOption(code.id);
  for (const [metric, value] of Object.entries(finalMetrics)) {
    await expect(page.locator(`.fulfillment-metrics [data-metric="${metric}"] dd`)).toHaveText(String(value));
  }
  await expect(page.getByText('Simulated fulfillment', { exact: true })).toBeVisible();
  await screenshot('analytics-desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('Break down scans by', { exact: false }).selectOption('device');
  await expect(page.getByRole('heading', { name: 'Scans over time', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Results by event', exact: true })).toBeVisible();
  await screenshot('analytics-mobile');

  // Archive through the actual library: stopping a printed link must never
  // remove the request and shipment evidence that it already generated.
  await page.getByRole('button', { name: 'Your QR codes', exact: true }).click();
  await page.getByLabel('More actions for ' + run, { exact: true }).selectOption('archive');
  const archiveDialog = page.getByRole('alertdialog');
  await expect(archiveDialog.getByRole('heading', { name: 'Archive this QR code?', exact: true })).toBeVisible();
  await expect(archiveDialog).toContainText(/fulfillment history/i);
  await page.setViewportSize({ width: 320, height: 844 });
  await screenshot('archive-confirmation-mobile');
  const archiveResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/codes/' + code.id && response.request().method() === 'DELETE');
  await archiveDialog.getByRole('button', { name: 'Archive code', exact: true }).click();
  assert.equal((await archiveResponse).status(), 200);
  await expect(archiveDialog).toHaveCount(0);
  await expect(page.locator('.code-row').filter({ hasText: run })).toHaveCount(0);
  const archivedCode = (await json(qr, '/api/codes')).codes.find(item => item.id === code.id);
  assert.ok(archivedCode?.archivedAt);
  assert.equal(archivedCode.slug, code.slug);
  assert.equal(archivedCode.scans, 1);
  assert.equal((await request(qr, '/q/' + code.slug)).status, 410, 'Archived code must not redirect or record another visit');
  assert.equal((await json(qr, '/api/analytics?days=30&codeId=' + code.id)).totalScans, 1);
  assert.deepEqual((await report()).totals, finalMetrics, 'Archiving must retain the complete fulfillment history');
  const archivedEvent = await json(qr, '/api/fulfillment?days=30&event=' + encodeURIComponent(event));
  assert.deepEqual(archivedEvent.report.totals, finalMetrics, 'Event totals must still include archived codes');
  const staleEdit = await request(qr, '/api/codes/' + code.id, { method: 'PATCH', body: JSON.stringify({ status: 'active' }) });
  assert.equal(staleEdit.status, 409, 'Stale edits must not reactivate an archive');

  await page.getByLabel('Filter QR code status', { exact: true }).selectOption('archived');
  const archivedRow = page.locator('.code-row').filter({ hasText: run });
  await expect(archivedRow.locator('.status-pill')).toHaveText(/archived/i);
  await expect(archivedRow.getByRole('button', { name: 'Edit ' + run, exact: true })).toHaveCount(0);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1050 : 844 });
    await screenshot('archived-library-' + width);
    if (width <= 390) {
      const short = await archivedRow.locator('button,select').evaluateAll(controls => controls
        .filter(control => control.getBoundingClientRect().width > 0 && control.getBoundingClientRect().height < 44)
        .map(control => control.getAttribute('aria-label') || control.textContent));
      assert.deepEqual(short, [], 'Archived code controls must remain usable on phones');
    }
  }
  await archivedRow.getByRole('button', { name: 'View analytics for ' + run, exact: true }).click();
  assert.equal(await page.getByLabel('Filter analytics by QR code', { exact: true }).inputValue(), code.id);
  for (const [metric, value] of Object.entries(finalMetrics)) {
    await expect(page.locator(`.fulfillment-metrics [data-metric="${metric}"] dd`)).toHaveText(String(value));
  }
  await screenshot('archived-analytics-desktop');
  await page.getByRole('button', { name: 'Your QR codes', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const restoreResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/codes/' + code.id + '/restore' && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Restore ' + run, exact: true }).click();
  const restored = await restoreResponse;
  assert.equal(restored.status(), 200);
  const restoredCode = (await restored.json()).code;
  assert.equal(restoredCode.id, code.id);
  assert.equal(restoredCode.slug, code.slug);
  assert.equal(restoredCode.archivedAt, null);
  assert.equal(restoredCode.status, 'paused');
  assert.equal((await request(qr, '/q/' + code.slug)).status, 410, 'Restore keeps the link paused until explicitly activated');
  assert.deepEqual((await report()).totals, finalMetrics, 'Restoring must not duplicate or change fulfillment totals');
  await page.getByLabel('Filter QR code status', { exact: true }).selectOption('paused');
  await expect(page.locator('.code-row').filter({ hasText: run }).locator('.status-pill')).toHaveText('paused');
  await screenshot('restored-library-mobile');
  assert.deepEqual(blockedRequests, [], 'The connected flow must not navigate to production or mutate an unrelated service');
  assert.deepEqual(browserErrors, [], 'No browser runtime errors');
  completed = true;
} catch (error) {
  await page?.screenshot({ path: output + 'workflow-failure.png', fullPage: true }).catch(() => {});
  throw error;
} finally {
  const failures = [];
  // Resolve uncertain POST responses by this run's submission IDs or exact QR
  // identity. Never clear a table or remove another reviewer's test requests.
  try {
    const listing = await json(books, '/api/qr/preview');
    for (const row of listing.requests) {
      if (submissions.has(row.submissionId) || (code && row.attribution?.codeId === code.id && row.attribution?.event === event)) knownRequests.add(row.id);
    }
  } catch (error) { failures.push(error); }
  for (const id of knownRequests) {
    try { await json(books, '/api/qr/preview', { method: 'DELETE', body: JSON.stringify({ id }) }); }
    catch (error) { failures.push(error); }
  }
  try {
    const after = await json(books, '/api/qr/preview');
    assert.equal(after.requests.some(row => knownRequests.has(row.id) || submissions.has(row.submissionId)), false, 'Test request cleanup failed');
  } catch (error) { failures.push(error); }
  try {
    if (!code) {
      const listing = await json(qr, '/api/codes');
      code = listing.codes.find(candidate => candidate.name === run && candidate.event === event);
    }
    if (code) {
      await archiveVerificationCode({ base: qr, code, request: (path, options) => request(qr, path, options), output });
    }
  } catch (error) { failures.push(error); }
  await browser?.close();
  if (failures.length) throw new AggregateError(failures, 'Exact Books fixture cleanup or QR archival did not complete');
  if (completed) await fs.writeFile(output + 'workflow-report.json', JSON.stringify({
    passed: true, qrPreview: qr, booksPreview: books, requests: 1, booksRequested: 4, booksShipped: 4, deliveredOrders: 1,
    countedVisits: 1, transportReplay: 'same request', changedReplay: '409', invalidAttribution: 'saved unattributed',
    destinationEdit: 'stable slug', head: 'no attribution or scan', privateAccess: 'unsigned requests blocked',
    archiveHistory: 'unchanged request, requested/shipped books, delivered order, and scan totals', restore: 'same identity and slug, paused',
    fixtureCleanup: 'exact Books request IDs removed; QR archived for operator cleanup listed in fixture-cleanup-' + code.id + '.json', browserErrors, productionChanges: false, accountSetup: false,
  }, null, 2));
}
console.log('PASS: real QR → Books form → simulated shipped/delivered → QR analytics, archive retains fulfillment/scan history, restore stays paused, mobile/desktop. Books fixtures removed; exact QR operator cleanup recorded in fixture-cleanup-<code-id>.json.');
