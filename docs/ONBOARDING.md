# Project onboarding

After installing Taskboard Stages, ask an agent in the target BB project:

> Set up Taskboard Stages for this project.

Or invoke the bundled `stageboard-setup` skill. It is available to BB agents
alongside `stageboard`, which handles routine card reads and moves. New sessions
discover updated skills; an existing session may need an explicit skill
invocation or refreshed session context.

## What the setup agent does

1. Identifies the exact BB project, GitHub repositories, existing stage profile
   and project workflow. Checks access through the plugin on the BB server.
2. Reuses known decisions and proposes only missing choices: columns, maintainer,
   confirmed handoff events and whether missing repository labels may be created.
3. Saves the agreed profile with its current revision and separately checks or
   prepares labels. Existing issues and their Open/Closed state stay unchanged.
4. Records the agreement, normally in `.bb/taskboard-stages.md`, and adds a small
   pointer to project instructions while preserving their existing content.
5. Reads configuration back, refreshes the board and reports actual readiness
   and remaining blockers. An empty repository is valid; an old cache with a
   sync error is not a completed connection check.

An existing setup is reused rather than replaced by example defaults. Missing
authentication is resolved on the BB server host; a different agent machine's
GitHub login is not evidence of server access. The agent does not ask for tokens
in chat. Issue-write permission is reported as unverified until an authorized
live move has confirmed it; setup does not create a test issue automatically.

## Choose the workflow that fits

- **Manual:** the human moves cards; agents read the board as context.
- **Single agent:** the current agent maintains stages after confirmed decisions.
- **Existing roles:** the project's designated maintainer updates stages from
  its existing coordinator/handoff route.

Role names are project-specific. A service chat is optional. The instruction
document defines responsibilities, not a technical access-control system.
It does not create a watcher for other chats or start an autonomous pipeline.

## Ready for normal use

The setup report identifies the project and repositories, saved columns,
maintainer and handoff route, instruction file, repository-label readiness and
last successful synchronization. Any missing authentication, missing labels or
unverified write access is stated separately. Tasks without a stage remain
available for later explicit triage rather than being bulk-assigned.

Open Taskboard Stages → the project → Kanban. Use the `stageboard` skill for
normal updates; use `stageboard-setup` again to repair a connection or change
the project's workflow.

## Manual setup

The existing **Manage → Этапы GitHub-канбана** form remains available. Configure
columns, check labels and explicitly create missing labels there. To integrate
agents with a project pipeline, record who updates the board and which evidence
permits each transition. The bundled setup skill and its workflow template can
help write that agreement without requiring new roles or an orchestrator.
