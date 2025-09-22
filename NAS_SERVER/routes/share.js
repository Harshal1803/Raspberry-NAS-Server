import express from "express";
import jwt from "jsonwebtoken";

const router = express.Router();

// Select a share
router.post("/select", (req, res) => {
  const { token, share } = req.body;

  if (!token || !share) {
    return res.status(400).json({ error: "Token and share required" });
  }

  try {
    console.log("JWT_SECRET:", process.env.JWT_SECRET);
    // Decode old token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Add/update selected share
    const newPayload = {
      ...decoded,
      share: share, // e.g. "MyShare"
    };

    // Create a new token with updated share info
    const newToken = jwt.sign(newPayload, process.env.JWT_SECRET, { expiresIn: "1h" });

    res.json({
      message: `Active share set to ${share}`,
      token: newToken,
    });
  } catch (err) {
    console.error("JWT Error:", err.message);
    console.error("Error name:", err.name);
    res.status(401).json({ error: "Invalid token" });
  }
});

export default router;
