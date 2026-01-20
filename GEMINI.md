# 🤖 Autonomous Meme Affiliate Bot (The "Meme-Bot")

**Status:** 🟢 Active & Optimized
**Core Function:** Automatically finds meme videos in Google Drive, analyzes them with AI, and uploads them to YouTube Shorts with context-aware viral titles and affiliate product links.

---

## 🏗 System Architecture

### 1. Source (The Content)
*   **Location:** Google Drive (Recursive Folder Search).
*   **Logic:** Scans all sub-folders of the main ID (`1dsZl...`) for `.mp4` files.
*   **History:** Uses `db.json` to track `file.id` so videos are never uploaded twice.

### 2. The Brain (Gemini 3 Flash AI) 🧠
*   **Model:** `gemini-3-flash-preview` (Vision Capabilities).
*   **Process:**
    1.  Extracts a frame from the middle of the video (`ffmpeg`).
    2.  Sends the image to Gemini.
    3.  **Analyzes:** "What is happening here? Is it Tech, Pets, Home, or Funny?"
    4.  **Generates:**
        *   A Viral, Emotional Hook Title (e.g., "Wait for the reaction 💀").
        *   5 Relevant Hashtags.
        *   The content Category.

### 3. The Money (Affiliate Engine) 💸
*   **Link Database:** `links.json` (Categorized by Tech, Pets, Home, etc.).
*   **Smart Matching:** If Gemini sees a Cat -> Bot picks a "Pet" product.
*   **Auto-Tagging:** Automatically appends `?tag=meme067-21` to every Amazon link.
*   **Placement:**
    *   **Description:** "👇 BEST GADGETS 👇 [Link]"
    *   **Comment:** "🔥 GET IT HERE: [Link]" (Pinned visibility logic).

### 4. The Execution (GitHub Actions) ⚙️
*   **Schedule:** Runs every 6 hours (`cron: '0 */6 * * *'`).
*   **Environment:** Node.js 20 on Ubuntu.
*   **Secrets:**
    *   `GOOGLE_REFRESH_TOKEN`: Authenticates Drive/YouTube.
    *   `GEMINI_API_KEY`: Powers the AI analysis.
    *   `DRIVE_FOLDER_ID`: Target content folder.

---

## 📂 Key Files

*   **`index.js`**: The main brain. Handles download, AI analysis, link selection, upload, and commenting.
*   **`links.json`**: The product database. **Update this file to change what you are selling.**
*   **`titles.json`**: (Legacy/Fallback) Viral hook list if AI fails.
*   **`db.json`**: The memory bank. **Never delete this** or it will repost old videos.
*   **`.github/workflows/blogger_bot.yml`**: The scheduler configuration.

---

## 🛠 Troubleshooting & Maintenance

### How to Update Products
1.  Go to `links.json` on GitHub.
2.  Add a new link under the correct category (e.g., "tech").
    *   Format: `{"link": "amazon.com/...", "label": "Cool Thing"}`
3.  **You do NOT need to add your tag.** The bot adds `?tag=meme067-21` automatically.

### If "API Key Invalid" Error
*   Check GitHub Secrets -> `GEMINI_API_KEY`. It might need rotating if quota is exceeded.

### If "File Not Found" (Drive)
*   Ensure the Google Drive folder is shared with the bot's email address (found in `client_email` if using service account, or the user authorized via OAuth).

### Scaling Up 📈
To post more frequently (e.g., every 4 hours):
1.  Edit `.github/workflows/blogger_bot.yml`.
2.  Change `cron: '0 */6 * * *'` to `cron: '0 */4 * * *'`.

---

## 🚀 "OP" Strategy Checklist
*   [x] **Vision AI:** Smart titles based on video content.
*   [x] **Link Injection:** Context-aware Amazon links.
*   [x] **Comment Spam:** Auto-comments first link.
*   [x] **Volume:** 4-6 uploads/day on autopilot.
