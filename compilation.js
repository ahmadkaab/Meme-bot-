require('dotenv').config();
const fs = require('fs');
const { google } = require('googleapis');
const ffmpeg = require('fluent-ffmpeg');

// Force use of static binaries (Crash-proof on GitHub Actions)
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static');
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath.path);

const DB_FILE = './db.json';
const OUTPUT_FILE = './compilation_final.mp4';
const TEMP_DIR = './temp_clips';

// Auth
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

const drive = google.drive({ version: 'v3', auth: oauth2Client });
const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

function getDb() {
    if (!fs.existsSync(DB_FILE)) return { history: [] };
    return JSON.parse(fs.readFileSync(DB_FILE));
}

async function downloadFile(fileId, destPath) {
    const dest = fs.createWriteStream(destPath);
    const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
    return new Promise((resolve, reject) => {
        res.data.pipe(dest).on('finish', resolve).on('error', reject);
    });
}

async function createCompilation(videoFiles) {
    console.log(`🎬 Stitching ${videoFiles.length} videos...`);
    
    // Create a complex filter string
    // We want to verify that all inputs are valid videos first
    // Then concat them. 
    // BUT! Since they are vertical, we first need to convert EACH one to 16:9 
    // and THEN concat them. This is resource intensive.
    
    // STRATEGY: 
    // 1. Convert each clip to a temporary 16:9 .ts file (fast concat)
    // 2. Concat all .ts files
    
    const processedClips = [];
    
    for (let i = 0; i < videoFiles.length; i++) {
        const input = videoFiles[i];
        const output = `${TEMP_DIR}/clip_${i}.ts`; // TS format is safer for concat
        
        console.log(`🔹 Processing clip ${i+1}/${videoFiles.length}...`);
        
        // Simpler "Black Bars" Filter (Crash Proof)
        // [0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2[v]
        
        await new Promise((resolve, reject) => {
            ffmpeg(input)
                .complexFilter([
                    `[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2[v]`
                ], 'v')
                .outputOptions([
                    '-c:v libx264',
                    '-preset ultrafast', // Fast render
                    '-bsf:v h264_mp4toannexb',
                    '-f mpegts'
                ])
                .save(output)
                .on('end', resolve)
                .on('error', reject);
        });
        processedClips.push(`file 'clip_${i}.ts'`);
    }

    console.log("🔗 Concatenating (Demuxer Mode)...");
    
    // Create List File for Demuxer
    const listFile = `${TEMP_DIR}/list.txt`;
    fs.writeFileSync(listFile, processedClips.join('\n'));
    
    // Merge using Concat Demuxer (Fast & Low RAM)
    const mergedOutput = OUTPUT_FILE;
    
    await new Promise((resolve, reject) => {
        ffmpeg()
            .input(listFile)
            .inputOptions(['-f concat', '-safe 0'])
            // .outputOptions('-c copy') // Stream copy (Crashing)
            .outputOptions([
                '-c:v libx264',      // Re-encode video
                '-preset ultrafast', // Fast as possible
                '-c:a aac'           // Re-encode audio
            ]) 
            .save(mergedOutput)
            .on('end', () => {
                resolve();
            })
            .on('error', (err) => {
                console.error("❌ FFmpeg Concat Error:", err);
                reject(err);
            });
    });
    
    return mergedOutput;
}

async function uploadToYoutube(filePath, videoCount) {
    console.log(`🚀 Uploading Compilation...`);
    const date = new Date().toDateString();
    const affiliate = process.env.AFFILIATE_LINK || "https://www.amazon.com";
    
    const title = `Best Viral Memes of the Week! 😂 (${videoCount} Videos) - ${date}`;
    const description = `
Here are the best memes from this week!
Subscribe for daily content.

👇 BEST GADGETS HERE 👇
${affiliate}

#memes #funny #compilation #viral #2026
    `.trim();

    const res = await youtube.videos.insert({
        part: 'snippet,status',
        requestBody: {
            snippet: {
                title: title, 
                description: description,
                tags: ['memes', 'funny', 'compilation', 'viral'],
                categoryId: '23'
            },
            status: { privacyStatus: 'public', selfDeclaredMadeForKids: false }
        },
        media: { body: fs.createReadStream(filePath) }
    });
    console.log(`✅ Compilation Uploaded! ID: ${res.data.id}`);
}

async function run() {
    try {
        if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);

        const db = getDb();
        if (!db.history || db.history.length < 5) {
            console.log("⚠️ Not enough history for a compilation yet.");
            return;
        }

        // Get last 10 videos (or however many we have from the last week)
        // Sort by date (newest first) and take top 10
        const recentVideos = db.history.slice(-10);
        
        console.log(`📦 Found ${recentVideos.length} videos for compilation.`);

        const downloadedFiles = [];
        
        // Download
        for (let i = 0; i < recentVideos.length; i++) {
            const vid = recentVideos[i];
            
            // Skip if the ID looks like a YouTube ID (11 chars, no dashes usually, but Drive IDs are much longer)
            // Drive IDs are usually ~33 chars. YouTube IDs are 11.
            if (vid.driveId.length < 20) {
                console.log(`⚠️ Skipping invalid Drive ID (likely YT ID): ${vid.driveId}`);
                continue;
            }

            const dest = `${TEMP_DIR}/raw_${i}.mp4`;
            console.log(`⬇️ Downloading ${vid.driveId}...`);
            try {
                await downloadFile(vid.driveId, dest);
                downloadedFiles.push(dest);
            } catch (e) {
                console.error(`❌ Failed to download ${vid.driveId}:`, e.message);
            }
        }

        if (downloadedFiles.length === 0) return;

        // Render
        const finalFile = await createCompilation(downloadedFiles);

        // Upload
        await uploadToYoutube(finalFile, downloadedFiles.length);

        // Cleanup
        console.log("🧹 Cleaning up...");
        if (fs.existsSync(OUTPUT_FILE)) fs.unlinkSync(OUTPUT_FILE);
        fs.rmSync(TEMP_DIR, { recursive: true, force: true });

    } catch (error) {
        console.error("🔥 Fatal Error:", error);
    }
}

run();