# Study Hub

A small website for our study group: upload lecture slides, readings and CA briefs straight into the shared Obsidian vault ([eliakrl/study-group](https://github.com/eliakrl/study-group)), and see every deadline in one place.

- **Upload:** pick a subject, a type (lecture slides, readings, exam prep, other) and a week, then drop files. Each upload is one commit to the vault, made as the signed-in member. It puts the files in `subjects/<subject>/<type>/`, adds a row to that folder's `overview.md`, and appends to `log.md` (plus `index.md` for new subjects).
- **Deadlines:** each assessment has one or more dated steps (presentation, submission, other). A step can have two possible dates while the slot isn't fixed ("Week 10 or Week 11"); pick the real one later. View by date (timeline) or grouped by subject. Group projects come from `projects/<name>/brief.md`: `due:` is the submission and `presentation:` (one date, or a list of two) the presentation; optionally `weight:`, `subject:`, `time:`. Everything else lives in `shared/deadlines.md`, which the site edits. Steps can be marked done; for projects that sets `status: submitted` / `presented: true` in the brief.
- **Subjects:** one page per module with a progress bar (tasks + deadline steps), a to-do list with owners and due dates (`subjects/<slug>/tasks.md`, a `- [ ]` checklist), a decisions log (`subjects/<slug>/decisions.md`, the same Date | Decision | Why table the projects use), the subject's deadlines, and all uploaded materials, which open in the browser straight from the private repo.
- **Subject details:** each subject's `subjects/<slug>/overview.md` can carry `Lecturer:`, `Email:` and `LMS:` lines (plain text, editable in Obsidian). The subject page shows them with a mail link and an *Open in LMS* button; only an `https://` LMS link and a well-formed email become links.
- **Sign-in:** GitHub OAuth. Only people who can push to the vault repo get in.

Stack: SvelteKit 3 on Cloudflare Workers, deployed from GitHub. No database; the vault repo is the database.

## Deploy (one time)

1. **Cloudflare:** Workers & Pages → Create → *Import a repository* → `Eliakrl/study-hub`. Build command `npm run build`, deploy command `npx wrangler deploy`. After the first deploy, note the URL (e.g. `https://study-hub.<you>.workers.dev`). Every push to `main` redeploys.
2. **GitHub OAuth App:** [github.com/settings/applications/new](https://github.com/settings/applications/new)
   - Homepage URL: the Workers URL
   - Authorization callback URL: `<Workers URL>/auth/callback`
   - Copy the Client ID and generate a client secret.
3. **Secrets:** in the Worker → Settings → Variables and Secrets, add (as *Secret*):
   - `GITHUB_CLIENT_ID`
   - `GITHUB_CLIENT_SECRET`
   - `SESSION_SECRET`: any long random string (`openssl rand -base64 32`)
4. **Members:** everyone needs a GitHub account and must be a collaborator on `eliakrl/study-group` (repo → Settings → Collaborators).

The repo name/owner/branch are in `wrangler.jsonc` under `vars`.

## Local development

Create a second OAuth App with callback `http://localhost:5173/auth/callback`, copy `.dev.vars.example` to `.dev.vars`, fill it in, then:

```bash
npm install
npm run dev
```

## Limits

- Files up to ~70 MB each (Cloudflare caps a request at 100 MB, and the upload is base64). Bigger files would need Cloudflare R2.
- Members sign in with the `repo` scope, because the vault is a private repo. The token is stored encrypted in an HTTP-only cookie and never reaches the browser in plain form.
