import { AgentDeps, runAgent } from '../../agent/index.js';
import { conversationStore } from '../../thread-context/index.js';
import { buildFeedbackBlocks } from '../views/feedback-builder.js';

const LEARNED_SUBTYPES = new Set([undefined, 'file_share', 'thread_broadcast']);

const RUNBOOK_WRITES = new Set(['create_runbook', 'slack_create_canvas', 'slack_update_canvas']);

/**
 * @param {import('@slack/types').MessageEvent} event
 * @returns {event is import('@slack/types').GenericMessageEvent}
 */
function isGenericMessageEvent(event) {
  return !('subtype' in event && event.subtype !== undefined);
}

/**
 * @param {import('@slack/types').MessageEvent} event
 * @returns {event is import('@slack/types').GenericMessageEvent | import('@slack/types').FileShareMessageEvent | import('@slack/types').ThreadBroadcastMessageEvent}
 */
function isLearnedMessageEvent(event) {
  return LEARNED_SUBTYPES.has(event.subtype);
}

/**
 * Handle messages sent to the agent via DM or in threads the bot is part of.
 *
 * The agent also learns from channel messages, adding anything they settle
 * to the team's runbooks.
 * @param {import('@slack/bolt').AllMiddlewareArgs & import('@slack/bolt').SlackEventMiddlewareArgs<'message'>} args
 * @returns {Promise<void>}
 */
export async function handleMessage({ client, context, event, logger, say, sayStream, setStatus }) {
  // Skip bot messages
  if ('bot_id' in event && event.bot_id) return;

  const isDm = event.channel_type === 'im';

  if (!isDm && isLearnedMessageEvent(event)) {
    try {
      const deps = new AgentDeps(
        client,
        /** @type {string} */ (context.userId),
        event.channel,
        event.thread_ts || event.ts,
        event.ts,
        context.userToken,
      );
      const result = await runAgent(`Learn from this channel message:\n\n${event.text || ''}`, deps);
      if (result.newItems.some((item) => RUNBOOK_WRITES.has(/** @type {any} */ (item.rawItem).name))) {
        await client.chat.postEphemeral({
          channel: event.channel,
          markdown_text: result.finalOutput,
          thread_ts: event.thread_ts,
          user: /** @type {string} */ (context.userId),
        });
      }
    } catch (e) {
      logger.error(`Failed to learn from message: ${e}`);
    }
  }

  // Skip message subtypes (edits, deletes, etc.)
  if (!isGenericMessageEvent(event)) return;

  const isThreadReply = !!event.thread_ts;

  if (isDm) {
    // DMs are always handled
  } else if (isThreadReply) {
    // Channel thread replies are handled only if the bot is already engaged
    const history = conversationStore.getHistory(event.channel, /** @type {string} */ (event.thread_ts));
    if (history === null) return;
  } else {
    // Top-level channel messages are handled by app_mentioned
    return;
  }

  try {
    const channelId = event.channel;
    const text = event.text || '';
    const threadTs = event.thread_ts || event.ts;
    const userId = /** @type {string} */ (context.userId);

    // Get conversation history
    const history = conversationStore.getHistory(channelId, threadTs);

    // Set assistant thread status with loading messages
    await setStatus({
      status: 'Thinking\u2026',
      loading_messages: [
        'Teaching the hamsters to type faster\u2026',
        'Untangling the internet cables\u2026',
        'Consulting the office goldfish\u2026',
        'Polishing up the response just for you\u2026',
        'Convincing the AI to stop overthinking\u2026',
      ],
    });

    // Build input for the agent
    /** @type {string | import('@openai/agents').AgentInputItem[]} */
    const inputItems = history ? [...history, { role: 'user', content: text }] : text;

    // Run the agent
    const deps = new AgentDeps(client, userId, channelId, threadTs, event.ts, context.userToken);
    const result = await runAgent(inputItems, deps);

    // Stream response in thread with feedback buttons
    const streamer = sayStream();
    await streamer.append({ markdown_text: result.finalOutput });
    const feedbackBlocks = buildFeedbackBlocks();
    await streamer.stop({ blocks: feedbackBlocks });

    // Store conversation history
    conversationStore.setHistory(channelId, threadTs, result.history);
  } catch (e) {
    logger.error(`Failed to handle message: ${e}`);
    await say({
      text: `:warning: Something went wrong! (${e})`,
      thread_ts: event.thread_ts || event.ts,
    });
  }
}
