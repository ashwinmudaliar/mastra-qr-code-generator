import { getContext } from "@/lib/server/context";
import { restoreCode } from "@/lib/server/repository";
import { apiError, assertSameOrigin, json } from "@/lib/server/validation";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    assertSameOrigin(request);
    const context = await getContext(request);
    const { id } = await params;
    return json({ code: await restoreCode(context, id) });
  } catch (error) { return apiError(error); }
}
