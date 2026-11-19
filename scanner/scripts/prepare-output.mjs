import { mkdir, readdir, writeFile } from "node:fs/promises";

// Vercel requires nonempty static output for an "Other" project. Publish only
// this generated error page; never let the project root become static output.
const output = new URL("../public/", import.meta.url);
await mkdir(output, { recursive: true });
if ((await readdir(output)).some(name => name !== "404.html")) {
  throw new Error("The scan-only service may publish only its generated 404 page.");
}
await writeFile(new URL("404.html", output), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mastra QR</title><body style="font:16px/1.5 system-ui;background:#020202;color:#f0f0f0;display:grid;min-height:95vh;place-items:center;margin:0"><main style="max-width:400px;padding:32px"><h1 style="font-size:28px;line-height:1.2">This code isn’t available</h1><p>The link may be incomplete. Check the code or ask your event organizer.</p><a href="https://www.mastrabooks.dev" style="color:#7aff78">Visit Mastra Books →</a></main></body></html>\n`);
