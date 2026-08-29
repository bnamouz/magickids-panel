import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assertNourAuth, normalisePhone } from '@/lib/nour-auth';
import { createNourTask } from '@/lib/google-calendar-nour';

/**
 * POST /api/nour/create-task
 *
 * Creates a task in Dr. Baseem's personal Google Tasks
 * (bnamouz@magickidsinstitute.com) via Service Account with DWD.
 *
 * Body: { title, notes?, due_date_iso?, caller_name?, caller_phone? }
 */
export const runtime = 'nodejs';

const BodySchema = z.object({
  title: z.string().min(1),
  notes: z.string().optional(),
  due_date_iso: z.string().optional(),
  caller_name: z.string().optional(),
  caller_phone: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const unauth = assertNourAuth(req);
  if (unauth) return unauth;

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: 'invalid_body', details: e?.errors },
      { status: 400 }
    );
  }

  const phone = body.caller_phone
    ? (normalisePhone(body.caller_phone) ?? undefined)
    : undefined;

  try {
    const result = await createNourTask({
      title: body.title,
      notes: body.notes,
      dueIso: body.due_date_iso,
      callerName: body.caller_name,
      callerPhone: phone,
    });

    return NextResponse.json({
      success: true,
      task_id: result.taskId,
      task_title: result.taskTitle,
      task_link: 'https://tasks.google.com/embed/?fullwidth=1',
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: 'gtasks_error',
      details: err?.message || String(err),
    });
  }
}
