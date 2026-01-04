// server.js
import http from "http";
import fs from "fs";

const PORT = process.env.PORT || 10000;

http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(fs.readFileSync("index.html"));
}).listen(PORT, () => console.log("Server running on port", PORT));
