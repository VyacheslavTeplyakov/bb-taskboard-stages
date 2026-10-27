---
name: stageboard-setup
description: "Set up or reconfigure Taskboard Stages for a BB project: GitHub connection, stage columns, label readiness and board-maintenance instructions. Use for first-time onboarding or changing a project's workflow. Use stageboard for routine card reads and moves."
---

# Set up a project's board

Turn an existing BB project into a usable GitHub Kanban with a recorded workflow.
The user can ask “Set up Taskboard Stages for this project” or “Настрой Taskboard
Stages для этого проекта”. Read [the command recipes](references/commands.md)
when inspecting or applying configuration. Use [the workflow template](assets/project-workflow.md)
when recording the project's agreement.

## Inspect

Resolve the target BB project from the request and `bb status --json`; use an
explicit project id on every board command. Read the project's applicable
instructions and existing workflow/role documents before proposing changes.

Read the selected tracker, mapped repositories, current stage profile and sync
health through the plugin. These checks run on the BB server; a working `gh`
login on a different agent machine does not prove server access. A missing
connection needs the specific repository/source or server-side authentication
fixed before declaring the board ready. Keep credentials out of chat and files
created by this skill. Preserve an existing non-GitHub tracker until a switch
has been authorized.

Completion: identify the exact project and repository scope, existing columns,
workflow conventions and any concrete connection blocker. No GitHub writes are
needed for inspection.

## Agree on the workflow

Reuse the current profile and recorded decisions. When decisions are missing,
make one concrete proposal covering:

- Ordered columns and their stable `stage:*` labels.
- Who maintains the board: the human, the current agent or an existing service
  role. A separate chat is optional. Use the project's names for its roles.
- The decision source and confirmed handoff/evidence that permits each move,
  including how the maintainer receives those handoffs.
- Whether missing labels may be created in all mapped repositories.

Ask only for unresolved choices. Existing approvals and explicit requests to
use a proposed profile carry through to application; avoid another approval
round after agreement. Suggested column titles are examples, not a mandatory
pipeline. A different role name or a single-agent project needs no new agent
or chat.

Completion: the project scope, columns, responsibilities, handoff rules and
label-creation authority are determined. If the user has requested planning
only, return the proposal here without applying it.

## Apply

Save a changed profile using its actual current revision. Reuse an identical
profile without rewriting it. A revision conflict requires a fresh read and
comparison with the agreed proposal, not a blind retry.

Inspect missing labels separately. When their creation is authorized, recheck
the repository scope and prepare only labels from the agreed saved revision.
If scope or profile changed, reconcile that change before writing. If label
creation is deferred, record the missing labels as incomplete setup.

Record a project-local agreement using the template, normally at
`.bb/taskboard-stages.md`, or update the existing canonical board document.
Fill in actual ids, roles and transition evidence. Add a short pointer from
`.bb/AGENTS.md` so BB agents can find it, preserving existing instructions and
following any project-specific location rules. Update only the board section
on a repeated setup; retain unrelated text, local changes and role contracts.

The setup writes are the agreed profile, any authorized repository labels and
local workflow instructions. Keep existing issues, Open/Closed and ordinary
labels unchanged. Retain factory settings. Creating test issues, bulk-assigning
stages, spawning chats and scheduling automation are separate work.

Completion: the saved profile matches the agreement; label readiness and the
project instruction pointer are recorded without replacing the existing workflow.

## Verify and hand off

Read the profile back, inspect labels and refresh the board. Check synchronization
health and pagination, including tasks with no stage or conflicting labels.
An empty repository is a valid board; an error or old cache is not a successful
fresh read. Verify that the instruction pointer reaches a fully filled agreement.

Report project/repositories, columns, maintainer/handoff route, instruction
path, label readiness, last successful sync and unresolved blockers. State
which writes actually happened. A successful read or label inspection does
not verify issue-write permission; report that separately unless a live write
was already confirmed. A first card move is an optional owner-selected task,
not an automatic onboarding test.

Point the user to Taskboard Stages → their project → Kanban. Normal maintenance
uses the `stageboard` skill. The agreement governs how agents act at existing
handoffs; it does not install a watcher for other chats or create an orchestrator.
