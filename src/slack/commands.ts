import type { Priority, SlackCommand, SlackState } from '../types.js';
import type { BacklogStore } from '../backlog/store.js';

const PRIORITY_VALUES: Priority[] = ['high', 'medium', 'low'];

export function parseCommand(text: string): SlackCommand | null {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  if (lower === 'pause') return { type: 'pause' };
  if (lower === 'resume') return { type: 'resume' };
  if (lower === 'status') return { type: 'status' };

  const skipMatch = trimmed.match(/^skip\s+(\S+)$/i);
  if (skipMatch) return { type: 'skip', taskId: skipMatch[1] };

  const unblockMatch = trimmed.match(/^unblock\s+(\S+)$/i);
  if (unblockMatch) return { type: 'unblock', taskId: unblockMatch[1] };

  const priorityMatch = trimmed.match(/^priority\s+(\S+)\s+(high|medium|low)$/i);
  if (priorityMatch && PRIORITY_VALUES.includes(priorityMatch[2].toLowerCase() as Priority)) {
    return {
      type: 'priority',
      taskId: priorityMatch[1],
      priority: priorityMatch[2].toLowerCase() as Priority,
    };
  }

  return null;
}

export function executeCommands(
  commands: SlackCommand[],
  store: BacklogStore,
  state: SlackState,
): string[] {
  const responses: string[] = [];
  const { items } = store.list();

  for (const cmd of commands) {
    switch (cmd.type) {
      case 'pause':
        state.pauseRequested = true;
        responses.push(':pause_button: Herald paused. Send "resume" to continue.');
        break;

      case 'resume':
        state.pauseRequested = false;
        responses.push(':arrow_forward: Herald resumed.');
        break;

      case 'status': {
        const pending = items.filter((i) => i.status === 'pending').length;
        const blocked = items.filter((i) => i.status === 'blocked').length;
        const done = items.filter((i) => i.status === 'done').length;
        const paused = state.pauseRequested ? ' (paused)' : '';
        responses.push(
          `:clipboard: Backlog${paused}: ${pending} pending, ${blocked} blocked, ${done} done`,
        );
        break;
      }

      case 'skip': {
        const item = items.find((i) => i.id === cmd.taskId);
        if (!item) {
          responses.push(`:warning: Task "${cmd.taskId}" not found.`);
        } else {
          store.updateStatus(item.filePath, 'done');
          responses.push(`:fast_forward: Skipped "${item.title}".`);
        }
        break;
      }

      case 'unblock': {
        const item = items.find((i) => i.id === cmd.taskId);
        if (!item) {
          responses.push(`:warning: Task "${cmd.taskId}" not found.`);
        } else if (item.status !== 'blocked') {
          responses.push(`:warning: "${item.title}" is not blocked (status: ${item.status}).`);
        } else {
          store.updateStatus(item.filePath, 'pending');
          responses.push(`:white_check_mark: Unblocked "${item.title}".`);
        }
        break;
      }

      case 'priority': {
        const item = items.find((i) => i.id === cmd.taskId);
        if (!item) {
          responses.push(`:warning: Task "${cmd.taskId}" not found.`);
        } else {
          store.updatePriority(item.filePath, cmd.priority);
          responses.push(`:arrow_up_down: Set "${item.title}" priority to ${cmd.priority}.`);
        }
        break;
      }
    }
  }

  return responses;
}
