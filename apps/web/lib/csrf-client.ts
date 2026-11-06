/**
 * Read the mutation (CSRF) token the server embedded in the page and return it as
 * request headers for a state-changing fetch. The token proves the request came
 * from someone who loaded one of our pages, not a blind cross-site or curl call.
 */
export function csrfHeaders(extra: Record<string, string> = {}): Record<string, string> {
  if (typeof document === 'undefined') return extra;
  const token = document.querySelector('meta[name="x-redline-csrf"]')?.getAttribute('content') ?? '';
  return { ...extra, 'x-redline-csrf': token };
}
