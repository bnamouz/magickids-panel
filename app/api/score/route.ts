import { NextRequest, NextResponse } from 'next/server';
import { scoreParent, scoreTeacher, combineProfile } from '@/lib/scoring';

/**
 * POST /api/score – ad-hoc scoring helper
 * Body: { parent: {...}, teacher: {...} }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (body.parent && !body.teacher) {
    return NextResponse.json({ score: scoreParent(body.parent) });
  }
  if (body.teacher && !body.parent) {
    return NextResponse.json({ score: scoreTeacher(body.teacher) });
  }
  if (body.parent && body.teacher) {
    return NextResponse.json({ profile: combineProfile(body.parent, body.teacher) });
  }
  return NextResponse.json({ error: 'parent or teacher responses required' }, { status: 400 });
}
