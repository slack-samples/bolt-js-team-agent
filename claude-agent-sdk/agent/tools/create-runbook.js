import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

/** @param {import('../agent.js').AgentDeps} deps */
export const createRunbook = (deps) =>
  tool(
    'create_runbook',
    'Create a runbook as a tab in the current channel so the whole team can read and edit it.\n\n' +
      'Only create a runbook when `list_runbooks` shows none that covers the topic.',
    {
      markdown: z
        .string()
        .describe('The runbook as markdown, with short sections for when to use it, the steps, and who to ask.'),
      topic: z
        .string()
        .describe("What the runbook covers, such as `Rotating the signing secret`. It's titled `Runbook: <topic>`."),
    },
    async ({ markdown, topic }) => {
      let text;
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
        text = `Created [${file?.title}](${file?.permalink}).`;
      } catch (e) {
        const err = /** @type {any} */ (e);
        const detail = err.data?.detail;
        text = detail
          ? `Could not create the runbook: ${err.data.error} (${detail}). Fix the markdown and call create_runbook again.`
          : `Could not create the runbook: ${err.data?.error || err.message}`;
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
