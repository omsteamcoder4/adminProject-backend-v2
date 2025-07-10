// const mongoose = require("mongoose")
// const bcrypt = require("bcryptjs")

// const userSchema = new mongoose.Schema(
//   {
//     username: { type: String, required: true, unique: true },
//     password: { type: String, required: true },
//     role: { type: String, enum: ["admin", "user"], default: "user" },
//     isActive: { type: Boolean, default: true },
//   },
//   {
//     timestamps: true,
//   },
// )

// userSchema.pre("save", async function (next) {
//   if (!this.isModified("password")) return next()
//   // Remove this line if already hashed manually
//   next()
// })


// userSchema.methods.comparePassword = async function (password) {
//     console.log(password,this.password);
    
//   return await bcrypt.compare(password, this.password)
// }

// module.exports = mongoose.model("User", userSchema)

const mongoose = require("mongoose")
const bcrypt = require("bcryptjs")

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["admin", "user"], default: "user" },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  },
)

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next()
  this.password = await bcrypt.hash(this.password, 10)
  next()
})
userSchema.methods.comparePassword = async function (password) {
  console.log(password, this.password)

  return await bcrypt.compare(password, this.password)
}

module.exports = mongoose.model("User", userSchema)
