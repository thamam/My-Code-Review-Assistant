# Hotfix Protocol

**Version:** v1.0.0  
**Effective Date:** 2026-01-11

---

## Purpose

This document defines the Rules of Engagement for code intervention during QA and production incidents. Not every issue warrants immediate action—this protocol helps determine when to hotfix vs. when to log for future releases.

---

## Severity Classification

| Level | Name | Description | Examples |
|-------|------|-------------|----------|
| **P0** | CRITICAL | System unusable, data at risk | Infinite loop, localStorage corruption, security vulnerability |
| **P1** | MAJOR | Core functionality broken | Agent generates invalid plans, executor misroutes |
| **P2** | MODERATE | Feature degraded | Tool execution fails, session doesn't restore properly |
| **P3** | MINOR | Cosmetic or performance | UI misalignment, slow response, console warnings |

---

## Response Matrix

| Severity | Response | Timeline | Branch Strategy |
|----------|----------|----------|-----------------|
| **P0** | 🚨 IMMEDIATE HOTFIX | < 1 hour | `hotfix/p0-[description]` → `main` |
| **P1** | Log for next release | v1.1.0 | `feature/fix-[description]` → `dev` |
| **P2** | Log for next release | v1.1.0 | `feature/fix-[description]` → `dev` |
| **P3** | Backlog | v1.2.0+ | Track in `QA_LOG.md` |

---

## P0 Hotfix Procedure

When a P0 issue is identified:

### 1. Stabilize
```bash
# Create hotfix branch from main
git checkout main
git pull origin main
git checkout -b hotfix/p0-[brief-description]
```

### 2. Fix
- Make the minimal change required to resolve the issue
- Do NOT bundle unrelated changes
- Add inline comment: `// HOTFIX: P0-XXX - [description]`

### 3. Verify
- Run `npm run build` — ensure no compilation errors
- Manual test the specific failure scenario
- Confirm the issue is resolved

### 4. Deploy
```bash
# Commit with hotfix marker
git add .
git commit -m "hotfix: P0-XXX - [brief description]"

# Tag the hotfix
git tag v1.0.X-hotfix

# Merge to main (production)
git checkout main
git merge hotfix/p0-[description]
git push origin main
git push origin v1.0.X-hotfix

# Backport to dev
git checkout dev
git merge hotfix/p0-[description]
git push origin dev
```

### 5. Document
- Update `QA_LOG.md` with resolution
- Add entry to `CHANGELOG.md` (if exists)

---

## P1-P3 Logging Procedure

For non-critical issues:

1. **Capture Evidence**
   - Run `tools/debug-snippet.js` in browser console
   - Copy the Black Box Dump
   - Note console errors

2. **Log in QA_LOG.md**
   - Use the Standard Bug Report template
   - Assign severity (P1/P2/P3)
   - Identify suspected component

3. **No Code Changes**
   - Do NOT modify production code
   - Issues will be addressed in scheduled releases

---

## Decision Tree

```
Issue Detected
     │
     ▼
Is the system usable?
     │
     ├── NO ──────────────► P0: IMMEDIATE HOTFIX
     │
     ▼
Is core functionality broken?
     │
     ├── YES ─────────────► P1: Log for v1.1.0
     │
     ▼
Is a feature degraded?
     │
     ├── YES ─────────────► P2: Log for v1.1.0
     │
     ▼
Is it cosmetic/performance?
     │
     └── YES ─────────────► P3: Backlog
```

---

## Hotfix Version Numbering

```
v1.0.0        ← Initial release
v1.0.1        ← First hotfix
v1.0.2        ← Second hotfix
v1.1.0        ← Scheduled feature release
```

---

## Emergency Contacts

| Role | Name | Escalation Path |
|------|------|-----------------|
| QA Lead | [TBD] | Slack / Discord |
| Dev Lead | [TBD] | Slack / Discord |

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-01-11 | Initial protocol created | Theia |
