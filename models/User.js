const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    username : { type: String, required: true, unique: true },
    password : { type: String, required: true },
    role     : { type: String, enum: ["admin", "user"], default: "user" },
    isActive : { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Only comparePassword remains
const bcrypt = require("bcryptjs");
userSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
