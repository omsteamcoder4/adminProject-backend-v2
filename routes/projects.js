const express = require("express")
const multer = require("multer")
const path = require("path")
const crypto = require("crypto")
const fs = require("fs")
const sharp = require("sharp")
const Project = require("../models/Project")
const auth = require("../middleware/auth")
const router = express.Router()

// Ensure uploads directory exists
const uploadsDir = "uploads"
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}

// Configure multer for file uploads with folder support
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
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit for folders
  fileFilter: (req, file, cb) => {
    // Allow all file types including folders
    cb(null, true)
  },
})

// Helper function to convert images to WebP
const convertToWebP = async (inputPath, outputPath) => {
  try {
    await sharp(inputPath).webp({ quality: 80 }).toFile(outputPath)
    // Delete original file after conversion
    fs.unlinkSync(inputPath)
    return true
  } catch (error) {
    console.error("Error converting to WebP:", error)
    return false
  }
}

// Helper function to check if file is an image
const isImageFile = (mimetype) => {
  return mimetype && mimetype.startsWith("image/")
}

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

// Upload files to project (for authenticated users)
router.post("/:id/upload", auth, upload.array("files", 50), async (req, res) => {
  try {
    const { notes, sessionId } = req.body
    const project = await Project.findById(req.params.id)

    if (!project || !project.isActive) {
      return res.status(404).json({ message: "Project not found" })
    }

    // Check permissions - admin or project owner can upload
    if (req.user.role !== "admin" && project.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized" })
    }

    const uploadedFiles = []

    for (const file of req.files) {
      let finalPath = file.path
      let finalMimetype = file.mimetype

      // Convert images to WebP
      if (isImageFile(file.mimetype)) {
        const webpPath = file.path.replace(path.extname(file.path), ".webp")
        const converted = await convertToWebP(file.path, webpPath)
        if (converted) {
          finalPath = webpPath
          finalMimetype = "image/webp"
        }
      }

      uploadedFiles.push({
        originalName: file.originalname,
        displayName: file.originalname,
        filename: path.basename(finalPath),
        path: finalPath,
        mimetype: finalMimetype,
        size: file.size,
        uploadedBy: req.user.username,
        notes: notes || "",
      })
    }

    if (sessionId) {
      // Add to existing session
      const session = project.sessions.find((s) => s.sessionId === sessionId)
      if (session) {
        session.files.push(...uploadedFiles)
      } else {
        return res.status(404).json({ message: "Session not found" })
      }
    } else {
      // Create new session
      const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      const newSession = {
        sessionId: newSessionId,
        notes: notes || "",
        uploadedBy: req.user.username,
        files: uploadedFiles,
      }
      project.sessions.push(newSession)
    }

    await project.save()
    res.json({ message: "Files uploaded successfully", files: uploadedFiles })
  } catch (error) {
    console.error("Upload error:", error)
    res.status(500).json({ message: error.message })
  }
})

// Delete entire session
router.delete("/:id/sessions/:sessionId", auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)

    if (!project || !project.isActive) {
      return res.status(404).json({ message: "Project not found" })
    }

    // Check permissions
    if (req.user.role !== "admin" && project.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized" })
    }

    const sessionIndex = project.sessions.findIndex((s) => s.sessionId === req.params.sessionId)
    if (sessionIndex === -1) {
      return res.status(404).json({ message: "Session not found" })
    }

    // Delete physical files
    const session = project.sessions[sessionIndex]
    for (const file of session.files) {
      try {
        const filePath = path.join(__dirname, "..", file.path)
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath)
        }
      } catch (error) {
        console.error("Error deleting file:", error)
      }
    }

    // Remove session from project
    project.sessions.splice(sessionIndex, 1)
    await project.save()

    res.json({ message: "Session deleted successfully" })
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

    const shareUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/share/${shareToken}`
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
    }).populate("createdBy", "username")

    if (!project) {
      return res.status(404).json({ message: "Share link expired or invalid" })
    }

    res.json({
      _id: project._id,
      name: project.name,
      details: project.details,
      type: project.type,
      phoneNumber: project.phoneNumber,
      sessions: project.sessions,
      createdBy: project.createdBy,
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

// Upload files to shared project (with session support)
router.post("/share/:token/upload", upload.array("files", 50), async (req, res) => {
  try {
    const { notes, sessionId } = req.body
    const project = await Project.findOne({
      shareLink: req.params.token,
      shareLinkExpiry: { $gt: new Date() },
      isActive: true,
    })

    if (!project) {
      return res.status(404).json({ message: "Share link expired or invalid" })
    }

    const uploadedFiles = []

    for (const file of req.files) {
      let finalPath = file.path
      let finalMimetype = file.mimetype

      // Convert images to WebP
      if (isImageFile(file.mimetype)) {
        const webpPath = file.path.replace(path.extname(file.path), ".webp")
        const converted = await convertToWebP(file.path, webpPath)
        if (converted) {
          finalPath = webpPath
          finalMimetype = "image/webp"
        }
      }

      uploadedFiles.push({
        originalName: file.originalname,
        displayName: file.originalname,
        filename: path.basename(finalPath),
        path: finalPath,
        mimetype: finalMimetype,
        size: file.size,
        uploadedBy: req.ip,
        notes: notes || "",
      })
    }

    if (sessionId) {
      // Add to existing session or create new session
      let session = project.sessions.find((s) => s.sessionId === sessionId)

      if (session) {
        // Add files to existing session
        session.files.push(...uploadedFiles)
      } else {
        // Create new session
        session = {
          sessionId: sessionId,
          notes: notes || "",
          uploadedBy: req.ip,
          files: uploadedFiles,
        }
        project.sessions.push(session)
      }
    } else {
      // Create new session with generated ID
      const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      const newSession = {
        sessionId: newSessionId,
        notes: notes || "",
        uploadedBy: req.ip,
        files: uploadedFiles,
      }
      project.sessions.push(newSession)
    }

    await project.save()
    res.json({ message: "Files uploaded successfully", files: uploadedFiles })
  } catch (error) {
    console.error("Share upload error:", error)
    res.status(500).json({ message: error.message })
  }
})

// Update session notes
router.put("/:id/sessions/:sessionId", auth, async (req, res) => {
  try {
    const { notes } = req.body
    const project = await Project.findById(req.params.id)

    if (!project || !project.isActive) {
      return res.status(404).json({ message: "Project not found" })
    }

    // Check permissions
    if (req.user.role !== "admin" && project.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized" })
    }

    const session = project.sessions.find((s) => s.sessionId === req.params.sessionId)
    if (!session) {
      return res.status(404).json({ message: "Session not found" })
    }

    session.notes = notes
    await project.save()

    res.json({ message: "Session notes updated successfully" })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// Update session notes via share link
router.put("/share/:token/sessions/:sessionId", async (req, res) => {
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

    const session = project.sessions.find((s) => s.sessionId === req.params.sessionId)
    if (!session) {
      return res.status(404).json({ message: "Session not found" })
    }

    session.notes = notes
    await project.save()

    res.json({ message: "Session notes updated successfully" })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// Update file name (backward compatibility)
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

    // Try to find file in sessions first
    let fileFound = false
    for (const session of project.sessions) {
      const file = session.files.id(req.params.fileId)
      if (file) {
        file.displayName = displayName
        fileFound = true
        break
      }
    }

    // If not found in sessions, try legacy files array
    if (!fileFound) {
      const file = project.files.id(req.params.fileId)
      if (file) {
        file.displayName = displayName
        fileFound = true
      }
    }

    if (!fileFound) {
      return res.status(404).json({ message: "File not found" })
    }

    await project.save()
    res.json({ message: "File name updated successfully" })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// Delete file (with permission checks)
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

    // For public and auth projects, clients can delete files
    if (project.type === "public" || project.type === "auth") {
      // Try to find and remove file from sessions first
      let fileFound = false
      for (const session of project.sessions) {
        const file = session.files.id(req.params.fileId)
        if (file) {
          file.remove()
          fileFound = true
          break
        }
      }

      // If not found in sessions, try legacy files array
      if (!fileFound) {
        const file = project.files.id(req.params.fileId)
        if (file) {
          file.remove()
          fileFound = true
        }
      }

      if (!fileFound) {
        return res.status(404).json({ message: "File not found" })
      }

      await project.save()
      res.json({ message: "File deleted successfully" })
    } else {
      return res.status(403).json({ message: "Not authorized to delete files" })
    }
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// Download file with format conversion for images
router.get("/share/:token/files/:fileId/download", async (req, res) => {
  try {
    const { format } = req.query
    const project = await Project.findOne({
      shareLink: req.params.token,
      shareLinkExpiry: { $gt: new Date() },
      isActive: true,
    })

    if (!project) {
      return res.status(404).json({ message: "Share link expired or invalid" })
    }

    let file = null

    // Try to find file in sessions first
    for (const session of project.sessions) {
      const sessionFile = session.files.id(req.params.fileId)
      if (sessionFile) {
        file = sessionFile
        break
      }
    }

    // If not found in sessions, try legacy files array
    if (!file) {
      file = project.files.id(req.params.fileId)
    }

    if (!file) {
      return res.status(404).json({ message: "File not found" })
    }

    const filePath = path.join(__dirname, "..", file.path)

    // If it's an image and format conversion is requested
    if (isImageFile(file.mimetype) && format && format !== "original") {
      const tempPath = path.join(__dirname, "..", "uploads", `temp_${Date.now()}.${format}`)

      try {
        await sharp(filePath)[format]({ quality: 90 }).toFile(tempPath)
        const newFileName = file.displayName.replace(path.extname(file.displayName), `.${format}`)

        res.download(tempPath, newFileName, (err) => {
          // Clean up temp file
          if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath)
          }
        })
      } catch (error) {
        console.error("Error converting image:", error)
        res.download(filePath, file.displayName)
      }
    } else {
      res.download(filePath, file.displayName)
    }
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

    let file = null

    // Try to find file in sessions first
    for (const session of project.sessions) {
      const sessionFile = session.files.id(req.params.fileId)
      if (sessionFile) {
        file = sessionFile
        break
      }
    }

    // If not found in sessions, try legacy files array
    if (!file) {
      file = project.files.id(req.params.fileId)
    }

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

    let file = null

    // Try to find file in sessions first
    for (const session of project.sessions) {
      const sessionFile = session.files.id(req.params.fileId)
      if (sessionFile) {
        file = sessionFile
        break
      }
    }

    // If not found in sessions, try legacy files array
    if (!file) {
      file = project.files.id(req.params.fileId)
    }

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

// Delete file from project (with enhanced permissions)
router.delete("/:id/files/:fileId", auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
    if (!project || !project.isActive) {
      return res.status(404).json({ message: "Project not found" })
    }

    // Enhanced permission check:
    // - Admin can delete any file
    // - Project owner can delete files from their project
    // - Regular users cannot delete files from other users' projects
    const canDelete = req.user.role === "admin" || project.createdBy.toString() === req.user.id

    if (!canDelete) {
      return res.status(403).json({ message: "Not authorized to delete files from this project" })
    }

    let fileFound = false

    // Remove from session files
    for (const session of project.sessions) {
      const fileIndex = session.files.findIndex((f) => f._id.toString() === req.params.fileId)
      if (fileIndex !== -1) {
        session.files.splice(fileIndex, 1)
        fileFound = true
        break
      }
    }

    // Remove from legacy top-level files array
    if (!fileFound) {
      const fileIndex = project.files.findIndex((f) => f._id.toString() === req.params.fileId)
      if (fileIndex !== -1) {
        project.files.splice(fileIndex, 1)
        fileFound = true
      }
    }

    if (!fileFound) {
      return res.status(404).json({ message: "File not found" })
    }

    await project.save()
    res.json({ message: "File deleted successfully" })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// Download file from project with format conversion
router.get("/:id/files/:fileId/download", auth, async (req, res) => {
  try {
    const { format } = req.query
    const project = await Project.findById(req.params.id)
    if (!project || !project.isActive) {
      return res.status(404).json({ message: "Project not found" })
    }

    let file = null

    // Try to find file in sessions first
    for (const session of project.sessions) {
      const sessionFile = session.files.id(req.params.fileId)
      if (sessionFile) {
        file = sessionFile
        break
      }
    }

    // If not found in sessions, try legacy files array
    if (!file) {
      file = project.files.id(req.params.fileId)
    }

    if (!file) {
      return res.status(404).json({ message: "File not found" })
    }

    const filePath = path.join(__dirname, "..", file.path)

    // If it's an image and format conversion is requested
    if (isImageFile(file.mimetype) && format && format !== "original") {
      const tempPath = path.join(__dirname, "..", "uploads", `temp_${Date.now()}.${format}`)

      try {
        await sharp(filePath)[format]({ quality: 90 }).toFile(tempPath)
        const newFileName = file.displayName.replace(path.extname(file.displayName), `.${format}`)

        res.download(tempPath, newFileName, (err) => {
          // Clean up temp file
          if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath)
          }
        })
      } catch (error) {
        console.error("Error converting image:", error)
        res.download(filePath, file.displayName)
      }
    } else {
      res.download(filePath, file.displayName)
    }
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// Bulk download files with format options
router.post("/:id/files/bulk-download", auth, async (req, res) => {
  try {
    const { fileIds, imageFormat = "original" } = req.body
    const project = await Project.findById(req.params.id)

    if (!project || !project.isActive) {
      return res.status(404).json({ message: "Project not found" })
    }

    const archiver = require("archiver")
    const archive = archiver("zip", { zlib: { level: 9 } })

    res.attachment(`${project.name}_files.zip`)
    archive.pipe(res)

    for (const fileId of fileIds) {
      let file = null

      // Find file in sessions
      for (const session of project.sessions) {
        const sessionFile = session.files.id(fileId)
        if (sessionFile) {
          file = sessionFile
          break
        }
      }

      if (!file) {
        file = project.files.id(fileId)
      }

      if (file) {
        const filePath = path.join(__dirname, "..", file.path)

        if (isImageFile(file.mimetype) && imageFormat !== "original") {
          const tempPath = path.join(__dirname, "..", "uploads", `temp_${Date.now()}.${imageFormat}`)
          try {
            await sharp(filePath)[imageFormat]({ quality: 90 }).toFile(tempPath)
            const newFileName = file.displayName.replace(path.extname(file.displayName), `.${imageFormat}`)
            archive.file(tempPath, { name: newFileName })
          } catch (error) {
            archive.file(filePath, { name: file.displayName })
          }
        } else {
          archive.file(filePath, { name: file.displayName })
        }
      }
    }

    archive.finalize()
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

module.exports = router
