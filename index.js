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

    // Auto-append affiliate tag
    let link = item.link;
    if (link.includes('amazon') && !link.includes('tag=')) {
        link += (link.includes('?') ? '&' : '?') + `tag=${AFFILIATE_TAG}`;
    }
    return { ...item, link };
}

// --- AI Functions ---

async function extractFrame(videoPath) {
    console.log('🖼️ Extracting frame for AI analysis...');
    return new Promise((resolve, reject) => {
        ffmpeg(videoPath)
            .screenshots({
                timestamps: ['50%'], 
                filename: 'temp_frame.jpg',
                folder: '.',
                size: '?x720' 
            })
            .on('end', () => resolve(TEMP_FRAME))
            .on('error', (err) => reject(err));
    });
}

async function getGeminiAnalysis(imagePath) {
    console.log('🧠 Asking Gemini 3 Flash to analyze...');
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
        
        const imageBuffer = fs.readFileSync(imagePath);
        const imagePart = {
            inlineData: {
                data: imageBuffer.toString("base64"),
                mimeType: "image/jpeg",
            },
        };

        const prompt = `
        Look at this meme video frame. 
        1. Write a generic, high-click, viral YouTube Shorts title (max 50 chars). 
        2. Give me 5 viral hashtags.
        3. CATEGORIZE this image into exactly one of these: "tech", "pets", "home", "funny", "general".
        
        Return JSON format: {"title": "...", "tags": "...", "category": "..."}
        `;

        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;
        const text = response.text();
        
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonStr);

    } catch (error) {
        console.error("⚠️ Gemini Failed:", error.message);
        return { 
            title: "Wait for the end... 💀", 
            tags: "#shorts #meme #funny #viral",
            category: "general"
        };
    }
}

// --- Core Functions ---

async function getNewFiles() {
    console.log('🔍 Checking Drive for new files (recursively)...');
    const db = getDb();
    const mainFolderId = process.env.DRIVE_FOLDER_ID;

    let folders = [mainFolderId];
    try {
        const folderRes = await drive.files.list({
            q: `'${mainFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id, name)',
            pageSize: 100 
        });
        if (folderRes.data.files) {
            folders = folders.concat(folderRes.data.files.map(f => f.id));
        }
    } catch (e) { console.error(e.message); }

    let allFiles = [];
    for (const folderId of folders) {
        try {
            const res = await drive.files.list({
                q: `'${folderId}' in parents and mimeType contains 'video/' and trashed = false`,
                fields: 'files(id, name, mimeType)',
                pageSize: 50
            });
            if (res.data.files) allFiles = allFiles.concat(res.data.files);
        } catch (e) {}
    }

    return allFiles.filter(f => !db.uploaded_files.includes(f.id));
}

async function downloadFile(fileId) {
    console.log(`⬇️ Downloading...`);
    const dest = fs.createWriteStream(TEMP_FILE);
    const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
    return new Promise((resolve, reject) => {
        res.data
            .on('end', () => resolve(TEMP_FILE))
            .on('error', reject)
            .pipe(dest);
    });
}

async function uploadToYoutube(filePath, title, description, tags) {
    console.log(`🚀 Uploading: "${title}"`);
    try {
        const res = await youtube.videos.insert({
            part: 'snippet,status',
            requestBody: {
                snippet: {
                    title: title, 
                    description: description,
                    tags: tags.split(' ').map(t => t.replace('#', '')),
                    categoryId: '23'
                },
                status: { privacyStatus: 'public', selfDeclaredMadeForKids: false }
            },
            media: { body: fs.createReadStream(filePath) }
        });
        console.log(`✅ Success! ID: ${res.data.id}`);
        return res.data.id;
    } catch (error) {
        console.error('❌ Upload Failed:', error.message);
        return null;
    }
}

async function postComment(videoId, commentText) {
    try {
        await youtube.commentThreads.insert({
            part: 'snippet',
            requestBody: {
                snippet: {
                    videoId: videoId,
                    topLevelComment: { snippet: { textOriginal: commentText } }
                }
            }
        });
        console.log('💬 Comment posted.');
    } catch (error) {}
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

👇 BEST GADGETS 👇
${affiliate.link}

${tags}
        `.trim();

        const videoId = await uploadToYoutube(TEMP_FILE, title, description, tags);

        if (videoId) {
            await postComment(videoId, `🔥 Get it here: ${affiliate.link}`);
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