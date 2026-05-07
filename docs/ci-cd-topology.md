# CI/CD Topology

`mcp-ssh-tool` uses a split repository model with one operational source of truth.

## Repository Roles

| Repository | Role | Automation |
|------------|------|------------|
| `https://github.com/oaslananka-lab/mcp-ssh-tool` | Canonical source, PR target, CI/CD boundary, security boundary, release authority | All required workflow jobs are guarded by `github.repository == 'oaslananka-lab/mcp-ssh-tool'`. |
| `https://github.com/oaslananka/mcp-ssh-tool` | Personal showcase mirror | No publish authority. It receives `main` and `v*.*.*` tags only through the manual `mirror-personal.yml` workflow. |
| Azure DevOps | Optional backup validation record | Manual-only; not part of npm, MCP Registry, GitHub Release, or container publish authority. |

If repository state conflicts, the org repository wins.

## Workflow Boundary

| Workflow | Purpose |
|----------|---------|
| `meta.yml` | Workflow guard checks, actionlint/zizmor, MCP metadata validation, and ChatGPT app readiness validation. |
| `ci.yml` | Format, lint, typecheck, audit, license, unit coverage, integration tests, build, SBOM, pack validation, and Docker smoke. |
| `security.yml` | CodeQL, dependency review, Scorecard, Gitleaks, Hadolint, Trivy, Zizmor, OSV, and Doppler safety validation. |
| `docker.yml` | Docker image build/smoke on PRs and pushes; GHCR publish only by manual approval. |
| `trusted-publish.yml` | Primary human-triggered npm trusted publishing and MCP Registry release path. Defaults to dry-run. |
| `publish.yml` | Emergency Doppler/NPM token fallback only. Approval-gated and org-only. |
| `mirror-personal.yml` | Manual org-to-personal showcase mirror. Defaults to dry-run. |
| `jules-ci-autofix.yml` | Guarded Jules maintenance, CI-failure, dependency, and trusted issue workflows. |
| `branch-hygiene.yml` | Monthly stale branch report. |

The removed `sync-from-canonical.yml` workflow used the obsolete personal-to-org direction and must not be restored.

## Required GitHub Secrets

| Secret | Required by | Purpose |
|--------|-------------|---------|
| `DOPPLER_TOKEN` | publish and safety workflows | Bootstrap Doppler for workflow-only runtime secrets. |
| `PERSONAL_REPO_PUSH_TOKEN` | `mirror-personal.yml` | Push `main` and `v*.*.*` tags from org to the personal showcase mirror. |
| `JULES_API_KEY` | `jules-ci-autofix.yml` | Invoke Jules for guarded maintenance workflows. |
| `CODECOV_TOKEN` | optional via Doppler | Coverage upload when configured. |
| `NPM_TOKEN` | emergency fallback via Doppler only | Used only by `publish.yml`, never by trusted publishing. |
| `MCP_REGISTRY_TOKEN` | only if current registry auth changes | Not used by the current GitHub-token MCP Registry flow. |
| `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN` | not currently used | Reserved only if Docker Hub support is explicitly enabled later. |

Do not commit `.npmrc` tokens or print secrets in workflow logs.

## Required GitHub Variables

| Variable | Expected value |
|----------|----------------|
| `AUTO_RELEASE_PUBLISH` | `false` |
| `AUTO_RELEASE_TARGET` | `dry-run` |
| `NPM_PACKAGE_NAME` | `mcp-ssh-tool` |
| `MCP_SERVER_NAME` | `io.github.oaslananka/mcp-ssh-tool` |
| `CHATGPT_APP_PUBLISH` | `false` |
| `JULES_TRUSTED_AUTHORS` | comma-separated trusted GitHub logins; defaults to `oaslananka` when unset |

## Environments

| Environment | Use |
|-------------|-----|
| `npm-production` | Kept for the primary npm trusted-publishing workflow because npm trusted publisher configuration can bind to the exact GitHub environment name. Migrate to `release` only after updating npm package settings. |
| `release` | General release review environment for future consolidation and non-npm release jobs. |

## Release Boundary

`trusted-publish.yml` is manual-only and defaults to dry-run. The dry-run job:

1. Confirms the requested tag matches `package.json`.
2. Checks npm and MCP Registry live publication state.
3. Runs `npm run check`.
4. Builds the npm tarball, SBOM, and SHA256 files.
5. Runs `npm publish --dry-run`.
6. Installs pinned `mcp-publisher` with SHA256 verification.
7. Prints the intended MCP Registry payload without authenticating or publishing.

The live job is skipped unless `publish=true` and `approval=APPROVE_RELEASE`. It creates only the org GitHub Release. The personal repository is not a release mirror.

## Showcase Mirror

`mirror-personal.yml` pushes org `main` and exact semver tags matching `v*.*.*` to `https://github.com/oaslananka/mcp-ssh-tool`. It does not mirror PR branches, release branches, issues, or GitHub Releases. `dry_run=true` is the default, and force push requires `force_mirror=true`.

Agents must not trigger publish, release, registry publish, container publish, or mirror workflows unless the user explicitly asks for that operation in the current turn.
