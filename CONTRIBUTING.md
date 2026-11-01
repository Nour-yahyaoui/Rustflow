# Contributing

1. Read the architecture, threat model, and roadmap before changing a boundary.
2. Use Node 22.13+ and stable Rust. Install native platform prerequisites.
3. Run `npm ci`, `npm run typecheck`, `npm test`, both production builds, and browser tests.
4. For Rust changes run formatting, Clippy, native tests, and build the application on the target OS.
5. Add regression tests for fixes, including tenant isolation and negative authorization cases for API changes.
6. Never log request bodies, credentials, email action tokens, or raw SQL errors. Never commit `.env`, databases, signing keys, or installer outputs.
7. Keep new dependencies justified. Update `package-lock.json`, audit results, status documentation, and migrations together.
8. Schema changes require a new numbered migration, upgrade tests, and a backup/recovery procedure. Do not edit a previously deployed migration.
9. Describe what you actually tested. Do not substitute browser HTTP tests for native engine verification.

Use focused pull requests explaining behavior, test commands/results, security implications, and any remaining prerequisites. UI additions must support keyboard access, visible focus, reduced motion, error/loading states, and both themes. No nonfunctional navigation or decorative feature controls.
