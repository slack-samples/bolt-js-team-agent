import assert from 'node:assert';
import { beforeEach, describe, it, mock } from 'node:test';

import { setTracingDisabled } from '@openai/agents';

import { handleMessage } from '../../../listeners/events/message.js';
import { call, say, scripted } from '../../fake-model.js';

setTracingDisabled(true);

describe('handleMessage', () => {
  let client;
  let logger;

  beforeEach(() => {
    client = {
      canvases: {
        create: mock.fn(async () => ({
          ok: true,
          canvas_id: 'F123',
        })),
      },
      chat: { postEphemeral: mock.fn(async () => ({ ok: true })) },
      files: {
        info: mock.fn(async () => ({
          ok: true,
          file: {
            permalink: 'https://example.com/F123',
            title: 'Runbook: Deploys',
          },
        })),
      },
    };
    logger = { error: mock.fn() };
  });

  /** @param {Record<string, any>} event */
  async function handle(event) {
    await handleMessage(
      /** @type {any} */ ({
        client,
        context: {
          userId: 'U123',
        },
        event: {
          channel: 'C123',
          ...event,
        },
        logger,
        say: mock.fn(),
        sayStream: mock.fn(),
        setStatus: mock.fn(),
      }),
    );
  }

  it('learns from a channel message as its author', async (t) => {
    const model = scripted(t, (callNumber) =>
      callNumber === 1
        ? call('create_runbook', {
            markdown: '# Steps\n1. Rotate the signing secret\n2. Redeploy',
            topic: 'Deploys',
          })
        : say('Added the steps to [Runbook: Deploys](https://example.com/F123).'),
    );

    await handle({
      channel_type: 'channel',
      text: 'Fixed it: rotate the signing secret, then redeploy',
      thread_ts: '1700000000.000100',
      ts: '1700000000.000200',
    });

    const learnInput = JSON.stringify(model.inputs[0]);
    assert.ok(learnInput.includes('Learn from this channel message'));
    assert.ok(learnInput.includes('rotate the signing secret'));
    assert.strictEqual(client.canvases.create.mock.calls[0].arguments[0].channel_id, 'C123');
    assert.deepStrictEqual(client.chat.postEphemeral.mock.calls[0].arguments[0], {
      channel: 'C123',
      markdown_text: 'Added the steps to [Runbook: Deploys](https://example.com/F123).',
      thread_ts: '1700000000.000100',
      user: 'U123',
    });
  });

  it('stays quiet when no runbook changed', async (t) => {
    const model = scripted(t, () => say('Nothing to keep.'));

    await handle({
      channel_type: 'group',
      text: 'Lunch at noon?',
      ts: '1700000000.000100',
    });

    assert.strictEqual(model.inputs.length, 1);
    assert.strictEqual(client.chat.postEphemeral.mock.callCount(), 0);
  });

  it('learns from broadcast thread replies', async (t) => {
    const model = scripted(t, () => say('Nothing to keep.'));

    await handle({
      channel_type: 'channel',
      subtype: 'thread_broadcast',
      text: 'Fixed: restarting the worker cleared the queue',
      thread_ts: '1700000000.000100',
      ts: '1700000000.000200',
    });

    assert.strictEqual(model.inputs.length, 1);
  });

  it('logs learning errors', async (t) => {
    scripted(t, () => {
      throw new Error('test exception');
    });

    await handle({
      channel_type: 'channel',
      text: 'Fixed it: rotate the signing secret',
      ts: '1700000000.000100',
    });

    assert.ok(logger.error.mock.calls[0].arguments[0].includes('test exception'));
  });

  it('does not learn from edits or bots', async (t) => {
    const model = scripted(t, () => say('Nothing to keep.'));

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

    assert.strictEqual(model.inputs.length, 0);
  });
});
