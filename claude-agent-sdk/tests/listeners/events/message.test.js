import assert from 'node:assert';
import { beforeEach, describe, it, mock } from 'node:test';

import { sdk } from '../../../agent/agent.js';
import { handleMessage } from '../../../listeners/events/message.js';

const LEARNED = 'Added the steps to [Runbook: Deploys](https://example.com).';

/**
 * A stand-in for the SDK's `query` that calls `toolNames` and then replies `text`.
 * @param {string} text
 * @param {string[]} [toolNames]
 */
function answer(text, toolNames = []) {
  return async function* () {
    yield {
      type: 'assistant',
      message: {
        content: toolNames.map((name) => ({ type: 'tool_use', name })),
      },
    };
    yield { type: 'result', subtype: 'success', result: text };
  };
}

describe('handleMessage', () => {
  let client;
  let context;
  let logger;

  beforeEach(() => {
    client = { chat: { postEphemeral: mock.fn(async () => ({ ok: true })) } };
    context = { userId: 'U123', userToken: 'xoxp-123' };
    logger = { error: mock.fn() };
  });

  /** @param {Record<string, any>} event */
  async function handle(event) {
    await handleMessage(
      /** @type {any} */ ({
        client,
        context,
        event: { channel: 'C123', ...event },
        logger,
        say: mock.fn(async () => {}),
        sayStream: mock.fn(),
        setStatus: mock.fn(async () => {}),
      }),
    );
  }

  it('learns from a channel message as its author', async (t) => {
    const query = t.mock.method(sdk, 'query', answer(LEARNED, ['mcp__slack-mcp__slack_update_canvas']));

    await handle({
      channel_type: 'channel',
      text: 'Fixed it: rotate the signing secret, then redeploy',
      thread_ts: '1700000000.000100',
      ts: '1700000000.000200',
    });

    const { prompt, options } = query.mock.calls[0].arguments[0];
    assert.ok(prompt.startsWith('Learn from this channel message'));
    assert.ok(prompt.includes('rotate the signing secret'));
    assert.ok(options.systemPrompt.includes('`U123`'));
    assert.strictEqual(options.mcpServers['slack-mcp'].headers.Authorization, 'Bearer xoxp-123');
    const args = client.chat.postEphemeral.mock.calls[0].arguments[0];
    assert.strictEqual(args.user, 'U123');
    assert.strictEqual(args.thread_ts, '1700000000.000100');
    assert.ok(args.markdown_text.includes('Runbook: Deploys'));
  });

  it('stays quiet when no runbook changed', async (t) => {
    const query = t.mock.method(
      sdk,
      'query',
      answer('Nothing to keep.', ['mcp__slack-mcp__slack_search_public_and_private']),
    );

    await handle({
      channel_type: 'group',
      text: 'Lunch at noon?',
      ts: '1700000000.000100',
    });

    assert.strictEqual(query.mock.callCount(), 1);
    assert.strictEqual(client.chat.postEphemeral.mock.callCount(), 0);
  });

  it('learns from broadcast thread replies', async (t) => {
    const query = t.mock.method(sdk, 'query', answer('Nothing to keep.'));

    await handle({
      channel_type: 'channel',
      subtype: 'thread_broadcast',
      text: 'Fixed: restarting the worker cleared the queue',
      thread_ts: '1700000000.000100',
      ts: '1700000000.000200',
    });

    assert.strictEqual(query.mock.callCount(), 1);
  });

  it('logs learning errors', async (t) => {
    t.mock.method(sdk, 'query', async function* () {
      yield* [];
      throw new Error('test exception');
    });

    await handle({
      channel_type: 'channel',
      text: 'Fixed it: rotate the signing secret',
      ts: '1700000000.000100',
    });

    assert.ok(logger.error.mock.calls[0].arguments[0].includes('test exception'));
  });

  it('learns with the bot token without a user token', async (t) => {
    context.userToken = undefined;
    const query = t.mock.method(sdk, 'query', answer(LEARNED, ['mcp__agent-tools__create_runbook']));

    await handle({
      channel_type: 'channel',
      text: 'Fixed it: rotate the signing secret',
      ts: '1700000000.000100',
    });

    const { options } = query.mock.calls[0].arguments[0];
    assert.deepStrictEqual(Object.keys(options.mcpServers), ['agent-tools']);
    assert.strictEqual(client.chat.postEphemeral.mock.callCount(), 1);
  });

  it('does not learn from edits or bots', async (t) => {
    const query = t.mock.method(sdk, 'query', answer('Nothing to keep.'));

    await handle({
      channel_type: 'channel',
      subtype: 'message_changed',
      ts: '1700000000.000100',
    });
    await handle({
      bot_id: 'B123',
      channel_type: 'channel',
      text: 'Added the steps to the runbook.',
      ts: '1700000000.000200',
    });

    assert.strictEqual(query.mock.callCount(), 0);
  });
});
