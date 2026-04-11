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
npx wrangler pages dev public
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
- `RESEND_API_KEY`
- `CONTACT_TO_EMAIL`
- `CONTACT_FROM_EMAIL`

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

The contact form posts to `/api/contact`, implemented as a Cloudflare Pages Function in `functions/api/contact.js`.
