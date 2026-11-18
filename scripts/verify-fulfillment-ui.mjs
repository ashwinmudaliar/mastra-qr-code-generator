import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Browser-only fixtures: no requests, accounts, scans, or shipments are created.
const base = process.env.QR_UI_TEST_URL || 'http://127.0.0.1:3156';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Use a local development server');
const output = new URL('../outputs/fulfillment-ui/', import.meta.url).pathname;
await fs.mkdir(output, { recursive: true });
// QR_BROWSER_PATH optionally points at a preinstalled Chromium when the pinned Playwright build is absent.
const browser = await chromium.launch({ headless: true, ...(process.env.QR_BROWSER_PATH ? { executablePath: process.env.QR_BROWSER_PATH } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const codeId = '00000000-0000-4000-8000-000000000001';
const event = 'Developer community conference — San Francisco 2027';
const now = new Date().toISOString();
const design = { foreground: '#020202', background: '#ffffff', gradient: 'none', gradientColor: '#286748', gradientRotation: 45, eyeColor: '#020202', dots: 'rounded', corners: 'rounded', eyes: 'square', logo: 'mastra', logoData: '', logoSize: 0.18, frame: 'none', frameColor: '#020202', caption: 'SCAN FOR YOUR FREE BOOK' };
// The code was renamed after requests were made: requests keep their frozen labels.
const codes = [{ id: codeId, slug: 'fulfillment1', name: 'Community book table — a long name for readability', destination: 'https://www.mastrabooks.dev/', event: 'Renamed campaign', book: 'Both books', placement: 'Book table', updatedAt: now, createdAt: now, scans: 8, status: 'active', expiresAt: null, archivedAt: null, design, utm: { enabled: true, source: 'event', medium: 'qr', campaign: '', content: '' } }];
const first = { codeId, event, book: 'Both books', placement: 'Book collection and fulfillment table', requests: 2, booksRequested: 23, booksShipped: 20, deliveredOrders: 1, needsAttention: 1 };
const second = { ...first, event: 'Developer meetup', requests: 1, booksRequested: 2, booksShipped: 0, deliveredOrders: 0, needsAttention: 1 };
const metricKeys = ['requests', 'booksRequested', 'booksShipped', 'deliveredOrders', 'needsAttention'];
const totals = rows => Object.fromEntries(metricKeys.map(key => [key, rows.reduce((sum, row) => sum + row[key], 0)]));
let mode = 'connected';
const calls = [];
await page.route('**/api/**', async route => {
  const url = new URL(route.request().url());
  const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  if (url.pathname === '/api/session') return json({ configured: true, mode: 'private', user: { id: 'fixture', email: 'Private preview' }, booksPreviewOrigin: 'https://books-preview.example.invalid' });
  if (url.pathname === '/api/codes') return json({ codes });
  if (url.pathname === '/api/analytics') return json({ totalScans: 8, activeCodes: 1, countries: 1, periodDays: Number(url.searchParams.get('days')), byDay: [{ date: now.slice(0, 10), scans: 8 }], byCountry: [{ name: 'United States', scans: 8 }], byCity: [{ name: 'San Francisco', scans: 8 }], byDevice: [{ name: 'Mobile', scans: 8 }], byEvent: [{ name: event, scans: 8 }], byBook: [{ name: 'Both books', scans: 8 }], byCode: [{ id: codeId, name: codes[0].name, scans: 8 }], recent: [] });
  if (url.pathname === '/api/fulfillment') {
    calls.push(url.search);
    if (mode === 'failure') return json({ status: 'unavailable', report: null, message: 'Temporary reporting outage.' }, 200);
    if (mode === 'not_configured') return json({ status: 'not_configured', report: null });
    const rows = mode === 'empty' ? [] : [first, second].filter(row => !url.searchParams.has('event') || row.event === url.searchParams.get('event'));
    return json({ status: 'connected', previewOrigin: 'https://books-preview.example.invalid', report: { version: 1, preview: true, updatedAt: now, totals: totals(rows), byCode: rows, byCountry: [{ name: 'United States', ...totals(rows) }], byCity: [{ name: 'Austin', ...totals(rows) }], coverage: { trackedRequests: rows.length ? 2 : 0, untrackedDeliveryRequests: rows.length ? 1 : 0 } } });
  }
  errors.push(`Unexpected API request ${url.pathname}`);
  return route.abort();
});

const metric = key => page.locator(`.kpis [data-metric=${key}] dd`);
const requestCount = metric('requests');
const refresh = page.getByRole('button', { name: 'Refresh analytics', exact: true });
const group = name => page.getByRole('group', { name, exact: true });
const scanPlaces = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Where scans came from', exact: true }) });
const shipPlaces = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Where books were sent', exact: true }) });
const table = page.locator('table.by-table');
try {
  await page.goto(base);
  // The private-preview note now sits beside the artwork, only when the destination is the Books home page.
  await page.getByRole('button', { name: 'New code', exact: true }).first().click();
  await expect(page.locator('#artwork-panel').getByText(/Books links open the test form/)).toBeVisible();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Results', exact: true }).click();
  await expect(requestCount).toHaveText('3');
  await expect(page.getByText('Book requests simulated in preview', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Test requests' })).toHaveAttribute('href', 'https://books-preview.example.invalid/qr-preview');
  // Requests made under a code's earlier event label nest under its current event.
  await expect(table.getByText(`Requested under its earlier label “${event}”`, { exact: true })).toBeVisible();
  await expect(table.getByText('Renamed campaign', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Filter analytics by event').locator('option', { hasText: event })).toHaveCount(1);
  await group('Compare by').getByRole('button', { name: 'Code', exact: true }).click();
  // One row per code: both frozen-label snapshots are added together.
  await expect(table.getByText(codes[0].name, { exact: true })).toHaveCount(1);
  await expect(table.locator('tbody tr').first().locator('td[data-label=Requests]')).toHaveText('3');
  await group('Compare by').getByRole('button', { name: 'Event', exact: true }).click();
  await group('Group shipping destinations by').getByRole('button', { name: 'City', exact: true }).click();
  await expect(shipPlaces.getByText('Austin', { exact: true })).toBeVisible();
  await expect(metric('deliveredOrders').locator('xpath=..')).toContainText('1 untracked');

  const measurements = [];
  for (const width of [1440, 1100, 320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole('heading', { name: 'Scans per day', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'By event', exact: true })).toBeVisible();
    if (width <= 760) {
      await group('Break down scans by').getByRole('button', { name: 'City', exact: true }).click();
      await expect(scanPlaces.getByText('San Francisco', { exact: true })).toBeVisible();
      await expect(scanPlaces.getByText('United States', { exact: true })).toHaveCount(0);
    }
    const measured = await page.evaluate(phone => {
      const shown = el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
      const root = document.querySelector('main');
      const text = [...root.querySelectorAll('*')].filter(el => shown(el) && !el.closest('option,svg') && [...el.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim()));
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        tiny: text.filter(el => parseFloat(getComputedStyle(el).fontSize) < 12).map(el => el.textContent.trim()),
        // Desktop controls are 36–40px by design; the 44px target applies to touch widths.
        smallControls: phone ? [...root.querySelectorAll('select,button,a,summary')].filter(shown).filter(el => !el.disabled && el.getBoundingClientRect().height < 44).map(el => el.getAttribute('aria-label') || el.textContent.trim()) : [],
      };
    }, width <= 760);
    assert.deepEqual(measured, { overflow: false, tiny: [], smallControls: [] }, `Readable results at ${width}px`);
    measurements.push({ width, ...measured });
    await page.screenshot({ path: `${output}results-${width}.png`, fullPage: true });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  mode = 'failure';
  await refresh.click();
  await expect(page.getByText(/Couldn.t refresh · showing/)).toBeVisible();
  await expect(requestCount).toHaveText('3');
  await page.getByLabel('Analytics period').selectOption('7');
  await expect(page.getByRole('alert').filter({ hasText: /Use Refresh to try again/ })).toBeVisible();
  await expect(requestCount).toHaveText('—');

  mode = 'connected';
  await refresh.click();
  await expect(requestCount).toHaveText('3');
  await expect(page.getByLabel('Analytics period')).toHaveValue('7');
  await expect(group('Break down scans by').getByRole('button', { name: 'City', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Filter analytics by event').selectOption(event);
  await expect(requestCount).toHaveText('2');
  await expect(page.getByText('Book requests keep the event label they were made under. Scans use each code’s current label.')).toBeVisible();
  await page.getByLabel('Filter analytics by QR code').selectOption(codeId);
  await expect(refresh).toBeEnabled();
  assert.ok(calls.at(-1).includes(`codeId=${codeId}`));
  assert.ok(calls.at(-1).includes('days=7'));

  mode = 'empty';
  await refresh.click();
  await expect(requestCount).toHaveText('0');
  mode = 'not_configured';
  await refresh.click();
  await expect(page.getByText('Book requests aren’t connected in this environment.')).toBeVisible();
  await expect(requestCount).toHaveCount(0);
  assert.deepEqual(errors, []);
  await fs.writeFile(output + 'measurements.json', JSON.stringify(measurements, null, 2));
  console.log('PASS outcome metrics, frozen campaign labels nested under current events, preview tag and test-request link, shipping/scan geography selectors, stale/filter isolation, refresh, empty/disconnected states, and six responsive widths');
} finally {
  await context.close();
  await browser.close();
}
