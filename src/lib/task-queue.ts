/**
 * Simple in-memory task queue for async image generation
 * Tasks are stored in memory and processed in the background
 */

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface TaskResult {
  url: string;
  meta?: {
    title: string;
    description: string;
    tags: string[];
    appearance: string;
  };
}

export interface Task {
  id: string;
  girlfriendId: string;
  status: TaskStatus;
  progress: string;
  results: TaskResult[];
  error?: string;
  createdAt: number;
  updatedAt: number;
}

// In-memory task store
const tasks = new Map<string, Task>();

// Cleanup old tasks (older than 1 hour)
setInterval(() => {
  const now = Date.now();
  for (const [id, task] of tasks.entries()) {
    if (now - task.createdAt > 60 * 60 * 1000) {
      tasks.delete(id);
    }
  }
}, 5 * 60 * 1000); // Cleanup every 5 minutes

export function createTask(girlfriendId: string): Task {
  const id = `task_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const task: Task = {
    id,
    girlfriendId,
    status: 'pending',
    progress: 'Task created',
    results: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  tasks.set(id, task);
  return task;
}

export function getTask(id: string): Task | undefined {
  return tasks.get(id);
}

export function updateTask(id: string, updates: Partial<Task>): void {
  const task = tasks.get(id);
  if (task) {
    Object.assign(task, updates, { updatedAt: Date.now() });
  }
}

export function getTasksByGirlfriend(girlfriendId: string): Task[] {
  return Array.from(tasks.values()).filter(t => t.girlfriendId === girlfriendId);
}

export function getAllTasks(): Task[] {
  return Array.from(tasks.values());
}
