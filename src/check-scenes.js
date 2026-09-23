#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { allFixtures, validateScene } from "./case-engine.js";

function usage() {
  return [
    "Usage: node src/check-scenes.js <scene.json>",
    "",
    "Validates one scene and reports its named fixture inventory.",
    "Exit 0: valid scene. Exit 2: invalid scene or unreadable file."
  ].join("\n");
}

const argument = process.argv[2];
if (!argument || argument === "--help" || argument === "-h") {
  console.log(usage());
  process.exitCode = argument ? 0 : 2;
} else {
  try {
    const input = JSON.parse(await readFile(argument, "utf8"));
    const scene = validateScene(input);
    const fixtures = allFixtures(scene);
    console.log(`Scene: ${scene.id}`);
    console.log(`Named fixtures: ${fixtures.length}`);
    console.log(`Result: valid`);
  } catch (error) {
    const path = error && typeof error === "object" && "path" in error ? ` at ${error.path}` : "";
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Scene check failed${path}: ${message}`);
    process.exitCode = 2;
  }
}
