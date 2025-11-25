// routes/files.js
import express from "express";
import jwt from "jsonwebtoken";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import multer from "multer";
import Connection from "../models/Connection.js";
import { decryptText } from "../utils/crypto.js";

const execAsync = promisify(exec);
const router = express.Router();

// Configure multer for file uploads
const tempDir = path.join(process.cwd(), 'temp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
const upload = multer({ dest: tempDir });

// Helper function for authentication and cleanup
async function withAuth(conn, callback) {
  const basePath = `\\\\${conn.host}\\${conn.share}`;
  const password = decryptText(conn.password);

  try {
    await execAsync(`net use "${basePath}" "${password}" /user:"${conn.username}"`);
    return await callback(basePath);
  } finally {
    try {
      await execAsync(`net use "${basePath}" /delete`);
    } catch (disconnectErr) {
      console.error("Failed to disconnect share:", disconnectErr);
    }
  }
}

// Middleware: verify token
function verifyToken(req, res, next) {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token provided" });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: "Invalid token" });
    req.user = decoded;
    // For backward compatibility, if no connId, assume local files
    if (!req.user.connId) {
      req.user.connId = null; // Use local
    }
    next();
  });
}

// List files
router.get("/list", verifyToken, async (req, res) => {
  try {
    const { connId } = req.user;
    const relPath = req.query.path || ""; // optional subfolder paths

    if (connId) {
      // NAS mode
      const conn = await Connection.findById(connId);
      if (!conn) return res.status(404).json({ error: "Connection not found" });

      const password = decryptText(conn.password);
      const basePath = `\\\\${conn.host}\\${conn.share}`;
      const targetPath = relPath ? `${basePath}\\${relPath}` : basePath;

      try {
        await execAsync(`net use "${basePath}" "${password}" /user:"${conn.username}"`);
      } catch (authErr) {
        console.error("Authentication failed:", authErr);
        return res.status(500).json({ error: "Failed to authenticate with network share", details: authErr.message });
      }

      let stdout;
      try {
        const result = await execAsync(`dir "${targetPath}"`);
        stdout = result.stdout;
      } catch (dirErr) {
        console.error("Dir command failed:", dirErr);
        return res.status(500).json({ error: "Failed to list files", details: dirErr.message });
      } finally {
        try {
          await execAsync(`net use "${basePath}" /delete`);
        } catch (disconnectErr) {
          console.error("Failed to disconnect share:", disconnectErr);
        }
      }

      const lines = stdout.split("\n").slice(5);
      const files = [];
      for (let line of lines) {
        line = line.trim();
        if (!line || line.startsWith("Directory of")) continue;
        if (line.startsWith("Total Files Listed")) break;

        const parts = line.split(/\s+/);
        if (parts.length < 4) continue;

        const date = `${parts[0]} ${parts[1]}`;
        const sizeOrDir = parts[2];
        const name = parts.slice(3).join(" ");

        files.push({
          name,
          isDirectory: sizeOrDir === "<DIR>",
          size: sizeOrDir === "<DIR>" ? 0 : parseInt(sizeOrDir.replace(/,/g, ''), 10) || 0,
          modified: date,
          path: relPath ? `${relPath}\\${name}` : name,
        });
      }

      res.json({ success: true, files });
    } else {
      // Local mode
      const localBase = path.join(process.cwd(), 'files');
      const targetPath = relPath ? path.join(localBase, relPath) : localBase;

      if (!fs.existsSync(targetPath)) {
        return res.json({ success: true, files: [] });
      }

      const items = fs.readdirSync(targetPath, { withFileTypes: true });
      const files = items.map(item => {
        const itemPath = path.join(targetPath, item.name);
        const stats = fs.statSync(itemPath);
        return {
          name: item.name,
          isDirectory: item.isDirectory(),
          size: item.isDirectory() ? 0 : stats.size,
          modified: stats.mtime.toISOString(),
          path: relPath ? path.join(relPath, item.name).replace(/\\/g, '/') : item.name,
        };
      });

      res.json({ success: true, files });
    }
  } catch (err) {
    console.error("Error in /files/list:", err);
    res.status(500).json({ error: "Failed to list files", details: err.message });
  }
});

// Download file
router.get("/download", verifyToken, async (req, res) => {
  try {
    const { connId } = req.user;
    const { path: filePath } = req.query;

    if (!filePath) return res.status(400).json({ error: "File path required" });

    const conn = await Connection.findById(connId);
    if (!conn) return res.status(404).json({ error: "Connection not found" });

    const tempFile = path.join(tempDir, path.basename(filePath));
    const sharePath = path.join(`\\\\${conn.host}\\${conn.share}`, filePath);

    await withAuth(conn, async () => {
      await execAsync(`copy "${sharePath}" "${tempFile}"`);
    });

    res.download(tempFile, path.basename(filePath), (err) => {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      if (err) console.error("Download error:", err);
    });
  } catch (err) {
    console.error("Error in /files/download:", err);
    res.status(500).json({ error: "Failed to download file", details: err.message });
  }
});

// Upload file
router.post("/upload", verifyToken, upload.single('file'), async (req, res) => {
  try {
    const { connId } = req.user;
    const { path: uploadPath = '' } = req.body;

    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const conn = await Connection.findById(connId);
    if (!conn) return res.status(404).json({ error: "Connection not found" });

    const sharePath = path.join(`\\\\${conn.host}\\${conn.share}`, uploadPath, req.file.originalname);

    await withAuth(conn, async () => {
      await execAsync(`copy "${req.file.path}" "${sharePath}"`);
    });

    fs.unlinkSync(req.file.path);
    res.json({ success: true, message: "File uploaded successfully" });
  } catch (err) {
    console.error("Error in /files/upload:", err);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: "Failed to upload file", details: err.message });
  }
});

// Preview file
router.get("/preview", async (req, res) => {
  try {
    let connId;
    const authHeader = req.headers.authorization;
    const queryToken = req.query.token;

    // Try Authorization header first
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        connId = decoded.connId;
      } catch (err) {
        // Header token invalid, try query token
      }
    }

    // If no connId from header, try query token
    if (!connId && queryToken) {
      try {
        const decoded = jwt.verify(queryToken, process.env.JWT_SECRET);
        connId = decoded.connId;
      } catch (err) {
        return res.status(401).json({ error: "Invalid token" });
      }
    }

    const { path: filePath } = req.query;

    if (!filePath) return res.status(400).json({ error: "File path required" });

    if (connId) {
      // NAS mode
      const conn = await Connection.findById(connId);
      if (!conn) return res.status(404).json({ error: "Connection not found" });

      const tempFile = path.join(tempDir, `preview_${Date.now()}_${path.basename(filePath)}`);
      const sharePath = path.join(`\\\\${conn.host}\\${conn.share}`, filePath);

      await withAuth(conn, async () => {
        await execAsync(`copy "${sharePath}" "${tempFile}"`);
      });

      const ext = path.extname(filePath).toLowerCase();

      if (['.txt', '.js', '.json', '.md', '.html', '.css'].includes(ext)) {
        const content = fs.readFileSync(tempFile, 'utf8');
        res.json({ type: 'text', content });
      } else if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.pdf', '.doc', '.docx', '.mp4', '.mov', '.avi', '.mkv', '.webm', '.mp3', '.wav', '.flac', '.m4a'].includes(ext)) {
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.sendFile(tempFile, (err) => {
          fs.unlinkSync(tempFile);
          if (err) console.error("Send file error:", err);
        });
      } else {
        res.json({ type: 'binary', message: 'Preview not available for this file type' });
        fs.unlinkSync(tempFile);
      }
    } else {
      // Local mode
      const localBase = path.join(process.cwd(), 'files');
      const localPath = path.join(localBase, filePath);

      if (!fs.existsSync(localPath)) {
        return res.status(404).json({ error: "File not found" });
      }

      const ext = path.extname(filePath).toLowerCase();

      if (['.txt', '.js', '.json', '.md', '.html', '.css'].includes(ext)) {
        const content = fs.readFileSync(localPath, 'utf8');
        res.json({ type: 'text', content });
      } else if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.pdf', '.doc', '.docx', '.mp4', '.mov', '.avi', '.mkv', '.webm', '.mp3', '.wav', '.flac', '.m4a'].includes(ext)) {
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.sendFile(localPath);
      } else {
        res.json({ type: 'binary', message: 'Preview not available for this file type' });
      }
    }
  } catch (err) {
    console.error("Error in /files/preview:", err);
    res.status(500).json({ error: "Failed to preview file", details: err.message });
  }
});

// Create folder
router.post("/create-folder", verifyToken, async (req, res) => {
  try {
    const { connId } = req.user;
    const { path: folderPath } = req.body;

    if (!folderPath) return res.status(400).json({ error: "Folder path required" });

    const conn = await Connection.findById(connId);
    if (!conn) return res.status(404).json({ error: "Connection not found" });

    const sharePath = path.join(`\\\\${conn.host}\\${conn.share}`, folderPath);

    await withAuth(conn, async () => {
      await execAsync(`mkdir "${sharePath}"`);
    });

    res.json({ success: true, message: "Folder created successfully" });
  } catch (err) {
    console.error("Error in /files/create-folder:", err);
    res.status(500).json({ error: "Failed to create folder", details: err.message });
  }
});

// Move file or folder
router.post("/move", verifyToken, async (req, res) => {
  try {
    const { connId } = req.user;
    const { sourcePath, destinationPath } = req.body;

    if (!sourcePath || !destinationPath) return res.status(400).json({ error: "Source and destination paths required" });

    const conn = await Connection.findById(connId);
    if (!conn) return res.status(404).json({ error: "Connection not found" });

    const sourceSharePath = path.join(`\\\\${conn.host}\\${conn.share}`, sourcePath);
    const destSharePath = path.join(`\\\\${conn.host}\\${conn.share}`, destinationPath);

    await withAuth(conn, async () => {
      await execAsync(`move "${sourceSharePath}" "${destSharePath}"`);
    });

    res.json({ success: true, message: "File/folder moved successfully" });
  } catch (err) {
    console.error("Error in /files/move:", err);
    res.status(500).json({ error: "Failed to move file/folder", details: err.message });
  }
});

// Storage breakdown
router.get("/storage-breakdown", verifyToken, async (req, res) => {
  console.log('Storage breakdown called');
  try {
    const { connId } = req.user;

    if (connId) {
      // NAS mode
      const conn = await Connection.findById(connId);
      if (!conn) return res.status(404).json({ error: "Connection not found" });

      const password = decryptText(conn.password);
      const basePath = `\\\\${conn.host}\\${conn.share}`;

      try {
        await execAsync(`net use "${basePath}" "${password}" /user:"${conn.username}"`);
      } catch (authErr) {
        console.error("Authentication failed:", authErr);
        return res.status(500).json({ error: "Failed to authenticate with network share", details: authErr.message });
      }

      const listAllFiles = async (rootPath) => {
        const files = [];
        const queue = [rootPath];

        while (queue.length > 0) {
          const currentPath = queue.shift();
          try {
            const result = await execAsync(`dir "${currentPath}"`);
            const lines = result.stdout.split("\n").slice(5);
            for (let line of lines) {
              line = line.trim();
              if (!line || line.startsWith("Directory of")) continue;
              if (line.startsWith("Total Files Listed")) break;

              const parts = line.split(/\s+/);
              if (parts.length < 4) continue;

              const sizeOrDir = parts[2];
              const name = parts.slice(3).join(" ");

              if (sizeOrDir === "<DIR>" && name !== "." && name !== "..") {
                const subPath = path.join(currentPath, name);
                queue.push(subPath);
              } else if (sizeOrDir !== "<DIR>") {
                const size = parseInt(sizeOrDir.replace(/,/g, ''), 10) || 0;
                files.push({ name, size, path: path.relative(basePath, path.join(currentPath, name)) });
              }
            }
          } catch (err) {
            console.error(`Error listing ${currentPath}:`, err);
          }
        }
        return files;
      };

      const allFiles = await listAllFiles(basePath);
      console.log('All files:', allFiles.length);

      try {
        await execAsync(`net use "${basePath}" /delete`);
      } catch (disconnectErr) {
        console.error("Failed to disconnect share:", disconnectErr);
      }

      const categories = { image: 0, video: 0, audio: 0, document: 0, other: 0 };
      const typeMap = {
        jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', bmp: 'image',
        mp4: 'video', mov: 'video', avi: 'video', mkv: 'video', webm: 'video',
        mp3: 'audio', wav: 'audio', flac: 'audio', m4a: 'audio',
        pdf: 'document', doc: 'document', docx: 'document', txt: 'document'
      };

      allFiles.forEach(file => {
        const ext = path.extname(file.name).toLowerCase().slice(1);
        const category = typeMap[ext] || 'other';
        categories[category] += file.size;
      });

      const toMB = (bytes) => bytes / (1024 ** 2);
      const breakdown = {
        image: toMB(categories.image),
        video: toMB(categories.video),
        audio: toMB(categories.audio),
        document: toMB(categories.document),
        other: toMB(categories.other)
      };
      console.log('Breakdown:', breakdown);

      res.json({ success: true, breakdown });
    } else {
      // Local mode
      const localBase = path.join(process.cwd(), 'files');

      const listAllFiles = (rootPath) => {
        const files = [];
        const queue = [rootPath];

        while (queue.length > 0) {
          const currentPath = queue.shift();
          try {
            const items = fs.readdirSync(currentPath, { withFileTypes: true });
            for (const item of items) {
              const itemPath = path.join(currentPath, item.name);
              if (item.isDirectory() && item.name !== "." && item.name !== "..") {
                queue.push(itemPath);
              } else if (!item.isDirectory()) {
                const stats = fs.statSync(itemPath);
                files.push({ name: item.name, size: stats.size, path: path.relative(localBase, itemPath) });
              }
            }
          } catch (err) {
            console.error(`Error listing ${currentPath}:`, err);
          }
        }
        return files;
      };

      const allFiles = listAllFiles(localBase);
      console.log('Local files:', allFiles.length);

      const categories = { image: 0, video: 0, audio: 0, document: 0, other: 0 };
      const typeMap = {
        jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', bmp: 'image',
        mp4: 'video', mov: 'video', avi: 'video', mkv: 'video', webm: 'video',
        mp3: 'audio', wav: 'audio', flac: 'audio', m4a: 'audio',
        pdf: 'document', doc: 'document', docx: 'document', txt: 'document'
      };

      allFiles.forEach(file => {
        const ext = path.extname(file.name).toLowerCase().slice(1);
        const category = typeMap[ext] || 'other';
        categories[category] += file.size;
      });

      const toMB = (bytes) => bytes / (1024 ** 2);
      const breakdown = {
        image: toMB(categories.image),
        video: toMB(categories.video),
        audio: toMB(categories.audio),
        document: toMB(categories.document),
        other: toMB(categories.other)
      };
      console.log('Local breakdown:', breakdown);

      res.json({ success: true, breakdown });
    }
  } catch (err) {
    console.error("Error in /files/storage-breakdown:", err);
    res.status(500).json({ error: "Failed to get storage breakdown", details: err.message });
  }
});

// Get file count in a directory
router.get("/count", verifyToken, async (req, res) => {
  try {
    const { connId } = req.user;
    const relPath = req.query.path || ""; // optional subfolder paths

    // Find connection from DB
    const conn = await Connection.findById(connId);
    if (!conn) return res.status(404).json({ error: "Connection not found" });

    const password = decryptText(conn.password);
    const basePath = `\\\\${conn.host}\\${conn.share}`;
    const targetPath = relPath ? `${basePath}\\${relPath}` : basePath;

    // Authenticate with the network share
    try {
      await execAsync(`net use "${basePath}" "${password}" /user:"${conn.username}"`);
    } catch (authErr) {
      console.error("Authentication failed:", authErr);
      return res.status(500).json({ error: "Failed to authenticate with network share", details: authErr.message });
    }

    // Run dir command to count files
    let stdout;
    try {
      const result = await execAsync(`dir "${targetPath}" /a-d /b`);
      stdout = result.stdout;
    } catch (dirErr) {
      console.error("Dir command failed:", dirErr);
      return res.status(500).json({ error: "Failed to count files", details: dirErr.message });
    } finally {
      // Disconnect the network share
      try {
        await execAsync(`net use "${basePath}" /delete`);
      } catch (disconnectErr) {
        console.error("Failed to disconnect share:", disconnectErr);
      }
    }

    // Count lines (files)
    const fileCount = stdout.split("\n").filter(line => line.trim()).length;

    res.json({ success: true, count: fileCount, path: relPath || "root" });
  } catch (err) {
    console.error("Error in /files/count:", err);
    res.status(500).json({ error: "Failed to count files", details: err.message });
  }
});

export default router;
