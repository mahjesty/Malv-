/**
 * Negative fixture: Node/Express-style entry (not a browser UI).
 * No document/window/DOM — not classified as a previewable DOM app.
 */
const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (_req, res) => {
  res.send("Hello from server.js");
});

app.listen(PORT, () => {
  console.log("Listening on " + PORT);
});
