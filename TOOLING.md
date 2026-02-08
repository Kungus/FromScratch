# FromScratch — Claude Code Tooling Guide
**What this is:** A reference for the Claude Code features we haven't set up yet but should. Read this next time we start a session and we'll get them wired up.

---

## 1. Hooks (Auto-Run Scripts When Claude Edits Files)

**What it does:** Every time Claude edits or creates a file, a shell command runs automatically. No manual step.

**Why we want it:** Auto-format our JavaScript so it stays consistent without thinking about it.

**How to set it up:**
1. Open (or create) `.claude/settings.json` in the FromScratch project root
2. Add the hook config below
3. That's it — every file Claude touches gets formatted

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "npx prettier --write \"$TOOL_FILE_PATH\""
          }
        ]
      }
    ]
  }
}
```

**Prerequisites:** Run `npm init -y && npm install --save-dev prettier` in the project root first.

---

## 2. Subagents (Specialized AI Assistants)

**What it does:** Creates a mini-Claude that only does one specific job. It can't edit files — it just reads code and reports back. Runs on a cheaper/faster model so it doesn't slow us down.

**Why we want it:** Our OCCT code (the CAD kernel) requires manual memory management. Every `new oc.Something()` needs a matching `.delete()` call or we leak WASM memory. A focused agent can audit this better than eyeballing it.

**How to set it up:**
1. In Claude Code, type `/agents`
2. Select "Create new agent" then "Project-level"
3. Give it this description:

```
Name: occt-auditor
Description: Audits OpenCascade.js code for memory leaks and API correctness.

Focus areas:
- Every OCCT object created with `new oc.Something()` must have a matching `.delete()` call
- Check that shapes returned from boolean ops are stored or deleted
- Verify TopExp_Explorer instances are deleted after iteration
- Flag any OCCT object passed to a function that might not clean it up
- Check tessellation code for correct index handling (OCCT uses 1-based indices)

Files to scan: src/core/occtEngine.js, src/core/occtTessellate.js, src/core/occtShapeStore.js, src/main.js (the applyFillet and applyFaceExtrusion functions)

Model: haiku (fast and cheap, this is read-only work)
Tools: Read, Grep, Glob only (no editing)
```

4. Use it anytime with: "Run the occt-auditor agent on the engine code"

---

## 3. Skills (Teach Claude Our Patterns)

**What it does:** A markdown file that Claude reads automatically when relevant. It's like a cheat sheet that Claude always has in its pocket for our specific project patterns.

**Why we want it:** Our codebase has patterns that repeat (tool structure, state management, OCCT API quirks). A skill file means Claude won't forget them or re-learn them each session.

**How to set it up:**
1. Create the folder: `.claude/skills/`
2. Create a file: `.claude/skills/fromscratch-patterns.md`
3. Paste this content:

```markdown
---
name: fromscratch-patterns
description: Core patterns for the FromScratch 3D modeling project
---

## Tool Pattern (every tool follows this)
- Export `activateTool()` / `deactivateTool()`
- Subscribe to pointer events in activate, store unsubscribers
- Unsubscribe all in deactivate
- Communicate with renderers via callbacks set from main.js
- Tool-local state object, never mutate global state directly

## OCCT Object Lifecycle
- Every `new oc.Something()` MUST have a `.delete()` call
- Shapes returned from boolean ops must be stored via `storeShape()` or `.delete()`d
- TopExp_Explorer: always call `.delete()` after iteration (even on early return)
- Constructor overloads: `oc.ClassName_N(...)` where N=1,2,3...
- OCCT triangulation indices are 1-based, JavaScript arrays are 0-based

## State Rules
- State is the single source of truth
- Bodies in state hold `occtShapeRef` (string ID), never the live OCCT object
- Renderers subscribe to state, never modify it
- Use `updateBody()` to change body properties, never mutate directly

## Preview Pattern
- Drag interaction shows THREE.js preview (fast, no OCCT)
- OCCT shape created only on commit (click or Enter)
- Exception: fillet preview runs real OCCT (debounced) because fillet geometry can't be approximated with primitives
```

---

## 4. GitHub MCP (Connect Claude to GitHub)

**What it does:** Lets Claude create pull requests, manage issues, and review code — all from this terminal.

**Why we want it:** When we start using git (we should), Claude can create branches, write PR descriptions, and manage our POC tracking as GitHub issues.

**How to set it up (when ready):**
1. Initialize git: `git init && git add -A && git commit -m "Initial commit"`
2. Create a GitHub repo
3. Run: `claude mcp add github --transport http https://api.githubcopilot.com/mcp/`
4. Then just ask Claude things like "create a PR for the fillet feature" or "open an issue for undo/redo"

**Not urgent.** Set this up when we start caring about version control.

---

## Priority Order

| When | What | Effort | Payoff |
|------|------|--------|--------|
| **Next session** | Prettier hook | 5 min | Every file stays formatted automatically |
| **Next session** | OCCT auditor subagent | 10 min | Catches WASM memory leaks we can't see |
| **Next session** | Patterns skill file | 5 min | Claude remembers our conventions across sessions |
| **When we use git** | GitHub MCP | 15 min | Claude manages PRs and issues for us |

---

## Quick Reference

| Feature | What it is | Where it lives |
|---------|-----------|----------------|
| Hooks | Auto-run scripts on Claude actions | `.claude/settings.json` |
| Subagents | Focused AI assistants (read-only) | Created via `/agents` command |
| Skills | Domain knowledge files | `.claude/skills/*.md` |
| MCP | External service connections | Added via `claude mcp add` |
| Memory | Persistent notes across sessions | `.claude/memory/MEMORY.md` (already using this) |
