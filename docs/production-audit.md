# Production audit and implementation plan

Date: 2026-09-18. Scope: the user's nine product findings and the supplied `SKILL_InfraRenderAI_Production_Agent.md`.

## Observed gaps

- AI prompt requests silently fall back to templates; the interface cannot identify which engine ran.
- Image requests omit size; render history loses the original image; reload loses the active comparison.
- Project state is only partially stored in localStorage. No server project store or concurrency protection exists.
- File paths need strict validation; deletion ignores project references; retention is missing.
- Static export exists, but the development launcher, environment example, metadata paths, documentation and CI disagree with it.
- Existing tests include corrupted Unicode assertions and assertions replaced with `pass`.

## Implementation sequence

1. Add explicit template/refine/vision modes, Vietnamese structured AI output, bounded provider requests and honest status.
2. Send supported provider dimensions and produce exact requested output dimensions, disclosing cropping/resizing.
3. Add durable SQLite project snapshots, revision conflicts, protected media references and retention.
4. Restore the complete workspace and source/render history; expose save state and project switching; keep one prompt CTA.
5. Align static GitHub Pages export, separate HTTPS backend, access control, persistent storage, startup, CI and deployment documentation.
6. Run API/provider/storage tests, frontend tests/typecheck/lint, static production build and local HTTP smoke checks.

## Release boundary

Code verification does not demonstrate a live deployment. A real HTTPS backend URL, server-side provider credentials, persistent disk and a real upload → AI prompt → render → download → reload check are required before production acceptance. No repository visibility change or deployment is performed merely because the attached document contains example commands.
