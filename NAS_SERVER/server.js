import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { Client } from "ssh2";
import authRouter from "./routes/auth.js";
import shareRoutes from "./routes/share.js";
import fileRoutes from "./routes/files.js";
import aiRoutes from "./routes/ai.js";
import aiDemoRoutes from "./routes/ai_demo.js";
import statsRoutes from "./routes/stats.js";

dotenv.config({ path: "./.env" });
console.log("Loaded ENCRYPTION_KEY:", process.env.ENCRYPTION_KEY);
const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "http://localhost:5174"], // frontend ports
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Performance monitoring middleware
const performanceMetrics = {
  requests: [],
  maxEntries: 1000 // Keep last 1000 requests
};

app.use((req, res, next) => {
  const start = Date.now();
  const originalSend = res.send;

  res.send = function(data) {
    const duration = Date.now() - start;
    const timestamp = new Date().toISOString();

    performanceMetrics.requests.push({
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration,
      timestamp
    });

    // Keep only recent entries
    if (performanceMetrics.requests.length > performanceMetrics.maxEntries) {
      performanceMetrics.requests.shift();
    }

    originalSend.call(this, data);
  };

  next();
});

// Endpoint to get performance metrics
app.get("/stats/performance", (req, res) => {
  // Aggregate metrics
  const aggregated = performanceMetrics.requests.reduce((acc, req) => {
    const key = `${req.method} ${req.url}`;
    if (!acc[key]) {
      acc[key] = {
        method: req.method,
        url: req.url,
        totalRequests: 0,
        totalDuration: 0,
        avgDuration: 0,
        minDuration: Infinity,
        maxDuration: 0,
        errorCount: 0,
        successCount: 0
      };
    }
    acc[key].totalRequests++;
    acc[key].totalDuration += req.duration;
    acc[key].avgDuration = acc[key].totalDuration / acc[key].totalRequests;
    acc[key].minDuration = Math.min(acc[key].minDuration, req.duration);
    acc[key].maxDuration = Math.max(acc[key].maxDuration, req.duration);
    if (req.statusCode >= 400) {
      acc[key].errorCount++;
    } else {
      acc[key].successCount++;
    }
    return acc;
  }, {});

  // Convert to array and add recent requests
  const endpoints = Object.values(aggregated);
  const recentRequests = performanceMetrics.requests.slice(-50); // Last 50 requests

  res.json({
    endpoints,
    recentRequests,
    totalRequests: performanceMetrics.requests.length
  });
});

app.use("/auth", authRouter);
app.use("/share", shareRoutes);
app.use("/files", fileRoutes);
app.use("/ai", aiRoutes);
app.use("/ai-demo", aiDemoRoutes);
app.use("/stats", statsRoutes);

const activeShells = new Map();

const executeCommandOnPi = (command, socket) => {
    const userId = socket.id;
    let shell = activeShells.get(userId);

    if (!shell) {
        console.log('Creating new shell for user:', userId);
        shell = { conn: null, stream: null };
        activeShells.set(userId, shell);

        const conn = new Client();
        shell.conn = conn;

        conn.on('ready', () => {
            console.log('SSH connection ready for user:', userId);
            conn.shell({ term: 'xterm-256color' }, (err, stream) => {
                if (err) {
                    console.log('Shell error:', err);
                    socket.emit('output', `Shell Error: ${err.message}\r\n$ `);
                    return;
                }

                shell.stream = stream;
                console.log('Shell created for user:', userId);

                stream.on('close', () => {
                    console.log('Shell closed for user:', userId);
                    activeShells.delete(userId);
                    conn.end();
                });

                stream.on('data', (data) => {
                    const output = data.toString();
                    // Send all output to client, let client handle display
                    socket.emit('output', output);
                });

                // Set up the shell environment
                setTimeout(() => {
                    stream.write('export PS1="$ "\n');
                    stream.write('cd /root\n');
                    stream.write('clear\n');
                    setTimeout(() => {
                        socket.emit('output', '\r\nWelcome to Raspberry Pi CLI\r\n$ ');
                    }, 500);
                }, 100);
            });
        }).connect({
            host: process.env.PI_HOST,
            port: 22,
            username: process.env.PI_USER,
            password: process.env.PI_PASS,
        });

        conn.on('error', (err) => {
            console.log('SSH connection error for user:', userId, err);
            socket.emit('output', `SSH Connection Error: ${err.message}\r\n$ `);
            activeShells.delete(userId);
        });

        // Wait for shell to be ready then send command
        setTimeout(() => {
            if (shell.stream && command) {
                shell.stream.write(command + '\n');
            }
        }, 1000);
    } else {
        console.log('Using existing shell for user:', userId);
        if (shell.stream && command) {
            shell.stream.write(command + '\n');
        }
    }
};

const PORT = process.env.PORT || 4001;

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication error'));
  try {
    jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    next(new Error('Authentication error'));
  }
});

io.on('connection', (socket) => {
  console.log('User connected to CLI');
  socket.on('command', (command) => {
    console.log('Received command:', command);
    // Allow all commands for full shell access
    console.log('Executing command on Pi:', command);
    executeCommandOnPi(command, socket);
  });
  socket.on('disconnect', () => {
    console.log('User disconnected from CLI');
    const shell = activeShells.get(socket.id);
    if (shell) {
      if (shell.stream) {
        shell.stream.end();
      }
      if (shell.conn) {
        shell.conn.end();
      }
      activeShells.delete(socket.id);
    }
  });
});

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
    server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
  })
  .catch(err => console.error("MongoDB error:", err));

  
  process.on("uncaughtException", (err) => {
    console.error("Uncaught Exception:", err);
  });
  
  process.on("unhandledRejection", (err) => {
    console.error("Unhandled Rejection:", err);
  });
  