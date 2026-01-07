require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const axios = require('axios');
const links = require('./links.json');

// --- Configuration ---
const DB_FILE = './db.json';
const TEMP_FILE = './temp_video.mp4';

// Initialize Google Auth (Drive & YouTube)
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

const drive = google.drive({ version: 'v3', auth: oauth2Client });
const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

// --- Helpers ---

// Load or initialize DB
function getDb() {
    if (!fs.existsSync(DB_FILE)) return { uploaded_files: [] };
    return JSON.parse(fs.readFileSync(DB_FILE));
}

function saveDb(db) {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function getRandomLink() {
    const item = links[Math.floor(Math.random() * links.length)];
    return item;
}

// --- Core Functions ---

async function getNewFiles() {
    console.log('🔍 Checking Drive for new files (recursively)...');
    const db = getDb();
    const mainFolderId = process.env.DRIVE_FOLDER_ID;

    // 1. Find all sub-folders
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
        console.log(`📂 Found ${folders.length - 1} sub-folders.`);
    } catch (e) {
        console.error("Warning: Could not list sub-folders.", e.message);
    }

    // 2. Search for videos in ALL identified folders
    let allFiles = [];
    
    // We can't put ALL folders in one query if there are too many, so we loop or batch.
    // Since you have ~11 folders, a loop is fine.
    for (const folderId of folders) {
        try {
            const res = await drive.files.list({
                q: `'${folderId}' in parents and mimeType contains 'video/' and trashed = false`,
                fields: 'files(id, name, mimeType)',
                pageSize: 50 // Get up to 50 videos per folder per run to save time
            });
            if (res.data.files) {
                allFiles = allFiles.concat(res.data.files);
            }
        } catch (e) {
            console.error(`Error scanning folder ${folderId}:`, e.message);
        }
    }

    // Filter out files that are already in our DB
    const newFiles = allFiles.filter(f => !db.uploaded_files.includes(f.id));
    
    console.log(`🎥 Total videos found: ${allFiles.length}. New videos to process: ${newFiles.length}.`);
    return newFiles;
}

async function downloadFile(fileId) {
    console.log(`⬇️ Downloading file ID: ${fileId}...`);
    const dest = fs.createWriteStream(TEMP_FILE);
    
    const res = await drive.files.get(
        { fileId: fileId, alt: 'media' },
        { responseType: 'stream' }
    );

    return new Promise((resolve, reject) => {
        res.data
            .on('end', () => {
                console.log('✅ Download complete.');
                resolve(TEMP_FILE);
            })
            .on('error', err => reject(err))
            .pipe(dest);
    });
}

// 1. YouTube Upload
async function uploadToYoutube(filePath, title, description) {
    console.log('🚀 Uploading to YouTube...');
    try {
        const res = await youtube.videos.insert({
            part: 'snippet,status',
            requestBody: {
                snippet: {
                    title: title.substring(0, 100), // Max 100 chars
                    description: description,
                    tags: ['shorts', 'meme', 'funny'],
                    categoryId: '23' // Comedy
                },
                status: {
                    privacyStatus: 'public', // or 'private' to test
                    selfDeclaredMadeForKids: false
                }
            },
            media: {
                body: fs.createReadStream(filePath)
            }
        });
        console.log(`✅ YouTube Upload Success! ID: ${res.data.id}`);
        return res.data.id;
    } catch (error) {
        console.error('❌ YouTube Upload Failed:', error.message);
        return null;
    }
}

// 2. Instagram Upload (Skeleton - Requires Business Account + Valid Token)
async function uploadToInstagram(filePath, caption) {
    console.log('📸 Uploading to Instagram (Skeleton)...');
    // Note: The Graph API requires the video to be hosted on a public URL first for the container creation step,
    // OR you must use the Resumable Upload protocol for binary files.
    // For a local bot, 'instagram-private-api' is often easier but carries ban risk.
    
    // Logic:
    // 1. Create Media Container (POST /me/media)
    // 2. Wait for processing
    // 3. Publish Media (POST /me/media_publish)
    
    return true; // Mock success
}

// 3. Pinterest Upload (Skeleton)
async function uploadToPinterest(filePath, title, link) {
    console.log('📌 Uploading to Pinterest (Skeleton)...');
    // Logic:
    // 1. Register media upload
    // 2. Upload file chunks
    // 3. Create Pin with media ID
    return true; // Mock success
}

// --- Main Execution ---

async function run() {
    try {
        const newFiles = await getNewFiles();
        
        if (newFiles.length === 0) {
            console.log('No new files to process.');
            return;
        }

        // Process only 1 file per run to be safe/incremental
        const file = newFiles[0];
        const affiliate = getRandomLink();
        
        console.log(`🎬 Processing: ${file.name}`);
        
        await downloadFile(file.id);

        const title = `Funny Meme 😂 #shorts`;
        const description = `${file.name}\n\nCheck this out: ${affiliate.link}\n\n#memes #funny`;

        // Uploads
        await uploadToYoutube(TEMP_FILE, title, description);
        await uploadToInstagram(TEMP_FILE, description);
        await uploadToPinterest(TEMP_FILE, title, affiliate.link);

        // Update DB
        const db = getDb();
        db.uploaded_files.push(file.id);
        saveDb(db);
        
        console.log(`🎉 Finished processing ${file.name}`);

        // Cleanup
        if (fs.existsSync(TEMP_FILE)) fs.unlinkSync(TEMP_FILE);

    } catch (error) {
        console.error('🔥 Fatal Error:', error);
    }
}

run();
