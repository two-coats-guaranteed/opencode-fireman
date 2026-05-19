export function isValidSlug(slug: string): boolean {
  if (slug.length < 3) return false;
  if (slug.length > 20) return false;
  return /^[a-z0-9_]+$/.test(slug);
}
