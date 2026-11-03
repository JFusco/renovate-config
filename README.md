# renovate-config

Shared [Renovate](https://docs.renovatebot.com/) preset and central runner for
my repositories. Renovate runs as the **Pin Courier** GitHub App and opens one
pull request per package when a managed package publishes a new version. It
never merges.

## What it manages

Only first-party npm packages listed in [`default.json`](default.json):

- `cms-field-vocabulary`
- `@verndale/ui-design-brain`

Every other dependency is disabled. Exact pins move to the new exact version;
Renovate's npm default updates in-range versions in the lockfile only.

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

Triggers:

| Trigger | Purpose |
| --- | --- |
| `repository_dispatch` (`package-released`) | Sent by a publishing repository after a release |
| `schedule` (every 6 hours) | Fallback when a dispatch is missed |
| `workflow_dispatch` | Manual run from the Actions tab |

Accounts run separately because an installation token covers one account.
Add an account to the workflow matrix once the app is installed there.

## Opt a repository in

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
