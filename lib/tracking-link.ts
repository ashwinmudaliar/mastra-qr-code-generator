/**
 * Unsaved previews encode this placeholder instead of the destination. It has the
 * same length as a real 12-character slug, so the preview's module density matches
 * the saved artwork, and scanning it explains that the code has not been saved.
 */
export const DRAFT_SLUG = "draftpreview";
export const SLUG_PATTERN = /^[A-Za-z0-9_-]{12}$/;

export function trackingLink(origin: string, slug: string): string {
  return `${origin.replace(/\/$/, "")}/q/${slug}`;
}

export function draftLink(origin: string): string {
  return trackingLink(origin, DRAFT_SLUG);
}
