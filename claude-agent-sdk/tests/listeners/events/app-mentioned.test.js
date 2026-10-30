import assert from 'node:assert';
import { describe, it, mock } from 'node:test';

import { sdk } from '../../../agent/agent.js';
import { handleAppMentioned } from '../../../listeners/events/app-mentioned.js';

describe('handleAppMentioned', () => {
  it('runs the agent without a user token', async (t) => {
    const query = t.mock.method(sdk, 'query', async function* () {
      yield { type: 'result', subtype: 'success', result: "Here's the runbook." };
    });
    const streamer = {
      append: mock.fn(async () => {}),
      stop: mock.fn(async () => {}),
    };

    await handleAppMentioned(
      /** @type {any} */ ({
        client: {},
        context: { userId: 'U123' },
        event: {
          channel: 'C123',
          text: '<@B123> is there a runbook for deploys?',
          ts: '1700000000.000100',
        },
        logger: { error: mock.fn() },
        say: mock.fn(async () => {}),
        sayStream: () => streamer,
        setStatus: mock.fn(async () => {}),
      }),
    );

    const { prompt, options } = query.mock.calls[0].arguments[0];
    assert.strictEqual(prompt, 'is there a runbook for deploys?');
    assert.deepStrictEqual(Object.keys(options.mcpServers), ['agent-tools']);
    assert.deepStrictEqual(streamer.append.mock.calls[0].arguments[0], { markdown_text: "Here's the runbook." });
  });
});
