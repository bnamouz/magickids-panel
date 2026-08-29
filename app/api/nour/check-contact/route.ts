import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase';
import { assertNourAuth, normalisePhone } from '@/lib/nour-auth';

/**
 * GET /api/nour/check-contact?phone=+972...
 *
 * Looks up a caller by phone number. Checks the local contacts cache first,
 * falls back to Google Contacts via Pipedream connector if not cached.
 * Returns { found, name, organization, relationship, is_vip }.
 */
export const runtime = 'nodejs';

const QuerySchema = z.object({
  phone: z.string().min(6),
});

export async function GET(req: NextRequest) {
  const unauth = assertNourAuth(req);
  if (unauth) return unauth;

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({ phone: url.searchParams.get('phone') || '' });
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'invalid_phone' }, { status: 400 });
  }

  const phone = normalisePhone(parsed.data.phone);
  if (!phone) {
    return NextResponse.json({ success: false, error: 'invalid_phone_format' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Check VIP list first
  const { data: vipRow } = await supabase
    .from('nour_vip_list')
    .select('name, reason')
    .eq('phone_e164', phone)
    .maybeSingle();

  const is_vip = !!vipRow;

  // Check contact cache
  const { data: cachedContact } = await supabase
    .from('nour_contacts_cache')
    .select('display_name, organization, relationship, notes, cached_at')
    .eq('phone_e164', phone)
    .maybeSingle();

  if (cachedContact) {
    const ageDays = (Date.now() - new Date(cachedContact.cached_at).getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays < 30) {
      return NextResponse.json({
        found: true,
        source: 'cache',
        name: cachedContact.display_name || vipRow?.name,
        organization: cachedContact.organization,
        relationship: cachedContact.relationship,
        notes: cachedContact.notes,
        is_vip,
      });
    }
  }

  // If VIP but no contact info — return VIP name
  if (vipRow) {
    return NextResponse.json({
      found: true,
      source: 'vip_list',
      name: vipRow.name,
      is_vip: true,
    });
  }

  // Unknown caller
  return NextResponse.json({
    found: false,
    is_vip: false,
    phone,
  });
}
