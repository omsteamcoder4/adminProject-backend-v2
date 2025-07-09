// const mongoose = require("mongoose")
// const dotenv = require("dotenv")
// const bcrypt = require("bcryptjs")
// const User = require("./models/User")

// dotenv.config()

// const MONGO_URI = process.env.MONGO_URI

// const seedAdmin = async () => {
//   try {
//     await mongoose.connect(MONGO_URI)
//     console.log("MongoDB connected")

//     const existingAdmin = await User.findOne({ role: "admin" })
//     if (existingAdmin) {
//       console.log("Admin already exists:", existingAdmin.username)
//       return process.exit(0)
//     }

//     const hashedPassword = await bcrypt.hash("admin123", 10)

//     const admin = new User({
//       username: "admin",
//       password: hashedPassword,
//       role: "admin",
//     })

//     await admin.save()
//     console.log("✅ Admin seeded:", admin.username)
//     process.exit(0)
//   } catch (err) {
//     console.error("❌ Failed to seed admin:", err)
//     process.exit(1)
//   }
// }

// seedAdmin()


const mongoose = require("mongoose")
const dotenv = require("dotenv")
const bcrypt = require("bcryptjs")
const User = require("./models/User")

dotenv.config()

const MONGO_URI = process.env.MONGO_URI

const seedAdmin = async () => {
  try {
    await mongoose.connect(MONGO_URI)
    console.log("MongoDB connected")

    const existingAdmin = await User.findOne({ role: "admin" })
    if (existingAdmin) {
      console.log("Admin already exists:", existingAdmin.username)
      return process.exit(0)
    }

    const hashedPassword = await bcrypt.hash("admin123", 10)

    const admin = new User({
      username: "admin",
      password: hashedPassword,
      role: "admin",
    })

    await admin.save()
    console.log("✅ Admin seeded:", admin.username)
    process.exit(0)
  } catch (err) {
    console.error("❌ Failed to seed admin:", err)
    process.exit(1)
  }
}

seedAdmin()
