import type {
  HeartbeatSummary,
  SlackPostResult,
  SlackMessage,
  SlackReaction,
  SlackFile,
} from '../types.js';

interface SlackApiResponse {
  ok: boolean;
  error?: string;
  ts?: string;
  channel?: string | { id: string; name: string };
  messages?: SlackApiMessage[];
  file?: { id: string; name: string; permalink: string };
  upload_url?: string;
  file_id?: string;
}

interface SlackApiMessage {
  ts: string;
  user?: string;
  text?: string;
  thread_ts?: string;
}

interface SlackReactionsResponse {
  ok: boolean;
  error?: string;
  message?: {
    reactions?: Array<{ name: string; users: string[] }>;
  };
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) {
    throw new Error(`Slack API: missing ${label} in response`);
  }
  return value;
}

export class SlackClient {
  private readonly token: string;

  constructor(token?: string) {
    const resolved = token ?? process.env.HERALD_SLACK_TOKEN;
    if (!resolved) {
      throw new Error('HERALD_SLACK_TOKEN is not set');
    }
    this.token = resolved;
  }

  private async call(method: string, body: Record<string, unknown>): Promise<SlackApiResponse> {
    const response = await fetch(`https://slack.com/api/${method}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json() as SlackApiResponse;
    if (!data.ok) {
      throw new Error(`Slack API error (${method}): ${data.error}`);
    }
    return data;
  }

  async postMessage(channel: string, text: string, threadTs?: string): Promise<SlackPostResult> {
    const body: Record<string, unknown> = { channel, text };
    if (threadTs) body.thread_ts = threadTs;
    const data = await this.call('chat.postMessage', body);
    return {
      ts: requireString(data.ts, 'ts'),
      channel: requireString(typeof data.channel === 'string' ? data.channel : undefined, 'channel'),
    };
  }

  async updateMessage(channel: string, ts: string, text: string): Promise<void> {
    await this.call('chat.update', { channel, ts, text });
  }

  async addReaction(channel: string, ts: string, name: string): Promise<void> {
    await this.call('reactions.add', { channel, timestamp: ts, name });
  }

  async getHistory(channel: string, oldest: string, limit = 100): Promise<SlackMessage[]> {
    const params = new URLSearchParams({
      channel,
      oldest,
      limit: String(limit),
      inclusive: 'false',
    });
    const response = await fetch(
      `https://slack.com/api/conversations.history?${params}`,
      {
        headers: { 'Authorization': `Bearer ${this.token}` },
      },
    );
    const data = await response.json() as SlackApiResponse;
    if (!data.ok) {
      throw new Error(`Slack API error (conversations.history): ${data.error}`);
    }
    return (data.messages ?? []).map((m) => ({
      ts: m.ts,
      user: m.user ?? '',
      text: m.text ?? '',
      threadTs: m.thread_ts,
    }));
  }

  async getReactions(channel: string, ts: string): Promise<SlackReaction[]> {
    const params = new URLSearchParams({
      channel,
      timestamp: ts,
      full: 'true',
    });
    const response = await fetch(
      `https://slack.com/api/reactions.get?${params}`,
      {
        headers: { 'Authorization': `Bearer ${this.token}` },
      },
    );
    const data = await response.json() as SlackReactionsResponse;
    if (!data.ok) {
      throw new Error(`Slack API error (reactions.get): ${data.error}`);
    }
    return (data.message?.reactions ?? []).map((r) => ({
      name: r.name,
      users: r.users,
    }));
  }

  async uploadFile(
    channel: string,
    content: string,
    filename: string,
    threadTs?: string,
  ): Promise<SlackFile> {
    const contentBytes = new TextEncoder().encode(content);

    const urlData = await this.call('files.getUploadURLExternal', {
      filename,
      length: contentBytes.byteLength,
    });
    const uploadUrl = requireString(urlData.upload_url, 'upload_url');
    const fileId = requireString(urlData.file_id, 'file_id');

    await fetch(uploadUrl, {
      method: 'POST',
      body: contentBytes,
    });

    const completeFile: Record<string, unknown> = { id: fileId };
    if (threadTs) completeFile.thread_ts = threadTs;

    await this.call('files.completeUploadExternal', {
      files: [completeFile],
      channel_id: channel,
    });

    return { id: fileId, name: filename, permalink: '' };
  }

  async createChannel(name: string): Promise<string> {
    const data = await this.call('conversations.create', { name });
    const ch = data.channel;
    if (typeof ch === 'object' && ch !== null && 'id' in ch) {
      return ch.id;
    }
    throw new Error('Slack API: missing channel.id in conversations.create response');
  }

  async inviteToChannel(channel: string, users: string): Promise<void> {
    await this.call('conversations.invite', { channel, users });
  }

  async authTest(): Promise<{ userId: string }> {
    const response = await fetch('https://slack.com/api/auth.test', {
      headers: { 'Authorization': `Bearer ${this.token}` },
    });
    const data = await response.json() as { ok: boolean; error?: string; user_id?: string };
    if (!data.ok) {
      throw new Error(`Slack API error (auth.test): ${data.error}`);
    }
    return { userId: requireString(data.user_id, 'user_id') };
  }
}

// Backward-compatible exports

export async function sendSlack(channel: string, text: string): Promise<void> {
  const client = new SlackClient();
  await client.postMessage(channel, text);
}

export function formatSummary(summary: HeartbeatSummary): string {
  const date = new Date(summary.timestamp);
  const dateStr = `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
  const lines: string[] = [`*Herald Report (${dateStr})*`];

  if (summary.tasksCompleted.length > 0) {
    lines.push('', ':white_check_mark: *Completed:*');
    for (const t of summary.tasksCompleted) {
      lines.push(`• ${t}`);
    }
  }

  if (summary.tasksSkipped.length > 0) {
    lines.push('', ':fast_forward: *Skipped:*');
    for (const t of summary.tasksSkipped) {
      lines.push(`• ${t}`);
    }
  }

  if (summary.tasksBlocked.length > 0) {
    lines.push('', ':no_entry_sign: *Blocked:*');
    for (const t of summary.tasksBlocked) {
      lines.push(`• ${t}`);
    }
  }

  if (summary.needsInput.length > 0) {
    lines.push('', ':question: *Needs input:*');
    for (const t of summary.needsInput) {
      lines.push(`• ${t}`);
    }
  }

  if (
    summary.tasksCompleted.length === 0 &&
    summary.tasksSkipped.length === 0 &&
    summary.tasksBlocked.length === 0 &&
    summary.needsInput.length === 0
  ) {
    lines.push('', 'No tasks to process.');
  }

  const { usedTokens, paceCap, usedPct, dayOfWeek } = summary.budget;
  lines.push('', `_Pace: ${usedTokens.toLocaleString()}/${paceCap.toLocaleString()} tokens (day ${dayOfWeek}/7, ${usedPct}% weekly)_`);

  return lines.join('\n');
}
