# Deploy HexSpace to GitHub Pages

HexSpace is a static, client-side app. The published site is served directly from the repository root: there is no build step, package install, backend, API key, or runtime service.

## Publish from a branch

1. Push the project files to the GitHub repository. Keep `index.html`, `.nojekyll`, `css/`, and `src/` at the repository root; do not publish only a subdirectory.
2. In GitHub, open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select the publishing branch (normally `main`) and **/(root)**, then save.
5. Wait for the Pages deployment to finish in the repository's **Actions** tab. Open the site URL shown under **Settings → Pages**.

The existing `.nojekyll` file disables Jekyll processing. HTML imports and asset URLs are relative (`./src/main.js`, `./css/style.css`), so the site works at the repository's project URL as well as a custom domain; do not add a root-only `/src/...` path or a separate base URL.

## Verify a deployment

- Load the published URL and confirm the title screen appears without a 404 for `src/main.js` or `css/style.css`.
- Start a campaign, fly and dock, open the market and galaxy map, then reload. A save indicator should report local storage status and the campaign should continue.
- Check the browser console for failed module requests. If an old cached deployment is shown, hard-refresh after the Pages workflow reports success.
- The app needs JavaScript. Audio starts only after a user gesture because browsers restrict autoplay.

## Local check before publishing

With Python 3 available, run `npm start` (or `python3 -m http.server 8000 --bind 0.0.0.0`) and open `http://localhost:8000`. Run `npm test` for the Node test suite. No `npm install` or build command is required to play or deploy.

## Saves and origins

Campaigns are stored in the browser's `localStorage`, scoped to the exact origin. Saves do not sync between `localhost`, the GitHub Pages URL, and a custom domain. Use **Settings → Export campaign** and **Import** to move a save between origins or devices. Clearing site data removes the local save.

## Optional GitHub Actions publishing

If the repository uses an Actions-based Pages workflow instead of branch publishing, configure the workflow to publish the repository root as a static artifact. Do not run a bundler or copy only `index.html`: the relative `src/` and `css/` trees and `.nojekyll` must be present in the uploaded artifact.
