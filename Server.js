
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

let players = {};

io.on("connection", (socket) => {
  console.log("User connected", socket.id);

  players[socket.id] = {
    id: socket.id,
    x: Math.floor(Math.random() * 100),
    y: Math.floor(Math.random() * 100),
    color: "#" + Math.floor(Math.random() * 16777215).toString(16),
    username: "Guest"
  };

  socket.emit("init", players);
  socket.broadcast.emit("player_join", players[socket.id]);

  socket.on("move", (dir) => {
    const p = players[socket.id];
    if (!p) return;
    if (dir === "left") p.x--;
    if (dir === "right") p.x++;
    if (dir === "up") p.y--;
    if (dir === "down") p.y++;
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
  console.log("Game server running on port 3000");
});
