# Measure Pressure

A personal blood-pressure tracker. Photograph an Omron monitor, confirm the numbers,
add context, and over time see what moves the readings. Real users: three - Daniel,
his father, and his doctor. Not a product, and not intended to become one.

## Working with Daniel

- **Never commit or push unless he asks in that message.** Do the work, say what
  changed, stop. An earlier "commit and push" does not authorise the next one.
- **Be brief.** He has asked for this more than once. Short sentences, no preamble,
  no restating what he just said.
- **Plain English.** No jargon, no shorthand, no clever compression. He has asked
  for this too. "Run and deploy together?" wasted a round trip; "I'll grant the
  permission, then deploy" would not have. Say the thing you mean, in full.
- **Check before inferring.** Several bugs in this repo's history came from acting
  on a plausible assumption instead of running one command to find out. If a
  database, a log or an API can answer the question, ask it.
- He pushes back well and is usually right. When he is, say so plainly and change
  course - do not defend the original.

## Layout

```
apps/api/          Fastify + Postgres. Auth, readings, tags, scans, reports, sharing
apps/app/          Expo (React Native). The patient, on iOS and the web
apps/doctor/       Vite + React. The clinician, web only
apps/landing/      Vite + React. One page: what the app is, and how to save it to a phone.
                   Its own Hosting site, on purpose - see docs/architecture.md
packages/shared/   Domain rules and API contracts used by all three
db/schema/         Declarative schema - what the database should look like
deploy/            Dockerfile, Cloud Build, deploy script, SETUP.md
docs/architecture.md   Every decision and what it cost
```

Two clients on purpose: the patient photographs a monitor one-handed at 7am, the
clinician reads a table on a desktop. Tables are the one thing React Native Web
cannot do well, which is what decided it.

## Commands

```sh
npm run dev:api          # API on :8080
npm run dev:app          # Expo - press w for web, or scan with Expo Go
npm run dev:doctor       # clinician app on :5174, proxies /api to :8080
npm run landing          # landing page on :5175

npm test                 # parser + statistics + diary bucketing
npm run typecheck

npm run db:plan          # read-only diff against the live database
npm run db:apply         # apply it, after showing the plan and asking

npm run deploy           # everything to staging (same as deploy:staging)
npm run deploy:staging   # API to Cloud Run staging, both sites to preview URLs
npm run deploy:prod      # API to Cloud Run prod, both sites live

npm run deploy:api:prod       # one piece at a time. :staging and :both exist
npm run deploy:app:prod       # for each of api, app and landing
npm run deploy:landing:prod
```

## Things that will bite you

- **The schema is declarative.** Edit `db/schema/*.sql` to describe the end state;
  Atlas works out the diff. Do not write migrations. Deleting a column from the
  file plans a `DROP COLUMN`.
- **"Staging" is a preview, not a sandbox.** The staging API and the Hosting
  preview channels all read the same Neon database as production, and a preview
  channel's `/api` still points at the *production* Cloud Run service. So staging
  answers "does this look right before anyone sees it", not "is this safe to try".
- **One Neon database** behind local, staging and production. `npm run db:apply`
  from a laptop is a production change. `docker compose up db` gives a throwaway
  Postgres for trying something first.
- **The session cookie must be called `__session`.** Firebase Hosting strips every
  other cookie from requests it forwards to Cloud Run. Renaming it breaks the
  clinician app silently - the API just sees an anonymous request.
- **`/healthz` is unreachable** on run.app domains; Google's frontend answers it.
  The health endpoint is `/health` and `/api/health`.
- **React is pinned exactly** across `apps/app` and `apps/doctor`. A caret range
  lets npm nest a second copy, which breaks every hook with "Invalid hook call"
  while blaming your components.
- **Readings taken within 10 minutes share a `session_id`** - one sitting. Reports
  work from each sitting's mean, so a day measured three times does not outvote a
  day measured once. Every individual reading is still kept and shown.
- **Resend sends from `noreply@kupfer.co`**, a verified domain. The sandbox sender
  `onboarding@resend.dev` only delivers to the account owner.

## The capture flow, which is the whole app

```
camera -> upload -> Cloud Vision -> Omron parser -> CONFIRM -> save
                                                       ^
                                       always shown, never skipped
```

`apps/api/src/modules/scans/omron-parser.ts` reconstructs the display from
bounding-box geometry rather than trusting Vision's reading order: Omron stacks
SYS/DIA/PULSE vertically in larger type than the clock.

**Everything geometric depends on knowing which way up the photo was.** A phone
writes its sensor's landscape pixels and puts the rotation in an EXIF tag; Cloud
Vision reads the pixels and ignores the tag. A portrait photo - which is how you
hold a phone over a monitor on a table - therefore arrives with the display on its
side, and "above", "below" and "taller than" are all ninety degrees out. The parser
recovers the rotation from Vision's own word polygons, whose corners come back in
reading order, and turns every box upright before it reads anything. This is the
first thing to check if a capture comes out wrong: `evidence.quarterTurns`.

Vision reads these displays better than you would expect - the digits are usually
right. When a scan is wrong, suspect the parser, not the OCR. Confirm it:

```sh
npm run scan:check -- photo.jpg    # Vision + parse, one photo
npm run scan:check -- --stored     # replay every stored capture, no network
```

Every scan keeps its raw Vision response in `scans.vision_raw`, so `--stored` is a
free regression run over real history. `omron-parser.test.ts` has one fixture taken
from an actual capture; the rest of the tests are synthetic and once passed happily
while the feature failed on every real photograph.

A failed scan falls back to manual entry and looks the same whether Vision
errored, returned nothing, or was never called. Check the logs before assuming
which.

## Deployed

```
https://measure-pressure-app.web.app          patient
https://measure-pressure-app.web.app/doctor   clinician
https://measure-pressure-app.web.app/api/*    rewritten to Cloud Run

https://measurepressure.web.app               landing page, the link to send someone
```

GCP project `measure-pressure-app` (not `lv-notas`, which runs other work).
Database is Neon, deliberately outside GCP so nothing here can affect it.

<!-- openpocket:start -->
## Sessions started by OpenPocket

When the prompt says it comes from OpenPocket, the owner is away from the computer and
will review through a preview link, so these rules replace any local ones
about waiting for them before committing:

- You are already on the task's `feat/` branch. Commit your work there.
  Don't push, open a pull request or merge: the workflow does that.
- Don't run the app or start servers. Do run the repo's checks (typecheck,
  tests, build) before your last commit, and fix what they find.
- Never deploy, never touch production, and never change a deployed
  database.
- You can post to the pull request with `gh` (the workflow allows pull-requests
  and issues write): `gh pr comment <number> --body-file notes.md` to add a
  comment, `gh pr edit <number> --body-file body.md` to change its description.
  Find the number with `gh pr view --json number`. Before the first run ends there
  is no PR yet (OpenPocket opens it), so use `openpocket-pr.md` then. Your final message is
  stored by OpenPocket as the task's "Final answer", so answer questions there too.
- If the brief is unclear or would break a rule in this file, change nothing
  and explain why in the pull request description.

## Preview test login

Every preview build offers a one-tap sign-in as a shared test user, so the
reviewer never types credentials on a throwaway URL. When you touch login,
auth or seed data, keep these rules:

- **Preview only.** Show the credentials (prefilled, or a "Sign in as test
  user" button) only when the app runs as a preview (`APP_ENV=preview` or
  the equivalent) AND the secret `PREVIEW_TEST_PASSWORD` is set. Decide it
  on the server, or in a build flag that production builds cannot set. Never
  derive it from the URL or a query parameter. It must be off in staging and
  production, and a test must prove that.
- **The real login still runs.** The button fills in or submits the normal
  form. Do not add a bypass, a magic token or a second auth path.
- **One fixed user, never one per preview.** Email `preview-test@openpocket.invalid`,
  password from `PREVIEW_TEST_PASSWORD`. Create it in the preview seed, not
  at runtime, and never in production or staging.
- **Never in code.** The password is the repo Actions secret
  `PREVIEW_TEST_PASSWORD`, which OpenPocket manages. The preview deploy passes
  it to the preview service as an environment variable; do not commit it,
  log it, or add it to a non-preview deploy.
- **Marked as a test account.** Give the user an `is_test` flag (or claim)
  and leave it out of analytics, metrics, user counts and exports.
- **Only its own sample data.** The test user sees only seeded fake data in
  the preview database, never real user data, never prod or staging data.
  Where an app holds personal, health or billing data, scope every query by
  the user so the test user cannot see anyone else's rows.

## Screenshots for visual changes

When a task changes something you look at in a browser, the owner reviews it from screenshots first. Rules:

- Required whenever the requested change is visual: screenshots of the specific screens and states the task changed. Run the project's screenshot command for the pages the change touched (all if unsure). Skip them for non-visual tasks (docs, licence, workflows, deploy config, backend only).
- When the change adds a screen or a state, add it to `pages` in `.openpocket/screenshots.json` in the same commit.
- Screenshots are taken only from the app running locally on fake seeded data and the test login, never a real account or real personal or financial data. If you can't, say so and capture nothing.
- The contract is `.openpocket/screenshots.json`: `command` (the repo's Playwright script), `viewports` (phone, desktop), `themes` (light, dark; all four combinations by default), `pages` (`name`, `path`, optional `states`).
- Name images `<page>-<state>-<viewport>-<theme>.png` (no state: `<page>-<viewport>-<theme>.png`). Freeze animations and the clock so captures are stable.
- Never commit the PNGs, not on the task branch and not on main: write them outside the repo (for example `$RUNNER_TEMP/openpocket-screenshots/`). OpenPocket stores them in a bucket with an expiry.
- If the file or the script is missing, capture what you can with plain Playwright using the same names and say so in the final answer.
- CAD projects are different: they commit renders and a GLB, as their brief says.

## Steps only the owner can do

OpenPocket has a stage "Fix on the computer" for failures that no coding
session can fix. When a script or pipeline step fails because it needs owner
or human action (permission denied, a missing IAM role, a secret only the
owner can set, a one-time owner-only setup script), print one line before it
exits, so OpenPocket doesn't offer "Send back to fix" for it:

`::openpocket-manual::{"reason":"...","action":"...","commands":["..."],"verify":"..."}`

- `reason`: why it stopped, one plain sentence ("the deploy account lacks storage.buckets.create").
- `action`: the exact thing to do, who must do it and where.
- `commands`: what to run, in order (empty if it is a console step).
- `prerequisites` (optional): what must be set up first, e.g. `gcloud auth login`
  and `gcloud config set project <id>` for a GCP step.
- `verify`: how to tell it worked.

Text fields (`reason`, `action`, `verify`) and lists (`commands`,
`prerequisites`) each accept either a string or an array of strings; arrays
are shown one item per line.

Never write a vague "run X as owner" in a pull request or a summary. If a task
can't continue without the owner doing something by hand, use this marker (or the
`manual` field of the deploy report) so OpenPocket shows the full request: the
workspace to open, the branch to be on, the prerequisites and a prompt for
Claude Code. Say in `action` on which branch the script lives.

The deploy report works the same way. In the step "Tell OpenPocket how the deploy
went", POST to `$OPENPOCKET_URL/hooks/deploy` with the bearer secret:

```json
{"repo":"owner/name","env":"staging","sha":"<commit>","branch":"<branch>","outcome":"needs_manual",
 "runUrl":"<run page>","manual":{"reason":"...","action":"...","commands":["..."],"verify":"..."}}
```

- `outcome` is `deployed`, `failed` or `needs_manual` (an owner step; send `manual` with it).
- `env` is `staging` or `prod`; for a PR preview send `preview` and the `branch`.
- `plan`, `planHash`, `manual` and `log` may be left out or null. Too-long text is cut.
- A rejected report answers 400 with the bad fields named.

A coding session that finishes with something only the owner can do (add a secret,
run a one-time script) lists it in its final answer, one per line, so the task
shows under "Do it" until the owner taps Done:

`OpenPocket-Manual: <one short step, commands in backticks>`
`OpenPocket-Secret: <NAME of a repo secret that is missing>`

Only list steps the merge and deploy need. Do not ask for a step merging does not need (trying it on a
device, a job for a server that is not live yet): put it in the pull request description instead.

Every step you list blocks the task until the owner taps Done.

Plain text after the marker works too and becomes the reason. Use it only
for steps a person must do by hand, never for ordinary errors or test
failures. The deploy pipeline sends the log with its report to OpenPocket.

### Drafts from sketches

A `drafts/<id>-<slug>/` folder holds a sketch the owner kept (source, renders, `SKETCH.md`). It lives on a
`drafts/*` branch that deploys nowhere. When a task starts from one:

- Read `SKETCH.md` first: what was asked, which version, assumptions (such as constants copied into a CAD script).
- Integrate the draft into the real code, wire it into shared files and add tests. Don't ship the draft as it is.
- Delete the `drafts/<id>-<slug>/` folder in your commits, so it never reaches the default branch.
- Never create `drafts/*` branches or folders yourself; OpenPocket does.

## Telling OpenPocket about previews and deploys

OpenPocket learns a preview is ready, and that a production deploy finished, only
from steps in the app's own workflows. Both use the repo secrets `OPENPOCKET_URL`
and `OPENPOCKET_HOOK_SECRET`. Use a plain inline `curl` step, as below. Do not
use `uses: <repo>/.github/actions/report`: GitHub shares a private repo's actions only
with other private repos, so it fails at setup in public repos and in anyone else's.
The step skips when the secrets are unset and never fails the job:

```yaml
# after the preview deploy
- name: Report preview to OpenPocket
  env:
    OPENPOCKET_URL: ${{ secrets.OPENPOCKET_URL }}
    OPENPOCKET_HOOK_SECRET: ${{ secrets.OPENPOCKET_HOOK_SECRET }}
    BRANCH: ${{ github.head_ref || github.ref_name }}
  run: |
    [ -n "$OPENPOCKET_URL" ] && [ -n "$OPENPOCKET_HOOK_SECRET" ] || { echo "OpenPocket secrets not set; skipping."; exit 0; }
    jq -n --arg repo "${{ github.repository }}" --arg branch "$BRANCH" --arg url "<preview url>" '{repo:$repo,branch:$branch,url:$url}' |
      curl -sS -X POST "$OPENPOCKET_URL/hooks/preview" -H "Authorization: Bearer $OPENPOCKET_HOOK_SECRET" \
        -H "Content-Type: application/json" --data-binary @- || true
# after the production deploy, on success and on failure
- name: Report deploy to OpenPocket
  if: always()
  env:
    OPENPOCKET_URL: ${{ secrets.OPENPOCKET_URL }}
    OPENPOCKET_HOOK_SECRET: ${{ secrets.OPENPOCKET_HOOK_SECRET }}
    OUTCOME: ${{ job.status == 'success' && 'deployed' || 'failed' }}
  run: |
    [ -n "$OPENPOCKET_URL" ] && [ -n "$OPENPOCKET_HOOK_SECRET" ] || { echo "OpenPocket secrets not set; skipping."; exit 0; }
    jq -n --arg repo "${{ github.repository }}" --arg sha "${{ github.sha }}" --arg outcome "$OUTCOME" \
      --arg run "${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}" \
      '{repo:$repo,env:"prod",sha:$sha,outcome:$outcome,runUrl:$run}' |
      curl -sS -X POST "$OPENPOCKET_URL/hooks/deploy" -H "Authorization: Bearer $OPENPOCKET_HOOK_SECRET" \
        -H "Content-Type: application/json" --data-binary @- || true
```

The calls themselves, header `Authorization: Bearer $OPENPOCKET_HOOK_SECRET`, JSON body:

```sh
# preview ready (branch = the PR's head branch)
curl -sS -X POST "$OPENPOCKET_URL/hooks/preview" -H "Authorization: Bearer $OPENPOCKET_HOOK_SECRET" \
  -H "Content-Type: application/json" -d '{"repo":"owner/name","branch":"feat/x","url":"https://..."}'
# production deploy result: outcome is deployed or failed, sha the deployed commit
curl -sS -X POST "$OPENPOCKET_URL/hooks/deploy" -H "Authorization: Bearer $OPENPOCKET_HOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"repo":"owner/name","env":"prod","sha":"<sha>","outcome":"deployed","runUrl":"<run page>"}'
```

A workflow that deploys to production without the deploy report leaves its
tasks stuck on "Going live". Add the step when you touch that workflow.
<!-- openpocket:end -->

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
