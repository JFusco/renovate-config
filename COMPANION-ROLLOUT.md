# Companion issues: implementation and approval-gated rollout

Status: inactive implementation. No live rollout is authorized.

Delivery: [central issue 29](https://github.com/JFusco/renovate-config/issues/29)
and [Office issue 133](https://github.com/JFusco/the-office/issues/133).

## Ownership

The central runner owns newly created companion issues. It reuses existing
Office issues without rewriting, assigning, closing or replacing them. Issues
are discovered by authenticated author identity and an exact repository/PR
marker; the PR description is not an authority. One bot-owned PR comment carries
the reciprocal link and pending creation intent. A failed or uncertain create
is not automatically repeated. Conflicting records and human lifecycle changes
require reconciliation; they do not authorize replacement issues.

Brain and CMS Vocabulary are the only Office handoff targets. Office retains
their existing native closing-link, review, merge and board closeout mechanics.
Migrator is independent of Office: its companion issues have no Office marker,
assignment, enrollment or delivery routing. Existing Renovate policies for
ui-design-brain, cms-field-vocabulary and other owned packages are unchanged;
automatic update PRs do not authorize automatic merging.

## Inactive implementation state

- `companion-issues.json` contains no targets.
- The post-step requires `PIN_COURIER_COMPANIONS_ENABLED=true` in the caller.
- No Actions variable, caller pin, workflow/configuration release pin or live
  Office environment has changed.
- Office's `OFFICE_PIN_COURIER_CENTRAL_ISSUES` handoff is off unless explicitly
  set to `true`; even then it only applies to Brain and CMS Vocabulary.
- Existing issues, project boards, merge owners and private admission stay put.

The current checkout pins configuration C and workflow W separately. Before
activation, release the reconciler and supporting policy as a new C, then release
a W that checks out that C. Do not point consumers at a workflow whose pinned
checkout predates these scripts. Existing immutable releases are not rewritten.

## Rollout to present for approval

1. Review and deliver the inactive central and Office changes through their
   respective repository flows. Confirm hosted checks and the exact reviewed
   revisions. No deployment, environment change or reconciliation run yet.
2. Release a canary C/W pairing with only `JFusco/renovate-config` in the target
   policy. Record its actual approved start timestamp as `startedAt` (UTC ISO
   string); do not invent a historical cutoff or backfill old closed PRs. Promote
   the public caller's W pin and enable its companion flag only after approval.
3. On one existing open Pin Courier PR, verify a single issue, reciprocal comment
   and successful repeated reconciliation with no duplicate writes. Confirm an
   actual closure outcome when available; fixture proof is not live proof. Do
   not merge an update just to manufacture this evidence.
4. Before admitting Brain/CMS, deploy the reviewed Office compatibility revision
   through its normal idle-service gate and explicitly enable the handoff.
   Verify legacy issue reuse and that missing companions wait without creating
   a competing issue. Then admit those two central targets, preserving their
   existing issues, holds, native PR links and merge owner.
5. Admit the remaining public targets in the same reviewed policy. Each target
   gets an explicit start timestamp. Current open PRs are eligible; PRs created
   since that timestamp remain eligible even if closed between scans. Central-
   owned tracked issues are reconciled regardless of their PR creation date;
   historical closed Office PRs do not receive backfill comments.
6. Handle private caller W pins separately. Keep their organization allowlist and
   PIN_COURIER_ENABLED admission requirements. Migrator remains Renovate-only;
   no Office project or environment entry is introduced. Private API calls and
   diagnostics run only in the validated private caller, never the public matrix.

The private/Migrator track is independent of the Office milestones in step 4:
after the central canary, its own reviewed pins and admission requirements are
the prerequisites. Office deployment, availability or handoff enablement must
never gate Migrator's package updates.

The post-step runs inside existing single-target concurrency after Renovate,
including a non-cancelled Renovate failure once a token exists. Reconciliation
is eventual on existing scheduled/manual runs, not a PR-event service. It uses
the same scoped token, without new App permissions or a separate scheduler.

## Checks and rollback

Run the repository's pinned 44.190.0 strict validator and `node --test
tests/*.test.mjs`; run Office's focused intake tests, `pnpm test` and `pnpm
build`. Test inactive defaults, author/target spoofing, pagination, issue reuse,
uncertain writes, duplicates, body rewrites, lifecycle transitions, human
overrides, native Office adoption and explicit Migrator exclusion.

Before central activation, rollback is a focused revert of the inactive changes.
After activation, disable companion reconciliation first; retain all issues and
comments. Keep Office's handoff enabled while resolving in-flight central issues
so it cannot race creation. Do not restore Office fallback creation blindly:
reconcile central-issued records and known adoptions before disabling that
compatibility. Restore the preceding caller W pin through normal delivery if
needed. Never delete issues or rewrite their identities as rollback.
