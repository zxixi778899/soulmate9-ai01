import { NextRequest, NextResponse } from 'next/server';
import { getTask, getAllTasks } from '@/lib/task-queue';
import { requireAdmin } from '@/lib/require-admin';

export const runtime = 'nodejs';

// GET /api/v2/admin/images/task?taskId=xxx
// GET /api/v2/admin/images/task?girlfriendId=xxx
export async function GET(req: NextRequest) {
  const adminCheck = await requireAdmin(req);
  if (adminCheck.error) return adminCheck.error;
  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get('taskId');
    const girlfriendId = searchParams.get('girlfriendId');

    if (taskId) {
      const task = getTask(taskId);
      if (!task) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }
      return NextResponse.json({ task });
    }

    if (girlfriendId) {
      const tasks = getAllTasks().filter(t => t.girlfriendId === girlfriendId);
      return NextResponse.json({ tasks });
    }

    return NextResponse.json({ error: 'taskId or girlfriendId required' }, { status: 400 });
  } catch (err) {
    console.error('[task-status] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    );
  }
}
