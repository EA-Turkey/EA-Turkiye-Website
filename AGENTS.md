# EA Türkiye Website

Lean bilingual Hugo site for EA Türkiye.

## Core Architecture

- Hugo only
- No CMS
- No external theme
- Turkish at `/`, English at `/en/`
- Plain CSS and minimal vanilla JS
- Cloudflare Pages deployment
- One Cloudflare Pages Function for the contact form

## Repo Rules

- Keep all layout logic in root-owned `layouts/`
- Keep all processable photos in `assets/images/`
- Keep logos and untouched brand assets in `static/brand/`
- Keep repeated people data in `data/team.yaml`
- Keep shared UI copy in `i18n/tr.yaml` and `i18n/en.yaml`
- Keep translation pairs aligned by internal folder name and `translationKey`
- Do not reintroduce Doks/Thulite, Hugo Modules, or Node-based build steps

## Multilingual Caveat

Hugo's `contentDir` language bug is treated as active.

- Detect active language from the URL
- Resolve current-language menus/site data via `site.Sites`
- Do not rely on raw `.Site.Language`, raw `.Site.Menus.main`, or `.Section`

## Editing Workflow

- Sitewide chrome lives in `layouts/partials/`
- Content conventions live in `content/CONTENT.md`
- Operational setup lives in `README.md`
