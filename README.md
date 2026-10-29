# Task tracker

A small Mac desktop app for keeping every task in one place while you work across Claude, ChatGPT, Slack, GitHub, and email. Everything lives in one SQLite file on your Mac. No accounts, no hosting, no cost.

Both Claude and ChatGPT can read and update it through MCP: add tasks, attach the conversation they're in, leave notes, mark things done, propose new work from a daily sweep of your inbox and Slack, and tell you what to work on next.

Setting it up for yourself or someone else? Read [AGENTS.md](AGENTS.md); it's written for an AI assistant doing the setup and lists what is personal (kept outside the repo) and what is generic.

## What it tracks

- **Tasks** with priority (1 urgent → 4 low), impact (1 tiny → 5 huge), **effort** (quick / medium / deep), **next action** (Slack reply, email reply, creative review, write, build, decide, meeting, research, wait), due date, status, project, and tags
- **Context** on every task: a markdown background section, Slack **channels to watch**, and **skills** an assistant should load before working on it
- **LLM handoff** on every task and every project: a living quick-reference (Current state / Decisions so far / Sources / Next steps / Open questions / Gotchas). The MCP instructions tell every assistant to read it first and rewrite it before stopping. If the task changes after the handoff was written, it's flagged **stale**.
- **Inbox** of proposals from your daily sweep: accept (creates a task, or adds to an existing one, or reopens a finished one) or dismiss. Dismissed URLs are never proposed again.
- **Victory pile:** finished tasks with closing notes, grouped by week. Finishing a task gets you confetti.
- **Recurring tasks**: daily, weekly (pick weekdays), monthly, yearly, every N
- **People**: who you're *waiting on* (blocks the task), who's *waiting on you* (the "You owe" view, with a count of how many times they've asked), and collaborators
- **Dependencies** between tasks
- **Links** to Claude chats, ChatGPT chats, Slack messages, GitHub PRs and issues, Google Docs, emails, Figma, and so on. The type is detected from the URL.
- **Notes**, attached to a task or standalone
- **Copy task prompt**: one button builds a self-contained brief (context, people, links, notes, instructions to update the task) to paste into any assistant.

Views: **Today** (who's asked twice, overdue, due today, focus next, quick wins, waiting on people), **Inbox**, **You owe**, **Quick wins**, **Chip away** (deep work, least-recently-touched first), **All tasks** with filters, **Calendar**, **People**, **Notes**, **Victory pile**, and search.

**Quest mode** (default; toggle at the bottom of the sidebar): the same data as a SNES-style quest log. Today becomes the Town square with villagers holding "!" when they're waiting on you; deep tasks are Main quests with progress bars; quick ones are Side quests; the Inbox is a Quest board; People is your Party; projects are a World map; the Victory pile is the Trophy room. A hedgehog tracks XP, level, and day streak. Pixel fonts are bundled in `public/fonts/` (Press Start 2P and Pixelify Sans, both OFL). A Mac OS 9-style list mode and a night CRT theme are also there.

**Menu bar:** the check icon next to the clock shows overdue count; its menu lists overdue, due today, focus, quick wins, and what you owe people. Closing the window keeps the app in the menu bar; Cmd+Q quits.

## Run it

Requires Node 24+ and pnpm.

```bash
pnpm install
pnpm desktop        # the window (starts the server if none is running)
pnpm start          # server only, UI at http://localhost:3789
pnpm test
pnpm package        # builds dist/Tasks-darwin-arm64/Tasks.app
```

Data lives in `~/.task-tracker/` (`tasks.db`, daily backups in `backups/`, the MCP token, your config). Back up that folder and you've backed up everything. Override the location with `TASKS_DATA_DIR`.

Put your name in `~/.task-tracker/config.json` so assistants address you properly:

```json
{ "owner": "Your name", "company": "Your company", "team": "Your team" }
```

## Connect Claude (Desktop or Code)

No tunnel needed. Claude runs the server directly. Click **Connect Claude / ChatGPT** at the bottom of the sidebar for the exact snippet with your path filled in, or:

```bash
claude mcp add --scope user task-tracker -- node /path/to/task-tracker/src/mcp-stdio.js
```

For Claude Desktop or Codex, add an MCP server with command `node` and args `["/path/to/task-tracker/src/mcp-stdio.js"]`.

## Connect ChatGPT (through a tunnel)

ChatGPT needs a public address, so you expose the local server with a tunnel. The free ngrok static domain works and never changes:

1. `brew install ngrok`, sign up, add your authtoken, and claim a free static domain in the ngrok dashboard.
2. Run `bash scripts/install-login-items.sh <your-static-domain>`. This installs two login items: the server and the tunnel, both restart on crash and start at login.
3. In ChatGPT: Settings → Connectors → Create. URL is `https://<your-static-domain>/mcp/<token>` where the token is in `~/.task-tracker/mcp-token` (the app's **Connect** dialog shows it). No authentication.
4. To have it on in every chat, create a ChatGPT Project and enable the connector there. Scheduled tasks in that project can run your daily sweep.

The random token in the path is what keeps strangers out. Anyone with the full URL can read and edit your tasks, so don't post it anywhere.

If you want a scheduled sweep to run while your laptop would otherwise be asleep, `scripts/install-wake-schedule.sh` and `scripts/install-wake-daemon.sh` set up wake times; edit the times in them first.

## The daily sweep

The intended workflow is a scheduled prompt (ChatGPT or Codex, with Slack/Gmail/GitHub connectors) that reads your channels, mentions, email, and PRs each morning and files **proposals** into the Inbox. It never creates tasks on its own; you accept or dismiss. The prompt is personal (it names your channels and coworkers), so it isn't in this repo. Keep yours in `~/.task-tracker/prompts/`; [AGENTS.md](AGENTS.md) describes the structure that works, and the sweep's config (channel lists, teammates, repos) lives in the app under the **Daily sweep** project's handoff so you can edit it without touching the prompt.

## How the assistants use it

The MCP server exposes `get_briefing`, `list_tasks`, `create_task`, `update_task`, `complete_task`, `add_link`, `add_note`, `set_person`, `propose_item`, `accept_item`, `update_handoff`, `get_sweep_config`, `log_sweep`, `calendar`, `search`, and more. Its instructions tell assistants to search open and finished tasks before creating anything, attach the current conversation as a link, read the handoff first, and rewrite it before stopping. Things added by an assistant are tagged `claude` or `chatgpt`. The window refreshes every 15 seconds.

Keyboard: `n` opens a new task, `Esc` closes the side panel. Double-click a calendar day to add a task due that day.

## Layout

```
src/store.js       all task logic + SQLite (the only place rules live)
src/mcp.js         MCP tool definitions, shared by both transports
src/mcp-stdio.js   stdio MCP for Claude Desktop / Claude Code / Codex
src/server.js      HTTP: JSON API for the UI + /mcp/<token> endpoint for the tunnel
public/            the UI (plain HTML/CSS/JS, no build step)
electron/main.cjs  desktop window + menu-bar tray
scripts/           login items, wake schedule, icons, screenshots
test/              node --test
```

Environment overrides: `PORT` (default 3789), `TASKS_DATA_DIR` (default `~/.task-tracker`).

## License

MIT.
