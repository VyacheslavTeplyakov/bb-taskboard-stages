# Changelog

## 0.1.0 — 2026-10-27

First public release of Taskboard Stages, based on Taskboard 0.3.6 at
`2dcad8a23bd06121b5c42faaf7ea0716f24b4915`.

- Configure ordered GitHub Kanban columns separately for each BB project.
- Use `stage:*` labels for columns while keeping issue Open/Closed independent.
- Keep unassigned, unknown and conflicting stage labels visible.
- Read all GitHub issue pages and paginate the board cache consistently.
- Update only stage labels, preserving ordinary labels and issue fields.
- Detect stale stage requests and report partial or uncertain writes.
- Move cards through drag-and-drop, an accessible menu, or `bb stageboard stages`.
- Edit, export and import stage profiles; explicitly prepare missing labels.
- Preserve the full board page and the panel beside chat.
- Adapt the standalone package to BB 0.47.1 and Plugin SDK 0.6.79.

Validation: 345 automated tests, TypeScript, server/app/host builds, isolated BB
checks and a live GitHub integration check. Live checks covered open/closed
independence, native drag-and-drop, ordinary labels, conflicting labels, stale
requests and restart recovery. Automated tests use fixtures and do not require
GitHub credentials.
