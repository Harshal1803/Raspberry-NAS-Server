#!/bin/bash

# Start both Node.js server and Python AI service
echo "Starting NAS Server with Local AI Service..."

# Function to cleanup background processes
cleanup() {
    echo "Shutting down services..."
    kill $NODE_PID $PYTHON_PID 2>/dev/null
    exit
}

# Set trap to cleanup on script exit
trap cleanup EXIT INT TERM

# Start Python AI service in background
echo "Starting Python AI service on port 5001..."
python3 ai_service.py &
PYTHON_PID=$!

# Wait a moment for Python service to start
sleep 3

# Check if Python service is running
if curl -s http://localhost:5001/health > /dev/null; then
    echo "Python AI service started successfully"
else
    echo "Warning: Python AI service may not have started properly"
fi

# Start Node.js server in background
echo "Starting Node.js server on port 4002..."
npm start &
NODE_PID=$!

# Wait for Node.js server to start
sleep 3

# Check if Node.js server is running
if curl -s http://localhost:4002/ > /dev/null; then
    echo "Node.js server started successfully"
    echo ""
    echo "Services are running:"
    echo "- Node.js server: http://localhost:4002"
    echo "- Python AI service: http://localhost:5001"
    echo "- Demo chat interface: http://localhost:4002/demo_chat.html"
    echo ""
    echo "Press Ctrl+C to stop all services"
else
    echo "Error: Node.js server failed to start"
    cleanup
fi

# Wait for background processes
wait