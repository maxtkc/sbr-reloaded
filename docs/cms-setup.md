# CMS and event submissions setup

The CMS is [Sveltia CMS](https://sveltiacms.app) at `/admin` (`public/admin/`). It commits straight to `main` through
the GitHub API, so every save triggers the Pages deploy. GitHub login goes through a small OAuth proxy
([sveltia-cms-auth](https://github.com/sveltia/sveltia-cms-auth)) on a free Cloudflare Worker.

Non-editors submit events with the "Submit an event" issue form. Adding the `approved` label runs
`.github/workflows/event-issue.yml`, which writes `src/content/events/<slug>.md`, checks the build, and opens a PR.

## 1. Deploy the OAuth Worker

Needs a free Cloudflare account (https://dash.cloudflare.com/sign-up) and Node 22.

```sh
cd ~/Documents
git clone https://github.com/sveltia/sveltia-cms-auth
cd sveltia-cms-auth
npx wrangler login          # opens a browser, click "Allow"
npx wrangler deploy
```

- If wrangler asks to register a `workers.dev` subdomain, pick any name (e.g. `maxtkc`).
- The last lines print the Worker URL, e.g. `https://sveltia-cms-auth.maxtkc.workers.dev`. Copy it.
- Opening the bare URL in a browser shows a blank page (empty 404). That is expected; it only answers `/auth` and
  `/callback`.

## 2. Create the GitHub OAuth App

1. Open https://github.com/settings/applications/new (personal account settings, Developer settings, OAuth Apps).
2. Fill in:
   - Application name: `SBR CMS`
   - Homepage URL: `https://sjcsbr.com/`
   - Authorization callback URL: `<Worker URL>/callback`, e.g. `https://sveltia-cms-auth.maxtkc.workers.dev/callback`
   - Leave "Enable Device Flow" unticked.
3. Click "Register application".
4. Copy the Client ID.
5. Click "Generate a new client secret", copy the secret now (it is shown once).

## 3. Give the Worker the credentials

From the `sveltia-cms-auth` directory:

```sh
npx wrangler secret put GITHUB_CLIENT_ID       # paste the Client ID
npx wrangler secret put GITHUB_CLIENT_SECRET   # paste the client secret
npx wrangler secret put ALLOWED_DOMAINS        # type: sjcsbr.com,maxtkc.github.io
```

Each command updates the live Worker; no redeploy needed. To add another domain later, rerun the last command
with a comma-separated list, e.g. `sjcsbr.com,maxtkc.github.io`.

## 4. Point the CMS at the Worker

In `public/admin/config.yml`, replace the placeholder:

```yaml
backend:
  base_url: https://sveltia-cms-auth.maxtkc.workers.dev   # your Worker URL, no trailing slash
```

Commit and push to `main`, then wait for the "Deploy to GitHub Pages" action to finish (Actions tab, about 1 min).

## 5. Log in

1. Open https://sjcsbr.com/admin/
2. Click "Sign In with GitHub", then "Authorize" in the popup.
3. The sidebar lists Events, Committee, Page text, Quick links, Gallery, Instagram posts, Gag text.

Test: open an event, change one word, click Save. A commit `cms: update events "..."` appears on `main` and the
site redeploys.

Local alternative (no Worker needed): run `npm run dev`, open http://localhost:4321/admin/ in Chrome or
Edge, click "Work with Local Repository" and pick this repo folder. Edits are written to disk; commit them yourself.

## 6. Repo settings for event submissions

On https://github.com/maxtkc/sbr-reloaded:

1. Settings, Actions, General, "Workflow permissions": select "Read and write permissions" and tick
   "Allow GitHub Actions to create and approve pull requests". Save.
2. Issues, Labels, "New label": create `event` (the form adds it) and `approved` (maintainers add it).
3. Settings, General, Features: make sure "Issues" is ticked.

Test:

1. Issues, New issue, "Submit an event". Fill in a test event, submit.
2. Add the `approved` label.
3. Actions tab: "Event from issue" runs (about 2 min). A PR "Event: ..." appears with `Closes #<n>`.
4. Merge it to publish the event, or close it and delete the branch to discard.

If the form values are invalid, the workflow comments on the issue. Edit the issue, then remove and re-add `approved`.

PRs opened by the workflow do not trigger other workflows (GitHub rule for `GITHUB_TOKEN`); the workflow runs
`npm run build` itself before opening the PR.

## 7. Add editors

Settings, Collaborators, "Add people", enter their GitHub username (personal-account repos give collaborators write
access, no role to pick). They accept the email invite, then log in at `/admin` as in step 5. Only people with Write access can log in to the CMS or add the `approved` label.

## 8. Committee members in games

"Appears in games" also needs face crops at `src/assets/faces/<slug>.png` and `<slug>.cutout.png`. The CMS cannot
make them; run `scripts/faces/faces.py` after adding the photo and commit the output. Members without crops are
skipped.
