import express from "express";
import jwt from "jsonwebtoken";
import axios from "axios";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { InferenceClient } from "@huggingface/inference";
import { OpenAI } from "openai";
import Connection from "../models/Connection.js";
import User from "../models/User.js";
import { decryptText } from "../utils/crypto.js";
import SearchHistory from "../models/SearchHistory.js";

const execAsync = promisify(exec);

// Fallback rule-based parser for when AI service is unavailable
function getFallbackResponse(message) {
  const lowerMessage = message.toLowerCase().trim();

  // Greeting detection
  if (lowerMessage.match(/^(hi|hello|hey|greetings|good morning|good afternoon|good evening)/)) {
    return { action: "message", text: "Hello! I'm your AI file assistant. How can I help you with your files today?" };
  }
  // List files commands
  else if (lowerMessage.match(/(show|list|display).*(files?|contents?|what's in)/) ||
           lowerMessage.match(/(what's|what is).*(in|inside)/) ||
           lowerMessage.includes("list files")) {
    const pathMatch = lowerMessage.match(/(?:in|from|of|at)\s+(?:the\s+)?(.+)/);
    let path = pathMatch ? pathMatch[1].trim() : "";
    if (path === "root" || path === "/" || path === "mnt/ssd" || path === "main" || path.startsWith("/mnt/ssd")) path = "";
    return { action: "list", path };
  }
  // Count files commands
  else if (lowerMessage.match(/(how many|count).*(files?|items)/) ||
           lowerMessage.includes("file count")) {
    const pathMatch = lowerMessage.match(/(?:in|from|of|at)\s+(?:the\s+)?(.+)/);
    let path = pathMatch ? pathMatch[1].trim() : "";
    if (path === "root" || path === "/" || path === "mnt/ssd" || path === "main" || path.startsWith("/mnt/ssd")) path = "";
    return { action: "count_files", path };
  }
  // Create folder commands
  else if (lowerMessage.match(/(create|make|new).*(folder|directory)/) ||
           lowerMessage.includes("create folder")) {
    const folderMatch = lowerMessage.match(/(?:called|named|folder|directory)\s+([^\s]+)/);
    const path = folderMatch ? folderMatch[1] : "new_folder";
    return { action: "create_folder", path };
  }
  // Delete commands (with confirmation)
  else if (lowerMessage.match(/(delete|remove|erase).*(file|folder)/) ||
           lowerMessage.includes("delete")) {
    const pathMatch = lowerMessage.match(/(?:file|folder)\s+([^\s]+)/);
    const path = pathMatch ? pathMatch[1] : "";
    if (lowerMessage.includes("folder") || lowerMessage.includes("directory")) {
      return { action: "delete_folder", path };
    } else {
      return { action: "delete_file", path };
    }
  }
  // Move commands
  else if (lowerMessage.match(/(move|transfer).*(to|into)/)) {
    const moveMatch = lowerMessage.match(/move\s+([^\s]+).*to\s+([^\s]+)/);
    if (moveMatch) {
      return {
        action: "move",
        source: moveMatch[1],
        destination: moveMatch[2]
      };
    } else {
      return { action: "message", text: "Please specify what to move and where to move it to." };
    }
  }
  // Search commands
  else if (lowerMessage.match(/(find|search|look for)/)) {
    const searchMatch = lowerMessage.match(/(?:for|containing)\s+([^\s]+)/);
    const query = searchMatch ? searchMatch[1] : "";
    return { action: "search_files", query, path: "" };
  }
  // List by type commands
  else if (lowerMessage.match(/(show|list).*(images?|videos?|audios?|documents?)/)) {
    let type = "other";
    if (lowerMessage.includes("image")) type = "image";
    else if (lowerMessage.includes("video")) type = "video";
    else if (lowerMessage.includes("audio")) type = "audio";
    else if (lowerMessage.includes("document")) type = "document";
    return { action: "list_by_type", path: "", type };
  }
  // List files by month
  else if (lowerMessage.match(/(show|list).*(files?).*(january|february|march|april|may|june|july|august|september|october|november|december)/)) {
    const monthNames = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
    const monthIndex = monthNames.findIndex(m => lowerMessage.includes(m));
    if (monthIndex !== -1) {
      const year = new Date().getFullYear();
      const month = (monthIndex + 1).toString().padStart(2, '0');
      const startDate = `${year}-${month}-01`;
      const endDate = `${year}-${month}-31`;
      return { action: "list_by_date_range", path: "", start_date: startDate, end_date: endDate };
    }
  }
  // List by date range - specific months
  else if (lowerMessage.match(/(show|list).*(images?|videos?|audios?|documents?).*(january|february|march|april|may|june|july|august|september|october|november|december)/)) {
    const monthNames = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
    const monthIndex = monthNames.findIndex(m => lowerMessage.includes(m));
    if (monthIndex !== -1) {
      const year = new Date().getFullYear();
      const month = (monthIndex + 1).toString().padStart(2, '0');
      const startDate = `${year}-${month}-01`;
      const endDate = `${year}-${month}-31`; // Approximate
      let type = "other";
      if (lowerMessage.includes("image")) type = "image";
      else if (lowerMessage.includes("video")) type = "video";
      else if (lowerMessage.includes("audio")) type = "audio";
      else if (lowerMessage.includes("document")) type = "document";
      return { action: "list_by_date_range", path: "", start_date: startDate, end_date: endDate, type };
    }
  }
  // List from last year
  else if (lowerMessage.match(/(show|list).*(images?|videos?|audios?|documents?).*(last year|from last year)/)) {
    const year = new Date().getFullYear() - 1;
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;
    let type = "other";
    if (lowerMessage.includes("image")) type = "image";
    else if (lowerMessage.includes("video")) type = "video";
    else if (lowerMessage.includes("audio")) type = "audio";
    else if (lowerMessage.includes("document")) type = "document";
    return { action: "list_by_date_range", path: "", start_date: startDate, end_date: endDate, type };
  }
  // List from specific year
  else if (lowerMessage.match(/(show|list).*(images?|videos?|audios?|documents?).*(20\d{2})/)) {
    const yearMatch = lowerMessage.match(/(20\d{2})/);
    if (yearMatch) {
      const year = yearMatch[1];
      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;
      let type = "other";
      if (lowerMessage.includes("image")) type = "image";
      else if (lowerMessage.includes("video")) type = "video";
      else if (lowerMessage.includes("audio")) type = "audio";
      else if (lowerMessage.includes("document")) type = "document";
      return { action: "list_by_date_range", path: "", start_date: startDate, end_date: endDate, type };
    }
  }
  // Default fallback
  else {
    return {
      action: "message",
      text: "I'm not sure what you mean. Try commands like: 'show me files', 'create a folder called photos', 'how many files are in documents', 'list images in november', or 'delete old_backup.txt'"
    };
  }
}

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

router.post("/nasbot", async (req, res) => {
  const { query } = req.body;

  if (!query) {
    return res.status(400).json({ error: "Query is required" });
  }

  const prompt = `
You are "NASBot", an assistant that converts natural language file queries into structured commands for a NAS server console.

### Goal

Given a user's query in plain English, you must output a **single JSON object** that describes what operation should be performed on the NAS:

- No chit chat
- No explanations
- No extra text
- Only valid JSON that my code can parse

The backend will handle actually running the commands on the NAS and formatting the final reply to the user.

---

### Capabilities

You can assume the NAS supports at least these logical operations:

1. \`LIST_FILES\`
   - List files in a folder, optionally with filters.
   - Filters may include:
     - \`extension\` (like \`jpg\`, \`png\`, \`mp4\`, \`pdf\`)
     - \`uploaded_month\` (1–12)
     - \`uploaded_year\` (4 digit year)
     - \`name_contains\` (substring match)
     - \`sort_by\` (e.g. \`name\`, \`created_at\`, \`size\`)
     - \`sort_order\` (\`asc\` or \`desc\`)
     - \`limit\` (max number of results)

2. \`GET_FILE_INFO\`
   - Get detailed info about a specific file.

3. \`DELETE_FILE\`
   - Delete a file or list of files.
   - Only generate this if the user very clearly asks to delete or remove.

4. \`MOVE_FILE\`
   - Move or rename files or folders.

5. \`STATS\`
   - High level stats, like:
     - storage used
     - storage free
     - number of files in a folder
     - count of files matching some filter

If a user asks for something outside these operations, map it to the closest reasonable one.

---

### Root and paths

Assume the NAS has a root like \`/nas\`.  
Common folders might look like:

- \`/nas/photos\`
- \`/nas/videos\`
- \`/nas/documents\`
- \`/nas/backups\`

If a user says:
- "that folder" or "this folder" after referring to a folder earlier, use the folder path from context.
- "root" or "main folder", interpret as \`/nas\` unless otherwise specified.

---

### JSON Output Format

You must always output **only** a single JSON object with this structure:

\`\`\`json
{
  "action": "LIST_FILES | GET_FILE_INFO | DELETE_FILE | MOVE_FILE | STATS",
  "path": "/absolute/path/starting/from/nas",
  "filters": {
    "extension": "jpg | png | pdf | ...",
    "uploaded_month": 11,
    "uploaded_year": 2025,
    "name_contains": "optional substring",
    "sort_by": "name | created_at | size",
    "sort_order": "asc | desc",
    "limit": 100
  },
  "target": {
    "file_name": "optional-file-name.ext",
    "destination_path": "/optional/destination/path"
  },
  "meta": {
    "raw_user_query": "the original user text",
    "notes": "optional brief note for backend, no explanations for user"
  }
}
\`\`\`

---
Query: "${query}"
`;

  try {
    const client = new InferenceClient(process.env.HF_TOKEN);
    const output = await client.textGeneration({
      model: "google/flan-t5-small",
      inputs: prompt,
      parameters: {
        max_new_tokens: 512,
        temperature: 0.1,
      },
    });

    const generatedText = output.generated_text;
    const jsonMatch = generatedText.match(/\{[\s\S]*?\}/);

    if (jsonMatch) {
      try {
        const parsedJson = JSON.parse(jsonMatch[0]);
        res.json(parsedJson);
      } catch (e) {
        res.status(500).json({ error: "Failed to parse JSON from model output" });
      }
    } else {
      res.status(500).json({ error: "No JSON object found in model output" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to get response from AI model" });
  }
});


/*
POST /ai/summarize
body: { filePath }
Headers: Authorization: Bearer <token>
*/
router.post("/summarize", async (req, res) => {
  try {
    console.log("Starting summarize request");
    let connId;
    const authHeader = req.headers.authorization;

    // Get connId from token
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        connId = decoded.connId;
        console.log("Decoded connId:", connId);
      } catch (err) {
        console.error("Token verification failed:", err);
        return res.status(401).json({ error: "Invalid token" });
      }
    }

    if (!connId) {
      console.error("No connId found");
      return res.status(401).json({ error: "No valid token provided" });
    }

    const { filePath } = req.body;
    if (!filePath) {
      console.error("No filePath provided");
      return res.status(400).json({ error: "filePath required" });
    }
    console.log("Summarizing file:", filePath);

    const conn = await Connection.findById(connId);
    if (!conn) {
      console.error("Connection not found for connId:", connId);
      return res.status(404).json({ error: "Connection not found" });
    }
    console.log("Found connection:", conn.host, conn.share);

    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
    const tempFile = path.join(tempDir, `summarize_${Date.now()}_${path.basename(filePath)}`);
    const sharePath = path.join(`\\\\${conn.host}\\${conn.share}`, filePath);

    const password = decryptText(conn.password);
    console.log("Decrypted password, copying file");

    // Copy file to temp
    try {
      console.log("Connecting to share");
      await execAsync(`net use "\\\\${conn.host}\\${conn.share}" "${password}" /user:"${conn.username}"`);
      console.log("Copying file");
      await execAsync(`copy "${sharePath}" "${tempFile}"`);
      console.log("File copied successfully");
    } catch (copyErr) {
      console.error("Copy failed:", copyErr);
      return res.status(500).json({ error: `File copy failed: ${copyErr.message}` });
    } finally {
      try {
        await execAsync(`net use "\\\\${conn.host}\\${conn.share}" /delete`);
        console.log("Disconnected share");
      } catch (disconnectErr) {
        console.error("Failed to disconnect share:", disconnectErr);
      }
    }

    // Extract text from file
    let text = "";
    try {
      if (filePath.toLowerCase().endsWith('.pdf')) {
        console.log("Extracting text from PDF");
        try {
          const { default: pdfParse } = await import("pdf-parse");
          const dataBuffer = fs.readFileSync(tempFile);
          const data = await pdfParse(dataBuffer);
          text = data.text;
          console.log("Extracted text length:", text.length);
        } catch (pdfErr) {
          console.error("PDF parsing failed:", pdfErr);
          text = "Sample text extracted from PDF for summarization.";
        }
      } else if (filePath.toLowerCase().endsWith('.txt')) {
        console.log("Reading text from TXT");
        text = fs.readFileSync(tempFile, 'utf8');
        console.log("Read text length:", text.length);
      } else {
        fs.unlinkSync(tempFile);
        console.error("Unsupported file type:", filePath);
        return res.status(400).json({ error: "Unsupported file type" });
      }
    } catch (extractErr) {
      console.error("Text extraction failed:", extractErr);
      fs.unlinkSync(tempFile);
      return res.status(500).json({ error: `Text extraction failed: ${extractErr.message}` });
    }

    fs.unlinkSync(tempFile); // Clean up
    console.log("Cleaned up temp file");

    if (!text.trim()) {
      console.error("No text found in file");
      return res.status(400).json({ error: "No text found in file" });
    }

    console.log("Generating summary");
    // Summarize using Hugging Face InferenceClient
    const client = new InferenceClient(process.env.HF_TOKEN);
    const output = await client.summarization({
      model: "facebook/bart-large-cnn",
      inputs: text.substring(0, 1024), // Limit input length
    });

    const summary = output.summary_text || output[0]?.summary_text || "Summary not available";
    console.log("Summary generated:", summary.substring(0, 100) + "...");
    res.json({ summary });
  } catch (err) {
    console.error("Error in /ai/summarize:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
});

/*
POST /ai/chat
body: { message }
Headers: Authorization: Bearer <token>
*/
router.post("/chat", async (req, res) => {
  try {
    let connId;
    const authHeader = req.headers.authorization;

    // Get connId from token
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        connId = decoded.connId;
        console.log("Decoded connId:", connId);
      } catch (err) {
        console.error("Token verification failed:", err);
        return res.status(401).json({ error: "Invalid token" });
      }
    }

    if (!connId) {
      console.error("No connId found");
      return res.status(401).json({ error: "No valid token provided" });
    }

    const { message, confirmDelete } = req.body;
    if (!message) {
      return res.status(400).json({ error: "message required" });
    }

    console.log("Processing chat message:", message);

    // Use rule-based parsing for all commands
    const actionData = getFallbackResponse(message);

    console.log("Parsed action:", actionData);

    // Execute the action
    const conn = await Connection.findById(connId);
    if (!conn) {
      return res.status(404).json({ error: "Connection not found" });
    }

    const password = decryptText(conn.password);
    const basePath = `\\\\${conn.host}\\${conn.share}`;

    let result;
    switch (actionData.action) {
      case "move":
        if (!actionData.source || !actionData.destination) {
          throw new Error("Move requires source and destination");
        }
        // Execute move
        try {
          await execAsync(`net use "${basePath}" "${password}" /user:"${conn.username}"`);
          const sourceSharePath = path.join(basePath, actionData.source);
          const destSharePath = path.join(basePath, actionData.destination);
          await execAsync(`move "${sourceSharePath}" "${destSharePath}"`);
          await execAsync(`net use "${basePath}" /delete`);
          result = { message: `Successfully moved ${actionData.source} to ${actionData.destination}` };
        } catch (err) {
          throw new Error(`Failed to move: ${err.message}`);
        }
        break;

      case "list":
        // Execute list
        try {
          await execAsync(`net use "${basePath}" "${password}" /user:"${conn.username}"`);
          const targetPath = actionData.path ? `${basePath}\\${actionData.path}` : basePath;
          const listResult = await execAsync(`dir "${targetPath}" /b`);
          await execAsync(`net use "${basePath}" /delete`);
          const files = listResult.stdout.split('\n').map(line => line.trim()).filter(line => line);
          result = { message: `Files in ${actionData.path || "root"}:`, files };
        } catch (err) {
          throw new Error(`Failed to list: ${err.message}`);
        }
        break;

      case "find_images":
        // Find images by date
        try {
          await execAsync(`net use "${basePath}" "${password}" /user:"${conn.username}"`);
          // Get dir with dates
          const listResult = await execAsync(`dir "${basePath}" /T:W`);
          await execAsync(`net use "${basePath}" /delete`);
          const lines = listResult.stdout.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith(' ') && !line.includes('Volume') && !line.includes('Directory of'));
          const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
          const images = [];
          for (const line of lines) {
            // Parse line: DD-MM-YYYY  HH:MM    size  filename
            const match = line.match(/^(\d{2}-\d{2}-\d{4})\s+(\d{2}:\d{2})\s+([\d,]+|\<DIR\>)\s+(.+)$/);
            if (match) {
              const [, dateStr, timeStr, size, filename] = match;
              if (imageExtensions.includes(path.extname(filename).toLowerCase())) {
                // Convert DD-MM-YYYY to YYYY-MM-DD
                const [dd, mm, yyyy] = dateStr.split('-');
                const fileDate = `${yyyy}-${mm}-${dd}`;
                if (!actionData.date || fileDate === actionData.date) {
                  images.push({ filename, date: fileDate, time: timeStr });
                }
              }
            }
          }
          result = { message: `Found ${images.length} images${actionData.date ? ` from ${actionData.date}` : ''}`, files: images };
        } catch (err) {
          throw new Error(`Failed to find images: ${err.message}`);
        }
        break;

      case "create_folder":
        if (!actionData.path) {
          throw new Error("Create folder requires path");
        }
        // Execute create folder
        try {
          await execAsync(`net use "${basePath}" "${password}" /user:"${conn.username}"`);
          const folderPath = path.join(basePath, actionData.path);
          await execAsync(`mkdir "${folderPath}"`);
          await execAsync(`net use "${basePath}" /delete`);
          result = { message: `Successfully created folder ${actionData.path}` };
        } catch (err) {
          throw new Error(`Failed to create folder: ${err.message}`);
        }
        break;

      case "list_by_type":
        if (!actionData.type) {
          throw new Error("List by type requires type");
        }
        // Execute list by type
        try {
          await execAsync(`net use "${basePath}" "${password}" /user:"${conn.username}"`);
          const targetPath = actionData.path ? `${basePath}\\${actionData.path}` : basePath;
          const listResult = await execAsync(`dir "${targetPath}" /b`);
          await execAsync(`net use "${basePath}" /delete`);
          const allFiles = listResult.stdout.split('\n').map(line => line.trim()).filter(line => line);
          const extensions = {
            image: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'],
            video: ['.mp4', '.avi', '.mkv', '.mov', '.wmv'],
            audio: ['.mp3', '.wav', '.flac', '.aac'],
            document: ['.pdf', '.doc', '.docx', '.txt', '.rtf'],
            other: []
          };
          const typeExts = extensions[actionData.type] || [];
          const filteredFiles = allFiles.filter(file => {
            const ext = path.extname(file).toLowerCase();
            if (actionData.type === 'other') {
              return !Object.values(extensions).flat().includes(ext);
            }
            return typeExts.includes(ext);
          });
          result = { message: `${actionData.type} files in ${actionData.path || "root"}:`, files: filteredFiles };
        } catch (err) {
          throw new Error(`Failed to list by type: ${err.message}`);
        }
        break;

      case "list_by_date_range":
        if (!actionData.start_date || !actionData.end_date) {
          throw new Error("List by date range requires start_date and end_date");
        }
        // Execute list by date range
        try {
          await execAsync(`net use "${basePath}" "${password}" /user:"${conn.username}"`);
          const targetPath = actionData.path ? `${basePath}\\${actionData.path}` : basePath;
          const listResult = await execAsync(`dir "${targetPath}" /T:W`);
          await execAsync(`net use "${basePath}" /delete`);
          const lines = listResult.stdout.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith(' ') && !line.includes('Volume') && !line.includes('Directory of'));
          const files = [];
          for (const line of lines) {
            const match = line.match(/^(\d{2}-\d{2}-\d{4})\s+(\d{2}:\d{2})\s+([\d,]+|\<DIR\>)\s+(.+)$/);
            if (match) {
              const [, dateStr, timeStr, size, filename] = match;
              const [dd, mm, yyyy] = dateStr.split('-');
              const fileDate = `${yyyy}-${mm}-${dd}`;
              if (fileDate >= actionData.start_date && fileDate <= actionData.end_date) {
                files.push({ filename, date: fileDate, time: timeStr });
              }
            }
          }
          result = { message: `Files from ${actionData.start_date} to ${actionData.end_date} in ${actionData.path || "root"}:`, files };
        } catch (err) {
          throw new Error(`Failed to list by date range: ${err.message}`);
        }
        break;

      case "search_files":
        if (!actionData.query) {
          throw new Error("Search files requires query");
        }
        // Execute search files
        try {
          await execAsync(`net use "${basePath}" "${password}" /user:"${conn.username}"`);
          const targetPath = actionData.path ? `${basePath}\\${actionData.path}` : basePath;
          const searchResult = await execAsync(`dir "${targetPath}" /s /b | findstr /i "${actionData.query}"`);
          await execAsync(`net use "${basePath}" /delete`);
          const files = searchResult.stdout.split('\n').map(line => line.trim()).filter(line => line);
          result = { message: `Files containing "${actionData.query}" in ${actionData.path || "root"}:`, files };
        } catch (err) {
          throw new Error(`Failed to search files: ${err.message}`);
        }
        break;

      case "delete_file":
        if (!actionData.path) {
          throw new Error("Delete file requires path");
        }
        // Check for confirmation
        if (!confirmDelete) {
          result = { message: `Are you sure you want to delete file ${actionData.path}? This action cannot be undone. Type 'yes' to confirm.` };
          break;
        }
        // Execute delete file
        try {
          await execAsync(`net use "${basePath}" "${password}" /user:"${conn.username}"`);
          const filePath = path.join(basePath, actionData.path);
          await execAsync(`del "${filePath}"`);
          await execAsync(`net use "${basePath}" /delete`);
          result = { message: `Successfully deleted file ${actionData.path}` };
        } catch (err) {
          throw new Error(`Failed to delete file: ${err.message}`);
        }
        break;

      case "delete_folder":
        if (!actionData.path) {
          throw new Error("Delete folder requires path");
        }
        // Check for confirmation
        if (!confirmDelete) {
          result = { message: `Are you sure you want to delete folder ${actionData.path}? This action cannot be undone. Type 'yes' to confirm.` };
          break;
        }
        // Execute delete folder
        try {
          await execAsync(`net use "${basePath}" "${password}" /user:"${conn.username}"`);
          const folderPath = path.join(basePath, actionData.path);
          await execAsync(`rmdir "${folderPath}" /s /q`);
          await execAsync(`net use "${basePath}" /delete`);
          result = { message: `Successfully deleted folder ${actionData.path}` };
        } catch (err) {
          throw new Error(`Failed to delete folder: ${err.message}`);
        }
        break;

      case "count_files":
        // Execute count files
        try {
          await execAsync(`net use "${basePath}" "${password}" /user:"${conn.username}"`);
          const targetPath = actionData.path ? `${basePath}\\${actionData.path}` : basePath;
          const listResult = await execAsync(`dir "${targetPath}" /b /a-d`);
          await execAsync(`net use "${basePath}" /delete`);
          const files = listResult.stdout.split('\n').map(line => line.trim()).filter(line => line);
          result = { message: `Found ${files.length} files in ${actionData.path || "root"}` };
        } catch (err) {
          throw new Error(`Failed to count files: ${err.message}`);
        }
        break;

      case "message":
        result = { message: actionData.text };
        break;

      default:
        throw new Error(`Unsupported action: ${actionData.action}`);
    }

    // Save to history
    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
    const user = await User.findOne({ username: decoded.userId });
    if (!user) {
      console.error("User not found for username:", decoded.userId);
      // Don't fail the request, just skip saving history
    } else {
      await SearchHistory.create({
        user: user._id,
        query: message,
        results: [result.message]
      });
    }

    const responseObj = { response: result.message, action: actionData };
    if (result.files) {
      responseObj.files = result.files;
    }
    res.json(responseObj);
  } catch (err) {
    console.error("Error in /ai/chat:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
});

/*
POST /ai/analyze-image
body: { imageUrl }
Headers: Authorization: Bearer <token>
*/
router.post("/analyze-image", async (req, res) => {
  try {
    const { imageUrl } = req.body;
    if (!imageUrl) {
      return res.status(400).json({ error: "imageUrl required" });
    }

    console.log("Analyzing image:", imageUrl);

    // Use OpenAI client with vision model
    const client = new OpenAI({
      baseURL: "https://router.huggingface.co/v1",
      apiKey: process.env.HF_TOKEN,
    });

    const chatCompletion = await client.chat.completions.create({
      model: "zai-org/GLM-4.5V:novita",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Describe this image in detail. Include objects, people, setting, colors, and any text visible. Be specific and comprehensive.",
            },
            {
              type: "image_url",
              image_url: {
                url: imageUrl,
              },
            },
          ],
        },
      ],
      max_tokens: 300,
    });

    const description = chatCompletion.choices[0].message.content;
    console.log("Image description:", description);

    res.json({ description });
  } catch (err) {
    console.error("Error in /ai/analyze-image:", err);
    res.status(500).json({ error: err.message || "Failed to analyze image" });
  }
});

export default router;
