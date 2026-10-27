# Setup command recipes

Use the BB CLI in the target project's execution context. Follow its command
guidance and the project's shell conventions. Replace example ids/paths with
the resolved project and temporary JSON files. None of these files contains
credentials.

## Read the project

```bash
bb status --json
bb stageboard config --project proj_example --json
bb stageboard stages profile --project proj_example --json
bb stageboard stages list --project proj_example --json
```

`config.config.source` must be `github`; `githubRepos` lists the entire scope
affected by label preparation. `stages list` returns `profile`, `items`,
`lastSyncedAt`, `error`, `revision` and `nextOffset`. An exit code of zero alone
does not establish a healthy sync: require `error: null` and a successful sync
time. Each row contains the native `item.status` and a separate `stage`.

Follow pages using the returned offset and revision:

```bash
bb stageboard stages list 100 <revision> --project proj_example --cached --json
```

Continue until `nextOffset` is null. If the board changes during pagination,
restart at the first page. The normal `stageboard` skill covers routine reading
and moves in detail.

If an explicitly authorized tracker change is needed:

```bash
bb stageboard config --project proj_example --source github --json
```

The repository is derived from the BB project's GitHub remote/source, not from
a guessed issue URL. For a missing mapping, inspect `bb project show` and the
`bb-cli` project's source guidance. Fix only the intended project's connection
within the user's request; report the exact missing source if it cannot be
resolved. An authentication failure refers to `gh` on the BB server host. Have
the user complete GitHub CLI authentication there when necessary; do not ask
them to paste a token into the conversation.

## Save a profile

Write the input below to a temporary JSON file. Use the `revision` returned by
the latest profile read, and the agreed columns. This is local BB configuration;
the operation creates no repository labels and changes no issues.

```json
{
  "projectId": "proj_example",
  "revision": 0,
  "columns": [
    { "label": "stage:development", "name": "Development" },
    { "label": "stage:review", "name": "Review" },
    { "label": "stage:done", "name": "Done" }
  ]
}
```

```bash
bb plugin rpc call taskboard-stages saveStageProfile --input-file /path/to/profile.json --json
```

The result is `{ "profile": { "projectId", "revision", "columns" } }` with a
new revision. Preserve it for label inspection/preparation. Labels must match
`stage:[a-z0-9][a-z0-9._-]*`, at most 50 characters. Titles are nonempty, at most
80 characters. The profile supports at most 50 columns with unique labels and
case-insensitively unique titles. An empty profile restores the native view;
do not replace an existing workflow with an empty profile during onboarding.

The RPC methods below are callable even when `bb plugin rpc inspect` does not
list their schemas; schema discovery is not the setup readiness check.

## Inspect and explicitly prepare labels

Write the project id and saved profile revision to another temporary file:

```json
{
  "projectId": "proj_example",
  "profileRevision": 1,
  "createMissing": false
}
```

```bash
bb plugin rpc call taskboard-stages stageLabelSetup --input-file /path/to/labels.json --json
```

The result contains `labels: [{ "repository", "label", "exists" }]`. Inspect
all entries, including multiple repositories. For authorized creation, first
recheck `config.githubRepos`, then change only `createMissing` to `true` and
call the same operation with the agreed revision. A stale revision is rejected.
Keep it false when inspection alone was requested.

## Verify

Read the profile and full board again and compare them with the agreement.
Report `Без этапа` / `Требует настройки` counts without automatically assigning
those issues. An existing issue can be used for a stage write only when that
move is separately within the user's authorized work. Keep the optional
factory policy unchanged throughout setup.
