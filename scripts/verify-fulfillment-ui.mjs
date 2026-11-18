import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Browser-only fixtures: no requests, accounts, scans, or shipments are created.
const base = process.env.QR_UI_TEST_URL || 'http://127.0.0.1:3156';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Use a local development server');
const output = new URL('../outputs/fulfillment-ui/', import.meta.url).pathname;
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const codeId = '00000000-0000-4000-8000-000000000001';
const event = 'Developer community conference — San Francisco 2027';
const now = new Date().toISOString();
const codes = [{ id: codeId, name: 'Community book table — a long name for readability', event: 'Renamed campaign', book: 'Both books', placement: 'Book table', updatedAt: now, createdAt: now, scans: 8, status: 'active' }];
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

const panel = page.locator('.fulfillment-summary');
const requestCount = panel.locator('.fulfillment-metrics [data-metric=requests] dd');
const refresh = page.getByRole('button', { name: 'Refresh analytics', exact: true });
try {
  await page.goto(base);
  await expect(page.getByText('Saved Books QR links open the private test portal in this preview. No books or emails are sent.')).toBeVisible();
  await page.getByRole('button', { name: 'Scan analytics', exact: true }).click();
  await expect(requestCount).toHaveText('3');
  await expect(panel.getByText('Simulated fulfillment', { exact: true })).toBeVisible();
  await expect(panel.getByRole('link', { name: 'Open test requests ↗' })).toHaveAttribute('href', 'https://books-preview.example.invalid/qr-preview');
  await expect(panel.getByText(event, { exact: true })).toBeVisible();
  await expect(page.getByLabel('Filter analytics by event').locator('option', { hasText: event })).toHaveCount(1);
  await panel.getByLabel('Compare by').selectOption('code');
  await expect(panel.getByText(codes[0].name, { exact: true })).toHaveCount(2);
  await panel.getByLabel('Compare by').selectOption('event');
  await panel.getByText('Shipping destinations', { exact: true }).click();
  await panel.getByLabel('Group by').selectOption('city');
  await expect(panel.getByText('Austin', { exact: true })).toBeVisible();
  await expect(panel.getByText(/Delivery tracking is unavailable for 1 attributed request/)).toBeVisible();
  await panel.getByText('Shipping destinations', { exact: true }).click();

  const measurements = [];
  for (const width of [1440, 1100, 320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole('heading', { name: 'Scans over time', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Scans by event', exact: true })).toBeVisible();
    if (width <= 760) {
      await page.getByLabel('Break down scans by').selectOption('city');
      await expect(page.getByRole('heading', { name: 'Top cities', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Top countries', exact: true })).toBeHidden();
    }
    const measured = await page.evaluate(() => {
      const shown = el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
      const root = document.querySelector('.fulfillment-summary');
      const text = [...root.querySelectorAll('*')].filter(el => shown(el) && !el.closest('option') && [...el.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim()));
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        tiny: text.filter(el => parseFloat(getComputedStyle(el).fontSize) < 12).map(el => el.textContent.trim()),
        smallControls: [...root.querySelectorAll('select,button,a,summary')].filter(shown).filter(el => el.getBoundingClientRect().height < 44).map(el => el.textContent.trim()),
      };
    });
    assert.deepEqual(measured, { overflow: false, tiny: [], smallControls: [] }, `Readable fulfillment at ${width}px`);
    measurements.push({ width, ...measured });
    await panel.screenshot({ path: `${output}fulfillment-${width}.png` });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  mode = 'failure';
  await refresh.click();
  await expect(panel.getByText(/Showing the last successful report for these filters/)).toBeVisible();
  await expect(requestCount).toHaveText('3');
  await page.getByLabel('Analytics period').selectOption('7');
  await expect(panel.getByText(/Use Refresh to try again/)).toBeVisible();
  await expect(requestCount).toHaveCount(0);

  mode = 'connected';
  await refresh.click();
  await expect(requestCount).toHaveText('3');
  await expect(page.getByLabel('Analytics period')).toHaveValue('7');
  await expect(page.getByLabel('Break down scans by')).toHaveValue('city');
  await page.getByLabel('Filter analytics by event').selectOption(event);
  await expect(requestCount).toHaveText('2');
  await expect(page.getByText('Fulfillment keeps the event label from submission. Scan reports use the code’s current label.')).toBeVisible();
  await page.getByLabel('Filter analytics by QR code').selectOption(codeId);
  await expect(refresh).toBeEnabled();
  assert.ok(calls.at(-1).includes(`codeId=${codeId}`));
  assert.ok(calls.at(-1).includes('days=7'));

  mode = 'empty';
  await refresh.click();
  await expect(panel.getByRole('heading', { name: 'No attributed requests yet' })).toBeVisible();
  await expect(requestCount).toHaveText('0');
  mode = 'not_configured';
  await refresh.click();
  await expect(panel.getByText('Fulfillment reporting is not connected in this environment.')).toBeVisible();
  await expect(requestCount).toHaveCount(0);
  assert.deepEqual(errors, []);
  await fs.writeFile(output + 'measurements.json', JSON.stringify(measurements, null, 2));
  console.log('PASS fulfillment metrics, frozen campaign labels, preview notice, destination selector, stale/filter isolation, refresh, empty/disconnected states, and six responsive widths');
} finally {
  await context.close();
  await browser.close();
}
