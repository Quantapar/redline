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

/**
 * Remove line and block comments in ONE linear pass. Source is PR-author
 * controlled, so this must not backtrack: the old `/\/\*[\s\S]*?\*\//g` rescanned
 * to the end of input from every unterminated `/*`, which is quadratic on input
 * like '/*' + 'a/*'.repeat(n) (CodeQL js/polynomial-redos). String literals are
 * copied verbatim, so a `//` or `/*` inside "https://…" is not taken as a comment.
 */
function stripComments(source: string): string {
  const out: string[] = [];
  const n = source.length;
  let plain = 0; // start of the current run of ordinary code
  let i = 0;
  while (i < n) {
    const c = source.charCodeAt(i);
    if (c === 47 /* / */ && i + 1 < n) {
      const d = source.charCodeAt(i + 1);
      if (d === 47 /* / */ || d === 42 /* * */) {
        out.push(source.slice(plain, i), ' ');
        const end = d === 47 ? source.indexOf('\n', i + 2) : source.indexOf('*/', i + 2);
        if (end === -1) return out.join(''); // comment runs to end of input
        i = d === 47 ? end : end + 2; // keep the newline that ends a line comment
        plain = i;
        continue;
      }
    }
    if (c === 34 /* " */ || c === 39 /* ' */) {
      let j = i + 1;
      while (j < n) {
        const k = source.charCodeAt(j);
        if (k === 92 /* \ */) { j += 2; continue; }
        if (k === c || k === 10 /* \n */) break;
        j++;
      }
      i = j + 1;
      continue;
    }
    i++;
  }
  out.push(source.slice(plain));
  return out.join('');
}

/** The base name of a Solidity file, without directories or the .sol extension. */
function baseName(file: string): string {
  const last = file.split(/[\\/]/).pop() ?? file;
  return last.replace(/\.sol$/i, '');
}

/**
 * Returns the primary contract/library/interface name, or `fallback` when none
 * is found.
 *
 * Selection order: (1) a declaration whose name matches the file name, since
 * Solidity convention puts the main contract in a file of the same name — this
 * avoids returning a helper contract declared before the main one; (2) the first
 * `contract` declaration; (3) the first library/interface. `fileName` is optional
 * and may be a full path.
 */
export function extractContractName(source: string, fallback = 'Unknown', fileName?: string): string {
  if (!source) return fallback;
  const clean = stripComments(source);
  const wanted = fileName ? baseName(fileName) : '';
  let firstContract: string | null = null;
  let firstAny: string | null = null;
  DECL.lastIndex = 0;
  for (let m = DECL.exec(clean); m; m = DECL.exec(clean)) {
    const kind = m[1]!;
    const name = m[2]!;
    if (RESERVED.has(name)) continue;
    if (wanted && name === wanted) return name; // the file's namesake wins outright
    if (kind === 'contract' && firstContract === null) firstContract = name;
    if (firstAny === null) firstAny = name;
  }
  return firstContract ?? firstAny ?? fallback;
}
