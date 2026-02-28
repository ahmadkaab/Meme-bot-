require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const ffprobe = require("ffprobe-static");

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobe.path);

const { IgApiClient } = require("instagram-private-api");
// const links = require('./links.json'); // Removed in favor of Env Var

// --- Configuration ---
const DB_FILE = "./db.json";
const TEMP_FILE = "./temp_video.mp4";
const TEMP_FRAME = "./temp_frame.jpg";
const IG_STATE_FILE = "./ig_state.json"; // To save login session
const AFFILIATE_TAG = "meme067-21";

// Initialize Google Auth
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI,
);
oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

const drive = google.drive({ version: "v3", auth: oauth2Client });
const youtube = google.youtube({ version: "v3", auth: oauth2Client });

// Initialize Instagram
const ig = new IgApiClient();

// --- Helpers ---

async function randomDelay(minMinutes = 0, maxMinutes = 120) {
  const delayMs =
    Math.floor(Math.random() * (maxMinutes - minMinutes + 1) + minMinutes) *
    60 *
    1000;
  console.log(
    `⏳ Sneaky Sleep: Waiting ${delayMs / 60000} minutes before acting...`,
  );
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function getDb() {
  if (!fs.existsSync(DB_FILE)) return { uploaded_files: [] };
  const db = JSON.parse(fs.readFileSync(DB_FILE));
  return db;
}

function saveDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function getAffiliateLink() {
  const rawLink = process.env.AFFILIATE_LINK || "https://www.amazon.com";

  // Simple logic: If it's Amazon, ensure tag is present.
  // If user provides a full link with tag in secret, this might double-tag,
  // but for safety let's just use what they provide if it looks like a full tracking link.

  if (rawLink.includes("amazon") && !rawLink.includes("tag=")) {
    return rawLink.includes("?")
      ? `${rawLink}&tag=${AFFILIATE_TAG}`
      : `${rawLink}?tag=${AFFILIATE_TAG}`;
  }

  return rawLink;
}

function getRandomTitle() {
  const titles = require("./titles.json");
  return titles[Math.floor(Math.random() * titles.length)];
}

// --- Instagram Functions ---

async function loginToInstagram() {
  console.log("📸 Logging into Instagram...");
  ig.state.generateDevice(process.env.IG_USERNAME);

  // Load existing session if available
  if (fs.existsSync(IG_STATE_FILE)) {
    console.log("🔄 Loading IG session from file...");
    await ig.state.deserialize(
      JSON.parse(fs.readFileSync(IG_STATE_FILE, "utf8")),
    );
  }

  try {
    // Check if session is valid by simulating a pre-login call
    await ig.account.currentUser();
    console.log("✅ IG Session valid.");
  } catch (e) {
    console.log("⚠️ IG Session invalid or expired. Logging in again...");
    try {
      // Simulate pre-login flow
      await ig.simulate.preLoginFlow();
      const auth = await ig.account.login(
        process.env.IG_USERNAME,
        process.env.IG_PASSWORD,
      );
      console.log(`✅ Logged in as ${auth.username}`);

      // Save session
      const serialized = await ig.state.serialize();
      delete serialized.constants; // specific to the library, clean it up
      fs.writeFileSync(IG_STATE_FILE, JSON.stringify(serialized));

      // Post-login flow
      process.nextTick(async () => {
        try {
          await ig.simulate.postLoginFlow();
        } catch (e) {
          console.warn(
            "⚠️ IG Post-login simulation warning (safe to ignore):",
            e.message,
          );
        }
      });
    } catch (loginError) {
      console.error("❌ Instagram Login Failed:", loginError.message);
      // If it's a checkpoint error, we might need manual intervention, but for now we just fail gracefully.
      if (loginError.message.includes("checkpoint")) {
        console.error(
          "🚨 IG CHECKPOINT REQUIRED! Log in manually on a phone to approve this device.",
        );
      }
      throw loginError;
    }
  }
}

async function uploadToInstagram(videoPath, coverPath, caption) {
  console.log(
    "📸 Uploading as Instagram Reel (Shadow-ban avoidance active)...",
  );
  try {
    const videoBuffer = fs.readFileSync(videoPath);
    const coverBuffer = fs.readFileSync(coverPath);

    // Force Reel by specifically using the Reels publish endpoint and checking media metadata
    const publishResult = await ig.publish.video({
      video: videoBuffer,
      coverImage: coverBuffer,
      caption: caption,
      isReel: true, // Specific hint for some library versions
    });

    console.log("✅ Instagram Reel Upload Success:", publishResult.status);
    return publishResult;
  } catch (error) {
    console.error("❌ Instagram Reel Upload Failed:", error.message);
    return null;
  }
}

// --- Video Functions ---

async function processVideo(inputPath, outputPath) {
  console.log("🎬 Applying Viral Uniquifier (Shadow-ban protection)...");
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoFilters([
        // 1. Zoom slightly (1.05x) to change framing
        "scale=iw*1.05:-1,crop=iw/1.05:ih/1.05",
        // 2. Subtle color tweak (contrast +2%, saturation +5%, brightness -2%)
        "eq=contrast=1.02:saturation=1.05:brightness=-0.02",
        // 3. Noise reduction to clean up blurry videos (subtle)
        "hqdn3d=1.5:1.5:6:6",
        // 4. Force 9:16 aspect ratio (standard for Reels/Shorts)
        "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:black",
      ])
      .videoCodec("libx264")
      .audioCodec("aac")
      .outputOptions("-crf 23") // High quality but small size
      .on("start", (cmd) => console.log("🚀 Ffmpeg processing started..."))
      .on("end", () => {
        console.log("✅ Video uniquified successfully.");
        resolve(outputPath);
      })
      .on("error", (err) => {
        console.error("❌ Ffmpeg error:", err.message);
        reject(err);
      })
      .save(outputPath);
  });
}

async function extractFrame(videoPath) {
  console.log("🖼️ Extracting frame for cover...");
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .screenshots({
        timestamps: ["50%"],
        filename: "temp_frame.jpg",
        folder: ".",
        size: "720x1280",
      })
      .on("end", () => resolve(TEMP_FRAME))
      .on("error", (err) => reject(err));
  });
}

async function postComment(videoId, commentText) {
  console.log("💬 Posting comment...");
  try {
    const res = await youtube.commentThreads.insert({
      part: "snippet",
      requestBody: {
        snippet: {
          videoId: videoId,
          topLevelComment: { snippet: { textOriginal: commentText } },
        },
      },
    });
    console.log("✅ Comment posted.");
    return res.data.id;
  } catch (error) {
    console.error("❌ Failed to post comment:", error.message);
    return null;
  }
}

// --- Core Functions ---

async function getNewFiles() {
  console.log(
    `🔍 Checking Drive for new files in folder: ${process.env.DRIVE_FOLDER_ID}...`,
  );
  const db = getDb();
  const folderId = process.env.DRIVE_FOLDER_ID;

  let allFiles = [];
  try {
    // Query specifically for files that have the target folder in their parents
    const res = await drive.files.list({
      q: `'${folderId}' in parents and mimeType contains 'video/' and trashed = false`,
      fields: "files(id, name, mimeType)",
      pageSize: 100,
    });

    if (res.data.files) {
      allFiles = res.data.files;
    }
  } catch (e) {
    console.error("❌ Drive List Error:", e.message);
  }

  console.log(`📂 Video files found in folder: ${allFiles.length}`);
  return allFiles.filter((f) => !db.uploaded_files.includes(f.id));
}

async function downloadFile(fileId) {
  console.log(`⬇️ Downloading origin file...`);
  const rawPath = "./raw_video.mp4";
  const dest = fs.createWriteStream(rawPath);
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "stream" },
  );
  return new Promise((resolve, reject) => {
    res.data
      .on("end", () => resolve(rawPath))
      .on("error", reject)
      .pipe(dest);
  });
}

async function uploadToYoutube(filePath, title, description, tags) {
  console.log(`🚀 Uploading to YouTube: "${title}"`);
  try {
    const res = await youtube.videos.insert({
      part: "snippet,status",
      requestBody: {
        snippet: {
          title: title,
          description: description,
          tags: tags.split(" ").map((t) => t.replace("#", "")),
          categoryId: "23",
        },
        status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
      },
      media: { body: fs.createReadStream(filePath) },
    });
    console.log(`✅ YouTube Success! ID: ${res.data.id}`);
    return res.data.id;
  } catch (error) {
    console.error("❌ YouTube Upload Failed:", error.message);
    return null;
  }
}

// --- Main Execution ---

async function run() {
  try {
    // --- RANDOM DELAY ---
    await randomDelay(0, 120);

    const newFiles = await getNewFiles();
    if (newFiles.length === 0) return console.log("No new files.");

    // Shuffle to get random variety
    const file = newFiles[Math.floor(Math.random() * newFiles.length)];

    console.log(`🎬 Processing: ${file.name}`);

    const rawPath = await downloadFile(file.id);

    // --- THE UNIQUIFIER ---
    await processVideo(rawPath, TEMP_FILE);
    if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath); // Delete raw file

    // Ensure frame is extracted for IG Cover
    try {
      await extractFrame(TEMP_FILE);
    } catch (e) {
      console.error("❌ Frame extraction failed:", e.message);
    }

    const title = getRandomTitle();
    const tags = "#shorts #memes #funny #relatable #humor #fyp #viral2026";
    const affiliateLink = getAffiliateLink();

    const description = `
${title}

Daily Funny Memes and best viral clips! 
Subscribe for more.

👇 CHECK THIS OUT 👇
${affiliateLink}

${tags}
        `.trim();

    // 1. YouTube Upload
    const videoId = await uploadToYoutube(TEMP_FILE, title, description, tags);

    if (videoId) {
      await postComment(videoId, `🔥 GET IT HERE: ${affiliateLink}`);

      const db = getDb();
      db.uploaded_files.push(file.id);

      saveDb(db);
    }

    // 2. Instagram Upload
    if (process.env.IG_USERNAME && process.env.IG_PASSWORD) {
      try {
        await loginToInstagram();
        const igCaption = `Memes 2026.😤\nLink in bio 🔗\n\n#memes #funny #reels`;

        // IG REQUIRES a cover image. We use the frame we extracted.
        if (fs.existsSync(TEMP_FRAME)) {
          await uploadToInstagram(TEMP_FILE, TEMP_FRAME, igCaption);
        } else {
          console.error("❌ Skipping IG: Frame extraction failed");
        }
      } catch (e) {
        console.error("⚠️ Instagram error:", e.message);
      }
    } else {
      console.log(
        "⚠️ Skipping Instagram: Missing IG_USERNAME or IG_PASSWORD in .env",
      );
    }

    if (fs.existsSync(TEMP_FILE)) fs.unlinkSync(TEMP_FILE);
    if (fs.existsSync(TEMP_FRAME)) fs.unlinkSync(TEMP_FRAME);
  } catch (error) {
    console.error("🔥 Fatal:", error);
  }
}

run();
