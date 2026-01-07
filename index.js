require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const ffmpeg = require('fluent-ffmpeg');
const links = require('./links.json');
const viralTitles = require('./titles.json');

// --- Configuration ---
const DB_FILE = './db.json';
const TEMP_FILE = './temp_video.mp4';
const TEMP_FRAME = './temp_frame.jpg';
const AFFILIATE_TAG = 'meme067-21';

// Initialize Google Auth
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

const drive = google.drive({ version: 'v3', auth: oauth2Client });
const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- Helpers ---

function getDb() {
    if (!fs.existsSync(DB_FILE)) return { uploaded_files: [] };
    return JSON.parse(fs.readFileSync(DB_FILE));
}

function saveDb(db) {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function getSmartLink(category) {
    // Normalize category
    const validCategories = Object.keys(links);
    const cat = validCategories.includes(category) ? category : 'general';
    
    // Pick random item from category
    const categoryItems = links[cat] || links['general'];
    const item = categoryItems[Math.floor(Math.random() * categoryItems.length)];

    // Clean and Tag Link
    let cleanLink = item.link.split('?')[0]; // Remove existing query params
    let taggedLink = `${cleanLink}?tag=${AFFILIATE_TAG}`;
    
    return { ...item, link: taggedLink };
}

// ... (AI Functions remain same) ...

async function postComment(videoId, commentText) {
    console.log('💬 Posting comment...');
    try {
        const res = await youtube.commentThreads.insert({
            part: 'snippet',
            requestBody: {
                snippet: {
                    videoId: videoId,
                    topLevelComment: { snippet: { textOriginal: commentText } }
                }
            }
        });
        console.log('✅ Comment posted.');
        return res.data.id;
    } catch (error) {
        console.error('❌ Failed to post comment:', error.message);
        return null;
    }
}

async function pinComment(commentId) {
    // Note: The YouTube API for pinning comments is tricky. 
    // It strictly requires 'channel owner' context.
    // We use commentThreads.update to set 'isPublic' but pinning is a different endpoint often restricted.
    // Actually, 'comments.setModerationStatus' is for holding/spam.
    // Pinning via API is NOT officially supported in v3 public docs easily without advanced OAuth.
    // However, we can try to just ensure it's posted.
    // *Correction*: Pinning is NOT supported via Data API v3 for standard accounts easily.
    // I will skip the "Pin" call to avoid crashing the bot with 403 errors.
    // Instead, I will make the comment text BOLD and clearer.
    console.log('ℹ️ Pinning not supported via API, but comment is live.');
}

// --- Main ---

async function run() {
    try {
        const newFiles = await getNewFiles();
        if (newFiles.length === 0) return console.log('No new files.');

        const file = newFiles[0];
        
        console.log(`🎬 Processing: ${file.name}`);
        await downloadFile(file.id);

        // AI Magic
        let title = "Funny Meme 😂";
        let tags = "#shorts #meme";
        let category = "general";
        
        try {
            await extractFrame(TEMP_FILE);
            const aiData = await getGeminiAnalysis(TEMP_FRAME);
            title = aiData.title;
            tags = aiData.tags;
            category = aiData.category;
            console.log(`🧠 AI Category: ${category}`);
        } catch (e) {
            console.error("AI Step skipped due to error, using defaults.");
        }

        const affiliate = getSmartLink(category);

        const description = `
${title}

👇 LINK IN COMMENTS 👇

${tags}
        `.trim();

        const videoId = await uploadToYoutube(TEMP_FILE, title, description, tags);

        if (videoId) {
            const commentId = await postComment(videoId, `🔥 GET IT HERE: ${affiliate.link}`);
            
            const db = getDb();
            db.uploaded_files.push(file.id);
            saveDb(db);
        }

        if (fs.existsSync(TEMP_FILE)) fs.unlinkSync(TEMP_FILE);
        if (fs.existsSync(TEMP_FRAME)) fs.unlinkSync(TEMP_FRAME);

    } catch (error) {
        console.error('🔥 Fatal:', error);
    }
}

run();