import { tool } from '@openai/agents';
import { z } from 'zod';

export const readRunbook = tool({
  name: 'read_runbook',
  description: "Read a runbook's content as markdown.\n\nRead a runbook before you answer from it.",
  parameters: z.object({
    canvas_id: z.string().describe("The runbook's canvas ID from `list_runbooks`, such as `F0123ABCD`."),
  }),
  execute: async ({ canvas_id }, context) => {
    const deps = /** @type {import('../deps.js').AgentDeps} */ (context?.context);
    try {
      const response = /** @type {{ content?: string }} */ (
        await deps.client.apiCall('canvases.getContent', {
          canvas_id,
        })
      );
      return response.content ?? '';
    } catch (e) {
      const err = /** @type {any} */ (e);
      return `Could not read the runbook: ${err.data?.error || err.message}`;
    }
  },
});
