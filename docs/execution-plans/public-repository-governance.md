# Public repository governance

Status: GitHub settings applied and verified; accompanying documentation is local and uncommitted.

## Scope and starting state

On 2026-09-16, configure the public repository for community contributions
after publication. The repository has one listed collaborator, the solo
maintainer (administrator). There were no repository rulesets. CI already ran tests, build,
lint, and a secret scan in the `build` job on pushes to `main` and PRs, without
deployment credentials. Recent `main` runs passed; open Dependabot PRs were
inspected without merging anything during configuration.

The initial repository already contained an MIT license, contribution guide,
code of conduct, issue and PR templates, a security policy, and Dependabot
configuration. Secret scanning, push protection, Dependabot alerts, and security
updates were enabled. Private vulnerability reporting was disabled despite
`SECURITY.md` directing reporters to that channel; enabling it fixes that mismatch.

## Phases and decisions

1. Inspect live settings, collaborators, workflow triggers and actual check names.
2. Apply independent rulesets for non-bypassable checks and the review exception.
3. Configure merge behavior, fork workflow approval, private reporting and CodeQL.
4. Read settings back, inspect affected PRs, and update contributor/user guidance.

### Default branch protection

The active PR and CI ruleset (see the repository settings page, rules section)
targets `~DEFAULT_BRANCH` so protection follows a default-branch rename:

- Pull requests, resolved review conversations, and linear history are required.
- Only squash merges are allowed.
- The `build` status must come from GitHub Actions.
- The branch must be current with its base before merging (strict checks).
- Deletion and force pushes are blocked.
- No bypass actors, including administrators or bots, are configured.

The separate active maintainer review ruleset (same settings location)
requires one approving review, dismisses stale approvals, and requires approval
of the latest reviewable push by someone other than its pusher. Reviews count
when submitted by someone with write permission; code-owner review is not
required because the repository has no CODEOWNERS file.

Repository administrators (role ID `5`) may bypass **only this second ruleset**,
and only through a PR. This supports a solo maintainer, who cannot approve
their own PR, while preserving the CI gate. GitHub cannot scope this role bypass
to the administrator's own PRs: review external contributions normally and
document any exceptional use. Once a second maintainer can reliably review,
remove the review bypass. Do not add it to the CI ruleset.

### Releases and repository merge settings

The active release tag ruleset (same settings location)
blocks updates, deletion, and force pushes to `refs/tags/v*`, with no bypass.
Tag creation remains available to users with write permission. This preserves
published version references without imposing a release process not yet used.

Squash is the only merge method; the default commit message uses the PR title
and body. Automatic deletion of merged repository branches and the update-branch
button are enabled. Auto-merge is available as a per-PR choice; no PR was queued
or merged during configuration.

### Actions and security

- All external contributors need approval before fork PR workflows execute,
  including contributors whose earlier changes have already been merged.
- Review the actual code, package scripts, and workflow diff before granting
  execution. An execution approval is not a code-review approval.
- The existing default token permissions remain read-only; workflows cannot
  approve PRs through the repository's Actions approval setting.
- The existing workflow uses GitHub-hosted runners and `pull_request`, without
  `pull_request_target` or deployment secrets. Keep untrusted fork code away
  from privileged workflows and deployments.
- The existing Actions allowlist setting remains `all`; action references remain
  version tags. This configuration does not claim SHA-pinned dependencies or
  prevent an approved workflow from requesting additional token permissions.
- Private vulnerability reporting is enabled. The existing security policy is
  now backed by an available private reporting channel.
- Existing Dependabot alerts/security updates and secret scanning/push protection
  remain enabled.
- CodeQL default setup is enabled for GitHub Actions and JavaScript/TypeScript
  with the default query suite, standard hosted runners, and a weekly schedule
  alongside its push/PR analysis. It is not a required merge check during initial
  rollout; only the already verified `build` job is required.

Existing app/bot access, organization membership and Cloudflare deployment
settings were not changed. No GitHub environments were configured at inspection.
This is repository governance, not an audit of historical secrets or third-party
deployment permissions.

## Maintenance and recovery

Read settings through the repository ruleset API (`.../rulesets`) and the
branch rules endpoint (`.../rules/branches/main`). Before renaming the `build`
job, update the required check in the CI ruleset, otherwise merges will wait for
a check that never arrives. Adding a new required check should follow a verified
successful run, including its behavior on external PRs.

Administrators can edit rulesets for recovery, but there is no standing bypass
for failed CI or direct pushes. Prefer fixing the failing check in a PR. Any
emergency settings change should be documented and promptly restored.

Follow GitHub's [ruleset reference](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets),
[fork workflow approval guidance](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/approve-runs-from-forks),
and [CodeQL default setup guidance](https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/configure-code-scanning/configure-code-scanning).

## Current Verification Evidence

- Live API reads confirm all three rulesets are active and `main` is protected.
- Effective `main` rules include both branch rulesets and the Actions-bound
  `build` check with strict base synchronization.
- Private vulnerability reporting reads `enabled: true`; fork workflow approval
  reads `all_external_contributors`.
- An open Dependabot PR reports `REVIEW_REQUIRED` and retains its pre-existing failed
  `build` result. No PRs were merged or updated to test enforcement.
- The CodeQL setup run completed successfully for both languages (see the
  repository Actions page). The default setup API confirms `configured` with a
  weekly schedule.
- Initial CodeQL analysis produced two open findings (see the repository
  code-scanning page): one medium, missing explicit workflow permissions in
  `.github/workflows/ci.yml`; and one high, biased cryptographic random numbers
  in `convex/analyst/telegram.ts`.
  These are scanner findings, not validated vulnerabilities. Code remediation
  was outside this settings change; the repository's default token permissions
  were separately verified as read-only.
- Documentation checks: 11 tests passed across `convex/knowledge-base.test.ts`,
  `src/lib/docs/manifest-core.test.ts`, and `src/lib/docs/search.test.ts`.
  `CLOUDFLARE_ENV=staging npm run build` and `git diff --check` passed.
- Initial settings and submitted rule payloads were kept as a temporary local
  rollback reference during configuration (not committed).
