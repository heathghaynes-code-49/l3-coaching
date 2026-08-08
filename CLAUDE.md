# L3 Coaching Website

## What this is
The marketing website for L3 Coaching (l3leadershipcoaching.com), a leadership coaching business owned by Heath Haynes. Part of the GiANT family of tools/brands.

## Stack
Plain static HTML/CSS — no build step, no framework, no package.json. What's in the repo is exactly what gets served.

- `index.html` — homepage
- `scorecard.html` — secondary page
- Image assets live in folders at the repo root (logos, badges, headshots)
- `netlify/functions/diagnostic-submit.js` — one Netlify Function (server-side only, zero dependencies, uses native `fetch`). Called by the homepage's Liberating Leader Diagnostic when someone completes it; emails the submission to connect@l3leadershipcoaching.com via Resend. Requires a `RESEND_API_KEY` environment variable set in Netlify (Production only — deliberately left unset on Deploy Previews so testing doesn't send real emails). Still no package.json or build step needed for the rest of the site.

## Hosting & deployment
- **Host:** Netlify, project name `l3v2`
- **Live domain:** https://l3leadershipcoaching.com (also reachable at https://l3-coaching.netlify.app)
- **Repo:** github.com/heathghaynes-code-49/l3-coaching, production branch `main`
- **Deploy flow:** Netlify is connected via GitHub for continuous deployment. Any push to `main` auto-builds and publishes live, usually within 1-2 minutes. There is no manual deploy step and no Netlify CLI needed for normal edits.
- **Rollback:** Netlify retains prior deploys — instant rollback available in the Netlify dashboard's Deploys tab if a push breaks something.
- Deploy Previews are enabled for pull requests against `main`, so PRs get their own live preview URL before merging.

## Working conventions
- Prefer small, single-purpose commits with clear messages (e.g. "Fix testimonial typo", "Update homepage headline").
- For anything the owner seems unsure about, suggest doing the change on a branch + PR (for a preview link) rather than pushing straight to `main`.
- No CMS — content edits mean editing the HTML directly. Keep existing structure/classes intact unless the owner asks for a redesign.
- Owner (Heath) is not a developer — explain changes in plain language, avoid unnecessary jargon, and always summarize what changed before/after pushing.

## Email/DNS note (unrelated to code, but useful context)
Domain DNS is managed on Netlify DNS (nameservers dns1-4.p05.nsone.net). Email (MX/SPF/DKIM/DMARC) routes through Private Email (privateemail.com), unrelated to the website code in this repo.
