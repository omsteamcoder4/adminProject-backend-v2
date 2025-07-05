const express = require("express")
const multer = require("multer")
const path = require("path")
const crypto = require("crypto")
const fs = require("fs")
const Project = require("../models/Project")
const auth = require("../middleware/auth")
const router = express.Router()

// Ensure uploads directory exists
const uploadsDir = "uploads"
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/")
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname))
  },
})

const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
  fileFilter: (req, file, cb) => {
    // Allow all file types
    cb(null, true)
  },
})

// Get all projects
router.get("/", auth, async (req, res) => {
  try {
    const projects = await Project.find({ isActive: true }).populate("createdBy", "username").sort({ createdAt: -1 })
    res.json(projects)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// Get single project
router.get("/:id", auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id).populate("createdBy", "username")
    if (!project || !project.isActive) {
      return res.status(404).json({ message: "Project not found" })
    }
    res.json(project)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// Create project
router.post("/", auth, async (req, res) => {
  try {
    const { name, details, phoneNumber, type } = req.body

    const project = new Project({
      name,
      details,
      phoneNumber,
      type,
      createdBy: req.user.id,
      createdByType: req.user.role,
    })

    await project.save()
    await project.populate("createdBy", "username")
    res.status(201).json(project)
  } catch (error) {
    res.status(400).json({ message: error.message })
  }
})

// Update project
router.put("/:id", auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)

    if (!project) {
      return res.status(404).json({ message: "Project not found" })
    }

    // Check permissions
    if (req.user.role !== "admin" && project.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized" })
    }

    const updatedProject = await Project.findByIdAndUpdate(req.params.id, req.body, { new: true }).populate(
      "createdBy",
      "username",
    )

    res.json(updatedProject)
  } catch (error) {
    res.status(400).json({ message: error.message })
  }
})

// Delete project
router.delete("/:id", auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)

    if (!project) {
      return res.status(404).json({ message: "Project not found" })
    }

    // Check permissions
    if (req.user.role !== "admin" && project.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized" })
    }

    await Project.findByIdAndUpdate(req.params.id, { isActive: false })
    res.json({ message: "Project deleted successfully" })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// Generate share link
router.post("/:id/share", auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)

    if (!project) {
      return res.status(404).json({ message: "Project not found" })
    }

    if (project.type === "private") {
      return res.status(400).json({ message: "Private projects cannot be shared" })
    }

    // Check permissions
    if (req.user.role !== "admin" && project.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized" })
    }

    const shareToken = crypto.randomBytes(32).toString("hex")
    const expiryDate = new Date()
    expiryDate.setDate(expiryDate.getDate() + 30) // 30 days from now

    project.shareLink = shareToken
    project.shareLinkExpiry = expiryDate
    await project.save()

    const shareUrl = `${process.env.FRONTEND_URL}/share/${shareToken}`
    res.json({ shareUrl, expiryDate })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// Get project by share link
router.get("/share/:token", async (req, res) => {
  try {
    const project = await Project.findOne({
      shareLink: req.params.token,
      shareLinkExpiry: { $gt: new Date() },
      isActive: true,
    })

    if (!project) {
      return res.status(404).json({ message: "Share link expired or invalid" })
    }

    res.json({
      id: project._id,
      name: project.name,
      details: project.details,
      type: project.type,
      phoneNumber: project.phoneNumber,
      files: project.files,
    })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// Verify phone for auth projects
router.post("/share/:token/verify", async (req, res) => {
  try {
    const { phoneNumber } = req.body
    const project = await Project.findOne({
      shareLink: req.params.token,
      shareLinkExpiry: { $gt: new Date() },
      isActive: true,
    })

    if (!project) {
      return res.status(404).json({ message: "Share link expired or invalid" })
    }

    if (project.type !== "auth") {
      return res.status(400).json({ message: "Phone verification not required" })
    }

    if (project.phoneNumber !== phoneNumber) {
      return res.status(401).json({ message: "Wrong phone number entered" })
    }

    res.json({ message: "Phone number verified successfully" })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// Upload files to shared project
router.post("/share/:token/upload", upload.array("files", 10), async (req, res) => {
  try {
    const { notes } = req.body
    const project = await Project.findOne({
      shareLink: req.params.token,
      shareLinkExpiry: { $gt: new Date() },
      isActive: true,
    })

    if (!project) {
      return res.status(404).json({ message: "Share link expired or invalid" })
    }

    const uploadedFiles = req.files.map((file) => ({
      originalName: file.originalname,
      displayName: file.originalname,
      filename: file.filename,
      path: file.path,
      mimetype: file.mimetype,
      size: file.size,
      uploadedBy: req.ip,
      notes: notes || "",
    }))

    project.files.push(...uploadedFiles)
    await project.save()

    res.json({ message: "Files uploaded successfully", files: uploadedFiles })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// Update file name
router.put("/share/:token/files/:fileId", async (req, res) => {
  try {
    const { displayName } = req.body
    const project = await Project.findOne({
      shareLink: req.params.token,
      shareLinkExpiry: { $gt: new Date() },
      isActive: true,
    })

    if (!project) {
      return res.status(404).json({ message: "Share link expired or invalid" })
    }

    const file = project.files.id(req.params.fileId)
    if (!file) {
      return res.status(404).json({ message: "File not found" })
    }

    file.displayName = displayName
    await project.save()

    res.json({ message: "File name updated successfully" })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// Delete file
router.delete("/share/:token/files/:fileId", async (req, res) => {
  try {
    const project = await Project.findOne({
      shareLink: req.params.token,
      shareLinkExpiry: { $gt: new Date() },
      isActive: true,
    })

    if (!project) {
      return res.status(404).json({ message: "Share link expired or invalid" })
    }

    project.files.id(req.params.fileId).remove()
    await project.save()

    res.json({ message: "File deleted successfully" })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// Download file
router.get("/download/:token/:fileId", async (req, res) => {
  try {
    const project = await Project.findOne({
      shareLink: req.params.token,
      shareLinkExpiry: { $gt: new Date() },
      isActive: true,
    })

    if (!project) {
      return res.status(404).json({ message: "Share link expired or invalid" })
    }

    const file = project.files.id(req.params.fileId)
    if (!file) {
      return res.status(404).json({ message: "File not found" })
    }

    const filePath = path.join(__dirname, "..", file.path)
    res.download(filePath, file.displayName)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// Get single file
router.get("/:id/files/:fileId", auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
    if (!project || !project.isActive) {
      return res.status(404).json({ message: "Project not found" })
    }

    const file = project.files.id(req.params.fileId)
    if (!file) {
      return res.status(404).json({ message: "File not found" })
    }

    res.json(file)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// Update file in project
router.put("/:id/files/:fileId", auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
    if (!project || !project.isActive) {
      return res.status(404).json({ message: "Project not found" })
    }

    // Check permissions
    if (req.user.role !== "admin" && project.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized" })
    }

    const file = project.files.id(req.params.fileId)
    if (!file) {
      return res.status(404).json({ message: "File not found" })
    }

    if (req.body.displayName) file.displayName = req.body.displayName
    if (req.body.notes) file.notes = req.body.notes

    await project.save()
    res.json({ message: "File updated successfully" })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// Delete file from project
router.delete("/:id/files/:fileId", auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
    if (!project || !project.isActive) {
      return res.status(404).json({ message: "Project not found" })
    }

    // Check permissions
    if (req.user.role !== "admin" && project.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized" })
    }

    project.files.id(req.params.fileId).remove()
    await project.save()

    res.json({ message: "File deleted successfully" })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// Download file from project
router.get("/:id/files/:fileId/download", auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
    if (!project || !project.isActive) {
      return res.status(404).json({ message: "Project not found" })
    }

    const file = project.files.id(req.params.fileId)
    if (!file) {
      return res.status(404).json({ message: "File not found" })
    }

    const filePath = path.join(__dirname, "..", file.path)
    res.download(filePath, file.displayName)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

module.exports = router
