# AI Team Members — TL;DR Guide
### A pattern for building specialized AI agents around any project

---

## The Concept

Instead of one AI doing everything, create **focused specialists** that each do one job well. Think of it like a dev team where everyone has a role — except the team members are AI agents that audit, advise, and catch mistakes.

---

## Two Types of Team Members

| Type | Where It Runs | Best For |
|------|--------------|----------|
| **Subagent** | Claude Code (terminal) | Code auditing, pattern checking, static analysis |
| **Desktop Agent** | Claude Desktop (chat) | Visual QA, browser testing, architecture planning, design advice |

**Subagents** are cheap (run on Haiku/Sonnet), read-only, and focused. They can't edit your code — they just report issues.

**Desktop agents** are conversational — you talk through design decisions, and they can see your app in the browser.

---

## How to Create a Subagent (Claude Code)

1. Open Claude Code in your project folder
2. Type `/agents`
3. Select **"Create new agent"** → **"Project-level"**
4. Paste in the agent description (see template below)
5. Agent is immediately available — no restart needed

### Agent Description Template

```
Name: [short-name]
Description: [One line about what this agent does]

Focus areas:
- [Specific thing it checks for]
- [Another specific thing]
- [Be concrete — "check X for Y" not "review code"]

Files to scan: [list the specific files/folders it should look at]

Model: haiku (fast/cheap for simple checks) or sonnet (deeper reasoning)
Tools: Read, Grep, Glob only (no editing)
```

### To Run an Agent

Just ask Claude Code:
> "Run the [agent-name]"

---

## The FromScratch Team (Example)

| Agent | Role | Model | What It Catches |
|-------|------|-------|----------------|
| **occt-auditor** | Memory leak detection | haiku | Missing `.delete()` calls on OCCT objects |
| **architect** | Design principles enforcer | haiku | Layer violations, modules doing too much |
| **module-health** | Complexity tracker | haiku | Files over 300 lines, circular imports |
| **ui-reviewer** | UX principles checker | haiku | Missing Escape handlers, touch target sizes |
| **status-sync** | Documentation accuracy | haiku | Status docs that don't match actual code |
| **geometry-guard** | Geometry validation | sonnet | Operations that could produce invalid meshes |
| **ux-expert** | Interaction design advisor | sonnet | Tool workflows, menu design, CAD UX patterns |

---

## Designing Agents for YOUR Project

### Step 1: Identify What Goes Wrong

Think about the bugs and mistakes that keep happening. Each one is a potential agent.

- Keep making the same type of error? → **Auditor agent**
- Code getting messy over time? → **Health monitor agent**
- Not sure if the UX is right? → **Design advisor agent**
- Docs falling out of date? → **Sync agent**

### Step 2: Write Focused Descriptions

**Good:** "Check that every database query has error handling and a timeout"
**Bad:** "Review the code for quality"

The more specific, the better the agent performs.

### Step 3: Pick the Right Model

- **Haiku** — Pattern matching, checklist validation, simple audits
- **Sonnet** — Design advice, complex reasoning, nuanced recommendations

### Step 4: Keep Them Read-Only

Agents should **report**, not **fix**. This keeps them safe and focused. You (or Claude Code) decide what to act on.

---

## Adapting for Desktop (iPad/Phone/PC)

Subagents only work in Claude Code (terminal). But you can replicate the approach in Claude Desktop by:

1. **Creating a Project** with your codebase attached
2. **Adding skill files** (`.md` files in project knowledge) that contain the agent checklists
3. **Asking Claude Desktop** to "run the architect checklist" or "audit for memory leaks"

It won't be automated like a subagent, but you get the same specialized reviews on any device.

### Project Knowledge Skill Template

```markdown
# [Agent Name] Checklist

## What to Check
- [ ] [Specific check 1]
- [ ] [Specific check 2]
- [ ] [Specific check 3]

## Files to Review
- path/to/file1.js
- path/to/file2.js

## Red Flags
- [Pattern that indicates a problem]
- [Another pattern to watch for]

## How to Report
For each issue found, state:
1. File and line
2. What's wrong
3. How to fix it
```

---

## Quick Start (New Project)

1. Ask yourself: "What are the 3 biggest risks in this project?"
2. Create one agent per risk
3. Run them after every major coding session
4. Add more agents as new risk patterns emerge

That's it. Start small, grow the team as the project grows.
