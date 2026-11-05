# renovate-config

Shared [Renovate](https://docs.renovatebot.com/) preset and central runner for
my repositories. Renovate runs as the **Pin Courier** GitHub App and opens one
pull request per package when a managed package publishes a new version. It
never merges.

## What it manages

Only first-party npm packages listed in [`default.json`](default.json):

- `cms-field-vocabulary`
- `ui-design-brain`
- `@verndale/ui-design-brain`, the frozen pre-transfer name, until its last
  consumer moves to `ui-design-brain`

Every other dependency is disabled. Exact pins move to the new exact version;
Renovate's npm default updates in-range versions in the lockfile only.

`prHourlyLimit` is `0` (no limit) because each release dispatches the runner;
Renovate's default of two pull requests per repository per hour would hold a
later release in the same hour until the next scheduled run.

Pull request titles and commits look like
`chore(deps): bump cms-field-vocabulary to v1.3.8`, which passes Conventional
Commits linting with a 50-character subject limit.

## How it runs

[`.github/workflows/renovate.yml`](.github/workflows/renovate.yml) mints a
Pin Courier installation token per account and runs Renovate with
[`runner.json`](runner.json):

- `autodiscover`: every repository the app is installed on is a candidate.
- `requireConfig: required`: only repositories with a `renovate.json` are
  processed, so installing the app alone changes nothing.
- `onboarding: false`: Renovate never opens onboarding pull requests.
- `allowedCommands`: the only commands a repository's `postUpgradeTasks` may
  run, as anchored patterns. Today that is design-passport's catalog sync.

Triggers:

| Trigger | Purpose |
| --- | --- |
| `repository_dispatch` (`package-released`) | Sent by a publishing repository after a release |
| `schedule` (every 6 hours) | Fallback when a dispatch is missed |
| `workflow_dispatch` | Manual run from the Actions tab |

Accounts run separately because an installation token covers one account.
Add an account to the workflow matrix once the app is installed there.

## Opt a repository in

### Full repository maintenance (opt-in)

CMS Vocabulary is the first adopter of [`maintenance.json`](maintenance.json).
Unlike the first-party-only default, this independent preset enables npm and
GitHub Actions dependency updates. It keeps Renovate automerge disabled; the
repository's checks and review policy still govern each update. GitHub Actions
continues to run validation, releases, wiki generation, and vendor-source scans.

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["github>JFusco/renovate-config:maintenance"]
}
```

Adopters should add their own scheduling, grouping, and PR-metadata rules, then
replace their other scheduled dependency updater in the same cutover. Existing
users of the default preset retain the first-party-only policy. Vulnerability
PRs require GitHub vulnerability alerts to be enabled; this preset does not
change repository security settings and never automerges a security update.

Maintenance commits and pull request titles end with `[skip release]`.
semantic-release excludes such commits from its analysis, and the merge commit
alone is not a conventional commit, so a devDependency or GitHub Actions update
never publishes a new package version. Substantive changes release as before.

Validate with the runner's pinned version before changing a preset:

```sh
npx --yes --package renovate@44.190.0 -- renovate-config-validator --strict default.json maintenance.json
```

### First-party package consumers

1. Add the repository to Pin Courier's installation (app settings, then
   **Install App**, then the account's gear icon).
2. Commit `renovate.json` at the repository root:

   ```json
   {
     "$schema": "https://docs.renovatebot.com/renovate-schema.json",
     "extends": ["github>JFusco/renovate-config"]
   }
   ```

Consumers need no secrets.

### Post-upgrade tasks

A consumer that commits files generated from a managed package can regenerate
them inside the update branch, so the pull request arrives complete. Each
command must match `allowedCommands` in [`runner.json`](runner.json), and
`installTools` installs the package manager at the version in `constraints`.
design-passport regenerates its `ui-design-brain` catalog this way:

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["github>JFusco/renovate-config"],
  "constraints": { "pnpm": "10.33.0" },
  "postUpgradeTasks": {
    "commands": ["pnpm install --frozen-lockfile", "pnpm catalog:sync"],
    "executionMode": "branch",
    "fileFilters": ["src/generated/ui-design-brain.catalog.json"],
    "installTools": { "pnpm": {} }
  }
}
```

## Notify on release

A publishing repository that uses semantic-release with `@semantic-release/git`
adds these steps around its publish step, plus the two secrets below:

```yaml
      - name: Record pre-release revision
        id: before
        run: echo "sha=$(git rev-parse HEAD)" >> "$GITHUB_OUTPUT"

      # ... existing semantic-release step ...

      - name: Detect a published release
        id: released
        env:
          BEFORE_SHA: ${{ steps.before.outputs.sha }}
        run: |
          # @semantic-release/git commits the release, so HEAD moves only when a version was published.
          if [ "$(git rev-parse HEAD)" != "$BEFORE_SHA" ]; then echo 'published=true' >> "$GITHUB_OUTPUT"; fi

      - name: Wait for the release on the npm registry
        if: steps.released.outputs.published == 'true'
        timeout-minutes: 12
        continue-on-error: true
        run: |
          # npm accepts the upload minutes before the registry serves it, and the tarball can lag the packument.
          node --input-type=module <<'EOF'
          import { readFile } from 'node:fs/promises';
          const { name, version } = JSON.parse(await readFile('package.json', 'utf8'));
          const url = `https://registry.npmjs.org/${name.replace('/', '%2F')}`;
          for (let attempt = 1; attempt <= 40; attempt++) {
            try {
              const response = await fetch(url);
              const tarball = response.ok && (await response.json()).versions?.[version]?.dist?.tarball;
              if (tarball && (await fetch(tarball, { method: 'HEAD' })).ok) {
                console.log(`${name}@${version} and its tarball are on the registry after ${attempt} check(s).`);
                process.exit(0);
              }
            } catch (error) {
              console.log(`Registry check ${attempt} failed: ${error.message}`);
            }
            await new Promise((resolve) => setTimeout(resolve, 15_000));
          }
          console.log(`::warning::${name}@${version} and its tarball are not on the registry after 10 minutes; dispatching anyway.`);
          EOF

      - name: Mint Pin Courier token
        id: courier
        if: steps.released.outputs.published == 'true'
        uses: actions/create-github-app-token@64ab729a6294000f5aa4a4bc0b73d1f32bc45510 # v3.3.0
        with:
          client-id: ${{ secrets.RENOVATE_APP_CLIENT_ID }}
          private-key: ${{ secrets.RENOVATE_APP_PRIVATE_KEY }}
          owner: JFusco
          repositories: renovate-config
          permission-contents: write

      - name: Notify the Renovate runner
        if: steps.released.outputs.published == 'true'
        env:
          GH_TOKEN: ${{ steps.courier.outputs.token }}
        run: gh api --method POST repos/JFusco/renovate-config/dispatches -f event_type=package-released
```

`POST /repos/{owner}/{repo}/dispatches` needs **Contents: write** on this
repository, so the app must be installed here.

npm accepts an upload a few minutes before the registry serves it, so the
wait step holds the dispatch until the new version and its tarball are
visible. Without it the dispatched run can miss the release and leave the
update to the schedule, or open an update whose tarball does not install yet.

## Pin Courier app

| Setting | Value |
| --- | --- |
| Slug | `pin-courier` |
| Client ID | `Iv23liCFdR4MIQUP6BZg` |
| Webhook | inactive |
| Installable on | any account |
| Logo | [`assets/pin-courier.png`](assets/pin-courier.png) (512 px, transparent; source [`pin-courier.svg`](assets/pin-courier.svg)) |
| Badge background | `#0F766E` |

Repository permissions, per
[Renovate's GitHub App requirements](https://docs.renovatebot.com/modules/platform/github/):
Administration read; Checks, Commit statuses, Contents, Issues, Merge queues,
Pull requests and Workflows read and write; Dependabot alerts read; Metadata
read. Organization permission: Members read.

Secrets, set as repository Actions secrets in this repository and in each
publishing repository:

| Secret | Value |
| --- | --- |
| `RENOVATE_APP_CLIENT_ID` | The client ID above |
| `RENOVATE_APP_PRIVATE_KEY` | Full contents of a Pin Courier private key (`.pem`) |

To rotate the key, generate a new one under the app's **Credentials**, update
every `RENOVATE_APP_PRIVATE_KEY`, then delete the old key.

## Maintenance

- Third-party actions are pinned to commit SHAs because they handle the app's
  key and token; the trailing comment names the release.
- Bump `renovate-version` and the action SHAs deliberately, preferring
  releases at least a week old.
- GitHub disables scheduled workflows in public repositories after 60 days
  without repository activity. Re-enable the workflow from the Actions tab if
  that happens.
