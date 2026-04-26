---
name: npm-publish-checklist
description: Pre-publish checklist for this package — clean git, version bump, files-whitelist sanity, npm pack dry-run, then prompt before npm publish. User-only.
disable-model-invocation: true
---

# npm-publish-checklist

Run the checks that prevent shipping a broken or oversized npm tarball, then publish on explicit confirmation.

## Process

1. **Clean tree check** — `git status --short`. If there are uncommitted changes that aren't intended for this release, stop and ask.

2. **Version bump** — read current version from `package.json`. Ask which bump (`patch` / `minor` / `major`). Run `npm version <bump> --no-git-tag-version` so tagging happens explicitly in step 6.

3. **`files` whitelist sanity** — read the `files` field in `package.json`. Run `npm pack --dry-run` and show the file list. **Stop and confirm** if any of these appear in the tarball:
   - `.git`, `.github`, `.claude`, `node_modules`
   - `test.js`, `IMPROVEMENTS.md`, `CLAUDE.md`
   - `.env*`, `*.local.*`, anything that smells like a secret
   - Any file >100 KB that isn't a real runtime asset

4. **Tarball size sanity** — flag if `npm pack --dry-run` reports >500 KB. This package has ~5 KB of real code.

5. **README sync check** — grep README for the previous version string. If hardcoded anywhere, prompt to update.

6. **Confirm and publish** — only after the user types confirmation:
   ```
   git add package.json package-lock.json
   git commit -m "v<new-version>"
   git tag v<new-version>
   npm publish
   git push && git push --tags
   ```

## Constraints

- Never run `npm publish` without explicit user confirmation in this session.
- Never use `--no-verify` or skip pre-publish hooks.
- If `npm publish` fails (auth, registry, name conflict), stop — do not retry blindly.
- Note: a `PreToolUse` hook in `.claude/hooks/block-npm-publish.sh` blocks `npm publish` from agentic Bash calls. The user must run the publish step themselves in their own terminal. This skill prepares everything *up to* publish.

## References

- `package.json` — version source of truth
- `IMPROVEMENTS.md` plan item [10] — `files` whitelist is the specific risk this skill mitigates
