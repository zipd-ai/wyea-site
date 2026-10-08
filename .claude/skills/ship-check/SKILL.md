---
name: ship-check
description: Run every pre-launch gate and report the evidence
disable-model-invocation: true
---
1. Use the site-qa subagent to run docs/ship-checklist.md.
2. Use the brand-guardian subagent on every file changed on this branch (git diff main --name-only).
3. Use a fresh subagent to review the branch diff against docs/SPEC.md. Report missing requirements and changes outside scope, not style preferences.
4. Report each gate as PASS or FAIL with evidence, every rule break, and every open item in docs/brief/decisions.md.
