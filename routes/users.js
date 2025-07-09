// const express = require("express")
// const User = require("../models/User")
// const auth = require("../middleware/auth")
// const adminAuth = require("../middleware/adminAuth")
// const bcrypt = require("bcryptjs")

// const router = express.Router()

// // Get all users (admin only)
// router.get("/", auth, adminAuth, async (req, res) => {
//   try {
//     const users = await User.find({ isActive: true }).select("-password")
//     res.json(users)
//   } catch (error) {
//     res.status(500).json({ message: error.message })
//   }
// })

// // Create user (admin only)
// router.post("/", auth, adminAuth, async (req, res) => {
//   try {
//     const { username, password, role } = req.body
    
//     const existingUser = await User.findOne({ username })
//     if (existingUser) {
//       return res.status(400).json({ message: "User already exists" })
//     }
//     const hashedPassword = await bcrypt.hash(password, 10)

//     const user = new User({ username, password:hashedPassword, role })
//     await user.save()

//     const userResponse = user.toObject()
//     delete userResponse.password

//     res.status(201).json(userResponse)
//   } catch (error) {
//     res.status(400).json({ message: error.message })
//   }
// })

// // Update user (admin only)
// router.put("/:id", auth, adminAuth, async (req, res) => {
//   try {
//     const { password, ...updateData } = req.body

//     if (password) {
//       const user = await User.findById(req.params.id)
//       user.password = password
//       await user.save()
//     }

//     const updatedUser = await User.findByIdAndUpdate(req.params.id, updateData, { new: true }).select("-password")

//     res.json(updatedUser)
//   } catch (error) {
//     res.status(400).json({ message: error.message })
//   }
// })

// // Delete user (admin only)
// router.delete("/:id", auth, adminAuth, async (req, res) => {
//   try {
//     await User.findByIdAndUpdate(req.params.id, { isActive: false })
//     res.json({ message: "User deleted successfully" })
//   } catch (error) {
//     res.status(500).json({ message: error.message })
//   }
// })

// module.exports = router

const express = require("express")
const User = require("../models/User")
const auth = require("../middleware/auth")
const adminAuth = require("../middleware/adminAuth")
const bcrypt = require("bcryptjs")

const router = express.Router()

// Get all users (admin only)
router.get("/", auth, adminAuth, async (req, res) => {
  try {
    const users = await User.find({ isActive: true }).select("-password")
    res.json(users)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// Create user (admin only)
router.post("/", auth, adminAuth, async (req, res) => {
  try {
    const { username, password, role } = req.body

    const existingUser = await User.findOne({ username })
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" })
    }
    const hashedPassword = await bcrypt.hash(password, 10)

    const user = new User({ username, password: hashedPassword, role })
    await user.save()

    const userResponse = user.toObject()
    delete userResponse.password

    res.status(201).json(userResponse)
  } catch (error) {
    res.status(400).json({ message: error.message })
  }
})

// Update user (admin only)
router.put("/:id", auth, adminAuth, async (req, res) => {
  try {
    const { password, ...updateData } = req.body

    if (password) {
      const user = await User.findById(req.params.id)
      user.password = password
      await user.save()
    }

    const updatedUser = await User.findByIdAndUpdate(req.params.id, updateData, { new: true }).select("-password")

    res.json(updatedUser)
  } catch (error) {
    res.status(400).json({ message: error.message })
  }
})

// Delete user (admin only)
router.delete("/:id", auth, adminAuth, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { isActive: false })
    res.json({ message: "User deleted successfully" })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

module.exports = router
