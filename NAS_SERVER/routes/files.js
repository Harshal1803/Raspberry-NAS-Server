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
    next();
  });
}

// List files
router.get("/list", verifyToken, async (req, res) => {
  try {
    const { connId } = req.user;
    const relPath = req.query.path || ""; // optional subfolder path

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

    // Run dir command
    let stdout;
    try {
      const result = await execAsync(`dir "${targetPath}"`);
      stdout = result.stdout;
    } catch (dirErr) {
      console.error("Dir command failed:", dirErr);
      return res.status(500).json({ error: "Failed to list files", details: dirErr.message });
    } finally {
      // Disconnect the network share
      try {
        await execAsync(`net use "${basePath}" /delete`);
      } catch (disconnectErr) {
        console.error("Failed to disconnect share:", disconnectErr);
      }
    }

    // Parse "dir" output
    const lines = stdout.split("\n").slice(5); // skip header lines
    const files = [];
    for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith("Directory of")) continue;
      if (line.startsWith("Total Files Listed")) break;

      // Example: 01/01/2025  12:00 AM    <DIR>          MyFolder
      const parts = line.split(/\s+/);
      if (parts.length < 4) continue;

      const date = `${parts[0]} ${parts[1]}`;
      const sizeOrDir = parts[2];
      const name = parts.slice(3).join(" ");

      files.push({
        name,
        isDirectory: sizeOrDir === "<DIR>",
        size: sizeOrDir === "<DIR>" ? 0 : parseInt(sizeOrDir, 10) || 0,
        modified: date,
        path: relPath ? `${relPath}\\${name}` : name,
      });
    }

    res.json({ success: true, files });
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
router.get("/preview", verifyToken, async (req, res) => {
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

    const ext = path.extname(filePath).toLowerCase();

    if (['.txt', '.js', '.json', '.md', '.html', '.css'].includes(ext)) {
      const content = fs.readFileSync(tempFile, 'utf8');
      res.json({ type: 'text', content });
    } else if (['.jpg', '.jpeg', '.png', '.gif', '.bmp'].includes(ext)) {
      res.sendFile(tempFile);
    } else {
      res.json({ type: 'binary', message: 'Preview not available for this file type' });
    }

    fs.unlinkSync(tempFile);
  } catch (err) {
    console.error("Error in /files/preview:", err);
    res.status(500).json({ error: "Failed to preview file", details: err.message });
  }
});

export default router;
