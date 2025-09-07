const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require('path');
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'dist')));

//Basic working working with API CONFIGURATION

app.use(
  cors({
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  })
);

app.use(bodyParser.json());

app.get("/api/ping", (req, res) => {
  res.json({ message: "pong" });
});


app.listen(3001, () => {
  console.log("Server running on http://localhost:3001");
});



module.exports = app;
