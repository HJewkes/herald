import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/notify/slack.js', () => ({
  SlackClient: vi.fn(),
}));

import { SlackClient } from '../../src/notify/slack.js';

const mockClient = {
  createChannel: vi.fn(),
  inviteToChannel: vi.fn(),
};

describe('channel command', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockClient.createChannel.mockResolvedValue('C_NEW');
    mockClient.inviteToChannel.mockResolvedValue(undefined);
    vi.mocked(SlackClient).mockImplementation(() => mockClient as unknown as InstanceType<typeof SlackClient>);
  });

  async function runChannel(args: string[]) {
    vi.resetModules();
    const { channelCommand } = await import('../../src/commands/channel.js');
    await channelCommand.parseAsync(['node', 'channel', ...args]);
  }

  it('creates a channel with herald- prefix', async () => {
    const logSpy = vi.spyOn(console, 'log');

    await runChannel(['create', 'brain']);

    expect(mockClient.createChannel).toHaveBeenCalledWith('herald-brain');
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('#herald-brain'));
    logSpy.mockRestore();
  });

  it('invites user when --invite is provided', async () => {
    const logSpy = vi.spyOn(console, 'log');

    await runChannel(['create', 'brain', '--invite', 'U12345']);

    expect(mockClient.createChannel).toHaveBeenCalledWith('herald-brain');
    expect(mockClient.inviteToChannel).toHaveBeenCalledWith('C_NEW', 'U12345');
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Invited'));
    logSpy.mockRestore();
  });

  it('does not invite when --invite is omitted', async () => {
    await runChannel(['create', 'brain']);

    expect(mockClient.inviteToChannel).not.toHaveBeenCalled();
  });

  it('handles API errors gracefully', async () => {
    mockClient.createChannel.mockRejectedValue(new Error('name_taken'));
    const errorSpy = vi.spyOn(console, 'error');

    await runChannel(['create', 'brain']);

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('name_taken'));
    errorSpy.mockRestore();
  });
});
