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
const walls = JSON.parse(fs.readFileSync("wall.json", "utf8"));

function isWall(x, y) {
  return walls.some(w => w.x === x && w.y === y);
}

io.on("connection", (socket) => {
  console.log("User connected", socket.id);

  players[socket.id] = {
    id: socket.id,
    x: Math.floor(Math.random() * 50),
    y: Math.floor(Math.random() * 50),
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
    if (!isWall(nx, ny) && nx >= 0 && ny >= 0 && nx < 100 && ny < 100) {
      p.x = nx;
      p.y = ny;
    }
    io.emit("update", players);
  });

  socket.on("set_name", (name) => {
    if (players[socket.id]) players[socket.id].username = name;
  });

  socket.on("disconnect", () => {
    delete players[socket.id];
    io.emit("player_leave", socket.id);
  });
});

server.listen(3000, () => {
  console.log("Server running on port 3000");
});
