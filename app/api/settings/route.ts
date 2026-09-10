import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ACCESS_KEYS_REQUIRED, requireManagement } from '@/lib/access-keys';
import { parseJsonBody, SMALL_BODY_CAP } from '@/lib/request-body';
import { denied } from '@/lib/api-response';
import {
  getEffectiveDefaultLanguage,
  getEffectiveSupportLink,
  setInstanceSetting,
} from '@/lib/instance-settings';

/**
 * Instance settings API (management-key gated, /management → Settings tab).
 * Only cosmetic/UX settings are writable; security posture stays env-only.
 * A null value resets the setting to its env default.
 */

async function effectiveSettings() {
  return {
    supportLink: await getEffectiveSupportLink(),
    defaultLanguage: await getEffectiveDefaultLanguage(),
    accessKeysRequired: ACCESS_KEYS_REQUIRED,
  };
}

export async function GET(request: NextRequest) {
  const gate = await requireManagement(request);
  if (!gate.ok) return denied(gate);
  return NextResponse.json(await effectiveSettings());
}

const putSchema = z.object({
  supportLink: z.enum(['true', 'false']).nullish(),
  defaultLanguage: z.enum(['en', 'de']).nullish(),
});

export async function PUT(request: NextRequest) {
  const gate = await requireManagement(request);
  if (!gate.ok) return denied(gate);

  const parsed = await parseJsonBody(request, SMALL_BODY_CAP, putSchema);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  if (parsed.data.supportLink !== undefined) {
    await setInstanceSetting('support_link', parsed.data.supportLink ?? null);
  }
  if (parsed.data.defaultLanguage !== undefined) {
    await setInstanceSetting('default_language', parsed.data.defaultLanguage ?? null);
  }
  return NextResponse.json(await effectiveSettings());
}
