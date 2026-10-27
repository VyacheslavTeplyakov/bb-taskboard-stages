# Contributing

Use Node.js 22.19 or newer and the BB CLI. CI uses Node.js 26 and BB 0.47.1.
The declared Plugin SDK version is pinned to 0.6.79.

```bash
npm ci
npm run check
```

`check` validates the SDK declarations, runs TypeScript and the test suite,
builds the server, frontend and host bundles, and verifies build metadata.
Tests use local fixtures and fake transports; they never require real GitHub
credentials or real issues. A live GitHub test requires a separately selected
test repository and dedicated test issues.

For an isolated BB installation, install this directory and run `bb plugin dev .`
to watch changes. Plugin code executes in BB, so use a test instance for runtime
experiments. Keep generated bundles, node_modules, credentials, local databases
and machine-specific verification logs out of commits.

The core invariant is that a stage update changes only `stage:*` labels.
Open/Closed, ordinary labels, title, body and assignees stay independent. Use the
shared server operation for both CLI and UI changes. Cover observable behavior
at the adapter, RPC or UI boundary when changing this invariant.

The upstream repository is a multi-plugin workspace. This fork keeps Taskboard
at the repository root on its `taskboard-stages` development branch. Its Git
history retains the original repository and an extraction commit before the
stage implementation. `UPSTREAM.json` records the source commit and file hashes;
`UPSTREAM-README.md` and `UPSTREAM-package-lock.json` preserve original material.

To track upstream, add it as a remote and fetch it:

```bash
git remote add upstream https://github.com/MateoCerquetella/bb-plugins.git
git fetch upstream
```

Review changes to upstream's `plugins/taskboard/` and port the relevant changes
into this standalone package. Refresh provenance and repeat validation when
changing the upstream base. The upstream `main` branch has a different layout
and is not the installable development branch of this fork.

Release tags are immutable. Publish fixes under a new version and tag; preserve
the existing `taskboard-stages` plugin id and `stageboard` CLI identity so updates
keep the same plugin data.
