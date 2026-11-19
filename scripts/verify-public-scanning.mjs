// One exact protected Studio and the public scan domain. No Books requests,
// app accounts, production fulfillment calls, or permanent deletion.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { decodeExport } from './decode-export.mjs';
import { archiveVerificationCode } from './archive-verification-code.mjs';

assert.equal(process.argv.length, 2, 'Configure origins and the Studio bypass through environment variables only.');
function origin(value, pattern, label) {
  assert.ok(value, `Provide ${label}`);
  const url = new URL(value);
  assert.equal(url.href, url.origin + '/', `${label} must be an origin without credentials, a path, query, or fragment`);
  assert.equal(url.username + url.password, '');
  assert.match(url.origin, pattern, `Unexpected ${label}`);
  return url.origin;
}
const studio = origin(process.env.QR_TEST_PREVIEW_URL, /^https:\/\/mastra-qr-studio-[a-z0-9]+-ashwinm546\.vercel\.app$/, 'QR_TEST_PREVIEW_URL');
const scanner = origin(process.env.QR_TEST_SCAN_ORIGIN || 'https://qr.mastrabooks.dev', /^https:\/\/qr\.mastrabooks\.dev$/, 'QR_TEST_SCAN_ORIGIN');
const bypass = process.env.QR_TEST_PREVIEW_BYPASS;
assert.ok(bypass && bypass.length >= 16, 'Provide QR_TEST_PREVIEW_BYPASS, never a URL credential');
const output = new URL('../outputs/public-scanning/', import.meta.url).pathname;
await fs.mkdir(output, { recursive: true });
const run = `Public scan verification ${Date.now()}-${randomUUID().slice(0, 8)}`;
const event = run + ' event';
const initial = 'https://www.mastrabooks.dev/?review=before#books';
const updated = 'https://www.mastrabooks.dev/?review=after#books';
const phoneUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const checks = [];
const browserErrors = [];
const blockedRequests = [];
const writes = [];
let browser;
let page;
let code;
let trackingLink;
let creationAttempted = false;
let workflowError;
let cleanupError;
let uploadedLogo;
let archived = false;

function relative(root, path) {
  assert.ok(path.startsWith('/') && !path.startsWith('//'), 'Use a relative path');
  const url = new URL(path, root);
  assert.equal(url.origin, root, 'Never forward credentials to another origin');
  return url;
}
function studioRequest(path, options = {}) {
  const headers = new Headers(options.headers);
  headers.set('x-vercel-protection-bypass', bypass);
  if (options.body) headers.set('Content-Type', 'application/json');
  if (options.method && !['GET', 'HEAD'].includes(options.method)) headers.set('Origin', studio);
  return fetch(relative(studio, path), { ...options, redirect: 'manual', headers });
}
function publicRequest(path, options = {}) {
  const headers = new Headers(options.headers);
  for (const name of headers.keys()) assert.ok(!/authorization|cookie|bypass/i.test(name), 'Public scanning must receive no authorization');
  if (!headers.has('user-agent')) headers.set('user-agent', phoneUA);
  // Inspect Location only. Do not follow the redirect or visit the Books portal.
  return fetch(relative(scanner, path), { ...options, redirect: 'manual', headers });
}
async function json(path, options = {}, status = 200) {
  const response = await studioRequest(path, options);
  assert.equal(response.status, status, `${path.split('?')[0]} returned ${response.status}`);
  return response.json();
}
const record = async () => (await json('/api/codes')).codes.find(item => item.id === code.id);
const report = async () => json(`/api/analytics?days=30&codeId=${code.id}`);
const safeMessage = error => String(error?.message || error).replaceAll(bypass, '[redacted]');
async function check(name, action) {
  try { const detail = await action(); checks.push({ name, passed: true, ...(detail ? { detail } : {}) }); }
  catch (error) { checks.push({ name, passed: false, error: safeMessage(error) }); throw error; }
}
async function screenshot(name) {
  const dismiss = page.getByRole('button', { name: 'Dismiss notification', exact: true });
  if (await dismiss.isVisible()) await dismiss.click();
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.qr-preview [role="status"], .qr-preview [role="alert"]')).toHaveCount(0);
  await page.waitForFunction(() => [...document.querySelectorAll('.qr-preview img')].every(image => image.complete && image.naturalWidth));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name}: horizontal overflow`);
  await page.screenshot({ path: output + name + '.png', fullPage: true });
}
async function openCode(target) {
  await target.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Codes', exact: true }).click();
  await target.locator('.codes-table').getByRole('button', { name: run, exact: true }).click();
  await expect(target.getByLabel('Tracking link', { exact: true })).toBeVisible();
}
async function save(method) {
  if (method === 'POST') creationAttempted = true;
  const pending = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.origin === studio && url.pathname.startsWith('/api/codes') && response.request().method() === method;
  });
  await page.locator('#artwork-panel button.btn.primary').click();
  const response = await pending;
  assert.equal(response.status(), method === 'POST' ? 201 : 200, `Saving returned ${response.status()}`);
  const saved = (await response.json()).code;
  // Retain its identity before waiting for the UI, so a late UI failure is cleanable.
  if (method === 'POST') code = saved;
  await expect(page.getByRole('button', { name: 'Download PNG', exact: true })).toBeEnabled();
  return saved;
}
async function newStudioContext() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce', locale: 'en-US' });
  await context.request.get(studio, {
    headers: { 'x-vercel-protection-bypass': bypass, 'x-vercel-set-bypass-cookie': 'true' }, maxRedirects: 0,
  });
  for (const cookie of await context.cookies()) {
    assert.equal(cookie.domain.replace(/^\./, ''), new URL(studio).hostname, 'Protection cookies must stay on this Studio host');
    assert.equal(cookie.name.startsWith('sb-') && cookie.name.includes('auth-token'), false, 'No app login session');
  }
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === 'vercel.live') return route.abort(); // Optional deployment toolbar, not part of Studio.
    // Tests inspect public redirects through unauthenticated fetch; browser
    // navigation to scanner/Books must never send an accidental extra visit/order.
    if ([scanner, 'https://mastrabooks.dev', 'https://www.mastrabooks.dev'].includes(url.origin) ||
        (url.origin !== studio && !['GET', 'HEAD', 'OPTIONS'].includes(request.method()))) {
      blockedRequests.push(`${request.method()} ${url.origin}${url.pathname}`);
      return route.abort();
    }
    return route.continue();
  });
  return context;
}
async function redirect(method, destination, headers = {}) {
  const response = await publicRequest('/q/' + code.slug, { method, headers });
  assert.equal(response.status, 302, `Public ${method} scan returned ${response.status}`);
  assert.match(response.headers.get('cache-control') || '', /no-store/);
  const expected = new URL(destination);
  if (code.utm.enabled) for (const key of ['source', 'medium', 'campaign', 'content']) {
    if (code.utm[key]?.trim()) expected.searchParams.set('utm_' + key, code.utm[key].trim());
  }
  assert.equal(response.headers.get('location'), expected.href, 'Redirect preserves destination, query, fragment, and UTMs');
  assert.equal(new URL(response.headers.get('location')).searchParams.has('qr_ref'), false, 'Live Books attribution remains off');
  if (method === 'HEAD') assert.equal(await response.text(), '');
}
async function unavailable(label) {
  const response = await publicRequest('/q/' + code.slug);
  assert.equal(response.status, 410, `${label} code must not redirect`);
  assert.equal(response.headers.get('location'), null);
  assert.equal((await report()).totalScans, 2, `${label} code retains its two scans without adding one`);
}

try {
  await check('Protected Studio and live scan configuration', async () => {
    for (const path of ['/', '/api/session', '/api/codes', '/api/analytics', '/api/fulfillment', '/q/draftpreview']) {
      const response = await fetch(studio + path, { redirect: 'manual' });
      assert.ok([401, 403, 302, 303, 307, 308].includes(response.status), `Studio ${path} must require Vercel access`);
      if (response.status >= 300 && response.status < 400) {
        assert.equal(new URL(response.headers.get('location'), studio).hostname, 'vercel.com', 'Protection redirects must go to Vercel');
      }
    }
    const session = await json('/api/session');
    assert.equal(session.mode, 'private');
    assert.equal(session.publicScanOrigin, scanner);
    assert.ok(!session.booksPreviewOrigin, 'Public exports must not route scanners into the Books preview');
    assert.equal((await json('/api/fulfillment?days=30')).status, 'not_configured', 'Real fulfillment remains disconnected');
  });
  await check('Public service exposes no Studio routes; draft and missing links return 404', async () => {
    const cases = [
      ['/', 'GET'], ['/api/session', 'GET'], ['/api/codes', 'GET'], ['/api/codes', 'POST'],
      ['/api/analytics', 'GET'], ['/api/fulfillment', 'GET'], ['/api/auth/login', 'POST'],
      ['/api/auth/logout', 'POST'], ['/api/auth/signup', 'POST'], ['/auth/callback', 'GET'],
      ['/api/index', 'GET'], ['/results', 'GET'],
    ];
    for (const [path, method] of cases) assert.equal((await publicRequest(path, { method })).status, 404, `Public ${method} ${path}`);
    const draft = await publicRequest('/q/draftpreview');
    assert.equal(draft.status, 404);
    assert.match(await draft.text(), /printed from an unsaved preview/);
    assert.equal((await publicRequest('/q/invalid')).status, 404);
    assert.equal((await publicRequest('/q/' + randomUUID().replaceAll('-', '').slice(0, 12), { method: 'HEAD' })).status, 404);
  });

  const brand = await sharp(new URL('../public/mastra-logo.svg', import.meta.url).pathname).resize({ width: 960 }).png().toBuffer();
  await sharp({ create: { width: 1024, height: 320, channels: 4, background: '#020202' } })
    .composite([{ input: brand, gravity: 'centre' }]).png().toFile(output + 'upload-logo.png');
  browser = await chromium.launch({ headless: true, ...(process.env.QR_BROWSER_PATH ? { executablePath: process.env.QR_BROWSER_PATH } : {}) });
  const context = await newStudioContext();
  page = await context.newPage();
  page.on('dialog', dialog => dialog.accept());
  page.on('pageerror', error => browserErrors.push(safeMessage(error)));
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin === studio && url.pathname.startsWith('/api/codes') && ['POST', 'PATCH'].includes(request.method())) writes.push(request.method());
  });

  await check('Create with uploaded logo, save, and reopen in a fresh private session', async () => {
    await page.goto(studio, { waitUntil: 'networkidle' });
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Codes', exact: true })).toHaveAttribute('aria-current', 'page');
    assert.equal(await page.getByRole('button', { name: 'Sign in', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'New code', exact: true }).first().click();
    await page.getByLabel('Name', { exact: true }).fill(run);
    await page.getByLabel('Destination URL').fill(initial);
    await page.getByLabel('Event', { exact: true }).fill(event);
    await page.getByLabel('Placement', { exact: true }).fill('Fictional launch verification');
    await page.getByRole('group', { name: 'Presets' }).getByRole('button', { name: /After hours$/ }).click();
    await page.getByRole('group', { name: 'Logo' }).getByRole('button', { name: 'Upload', exact: true }).click();
    await page.getByLabel('Logo file').setInputFiles(output + 'upload-logo.png');
    await expect(page.getByAltText('Uploaded logo', { exact: true })).toBeVisible();
    const styling = page.locator('summary', { hasText: 'More styling' });
    await styling.click();
    await page.getByLabel('Frame caption', { exact: true }).fill('PICK UP YOUR MASTRA BOOK');
    await styling.click();
    code = await save('POST');
    assert.equal(code.name, run);
    assert.equal(code.event, event);
    trackingLink = scanner + '/q/' + code.slug;
    await expect(page.getByLabel('Tracking link', { exact: true })).toHaveValue(trackingLink);
    assert.equal(code.design.logo, 'upload');
    assert.match(code.design.logoData, /^data:image\/png;base64,/);
    const metadata = await sharp(Buffer.from(code.design.logoData.split(',')[1], 'base64')).metadata();
    assert.equal(metadata.width, 256);
    assert.ok(metadata.height > 0 && metadata.height <= 256);
    uploadedLogo = { width: metadata.width, height: metadata.height };
    assert.deepEqual((await record()).design, code.design);
    assert.equal((await report()).totalScans, 0);
    await screenshot('saved-upload-desktop');
    const fresh = await newStudioContext();
    try {
      const reopened = await fresh.newPage();
      reopened.on('pageerror', error => browserErrors.push(safeMessage(error)));
      await reopened.goto(studio, { waitUntil: 'networkidle' });
      await openCode(reopened);
      await expect(reopened.getByLabel('Tracking link', { exact: true })).toHaveValue(trackingLink);
      await expect(reopened.getByAltText('Uploaded logo', { exact: true })).toHaveAttribute('src', code.design.logoData);
    } finally { await fresh.close(); }
    await page.reload({ waitUntil: 'networkidle' });
    await openCode(page);
    await expect(page.getByAltText('Uploaded logo', { exact: true })).toHaveAttribute('src', code.design.logoData);
  });
  await check('PNG, SVG, PDF, and one-page US Letter sticker sheet downloads', async () => {
    const beforeDownloads = writes.length;
    for (const format of ['PNG', 'SVG', 'PDF']) {
      const pending = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download ' + format, exact: true }).click();
      const download = await pending;
      assert.equal(await download.failure(), null);
      await download.saveAs(output + 'export.' + format.toLowerCase());
    }
    await page.getByRole('button', { name: 'Sticker sheet…', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Print on a sticker sheet' });
    const pending = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Download sheet PDF', exact: true }).click();
    const download = await pending;
    assert.equal(await download.failure(), null);
    await download.saveAs(output + 'export.sticker-sheet.pdf');
    await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeEnabled();
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const info = execFileSync('pdfinfo', [output + 'export.sticker-sheet.pdf'], { encoding: 'utf8', timeout: 30_000 });
    assert.match(info, /Page size:\s+612 x 792 pts/);
    assert.match(info, /^Pages:\s+1\s*$/m);
    assert.equal(writes.length, beforeDownloads, 'Downloading must not save or mutate the code');
    const png = await decodeExport(output + 'export.png', trackingLink);
    await fs.writeFile(output + 'png-decoding.json', JSON.stringify(png, null, 2));
    assert.equal(png.matches, true, 'PNG must decode to the saved public link at 800, 1200, and 1600px');
    const logoSha256 = createHash('sha256').update(Buffer.from(code.design.logoData.split(',')[1], 'base64')).digest('hex');
    await fs.writeFile(output + 'expected.json', JSON.stringify({ trackingLink, logoSha256, files: ['export.png', 'export.svg', 'export.pdf'] }, null, 2));
    assert.equal((await report()).totalScans, 0, 'Creation and exports must not count as scans');
    return 'Run verify-export-artifacts.mjs on expected.json for independent SVG/PDF decoding.';
  });
  await check('Public scan methods and nonhuman requests do not add visits', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      const response = await publicRequest('/q/' + code.slug, { method });
      assert.equal(response.status, 405, `Public scan ${method}`);
      assert.equal(response.headers.get('allow'), 'GET, HEAD');
    }
    for (const [path, method] of [[`/api/codes/${code.id}`, 'PATCH'], [`/api/codes/${code.id}`, 'DELETE'], [`/api/codes/${code.id}/restore`, 'POST']]) {
      assert.equal((await publicRequest(path, { method })).status, 404, `Public ${method} ${path}`);
    }
    await redirect('HEAD', initial);
    await redirect('GET', initial, { purpose: 'prefetch' });
    await redirect('GET', initial, { 'sec-purpose': 'prefetch' });
    await redirect('GET', initial, { 'next-router-prefetch': '1' });
    await redirect('GET', initial, { 'user-agent': 'Googlebot/2.1' });
    assert.equal((await report()).totalScans, 0);
  });
  await check('Signed-out public scans count; destination changes preserve the printed URL', async () => {
    await redirect('GET', initial);
    assert.equal((await report()).totalScans, 1);
    await page.getByLabel('Destination URL').fill(updated);
    await expect(page.locator('#artwork-panel button.btn.primary')).toHaveText('Save changes');
    for (const label of ['Download SVG', 'Download PDF', 'Sticker sheet…']) await expect(page.getByRole('button', { name: label, exact: true })).toBeDisabled();
    await redirect('HEAD', initial);
    assert.equal((await report()).totalScans, 1);
    const saved = await save('PATCH');
    assert.equal(saved.id, code.id);
    assert.equal(saved.slug, code.slug);
    assert.equal(saved.destination, updated);
    assert.deepEqual(saved.design, code.design);
    await expect(page.getByLabel('Tracking link', { exact: true })).toHaveValue(trackingLink);
    await redirect('GET', updated);
    const analytics = await report();
    assert.equal(analytics.totalScans, 2);
    assert.equal(analytics.byDay.reduce((sum, row) => sum + row.scans, 0), 2);
    assert.deepEqual(analytics.byEvent, [{ name: event, scans: 2 }]);
    assert.deepEqual(analytics.byDevice, [{ name: 'Mobile', scans: 2 }]);
    assert.equal(analytics.byCountry.reduce((sum, row) => sum + row.scans, 0), 2);
    assert.equal(analytics.recent.length, 2);
    assert.equal((await record()).scans, 2);
  });
  await check('Desktop and mobile Results show the public scans without simulated fulfillment', async () => {
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Results', exact: true }).click();
    await page.getByLabel('Filter analytics by event', { exact: true }).selectOption(event);
    await page.getByLabel('Filter analytics by QR code', { exact: true }).selectOption(code.id);
    await expect(page.locator('.kpis [data-metric=scans] dd')).toHaveText('2');
    await expect(page.getByText('Book requests aren’t connected in this environment.')).toBeVisible();
    await expect(page.locator('.kpis [data-metric=requests]')).toHaveCount(0);
    await screenshot('results-desktop');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('group', { name: 'Break down scans by', exact: true }).getByRole('button', { name: 'Device', exact: true }).click();
    const places = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Where scans came from', exact: true }) });
    await expect(places.locator('.bar-value')).toHaveText(['2']);
    await screenshot('results-mobile');
  });
  await check('Pause, expiry, archive, and paused restore retain scan history', async () => {
    await json('/api/codes/' + code.id, { method: 'PATCH', body: JSON.stringify({ status: 'paused' }) });
    await unavailable('Paused');
    await json('/api/codes/' + code.id, { method: 'PATCH', body: JSON.stringify({ status: 'active', expiresAt: '2000-01-01T00:00:00.000Z' }) });
    await unavailable('Expired');
    await json('/api/codes/' + code.id, { method: 'PATCH', body: JSON.stringify({ expiresAt: null }) });
    await redirect('HEAD', updated);
    const before = await report();
    await json('/api/codes/' + code.id, { method: 'DELETE' });
    await unavailable('Archived');
    const retained = await record();
    assert.ok(retained.archivedAt);
    assert.equal(retained.slug, code.slug);
    assert.equal(retained.status, 'paused');
    const after = await report();
    for (const field of ['totalScans', 'byDay', 'byCountry', 'byCity', 'byDevice', 'byEvent', 'byBook', 'byCode', 'recent']) assert.deepEqual(after[field], before[field], `Archive keeps ${field}`);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByLabel('Filter QR code status').selectOption('archived');
    await expect(page.locator('.codes-table').getByText(run, { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 320, height: 844 });
    await screenshot('archived-library-320');
    const restored = (await json(`/api/codes/${code.id}/restore`, { method: 'POST' })).code;
    assert.equal(restored.id, code.id);
    assert.equal(restored.slug, code.slug);
    assert.equal(restored.archivedAt, null);
    assert.equal(restored.status, 'paused');
    await unavailable('Restored paused');
  });
  await check('No browser errors, unexpected external calls, or fulfillment connection', async () => {
    assert.deepEqual(browserErrors, []);
    assert.deepEqual(blockedRequests, []);
    assert.equal((await json(`/api/fulfillment?days=30&codeId=${code.id}`)).status, 'not_configured');
  });
} catch (error) {
  workflowError = error;
  await page?.screenshot({ path: output + 'workflow-failure.png', fullPage: true }).catch(() => {});
} finally {
  try {
    if (!code && creationAttempted) {
      const matches = (await json('/api/codes')).codes.filter(item => item.name === run && item.event === event);
      assert.ok(matches.length <= 1, 'Ambiguous fixture identity; inspect this exact run before cleanup');
      code = matches[0];
    }
    if (code) {
      // A reporting outage must not prevent recording the fixture identity and
      // attempting archival. The helper writes its manifest before its request.
      const before = await report().catch(() => null);
      await archiveVerificationCode({ base: studio, code, request: studioRequest, output });
      archived = true;
      if (before) assert.equal((await report()).totalScans, before.totalScans, 'Cleanup archival preserves history');
      assert.equal((await publicRequest('/q/' + code.slug)).status, 410, 'Cleanup disables public test links');
    }
  } catch (error) { cleanupError = error; }
  await browser?.close();
  await fs.writeFile(output + 'workflow-report.json', JSON.stringify({
    passed: !workflowError && !cleanupError, recordedAt: new Date().toISOString(), studio, scanner,
    checks, fixture: code ? { id: code.id, slug: code.slug, name: code.name, archived } : null,
    trackingLink, uploadedLogo, downloads: ['PNG', 'SVG', 'PDF', 'US Letter sticker sheet PDF'],
    independentArtifactVerification: 'Run scripts/verify-export-artifacts.mjs outputs/public-scanning/expected.json separately.',
    browserErrors, blockedRequests, workflowError: workflowError ? safeMessage(workflowError) : null,
    cleanupError: cleanupError ? safeMessage(cleanupError) : null,
    cleanup: code ? `Exact operator cleanup pending in fixture-cleanup-${code.id}.json. No permanent deletion performed.` : 'No created fixture identified.',
    booksProductionRequests: 0, appAccountSetup: false,
  }, null, 2));
}
if (workflowError || cleanupError) {
  if (workflowError) console.error('FAIL:', safeMessage(workflowError));
  if (cleanupError) console.error('CLEANUP FAILED:', safeMessage(cleanupError));
  process.exitCode = 1;
} else {
  console.log('PASS: protected Studio, public-only scanner, uploaded-logo exports, stable destination edits, visit exclusions, Results, and lifecycle/history checks.');
  console.log('Temporary QR archived; exact operator cleanup is recorded in outputs/public-scanning/fixture-cleanup-' + code.id + '.json.');
}
