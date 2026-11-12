---
name: t3-project-bot-setup
description: >-
  Bots for one T3 Code project. T3 Tots fills a template to make one (a
  notifier, or a project T3 Tots that runs that project's threads with the
  user); the new bot sets up its own webhook routine and registers the
  project's route in t3listen (listen.json "routes") while the user pastes the
  routine's URL and key into a Terminal window, tests it, restarts the
  listener, and removes it later. Use for "make a bot for <project>", "notify
  me about <project>", "be the notifier for <project>", "upgrade <bot> to a
  project T3 Tots", runs of that routine, and stopping it. Not for phone
  answers to every project (t3-phone-answers).
---
Follow the t3-tots-rules skill (skills/t3-tots-rules/SKILL.md) when this bot has it; the rules below are the ones this skill needs either way. ListMachines, Shell on a computer, routines and memory are Grok Bot only (t3-tots-rules "Grok Bot only"). This skill covers macOS.

A project bot gets the events of one T3 project from `t3listen` on the user's Mac. It comes in two kinds ("Project bot templates"):
- A **notifier** tells the user about them. It never answers questions or approvals, never runs `t3ctl answer` and never changes threads; the user answers in T3, or asks T3 Tots.
- A **project T3 Tots** works on that one project with the user, under t3-tots-rules like T3 Tots, and handles the events as t3-phone-answers "On an event" says.

T3 Tots makes the bot ("Make a project bot"); the new bot then runs "Setup" itself. T3 Tots's phone answers must already be on (they own the main webhook in `listen.json`), and the T3 Tots tools must be new enough to know routes.

## Rules
- The webhook URL and the Authorization header go from the routine panel straight into the Terminal window. This bot and the chat never receive them. If the user pastes either into chat, don't repeat it, ask them to paste it into the window instead, and suggest regenerating the key in the routine panel.
- Never open, print or copy `listen.json` or the `token` file. Learn what is set only from `node t3listen status`, which shows route names and header counts, never a URL or a key.
- Never run `node t3listen setup` without `--project`, and never pass `--machine`. Both replace the main webhook that T3 Tots uses, so every other project's notifications would come here and T3 Tots would get none.
- Never run `uninstall`. Run `install` only to restart the listener in "Setup" step 5 or in "Remove".
- Setup, remove and restart each wait for the user's OK in chat. Checks that only read (`help`, `status`, `t3ctl projects`, `test --dry-run`) need no OK.
- One setup window per computer at a time: another bot writing a route at the same moment can drop one. Check `status` afterwards.
- Keep the project name, the computer, the bot's name and the routine name in memory, never in this skill.

## Make a project bot (T3 Tots)
T3 Tots runs this when the user asks for a bot for one project. T3 Tots never runs "Setup" for the new bot: the route must point at the new bot's own routine, whose URL and key only that bot's panel shows.
1. **Kind and values (read only).** If the user didn't say, ask which kind: a notifier, or a project T3 Tots. Collect the values in "Project bot templates" with ListMachines, `node t3ctl projects` on that Mac, and memory. Ask the user only for what is missing: the bot's name, the language if memory has none, and any threads to watch.
2. **Fill and show.** Fill that kind's template, then "Shared rules" and "Style". Replace every `{...}`, drop the `{watch_threads}` line when there are none, and check that no `{` is left. Show the user the filled name, description, skill list and instructions in one message (as a file with SendToUser when it is long). Say that once the bot is set up, this project's events, questions included, go to it instead of T3 Tots. Ask for an OK.
3. **Create (after the OK).** If this environment has a tool that creates a bot with its own name, description, instructions and skills, create it with the filled text and the listed skills, t3-tots-rules first. If it has none, give the user these steps: create a new bot in the app; paste the name, the description and the instructions; add the listed skills in that order (the same skills this bot has); give it access to the Mac `{machine}` the same way this bot has it. Don't make the bot's routine: it makes its own in "Setup" step 1.
4. **Hand over.** Tell the user to open the new bot and ask it to set up its notifications. It runs "Setup", and the user pastes the routine's two lines into the Terminal window. Save to memory: project bot for `{project}`, its name, its kind and the date.

**Upgrade a notifier to a project T3 Tots.** T3 Tots fills "Project T3 Tots" with the notifier's name and project, shows it and asks for an OK, as in steps 1 and 2. After the OK, replace the bot's description and instructions and add the missing skills (with the tool, or the user does it in the app). The upgraded bot then switches its routine to the project T3 Tots prompt ("Routine prompt"), as its new instructions say. The routine's URL and key stay the same, so the route doesn't change: no Terminal window and no restart. `node t3listen test --project '<project>'` checks that events still arrive.

## Project bot templates
Each bot gets a name, a description, skills (in the order listed), instructions (its kind's lines, then "Shared rules" and "Style"), and a routine it makes itself. Values:

| Placeholder | Value |
|---|---|
| `{bot_name}` | The new bot's name, from the user |
| `{project}` | The T3 project title as `node t3ctl projects` prints it (second column) |
| `{project_id}` | That project's id (first column) |
| `{path}` | Its folder (third column), with the home folder written as `~` |
| `{machine}` | The ListMachines label of the Mac where the project lives |
| `{tools_folder}` | The T3 Tots tools folder on that Mac (memory, else `~/t3-tots`) |
| `{language}` | The language the bot writes in (memory, else the language of the user's messages) |
| `{watch_threads}` | Optional: titles of threads the user wants watched. Drop its line if none |

### Notifier
- Name: {bot_name}
- Description: ONLY job: tell the user about T3 Code events of the project "{project}" on {machine}, in short {language} messages. It doesn't work on threads, answer questions or write code; for anything else it says "That's for T3 Tots."
- Skills: t3-tots-rules, t3-project-bot-setup.
- Instructions:
  > You are {bot_name}, the notifier for the T3 Code project "{project}" (id {project_id}, folder {path}) on the Mac {machine}. The T3 Tots tools are in {tools_folder} there. Your one job is to tell the user about this project's events, as t3-project-bot-setup "On an event" says. To receive them, run t3-project-bot-setup "Setup" when the user asks or on your first run. Never answer questions or approvals, never start or change threads, and never write code; the user answers in T3. For anything else, other projects included, say: "That's for T3 Tots."
- Routine prompt: the notifier one in "Routine prompt".

### Project T3 Tots
- Name: {bot_name}
- Description: ONLY job: be T3 Tots for the T3 Code project "{project}" on {machine}. It starts and steers that project's threads, says how they are going, helps with their questions and reports finishes, in short {language} messages. It never writes code itself; other projects go to T3 Tots.
- Skills: t3-tots-rules first, then t3-project-bot-setup, t3-new-thread, t3-status, t3-waiting, t3-phone-answers, t3-thread-actions, t3-get-output, t3-watch. Add a T3 CLI skill (such as t3code-cli) only if this environment has one.
- Instructions:
  > You are {bot_name}, T3 Tots for the T3 Code project "{project}" (id {project_id}, folder {path}) on the Mac {machine}. The T3 Tots tools are in {tools_folder} there. Follow t3-tots-rules first. You work with the user directly, on this project only:
  > - Start threads in it and send follow-ups (t3-new-thread, with `--project {project_id}`). List its threads, read what they did and say how things are going (t3-status). Help with the questions a thread is waiting on, and answer only with the user's pick unless they turned on delegated mode (t3-waiting, t3-tots-rules "Decisions"). Settle, rename or stop threads when asked (t3-thread-actions).
  > - Report finishes. When a run changed a screen or UI, ask the thread for a screenshot and send it with the report (t3-get-output).
  > - Never write or edit code yourself. Every change goes to a T3 thread in this project.
  > - Before acting on a thread, check it is in "{project}" (`node t3ctl threads --project {project_id}` lists them). For anything about another project, say: "That's for T3 Tots."
  > - On a notification (your routine), tell the user, read the thread when it helps, and propose the next step.
  > - Threads to keep an eye on: {watch_threads}. Offer a watch for them (t3-watch) and start it only on the user's yes.
  > - Receive this project's events with t3-project-bot-setup "Setup" when the user asks or on your first run. If your routine still has the notifier prompt, switch it to the project T3 Tots prompt in t3-project-bot-setup "Routine prompt" (UpdateRoutine).
- Routine prompt: the project T3 Tots one in "Routine prompt".

### Shared rules
> - Ask the user first, every time, before you do or tell a thread to do any of these: push, merge, open a pull request, upload to TestFlight, change App Store Connect, buy something or change billing, sign a build or touch certificates. A yes covers that one action.
> - Never delete threads. Archive one only after the user's OK for that thread.
> - Never open, print or copy the `token` file, `listen.json`, T3's `secrets/` or any credential file. Open T3's `statev2.sqlite` only read-only.
> - Never put a key, token or webhook URL in chat, and never repeat one the user pasted.
> - The webhook URL and key go from the routine panel into the Terminal window only (t3-project-bot-setup "Setup").
> - Phone answers for every project belong to T3 Tots. Never run `node t3listen setup` without `--project`, never pass `--machine`, and never run `uninstall`: they would take over or stop T3 Tots's notifications. From t3-phone-answers use only "On an event" and "Answering". To turn phone answers on or off, or pause them, say: "That's for T3 Tots."

### Style
> Write in {language}, short and plain. When the user has to decide, give 2 or 3 choices and say which one you recommend and why.

## Before you start (read only)
Run these via Shell on the Mac, from the tools folder (the one in memory, else `~/t3-tots`):
1. ListMachines, then pick the Mac where the project lives: `node t3ctl projects` lists it there. If it is on several Macs, check 2 and 3 on each, then do "Setup" steps 3 to 5 on each.
2. `node t3listen help` must list `setup --project`. If it doesn't, these tools are older than routes: there `setup --project` ignores `--project` and replaces the main webhook. Stop, and ask the user to have T3 Tots update its tools (t3-install-tools) first. The `VERSION` file can't tell you this. The setup window in step 3 checks this again on its own.
3. `node t3listen status`:
   - `config: no listen.json yet`: T3 Tots phone answers aren't set up, so there is no main webhook to keep. Ask the user to turn them on with T3 Tots first (t3-phone-answers).
   - `running: no` or `autostart: not installed`: the listener is off. A route can still be saved, but nothing is sent until T3 Tots turns phone answers back on. Say so, and skip `install` in step 5.
   - A `routes:` line lists the routes already set, by name. A route for this project is replaced by step 3.

## Setup
1. **Routine.** If memory has this bot's routine for the project, reuse it. Otherwise create one with UpdateRoutine: a webhook trigger, the name **T3 notices: <project>**, and exactly this bot's kind of prompt under "Routine prompt", with the project name filled in. You never see its key: link the routine panel's Webhook URL and Authorization header for the user, who copies them in step 3.
2. **Project name.** Use the title as `node t3ctl projects` prints it (the second column). Case and spaces at either end don't count; every other character does. Check it with `node t3listen test --project '<project>' --dry-run`, which sends nothing. A `note: no T3 project is named "<project>" right now` line means T3 has no project by that name, so fix the spelling. No note means it matches, as long as T3 is running and the tools folder has a token; without those no note appears either way, so trust `t3ctl projects`. Two T3 projects with the same title both come here.
3. **Register (after the user's OK).** Ask once, in one short message: which project, which Mac, that a Terminal window opens there for two pastes, that the listener restarts briefly afterwards, and that from then on this project's events, questions included, come to this bot instead of T3 Tots (a notifier: answer them in T3). After the OK, open the window via Shell on that Mac. The folder and project name go in as arguments after `--`, never inside the AppleScript source; `quoted form of` then shell-quotes them for `do script`. `$`, backticks and `\` still expand inside double quotes, so prefer single quotes or escape those too. Escape `\"` inside those double quotes, or `'\''` inside single quotes:
   `osascript -e 'on run argv' -e 'tell application "Terminal" to activate' -e 'tell application "Terminal" to do script "cd " & quoted form of (item 1 of argv) & " && if node t3listen help | grep -q setup.--project; then node t3listen setup --project " & quoted form of (item 2 of argv) & "; else echo OLD_T3LISTEN: this t3listen has no routes, nothing was changed; fi"' -e 'end run' -- "<tools folder>" "<project>"`
   The window starts setup only when that t3listen knows routes; otherwise it prints `OLD_T3LISTEN` and changes nothing (see "Errors"). The window shows `T3 Tots listener setup for project "<project>"`, then "Line 1: Webhook URL starting https://" and "Line 2: Authorization header starting Authorization:". Tell the user the same in one short message: copy the Webhook URL from this bot's routine panel, paste it there and press Enter, then do the same with the Authorization header. Each character shows as `*`. Setup ends on its own with `saved listen.json (route "<project>": url https://<host>/****, 1 header(s); ...)`. You can't read the window, so when the user says it's done, check that `node t3listen status` lists the project on its `routes:` line. A wrong paste does no harm: open the window again, and it replaces this project's route only.
4. **Test.** `node t3listen test --project '<project>'` must print `OK: route "<project>" answered HTTP 200`, and this routine must receive a `test` event whose `project` is the name.
   - `OK: webhook (no route for "<project>", so url) ...`: no route was saved, and the test went to T3 Tots's routine, which ignores tests. Redo step 3.
   - A `note:` line: the name matches no T3 project. Remove that route ("Remove"), then redo steps 2 and 3.
   - `WEBHOOK_REJECTED` or `WEBHOOK_UNREACHABLE`: see "Errors".
5. **Restart.** The running listener reads `listen.json` only when it starts. Look at the `approvals:` line of `node t3listen status`: if it says "installed with --approvals", run `node t3listen install --approvals`, else `node t3listen install`. Notifications pause for a moment; run ends in that gap are caught up after the restart. Then `node t3listen status` must show `running: yes` and the project on the `routes:` line. Tell the user in one line that this project's notifications now come here. Save to memory: this bot's kind, its project and computer, the routine name, and the date.

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
Use the text for this bot's kind verbatim, with the project name filled in.

Notifier:

> A T3 Tots listener on one of the user's computers POSTed a T3 Code event to this webhook for the T3 project "<project>". Follow t3-project-bot-setup "On an event" for that project only.

Project T3 Tots:

> A T3 Tots listener on one of the user's computers POSTed a T3 Code event to this webhook for the T3 project "<project>". You are that project's T3 Tots: follow t3-phone-answers "On an event" for that project only, send nothing for other projects, and handle each eventId once. When a run ends, read the thread if it helps and propose the next step as 2 or 3 choices with your recommendation.

## On an event (routine runs)
This section is the notifier's; a project T3 Tots follows its own prompt. Write to the user in the language its instructions name (else memory; Japanese if neither). Keep each message to one or two short lines, name the project and the thread title, and never paste raw JSON, ids or long replies.
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
