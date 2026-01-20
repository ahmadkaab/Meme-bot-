# 🤖 Autonomous Meme Affiliate Bot (The "Meme-Bot")

**Status:** 🟢 Active & Optimized (v2.0 - No AI, High Volume)
**Core Function:** Automatically finds meme videos in Google Drive, uploads them to **YouTube Shorts & Instagram Reels**, and promotes a single high-value affiliate link.

---

## 🏗 System Architecture

### 1. Source (The Content)
*   **Location:** Google Drive (Specific Folder).
*   **Logic:** Scans a specific folder (`DRIVE_FOLDER_ID`) for `.mp4` files.
*   **History:** Uses `db.json` to track `file.id` so videos are never uploaded twice.

### 2. The Strategy (Viral Roulette) 🎰
*   **No AI:** Removed Gemini to increase speed and reduce errors.
*   **Titles:** Picks from a curated list of "Viral Hooks" (e.g., "Wait for the end... 💀", "Funny Memes 2026 😂").
*   **Metadata:** Uses a fixed, high-SEO tag set (`#shorts #memes #funny #viral #humor #fyp #2026`).

### 3. The Money (Affiliate Engine) 💸
*   **Dynamic Secret:** No more `links.json`. The bot grabs the link directly from **GitHub Secrets** (`AFFILIATE_LINK`).
*   **Flexibility:** Change the product you are selling instantly by updating the Secret on your phone.
*   **Placement:**
    *   **YouTube:** Description & First Comment.
    *   **Instagram:** Caption (Link in Bio reference).

### 4. The Execution (GitHub Actions) ⚙️
*   **Schedule:** Runs **3 times a day** (Every 8 hours: `cron: '0 */8 * * *'`).
*   **Environment:** Node.js 20 on Ubuntu.
*   **Secrets Required:**
    *   `GOOGLE_REFRESH_TOKEN`: Authenticates Drive/YouTube.
    *   `DRIVE_FOLDER_ID`: Target content folder ID.
    *   `IG_USERNAME` & `IG_PASSWORD`: Instagram Login.
    *   `AFFILIATE_LINK`: The product link to promote.

---

## 📂 Key Files

*   **`index.js`**: The main brain. Handles download, ffmpeg processing, uploading (YT + IG), and commenting.
*   **`db.json`**: The memory bank. **Never delete this** or it will repost old videos.
*   **`.github/workflows/blogger_bot.yml`**: The scheduler configuration.
*   **`ig_state.json`**: Stores Instagram login session (cookies) to avoid login blocks.

---

## 🛠 Troubleshooting & Maintenance

### How to Change the Product
1.  Go to **GitHub Repo -> Settings -> Secrets and variables -> Actions**.
2.  Update `AFFILIATE_LINK`.
3.  The next bot run will sell the new product.

### If Instagram Upload Fails
*   Check Action Logs. If "Checkpoint Required":
    1.  Log in to Instagram on your phone.
    2.  Approve the "Was this you?" notification.
    3.  Re-run the bot manually.

### How to Add More Videos
*   Simply upload `.mp4` files to the Google Drive folder defined in `DRIVE_FOLDER_ID`. The bot will find them automatically.

---

## 🚀 "OP" Strategy Checklist
*   [x] **Multi-Platform:** Posts to YouTube Shorts AND Instagram Reels.
*   [x] **Viral Hooks:** Uses proven high-CTR titles.
*   [x] **Dynamic Link:** Change products without touching code.
*   [x] **Volume:** 3 uploads/day on autopilot.