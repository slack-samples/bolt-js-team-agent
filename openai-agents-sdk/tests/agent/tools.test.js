import assert from 'node:assert';
import { beforeEach, describe, it, mock } from 'node:test';

import { RunContext } from '@openai/agents';

import { AgentDeps } from '../../agent/deps.js';
import { createRunbook, listRunbooks, readRunbook } from '../../agent/tools/index.js';

/**
 * @param {string} error
 * @param {string} [detail]
 */
function slackError(error, detail) {
  return Object.assign(new Error(error), {
    data: {
      detail,
      error,
      ok: false,
    },
  });
}

/**
 * @param {any} tool
 * @param {AgentDeps} deps
 * @param {Record<string, any>} [args]
 */
async function invoke(tool, deps, args = {}) {
  return await tool.invoke(new RunContext(deps), JSON.stringify(args));
}

describe('runbook tools', () => {
  let client;
  let deps;

  beforeEach(() => {
    client = {
      apiCall: mock.fn(),
      canvases: { create: mock.fn() },
      files: {
        info: mock.fn(async () => ({
          ok: true,
          file: {
            permalink: 'https://example.slack.com/docs/T1/F123',
            title: 'Runbook: Deploys',
          },
        })),
        list: mock.fn(),
      },
    };
    deps = new AgentDeps(client, 'U123', 'C123', '1700000000.000100', '1700000000.000100');
  });

  it('list_runbooks lists only runbooks', async () => {
    client.files.list.mock.mockImplementation(async () => ({
      ok: true,
      files: [
        {
          id: 'F123',
          permalink: 'https://example.com/F123',
          title: 'Runbook: Deploys',
        },
        {
          id: 'F456',
          permalink: 'https://example.com/F456',
          title: 'Lunch orders',
        },
      ],
    }));

    const result = await invoke(listRunbooks, deps);

    assert.strictEqual(client.files.list.mock.calls[0].arguments[0].types, 'canvas');
    assert.ok(result.includes('[Runbook: Deploys](https://example.com/F123) (`F123`)'));
    assert.ok(!result.includes('Lunch orders'));
  });

  it('list_runbooks without any', async () => {
    client.files.list.mock.mockImplementation(async () => ({
      ok: true,
      files: [],
    }));

    assert.strictEqual(await invoke(listRunbooks, deps), 'No runbooks yet.');
  });

  it('read_runbook returns its markdown', async () => {
    client.apiCall.mock.mockImplementation(async () => ({
      ok: true,
      content: '# Steps\n1. Rotate the secret',
    }));

    const result = await invoke(readRunbook, deps, {
      canvas_id: 'F123',
    });

    assert.deepStrictEqual(client.apiCall.mock.calls[0].arguments, [
      'canvases.getContent',
      {
        canvas_id: 'F123',
      },
    ]);
    assert.strictEqual(result, '# Steps\n1. Rotate the secret');
  });

  it('read_runbook reports errors', async () => {
    client.apiCall.mock.mockImplementation(async () => {
      throw slackError('canvas_not_found');
    });

    const result = await invoke(readRunbook, deps, {
      canvas_id: 'F404',
    });

    assert.ok(result.includes('canvas_not_found'));
  });

  it('create_runbook adds a channel tab', async () => {
    client.canvases.create.mock.mockImplementation(async () => ({
      ok: true,
      canvas_id: 'F123',
    }));

    const result = await invoke(createRunbook, deps, {
      markdown: '# Steps\n1. Redeploy',
      topic: 'Deploys',
    });

    assert.deepStrictEqual(client.canvases.create.mock.calls[0].arguments[0], {
      channel_id: 'C123',
      document_content: {
        markdown: '# Steps\n1. Redeploy',
        type: 'markdown',
      },
      title: 'Runbook: Deploys',
    });
    assert.deepStrictEqual(client.files.info.mock.calls[0].arguments[0], {
      file: 'F123',
    });
    assert.strictEqual(result, 'Created [Runbook: Deploys](https://example.slack.com/docs/T1/F123).');
  });

  it('create_runbook asks to fix rejected markdown', async () => {
    client.canvases.create.mock.mockImplementation(async () => {
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
