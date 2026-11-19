// Independently decode real downloads. No browser session or network access required.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { decodeExport } from './decode-export.mjs';

const usage = `Usage: node scripts/verify-export-artifacts.mjs [expected.json]

Defaults to outputs/end-to-end/expected.json from scripts/verify-e2e.mjs.
The manifest contains trackingLink, files (one PNG, SVG, and PDF), and
optionally logoSha256 (the saved, normalized PNG logo's SHA-256 digest).
File paths are relative to the manifest. Requires Poppler's pdfinfo and
pdftoppm on PATH. Writes verification-* artifacts beside the manifest.
Inspect verification-comparison.png after the automated checks pass.`;

function poppler(command, args) {
  try {
    return execFileSync(command, args, { encoding: 'utf8', timeout: 30_000 });
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`Missing ${command}. Install Poppler to verify PDF rendering.`, { cause: error });
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    console.log(usage);
    return;
  }
  assert.ok(args.length <= 1 && !args[0]?.startsWith('-'), usage);
  const manifest = args[0]
    ? path.resolve(args[0])
    : fileURLToPath(new URL('../outputs/end-to-end/expected.json', import.meta.url));
  const expected = JSON.parse(await fs.readFile(manifest, 'utf8'));
  assert.equal(typeof expected.trackingLink, 'string', 'Manifest needs a trackingLink');
  assert.match(expected.trackingLink, /^https?:\/\//, 'Expected tracking link must be an HTTP(S) URL');
  new URL(expected.trackingLink);
  assert.ok(Array.isArray(expected.files) && expected.files.length === 3, 'Manifest needs exactly three export files');
  assert.ok(expected.files.every(file => typeof file === 'string'), 'Export filenames must be strings');
  if (expected.logoSha256 !== undefined) assert.match(expected.logoSha256, /^[a-f0-9]{64}$/i, 'Invalid expected logo SHA-256');

  const folder = path.dirname(manifest);
  const files = {};
  for (const extension of ['png', 'svg', 'pdf']) {
    const matches = expected.files.filter(file => path.extname(file).toLowerCase() === '.' + extension);
    assert.equal(matches.length, 1, `Manifest needs exactly one ${extension.toUpperCase()} file`);
    files[extension] = path.resolve(folder, matches[0]);
    assert.ok((await fs.stat(files[extension])).isFile(), `Not a file: ${files[extension]}`);
  }

  const svg = await fs.readFile(files.svg, 'utf8');
  const logos = [...svg.matchAll(/<image\b[^>]*\bhref="data:image\/png;base64,([A-Za-z0-9+/=]+)"/g)];
  assert.equal(logos.length, 1, 'Downloaded SVG must embed exactly one uploaded PNG logo');
  const logoBytes = Buffer.from(logos[0][1], 'base64');
  const logoMetadata = await sharp(logoBytes).metadata();
  assert.equal(logoMetadata.format, 'png', 'Embedded logo must be PNG');
  assert.ok(logoMetadata.width > 0 && logoMetadata.width <= 256 && logoMetadata.height > 0 && logoMetadata.height <= 256,
    'Embedded logo must retain the normalized dimensions (at most 256px)');
  const logoSha256 = createHash('sha256').update(logoBytes).digest('hex');
  if (expected.logoSha256 !== undefined) {
    assert.equal(logoSha256, expected.logoSha256.toLowerCase(), 'Exported logo differs from the saved normalized upload');
  }
  await fs.writeFile(path.join(folder, 'verification-embedded-logo.png'), logoBytes);

  const pdfInfo = poppler('pdfinfo', [files.pdf]);
  const pages = Number(pdfInfo.match(/^Pages:\s+(\d+)/m)?.[1]);
  assert.equal(pages, 1, 'PDF download must contain exactly one page');
  const svgRendered = path.join(folder, 'verification-svg.png');
  const pdfPrefix = path.join(folder, 'verification-pdf');
  await sharp(files.svg).png().toFile(svgRendered);
  poppler('pdftoppm', ['-f', '1', '-singlefile', '-r', '300', '-png', files.pdf, pdfPrefix]);

  const results = [];
  const tiles = [];
  for (const [format, file] of [['PNG', files.png], ['SVG', svgRendered], ['PDF', pdfPrefix + '.png']]) {
    results.push({ format, file, ...await decodeExport(file, expected.trackingLink) });
    const tile = await sharp(file).resize({ width: 580, height: 680, fit: 'contain', background: '#e5e7eb' }).png().toBuffer();
    tiles.push({ input: tile, left: tiles.length * 600 + 10, top: 50 });
  }
  const labels = Buffer.from('<svg width="1800" height="760"><rect width="1800" height="760" fill="#e5e7eb"/><g font-family="Arial" font-size="24" text-anchor="middle" fill="#111827"><text x="300" y="35">PNG download</text><text x="900" y="35">SVG rendered</text><text x="1500" y="35">PDF rendered at 300 dpi</text></g></svg>');
  const comparison = path.join(folder, 'verification-comparison.png');
  await sharp(labels).composite(tiles).png().toFile(comparison);
  const report = {
    expected: expected.trackingLink,
    results,
    logo: { width: logoMetadata.width, height: logoMetadata.height, sha256: logoSha256, matchesExpected: expected.logoSha256 !== undefined ? true : null },
    pdf: { pages, renderDpi: 300, info: pdfInfo },
    visualReviewArtifact: comparison,
  };
  await fs.writeFile(path.join(folder, 'verification-report.json'), JSON.stringify(report, null, 2) + '\n');
  for (const result of results) assert.equal(result.matches, true, `${result.format} artwork did not decode to the saved tracking link at every verification size`);
  console.log('PASS: PNG, rendered SVG, and rendered one-page PDF decode to the saved tracking link at 800, 1200, and 1600px. Native-size readings are retained in the report.');
  console.log(expected.logoSha256 !== undefined
    ? 'PASS: embedded PNG logo matches the saved normalized upload byte for byte.'
    : 'Logo embedded; manifest has no logoSha256, so saved-upload identity was not checked.');
  console.log(`Inspect logo, styling, and caption visually: ${comparison}`);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
