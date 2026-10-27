# Taskboard Stages workflow

Project: {{PROJECT_NAME}} (`{{PROJECT_ID}}`)
GitHub repositories: {{REPOSITORIES}}
Mode: {{MANUAL_OR_SINGLE_AGENT_OR_EXISTING_SERVICE_ROLE}}
Board maintainer: {{MAINTAINER}}
Decision source / coordinator: {{DECISION_SOURCE}}
Handoff route to the maintainer: {{EXISTING_HANDOFF_ROUTE}}

## Stages

| Label | Column | Confirmed event / evidence required to enter |
| --- | --- | --- |
{{STAGE_ROWS}}

## Maintenance

Use the `stageboard` skill and pass `--project {{PROJECT_ID}}` explicitly.
The recorded maintainer updates stages after the confirmed events above.
Other roles read the board and send handoffs through the recorded route.
These are workflow responsibilities; the plugin does not enforce role-based
access permissions.

Keep GitHub Open/Closed independent of the column. Ordinary labels, title,
body and assignees are outside a stage update. Changing native issue state
follows this project's existing closure/reopening rules: {{NATIVE_STATE_RULES}}.

Record the confirmed issue/stage result with the handoff. For stale, conflicting
or uncertain writes, reread the issue and report the actual state before retrying.
Tasks without a stage and conflicting stage labels remain visible for explicit
triage; setup does not bulk-assign them.

This document guides agents at the project's existing handoffs. It does not
create background watchers, new chats or automatic pipeline execution.

## Setup status

Profile revision: {{PROFILE_REVISION}}
Label readiness: {{LABEL_READINESS}}
Last successful GitHub sync: {{LAST_SYNC}}
Issue-write verification: {{WRITE_VERIFICATION_OR_NOT_EXERCISED}}
Remaining setup work: {{REMAINING_WORK_OR_NONE}}
