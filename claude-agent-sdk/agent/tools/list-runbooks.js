import { tool } from '@anthropic-ai/claude-agent-sdk';

const RUNBOOK_PREFIX = 'Runbook:';

/** @param {import('../agent.js').AgentDeps} deps */
export const listRunbooks = (deps) =>
  tool(
    'list_runbooks',
    "List the team's runbooks: canvases titled `Runbook: <topic>`.\n\n" +
      'Call this before answering a request or writing a runbook, then read the ' +
      'one that covers the topic with `read_runbook`.',
    {},
    async () => {
      let text;
      try {
        const response = await deps.client.files.list({
          types: 'canvas',
        });
        const runbooks = (response.files ?? [])
          .filter((file) => file.title?.startsWith(RUNBOOK_PREFIX))
          .map((file) => `- [${file.title}](${file.permalink}) (\`${file.id}\`)`);
        text = runbooks.length > 0 ? runbooks.join('\n') : 'No runbooks yet.';
      } catch (e) {
        const err = /** @type {any} */ (e);
        text = `Could not list runbooks: ${err.data?.error || err.message}`;
      }
      return {
        content: [
          {
            type: 'text',
            text,
          },
        ],
      };
    },
  );
