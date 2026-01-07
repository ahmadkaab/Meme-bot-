require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const axios = require('axios');
const links = require('./links.json');
const { IgApiClient } = require('instagram-private-api');

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

function getDb() {
    if (!fs.existsSync(DB_FILE)) return { uploaded_files: [] };
    return JSON.parse(fs.readFileSync(DB_FILE));
}

function saveDb(db) {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function getRandomLink() {
    return links[Math.floor(Math.random() * links.length)];
}

// --- Core Functions ---

async function getNewFiles() {
    console.log('🔍 Checking Drive for new files (recursively)...');
    const db = getDb();
    const mainFolderId = process.env.DRIVE_FOLDER_ID;
    
    console.log(`[DEBUG] Target Folder ID: ${mainFolderId}`);

    // DEBUG: Check what the bot can see
    try {
        console.log('[DEBUG] Listing "Shared with me" folders to verify access...');
        const checkRes = await drive.files.list({
            q: "sharedWithMe = true",
            fields: 'files(id, name)',
            pageSize: 10
        });
        console.log('[DEBUG] Shared folders visible:', checkRes.data.files);
    } catch (e) {
        console.log('[DEBUG] Error listing shared files:', e.message);
    }

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
        // If the main folder fails, we can't do anything.
        if (folders.length === 1) return [];
    }

    // 2. Search for videos in ALL identified folders
    let allFiles = [];
    for (const folderId of folders) {
        try {
            const res = await drive.files.list({
                q: `'${folderId}' in parents and mimeType contains 'video/' and trashed = false`,
                fields: 'files(id, name, mimeType)',
                pageSize: 50
            });
            if (res.data.files) {
                allFiles = allFiles.concat(res.data.files);
            }
        } catch (e) {
            console.error(`Error scanning folder ${folderId}:`, e.message);
        }
    }

    const newFiles = allFiles.filter(f => !db.uploaded_files.includes(f.id));
    console.log(`🎥 Total videos found: ${allFiles.length}. New videos: ${newFiles.length}.`);
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
                    title: title.substring(0, 100),
                    description: description,
                    tags: ['shorts', 'meme', 'funny'],
                    categoryId: '23'
                },
                status: {
                    privacyStatus: 'public',
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

// 2. Instagram Upload (REAL)
async function uploadToInstagram(filePath, caption) {
    console.log('📸 Uploading to Instagram...');
    try {
        const ig = new IgApiClient();
        ig.state.generateDevice(process.env.IG_USERNAME);
        
        // Login
        await ig.account.login(process.env.IG_USERNAME, process.env.IG_PASSWORD);

        // Read file as buffer
        const videoBuffer = fs.readFileSync(filePath);
        
        // Instagram requires a cover photo (JPEG). 
        // For a simple bot, we'll use a 1x1 black pixel JPEG placeholder.
        const coverBuffer = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAFA3PEY8ED5GWEZGPDpCUXFiUZRDSXpufWhkc3VzZ3x0dnZ0fXp7fH1+f3p7fH1+f3p7fH1+f3p7fH1+f3p7fH1+f3p7fH1+f3oA...', 'base64');

        // Upload
        const publishResult = await ig.publish.video({
            video: videoBuffer,
            coverImage: coverBuffer,
            caption: caption,
        });

        if (publishResult.status === 'ok') {
            console.log(`✅ Instagram Upload Success! Media ID: ${publishResult.media.id}`);
            return true;
        } else {
            console.error('❌ Instagram Upload status not ok:', publishResult);
            return false;
        }
    } catch (error) {
        console.error('❌ Instagram Upload Failed:', error.message);
        // Don't crash the whole bot if IG fails
        return false;
    }
}

// 3. Pinterest Upload (Pending Credentials)
async function uploadToPinterest(filePath, title, link) {
    console.log('⚠️ Pinterest Upload Skipped (Configure Board ID in .env)');
    return true; 
}

// --- Main Execution ---

async function run() {
    try {
        const newFiles = await getNewFiles();
        
        if (newFiles.length === 0) {
            console.log('No new files to process.');
            return;
        }

        const file = newFiles[0];
        const affiliate = getRandomLink();
        
        console.log(`🎬 Processing: ${file.name}`);
        
        await downloadFile(file.id);

        const title = `Funny Meme 😂 #shorts`;
        const description = `${file.name}\n\nCheck this out: ${affiliate.link}\n\n#memes #funny`;

        // Uploads
        await uploadToYoutube(TEMP_FILE, title, description);
        
        if (process.env.IG_USERNAME && process.env.IG_PASSWORD) {
            await uploadToInstagram(TEMP_FILE, description);
        } else {
            console.log('⚠️ Skipping Instagram (No credentials in .env)');
        }

        // Update DB
        const db = getDb();
        db.uploaded_files.push(file.id);
        saveDb(db);
        
        console.log(`🎉 Finished processing ${file.name}`);

        if (fs.existsSync(TEMP_FILE)) fs.unlinkSync(TEMP_FILE);

    } catch (error) {
        console.error('🔥 Fatal Error:', error);
    }
}

run();
