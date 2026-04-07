# CONTENT.md

Read this file before editing content.

## General rules

1. For any translated page or item, edit both Turkish and English files unless the instruction explicitly says otherwise.
2. Every translated pair must share the same `translationKey`.
3. Internal folder names stay the same across languages.
4. Public Turkish URLs are localized with `url` or `slug` in front matter.
5. Images that need processing go in `assets/images/...`, not `static/`.
6. Team/contact people are stored in `data/team.yaml`.
7. Do not hardcode header/footer links in page content.
8. AVIF derivatives are stored in `static/avif/...` and should be regenerated after changing source photos.

## Language structure

- Turkish content lives in `content/tr/`
- English content lives in `content/en/`

Examples:

- `content/tr/about/_index.md`
- `content/en/about/_index.md`

These are translation pairs.

## Content types

### 1. Landing pages (`_index.md`)

Used for:

- home
- about
- events
- blog
- get involved
- cause areas
- news

Minimum fields:

- `translationKey`
- `title`
- `description`

Optional fields:

- `url`
- `hero_eyebrow`
- `hero_title`
- `hero_lead`
- `hero_image`
- arrays like `stats`, `values`, `faq`, `action_cards`

### 2. Event items

Path:

- `content/tr/events/<internal-slug>/index.md`
- `content/en/events/<internal-slug>/index.md`

Use the same internal folder name in both languages.

Required fields:

- `translationKey`
- `title`
- `description`
- `start`
- `city`
- `event_mode`
- `source_url`

Recommended fields:

- `slug`
- `url`
- `schedule_text`
- `venue`
- `summary`
- `featured_image`
- `luma_url`
- `calendar_start`
- `calendar_end`
- `cause_area`
- `featured`

### 3. Blog posts

Path:

- `content/tr/blog/<internal-slug>/index.md`
- `content/en/blog/<internal-slug>/index.md`

Required fields:

- `translationKey`
- `title`
- `description`
- `date`
- `source_url`

Recommended fields:

- `slug`
- `url`
- `summary`
- `featured_image`

### 4. Cause area pages

Path:

- `content/tr/cause-areas/<internal-slug>/index.md`
- `content/en/cause-areas/<internal-slug>/index.md`

Required fields:

- `translationKey`
- `title`
- `description`
- `accent`
- `card_excerpt`

Recommended:

- `slug`
- `url`
- `featured_image`

## Team data

`data/team.yaml` stores repeated people data used on About and Get involved.

Edit this file when:

- someone's role changes
- email changes
- LinkedIn changes
- a headshot is added

Do not edit the same person in multiple page files.

## Image rules

### Shared image locations

- Home images: `assets/images/home/...`
- About images: `assets/images/about/...`
- Event images: `assets/images/events/<translationKey>/cover.jpg`
- Blog images: `assets/images/blog/<translationKey>/cover.jpg`
- Cause images: `assets/images/cause-areas/<translationKey>/cover.jpg`
- Team headshots: `assets/images/team/<person-id>.jpg`
- AVIF derivatives: `static/avif/<matching-path>-<width>.avif`

Reference these in front matter without the `assets/images/` prefix.

Example:

```yaml
featured_image: events/ea-intro-session-april-2026/cover.jpg
```

## How to add a new event

1. Copy the closest existing event folder in Turkish.
2. Copy the matching English event folder.
3. Keep the same internal folder name in both languages.
4. Set the same `translationKey` in both files.
5. Localize the public `slug`.
6. Put the image in `assets/images/events/<translationKey>/cover.jpg`.
7. Update `start`, `schedule_text`, `city`, `event_mode`, `source_url`, and any optional `luma_url`.
8. Add `calendar_start` and `calendar_end` only when both are accurate.
8. Run `./scripts/generate-avif.sh`.

## How to add a new blog post

1. Copy the closest existing blog post pair.
2. Keep the same internal folder name across languages.
3. Set the same `translationKey`.
4. Add or update `source_url`.
5. Add the image to `assets/images/blog/<translationKey>/cover.jpg` if needed.
6. Run `./scripts/generate-avif.sh` if you changed images.

## How to change sitewide links

- Contact email, WhatsApp, LinkedIn, Substack, and Luma URLs live in `hugo.toml`.
- Team people live in `data/team.yaml`.
- Header/footer markup lives in `layouts/partials/`.

## Never do these

- Do not add a CMS.
- Do not add a JS framework.
- Do not add build-time external fetches for events, newsletter, or posts.
- Do not duplicate footer/header markup across templates.
