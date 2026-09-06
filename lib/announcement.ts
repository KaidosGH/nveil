import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Server-only: reads the operator's optional announcement banner from the
 * gitignored `content/` directory (content/announcement.txt) — same
 * lifecycle as the legal pages: it appears when the file appears, is gone
 * when the file is deleted, no restart needed.
 *
 * Rendered as plain text (React escapes it) — this is an operational notice,
 * not content composition; operators who need links or formatting have the
 * legal-page mechanism.
 */
export async function getAnnouncement(): Promise<string | null> {
  try {
    const content = await readFile(path.join(process.cwd(), 'content', 'announcement.txt'), 'utf8');
    const trimmed = content.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}
