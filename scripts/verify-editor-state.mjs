import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import jsQR from 'jsqr';

// These cases exercise real browser interactions with isolated API fixtures.
// No account, stored code, scan, or production service is created or changed.
const base = process.env.QR_UI_TEST_URL || 'http://127.0.0.1:3147';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Use a local development server');
// QR_BROWSER_PATH optionally points at a preinstalled Chromium when the pinned Playwright build is absent.
const browser = await chromium.launch({ headless: true, ...(process.env.QR_BROWSER_PATH ? { executablePath: process.env.QR_BROWSER_PATH } : {}) });
const failures = [];
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

async function fixture(viewport = { width: 1440, height: 1000 }) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const state = { codes: [], scans: 0, holdSave: false, failSave: false, started: deferred(), release: deferred(), analyticsRequests: [] };
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/session') return json({ configured: true, mode: 'local', user: { id: 'browser-fixture', email: 'fixture@example.invalid' } });
    if (url.pathname === '/api/codes' && request.method() === 'GET') return json({ codes: state.codes });
    if (url.pathname.startsWith('/api/codes') && ['POST', 'PATCH'].includes(request.method())) {
      const input = request.postDataJSON();
      state.started.resolve();
      if (state.holdSave) await state.release.promise;
      if (state.failSave) return json({ error: 'Temporary fixture save failure.' }, 500);
      let code;
      if (request.method() === 'POST') {
        const now = new Date().toISOString();
        code = { ...input, id: '00000000-0000-4000-8000-000000000001', slug: 'browsercheck', archivedAt: null, createdAt: now, updatedAt: now, scans: 0 };
        state.codes.push(code);
      } else {
        code = state.codes.find(record => record.id === url.pathname.split('/').at(-1));
        assert.ok(code, 'Updates must target this browser fixture');
        Object.assign(code, input, { updatedAt: new Date().toISOString() });
      }
      return json({ code }, request.method() === 'POST' ? 201 : 200);
    }
    if (url.pathname === '/api/fulfillment') return json({ status: 'not_configured', report: null });
    if (url.pathname === '/api/analytics') {
      state.analyticsRequests.push(url.search);
      const days = Number(url.searchParams.get('days') || 30);
      const today = new Date(); today.setUTCHours(0, 0, 0, 0);
      const byDay = Array.from({ length: days }, (_, index) => ({ date: new Date(today.getTime() - (days - index - 1) * 86400000).toISOString().slice(0, 10), scans: index === days - 1 ? state.scans : 0 }));
      return json({ totalScans: state.scans, activeCodes: state.codes.filter(code => code.status === 'active').length, countries: 0, periodDays: days, byDay, byCountry: [], byCity: [], byDevice: [], byEvent: [], byBook: [], byCode: state.codes.map(code => ({ id: code.id, name: code.name, scans: state.scans })), recent: [] });
    }
    await route.abort();
    throw new Error(`Unexpected API request: ${request.method()} ${url.pathname}`);
  });
  page.on('dialog', dialog => dialog.accept());
  await page.goto(base);
  await page.getByRole('heading', { name: /^Codes/ }).waitFor();
  return { page, state, close: async () => { state.release.resolve(); await context.close(); } };
}

const nameField = page => page.getByLabel('Name', { exact: true });
const nav = (page, name) => page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name, exact: true });
const panelPrimary = page => page.locator('#artwork-panel button.btn.primary');
const barButton = (page, name) => page.locator('.mobile-bar').getByRole('button', { name, exact: true });

async function openNew(page) {
  await page.getByRole('button', { name: 'New code', exact: true }).first().click();
  await nameField(page).waitFor();
}

async function saveFixture(page) {
  await openNew(page);
  await nameField(page).fill('Browser state regression');
  await page.getByLabel('Event', { exact: true }).fill('Browser regression');
  await page.getByRole('button', { name: 'Save code', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Download PNG', exact: true })).toBeEnabled();
}

async function check(name, body) {
  try { await body(); console.log(`PASS ${name}`); }
  catch (error) { failures.push({ name, message: error.message }); console.error(`FAIL ${name}: ${error.message}`); }
}

try {
  await check('unsaved preview encodes the draft placeholder, not the destination', async () => {
    const test = await fixture();
    const { page } = test;
    try {
      await openNew(page);
      await expect(page.getByText('Preview only · not a tracking link', { exact: true })).toBeVisible();
      const image = page.locator('.art-stage .qr-preview img');
      await image.waitFor();
      // Decode the rendered artwork itself; the on-screen draft label deliberately covers its center.
      const svg = await image.evaluate(async element => (await fetch(element.src)).text());
      const { data, info } = await sharp(Buffer.from(svg)).resize(640).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      assert.equal(jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data, base + '/q/draftpreview');
      const scan = await fetch(base + '/q/draftpreview', { redirect: 'manual' });
      assert.equal(scan.status, 404, 'A printed draft must not redirect');
      assert.match(await scan.text(), /unsaved preview/i);
    } finally { await test.close(); }
  });

  await check('pending save protects the draft and navigation', async () => {
    const test = await fixture();
    const { page, state } = test;
    try {
      await openNew(page);
      state.holdSave = true;
      await nameField(page).fill('Pending save');
      const original = await page.getByLabel('Destination URL').inputValue();
      await page.getByRole('button', { name: 'Save code', exact: true }).click();
      await state.started.promise;
      const locked = await page.getByLabel('Destination URL').isDisabled();
      const navigationLocked = await nav(page, 'Codes').isDisabled();
      // Before the fix this edit is accepted, then silently overwritten by the response.
      if (!locked) await page.getByLabel('Destination URL').fill('https://www.mastrabooks.dev/?edited-during-save=1');
      state.release.resolve();
      await expect(page.getByRole('button', { name: 'Download PNG', exact: true })).toBeEnabled();
      assert.equal(locked, true, `Destination was editable during saving; response replaced it with ${await page.getByLabel('Destination URL').inputValue()}`);
      assert.equal(navigationLocked, true, 'Navigation must not replace a draft while saving');
      assert.equal(await page.getByLabel('Destination URL').inputValue(), original);
      await expect(page.getByLabel('Destination URL')).toBeEnabled();
    } finally { await test.close(); }
  });

  await check('failed save unlocks controls and retains edits', async () => {
    const test = await fixture();
    try {
      await openNew(test.page);
      test.state.failSave = true;
      await nameField(test.page).fill('Keep this draft');
      await test.page.getByRole('button', { name: 'Save code', exact: true }).click();
      await expect(test.page.getByRole('alert').filter({ hasText: 'Temporary fixture save failure.' })).toBeVisible();
      await expect(nameField(test.page)).toBeEnabled();
      assert.equal(await nameField(test.page).inputValue(), 'Keep this draft');
      await expect(nav(test.page, 'Codes')).toBeEnabled();
    } finally { await test.close(); }
  });

  await check('phone save with a missing name shows the error at the field', async () => {
    const test = await fixture({ width: 390, height: 844 });
    const { page, state } = test;
    try {
      await openNew(page);
      await barButton(page, 'Save').click();
      const message = page.getByText('Add a name to save this code.', { exact: true });
      await expect(message).toBeVisible();
      await page.waitForFunction(() => document.activeElement?.id === 'field-name');
      await page.waitForTimeout(400);
      const box = await message.boundingBox();
      assert.ok(box && box.y >= 0 && box.y + box.height <= 844, 'The error must be inside the phone viewport');
      assert.equal(await nameField(page).getAttribute('aria-invalid'), 'true');
      assert.equal(state.codes.length, 0, 'Validation must not send a save');
    } finally { await test.close(); }
  });

  await check('pending logo upload locks editing while mobile preview remains available', async () => {
    const test = await fixture({ width: 390, height: 844 });
    const { page, state } = test;
    try {
      await openNew(page);
      await nameField(page).fill('Logo upload fixture');
      await page.getByRole('group', { name: 'Logo' }).getByRole('button', { name: 'Upload', exact: true }).click();
      await page.evaluate(() => {
        const original = HTMLImageElement.prototype.decode;
        HTMLImageElement.prototype.decode = async function () {
          await original.call(this);
          window.__logoPending = true;
          await new Promise(resolve => { window.__releaseLogo = resolve; });
        };
      });
      const buffer = await sharp({ create: { width: 32, height: 32, channels: 4, background: '#143a26' } }).png().toBuffer();
      await page.getByLabel('Logo file').setInputFiles({ name: 'fixture-logo.png', mimeType: 'image/png', buffer });
      await page.waitForFunction(() => window.__logoPending);
      const uploadLocked = await page.getByLabel('Logo file').isDisabled();
      const presetLocked = await page.getByRole('group', { name: 'Presets' }).getByRole('button', { name: /Classic$/ }).isDisabled();
      const navigationLocked = await nav(page, 'Codes').isDisabled();
      await page.getByRole('button', { name: 'Show artwork and downloads', exact: true }).click();
      await expect(panelPrimary(page)).toBeDisabled();
      await expect(panelPrimary(page)).toHaveText('Adding logo…');
      await page.getByRole('button', { name: 'Close preview', exact: true }).click();
      await page.evaluate(() => window.__releaseLogo());
      await expect(page.getByAltText('Uploaded logo')).toBeVisible();
      await expect(page.getByLabel('Logo file')).toBeEnabled();
      assert.equal(uploadLocked, true, 'A second upload must not race the current one');
      assert.equal(presetLocked, true, 'Presets must not replace a design during logo normalization');
      assert.equal(navigationLocked, true, 'Navigation must not move an upload into another draft');
      await barButton(page, 'Save').click();
      await expect(barButton(page, 'Download')).toBeEnabled();
      assert.match(state.codes[0].design.logoData, /^data:image\/png;base64,/);
    } finally { await test.close(); }
  });

  await check('library pause offers undo and survives reopening the editor and changing destination', async () => {
    const test = await fixture();
    const { page, state } = test;
    try {
      await saveFixture(page);
      await nav(page, 'Codes').click();
      const row = page.locator('.codes-table tr').filter({ hasText: 'Browser state regression' });
      const pause = async () => {
        await page.getByRole('button', { name: 'More actions for Browser state regression', exact: true }).click();
        await page.getByRole('menuitem', { name: 'Pause', exact: true }).click();
        await expect(row.locator('.status')).toHaveText('Paused');
      };
      await pause();
      await page.getByRole('button', { name: 'Undo', exact: true }).click();
      await expect(row.locator('.status')).toHaveText('Active');
      assert.equal(state.codes[0].status, 'active', 'Undo restores the stored status');
      await pause();
      await row.getByRole('button', { name: 'Browser state regression', exact: true }).click();
      const editorStatus = await page.getByLabel('Code status').inputValue();
      await page.getByLabel('Destination URL').fill('https://www.mastrabooks.dev/?destination-edited=1');
      await page.getByRole('button', { name: 'Save changes', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Download PNG', exact: true })).toBeEnabled();
      assert.equal(editorStatus, 'paused', `Reopened editor reported ${editorStatus}; saving changed the stored status to ${state.codes[0].status}`);
      assert.equal(state.codes[0].status, 'paused');
      assert.equal(state.codes[0].slug, 'browsercheck');
    } finally { await test.close(); }
  });

  await check('results refresh shows new visits without resetting filters', async () => {
    const test = await fixture({ width: 390, height: 844 });
    const { page, state } = test;
    try {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await saveFixture(page);
      await nav(page, 'Results').click();
      await page.getByLabel('Filter analytics by event').selectOption('Browser regression');
      await page.getByLabel('Analytics period').selectOption('7');
      await page.getByLabel('Filter analytics by QR code').selectOption(state.codes[0].id);
      const total = page.locator('.kpis [data-metric=scans] dd');
      await expect(total).toHaveText('0');
      state.scans = 1;
      const refresh = page.getByRole('button', { name: 'Refresh analytics', exact: true });
      assert.equal(await refresh.count(), 1, 'Results needs an explicit refresh action for new scans');
      await page.setViewportSize({ width: 390, height: 844 });
      await refresh.click();
      await expect(total).toHaveText('1');
      assert.equal(await page.getByLabel('Filter analytics by event').inputValue(), 'Browser regression');
      assert.equal(await page.getByLabel('Analytics period').inputValue(), '7');
      assert.equal(await page.getByLabel('Filter analytics by QR code').inputValue(), state.codes[0].id);
      for (const width of [320, 390, 430, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Results must fit ${width}px`);
      }
    } finally { await test.close(); }
  });
} finally { await browser.close(); }

if (failures.length) {
  console.error(`${failures.length} editor state regression(s) failed.`);
  process.exitCode = 1;
} else console.log('All editor state regressions passed; no stored data changed.');
