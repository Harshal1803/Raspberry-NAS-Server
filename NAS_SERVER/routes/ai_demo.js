import express from "express";
import jwt from "jsonwebtoken";
import { InferenceClient } from "@huggingface/inference";

const router = express.Router();

// Middleware to verify JWT
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: "No token provided" });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
};

/*
POST /ai/demo-chat
body: { message }
Headers: Authorization: Bearer <token>
*/
router.post("/demo-chat", authenticate, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: "message required" });
    }

    console.log("Processing demo chat message:", message);

    // Create prompt for AI
    const prompt = `You are a file system assistant for NAS operations. Parse the user's command and respond with ONLY a valid JSON object. Do not include any text before or after the JSON. No explanations, no examples.

Supported actions for file operations:
- move: {"action": "move", "source": "path/to/file", "destination": "path/to/destination"}
- list: {"action": "list", "path": "folder/path"} (use "" for root)
- find_images: {"action": "find_images", "date": "YYYY-MM-DD"} (use "" for all dates)
- create_folder: {"action": "create_folder", "path": "folder/path"}
- delete_file: {"action": "delete_file", "path": "path/to/file"}
- delete_folder: {"action": "delete_folder", "path": "path/to/folder"}
- list_by_type: {"action": "list_by_type", "path": "folder/path", "type": "image|video|audio|document|other"} (use "" for root)
- list_by_date_range: {"action": "list_by_date_range", "path": "folder/path", "start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD"} (use "" for root)
- search_files: {"action": "search_files", "query": "keyword", "path": "folder/path"} (use "" for root)
- count_files: {"action": "count_files", "path": "folder/path"} (use "" for root)

Interpret user commands intelligently:
- "show me files" -> list action
- "what's in this folder" -> list action
- "make a new folder called photos" -> create_folder action with path "photos"
- "how many files are in documents" -> count_files action with path "documents"
- "remove the old backup" -> delete_file or delete_folder action depending on context
- "move report.pdf to archive" -> move action with source "report.pdf" and destination "archive/report.pdf"

If the user asks about non-file topics (like greetings, questions, facts, jokes, etc.), respond naturally with: {"action": "message", "text": "your short helpful response"}

If unsure about a file command, respond with: {"action": "message", "text": "Unable to determine command"}

Never output destructive commands (delete) without explicit user confirmation.
For delete operations, first ask for confirmation by responding with: {"action": "message", "text": "Are you sure you want to delete [path]? This action cannot be undone. Type 'yes' to confirm."}

User command: "${message}"

JSON response:`;

    console.log("Processing with rule-based parser:", message);

    // Simple rule-based command parser
    let actionData;

    const lowerMessage = message.toLowerCase().trim();

    // Greeting detection
    if (lowerMessage.match(/^(hi|hello|hey|greetings|good morning|good afternoon|good evening)/)) {
      actionData = { action: "message", text: "Hello! I'm your AI file assistant. How can I help you with your files today?" };
    }
    // List files commands
    else if (lowerMessage.match(/(show|list|display).*(files?|contents?|what's in)/) ||
             lowerMessage.match(/(what's|what is).*(in|inside)/) ||
             lowerMessage.includes("list files")) {
      const pathMatch = lowerMessage.match(/(?:in|from|of)\s+([^\s]+)/);
      const path = pathMatch ? pathMatch[1] : "";
      actionData = { action: "list", path: path === "root" ? "" : path };
    }
    // Count files commands
    else if (lowerMessage.match(/(how many|count).*(files?|items)/) ||
             lowerMessage.includes("file count")) {
      const pathMatch = lowerMessage.match(/(?:in|from|of)\s+([^\s]+)/);
      const path = pathMatch ? pathMatch[1] : "";
      actionData = { action: "count_files", path: path === "root" ? "" : path };
    }
    // Create folder commands
    else if (lowerMessage.match(/(create|make|new).*(folder|directory)/) ||
             lowerMessage.includes("create folder")) {
      const folderMatch = lowerMessage.match(/(?:called|named|folder|directory)\s+([^\s]+)/);
      const path = folderMatch ? folderMatch[1] : "new_folder";
      actionData = { action: "create_folder", path };
    }
    // Delete commands (with confirmation)
    else if (lowerMessage.match(/(delete|remove|erase).*(file|folder)/) ||
             lowerMessage.includes("delete")) {
      const pathMatch = lowerMessage.match(/(?:file|folder)\s+([^\s]+)/);
      const path = pathMatch ? pathMatch[1] : "";
      if (lowerMessage.includes("folder") || lowerMessage.includes("directory")) {
        actionData = { action: "delete_folder", path };
      } else {
        actionData = { action: "delete_file", path };
      }
    }
    // Move commands
    else if (lowerMessage.match(/(move|transfer).*(to|into)/)) {
      const moveMatch = lowerMessage.match(/move\s+([^\s]+).*to\s+([^\s]+)/);
      if (moveMatch) {
        actionData = {
          action: "move",
          source: moveMatch[1],
          destination: moveMatch[2]
        };
      } else {
        actionData = { action: "message", text: "Please specify what to move and where to move it to." };
      }
    }
    // Search commands
    else if (lowerMessage.match(/(find|search|look for)/)) {
      const searchMatch = lowerMessage.match(/(?:for|containing)\s+([^\s]+)/);
      const query = searchMatch ? searchMatch[1] : "";
      actionData = { action: "search_files", query, path: "" };
    }
    // List by type commands
    else if (lowerMessage.match(/(show|list).*(images?|videos?|audios?|documents?)/)) {
      let type = "other";
      if (lowerMessage.includes("image")) type = "image";
      else if (lowerMessage.includes("video")) type = "video";
      else if (lowerMessage.includes("audio")) type = "audio";
      else if (lowerMessage.includes("document")) type = "document";
      actionData = { action: "list_by_type", path: "", type };
    }
    // Default fallback
    else {
      actionData = {
        action: "message",
        text: "I'm not sure what you mean. Try commands like: 'show me files', 'create a folder called photos', 'how many files are in documents', or 'delete old_backup.txt'"
      };
    }

    console.log("Parsed action:", actionData);

    // Simulate results for demonstration
    let result;
    switch (actionData.action) {
      case "list":
        // Simulate file listing
        const files = [
          { name: "document1.pdf", type: "file", size: "1.2 MB" },
          { name: "photo1.jpg", type: "file", size: "3.4 MB" },
          { name: "videos", type: "folder", size: "Folder" },
          { name: "reports", type: "folder", size: "Folder" }
        ];
        result = { 
          message: `Files in ${actionData.path || "root"}:`, 
          files: files 
        };
        break;
        
      case "count_files":
        // Simulate file count
        result = { 
          message: `Found 15 files in ${actionData.path || "root"}` 
        };
        break;
        
      case "create_folder":
        // Simulate folder creation
        result = { 
          message: `Successfully created folder ${actionData.path}` 
        };
        break;
        
      case "message":
        result = { message: actionData.text };
        break;
        
      default:
        // For other actions, just acknowledge
        result = { 
          message: `Understood request to ${actionData.action}. In a real implementation, this would connect to your NAS and perform the operation.` 
        };
    }

    const responseObj = { response: result.message, action: actionData };
    if (result.files) {
      responseObj.files = result.files;
    }
    
    res.json(responseObj);
  } catch (err) {
    console.error("Error in /ai/demo-chat:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
});

export default router;