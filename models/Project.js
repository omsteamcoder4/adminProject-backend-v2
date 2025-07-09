const mongoose = require("mongoose")

const fileSchema = new mongoose.Schema({
  originalName: String,
  displayName: String,
  filename: String,
  path: String,
  mimetype: String,
  size: Number,
  uploadedAt: { type: Date, default: Date.now },
  uploadedBy: String, // IP or identifier
  notes: String,
})

const sessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true }, // Remove unique constraint from here
  notes: { type: String, default: "" },
  uploadedAt: { type: Date, default: Date.now },
  uploadedBy: String, // IP or identifier
  files: [fileSchema],
  isActive: { type: Boolean, default: true },
})

const projectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    details: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    type: {
      type: String,
      enum: ["public", "auth", "private"],
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    createdByType: {
      type: String,
      enum: ["admin", "user"],
      required: true,
    },
    shareLink: String,
    shareLinkExpiry: Date,
    sessions: [sessionSchema],
    files: [fileSchema], // Keep for backward compatibility
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  },
)

// Create compound index instead of unique on sessionId alone
projectSchema.index({ "sessions.sessionId": 1, _id: 1 })

module.exports = mongoose.model("Project", projectSchema)
