import mongoose from "mongoose";

const imageSchema = new mongoose.Schema({
  path: { type: String, required: true },
  tags: [{ type: String }],
  indexedAt: { type: Date, default: Date.now }
});

export default mongoose.model("Image", imageSchema);