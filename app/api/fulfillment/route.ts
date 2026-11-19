import { getContext } from "@/lib/server/context";
import { listCodes } from "@/lib/server/repository";
import { fetchFulfillment, fulfillmentFilters } from "@/lib/server/fulfillment";
import { apiError, json } from "@/lib/server/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const context = await getContext(request);
    const filters = fulfillmentFilters(new URL(request.url), await listCodes(context));
    return json(await fetchFulfillment(context.mode, filters));
  } catch (error) { return apiError(error); }
}
