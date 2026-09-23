import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  allFixtures,
  generateHostileFixtures,
  hostileRules,
  isolateRender,
  planMatrix,
  validateScene
} from "../src/case-engine.js";

const sceneUrl = new URL("../examples/flight-status.scene.json", import.meta.url);
const scene = JSON.parse(await readFile(sceneUrl, "utf8"));

test("the built-in catalogue contains at least twelve named, explained rules", () => {
  assert.ok(hostileRules.length >= 12);
  assert.equal(new Set(hostileRules.map((rule) => rule.id)).size, hostileRules.length);
  assert.ok(hostileRules.every((rule) => rule.name && rule.rationale));
});

test("hostile generation is deterministic and traceable", () => {
  const first = generateHostileFixtures(scene);
  const second = generateHostileFixtures(scene);
  assert.deepEqual(second, first);
  assert.ok(first.every((fixture) => fixture.trace.rule && fixture.trace.seed && fixture.trace.field));
});

test("explicit and generated fixtures retain human-readable names", () => {
  const fixtures = allFixtures(scene);
  assert.ok(fixtures.some((fixture) => fixture.name === "Missing airline logo"));
  assert.ok(fixtures.some((fixture) => fixture.name.includes("German compound label")));
  assert.ok(fixtures.every((fixture) => !fixture.name.match(/^[a-f0-9]{12,}$/)));
});

test("matrix dimensions expand in a stable order", () => {
  const dimensions = {
    viewports: [{ name: "compact", width: 280 }, { name: "wide", width: 480 }],
    themes: ["light", "dark"],
    directions: ["ltr", "rtl"]
  };
  const ids = ["baseline", "missing-logo"];
  const first = planMatrix(scene, ids, dimensions);
  const second = planMatrix(scene, ids, dimensions);
  assert.equal(first.length, 16);
  assert.deepEqual(second, first);
  assert.equal(first[0].id, "flight-status--baseline--280--light--ltr");
});

test("a render exception is isolated to its frame", () => {
  const [frame] = planMatrix(
    scene,
    ["baseline"],
    {
      viewports: [{ name: "compact", width: 280 }],
      themes: ["light"],
      directions: ["ltr"]
    }
  );
  const result = isolateRender(frame, () => {
    throw new Error("Deliberate fixture failure");
  });
  assert.equal(result.ok, false);
  assert.equal(result.finding.rule, "render-exception");
  assert.match(result.finding.evidence, /Deliberate fixture failure/);
});

test("invalid fixtures report an exact path", () => {
  const invalid = structuredClone(scene);
  invalid.fixtures[0].props = null;
  assert.throws(
    () => validateScene(invalid),
    (error) => {
      assert.equal(error.path, "scene.fixtures.0.props");
      return true;
    }
  );
});

test("base and merged fixture props must satisfy the declared schema", () => {
  const missingRequired = structuredClone(scene);
  delete missingRequired.baseProps.origin;
  assert.throws(
    () => validateScene(missingRequired),
    (error) => error.path === "scene.baseProps.origin"
  );

  const wrongType = structuredClone(scene);
  wrongType.fixtures[0].props.delayMinutes = "late";
  assert.throws(
    () => validateScene(wrongType),
    (error) => error.path === "scene.fixtures.0.props.delayMinutes"
  );

  const unknownProp = structuredClone(scene);
  unknownProp.fixtures[0].props.undeclared = true;
  assert.throws(
    () => validateScene(unknownProp),
    (error) => error.path === "scene.fixtures.0.props.undeclared"
  );
});

test("explicit fixture ids cannot collide with baseline or generated fixtures", () => {
  const baselineCollision = structuredClone(scene);
  baselineCollision.fixtures[0].id = "baseline";
  assert.throws(
    () => validateScene(baselineCollision),
    (error) => error.path === "scene.fixtures.0.id"
  );

  const generatedId = allFixtures(scene).find((fixture) => fixture.source === "generated").id;
  const generatedCollision = structuredClone(scene);
  generatedCollision.fixtures[0].id = generatedId;
  assert.throws(
    () => validateScene(generatedCollision),
    (error) => error.path === "scene.fixtures.0.id"
  );
});

test("matrix planning rejects an empty fixture selection", () => {
  assert.throws(
    () =>
      planMatrix(scene, [], {
        viewports: [{ name: "compact", width: 280 }],
        themes: ["light"],
        directions: ["ltr"]
      }),
    (error) => error.path === "selectedFixtureIds"
  );
});
