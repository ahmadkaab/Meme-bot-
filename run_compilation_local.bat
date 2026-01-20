@echo off
echo ===================================================
echo 🎬 STARTING WEEKLY MEME COMPILATION (LOCAL MODE)
echo ===================================================

:: Ensure dependencies are installed
if not exist "node_modules" (
    echo 📦 Installing dependencies...
    call npm install
)

:: Run the script
echo 🚀 Running compilation script...
node compilation.js

echo.
echo ===================================================
echo ✅ DONE! Check your YouTube channel.
echo ===================================================
pause
