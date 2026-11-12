---
name: t3-project-setup
description: >-
  Make this bot the notifier for one T3 Code project: set up its own webhook
  routine, register that project's route in t3listen (listen.json "routes")
  while the user pastes the routine's URL and key into a Terminal window, test
  it, restart the listener, and remove it later. Use for "notify me about
  <project>", "be the notifier for <project>", runs of that routine, and
  stopping it. Not for phone answers to every project (t3-phone-answers).
---
Follow the t3-tots-rules skill (skills/t3-tots-rules/SKILL.md) when this bot has it; the rules below are the ones this skill needs either way. ListMachines, Shell on a computer, routines and memory are Grok Bot only (t3-tots-rules "Grok Bot only"). This skill covers macOS.

This bot is a notifier: `t3listen` on the user's Mac sends it the events of one T3 project, and it tells the user. It never answers questions or approvals, never runs `t3ctl answer` and never changes threads. The user answers in T3, or asks T3 Tots. T3 Tots doesn't take part in this setup, but its phone answers must already be on (they own the main webhook in `listen.json`), and the T3 Tots tools must be new enough to know routes.

## Rules
- The webhook URL and the Authorization header go from the routine panel straight into the Terminal window. This bot and the chat never receive them. If the user pastes either into chat, don't repeat it, ask them to paste it into the window instead, and suggest regenerating the key in the routine panel.
- Never open, print or copy `listen.json` or the `token` file. Learn what is set only from `node t3listen status`, which shows route names and header counts, never a URL or a key.
- Never run `node t3listen setup` without `--project`, and never pass `--machine`. Both replace the main webhook that T3 Tots uses, so every other project's notifications would come here and T3 Tots would get none.
- Never run `uninstall`. Run `install` only to restart the listener in "Setup" step 5 or in "Remove".
- Setup, remove and restart each wait for the user's OK in chat. Checks that only read (`help`, `status`, `t3ctl projects`, `test --dry-run`) need no OK.
- One setup window per computer at a time: another bot writing a route at the same moment can drop one. Check `status` afterwards.
- Keep the project name, the computer and the routine name in memory, never in this skill.

## Before you start (read only)
Run these via Shell on the Mac, from the tools folder (the one in memory, else `~/t3-tots`):
1. ListMachines, then pick the Mac where the project lives: `node t3ctl projects` lists it there. If it is on several Macs, check 2 and 3 on each, then do "Setup" steps 3 to 5 on each.
2. `node t3listen help` must list `setup --project`. If it doesn't, these tools are older than routes: there `setup --project` ignores `--project` and replaces the main webhook. Stop, and ask the user to have T3 Tots update its tools (t3-install-tools) first. The `VERSION` file can't tell you this. The setup window in step 3 checks this again on its own.
3. `node t3listen status`:
   - `config: no listen.json yet`: T3 Tots phone answers aren't set up, so there is no main webhook to keep. Ask the user to turn them on with T3 Tots first (t3-phone-answers).
   - `running: no` or `autostart: not installed`: the listener is off. A route can still be saved, but nothing is sent until T3 Tots turns phone answers back on. Say so, and skip `install` in step 5.
   - A `routes:` line lists the routes already set, by name. A route for this project is replaced by step 3.

## Setup
1. **Routine.** If memory has this bot's routine for the project, reuse it. Otherwise create one with UpdateRoutine: a webhook trigger, the name **T3 notices: <project>**, and exactly the prompt under "Routine prompt" with the project name filled in. You never see its key: link the routine panel's Webhook URL and Authorization header for the user, who copies them in step 3.
2. **Project name.** Use the title as `node t3ctl projects` prints it (the second column). Case and spaces at either end don't count; every other character does. Check it with `node t3listen test --project '<project>' --dry-run`, which sends nothing. A `note: no T3 project is named "<project>" right now` line means T3 has no project by that name, so fix the spelling. No note means it matches, as long as T3 is running and the tools folder has a token; without those no note appears either way, so trust `t3ctl projects`. Two T3 projects with the same title both come here.
3. **Register (after the user's OK).** Ask once, in one short message: which project, which Mac, that a Terminal window opens there for two pastes, that the listener restarts briefly afterwards, and that from then on this project's events, questions included, come to this bot instead of T3 Tots (answer them in T3). After the OK, open the window via Shell on that Mac. The folder and project name go in as arguments after `--`, never inside the AppleScript source; `quoted form of` then shell-quotes them for `do script`. `$`, backticks and `\` still expand inside double quotes, so prefer single quotes or escape those too. Escape `\"` inside those double quotes, or `'\''` inside single quotes:
   `osascript -e 'on run argv' -e 'tell application "Terminal" to activate' -e 'tell application "Terminal" to do script "cd " & quoted form of (item 1 of argv) & " && if node t3listen help | grep -q setup.--project; then node t3listen setup --project " & quoted form of (item 2 of argv) & "; else echo OLD_T3LISTEN: this t3listen has no routes, nothing was changed; fi"' -e 'end run' -- "<tools folder>" "<project>"`
   The window starts setup only when that t3listen knows routes; otherwise it prints `OLD_T3LISTEN` and changes nothing (see "Errors"). The window shows `T3 Tots listener setup for project "<project>"`, then "Line 1: Webhook URL starting https://" and "Line 2: Authorization header starting Authorization:". Tell the user the same in one short message: copy the Webhook URL from this bot's routine panel, paste it there and press Enter, then do the same with the Authorization header. Each character shows as `*`. Setup ends on its own with `saved listen.json (route "<project>": url https://<host>/****, 1 header(s); ...)`. You can't read the window, so when the user says it's done, check that `node t3listen status` lists the project on its `routes:` line. A wrong paste does no harm: open the window again, and it replaces this project's route only.
4. **Test.** `node t3listen test --project '<project>'` must print `OK: route "<project>" answered HTTP 200`, and this routine must receive a `test` event whose `project` is the name.
   - `OK: webhook (no route for "<project>", so url) ...`: no route was saved, and the test went to T3 Tots's routine, which ignores tests. Redo step 3.
   - A `note:` line: the name matches no T3 project. Remove that route ("Remove"), then redo steps 2 and 3.
   - `WEBHOOK_REJECTED` or `WEBHOOK_UNREACHABLE`: see "Errors".
5. **Restart.** The running listener reads `listen.json` only when it starts. Look at the `approvals:` line of `node t3listen status`: if it says "installed with --approvals", run `node t3listen install --approvals`, else `node t3listen install`. Notifications pause for a moment; run ends in that gap are caught up after the restart. Then `node t3listen status` must show `running: yes` and the project on the `routes:` line. Tell the user in one line that this project's notifications now come here. Save to memory: notifier for <project> on <computer>, the routine name, and the date.

## Remove (after the user's OK)
1. `node t3listen setup --project '<project>' --remove`. Nothing is pasted, so no window is needed. It prints `removed route "<project>" from listen.json; its events go to url again.`
2. Restart as in "Setup" step 5. `node t3listen status` no longer lists the project; the `routes:` line disappears when no routes are left.
3. Tell the user this project's events go to T3 Tots again; a question this bot reported that is still open closes there too, so its message here may stay. Pause or delete this bot's routine only if the user asks. Update memory.

## Errors
| What you see | Meaning and next step |
|---|---|
| `node t3listen help` has no `setup --project`, or the window printed `OLD_T3LISTEN` | Tools older than routes. Nothing was changed. Ask for a T3 Tots tools update first |
| `NO_LISTEN_CONFIG` | No main webhook yet. T3 Tots phone answers come first |
| `BAD_URL` | Line 1 wasn't the routine's `https://` Webhook URL (often the Authorization header pasted first). Open the window again |
| `BAD_HEADER` | Line 2 wasn't `Authorization: ...`. Open the window again |
| `BAD_LISTEN_CONFIG` (setup says "nothing was saved", or `status` says `routes: invalid`) | Another route in `listen.json` is broken; the message names it, never its URL. Don't edit the file. Tell the user; that route can be removed with `setup --project '<that name>' --remove` after their OK |
| `USAGE` | The project name was empty. Pass it after `--project` |
| `NOT_FOUND` from `--remove` | No route by that name. Check the `routes:` line of `status` |
| `WEBHOOK_REJECTED` HTTP 401 or 403 | Wrong key. Redo "Setup" step 3 with the routine panel's current Authorization header |
| `WEBHOOK_REJECTED` with a rate limit | The routine platform is busy. It clears on its own; the listener keeps retrying |
| `WEBHOOK_UNREACHABLE` | The URL can't be reached. Check the network, then redo step 3 if it persists |
| `note: no T3 project is named ...` | Spelling. See "Setup" step 2 |
| Test OK, but no real events arrive | The listener wasn't restarted (step 5) or isn't running (`status`) |
| `NODE_TOO_OLD`, `TOOLS_INCOMPLETE`, `INSTALL_FAILED` | Relay it; T3 Tots or the user updates Node or the tools (t3-tots-rules "Status words") |

## Routine prompt
Use this text verbatim for the routine, with the project name filled in:

> A T3 Tots listener on one of the user's computers POSTed a T3 Code event to this webhook for the T3 project "<project>". Follow t3-project-setup "On an event" for that project only.

## On an event (routine runs)
Write to the user in Japanese unless memory sets another language. Keep each message to one or two short lines, name the project and the thread title, and never paste raw JSON, ids or long replies.
- Only this routine's project counts: compare `project` with the name in the routine prompt, ignoring case and spaces at either end. Anything else gets no message. In a `thread.failed.batch`, keep only the entries in `failures` for this project.
- Duplicates: skip an event whose `eventId` you already handled; a resend after a retry or a restart keeps its `eventId`. Several events that arrive together go into one message. A `request.resolved` that arrives with its own `request.opened` becomes one line saying the question was asked and is already closed.
- `test`: one line while setup is in progress ("通知の接続を確認しました（<machine>）"); otherwise nothing.
- `request.opened`: what the thread asks, from `title`, `context` and the first question or the approval prompt, and that it is answered in T3. Example: "【<project>】「<title>」が質問しています：<question>（T3 で回答してください）". Don't show options as cards and don't answer.
- `request.resolved`: only for a question you reported. If `answeredHere` is true, nothing. Otherwise one line that it closed (answered in T3, cancelled, expired).
- `thread.finished`: that it finished, with `durationSec` in plain words and one line from `lastReply`. Example: "【<project>】「<title>」が終わりました（12分）：<lastReply の要点>".
- `thread.cancelled`: that it stopped without finishing.
- `thread.failed`: that it failed, with `error` in one line. With `usageLimit` and `autoResumeSet`: it resumes on its own at `resumeAtLocal`. With `usageLimit` but not set: it stopped on a usage limit and needs a resume in T3. A sub-task (`delegated: true`) is labeled as a sub-task.
- `thread.failed.batch`: one message: how many of this project's threads failed and when, then one line per entry.
- Unknown or malformed events: nothing.
