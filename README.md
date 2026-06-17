# EA Türkiye website

Lean bilingual Hugo site for EA Türkiye.

## Core architecture

- Hugo only
- No CMS
- No external theme
- Turkish at root, English at `/en/`
- Cloudflare Pages deployment
- Cloudflare Pages Function for the contact form
- Plain CSS + tiny vanilla JS

## Editorial workflow

Firat's normal workflow does not require local Hugo.

1. Open Claude Code in the repo.
2. Ask Claude to read `content/CONTENT.md`.
3. Ask for the change in plain language.
4. Review the diff.
5. Commit and push.
6. Cloudflare Pages rebuilds the site automatically.

## Developer workflow

### Local preview

```bash
hugo server
```

### Production build

```bash
hugo --gc --minify
```

### Optional local form-function testing

```bash
hugo --gc --minify
cp .dev.vars.example .dev.vars
npx wrangler d1 execute CONTACT_DB --local --file db/contact_submissions.sql
npx wrangler pages dev public --d1 CONTACT_DB --compatibility-date 2026-06-17 --env-file .dev.vars
```

For a local database that was created before contact notification columns existed, run the migration once:

```bash
npx wrangler d1 execute CONTACT_DB --local --file migrations/0001_add_contact_notification_status.sql
```

## Cloudflare Pages

Build command:

```bash
hugo --gc --minify
```

Output directory:

```text
public
```

Required environment variables:

- `HUGO_VERSION`
- `CONTACT_NOTIFICATION_TO`
- `CONTACT_NOTIFICATION_FROM`
- `TURNSTILE_SECRET_KEY`

Required secret environment variables:

- `RESEND_API_KEY`

Optional environment variables:

- `CONTACT_NOTIFICATION_REPLY_TO_ENABLED`
- `CONTACT_NOTIFICATION_SUBJECT_PREFIX`

Required Cloudflare Pages bindings:

- D1 database binding: `CONTACT_DB`

The public Turnstile site key is configured in `hugo.toml` under `[params.turnstile]`.

## Repo rules

- Do not reintroduce Doks/Thulite or another theme.
- Do not split config back into multiple files.
- Do not move processable photos into `static/`.
- Do not hardcode `/en/` or Turkish URLs in templates.
- Repeated people data lives in `data/team.yaml`.
- Repeated layout markup lives in `layouts/partials/`.

## Important content paths

- Home: `content/tr/_index.md`, `content/en/_index.md`
- About: `content/*/about/_index.md`
- Events list: `content/*/events/_index.md`
- Event items: `content/*/events/<slug>/index.md`
- Resources list: `content/*/resources/_index.md`
- Resource items: `content/*/resources/<slug>/index.md`
- Get involved: `content/*/get-involved/_index.md`
- Cause pages: `content/*/cause-areas/<slug>/index.md`

## Images

- Photos that need resizing or format conversion go in `assets/images/...`
- Logos/icons that should pass through unchanged go in `static/brand/...`
- Responsive AVIF derivatives live in `static/avif/...` and are committed outputs generated from `assets/images/...`
- Responsive MozJPEG derivatives live in `static/jpg/...` and are committed outputs generated from `assets/images/...`

### Regenerating AVIF derivatives after changing source photos

```bash
./scripts/generate-avif.sh
./scripts/generate-jpeg.sh
```

## Form

The contact form posts to `/api/contact`, implemented as a Cloudflare Pages Function in `functions/api/contact.js`. Submissions are stored in the D1 table defined in `db/contact_submissions.sql`.

D1 is the durable source of truth. After a successful insert, the Pages Function sends a notification copy through Resend to the single fixed recipient configured as `CONTACT_NOTIFICATION_TO`. For v1 this must remain `bilgi@eaturkiye.org`; the submitter's email is never used as a notification recipient and no autoresponder is sent.

Before deploying the notification code to an existing D1 database, apply:

```bash
CLOUDFLARE_ACCOUNT_ID=f5ac692a3aff2bc3c5209ce821de03e4 npx wrangler d1 execute ea-turkiye-contact-submissions --remote --file migrations/0001_add_contact_notification_status.sql
```

Production setup checklist:

1. Disable the old Cloudflare Email Routing subdomain for `forms.eaturkiye.org`, if it still exists.
2. Add `forms.eaturkiye.org` as the sending domain in Resend and verify the DNS records Resend provides.
3. Keep root `eaturkiye.org` MX, SPF, DKIM, and DMARC records intact because Google Workspace uses them.
4. Configure `CONTACT_NOTIFICATION_FROM="EA Turkiye Website <contact-form@forms.eaturkiye.org>"`.
5. Create a Resend API key and store it as `RESEND_API_KEY`.
6. Create a Turnstile widget, put the public site key in `hugo.toml`, and store the secret key as `TURNSTILE_SECRET_KEY`.
7. Confirm production and preview Pages environments still have the `CONTACT_DB` D1 binding.

Verification query:

```bash
CLOUDFLARE_ACCOUNT_ID=f5ac692a3aff2bc3c5209ce821de03e4 npx wrangler d1 execute ea-turkiye-contact-submissions --remote --command="SELECT id, created_at, email, notification_status, notification_error FROM contact_submissions ORDER BY id DESC LIMIT 10;"
```
