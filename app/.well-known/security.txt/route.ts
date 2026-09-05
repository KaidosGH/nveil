import { ABUSE_EMAIL, CONTACT_EMAIL } from '@/lib/deployment';

/**
 * RFC 9116 security.txt, generated from env configuration:
 * NVEIL_CONTACT_EMAIL (general) and optionally NVEIL_ABUSE_EMAIL (content abuse).
 */
export function GET() {
  const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const contacts = CONTACT_EMAIL ? [`mailto:${CONTACT_EMAIL}`] : [];
  if (ABUSE_EMAIL) contacts.push(`mailto:${ABUSE_EMAIL}`);

  if (contacts.length === 0) {
    // RFC 9116 mandates at least one Contact field — an invented placeholder
    // address would misdirect security reports.
    console.warn(
      'NVEIL_CONTACT_EMAIL (or NVEIL_ABUSE_EMAIL) is not set — /.well-known/security.txt is served without a Contact field.',
    );
  }

  const body = [
    ...contacts.map((c) => `Contact: ${c}`),
    `Expires: ${expires}`,
    'Preferred-Languages: en, de',
    '',
  ].join('\n');

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
