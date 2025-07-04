const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.static("public"));

let players = {};
let walls = JSON.parse(fs.readFileSync("wall.json", "utf8"));

function isWall(x, y) {
  return walls.some(w => w.x === x && w.y === y);
}

function isOccupied(x, y) {
  return Object.values(players).some(p => p.x === x && p.y === y);
}

function findSafePosition() {
  let attempts = 0;
  while (attempts < 1000) {
    const x = Math.floor(Math.random() * 250);
    const y = Math.floor(Math.random() * 250);
    if (!isWall(x, y) && !isOccupied(x, y)) return { x, y };
    attempts++;
  }
  return { x: 0, y: 0 };
}

async function filterMessage(msg) {
  try {
    const res = await axios.post("https://www.purgomalum.com/service/json", null, {
      params: { text: msg }
    });
    return res.data.result;
  } catch (e) {
    return msg.replace(/(badword1|badword2|badword3)/gi, "***");
  }
}

io.on("connection", (socket) => {
  console.log("User connected", socket.id);

  const spawn = findSafePosition();
  players[socket.id] = {
    id: socket.id,
    x: spawn.x,
    y: spawn.y,
    color: "#" + Math.floor(Math.random() * 16777215).toString(16),
    username: "Guest"
  };

  socket.emit("init", { players, walls });
  socket.broadcast.emit("player_join", players[socket.id]);
  io.emit("chat_message", { name: "System", msg: `${players[socket.id].username} joined.` });

  socket.on("move", (dir) => {
    const p = players[socket.id];
    if (!p) return;
    let nx = p.x, ny = p.y;
    if (dir === "left") nx--;
    if (dir === "right") nx++;
    if (dir === "up") ny--;
    if (dir === "down") ny++;
    if (nx >= 0 && ny >= 0 && nx < 250 && ny < 250 && !isWall(nx, ny) && !isOccupied(nx, ny)) {
      p.x = nx;
      p.y = ny;
    }
    io.emit("update", players);
  });

  socket.on("set_name", (name) => {
    if (players[socket.id]) players[socket.id].username = name;
    io.emit("update", players);
  });

  socket.on("boom_wall", () => {
    const wall = players[socket.id];
    if (!wall) return;
    const collision = Object.values(players).some(p => p.id !== socket.id && p.x === wall.x && p.y === wall.y);
    if (!collision && !isWall(wall.x, wall.y)) {
      walls.push({ x: wall.x, y: wall.y });
      io.emit("wall_added", { x: wall.x, y: wall.y });
    }
    io.emit("update", players);
  });

  socket.on("chat_message", async (data) => {
    const name = players[socket.id]?.username || "Anonymous";
    const cleanMsg = await filterMessage(data.msg);
    io.emit("chat_message", { name, msg: cleanMsg });
  });

  socket.on("disconnect", () => {
    const name = players[socket.id]?.username || "Guest";
    io.emit("chat_message", { name: "System", msg: `${name} left.` });
    delete players[socket.id];
    io.emit("player_leave", socket.id);
  });
});

server.listen(3000, () => {
  console.log("Server running on port 3000");
});
