const mongoose = require("mongoose")
const dotenv = require("dotenv")

dotenv.config()

const fixDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI)
    console.log("MongoDB connected")

    const db = mongoose.connection.db

    // Drop the problematic index if it exists
    try {
      await db.collection("projects").dropIndex("sessions.sessionId_1")
      console.log("✅ Dropped problematic index")
    } catch (error) {
      console.log("Index doesn't exist or already dropped")
    }

    // Create the correct compound index
    try {
      await db.collection("projects").createIndex({ "sessions.sessionId": 1, _id: 1 })
      console.log("✅ Created compound index")
    } catch (error) {
      console.log("Index already exists")
    }

    // Clean up any projects with null sessionIds
    const result = await db
      .collection("projects")
      .updateMany({ "sessions.sessionId": null }, { $pull: { sessions: { sessionId: null } } })

    console.log(`✅ Cleaned up ${result.modifiedCount} projects with null sessionIds`)

    process.exit(0)
  } catch (err) {
    console.error("❌ Failed to fix database:", err)
    process.exit(1)
  }
}

fixDatabase()
