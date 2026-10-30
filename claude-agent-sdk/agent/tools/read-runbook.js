import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

/** @param {import('../agent.js').AgentDeps} deps */
export const readRunbook = (deps) =>
  tool(
    'read_runbook',
    "Read a runbook's content as markdown.\n\nRead a runbook before you answer from it.",
    {
      canvas_id: z.string().describe("The runbook's canvas ID from `list_runbooks`, such as `F0123ABCD`."),
    },
    async ({ canvas_id }) => {
      let text;
      try {
        const response = /** @type {{ content?: string }} */ (
          await deps.client.apiCall('canvases.getContent', {
            canvas_id,
          })
        );
        text = response.content ?? '';
      } catch (e) {
        const err = /** @type {any} */ (e);
        text = `Could not read the runbook: ${err.data?.error || err.message}`;
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
