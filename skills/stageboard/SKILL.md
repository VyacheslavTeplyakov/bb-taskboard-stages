---
name: stageboard
description: "Read and update a project's GitHub Kanban stages in Taskboard Stages. Use for stage:* labels, board progress, or Archivarius board maintenance."
---

# Taskboard Stages

The issue state Open/Closed and the Kanban stage are independent. Stage changes modify only `stage:*` labels. Ordinary labels, issue text, assignees and issue state are preserved.

Use the project's agreed profile. Archivarius maintains the board; Project Control coordinates work. Reading the board and moving cards never starts agents or the pipeline.

## Commands

- `bb stageboard stages profile --project <id> --json` reads the stage profile.
- `bb stageboard stages list --project <id> --json` refreshes GitHub and returns a bounded first page with native state, stage, sync health, revision and nextOffset.
- `bb stageboard stages list <nextOffset> <revision> --project <id> --cached --json` continues the same cached snapshot. Continue until nextOffset is null. A changed revision requires restarting from the first page.
- `bb stageboard stages options <owner/repo#number> --project <id> --json` reads the current issue and its stage profile.
- `bb stageboard stages move <owner/repo#number> <stage:label> --project <id> --json` assigns a configured stage. It first reads current stage labels and validates them again before writing.
- `bb stageboard stages prepare --project <id> --json` explicitly creates missing repository labels for the saved profile. Run this only when setting up an agreed project profile; ordinary refresh and profile save do not create labels.

All stage commands take an explicit project or use the current BB project. Issue locators must belong to that project's GitHub repository scope.

For native Open/Closed changes, the separate `bb stageboard move github <locator> --status open|closed --project <id>` operation remains available. Use it only when the existing project workflow calls for changing issue state.

## Results

One configured stage label maps to one column. No stage label means “Без этапа”; unknown or multiple stage labels mean “Требует настройки”. Explicitly assigning a known stage repairs that ambiguity.

A completed agent turn, CI success, review approval or merge does not establish a board stage. Update stages from the project's actual handoff decisions.

After a conflict, partial write or uncertain result, read the issue again and report the actual result. Never report success solely because a request was sent. GitHub label operations are not one transaction; an error can leave multiple stage labels, which remain visible for reconciliation.

## Settings

Open Taskboard Stages → Manage → Этапы GitHub-канбана. Configure each project's ordered columns. Export/import affects the profile only; saving or renaming columns never rewrites issues. An empty profile restores the original Taskboard view.

This candidate has its own plugin data. It does not copy the original Taskboard's credentials or enable its optional autonomous factory.
