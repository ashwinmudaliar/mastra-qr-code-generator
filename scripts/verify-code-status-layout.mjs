import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Browser fixtures only: no codes, scans, requests, or accounts are written.
const base = process.env.QR_UI_TEST_URL || 'http://127.0.0.1:3147';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Use a local development server');
const output = new URL('../outputs/code-status-layout/', import.meta.url).pathname;
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.QR_BROWSER_PATH ? { executablePath: process.env.QR_BROWSER_PATH } : {}) });
const page = await browser.newPage({ viewport: { width: 320, height: 900 }, reducedMotion: 'reduce', locale: 'en-US', timezoneId: 'UTC' });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const timestamp = '2026-11-18T12:00:00.000Z';
const design = { foreground: '#020202', background: '#ffffff', gradient: 'none', gradientColor: '#286748', gradientRotation: 45, eyeColor: '#020202', dots: 'rounded', corners: 'rounded', eyes: 'square', logo: 'mastra', logoData: '', logoSize: 0.18, frame: 'none', frameColor: '#020202', caption: 'SCAN FOR YOUR FREE BOOK' };
const codes = ['active', 'paused', 'expired', 'archived'].map((state, index) => ({
  id: `00000000-0000-4000-8000-00000000000${index + 1}`, slug: `layouttest0${index + 1}`, name: `${state} conference book table`,
  destination: 'https://www.mastrabooks.dev/', event: 'Developer community conference 2027', book: 'Both books', placement: 'Book table',
  updatedAt: timestamp, createdAt: timestamp, scans: 8, status: ['paused', 'archived'].includes(state) ? 'paused' : 'active',
  expiresAt: state === 'expired' ? '2000-11-18T12:00:00.000Z' : null, archivedAt: state === 'archived' ? timestamp : null,
  design, utm: { enabled: false, source: '', medium: '', campaign: '', content: '' },
}));
const totals = { requests: 4, booksRequested: 8, booksShipped: 8, deliveredOrders: 4, needsAttention: 0 };
let connected = true;
await page.route('**/api/**', async route => {
  const url = new URL(route.request().url());
  const json = body => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  if (url.pathname === '/api/session') return json({ configured: true, mode: 'private', user: { id: 'fixture', email: 'Private preview' } });
  if (url.pathname === '/api/codes') return json({ codes });
  if (url.pathname === '/api/fulfillment') return json(connected ? {
    status: 'connected', report: { version: 1, preview: true, updatedAt: timestamp, totals,
      byCode: codes.map(code => ({ codeId: code.id, event: code.event, book: code.book, placement: code.placement, requests: 1, booksRequested: 2, booksShipped: 2, deliveredOrders: 1, needsAttention: 0 })),
      byCountry: [], byCity: [], coverage: { trackedRequests: 4, untrackedDeliveryRequests: 0 },
    },
  } : { status: 'not_configured', report: null });
  errors.push(`Unexpected API request ${url.pathname}`);
  return route.abort();
});

const measurements = [];
try {
  for (const withRequests of [true, false]) {
    connected = withRequests;
    await page.goto(base);
    await expect(page.locator('.codes-table td[data-label="Scans"]').first()).toHaveText('8');
    // Wait for the populated Requests cells: the regression only appears after this response.
    await expect(page.locator('.codes-table td[data-label="Requests"]')).toHaveCount(withRequests ? 3 : 0);
    for (const filter of ['current', 'archived']) {
      await page.getByLabel('Filter QR code status').selectOption(filter);
      await expect(page.locator('.codes-table td[data-label="Status"]')).toHaveCount(filter === 'archived' ? 1 : 3);
      await expect(page.locator('.codes-table .thumb img')).toHaveCount(filter === 'archived' ? 1 : 3);
      await page.locator('.codes-table .thumb img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
      if (filter === 'archived') await expect(page.locator('.status-archived')).toHaveText('Archived Nov 18, 2026');
      for (const width of [320, 360, 390, 430, 1100, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(() => document.fonts.ready);
        const measured = await page.evaluate(() => {
          const cells = [...document.querySelectorAll('.codes-table td[data-label="Status"]')];
          return {
            width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
            statuses: cells.map(cell => {
              const status = cell.querySelector('.status');
              const rect = status.getBoundingClientRect();
              return { text: status.textContent, fontSize: parseFloat(getComputedStyle(status).fontSize), right: rect.right, cellRight: cell.getBoundingClientRect().right, clipped: status.scrollWidth > status.clientWidth + 1 };
            }),
          };
        });
        measurements.push({ filter, withRequests, ...measured });
        await page.screenshot({ path: `${output}${filter}-${withRequests ? 'requests' : 'scans'}-${width}.png`, fullPage: true });
        assert.equal(measured.scrollWidth, width, `${filter}, requests=${withRequests}, ${width}px: page overflows`);
        for (const status of measured.statuses) {
          assert.ok(status.fontSize >= 12, `${status.text}: readable type`);
          assert.ok(status.right <= width && status.right <= status.cellRight + 1, `${status.text}: contained status`);
          assert.equal(status.clipped, false, `${status.text}: full label visible`);
        }
      }
    }
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(output + 'measurements.json', JSON.stringify(measurements, null, 2));
  console.log('PASS current and archived statuses, with and without request totals, at 320/360/390/430/1100/1440px');
} finally {
  await browser.close();
}
