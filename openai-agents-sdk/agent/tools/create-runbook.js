import { tool } from '@openai/agents';
import { z } from 'zod';

export const createRunbook = tool({
  name: 'create_runbook',
  description:
    'Create a runbook as a tab in the current channel so the whole team can read and edit it.\n\n' +
    'Only create a runbook when `list_runbooks` shows none that covers the topic.',
  parameters: z.object({
    markdown: z
      .string()
      .describe('The runbook as markdown, with short sections for when to use it, the steps, and who to ask.'),
    topic: z
      .string()
      .describe("What the runbook covers, such as `Rotating the signing secret`. It's titled `Runbook: <topic>`."),
  }),
  execute: async ({ markdown, topic }, context) => {
    const deps = /** @type {import('../deps.js').AgentDeps} */ (context?.context);
    try {
      const created = await deps.client.canvases.create({
        title: `Runbook: ${topic}`,
        document_content: {
          type: 'markdown',
          markdown,
        },
        channel_id: deps.channelId,
      });
      const { file } = await deps.client.files.info({
        file: /** @type {string} */ (created.canvas_id),
      });
      return `Created [${file?.title}](${file?.permalink}).`;
    } catch (e) {
      const err = /** @type {any} */ (e);
      if (err.data?.detail) {
        return (
          `Could not create the runbook: ${err.data.error} (${err.data.detail}). ` +
          'Fix the markdown and call create_runbook again.'
        );
      }
      return `Could not create the runbook: ${err.data?.error || err.message}`;
    }
  },
});
