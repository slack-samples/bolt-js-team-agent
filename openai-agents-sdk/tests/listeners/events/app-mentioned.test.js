import assert from 'node:assert';
import { describe, it, mock } from 'node:test';

import { setTracingDisabled } from '@openai/agents';

import { handleAppMentioned } from '../../../listeners/events/app-mentioned.js';
import { say, scripted } from '../../fake-model.js';

setTracingDisabled(true);

describe('handleAppMentioned', () => {
  it('runs the agent without a user token', async (t) => {
    const model = scripted(t, () => say("Here's the runbook."));
    const streamer = {
      append: mock.fn(async () => {}),
      stop: mock.fn(async () => {}),
    };

    await handleAppMentioned(
      /** @type {any} */ ({
        client: {},
        context: {
          userId: 'U123',
        },
        event: {
          channel: 'C123',
          text: '<@B123> is there a runbook for deploys?',
          ts: '1700000000.000100',
        },
        logger: { error: mock.fn() },
        say: mock.fn(),
        sayStream: () => streamer,
        setStatus: mock.fn(),
      }),
    );

    assert.ok(JSON.stringify(model.inputs[0]).includes('is there a runbook for deploys?'));
    assert.ok(!JSON.stringify(model.inputs[0]).includes('<@B123>'));
    assert.deepStrictEqual(streamer.append.mock.calls[0].arguments[0], {
      markdown_text: "Here's the runbook.",
    });
  });
});
