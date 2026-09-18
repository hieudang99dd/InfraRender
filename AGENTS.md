# InfraRenderAI Agent Instructions

## Read first
- README.md
- docs/architecture.md
- docs/api-contract.md
- docs/development.md
- docs/deployment.md

## Security
- Never expose provider API keys in frontend code.
- Never commit real .env files.
- Provider secrets belong to backend runtime environment variables.

## Change protocol
1. Inspect current implementation.
2. Trace the full affected data flow.
3. Identify tests before editing.
4. Make the smallest coherent change.
5. Run targeted tests.
6. Run relevant build/test suite.
7. Inspect git diff.
8. Report changed files and verification evidence.

## Contract rule
Do not change frontend/backend API fields silently. Update code, tests and docs together.
