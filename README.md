# ⚽ FIFA League

A tiny app for our 3-player FIFA league. It shows a live league table and a results list. Anyone with the link can enter scores, and everyone sees them straight away.

- Plain HTML, CSS and JavaScript, so there's nothing to build or install.
- Shared live scores come from a free **Supabase** database.
- It installs to your home screen, works offline, and has light and dark mode.

| File | What it does |
|---|---|
| `index.html` | The page |
| `style.css` | The look (green, light/dark) |
| `app.js` | Table maths, results, live sync |
| `config.js` | **Where you paste your Supabase keys** |
| `supabase.sql` | Sets up the database (paste into Supabase once) |
| `sw.js`, `manifest.webmanifest`, `icons/` | Makes it an installable, offline app |

---

## Step 1: Create the free database (Supabase)

1. Open **supabase.com** and tap **Start your project**. Sign in with GitHub, which is easiest.
2. Tap **New project**.
   - **Name:** `fifa-league`
   - **Database password:** tap **Generate a password**. You won't need it again.
   - **Region:** pick the one nearest to you.
   - Tap **Create new project** and wait about a minute.
3. In the left menu (tap ☰ on a phone), open **SQL Editor**, then tap **New query** (or the **+**).
4. Open the file `supabase.sql` in this repo on GitHub. Tap the **copy** icon (two squares, top right of the file). Paste it into the Supabase editor.
5. Tap **Run**. You should see *"Success. No rows returned"*. This creates the tables, turns on live updates, and adds the 3 players and 6 fixtures.

## Step 2: Copy your two keys into the app

1. In Supabase, tap the **Connect** button at the top of the project page. You can also go to **Project Settings** (cog icon), then **Data API** / **API Keys**.
2. Copy the **Project URL**. It looks like `https://abcdefghijk.supabase.co`.
3. Copy the **anon public** key (a long text starting with `eyJ…`). If you only see a **Publishable key** (starting with `sb_publishable_…`), copy that instead.
   - Never use the **service_role** / **secret** key. That one must stay private.
4. On GitHub, open `config.js` in this repo and tap the **pencil ✏️** (Edit) icon.
5. Paste between the quote marks:
   ```js
   SUPABASE_URL: 'https://abcdefghijk.supabase.co',
   SUPABASE_ANON_KEY: 'eyJhbGciOi...your long key...'
   ```
6. Tap **Commit changes…**, then **Commit changes**.

> These two values are meant to be public. They only allow what `supabase.sql` allows, which is reading and editing the league. Anyone who has the link can edit scores, which is what we want.

## Step 3: Put it online for free (GitHub Pages)

1. The app files need to be on your **main** branch. If they are on a `claude/...` branch, open the repo on GitHub, tap **Pull requests**, then **New pull request**, then **Create pull request**, then **Merge pull request**.
2. In the repo, tap **Settings**. On a phone it's in the **···** menu, or swipe the top tabs.
3. In the left menu, tap **Pages**.
4. Under **Build and deployment**, set:
   - **Source:** *Deploy from a branch*
   - **Branch:** `main` and folder `/ (root)`, then tap **Save**.
5. Wait 1–2 minutes and refresh the page. A link appears: **https://YOUR-USERNAME.github.io/League-Table/**. Send that link to Adil and Anant.

> Free GitHub Pages needs the repo to be **Public** (Settings, then General, then Danger Zone, then Change visibility).

When the app opens, the dot in the top right shows the connection:
**🟢 Live** means scores are shared. **🟡 Offline** means scores are saved on your phone and sync when you're back online. **⚪ This phone only** means `config.js` hasn't been filled in yet.

## Step 4: Add it to your home screen

**iPhone (must use Safari):**
1. Open the link in **Safari**.
2. Tap the **Share** button (square with an arrow ↑).
3. Scroll down and tap **Add to Home Screen**, then **Add**.

**Android (Chrome):**
1. Open the link in **Chrome**.
2. Tap **⋮** (top right), then **Add to Home screen** or **Install app**, then **Install**.

It now opens full screen like a normal app, even with no signal.

---

## Using it

- **Enter a score:** type in the two boxes. The table updates instantly and saves for everyone. Leave a box blank if the game isn't played yet.
- **Add a match:** tap **+ Add match**, pick home and away, then tap **Save**.
- **Change or delete a match:** tap **⋯** on that match.
- **Rename players or teams:** edit the boxes under **Players**.
- **Table order:** points, then goal difference, then goals scored. The leader gets a gold highlight and 👑.

## Good to know

- Supabase pauses free projects after about **1 week with no use**. If the app stops syncing, open supabase.com and tap **Restore project**.
- If you change the app's files later, change `VERSION` in `sw.js` (e.g. `'v2'`) so phones pick up the new version.
- Scores typed before you set up Supabase stay on that one phone. Once it's connected, the database version is used.
