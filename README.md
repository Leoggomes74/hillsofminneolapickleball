# Hills of Minneola Mixed Doubles — Summer 2026

Live tournament site. Scores are stored server-side, so every visitor with the
link sees the same results.

## Files

- index.html — the whole site (no build step)
- api/results.js — serverless function that reads/writes the scores
- package.json — only there to mark the API route as an ES module
- vercel.json — caching headers

## Deploy (about 5 minutes)

1. **Push these files** to your repo root (or drag the folder onto vercel.com/new).
2. **Add a store.** Vercel dashboard → your project → **Storage** →
   **Create Database** → choose **Upstash Redis** (this is what "Vercel KV" is
   now) → Free plan → connect it to this project.
   That automatically adds the env vars the API route needs
   (KV_REST_API_URL / KV_REST_API_TOKEN, or the UPSTASH_… equivalents).
3. **Set the scoring passcode** (see the next section).
4. **Redeploy** so the new env vars are picked up.

That's it. Open the site: the header shows **LIVE · SHARED** when it is talking
to the store.

## Setting the scoring passcode

The passcode lives in two places and **both must match**: the server checks it
before saving, and the page uses it to show the keypad. If you skip this
entirely, the passcode stays 2074 and everything still works.

### Part A — the server (in Vercel)

1. Go to **vercel.com** and open your project.
2. Click the **Settings** tab in the top bar.
3. Choose **Environment Variables** in the left sidebar.
4. In **Key** type exactly:

       SCORE_PASSCODE

5. In **Value** type your 4 digits, e.g. `7391`.
6. Under **Environments**, leave all three ticked
   (Production, Preview, Development).
7. Click **Save**.
8. Open the **Deployments** tab, click the **⋯** menu on the newest deployment
   and choose **Redeploy** → **Redeploy**. Environment variables only take
   effect on a new deployment, so this step is required.

### Part B — the page (in index.html)

1. Open `index.html` in any text editor.
2. Find this line, about 130 lines down, just inside the `<script>` block:

       var PASSCODE="2074";

3. Change the digits to the same value you used in Vercel:

       var PASSCODE="7391";

4. Save, commit and push the file (or re-upload it to Vercel).

### Checking it worked

Open the site, tap any match, and enter your new passcode — the score sheet
should open and the header should stay **LIVE · SHARED** after you save.
If the old code still works, Part B wasn't pushed. If saving shows
"Saved on this device only", Part A's redeploy hasn't finished.

> Note: keep the two values in step A and step B identical. If they differ, the
> keypad accepts one code but the server rejects the save.

## How it works

- Anyone can read scores; writing requires the passcode, which is checked on the
  server, not in the browser.
- The page re-fetches every 10 seconds and whenever it regains focus, so
  spectators see scores appear without reloading.
- If the server is unreachable the badge turns **OFFLINE · RETRY** and scores
  fall back to that device's own storage, then you can re-enter or use a
  **Share results** snapshot link.

## Optional

Pin your live address so snapshot links always point at production — near the
top of the script in index.html:

    var SITE_URL="https://your-site.vercel.app/";
