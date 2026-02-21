---
on:
  pull_request:
    types: [opened, synchronize]
permissions:
  contents: read
  issues: read
  pull-requests: read
safe-outputs:
  add-comment:
timeout-minutes: 15
engine: claude
---

# PR Review Agent

Review pull request #${{ github.event.pull_request.number }} in the ClauTunnel repository.

This project follows Kent Beck's TDD and Tidy First principles. Review the changes against these standards:

## Review Checklist

### TDD Compliance
- Are tests present for new or changed behavior?
- Do test names describe behavior clearly (e.g., `shouldSumTwoPositiveNumbers`)?
- Is there a failing test written before the implementation?

### Tidy First Principles
- Are structural changes (renaming, extracting, moving code) separated from behavioral changes (new features, bug fixes)?
- Are structural and behavioral changes NOT mixed in the same commit?

### Code Quality
- Is duplication eliminated?
- Are names clear and intent-revealing?
- Are dependencies explicit?
- Are methods small and focused on a single responsibility?
- Is state and side effects minimized?
- Is the simplest solution used?

### Security
- No secrets, API keys, or credentials in the diff
- No command injection, XSS, or SQL injection vulnerabilities
- No unsafe patterns with user input

### General
- Does the code build without warnings?
- Are imports clean (no unused imports)?

## Output Format

Post a single concise review comment on the PR. Structure it as:
1. **Summary** — One sentence describing what the PR does
2. **Issues** — Bullet list of specific problems found (with file:line references)
3. **Suggestions** — Optional improvements (clearly marked as non-blocking)

If the PR looks good with no issues, post a short approval comment instead. Do not nitpick style issues that don't affect correctness or maintainability.
