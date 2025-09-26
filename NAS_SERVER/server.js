import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import cors from "cors";
import authRouter from "./routes/auth.js";
import shareRoutes from "./routes/share.js";
import fileRoutes from "./routes/files.js";
import aiRoutes from "./routes/ai.js";
import statsRoutes from "./routes/stats.js";

dotenv.config({ path: "./.env" });
console.log("Loaded ENCRYPTION_KEY:", process.env.ENCRYPTION_KEY);
const app = express();
app.use(cors());
app.use(express.json());

app.use("/auth", authRouter);
app.use("/share", shareRoutes);
app.use("/files", fileRoutes);
app.use("/ai", aiRoutes);
app.use("/stats", statsRoutes);

const PORT = process.env.PORT || 4000;

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
  })
  .catch(err => console.error("MongoDB error:", err));

  
  process.on("uncaughtException", (err) => {
    console.error("Uncaught Exception:", err);
  });
  
  process.on("unhandledRejection", (err) => {
    console.error("Unhandled Rejection:", err);
  });
  