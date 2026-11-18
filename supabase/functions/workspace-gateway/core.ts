import { z } from "zod";
import { codeInputSchema, codePatchSchema } from "../../../lib/server/validation";
import { ArchivedCodeError, type WorkspaceStore } from "./store";

export type WorkspaceGatewayDependencies = {
  keyHash: string;
  workspaceId: string;
  store: WorkspaceStore;
  onError?: () => void;
};
const uuid = z.string().uuid();
const offset = z.number().int().min(0).max(10_000_000).multipleOf(1000);
const payloadSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("list"), offset }).strict(),
  z.object({ operation: z.literal("create"), input: codeInputSchema }).strict(),
  z.object({ operation: z.literal("update"), id: uuid, input: codePatchSchema }).strict(),
  z.object({ operation: z.literal("delete"), id: uuid }).strict(),
  z.object({ operation: z.literal("restore"), id: uuid }).strict(),
  z.object({ operation: z.literal("scans"), since: z.string().datetime({ offset: true }), until: z.string().datetime({ offset: true }), codeId: uuid.optional(), offset }).strict(),
]).refine(value => value.operation !== "scans" || (
  Date.parse(value.since) <= Date.parse(value.until) && Date.parse(value.until) - Date.parse(value.since) <= 367 * 86400000
), "Invalid reporting period");
const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

async function validBearer(request: Request, expectedHash: string): Promise<boolean> {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return false;
  const key = authorization.slice(7);
  if (key.length < 32 || key.length > 256) return false;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  const actual = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  let difference = 0;
  for (let index = 0; index < 64; index++) difference |= actual.charCodeAt(index) ^ expectedHash.charCodeAt(index);
  return difference === 0;
}
async function readPayload(request: Request): Promise<unknown> {
  const limit = 1_600_000;
  if (Number(request.headers.get("content-length")) > limit || !request.body) throw new Error("Invalid body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) { await reader.cancel(); throw new Error("Invalid body"); }
    chunks.push(value);
  }
  const buffer = new Uint8Array(length);
  let position = 0;
  for (const chunk of chunks) { buffer.set(chunk, position); position += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(buffer));
}

export async function handleWorkspaceGateway(request: Request, dependencies: WorkspaceGatewayDependencies): Promise<Response> {
  if (!/^[a-f0-9]{64}$/.test(dependencies.keyHash) || !uuid.safeParse(dependencies.workspaceId).success) return json({ error: "Workspace gateway not configured" }, 503);
  if (!await validBearer(request, dependencies.keyHash)) return json({ error: "Unauthorized" }, 401);
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let parsed;
  try { parsed = payloadSchema.safeParse(await readPayload(request)); }
  catch { return json({ error: "Invalid request" }, 400); }
  if (!parsed.success) return json({ error: "Invalid request" }, 400);
  const payload = parsed.data;
  const scope = dependencies.workspaceId;
  try {
    switch (payload.operation) {
      case "list": return json({ codes: await dependencies.store.list(scope, payload.offset) });
      case "create": return json({ code: await dependencies.store.create(scope, payload.input) }, 201);
      case "update": {
        const code = await dependencies.store.update(scope, payload.id, payload.input);
        return code ? json({ code }) : json({ error: "Code not found" }, 404);
      }
      // Existing protected deployments may still send delete. Archive for every
      // caller so none can erase a code's reporting identity or scan history.
      case "delete": {
        const code = await dependencies.store.archive(scope, payload.id);
        return code ? json({ code }) : json({ error: "Code not found" }, 404);
      }
      case "restore": {
        const code = await dependencies.store.restore(scope, payload.id);
        return code ? json({ code }) : json({ error: "Code not found" }, 404);
      }
      case "scans": return json({ scans: await dependencies.store.scans(scope, payload) });
    }
  } catch (error) {
    if (error instanceof ArchivedCodeError) return json({ error: "Restore this archived code before editing it." }, 409);
    dependencies.onError?.();
    return json({ error: "Workspace service temporarily unavailable" }, 503);
  }
}
