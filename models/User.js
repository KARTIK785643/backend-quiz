const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    username: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    correctAnswer: { type: Number, default: 0 } // ✅ Ensuring it's a Number
});

module.exports = mongoose.model("User", userSchema);
