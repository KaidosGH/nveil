import { readFile } from 'node:fs/promises';
import path from 'node:path';

export type LegalKind = 'imprint' | 'privacy' | 'cookies_and_tracking' | 'tos';
export type LegalContent = { format: 'html' | 'txt'; content: string };

/**
 * Server-only: reads operator-provided legal content from the gitignored
 * `content/` directory. Never import from client components.
 *
 * Each kind maps to `content/${kind}.html` / `content/${kind}.txt`
 * (HTML wins over txt). One name per kind, no aliases.
 */
const KINDS: LegalKind[] = ['imprint', 'privacy', 'cookies_and_tracking', 'tos'];

/**
 * Returns the operator's content for a kind, or null when no file is
 * present so the caller can fall back to the built-in placeholder page.
 * The content is operator-controlled and trusted to the same degree as
 * the codebase itself — never point `content/` at untrusted sources.
 */
export async function getLegalContent(kind: LegalKind): Promise<LegalContent | null> {
  for (const ext of ['html', 'txt'] as const) {
    try {
      const content = await readFile(path.join(process.cwd(), 'content', `${kind}.${ext}`), 'utf8');
      return { format: ext, content };
    } catch {
      /* try the next extension */
    }
  }
  return null;
}

/**
 * Kinds with operator content present right now — checked per render so
 * dropping a file into `content/` makes the footer link appear without a
 * restart. The footer combines this with IS_PUBLIC_DEPLOYMENT.
 */
export async function availableLegalKinds(): Promise<LegalKind[]> {
  const kinds: LegalKind[] = [];
  for (const kind of KINDS) {
    if (await getLegalContent(kind)) kinds.push(kind);
  }
  return kinds;
}
