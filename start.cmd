@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Spy needs Node.js 22.12 or newer. Install Node.js LTS from https://nodejs.org and try again.
  pause
  exit /b 1
)
node scripts\launch.mjs
if errorlevel 1 pause
