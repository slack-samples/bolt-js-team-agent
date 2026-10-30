# Team Agent for Slack

A sample Slack agent built with [Bolt for JavaScript](https://docs.slack.dev/tools/bolt-js/) that keeps your team's runbooks current and helps route the requests that come in. Runbooks are Slack canvases titled `Runbook: <topic>`. The agent answers from them, and it learns from the messages in your team's channels, so the runbooks it writes are the ones it answers from next time.

## Choose Your Framework

This repo contains the same app built with two different AI agent frameworks. Pick the one that fits your stack:

| App | Directory | Get Started | Framework |
|-----|-----------|-------------|-----------|
| **Claude Agent SDK** | `claude-agent-sdk/` | [View README](./claude-agent-sdk/README.md) | [claude-agent-sdk](https://platform.claude.com/docs/en/agent-sdk/overview) |
| **OpenAI Agents SDK** | `openai-agents-sdk/` | [View README](./openai-agents-sdk/README.md) | [openai-agents](https://openai.github.io/openai-agents-js/) |

All implementations share the same Slack listener layer and the same user experience. The only difference is how the agent is defined and executed under the hood.

## Claude Code, Codex, Cursor, and Other Coding Agents

Install the [Slack MCP and Skills Plugin](https://docs.slack.dev/ai/slack-skills-plugin/) so your coding agent can create, run, and deploy Slack apps, look up Web API methods and scopes, and build Block Kit without guessing.

### Claude Code

Run this in a Claude Code session:

```
/plugin install slack@claude-plugins-official
```

### Codex

Run this in your terminal:

```sh
codex plugin marketplace add slackapi/slack-skills-plugin
codex plugin add slack@slack
```

### Cursor

Run this in a Cursor Agent chat:

```
/add-plugin slack
```

### Other agents

Install the skills with `npx skills`, using your [agent's identifier](https://github.com/vercel-labs/skills#supported-agents):

```sh
npx skills add slackapi/slack-skills-plugin -y -a <agent>

# For example, OpenCode
npx skills add slackapi/slack-skills-plugin -y -a opencode
```

## What It Can Do

The team agent interacts with users through five entry points:

* **App Home** — Displays a welcome message with instructions on how to interact.
* **Direct Messages** — Users message the agent directly to find a runbook or triage a request. It responds in-thread, maintaining context across follow-ups.
* **Channel @mentions** — Mention the agent in a team channel with a request. It answers from a runbook when one covers it, or offers to start one.
* **Channel messages** — The agent follows along in channels it's a member of. When a message settles something worth keeping, the agent adds it to the team's runbooks on its own.
* **Assistant Panel** — Users click _Add Agent_ in Slack, select the agent, and pick from suggested prompts or type a message.

With the bot token, the agent lists, reads, and creates runbooks. A person who connects the [Slack MCP Server](https://github.com/slackapi/slack-mcp-server) from the Home tab has the agent work with runbooks as them instead, which can also update existing runbooks. When the agent changes a runbook, it tells the message's author with an ephemeral message only they can see.

For full setup instructions, pick a framework above and follow the README in that directory.
