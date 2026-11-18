import { handleScan } from "../lib/handler";

export default {
  fetch(request: Request) {
    return handleScan(request, {
      onFailure(reason) { console.error(`Public QR scanner unavailable: ${reason}`); },
    });
  },
};
