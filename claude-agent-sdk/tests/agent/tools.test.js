import assert from 'node:assert';
import { beforeEach, describe, it, mock } from 'node:test';

import { createRunbook, listRunbooks, readRunbook } from '../../agent/tools/index.js';

/**
 * @param {string} error
 * @param {string} [detail]
 */
function slackError(error, detail) {
  return Object.assign(new Error(error), {
    data: {
      ok: false,
      error,
      ...(detail && { detail }),
    },
  });
}

/**
 * @param {(deps: any) => import('@anthropic-ai/claude-agent-sdk').SdkMcpToolDefinition<any>} tool
 * @param {any} deps
 * @param {Record<string, any>} [args]
 * @returns {Promise<string>}
 */
async function invoke(tool, deps, args = {}) {
  const result = await tool(deps).handler(args, undefined);
  return /** @type {{ text: string }} */ (result.content[0]).text;
}

describe('tools', () => {
  let client;
  let deps;

  beforeEach(() => {
    client = {
      apiCall: mock.fn(),
      canvases: { create: mock.fn() },
      files: {
        info: mock.fn(async () => ({
          file: {
            title: 'Runbook: Deploys',
            permalink: 'https://example.slack.com/docs/T1/F123',
          },
        })),
        list: mock.fn(),
      },
    };
    deps = {
      client,
      userId: 'U123',
      channelId: 'C123',
      threadTs: '1700000000.000100',
      messageTs: '1700000000.000100',
    };
  });

  it('list_runbooks lists only runbooks', async () => {
    client.files.list = mock.fn(async () => ({
      files: [
        {
          id: 'F123',
          title: 'Runbook: Deploys',
          permalink: 'https://example.com/F123',
        },
        {
          id: 'F456',
          title: 'Lunch orders',
          permalink: 'https://example.com/F456',
        },
      ],
    }));

    const result = await invoke(listRunbooks, deps);

    assert.strictEqual(client.files.list.mock.calls[0].arguments[0].types, 'canvas');
    assert.ok(result.includes('[Runbook: Deploys](https://example.com/F123) (`F123`)'));
    assert.ok(!result.includes('Lunch orders'));
  });

  it('list_runbooks without any', async () => {
    client.files.list = mock.fn(async () => ({ files: [] }));

    assert.strictEqual(await invoke(listRunbooks, deps), 'No runbooks yet.');
  });

  it('read_runbook returns its markdown', async () => {
    client.apiCall = mock.fn(async () => ({ content: '# Steps\n1. Rotate the secret' }));

    const result = await invoke(readRunbook, deps, { canvas_id: 'F123' });

    assert.deepStrictEqual(client.apiCall.mock.calls[0].arguments, [
      'canvases.getContent',
      {
        canvas_id: 'F123',
      },
    ]);
    assert.strictEqual(result, '# Steps\n1. Rotate the secret');
  });

  it('read_runbook reports errors', async () => {
    client.apiCall = mock.fn(async () => {
      throw slackError('canvas_not_found');
    });

    const result = await invoke(readRunbook, deps, { canvas_id: 'F404' });

    assert.ok(result.includes('canvas_not_found'));
  });

  it('create_runbook adds a channel tab', async () => {
    client.canvases.create = mock.fn(async () => ({ canvas_id: 'F123' }));

    const result = await invoke(createRunbook, deps, {
      markdown: '# Steps\n1. Redeploy',
      topic: 'Deploys',
    });

    const args = client.canvases.create.mock.calls[0].arguments[0];
    assert.strictEqual(args.title, 'Runbook: Deploys');
    assert.strictEqual(args.channel_id, 'C123');
    assert.deepStrictEqual(args.document_content, {
      type: 'markdown',
      markdown: '# Steps\n1. Redeploy',
    });
    assert.deepStrictEqual(client.files.info.mock.calls[0].arguments[0], { file: 'F123' });
    assert.strictEqual(result, 'Created [Runbook: Deploys](https://example.slack.com/docs/T1/F123).');
  });

  it('create_runbook asks to fix rejected markdown', async () => {
    client.canvases.create = mock.fn(async () => {
      throw slackError('canvas_creation_failed', 'Unsupported nested list');
    });

    const result = await invoke(createRunbook, deps, {
      markdown: '1. - x',
      topic: 'Deploys',
    });

    assert.ok(result.includes('Unsupported nested list'));
    assert.ok(result.includes('call create_runbook again'));
  });
});
