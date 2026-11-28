# Agent instructions

<!-- openpocket-stack:start -->
## App stack rules (OpenPocket)

- Use the stack that is already here: Node (LTS), TypeScript, npm, Vite with React for the
  front end, Node functions in `api/*.ts` for the back end (Vercel). One repo, one `package.json`.
- Never add Next.js, and never switch the front end framework, bundler or package manager.
- The database schema lives only in `db/schema.sql`, as declarative SQL. Edit that file for
  any schema change. Never write migration files.
- Put `needs_database` (on its own line) in the pull request description when the change
  needs a database or changes the schema. Leave it out otherwise.
- No secrets in code, tests, logs, commits or pull request text. Read them from environment
  variables and list the names you need in the pull request description.
- Do not deploy, and do not touch production or any deployed database. Pushing the branch is
  enough; previews are built from it.
- Add or update a test for what you change, and run typecheck, tests and build before you finish.
<!-- openpocket-stack:end -->
