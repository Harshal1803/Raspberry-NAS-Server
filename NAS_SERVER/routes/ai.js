import express from "express";
import jwt from "jsonwebtoken";
import SearchHistory from "../models/SearchHistory.js";

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
POST /ai/search
body: { query }
Headers: Authorization: Bearer <token>
*/
router.post("/search", authenticate, async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ error: "query required" });
    }
    // Here, integrate with your local CLIP model
    // For now, mock results
    const results = ["mock_file1.jpg", "mock_file2.png"]; // Replace with actual CLIP search results

    // Save to history
    await SearchHistory.create({
      user: req.userId,
      query,
      results
    });

    res.json({ results });
  } catch (err) {
    console.error("Error in /ai/search:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;