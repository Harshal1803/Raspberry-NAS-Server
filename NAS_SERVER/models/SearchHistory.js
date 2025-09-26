import mongoose from "mongoose";

const searchHistorySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  query: { type: String, required: true },
  results: [{ type: String }],
  timestamp: { type: Date, default: Date.now }
});

export default mongoose.model("SearchHistory", searchHistorySchema);