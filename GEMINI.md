# 🤖 Autonomous Meme Affiliate Bot (The "Meme-Bot")

**Status:** 🟢 Active & Optimized
**Core Function:** Automatically finds meme videos in Google Drive, uploads them to **YouTube Shorts & Instagram Reels**.

---

## 🏗 System Architecture

### 1. The Content Engine ☁️
*   **Platform:** GitHub Actions.
*   **Schedule:** Runs **3 times a day** (Every 8 hours).
*   **Logic:**
    *   Picks a **random** video from Drive.
    *   Uploads to YouTube Shorts & Instagram Reels.
    *   Uses "Viral Roulette" titles (e.g., "Wait for the end... 💀").
    *   Promotes your Affiliate Link in comments/bio.

### 2. The Money (Affiliate Engine) 💸
*   **Dynamic Secret:** The bot grabs the link directly from **GitHub Secrets** (`AFFILIATE_LINK`).
*   **Flexibility:** Change the product you are selling instantly by updating the Secret on your phone.

---

## 📂 Key Files

*   **`index.js`**: The main bot logic. Handles random selection and multi-platform upload.
*   **`get_refresh_token.js`**: Utility script to automatically regenerate Google OAuth refresh tokens.
*   **`db.json`**: The memory bank. Tracks uploaded file IDs to avoid duplicates.
*   **`.github/workflows/blogger_bot.yml`**: The automation schedule.

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

### How to Refresh Google Credentials
If the bot fails with "Invalid Credentials" or "Token Expired":
1.  Run `node get_refresh_token.js` locally.
2.  A browser window will open. Login and allow access.
3.  Copy the new token printed in the terminal.
4.  Update the **`GOOGLE_REFRESH_TOKEN`** secret in GitHub.

---

## 🚀 "OP" Strategy Checklist
*   [x] **Multi-Platform:** Posts to YouTube Shorts AND Instagram Reels.
*   [x] **Viral Hooks:** Uses proven high-CTR titles (Randomized).
*   [x] **Dynamic Link:** Change products without touching code.
*   [x] **Volume:** 3 uploads/day on autopilot.