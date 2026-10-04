require("dotenv").config();

const express = require("express");
const path = require("path");
const cors = require("cors");
const http = require("http");
const morgan = require("morgan");
const { Server } = require("socket.io");
const connectDB = require("./config/config");
const apiRoutes = require("./routes/api");
const adminRoutes = require("./routes/admin");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(morgan("dev"));
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.set("io", io);

app.use("/api", apiRoutes);
app.use("/admin", adminRoutes);
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use((req, res) => {
  if (req.path.startsWith("/api/") || req.path.startsWith("/admin/")) {
    return res.status(404).json({ message: "Route not found" });
  }
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

const port = Number(process.env.PORT) || 5000;

connectDB()
  .then(() => {
    server.listen(port, () => {
      console.log(`UTSHO running at http://localhost:${port}`);
    });
  })
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
