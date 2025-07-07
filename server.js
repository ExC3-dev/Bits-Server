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

// Load walls from walls.json
try {
  const data = fs.readFileSync('./walls.json', 'utf-8');
  walls = JSON.parse(data);
  console.log("Walls loaded:", walls);
} catch (e) {
  console.log("No walls.json found or error loading it, starting with empty walls.");
  walls = [];
}

app.use(express.static(path.join(__dirname, "public")));

function randomColor() {
  return '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
}

// Helper: Check if a tile is occupied by wall or player
function isOccupied(x, y) {
  if (walls.some(w => w.x === x && w.y === y)) return true;
  for (const id in players) {
    const p = players[id];
    if (p.x === x && p.y === y) return true;
  }
  return false;
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join", ({ username }) => {
    // Assign random color server-side, ignore client color for consistency
    const color = randomColor();

    // Find a spawn spot NOT in a wall or player
    let x, y;
    let tries = 0;
    do {
      x = Math.floor(Math.random() * GRID_SIZE);
      y = Math.floor(Math.random() * GRID_SIZE);
      tries++;
      if (tries > 1000) break; // fail-safe
    } while (isOccupied(x, y));

    players[socket.id] = { x, y, color, username, lastDir: null };
    console.log(`Player ${username} spawned at (${x},${y}) with color ${color}`);
  });


  socket.on('chat', async msg => {
    const p = players[socket.id];
    if (!p) return;

    try {
      const response = await fetch(`https://www.purgomalum.com/service/json?text=${encodeURIComponent(msg)}`);
      const data = await response.json();
      const filtered = data.result || msg;

      io.emit('chat', { username: p.username, message: filtered });

    } catch (e) {
      
      io.emit('chat', { username: p.username, message: msg });
    }
  });
  
  socket.on("move", ({ dir, shift }) => {
    const p = players[socket.id];
    if (!p) return;

    // If shift held + direction => remove wall
    if (shift && p.lastDir !== null) {
      // Use current dir for removal, else fallback to lastDir
      const removeDir = dir || p.lastDir;

      let targetX = p.x;
      let targetY = p.y;

      switch (removeDir) {
        case "up": targetY--; break;
        case "down": targetY++; break;
        case "left": targetX--; break;
        case "right": targetX++; break;
      }
      // Clamp inside grid
      if (targetX >= 0 && targetX < GRID_SIZE && targetY >= 0 && targetY < GRID_SIZE) {
        // Find wall index at that spot
        const wallIndex = walls.findIndex(w => w.x === targetX && w.y === targetY);
        if (wallIndex !== -1) {
          walls.splice(wallIndex, 1);
          console.log(`Wall removed at (${targetX},${targetY}) by ${p.username}`);
        }
      }
      return; // Don't move when shift held
    }

    // Normal movement
    let newX = p.x;
    let newY = p.y;

    switch (dir) {
      case "up": newY--; break;
      case "down": newY++; break;
      case "left": newX--; break;
      case "right": newX++; break;
    }

    // Clamp inside grid
    newX = Math.max(0, Math.min(GRID_SIZE - 1, newX));
    newY = Math.max(0, Math.min(GRID_SIZE - 1, newY));

    // Block if occupied by player or wall
    if (isOccupied(newX, newY)) return;

    p.x = newX;
    p.y = newY;
    p.lastDir = dir; // Track last successful move dir
  });

  socket.on("placeWall", () => {
    const p = players[socket.id];
    if (!p) return;

    // Avoid duplicate walls
    if (walls.some(w => w.x === p.x && w.y === p.y)) return;

    walls.push({ x: p.x, y: p.y, color: p.color });
  });

  socket.on("disconnect", () => {
    delete players[socket.id];
  });
});

setInterval(() => {
  io.emit("update", { players, walls });
}, 1000 / 20);

http.listen(PORT, () => console.log(`Server running on port ${PORT}`));
