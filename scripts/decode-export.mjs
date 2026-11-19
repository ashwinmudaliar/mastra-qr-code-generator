import sharp from 'sharp';
import jsQR from 'jsqr';

// jsQR can miss large, styled artwork at native export dimensions. Keep that
// result visible, and require the same saved URL at every practical scan size.
export async function decodeExport(file, expected) {
  const readings = [];
  for (const width of [null, 800, 1200, 1600]) {
    const image = sharp(file);
    if (width) image.resize({ width, withoutEnlargement: true });
    const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const url = jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data ?? null;
    readings.push({ scale: width ?? 'native', width: info.width, height: info.height, url, matches: url === expected });
  }
  return {
    readings,
    // A decoded but incorrect native URL is always a failure.
    matches: (readings[0].url === null || readings[0].matches) && readings.slice(1).every(reading => reading.matches),
  };
}
