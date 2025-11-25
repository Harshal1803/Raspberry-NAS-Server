# AI Chatbot Demo for File Operations

This implementation provides a demonstration of an AI-powered chatbot that can understand natural language commands for file operations. It uses free AI models from Hugging Face to interpret user requests and simulate file management actions.

## Features

- Natural language processing for file operations
- Support for common commands like:
  - Listing files and directories
  - Creating folders
  - Counting files
  - Moving files
  - Deleting files and folders (with confirmation)
  - Searching for files
  - Filtering by file type
- Web-based chat interface
- RESTful API endpoints

## Architecture

The AI chatbot consists of:

1. **Natural Language Processing**: Uses Hugging Face's OpenAssistant model to interpret user commands
2. **Command Interpreter**: Converts natural language to structured JSON commands
3. **Action Simulator**: Simulates file operations without requiring actual file system access
4. **Web Interface**: Simple HTML/JavaScript frontend for testing
5. **REST API**: Backend endpoints for processing commands

## How It Works

1. User sends a natural language command (e.g., "Show me files in the documents folder")
2. The AI model interprets the command and converts it to a structured JSON action
3. The system simulates the requested operation and returns a response
4. Results are displayed to the user through the web interface or API response

## API Endpoints

### Demo Chat Endpoint
```
POST /ai-demo/demo-chat
```

**Request Body:**
```json
{
  "message": "Show me files in the root directory"
}
```

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Response:**
```json
{
  "response": "Files in root:",
  "action": {
    "action": "list",
    "path": ""
  },
  "files": [
    {
      "name": "document1.pdf",
      "type": "file",
      "size": "1.2 MB"
    },
    {
      "name": "photo1.jpg",
      "type": "file",
      "size": "3.4 MB"
    },
    {
      "name": "videos",
      "type": "folder",
      "size": "Folder"
    }
  ]
}
```

## Supported Commands

- "Show me files in [folder]"
- "Create a new folder called [name]"
- "How many files are in [folder]?"
- "List all [type] files" (where type is image, video, audio, document)
- "Move [file] to [folder]"
- "Delete [file/folder]" (requires confirmation)
- "Find files containing [keyword]"
- "List files from [date] to [date]"

## Setup and Testing

1. Ensure the NAS_SERVER is running:
   ```
   cd NAS_SERVER
   npm start
   ```

2. Access the web interface at:
   ```
   http://localhost:4002/demo_chat.html
   ```

3. For API testing, you can use the test script:
   ```
   node test_ai_demo.js
   ```

## Implementation Details

The demo implementation includes:

- `/routes/ai_demo.js`: Main route handler for AI chat functionality using rule-based natural language processing
- `/public/demo_chat.html`: Web interface for interacting with the chatbot
- `/test_ai_demo.js`: Script for testing API endpoints
- Rule-based command parser that understands natural language file operations

**Note**: Due to limitations with Hugging Face's inference provider availability, this demo uses a rule-based approach instead of AI models. This provides reliable, fast responses while still demonstrating the natural language processing capabilities for file operations.

## Note on Security

This is a demonstration implementation. In a production environment, you would need to:

1. Implement proper authentication and authorization
2. Add rate limiting to prevent abuse of free AI APIs
3. Validate all inputs to prevent injection attacks
4. Add proper error handling and logging
5. Implement actual file system operations (rather than simulation)

## Future Enhancements

1. Integration with actual file systems (NAS/SMB shares)
2. Support for more complex file operations
3. Enhanced natural language understanding
4. Multi-user support with permission controls
5. Persistent chat history
6. File previews and metadata display