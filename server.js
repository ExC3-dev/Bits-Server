const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const GRID_SIZE = 25;
const players = {};
let walls = [];

try {
  const data = fs.readFileSync("./walls.json", "utf-8");
  walls = JSON.parse(data);
  console.log("Walls loaded:", walls);
} catch (err) {
  console.log("No walls.json found or error loading it. Starting with no walls.");
}

app.use(express.static(path.join(__dirname, "public")));

function randomColor() {
  return "#" + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0");
}

function isOccupied(x, y) {
  return walls.some(w => w.x === x && w.y === y) || Object.values(players).some(p => p.x === x && p.y === y);
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join", ({ username }) => {
    let x, y;
    let tries = 0;
    do {
      x = Math.floor(Math.random() * GRID_SIZE);
      y = Math.floor(Math.random() * GRID_SIZE);
      tries++;
    } while (isOccupied(x, y) && tries < 1000);

    const color = randomColor();
    players[socket.id] = { x, y, color, username, lastDir: null };

    console.log(`${username} joined at (${x},${y})`);
  });

  socket.on("move", ({ dir, shift }) => {
    const p = players[socket.id];
    if (!p) return;

    const directions = {
      up: [0, -1],
      down: [0, 1],
      left: [-1, 0],
      right: [1, 0],
    };

    const delta = directions[dir];
    if (!delta) return;

    const [dx, dy] = delta;
    const targetX = p.x + dx;
    const targetY = p.y + dy;

    if (targetX < 0 || targetX >= GRID_SIZE || targetY < 0 || targetY >= GRID_SIZE) return;

    if (shift) {
      const wallIndex = walls.findIndex(w => w.x === targetX && w.y === targetY);
      if (wallIndex !== -1) {
        walls.splice(wallIndex, 1);
        console.log(`${p.username} removed wall at (${targetX}, ${targetY})`);
      }
      return;
    }

    if (!isOccupied(targetX, targetY)) {
      p.x = targetX;
      p.y = targetY;
      p.lastDir = dir;
    }
  });

  socket.on("placeWall", () => {
    const p = players[socket.id];
    if (!p) return;

    if (!walls.some(w => w.x === p.x && w.y === p.y)) {
      walls.push({ x: p.x, y: p.y, color: p.color });
    }
  });

  socket.on("disconnect", () => {
    delete players[socket.id];
  });
});

setInterval(() => {
  io.emit("update", { players, walls });
}, 1000 / 20);

http.listen(PORT, () => {
  console.log(`Server running at ${PORT}`);
});
