import express from "express";
import jwt from "jsonwebtoken";
import { Client } from "ssh2";

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

let statsCache = { data: null, lastFetch: 0 };

const getStatsViaSSH = () => {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => {
      const commands = `temp=$(vcgencmd measure_temp | cut -d'=' -f2 | tr -d "'C"); cpu=$(top -bn1 | grep 'Cpu(s)' | sed 's/.*, *\\([0-9.]*\\)%* id.*/\\1/' | awk '{print 100 - $1}'); ram=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100.0}'); echo "$temp $cpu $ram"`;
      conn.exec(commands, (err, stream) => {
        if (err) {
          conn.end();
          return reject(err);
        }
        let output = '';
        stream.on('close', (code) => {
          conn.end();
          if (code !== 0) return reject(new Error('SSH command failed'));
          const parts = output.trim().split(' ');
          if (parts.length !== 3) return reject(new Error('Unexpected output'));
          const [temp, cpu, ram] = parts.map(Number);
          resolve({ cpuLoad: cpu, ramUsage: ram, cpuTemp: temp });
        });
        stream.on('data', (data) => output += data.toString());
        stream.stderr.on('data', (data) => console.error('SSH stderr:', data.toString()));
      });
    });
    conn.on('error', reject);
    conn.connect({
      host: process.env.PI_IP,
      port: 22,
      username: process.env.PI_USER,
      password: process.env.PI_PASSWORD
    });
  });
};

/*
GET /stats
Headers: Authorization: Bearer <token>
*/
router.get("/", authenticate, async (req, res) => {
  try {
    const now = Date.now();
    if (!statsCache.data || now - statsCache.lastFetch > 25000) {
      statsCache.data = await getStatsViaSSH();
      statsCache.lastFetch = now;
    }
    res.json(statsCache.data);
  } catch (err) {
    console.error("Error in /stats:", err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

export default router;