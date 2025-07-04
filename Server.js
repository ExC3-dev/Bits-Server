const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

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
    const x = Math.floor(Math.random() * 100);
    const y = Math.floor(Math.random() * 100);
    if (!isWall(x, y) && !isOccupied(x, y)) return { x, y };
    attempts++;
  }
  return { x: 0, y: 0 }; // fallback
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

  socket.on("move", (dir) => {
    const p = players[socket.id];
    if (!p) return;
    let nx = p.x, ny = p.y;
    if (dir === "left") nx--;
    if (dir === "right") nx++;
    if (dir === "up") ny--;
    if (dir === "down") ny++;
    if (!isWall(nx, ny) && !isOccupied(nx, ny)) {
      p.x = nx;
      p.y = ny;
    }
    io.emit("update", players);
  });

  socket.on("set_name", (name) => {
    if (players[socket.id]) players[socket.id].username = name;
  });

  socket.on("boom_wall", () => {
    const wall = players[socket.id];
    if (!wall) return;
    for (let id in players) {
      const p = players[id];
      if (p.x === wall.x && p.y === wall.y) {
        const directions = [[0, -1], [0, 1], [-1, 0], [1, 0]];
        const [dx, dy] = directions[Math.floor(Math.random() * directions.length)];
        const nx = p.x + dx;
        const ny = p.y + dy;
        if (!isWall(nx, ny) && !isOccupied(nx, ny)) {
          p.x = nx;
          p.y = ny;
        }
      }
    }
    walls.push({ x: wall.x, y: wall.y });
    io.emit("wall_added", { x: wall.x, y: wall.y });
    io.emit("update", players);
  });

  socket.on("chat_message", (data) => {
    const name = players[socket.id]?.username || "Anonymous";
    io.emit("chat_message", { name, msg: data.msg });
  });

  socket.on("disconnect", () => {
    delete players[socket.id];
    io.emit("player_leave", socket.id);
  });
});

server.listen(3000, () => {
  console.log("Server running on port 3000");
});

