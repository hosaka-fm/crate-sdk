// RFC 8785-approximate JSON Canonicalization Scheme.
//
// Recursively sorts object keys and relies on JSON.stringify for scalar
// serialization (which already uses the ECMAScript Number-to-String algorithm
// RFC 8785 mandates). For an OpenAPI document this is equivalent to full JCS,
// and — critically — it is applied IDENTICALLY on both sides of the
// spec-staleness comparison (vendored meta.json vs. live fetch), so the hash is
// consistent regardless of key ordering drift in the served JSON.
export function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`;
}
