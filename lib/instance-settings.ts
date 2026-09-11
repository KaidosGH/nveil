import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { instanceSettings } from '@/drizzle/schema';
import { DEFAULT_LANGUAGE, SUPPORT_LINK } from '@/lib/deployment';
import { locales, type Locale } from '@/lib/i18n/index';

/**
 * Runtime instance settings (DB-backed, writable from /management) that
 * override the env defaults. Scope is deliberately limited to cosmetic/UX
 * settings — security posture and bootstrap config stay env-only, so the
 * management UI can never rewrite its own credentials or the security setup.
 *
 * DB reads degrade gracefully to the env defaults when the database is
 * unreachable: settings are cosmetic and must not take pages down.
 */

type SettingKey = 'support_link' | 'default_language';

export async function getEffectiveSupportLink(): Promise<boolean> {
  try {
    const [row] = await db
      .select()
      .from(instanceSettings)
      .where(eq(instanceSettings.key, 'support_link'));
    if (row) return row.value === 'true';
  } catch {
    /* env fallback */
  }
  return SUPPORT_LINK;
}

export async function getEffectiveDefaultLanguage(): Promise<Locale> {
  try {
    const [row] = await db
      .select()
      .from(instanceSettings)
      .where(eq(instanceSettings.key, 'default_language'));
    if (row && (locales as readonly string[]).includes(row.value)) return row.value as Locale;
  } catch {
    /* env fallback */
  }
  return DEFAULT_LANGUAGE;
}

/** Values are validated here AND by the settings API's zod schema. */
export async function setInstanceSetting(key: SettingKey, value: string | null): Promise<void> {
  if (value === null) {
    // Reset: remove the override so the env default applies again.
    await db.delete(instanceSettings).where(eq(instanceSettings.key, key));
    return;
  }
  if (key === 'support_link' && value !== 'true' && value !== 'false') {
    throw new Error(`invalid value for ${key}`);
  }
  if (key === 'default_language' && !(locales as readonly string[]).includes(value)) {
    throw new Error(`invalid value for ${key}`);
  }
  await db
    .insert(instanceSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: instanceSettings.key,
      set: { value, updatedAt: new Date() },
    });
}
