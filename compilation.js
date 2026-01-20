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

async function concatParts(parts, output) {
    console.log(`🔗 Merging ${parts.length} chunks into final movie...`);
    const listFile = `${TEMP_DIR}/parts_list.txt`;
    const fileLines = parts.map(p => `file '${path.basename(p)}'`).join('\n');
    fs.writeFileSync(listFile, fileLines);

    await new Promise((resolve, reject) => {
        ffmpeg()
            .input(listFile)
            .inputOptions(['-f concat', '-safe 0'])
            .outputOptions('-c copy') // Fast copy for pre-processed parts
            .save(output)
            .on('end', resolve)
            .on('error', reject);
    });
}

async function createCompilationChunk(videoFiles, outputFilename) {
    console.log(`🎬 Processing chunk of ${videoFiles.length} videos -> ${outputFilename}...`);
    
    const processedClips = [];
    
    for (let i = 0; i < videoFiles.length; i++) {
        const input = videoFiles[i];
        const output = `${input}_processed.ts`; 
        
        await new Promise((resolve, reject) => {
            ffmpeg(input)
                .complexFilter([
                    `[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2[v]`
                ], 'v')
                .outputOptions([
                    '-c:v libx264',
                    '-preset ultrafast', 
                    '-bsf:v h264_mp4toannexb',
                    '-f mpegts'
                ])
                .save(output)
                .on('end', resolve)
                .on('error', reject);
        });
        processedClips.push(`file '${path.basename(output)}'`);
    }

    // Merge this small chunk
    const listFile = `${TEMP_DIR}/${path.basename(outputFilename)}_list.txt`;
    fs.writeFileSync(listFile, processedClips.join('\n'));
    
    await new Promise((resolve, reject) => {
        ffmpeg()
            .input(listFile)
            .inputOptions(['-f concat', '-safe 0'])
            // Re-encode chunk to ensure stability
            .outputOptions([
                '-c:v libx264',
                '-preset ultrafast',
                '-c:a aac'
            ])
            .save(outputFilename)
            .on('end', resolve)
            .on('error', reject);
    });
    
    return outputFilename;
}

async function run() {
    try {
        if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);

        const db = getDb();
        console.log("🔍 DEBUG: DB History Length:", db.history ? db.history.length : "Undefined");
        
        // Allow even small compilations for testing if we have at least 2 videos
        if (!db.history || db.history.length < 2) { 
            console.log("⚠️ Not enough history for a compilation yet.");
            return;
        }

        const recentVideos = db.history.slice(-12); // Take up to 12
        console.log(`📦 Found ${recentVideos.length} videos for compilation.`);

        const downloadedFiles = [];
        for (let i = 0; i < recentVideos.length; i++) {
            const vid = recentVideos[i];
            if (vid.driveId.length < 20) continue; 

            const dest = `${TEMP_DIR}/raw_${i}.mp4`;
            console.log(`⬇️ Downloading ${vid.driveId}...`);
            try {
                await downloadFile(vid.driveId, dest);
                downloadedFiles.push(dest);
            } catch (e) {
                console.error(`❌ Failed:`, e.message);
            }
        }

        if (downloadedFiles.length === 0) return;

        // --- CHUNKING STRATEGY ---
        const CHUNK_SIZE = 3;
        const chunkFiles = [];
        
        for (let i = 0; i < downloadedFiles.length; i += CHUNK_SIZE) {
            const chunk = downloadedFiles.slice(i, i + CHUNK_SIZE);
            const chunkOutput = `${TEMP_DIR}/part_${i/CHUNK_SIZE}.mp4`;
            
            try {
                await createCompilationChunk(chunk, chunkOutput);
                chunkFiles.push(chunkOutput);
            } catch (err) {
                console.error(`❌ Chunk failed:`, err);
            }
        }

        if (chunkFiles.length === 0) throw new Error("No chunks created.");

        // Final Merge
        const finalFile = OUTPUT_FILE;
        await concatParts(chunkFiles, finalFile);

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