@echo off
echo Starting NAS Server with Local AI Service...

REM Start Python AI service in background
echo Starting Python AI service on port 5001...
start /B python ai_service.py

REM Wait for Python service to start
timeout /t 3 /nobreak > nul

REM Check if Python service is running
curl -s http://localhost:5001/health > nul 2>&1
if %errorlevel% equ 0 (
    echo Python AI service started successfully
) else (
    echo Warning: Python AI service may not have started properly
)

REM Start Node.js server in background
echo Starting Node.js server on port 4002...
start /B npm start

REM Wait for Node.js server to start
timeout /t 3 /nobreak > nul

REM Check if Node.js server is running
curl -s http://localhost:4002/ > nul 2>&1
if %errorlevel% equ 0 (
    echo Node.js server started successfully
    echo.
    echo Services are running:
    echo - Node.js server: http://localhost:4002
    echo - Python AI service: http://localhost:5001
    echo - Demo chat interface: http://localhost:4002/demo_chat.html
    echo.
    echo Press Ctrl+C to stop all services
    pause
) else (
    echo Error: Node.js server failed to start
)

REM Cleanup when script ends
taskkill /f /im python.exe > nul 2>&1
taskkill /f /im node.exe > nul 2>&1