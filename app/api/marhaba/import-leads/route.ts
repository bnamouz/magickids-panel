// app/api/marhaba/import-leads/route.ts
// Import dental clinics from Google Places (Text Search + Details).
// Free tier: 10k text-searches + 5k details/month.
//
// Auth: x-admin-secret header (MARHABA_CRON_SECRET) OR logged-in staff.

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getCurrentStaff } from '@/lib/admin/auth';
import { normalizeIsraeliPhone } from '@/lib/marhaba/phone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CHAIN_KEYWORDS = ['מכבידנט', 'לוינשטיין', 'הכשל', 'שמי דנט', 'דנטל אקספרס', 'אסותא', 'קלאליט'];

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const secret = process.env.MARHABA_CRON_SECRET || '';
  const provided = req.headers.get('x-admin-secret') || '';
  if (secret && provided === secret) return true;
  const staff = await getCurrentStaff();
  return !!staff;
}

function calculateFitScore(place: any): number {
  let score = 5;
  const reviews = place.user_ratings_total || 0;
  const rating = place.rating || 0;
  const name = place.name || '';

  if (reviews < 100 && reviews > 0) score += 2;
  else if (reviews < 30) score += 1;

  if (rating >= 3.5 && rating <= 4.3) score += 2;

  if (place.business_status === 'OPERATIONAL') score += 1;

  if (CHAIN_KEYWORDS.some(kw => name.includes(kw))) score -= 4;

  return Math.max(0, Math.min(10, score));
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const city = body?.city || 'ירושלים';
  const query = body?.query || `מרפאת שיניים ${city}`;
  const dryRun = body?.dry_run === true;
  const maxResults = Math.min(body?.max || 20, 60);

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'missing_google_places_api_key' }, { status: 500 });
  }

  const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&language=he&region=il&key=${apiKey}`;
  const searchResp = await fetch(searchUrl);
  const searchData: any = await searchResp.json();

  if (searchData.status !== 'OK' && searchData.status !== 'ZERO_RESULTS') {
    return NextResponse.json({ error: 'places_search_failed', details: searchData }, { status: 502 });
  }

  const places = (searchData.results || []).slice(0, maxResults);
  const supabase = getSupabaseAdmin();
  const imported: any[] = [];
  const skipped: any[] = [];

  for (const place of places) {
    // Fetch details for phone number
    const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_phone_number,international_phone_number,formatted_address,business_status&language=he&key=${apiKey}`;
    const detailsResp = await fetch(detailsUrl);
    const detailsData: any = await detailsResp.json();
    const details = detailsData.result || {};

    const rawPhone = details.international_phone_number || details.formatted_phone_number;
    if (!rawPhone) {
      skipped.push({ name: place.name, reason: 'no_phone' });
      continue;
    }

    const phone = normalizeIsraeliPhone(rawPhone);
    const fitScore = calculateFitScore({ ...place, ...details });

    if (dryRun) {
      imported.push({
        clinic_name: details.name || place.name,
        phone,
        city,
        fit_score: fitScore,
        rating: place.rating,
        reviews: place.user_ratings_total,
      });
      continue;
    }

    // Upsert on google_place_id
    const { data, error } = await supabase
      .from('marhaba_leads')
      .upsert({
        google_place_id: place.place_id,
        clinic_name: details.name || place.name,
        phone,
        city,
        address: details.formatted_address || place.formatted_address,
        rating: place.rating,
        reviews_count: place.user_ratings_total,
        fit_score: fitScore,
        source: 'google_places',
        status: 'new',
      }, {
        onConflict: 'google_place_id',
        ignoreDuplicates: false,
      })
      .select()
      .single();

    if (error) {
      skipped.push({ name: place.name, reason: error.message });
    } else {
      imported.push(data);
    }
  }

  return NextResponse.json({
    total_found: places.length,
    imported: imported.length,
    skipped: skipped.length,
    dry_run: dryRun,
    imported_data: imported,
    skipped_data: skipped,
  });
}
