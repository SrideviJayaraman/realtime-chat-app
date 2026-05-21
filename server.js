const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const CryptoJS = require("crypto-js");

// ===== APP =====
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ===== SECRETS =====
const SECRET = "mysecretkey";
const MESSAGE_SECRET = "chatappsecret";

// ===== MIDDLEWARE =====
app.use(express.json());
app.use(express.static("public"));

// ===== MONGODB =====
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log(err));

// ===== USER SCHEMA =====
const userSchema = new mongoose.Schema({
    username: String,
    password: String
});

const User = mongoose.model("User", userSchema);

// ===== ONLINE USERS =====
const onlineUsers = {};

// ===== REGISTER =====
app.post("/register", async (req, res) => {

    try {

        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                message: "Missing fields"
            });
        }

        const existingUser = await User.findOne({ username });

        if (existingUser) {
            return res.status(400).json({
                message: "User already exists"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            username,
            password: hashedPassword
        });

        await newUser.save();

        res.json({
            message: "User registered"
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            message: "Registration failed"
        });
    }
});

// ===== LOGIN =====
app.post("/login", async (req, res) => {

    try {

        const { username, password } = req.body;

        const user = await User.findOne({ username });

        if (!user) {
            return res.status(400).json({
                message: "User not found"
            });
        }

        const isMatch = await bcrypt.compare(
            password,
            user.password
        );

        if (!isMatch) {
            return res.status(400).json({
                message: "Wrong password"
            });
        }

        const token = jwt.sign(
            { username },
            SECRET,
            { expiresIn: "1h" }
        );

        res.json({ token });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            message: "Login failed"
        });
    }
});

// ===== SOCKET AUTH =====
io.use((socket, next) => {

    const token = socket.handshake.auth.token;

    if (!token) {
        return next(new Error("No token"));
    }

    try {

        const decoded = jwt.verify(token, SECRET);

        socket.user = decoded.username;

        next();

    } catch {

        next(new Error("Invalid token"));
    }
});

// ===== SOCKET CONNECTION =====
io.on("connection", (socket) => {

    console.log("User connected:", socket.user);

    const username = socket.user;

    onlineUsers[socket.id] = username;

    io.emit("onlineUsers", Object.values(onlineUsers));

    // ===== SEND MESSAGE =====
    socket.on("sendMessage", (msg) => {

        const encryptedText = CryptoJS.AES.encrypt(
            msg.text,
            MESSAGE_SECRET
        ).toString();

        msg.text = encryptedText;

        msg.status = "delivered";

        io.emit("receiveMessage", msg);
    });

    // ===== TYPING =====
    socket.on("typing", () => {

        socket.broadcast.emit("typing", username);
    });

    // ===== DELIVERY STATUS =====
    socket.on("delivered", (id) => {

        io.emit("updateStatus", {
            id,
            status: "delivered"
        });
    });

    // ===== DISCONNECT =====
    socket.on("disconnect", () => {

        delete onlineUsers[socket.id];

        io.emit(
            "onlineUsers",
            Object.values(onlineUsers)
        );

        io.emit("lastSeen", {
            user: username,
            time: new Date().toLocaleTimeString()
        });
    });
});

// ===== START SERVER =====
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});