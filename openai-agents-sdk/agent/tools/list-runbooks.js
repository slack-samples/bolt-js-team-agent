import { tool } from '@openai/agents';
import { z } from 'zod';

const RUNBOOK_PREFIX = 'Runbook:';

export const listRunbooks = tool({
  name: 'list_runbooks',
  description:
    "List the team's runbooks: canvases titled `Runbook: <topic>`.\n\n" +
    'Call this before answering a request or writing a runbook, then read the ' +
    'one that covers the topic with `read_runbook`.',
  parameters: z.object({}),
  execute: async (_args, context) => {
    const deps = /** @type {import('../deps.js').AgentDeps} */ (context?.context);
    let response;
    try {
      response = await deps.client.files.list({
        types: 'canvas',
      });
    } catch (e) {
      const err = /** @type {any} */ (e);
      return `Could not list runbooks: ${err.data?.error || err.message}`;
    }

    const runbooks = (response.files ?? [])
      .filter((file) => file.title?.startsWith(RUNBOOK_PREFIX))
      .map((file) => `- [${file.title}](${file.permalink}) (\`${file.id}\`)`);
    if (runbooks.length === 0) {
      return 'No runbooks yet.';
    }
    return runbooks.join('\n');
  },
});
