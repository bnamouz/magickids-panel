import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assertNourAuth } from '@/lib/nour-auth';

/**
 * POST /api/nour/create-task
 *
 * Creates a task in Google Tasks for the user to follow up on.
 * Used by Nour when caller requests callback or has an action item.
 *
 * Body: { title, notes, due_date_iso?, caller_name?, caller_phone? }
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
    return NextResponse.json({ success: false, error: 'invalid_body', details: e?.errors }, { status: 400 });
  }

  const pipedreamToken = process.env.PIPEDREAM_GOOGLE_TASKS_TOKEN;
  if (!pipedreamToken) {
    return NextResponse.json({ success: false, error: 'tasks_not_configured' });
  }

  const notesLines = [body.notes];
  if (body.caller_name) notesLines.push(`📞 מתקשר: ${body.caller_name}`);
  if (body.caller_phone) notesLines.push(`☎️ ${body.caller_phone}`);
  notesLines.push('', '📝 נוצר על ידי נור');
  const notes = notesLines.filter(Boolean).join('\n');

  try {
    // Get default tasklist
    const listsRes = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
      headers: { Authorization: `Bearer ${pipedreamToken}` },
    });
    const lists = await listsRes.json();
    const tasklistId = lists.items?.[0]?.id;

    if (!tasklistId) {
      return NextResponse.json({ success: false, error: 'no_tasklist_found' });
    }

    const response = await fetch(
      `https://tasks.googleapis.com/tasks/v1/lists/${tasklistId}/tasks`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${pipedreamToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: body.title,
          notes,
          due: body.due_date_iso,
        }),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json({
        success: false,
        error: 'gtasks_create_failed',
        details: text.slice(0, 200),
      });
    }

    const task = await response.json();
    return NextResponse.json({
      success: true,
      task_id: task.id,
      task_link: `https://tasks.google.com/embed/?fullwidth=1`,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: 'gtasks_error', details: err.message });
  }
}
