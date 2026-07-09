# WYEA — Company Site

Marketing site for **Whittle and Ye Engineering Associates LLC** (WYEA):
catered software for Orange County law firms, cutting-edge tech, white-glove
service.

Plain static HTML — a single self-contained `index.html` with the CSS inlined,
so it renders styled from any viewer: a file preview, a double-click, or any
static host. No build step, no dependencies.

## Run locally

```
python3 -m http.server 8080
```

Then open http://localhost:8080.

## Deploy

Any static host works (Railway static site, GitHub Pages, Vercel, Netlify).
Serve the repo root; `index.html` is the whole site — styles included.

## Before going live

Search the site for `PLACEHOLDER` and fill in:

- Anderson Whittle's bio (education, prior employers, notable work)
- Ye's full name and bio
- The contact email (currently a dummy `mailto:` link)

The case study intentionally does not name the client firm — get the firm's
written OK before naming them.
