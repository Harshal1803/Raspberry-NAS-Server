import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { exec } from "child_process";
import { promisify } from "util";
const execAsync = promisify(exec);

import Connection from "../models/Connection.js";
import User from "../models/User.js";
import Permission from "../models/Permission.js";
import { encryptText } from "../utils/crypto.js";

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
POST /auth/register
body: { username, password }
*/
router.post("/register", async (req, res) => {
    try {
        console.log("Register request:", req.body);
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: "username and password required" });
        }
        const existing = await User.findOne({ username });
        if (existing) {
            return res.status(400).json({ error: "Username already exists" });
        }
        const hashed = await bcrypt.hash(password, 10);
        // Create default permissions if not exist
        let adminPerm = await Permission.findOne({ name: "admin" });
        if (!adminPerm) {
            adminPerm = await Permission.create({ name: "admin", description: "Full access" });
        }
        const user = await User.create({ username, password: hashed, permissions: [adminPerm._id] });
        console.log("User created:", user._id);
        res.json({ message: "User created", user: { id: user._id, username } });
    } catch (err) {
        console.error("Error in /auth/register:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

/*
GET /auth/users
Headers: Authorization: Bearer <token>
*/
router.get("/users", authenticate, async (req, res) => {
    try {
        const users = await User.find().populate('permissions').select('-password');
        res.json({ users });
    } catch (err) {
        console.error("Error in /auth/users:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

/*
POST /auth/login
body: { username, password }
*/
router.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: "username and password required" });
        }
        const user = await User.findOne({ username }).populate('permissions');
        if (!user || !await bcrypt.compare(password, user.password)) {
            return res.status(401).json({ error: "Invalid credentials" });
        }
        user.lastLoginIP = req.ip;
        await user.save();
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
        res.json({ token, user: { id: user._id, username, permissions: user.permissions } });
    } catch (err) {
        console.error("Error in /auth/login:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

/*
POST /auth/connect
body: { host, share, username, password }
*/
router.post("/connect", async (req, res) => {
    try {
        const { host, share, username, password, domain = "WORKGROUP" } = req.body;
        if (!host || !share || !username || !password) {
            return res.status(400).json({ error: "host, share, username, password required" });
        }
        // Basic input validation
        if (!/^[a-zA-Z0-9.-]+$/.test(host)) {
            return res.status(400).json({ error: "Invalid host format" });
        }
        if (!/^[a-zA-Z0-9_\\-]+$/.test(share)) {
            return res.status(400).json({ error: "Invalid share name format" });
        }

        
        // Using Windows net use for reliable SMB authentication
        console.log(`Attempting SMB connection to \\\\${host}\\${share} with username: ${username}${domain ? ` and domain: ${domain}` : ' (no domain)'}`);
        const userPart = domain ? `${domain}\\${username}` : username;

        // Disconnect any existing connection to avoid conflict
        try {
            await execAsync(`net use /delete \\\\${host}\\${share}`);
        } catch (e) {
            // Ignore if no connection exists
        }

        const netCommand = `net use \\\\${host}\\${share} "${password}" /user:${userPart}`;

        await execAsync(netCommand);
        console.log("SMB connection successful");

        // List files using dir command
        const dirCommand = `dir \\\\${host}\\${share}`;
        const { stdout } = await execAsync(dirCommand);
        // Parse dir output to get file names (skip header lines)
        const lines = stdout.split('\n').slice(5); // Skip the first 5 lines of dir output
        const files = lines.map(line => line.trim()).filter(line => line && !line.startsWith('Directory of'));
        console.log("Files in share:", files);

        // Disconnect
        await execAsync(`net use \\\\${host}\\${share} /delete`);

        const encPass = encryptText(password);
        console.log("Encrypted password, now creating connection record...");

        const conn = await Connection.create({
            host,
            share,
            username,
            password: encPass,
        });
        console.log("Connection record created with ID:", conn._id);

        const token = jwt.sign({ connId: conn._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
        console.log("JWT signed successfully for connection ID:", conn._id);

        res.json({ ok: true, token, connection: { id: conn._id, host, share, username } });

    } catch (err) {
        console.error("Error in /auth/connect:", err);
        // The library provides a clear error object; we can log it.
        if (err.code) {
             console.error("SMB Error Code:", err.code);
        }
        let errorMessage = "Internal server error";
        if (err.code === 'ECONNREFUSED') {
            errorMessage = "Connection refused: Check if the SMB host is reachable and the service is running on port 445.";
        } else if (err.code === 'EACCES' || err.message.includes('access denied')) {
            errorMessage = "Authentication failed: Check username, password, and domain.";
        } else if (err.code === 'ENOENT' || err.message.includes('share not found')) {
            errorMessage = "Share not found: Verify the share name exists on the host.";
        } else if (err.message) {
            errorMessage = err.message;
        }
        res.status(500).json({ error: errorMessage });
    }
});

export default router;