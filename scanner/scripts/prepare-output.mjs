import { mkdir, readdir } from "node:fs/promises";

// An explicit, empty static output prevents Vercel's "Other" framework from
// publishing repository source files as static assets.
const output = new URL("../public/", import.meta.url);
await mkdir(output, { recursive: true });
if ((await readdir(output)).length) throw new Error("The scan-only service must have an empty static output.");
