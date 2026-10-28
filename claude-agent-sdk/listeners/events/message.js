import { runAgent } from '../../agent/index.js';
import { sessionStore } from '../../thread-context/index.js';
import { buildFeedbackBlocks } from '../views/feedback-builder.js';

const LEARNED_SUBTYPES = [undefined, 'file_share', 'thread_broadcast'];

const RUNBOOK_WRITES = [
  'mcp__agent-tools__create_runbook',
  'mcp__slack-mcp__slack_create_canvas',
  'mcp__slack-mcp__slack_update_canvas',
];

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
  return LEARNED_SUBTYPES.includes(event.subtype);
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
  if ('bot_id' in event && event.bot_id) return;

  const isDm = event.channel_type === 'im';

  if (!isDm && isLearnedMessageEvent(event)) {
    try {
      const deps = {
        client,
        userId: /** @type {string} */ (context.userId),
        channelId: event.channel,
        threadTs: event.thread_ts || event.ts,
        messageTs: event.ts,
        userToken: context.userToken,
      };
      const { responseText, toolNames } = await runAgent(
        `Learn from this channel message:\n\n${event.text || ''}`,
        undefined,
        deps,
      );
      if (toolNames.some((name) => RUNBOOK_WRITES.includes(name))) {
        await client.chat.postEphemeral({
          channel: event.channel,
          user: /** @type {string} */ (context.userId),
          thread_ts: event.thread_ts,
          markdown_text: responseText,
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
    const session = sessionStore.getSession(event.channel, /** @type {string} */ (event.thread_ts));
    if (session === null) return;
  } else {
    // Top-level channel messages are handled by app_mentioned
    return;
  }

  try {
    const channelId = event.channel;
    const text = event.text || '';
    const threadTs = event.thread_ts || event.ts;
    const userId = /** @type {string} */ (context.userId);

    // Get session ID for conversation context
    const existingSessionId = sessionStore.getSession(channelId, threadTs);

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

    // Run the agent with deps for tool access
    const deps = { client, userId, channelId, threadTs, messageTs: event.ts, userToken: context.userToken };
    const { responseText, sessionId: newSessionId } = await runAgent(text, existingSessionId ?? undefined, deps);

    // Stream response in thread with feedback buttons
    const streamer = sayStream();
    await streamer.append({ markdown_text: responseText });
    const feedbackBlocks = buildFeedbackBlocks();
    await streamer.stop({ blocks: feedbackBlocks });

    // Store session ID for future context
    if (newSessionId) {
      sessionStore.setSession(channelId, threadTs, newSessionId);
    }
  } catch (e) {
    logger.error(`Failed to handle message: ${e}`);
    await say({
      text: `:warning: Something went wrong! (${e})`,
      thread_ts: event.thread_ts || event.ts,
    });
  }
}
