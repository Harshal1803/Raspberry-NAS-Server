import mongoose from "mongoose";

const connectionSchema = new mongoose.Schema({
  host: { type: String, required: true },   // Pi IP
  share: { type: String, required: true },  // Samba share name
  username: { type: String, required: true },
  password: { type: String, required: true }, // encrypted
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("Connection", connectionSchema);
