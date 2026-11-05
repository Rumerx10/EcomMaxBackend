const HOSTNAME_PATTERN =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;

// Turns a Host value, an Origin URL or a bare host name into the form stores are looked up by:
// lower case, no scheme, no port, no trailing dot. Returns null for anything that isn't a
// plausible host name (IP literals with ports, "null" origins, junk).
export const normalizeHost = (
  raw: string | undefined | null,
): string | null => {
  if (!raw) return null;
  let host = raw.trim().toLowerCase();
  // Sandboxed pages and file:// documents send the literal Origin "null".
  if (host === 'null') return null;
  if (host.includes('://')) {
    try {
      host = new URL(host).hostname;
    } catch {
      return null;
    }
  }
  host = host.replace(/:\d+$/, '').replace(/\.$/, '');
  return HOSTNAME_PATTERN.test(host) ? host : null;
};

// Subdomains that can never be a store slug, because the platform uses them itself.
export const RESERVED_SLUGS = new Set([
  'admin',
  'api',
  'app',
  'assets',
  'cdn',
  'dashboard',
  'docs',
  'help',
  'mail',
  'platform',
  'static',
  'status',
  'support',
  'www',
]);
