# Ship checklist

Every gate must pass, with evidence, before the pull request is merged. The site-qa subagent runs gates 1 to 8; brand-guardian runs gate 9; the rest are run as noted. Start the dev server first for the gates that need it: `npm run dev` (http://localhost:8080).

| # | Gate | Checked by | Command | Passes when |
|---|---|---|---|---|
| 1 | Build | site-qa | `npm run build` | Exits 0 and prints "all checks passed" |
| 2 | No em or en dashes | site-qa | Part of `npm run build`; also `grep -rnP "[\x{2013}\x{2014}]" --include='*.html' --include='*.css' --include='*.js' --include='*.txt' --include='*.md' . --exclude-dir=node_modules --exclude-dir=brief` | Zero matches |
| 3 | No blocklisted names | site-qa | `[ -s .claude/blocklist.local.txt ] && grep -rniF -f .claude/blocklist.local.txt --include='*.html' --include='*.js' --include='*.txt' --include='*.css' --include='*.md' . --exclude-dir=node_modules --exclude-dir=.claude` | Zero matches. Do not print the blocklist itself |
| 4 | Links | site-qa | Internal links: part of `npm run build`. Statistic links: `for u in $(grep -rhoE 'href="https?://[^"]+"' --include='*.html' . \| sed 's/href="//;s/"$//' \| grep -v calendar.app.google \| sort -u); do echo "$(curl -sL -A 'Mozilla/5.0' -o /dev/null -w '%{http_code}' --max-time 20 "$u") $u"; done` | No broken internal link. Every external link returns 200, or is a known bot block that opens in a browser (list it) |
| 5 | Accessibility | site-qa | axe-core 4.10 injected into every page at 375 and 1280 px, light and dark (see the script in the pull request) | No serious or critical violations |
| 6 | Contrast | site-qa | `npm run contrast` | Every token pair passes AA in both themes |
| 7 | Performance | site-qa | `npx --yes lighthouse http://localhost:8080/ --preset=perf --form-factor=mobile --screenEmulation.mobile --quiet --chrome-flags="--headless=new" --output=json --output-path=stdout \| node -e "const r=JSON.parse(require('fs').readFileSync(0));console.log('LCP',r.audits['largest-contentful-paint'].numericValue,'CLS',r.audits['cumulative-layout-shift'].numericValue)"`, repeated for /insurance and /security | LCP 2.5 s or less, CLS 0.1 or less. INP is a field metric: recheck in Search Console after launch |
| 8 | Search plumbing | site-qa | `curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/no-such-page` returns 404; `curl -sI http://localhost:8080/llms.txt` shows `content-type: text/plain`; `curl -s http://localhost:8080/sitemap.xml` lists every indexable page; `curl -s http://localhost:8080/robots.txt \| grep -E 'Claude-User\|Perplexity-User'` | Every row in SPEC.md's Step 6 list holds |
| 9 | Copy rules | brand-guardian | Review every file in `git diff main --name-only` | No rule breaks |
| 10 | Spec coverage | fresh reviewer subagent | Review the branch diff against docs/SPEC.md | No missing requirement and nothing outside scope |
| 11 | Bugs | `/code-review` | Review the branch diff | No open findings |
| 12 | Running app | `/verify` | Confirm the changes in the running site | The changes work |
| 13 | Visual | Anderson | Screenshots at 375 and 1280 px | Signed off |
