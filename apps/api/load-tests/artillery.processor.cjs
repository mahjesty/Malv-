"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const prompts = JSON.parse(
  fs.readFileSync(path.join(__dirname, "prompts.json"), "utf8")
);

function sample(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function applyPromptPool(req) {
  req.json = req.json || {};
  req.json.reflex_simple = sample(prompts.reflex_simple);
  req.json.normal_chat = sample(prompts.normal_chat);
  req.json.deep_reasoning = sample(prompts.deep_reasoning);
  req.json.ambiguous_clarification = sample(prompts.ambiguous_clarification);
  req.json.phased_engineering = sample(prompts.phased_engineering);
}

module.exports = {
  attachAuth: function (req, userContext, events, done) {
    const bearer = process.env.MALV_LOAD_TEST_BEARER || "";
    if (bearer) {
      req.headers = req.headers || {};
      req.headers.Authorization = `Bearer ${bearer}`;
    }
    applyPromptPool(req);
    done();
  },
  $uuid: function () {
    return crypto.randomUUID();
  }
};
