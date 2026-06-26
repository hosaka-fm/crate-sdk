## Summary

<!-- What does this change and why? Link the issue it closes, e.g. "Closes #123". -->

## Checklist

- [ ] `npm run typecheck` passes (includes `examples/`)
- [ ] `npm run lint` passes (`npm run format` to fix)
- [ ] `npm test` passes (unit + contract + dual-package + drift)
- [ ] `npm run build` and `npm run check:exports` pass
- [ ] Types regenerated (`npm run generate`) if `spec/openapi.json` changed
- [ ] `CRATE_RESOURCES` / `CRATE_ERROR_REGISTRY` updated if the surface changed (with tests)
- [ ] `CHANGELOG.md` updated under `## [Unreleased]`
- [ ] Conventional Commit title (`feat:`, `fix:`, `docs:`, `chore:`, …)

## Notes

<!-- Anything reviewers should know: trade-offs, follow-ups, screenshots. -->
