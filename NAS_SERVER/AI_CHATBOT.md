# NAS AI Chatbot Documentation

## Overview
The NAS AI Chatbot is an intelligent file management assistant that understands natural language commands to perform file operations on your NAS system. It leverages Hugging Face's inference API to interpret user requests and execute appropriate file operations.

## Features
- Natural language processing for file operations
- File listing with various filters
- Folder creation
- File and folder deletion with confirmation
- File counting
- File search capabilities
- File movement and renaming
- Image file identification
- Date-based file filtering

## Supported Commands

### File Listing
- "Show me files in the root directory"
- "List all files in documents"
- "What's in this folder?"

### Folder Management
- "Create a new folder called photos"
- "Make a directory named backups"

### File Counting
- "How many files are in documents?"
- "Count the files in the root directory"

### File Search
- "Find files containing 'report'"
- "Search for documents with 'budget'"

### File/Folder Deletion
- "Delete the old_backup folder"
- "Remove the temp file"
- Note: Delete operations require confirmation for safety

### File Movement
- "Move report.pdf to archive"
- "Rename file.txt to document.txt"

### Image Files
- "Show me all image files"
- "Find images from January 2025"

### Date-based Operations
- "List files from January 2025"
- "Show files between 2025-01-01 and 2025-01-31"

## API Endpoints

### POST /ai/chat
Main endpoint for natural language file operations.

**Request Body:**
```json
{
  "message": "Show me files in the root directory",
  "confirmDelete": false  // Optional, set to true to confirm delete operations
}
```

**Response:**
```json
{
  "response": "Files in root:",
  "action": {
    "action": "list",
    "path": ""
  },
  "files": ["file1.txt", "file2.pdf", "folder1"]
}
```

### POST /ai/summarize
Summarize text-based files (PDF, TXT).

**Request Body:**
```json
{
  "filePath": "path/to/document.pdf"
}
```

**Response:**
```json
{
  "summary": "This document contains..."
}
```

### POST /ai/analyze-image
Analyze images using AI vision models.

**Request Body:**
```json
{
  "imageUrl": "http://example.com/image.jpg"
}
```

**Response:**
```json
{
  "description": "Detailed description of the image..."
}
```

## Integration with File Operations

The AI chatbot integrates with the existing file operation endpoints in `/routes/files.js`:

- GET /files/list - List files in a directory
- POST /files/create-folder - Create a new folder
- POST /files/move - Move files or folders
- GET /files/count - Count files in a directory
- And more...

## Safety Features

1. **Delete Confirmation**: All delete operations require explicit confirmation
2. **Natural Language Understanding**: Only executes commands that are clearly understood
3. **Error Handling**: Graceful error handling with informative messages

## Implementation Details

The AI chatbot uses the Hugging Face inference API with the `OpenAssistant/oasst-sft-4-pythia-12b-epoch-3.5` model for natural language understanding. The system parses user requests and maps them to specific file operations.

### Adding New Operations

To add new file operations:
1. Add the operation to the prompt in `/routes/ai.js`
2. Implement the operation in the switch statement
3. Ensure proper error handling
4. Test the new functionality

## Testing

Run the test scripts to verify functionality:
- `node test_ai.js` - Basic functionality tests
- `node comprehensive_test.js` - Complete functionality tests

## Frontend Interface

A simple HTML interface is available at `/chat.html` for testing and interacting with the AI chatbot.

## Environment Variables

Ensure the following environment variables are set in `.env`:
- `HF_TOKEN` - Hugging Face API token
- `JWT_SECRET` - JWT secret for authentication