import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

/** Application DELETE now archives. Record exact synthetic identities for a
 * separate operator cleanup; never add a permanent-delete application route. */
export async function archiveVerificationCode({ base, code, request, output }) {
  const url = new URL(base);
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    /^https:\/\/mastra-qr-studio-[a-z0-9]+-ashwinm546\.vercel\.app$/.test(url.origin), 'Use the selected review environment');
  assert.match(code.id, /^[0-9a-f-]{36}$/i);
  assert.match(code.slug, /^[A-Za-z0-9_-]{12}$/);
  await fs.mkdir(output, { recursive: true });
  const manifest = {
    origin: url.origin, recordedAt: new Date().toISOString(),
    qrCodes: [{ id: code.id, slug: code.slug, name: code.name }],
    disposition: 'Operator cleanup pending; remove only these synthetic code IDs and their scans.',
    archived: false,
  };
  // Preserve the exact identity even if the archive request itself fails.
  // A fresh fixture gets its own receipt, so retrying a failed verifier cannot
  // overwrite the identity of a previous run that still needs operator cleanup.
  const path = output + `fixture-cleanup-${code.id}.json`;
  await fs.writeFile(path, JSON.stringify(manifest, null, 2));
  const archived = await request('/api/codes/' + code.id, { method: 'DELETE', headers: { Origin: url.origin } });
  assert.equal(archived.status, 200, 'Temporary code must be archived');
  const response = await request('/api/codes');
  assert.equal(response.status, 200);
  const retained = (await response.json()).codes.find(item => item.id === code.id);
  assert.ok(retained?.archivedAt, 'Archived verification identity must remain available to reports');
  assert.equal(retained.status, 'paused');
  assert.equal(retained.slug, code.slug);
  manifest.archived = true;
  await fs.writeFile(path, JSON.stringify(manifest, null, 2));
  console.log(`Temporary QR archived; exact operator cleanup manifest: ${path}`);
  return retained;
}
