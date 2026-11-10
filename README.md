# Pin Courier maintenance

The [companion-issue rollout plan](COMPANION-ROLLOUT.md) admits only
`JFusco/renovate-config` for the authorized self-canary. All other companion
targets remain inactive. Manual verification uses `canary_only=true` so it
does not launch unrelated scans. Expansion requires separate approval.

Shared Renovate presets and a fixed GitHub App runner for eight repositories.
Renovate proposes routine updates; Dependabot initially produces eligible
alert-driven security repairs. Joe and repository maintainers operate this system.
Branch protection remains deferred. Configuration and passing fixture checks are
not live delivery or vulnerability-closure evidence.

## What it manages

| Repository | Preset and owned surfaces | Merge owner |
| --- | --- | --- |
| JFusco/ui-design-brain | maintenance; root package/lock and Actions | Maintainer |
| JFusco/cms-field-vocabulary | maintenance; owned npm manifests/locks and Actions | Office |
| JFusco/brain | standard; root package/lock and independent web/brain package/lock | Office |
| JFusco/design-passport | standard; npm root/workspace lock and companion package; retain catalog sync | Maintainer |
| JFusco/the-office | standard; application package/lock and Actions, after hosted isolated Quality passes | Maintainer |
| JFusco/renovate-config | standard with only github-actions; engine upgrades remain deliberate | Maintainer |
| verndale/migrator | standard plus pip_requirements for requirements-tooling.txt; owned root/UI manifests, locks and Actions | Maintainer |
| verndale/ai-orchestration | standard for ordinary dependencies and Actions; specialized pair/SDK producers; no lockfile maintenance | Maintainer |

Migrator ignores `templates/**` as well as normal generated/test exclusions.
Direct-URL `xlsx` and the jointly reviewed Optimizely CLI/SDK use `ignoreDeps`;
Contentstack's root types-generator remains covered. Generated application
literals remain with generator maintenance. Template repairs retain the existing
maintenance hash/revision/reason/history procedure and upstream provenance.
Existing generated clients are never automatically upgraded or deployed.

ai-orchestration ignores direct updates to its accessibility/UI compatibility
pair and CMS SDK. Sync Design Contracts and Sync Optimizely CMS SDK retain their
own selection, generation and branches. Its maintainer must compare protected
base/head package/snapshot entries and all reachable lockfile edges, including
dotenv, before merging unrelated dependency PRs. Run contract checks, applicable
SDK checks and verify:ci; hold unexplained changes. Merge shared-lockfile changes
one at a time, then regenerate/rebase and reverify remaining PRs. See that
repository's OPERATING.md for existing-PR recovery. Lockfile maintenance stays
disabled until a focused refresh proves preservation and passes review.

## Presets and precedence

- `default.json` is the unchanged legacy npm-only first-party allowlist.
- `standard.json` independently extends `config:recommended`, enabling npm and
  github-actions with automerge false, dashboard true, ignored install scripts,
  America/New_York, no hourly limit, and ten concurrent PRs/branches.
- `maintenance.json` extends only standard, adding publisher exact pinning and
  `[skip release]` metadata. Consumers extend only standard; publishers extend
  only maintenance. Never combine default and standard.

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["github>JFusco/renovate-config:standard"],
  "lockFileMaintenance": { "enabled": true, "schedule": ["* * * * 1"] }
}
```

Rules apply in this order: ordinary updates use the whole Monday window;
third-party major/minor/patch versions require seven days of age with timestamps
required. Ordinary minor/patch and pin/digest changes group by manager. Actions
and reusable workflows are SHA-pinned. Pins/digests remain scheduled without a
seven-day age claim. Rollbacks/replacements stay separate for explicit review.
Routine third-party majors stay ungrouped and require Dependency Dashboard
approval, with Monday and age requirements retained.

Last, npm `cms-field-vocabulary`, `ui-design-brain` and
`@verndale/ui-design-brain` override schedule to empty, age to null, dashboard
approval to false and group to null, with higher PR priority. Exact pins stay
exact; newer releases reuse existing package PRs. Immediacy means eligibility on
every scan, without schedule, age, dashboard or hourly delay. Shared ten-slot
capacity and GitHub scheduling still constrain delivery; priority reserves no
slots. Lockfile refreshes have their own whole-Monday schedule and do not
establish the age of every transitive resolution.

Only publishers receive release-suppression metadata, including
`[SECURITY] [skip release]`. Their shared complete-message filter excludes marked
commits from release analysis and notes; a marked head cannot hide earlier
substantive commits. Shipped behavior changes require ordinary release review
and an appropriate unmarked commit. Never use `[skip ci]` for maintenance.

## How it runs

The reviewed reusable `renovate-run.yml` accepts exactly one string input,
`target`, and the two explicitly named App secrets. The central coordinator
selects only its six fixed JFusco targets. Each private Verndale caller selects
only itself, must remain private, and is gated by
`vars.PIN_COURIER_ENABLED == 'true'`, initially unset. Execution must be on main.
Release dispatch payloads cannot select repositories, refs, commands or flags.

The reusable workflow checks out `JFusco/renovate-config` at a reviewed literal
configuration commit **C** with persisted credentials disabled. It validates the
caller/target before minting a token, generates one repository profile from
`runner.json`, and passes that file through the pinned action's
`configurationFile` input. Autodiscovery and onboarding are off, consumer
configuration is required, allowed commands default to empty, install scripts
are globally disallowed, and `platformCommit` is enabled. A qualifying canary
commit must remain GitHub-verified.

Jobs run at most thirty minutes. The caller GITHUB_TOKEN has contents read only.
Each installation token names its explicit owner and one short repository name:
contents/issues/pull-requests/workflows/statuses write;
checks/administration/vulnerability-alerts read. The pinned token action calls
alert access `permission-vulnerability-alerts`. Missing grants stop activation;
never inherit every App grant as a workaround. Normal job-end revocation stays
on. The raw App key is passed only to the token action, never Renovate or catalog
commands. [Pinned token inputs](https://raw.githubusercontent.com/actions/create-github-app-token/64ab729a6294000f5aa4a4bc0b73d1f32bc45510/action.yml).

Public admission starts empty. Administrators add fixed public target names to
`PIN_COURIER_PUBLIC_TARGETS`, a JSON array, beginning with
`["JFusco/renovate-config"]` and then adding the next approved canary in order.
Unlisted targets validate but mint no token and perform no scan. The complete
public matrix remains explicit; invalid caller/target combinations still fail
before admission is considered. Private admission uses only its caller's
PIN_COURIER_ENABLED gate.

Central and private callers retain `23 */6 * * *`, workflow_dispatch and
`package-released`. Coordinator concurrency and per-target runner concurrency
use distinct non-cancelling groups. GitHub may coalesce pending notifications.
Central forwarding jobs independently submit notifications to the two fixed
private endpoints, each with a destination-scoped contents-write token. Only
publisher/package/version/revision/release_url strings are forwarded. Public
logs contain submission success/failure only, never private response bodies,
runs, alerts, dependency graphs, caches or artifacts. Public scans and the other
forward attempt are independent of a forwarding failure. Private schedules are
fallback; private processing stays in private repositories.

## Merge ownership

Office is the sole dependency-merge owner for Brain and CMS, including retained
Dependabot PRs. Joe or a maintainer places a Dependabot PR card in Ready; Office
uses its existing board pickup, qualification, review and merge path. Do not add
Dependabot to Pin Courier/wiki-sync automatic adoption. Retain numeric Pin
Courier identity 351979519, verified bot commits, same-repository/main/non-draft
qualification, current-head review/checks, holds, expected-SHA merging, durable
effects, read-back and duplicate-adoption reconciliation. All other repositories
retain maintainer review. No extra approval-count gate or automatic merge path
is introduced.

## App identity and recovery

The existing App is `pin-courier`, client ID `Iv23liCFdR4MIQUP6BZg`.
Repository Actions secrets are `RENOVATE_APP_CLIENT_ID` and
`RENOVATE_APP_PRIVATE_KEY`. Approved holders are JFusco/renovate-config,
JFusco/ui-design-brain, JFusco/cms-field-vocabulary, verndale/migrator and
verndale/ai-orchestration; the latter two are provisioned only after the access
inventory. Do not add an unrestricted organization secret.

Documented App repository permissions are administration, Dependabot alerts and
metadata read; checks, commit statuses, contents, issues, merge queues, pull
requests and workflows read/write. The documented organization permission is
members read. Actual installation grants and selections must be recorded before
provisioning; a runner token requests only the narrowed profile above.

Recovery uses the existing App's Credentials page: generate a new private key,
update every approved RENOVATE_APP_PRIVATE_KEY holder (including both private
callers when provisioned), verify the replacements, then delete/revoke the old
key. Never copy key material into logs, evidence, commits or review packets.

## Trust boundaries

The user selected private callers and accepted shared App-key custody. Approved
repository Actions-secret holders are renovate-config, the two JFusco publishers,
and only verndale/migrator and verndale/ai-orchestration for private execution.
Do not provision an unrestricted organization secret.

Administrators and people able to modify secret-consuming workflows in **any**
holder can cause key extraction. An extracted key can mint tokens across the
App's granted installations, including the JFusco publishers. The known JFusco
set is renovate-config, ui-design-brain, cms-field-vocabulary, design-passport
and brain, plus the-office when enrolled. Actual grants determine access and
include documented contents/workflow writes capable of changing publisher
release workflows. Inventory any additional installed repositories before
rollout. Narrow repository-scoped tokens do not constrain the authority of the
key; deferred branch protection supplies no independent barrier.

Before adding secrets, an authorized administrator records actual installations,
selected repositories, permissions and workflow-capable custodians **without
credentials**. Install the existing App on Office if absent. Narrowly allow the
reviewed reusable-workflow pin and renovatebot/github-action pin in private
Actions policies while retaining GitHub-owned action allowance. Maintain these
allowlists on workflow releases. If provisioning or Actions policy is unavailable,
leave private activation paused; never resume public Verndale processing.

Suspected exposure requires rotation of the existing App key across every
approved holder, followed by revocation of the old key through the existing App
Credentials recovery procedure. [App scope and permissions](https://github.com/actions/create-github-app-token#inputs).

## Post-upgrade tasks

Only Design Passport receives these anchored command patterns:
`^pnpm install --frozen-lockfile --ignore-scripts$` and `^pnpm catalog:sync$`.
Its root ui-design-brain package rule retains pnpm 10.33.0, branch execution,
installTools and the sole output `src/generated/ui-design-brain.catalog.json`.
Review package.json and scripts/sync-catalog.mjs on changes: matching a command
name does not constrain the behavior of a package script or installed code.
Every other generated execution profile has empty allowedCommands.

## Security production

Dependabot is the initial alert-driven producer in all eight repositories.
Renovate vulnerabilityAlerts.enabled and osvVulnerabilityAlerts are false in
every adopted configuration. The disabled vulnerability configuration remains
testable for a later approved transition: no grouping, schedule, age or dashboard
approval; immediate PR creation; automerge false. Fixtures enabling it do not
enable a second live producer.

Record dependency-graph, alert and security-update settings with read-back.
Version-update YAML is not proof of hosted security-update status. Publisher
Dependabot YAML uses weekly npm/Actions entries, zero version-update PRs and
`"chore(deps): [skip release] "` with its trailing space. Verify an actual
generated message before accepting a security-maintenance merge. Hold and
regenerate older unmarked PRs. Preserve enabled detection and security updates
in UI, Migrator and ai-orchestration; enable missing feeds/settings in the other
five during gated rollout. Maintainers own excluded/unsupported repairs.

Refresh alert inventories after detection is enabled; trace repairs through
parents and actual package-manager resolution. Track unsupported fixes with
owner, blocker and review date. Distinguish fixed alerts from awaited rescans;
never dismiss because automation cannot repair. Absence of a UI Renovate repair
PR does not prove a pnpm capability limit: inspect App alert grants, fetch results,
extraction, available fixes and resolution/suppression errors, or retain a gap.

Any later switch from Dependabot requires representative direct/transitive
Renovate repair PRs, successful installs/checks, protected-scope accounting and
post-merge alert read-back. A green scan or configuration probe is insufficient;
no suitable sample means no switch.

## Notify on release

Publishers retain GITHUB_TOKEN/OIDC publication and destination-scoped
contents-write dispatch credentials. Readiness checks wait forty times at
fifteen-second intervals within twelve minutes for both the published version
and its tarball. Results are ready, timeout or error, observable despite
continue-on-error. Timeout/error warns of delayed availability but still attempts
notification; scheduled scans provide fallback.

After successful publication, the job summary records package/version, published
revision, registry result and notification accepted/failed. Token/dispatch failure
is actionable partial delivery; publication is not undone. New optional JSON
metadata is publisher, package, version, revision and release_url, derived from
the published release. Payloads are data, never shell or execution configuration.
Legacy events without client_payload remain valid.

Notification-only replay, with authorized dispatch credentials:

```sh
gh api --method POST repos/JFusco/renovate-config/dispatches -f event_type=package-released
```

This scans public targets and forwards notifications without invoking a publisher.
Private-only retries use:

```sh
gh workflow run renovate.yml -R verndale/migrator --ref main
gh workflow run renovate.yml -R verndale/ai-orchestration --ref main
```

Repeated notifications may coalesce and rescan; they never publish again.
Before retrying interrupted publication, reconcile the release revision, npm
version, Git tag and GitHub Release. If publication completed, replay notification
only; preserve immutable published versions/tags/releases.

## Maintenance and workflow releases

Retain Renovate **44.190.0**, renovatebot/github-action **46.3.10**, and
create-github-app-token **3.3.0** initially. Engine upgrades are deliberate.
Validation is secret-free on PRs and main pushes, requires native RE2, resolves
candidate shared presets rather than old main, uses strict no-global repository
validation, and validates runner/generated profiles separately as globals.

For local checks, install exact renovate@44.190.0 and re2@1.27.0 in a disposable
directory, set RENOVATE_MODULE_PATH to its node_modules/renovate, then run:

```sh
node scripts/validate-renovate.mjs
node --test tests/*.test.mjs
```

Consumer fixtures are declared samples. Update them with actual root consumer
configuration changes and compare their normalized JSON during delivery. They
contain no private inventories and never dispatch production workflows.

Release configuration commit C first. A later workflow commit **W** embeds C's
literal full SHA; tag W with a semantic version, for example v1.0.0. External
callers use W's full SHA and a version comment. Review W/C together and update
Actions allowlists. This avoids self-referential hashes. Shared presets continue
through reviewed default-branch distribution: pinning runner config does not pin
presets. The built-in Actions manager maintains reusable-workflow references.
[Caller context](https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations).

## Rollout and recovery

Inventory current revisions, open PRs, active writers, App grants and settings
before changing admission. Preserve unrelated work and existing remediation.
Hold publisher maintenance until suppression and Dependabot metadata are verified.
Land suppression/sole-owner changes before shared policy and runner releases;
coordinate both existing maintenance adopters. Enable detection, capture backlogs,
and use each repository's existing issue/PR process for compatible repairs.

Activate self Actions maintenance with validation, then UI as first dependency
canary, followed by CMS, Brain, Design Passport, Office, Migrator and
ai-orchestration. Office enrollment requires hosted isolated Quality. Keep
Dependabot security production selected throughout. Observe a real update PR,
GitHub-verified App commits, fresh checks, the intended merge owner and generated
outputs. CMS's first natural Office adoption is a required observation; a binding
is not a delivery receipt. Observe maintenance causing no release and a later
substantive release retaining publication/notification. Record absent live
samples as unverified rather than manufacturing vulnerable dependencies.

For private cutover, merge the caller while PIN_COURIER_ENABLED is unset. Remove
the target from central processing, stop admission, drain active **and queued**
old work, inspect bot branches/PRs, then enable the private caller. Repository
concurrency groups do not coordinate cross-repository writers. The retired
owner-wide configuration must not resume. Alert detection and specialized
writers stay available during the gap. No Office service restart or client/CMS
deployment is implied; later Office deployment follows its idle/health gate.

Rollback stops admission and drains the affected writer first. Restore a known
good private W/C pairing or leave Renovate paused with Dependabot and maintainer
handling; never restore public private-repository scans or owner-wide discovery.
Restore incompatible manifests/locks together and preserve pair bindings and
generated outputs together. Keep detection enabled and record reopened exposure.
Before reverting suppression, hold publisher maintenance through Office (CMS) or
maintainer review (UI); reverify suppression, commit metadata and ordinary release
controls before resuming. Preserve Office as Brain/CMS sole owner and use holds.
Reconcile branches, PR heads and uncertain effects before restarting any producer.
A separately validated security-producer rollback first disables Renovate
vulnerability production before restoring Dependabot production.

Owners investigate thirty minutes after an accepted first-party dispatch without
propagation, fourteen hours without a successful target scan, or two working
days with an unresolved update PR. These are runbook thresholds using existing
Actions notifications, dashboards and issues, not new monitors or guarantees.
Distinguish submission, scan, PR creation, current-head checks, merge, publication
and alert closure. Public commits contain reviewed instructions only; detailed
private alerts, run/job identifiers, Office receipts, credentials and operational
state stay local or in their relevant private repository. Keep
`docs/audits/2026-11-08-pin-courier/` outside every public staged set.
