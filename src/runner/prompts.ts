import type { BacklogItem } from '../types.js';

export function buildPrompt(item: BacklogItem): string {
  const lines = [
    `You are working on the following task autonomously.`,
    `Task: ${item.title}`,
    '',
    item.body,
    '',
    'Instructions:',
    '- Complete the task as described in the acceptance criteria.',
    '- Commit your work to a feature branch (never main/master).',
    '- If you cannot complete the task, explain what is blocking you.',
    '- If you need human input, clearly state the question.',
  ];

  return lines.join('\n');
}
