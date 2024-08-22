const express = require("express");
const mysql = require("mysql");
const bodyParser = require("body-parser");
const session = require("express-session");
const bcrypt = require("bcrypt");
const path = require("path");
const http = require("http");
const socketIo = require("socket.io");
const authMiddleware = require("./middleware/auth");
const os = require("os");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "loginsystem",
});

db.connect((err) => {
  if (err) {
    console.log("เชื่อมต่อฐานข้อมูลล้มเหลว:", err);
  } else {
    console.log("เชื่อมต่อฐานข้อมูลสำเร็จ");
  }
});

// การตั้งค่า Express
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(
  "/adminlte",
  express.static(path.join(__dirname, "node_modules/admin-lte"))
);

app.use(
  session({
    secret: "secretkey",
    resave: false,
    saveUninitialized: true,
  })
);

// สร้าง middleware สำหรับสร้างตัวแปร pages
app.use((req, res, next) => {
  res.locals.pages = [
    { name: "Repair", path: "/repair" },
    { name: "Repair List", path: "/repair-list" },
    { name: "Chat", path: "/chat" },
    // คุณสามารถเพิ่มเพจเพิ่มเติมได้ที่นี่
  ];
  next();
});

// หน้าหลักและการเข้าสู่ระบบ
app.get("/", (req, res) => {
  res.render("login", { message: "" });
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;

  const sql = "SELECT * FROM users WHERE username = ?";
  db.query(sql, [username], (err, result) => {
    if (err)
      return res.json({
        success: false,
        message: "ข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล",
      });

    if (result.length > 0) {
      const user = result[0];
      bcrypt.compare(password, user.password, (err, isMatch) => {
        if (err)
          return res.json({
            success: false,
            message: "ข้อผิดพลาดในการตรวจสอบรหัสผ่าน",
          });

        if (isMatch) {
          req.session.loggedin = true;
          req.session.username = user.username;
          res.json({ success: true });
        } else {
          res.json({ success: false, message: "รหัสผ่านไม่ถูกต้อง" });
        }
      });
    } else {
      res.json({ success: false, message: "ไม่พบผู้ใช้งานนี้" });
    }
  });
});

// ใช้ middleware ตรวจสอบการเข้าสู่ระบบในเส้นทางที่ต้องการ
app.use("/repair", authMiddleware);
app.use("/repair-list", authMiddleware);
app.use("/repair-details", authMiddleware);
app.use("/update-repair", authMiddleware);
app.use("/chat", authMiddleware);
app.use("/dashboard", authMiddleware);

app.get("/repair", (req, res) => {
  res.render("repair", { username: req.session.username });
});

app.get("/dashboard", (req, res) => {
  res.render("dashboard", {
    username: req.session.username,
    pages: res.locals.pages, // ส่งตัวแปร pages ไปยัง view
  });
});

app.post("/repair", (req, res) => {
  const { location, description } = req.body;
  const sql =
    "INSERT INTO repairs (location, description, username) VALUES (?, ?, ?)";
  db.query(
    sql,
    [location, description, req.session.username],
    (err, result) => {
      if (err) throw err;
      res.redirect("/repair-list"); // เปลี่ยนเส้นทางไปยังหน้า repair-list
    }
  );
});

app.get("/repair-list", (req, res) => {
  const sql = "SELECT * FROM repairs ORDER BY created_at DESC";
  db.query(sql, (err, result) => {
    if (err) throw err;
    res.render("repair-list", {
      username: req.session.username,
      repairs: result,
    });
  });
});

app.get("/repair-details/:id", (req, res) => {
  const repairId = req.params.id;
  const sql = "SELECT * FROM repairs WHERE id = ?";
  db.query(sql, [repairId], (err, result) => {
    if (err) {
      console.error("Error querying database:", err);
      res.status(500).send("Internal Server Error");
      return;
    }
    if (result.length > 0) {
      res.render("repair-details", { repair: result[0] });
    } else {
      res.status(404).send("ข้อมูลไม่พบ");
    }
  });
});

app.post("/update-repair/:id", (req, res) => {
  const repairId = req.params.id;
  const { location, description } = req.body;
  const sql = "UPDATE repairs SET location = ?, description = ? WHERE id = ?";
  db.query(sql, [location, description, repairId], (err, result) => {
    if (err) {
      console.error("Error updating repair:", err);
      res.status(500).send("Internal Server Error");
      return;
    }
    res.redirect("/repair-list");
  });
});

app.get("/register", (req, res) => {
  res.render("register", { message: "" });
});

app.post("/register", (req, res) => {
  const { username, password } = req.body;

  const sql = "SELECT * FROM users WHERE username = ?";
  db.query(sql, [username], (err, result) => {
    if (err) throw err;

    if (result.length > 0) {
      res.render("register", { message: "ชื่อผู้ใช้นี้ถูกใช้งานแล้ว" });
    } else {
      bcrypt.hash(password, 10, (err, hash) => {
        if (err) throw err;

        const sql = "INSERT INTO users (username, password) VALUES (?, ?)";
        db.query(sql, [username, hash], (err, result) => {
          if (err) throw err;
          res.render("login", {
            message: "สมัครสมาชิกสำเร็จ! โปรดเข้าสู่ระบบ",
          });
        });
      });
    }
  });
});

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

app.get("/chat", (req, res) => {
  res.render("chat", { username: req.session.username });
});

io.on("connection", (socket) => {
  console.log("A user connected");

  socket.on("get username", (username) => {
    socket.username = username;
    socket.emit("username", username);
  });

  socket.on("chat message", (msg) => {
    io.emit("chat message", { user: socket.username, text: msg });
  });

  socket.on("disconnect", () => {
    console.log("User disconnected");
  });
});

const interfaces = os.networkInterfaces();
let ipAddress = "127.0.0.1";

for (let iface in interfaces) {
  for (let i = 0; i < interfaces[iface].length; i++) {
    const details = interfaces[iface][i];
    if (details.family === "IPv4" && !details.internal) {
      ipAddress = details.address;
      break;
    }
  }
}

const port = 8080;

app.get("/", (req, res) => {
  res.send("Hello, world!");
});

app.listen(port, ipAddress, () => {
  console.log(`เซิร์ฟเวอร์กำลังรันที่ http://${ipAddress}:${port}`);
});
