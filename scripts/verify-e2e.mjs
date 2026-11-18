// Actual browser workflow against local review or an explicitly selected protected preview.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { archiveVerificationCode } from './archive-verification-code.mjs';

const args = process.argv.slice(2);
const hosted = args[0] === '--private-preview';
assert.ok(args.length === 0 || (hosted && args.length === 2), 'Usage: node scripts/verify-e2e.mjs [--private-preview https://deployment.vercel.app]');
const base = hosted ? new URL(args[1]).origin : 'http://127.0.0.1:3147';
if (hosted) assert.match(base, /^https:\/\/mastra-qr-studio-[a-z0-9]+-ashwinm546\.vercel\.app$/, 'Use this project’s exact protected preview deployment');
const bypass = hosted ? process.env.QR_TEST_PREVIEW_BYPASS : undefined;
if (hosted) assert.ok(bypass, 'Provide the preview automation credential through QR_TEST_PREVIEW_BYPASS, never a URL');
const authHeaders = bypass ? { 'x-vercel-protection-bypass': bypass } : {};
const request = (url, options = {}) => {
  assert.equal(new URL(url).origin, base, 'Do not forward preview credentials to other origins');
  return fetch(url, { redirect: 'error', ...options, headers: { ...authHeaders, ...options.headers } });
};
const output = new URL(hosted ? '../outputs/private-preview/' : '../outputs/end-to-end/', import.meta.url).pathname;
const session = await (await request(base + '/api/session')).json();
assert.equal(session.mode, hosted ? 'private' : 'local', 'This verifier never creates or uses an app account');
await fs.mkdir(output, { recursive: true });
// Rasterize the existing brand asset to exercise the real file picker and normalization.
const brand = await sharp(new URL('../public/mastra-logo.svg', import.meta.url).pathname)
  .resize({ width: 960 }).png().toBuffer();
await sharp({ create: { width: 1024, height: 320, channels: 4, background: '#020202' } })
  .composite([{ input: brand, gravity: 'centre' }]).png().toFile(output + 'upload-logo.png');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
if (hosted) {
  // Establish a host-scoped protection cookie once; never attach the bypass
  // credential to third-party fonts, images, or a redirect destination.
  await page.request.get(base, { headers: { ...authHeaders, 'x-vercel-set-bypass-cookie': 'true' }, maxRedirects: 0 });
}
const errors = [];
const writes = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => {
  if (request.url().includes('/api/codes') && ['POST', 'PATCH'].includes(request.method())) writes.push(request.url());
});
let code;
const name = `End-to-end temporary ${Date.now()}`;
const event = name + ' event';
const initial = 'https://www.mastrabooks.dev/?review=before#books';
const updated = 'https://www.mastrabooks.dev/?review=after#books';
const phoneUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const api = async path => {
  const response = await request(base + path);
  assert.equal(response.status, 200);
  return response.json();
};
const record = async () => (await api('/api/codes')).codes.find(item => item.id === code.id);
const report = async () => api('/api/analytics?days=30&codeId=' + code.id);
const screenshot = async filename => {
  const dismiss = page.getByRole('button', { name: 'Dismiss notification', exact: true });
  if (await dismiss.isVisible()) await dismiss.click();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.querySelectorAll('.qr-stage img')].every(image => image.complete && image.naturalWidth));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: output + filename + '.png', fullPage: true });
};
const save = async method => {
  const responsePromise = page.waitForResponse(response => response.url().includes('/api/codes') && response.request().method() === method);
  await page.locator('.preview-panel > button.primary').click();
  const response = await responsePromise;
  assert.equal(response.status(), method === 'POST' ? 201 : 200, await response.text());
  const saved = (await response.json()).code;
  await page.getByRole('button', { name: 'Download PNG', exact: true }).waitFor();
  return saved;
};
const decode = async path => {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data;
};
const checkRedirect = async (method, destination) => {
  const response = await request(base + '/q/' + code.slug, { method, redirect: 'manual', headers: { 'user-agent': phoneUA } });
  assert.equal(response.status, 302);
  assert.match(response.headers.get('cache-control'), /no-store/);
  const actual = new URL(response.headers.get('location'));
  const expected = new URL(destination);
  if (session.booksPreviewOrigin && expected.pathname === '/' && ['mastrabooks.dev', 'www.mastrabooks.dev'].includes(expected.hostname)) {
    const preview = new URL(session.booksPreviewOrigin);
    expected.protocol = preview.protocol;
    expected.host = preview.host;
    assert.equal(actual.searchParams.has('qr_ref'), method === 'GET', 'Only recorded visits receive attribution');
  }
  assert.equal(actual.origin, expected.origin);
  assert.equal(actual.pathname, expected.pathname);
  assert.equal(actual.searchParams.get('review'), expected.searchParams.get('review'));
  assert.equal(actual.hash, expected.hash);
  for (const [key, value] of Object.entries(code.utm)) {
    if (key !== 'enabled') assert.equal(actual.searchParams.get('utm_' + key), value);
  }
};

try {
  await page.goto(base, { waitUntil: 'networkidle' });
  if (hosted) {
    assert.equal(await page.getByRole('button', { name: 'Sign in', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Sign out', exact: true }).count(), 0);
  }
  await page.getByLabel('QR code name').fill(name);
  await page.getByLabel('Destination URL').fill(initial);
  await page.getByLabel('Event or campaign').fill(event);
  await page.getByLabel('Placement', { exact: false }).fill('Book table');
  await page.getByRole('tab', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'After hours', exact: true }).click();
  await page.getByRole('button', { name: 'Your logo', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles(output + 'upload-logo.png');
  await page.getByAltText('Uploaded logo', { exact: true }).waitFor();
  await page.getByText('Advanced design', { exact: true }).click();
  await page.getByLabel('Frame caption', { exact: true }).fill('PICK UP YOUR MASTRA BOOK');
  await page.getByText('Advanced design', { exact: true }).click();
  code = await save('POST');
  const trackingLink = base + '/q/' + code.slug;
  assert.equal(await page.getByLabel('Tracking link', { exact: true }).inputValue(), trackingLink);
  assert.equal(code.design.logo, 'upload');
  assert.match(code.design.logoData, /^data:image\/png;base64,/);
  const logo = await sharp(Buffer.from(code.design.logoData.split(',')[1], 'base64')).metadata();
  assert.equal(logo.width, 256, 'Uploads are normalized, not kept at their original size');
  assert.ok(logo.height <= 256);
  assert.deepEqual((await record()).design, code.design);
  assert.equal((await report()).totalScans, 0);
  await screenshot('saved-upload-desktop');

  if (hosted) {
    const fresh = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
    try {
      await fresh.request.get(base, { headers: { ...authHeaders, 'x-vercel-set-bypass-cookie': 'true' }, maxRedirects: 0 });
      const reopened = await fresh.newPage();
      await reopened.goto(base, { waitUntil: 'networkidle' });
      await reopened.getByRole('button', { name: 'Your QR codes', exact: true }).click();
      await reopened.getByRole('button', { name, exact: true }).click();
      assert.equal(await reopened.getByLabel('Tracking link', { exact: true }).inputValue(), trackingLink);
      await reopened.getByRole('tab', { name: 'Design', exact: true }).click();
      assert.equal(await reopened.getByAltText('Uploaded logo', { exact: true }).getAttribute('src'), code.design.logoData);
      assert.equal((await fresh.cookies()).some(cookie => cookie.name.startsWith('sb-') && cookie.name.includes('auth-token')), false, 'Private review must not create an app login session');
    } finally { await fresh.close(); }
  }

  // Reopen after a full browser reload to rule out a transient client-only logo.
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Your QR codes', exact: true }).click();
  await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('tab', { name: 'Design', exact: true }).click();
  assert.equal(await page.getByAltText('Uploaded logo', { exact: true }).getAttribute('src'), code.design.logoData);
  const beforeDownloads = writes.length;
  for (const format of ['PNG', 'SVG', 'PDF']) {
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: format === 'PNG' ? 'Download PNG' : format, exact: true }).click();
    const download = await pending;
    assert.equal(await download.failure(), null);
    await download.saveAs(output + 'export.' + format.toLowerCase());
  }
  assert.equal(writes.length, beforeDownloads, 'Downloads cannot save or mutate the code');
  assert.equal(await decode(output + 'export.png'), trackingLink);
  assert.equal((await report()).totalScans, 0, 'Creating and exporting do not count as scans');
  const logoSha256 = createHash('sha256').update(Buffer.from(code.design.logoData.split(',')[1], 'base64')).digest('hex');
  await fs.writeFile(output + 'expected.json', JSON.stringify({ trackingLink, logoSha256, files: ['export.png', 'export.svg', 'export.pdf'] }, null, 2));
  console.log('Downloads ready for independent PNG/SVG/PDF verification:', trackingLink);

  await checkRedirect('GET', initial);
  assert.equal((await report()).totalScans, 1);
  await page.getByRole('tab', { name: 'Content', exact: true }).click();
  await page.getByLabel('Destination URL').fill(updated);
  assert.equal(await page.locator('.preview-panel > button.primary').innerText(), 'Save changes');
  for (const format of ['SVG', 'PDF']) assert.equal(await page.getByRole('button', { name: format, exact: true }).isDisabled(), true);
  await checkRedirect('HEAD', initial);
  assert.equal((await report()).totalScans, 1, 'HEAD must not count and unsaved edits must not change the redirect');
  const saved = await save('PATCH');
  assert.equal(saved.id, code.id);
  assert.equal(saved.slug, code.slug, 'Editing a destination must preserve the printed QR URL');
  assert.equal(saved.destination, updated);
  assert.deepEqual(saved.design, code.design, 'Destination edits preserve uploaded logo and styling');
  assert.equal(await page.getByLabel('Tracking link', { exact: true }).inputValue(), trackingLink);
  await checkRedirect('GET', updated);
  const finalReport = await report();
  assert.equal(finalReport.totalScans, 2);
  assert.equal(finalReport.byDay.reduce((sum, day) => sum + day.scans, 0), 2);
  assert.deepEqual(finalReport.byEvent, [{ name: event, scans: 2 }]);
  assert.deepEqual(finalReport.byDevice, [{ name: 'Mobile', scans: 2 }]);
  if (!hosted) assert.deepEqual(finalReport.byCountry, [{ name: 'Unknown', scans: 2 }]);
  assert.equal(finalReport.byCountry.reduce((sum, item) => sum + item.scans, 0), 2);
  assert.equal(finalReport.recent.length, 2);
  assert.equal((await record()).scans, 2);

  await page.getByRole('button', { name: 'Scan analytics', exact: true }).click();
  await page.getByLabel('Filter analytics by event', { exact: true }).selectOption(event);
  const reportResponse = page.waitForResponse(response => response.url().includes('/api/analytics?') && response.url().includes('codeId=' + code.id));
  await page.getByLabel('Filter analytics by QR code', { exact: true }).selectOption(code.id);
  assert.equal((await (await reportResponse).json()).totalScans, 2);
  const total = page.locator('.stat-card').filter({ hasText: 'Total scans' }).locator('strong');
  await total.getByText('2', { exact: true }).waitFor();
  await screenshot('analytics-desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('Break down scans by', { exact: false }).selectOption('device');
  assert.equal(await page.locator('#scan-breakdowns > div:visible .bar-row strong').innerText(), '2');
  await screenshot('analytics-mobile');
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Your QR codes', exact: true }).click();
  await page.getByRole('button', { name, exact: true }).click();
  assert.equal(await page.getByLabel('Destination URL').inputValue(), updated);
  assert.equal(await page.getByLabel('Tracking link', { exact: true }).inputValue(), trackingLink);
  assert.deepEqual(errors, [], 'No browser runtime errors');
  await fs.writeFile(output + 'workflow-report.json', JSON.stringify({ passed: true, trackingLink, uploadedLogo: { width: logo.width, height: logo.height }, destinationBefore: initial, destinationAfter: updated, downloads: ['PNG', 'SVG', 'PDF'], countedVisits: 2, device: 'Mobile', geography: hosted ? 'Approximate hosting-provider location' : 'Unknown (local review)', browserErrors: errors }, null, 2));
} catch (error) {
  await page.screenshot({ path: output + 'workflow-failure.png', fullPage: true }).catch(() => {});
  throw error;
} finally {
  try {
    if (code) {
      const beforeArchive = await report();
      await archiveVerificationCode({ base, code, request: (path, options) => request(base + path, options), output });
      assert.equal((await report()).totalScans, beforeArchive.totalScans, 'Archived code reports retain scan history');
      assert.equal((await request(base + '/q/' + code.slug, { redirect: 'manual' })).status, 410, 'Archived links stop new visits');
    }
  } finally { await browser.close(); }
}
console.log('PASS: create, real logo upload, save/reopen, three downloads, stable destination change, two attributed visits, desktop/mobile analytics, and archival retaining history. Exact operator cleanup is recorded in fixture-cleanup-<code-id>.json. Account setup untouched.');
