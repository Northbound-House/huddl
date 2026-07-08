# Huddl — Marketing Site

Public marketing site for [Huddl](https://huddl.cloud), the team workspace that combines Kanban boards with retrospectives. The app itself lives at [go.huddl.cloud](https://go.huddl.cloud) (Firebase).

**Tagline:** Better work starts with a Huddl.

## Stack

Static site — plain HTML, CSS, and vanilla JS. No build step.

- `index.html` — single-page marketing site (hero, features, templates, how it works, use cases, pricing, FAQ)
- `privacy.html` / `terms.html` — legal pages
- `css/style.css` — full design system
- `js/main.js` — mobile nav, scroll-reveal, FAQ accordion

## Design system

| Token | Value |
|---|---|
| Primary teal | `#33C4A3` |
| Accent purple | `#7C5EF5` |
| Background | `#F7F7F9` |
| Ink | `#131419` |
| Border | `#E0E2E8` |
| Headings | Space Grotesk |
| Body | Inter |
| Radius | 12px (cards 20px) |

## Deployment

Deployed via GitHub Pages from `main` branch root, with custom domain `huddl.cloud` (see `CNAME`).

### DNS setup (one-time)

At your DNS provider for `huddl.cloud`, add apex A records pointing to GitHub Pages:

```
A     @    185.199.108.153
A     @    185.199.109.153
A     @    185.199.110.153
A     @    185.199.111.153
```

`go.huddl.cloud` points to Firebase Hosting separately and is not managed by this repo.

## Local preview

```
python3 -m http.server 8000
```
