/**
 * Extract the primary Solidity contract name from source text.
 *
 * The naive `/contract\s+(\w+)/` matches prose inside comments — e.g. a doc
 * comment "Demo contract for a live vault" yields the name "for", which then
 * makes every referee compile against a contract that does not exist and report
 * a bare "compile error". This strips comments first, skips Solidity keywords
 * that can never be a type name, and prefers a `contract` declaration over a
 * `library`/`interface`, returning the first real declaration found.
 */
const DECL = /\b(?:abstract\s+)?(contract|library|interface)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;

// Words that are never a contract type name but could follow the keyword in
// malformed or comment-stripped-to-code edge cases.
const RESERVED = new Set([
  'for', 'is', 'if', 'else', 'while', 'do', 'return', 'returns', 'public', 'private',
  'internal', 'external', 'view', 'pure', 'payable', 'memory', 'storage', 'calldata',
  'function', 'modifier', 'event', 'struct', 'enum', 'mapping', 'using', 'import',
  'pragma', 'new', 'this', 'super',
]);

/** Remove line comments and block comments without disturbing string content materially. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ');
}

/**
 * Returns the primary contract/library/interface name, or `fallback` when none
 * is found. Prefers a `contract` declaration; otherwise the first library or
 * interface.
 */
export function extractContractName(source: string, fallback = 'Unknown'): string {
  if (!source) return fallback;
  const clean = stripComments(source);
  let firstAny: string | null = null;
  DECL.lastIndex = 0;
  for (let m = DECL.exec(clean); m; m = DECL.exec(clean)) {
    const kind = m[1]!;
    const name = m[2]!;
    if (RESERVED.has(name)) continue;
    if (kind === 'contract') return name;
    if (firstAny === null) firstAny = name;
  }
  return firstAny ?? fallback;
}
