import express from "express";
import jwt from "jsonwebtoken";
import { Client } from "ssh2";
import si from "systeminformation";

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
    const timeout = setTimeout(() => {
      conn.end();
      reject(new Error('SSH connection timeout'));
    }, 5000);
    conn.on('ready', () => {
      clearTimeout(timeout);
      // Get system stats and storage info
      const commands = `
        temp=$(vcgencmd measure_temp | cut -d'=' -f2 | tr -d "'C");
        cpu=$(top -bn1 | grep 'Cpu(s)' | sed 's/.*, *\\([0-9.]*\\)%* id.*/\\1/' | awk '{print 100 - $1}');
        ram=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100.0}');
        storage=$(df -BG /mnt/ssd | tail -1 | awk '{print $2,$3,$4,$5}' | sed 's/[G%]//g');
        echo "$temp $cpu $ram $storage"
      `;
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
          if (parts.length < 7) return reject(new Error('Unexpected output'));
          const [temp, cpu, ram, totalGB, usedGB, availGB, usePercentRaw] = parts.map(Number);
          const usePercent = isNaN(usePercentRaw) ? Math.round((usedGB / totalGB) * 100) : usePercentRaw;
          resolve({
            cpuLoad: cpu,
            ramUsage: ram,
            cpuTemp: temp,
            storage: {
              total: totalGB,
              used: usedGB,
              available: availGB,
              usePercent: usePercent
            }
          });
        });
        stream.on('data', (data) => output += data.toString());
        stream.stderr.on('data', (data) => console.error('SSH stderr:', data.toString()));
      });
    });
    conn.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    conn.connect({
      host: process.env.PI_IP,
      port: 22,
      username: process.env.PI_USER,
      password: process.env.PI_PASSWORD
    });
  });
};

/*
GET /stats/system
Headers: Authorization: Bearer <token>
*/
router.get("/system", async (req, res) => {
  try {
    const now = Date.now();
    // For testing, always fetch fresh data (remove cache)
    statsCache.data = await getStatsViaSSH();
    statsCache.lastFetch = now;
    res.json({ success: true, stats: statsCache.data });
  } catch (err) {
    console.error("Error in /stats/system:", err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

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

/*
GET /stats/network-speed
Returns current network download/upload speeds in MB/s
*/
router.get("/network-speed", async (req, res) => {
  try {
    const networkStats = await si.networkStats();
    let totalRx = 0;
    let totalTx = 0;
    networkStats.forEach(stat => {
      totalRx += stat.rx_sec;
      totalTx += stat.tx_sec;
    });
    const download = totalRx / 1e6; // MB/s
    const upload = totalTx / 1e6; // MB/s
    res.json({ download, upload });
  } catch (err) {
    console.error("Error in /stats/network-speed:", err);
    res.status(500).json({ error: "Failed to fetch network speed" });
  }
});

export default router;