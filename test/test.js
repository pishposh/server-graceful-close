#!/usr/bin/env node

"use strict";

var getGracefulClose = require("..");
var express = require("express");

var app = express();
app.set("etag", false);
app.set("x-powered-by", false);

app.get("/", (req, res) => {
    console.log("/");
    res.send("Hello World!\n");
});

app.get("/hang", (req, res) => {
    console.log("/hang");
});

app.get("/delay", (req, res) => {
    console.log("/delay");
    setTimeout(() => {
        console.log("/delay done");
        res.send("ok");
    }, 5000);
});

var server = app.listen(3000, () => {
    console.log("Example app listening on port 3000!");
});
server.gracefulClose = getGracefulClose(server);

process.on("SIGINT", () => { server.gracefulClose(5000) });
