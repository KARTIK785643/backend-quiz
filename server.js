const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");
const { Server } = require("socket.io");
const http = require("http");

require("dotenv").config();

const User = require(path.join(__dirname, "models", "User"));
const Quiz = require(path.join(__dirname, "models", "Quiz"));

const app = express();
const httpServer = http.createServer(app);

// ✅ Define allowedOrigins BEFORE using it
const allowedOrigins = [
  "https://frontend-quiz-ten.vercel.app",
  "https://frontend-quiz-ten.vercel.app/"
];

// ✅ Use allowedOrigins in socket.io
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"]
  }
});

// ✅ CORS Middleware
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.static(path.join(__dirname, "build")));
app.use(express.json({ limit: "50mb" }));
app.use(bodyParser.json({ limit: "50mb" }));

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://kartik4023:Kartik123@mediquiz.ovwzn.mongodb.net/myquizDB?retryWrites=true&w=majority&appName=Mediquiz";
const JWT_SECRET = process.env.JWT_SECRET || "your_secret_key";

// ✅ Auth Middleware
const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "No token, authorization denied" });
    }

    const token = authHeader.startsWith("Bearer ")
      ? authHeader.substring(7)
      : authHeader;

    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error.message);
    res.status(401).json({ error: "Token is not valid" });
  }
};

// ✅ API Endpoints
app.get("/", (req, res) => {
  res.json({
    message: "Quiz API server is running",
    endpoints: {
      auth: ["/register", "/login", "/profile"],
      quizzes: ["/api/quizzes", "/api/quizzes/:id", "/api/quizzes/:id/link"],
      system: ["/health"]
    }
  });
});

app.get("/register", (req, res) => {
  res.send("✅ You have reached the /register endpoint. Please send a POST request to register a new user.");
});

app.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ error: "Username or Email already exists." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      username,
      email,
      password: hashedPassword
    });

    await newUser.save();
    res.status(201).json({ message: "User registered successfully." });

  } catch (error) {
    console.error("❌ Registration Error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

app.get("/login", (req, res) => {
  res.send("🔐 Please use POST /login with email and password in the body.");
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log("🔍 Login Attempt:", { email });

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: "Invalid email" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid password!" });
    }

    console.log("✅ Login successful:", { userId: user._id });

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: "7d" });

    res.status(200).json({
      message: "Login successful!",
      token,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    console.error("❌ Login Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/profile", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("username email");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ user });
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/quizzes", authMiddleware, async (req, res) => {
  try {
    const quizzes = await Quiz.find({ creator: req.userId });
    res.json(quizzes);
  } catch (error) {
    console.error("Error fetching quizzes:", error);
    res.status(500).json({ error: "Server error fetching quizzes" });
  }
});

app.get("/api/quizzes/:id", async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) {
      return res.status(404).json({ message: "Quiz not found" });
    }
    res.json(quiz);
  } catch (error) {
    console.error("Error fetching quiz:", error);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/quizzes", authMiddleware, async (req, res) => {
  try {
    const { title, description, image, audio, questions } = req.body;

    if (!title || !questions || !questions.length) {
      return res.status(400).json({ message: "Title and questions are required!" });
    }

    const newQuiz = new Quiz({
      title,
      description,
      image,
      audio,
      questions,
      creator: req.userId
    });

    const savedQuiz = await newQuiz.save();
    res.status(201).json(savedQuiz);
  } catch (error) {
    console.error("Error creating quiz:", error);
    res.status(400).json({ message: error.message });
  }
});

app.delete("/api/quizzes/:id", async (req, res) => {
  try {
    const deletedQuiz = await Quiz.findByIdAndDelete(req.params.id);
    if (!deletedQuiz) {
      return res.status(404).json({ message: "Quiz not found" });
    }
    res.json({ message: "✅ Quiz deleted successfully" });
  } catch (error) {
    console.error("Error deleting quiz:", error);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/quizzes/:quizId/submit", authMiddleware, async (req, res) => {
  try {
    const { quizId } = req.params;
    const { answers } = req.body;
    const userId = req.userId;

    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    let correctCount = 0;
    quiz.questions.forEach((q, idx) => {
      if (String(q.correctAnswer).trim() === String(answers[idx]).trim()) {
        correctCount++;
      }
    });

    await User.findByIdAndUpdate(
      userId,
      { $inc: { correctAnswer: correctCount } },
      { new: true }
    );

    await Quiz.findByIdAndUpdate(
      quizId,
      { $push: { results: { userId: userId, score: correctCount } } }
    );

    setTimeout(async () => {
      const updatedLeaderboard = await User.find()
        .sort({ correctAnswer: -1 })
        .select("username correctAnswer");

      io.emit("leaderboardUpdated", updatedLeaderboard);
    }, 500);

    res.status(200).json({ message: "Quiz submitted!", correctAnswers: correctCount });
  } catch (error) {
    console.error("Error submitting quiz:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/submit-quiz", async (req, res) => {
  try {
    const { quizId, userId, answers } = req.body;
    const quiz = await Quiz.findById(quizId);
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    let correctCount = 0;
    quiz.questions.forEach((q, index) => {
      if (answers[index] === q.correctAnswer) {
        correctCount++;
      }
    });

    await Quiz.findByIdAndUpdate(
      quizId,
      { $push: { results: { userId, score: correctCount } } },
      { new: true }
    );

    await User.findByIdAndUpdate(userId, { $inc: { correctAnswer: correctCount } });

    res.json({ message: "Quiz submitted successfully", correctCount });
  } catch (error) {
    console.error("Error submitting quiz:", error);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/leaderboard", async (req, res) => {
  try {
    const users = await User.find()
      .sort({ correctAnswer: -1 })
      .select("username correctAnswer");

    let rank = 1;
    let previousScore = null;
    let sameRankCount = 0;

    const leaderboard = users.map((user) => {
      if (user.correctAnswer === previousScore) {
        sameRankCount++;
      } else {
        rank += sameRankCount;
        sameRankCount = 1;
      }

      previousScore = user.correctAnswer;

      return {
        rank,
        username: user.username
      };
    });

    res.status(200).json(leaderboard);
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// ✅ Socket.IO Connection
const getLeaderboard = async () => {
  return await User.find()
    .sort({ correctAnswer: -1 })
    .select("username correctAnswer");
};

io.on("connection", (socket) => {
  console.log("🔗 New client connected:", socket.id);
  getLeaderboard().then((leaderboard) => {
    socket.emit("leaderboardUpdated", leaderboard);
  });

  socket.on("disconnect", () => {
    console.log("❌ Client disconnected:", socket.id);
  });
});

// ✅ MongoDB Connection and Server Start
console.log("Attempting to connect to MongoDB...");
mongoose.set("debug", true);
mongoose.set("strictQuery", false);

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => {
    console.log("✅ MongoDB connected successfully");
    httpServer.listen(PORT, () => {
      console.log(`🚀 Server with Socket.IO running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

module.exports = app;
