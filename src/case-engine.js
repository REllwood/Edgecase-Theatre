export class SceneError extends Error {
  constructor(message, path, code = "INVALID_SCENE") {
    super(message);
    this.name = "SceneError";
    this.code = code;
    this.path = path;
  }
}

function clone(value) {
  return structuredClone(value);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hash(text) {
  let value = 2166136261;
  for (const character of text) {
    value ^= character.codePointAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

export const hostileRules = Object.freeze([
  {
    id: "string-empty",
    name: "Empty text",
    types: ["string"],
    rationale: "Reveals layout and labelling assumptions that depend on visible text.",
    value: () => ""
  },
  {
    id: "string-long",
    name: "Long unbroken label",
    types: ["string"],
    rationale: "Exercises wrapping and overflow when content has no convenient break.",
    value: () => "W".repeat(84)
  },
  {
    id: "string-compound",
    name: "German compound label",
    types: ["string"],
    rationale: "Exercises realistic long localisation without treating it as random noise.",
    value: () => "Fluggastentschädigungsberechtigungsprüfung"
  },
  {
    id: "string-rtl",
    name: "Arabic route",
    types: ["string"],
    rationale: "Surfaces directional assumptions in mixed-script layouts.",
    value: () => "ملبورن إلى هوبارت"
  },
  {
    id: "string-markup",
    name: "Markup-like text",
    types: ["string"],
    rationale: "Confirms captured strings are rendered as content rather than executable markup.",
    value: () => "<script>not executable</script>"
  },
  {
    id: "number-zero",
    name: "Zero value",
    types: ["number"],
    rationale: "Finds truthiness checks that accidentally hide a valid zero.",
    value: () => 0
  },
  {
    id: "number-negative",
    name: "Negative value",
    types: ["number"],
    rationale: "Challenges components that silently assume every quantity is positive.",
    value: () => -17
  },
  {
    id: "number-large",
    name: "Very large value",
    types: ["number"],
    rationale: "Exercises numeric formatting and fixed-width containers.",
    value: () => 9_999_999
  },
  {
    id: "date-epoch",
    name: "Epoch date",
    types: ["date"],
    rationale: "Finds unsafe assumptions about contemporary date ranges.",
    value: () => "1970-01-01T00:00:00.000Z"
  },
  {
    id: "date-future",
    name: "Far-future date",
    types: ["date"],
    rationale: "Checks long year handling and relative-date boundaries.",
    value: () => "2126-12-31T23:59:59.000Z"
  },
  {
    id: "list-empty",
    name: "Empty list",
    types: ["list"],
    rationale: "Verifies a component has intentional content when a collection is empty.",
    value: () => []
  },
  {
    id: "list-duplicates",
    name: "Duplicate labels",
    types: ["list"],
    rationale: "Reveals unstable keys and labels that are incorrectly assumed to be unique.",
    value: () => ["Gate 4", "Gate 4", "Gate 4"]
  },
  {
    id: "url-missing",
    name: "Missing image URL",
    types: ["url", "optional"],
    rationale: "Exercises fallbacks for absent remote assets.",
    value: () => null
  },
  {
    id: "optional-missing",
    name: "Optional value omitted",
    types: ["optional"],
    rationale: "Confirms optional data is genuinely optional at render time.",
    value: () => undefined
  }
]);

const supportedTypes = new Set(["string", "number", "date", "list", "url", "optional"]);

function validateProps(props, schema, path, { partial = false } = {}) {
  if (!isRecord(props)) {
    throw new SceneError(`${path} must be an object`, path);
  }
  for (const field of Object.keys(props)) {
    if (!Object.hasOwn(schema, field)) {
      throw new SceneError(
        `${path}.${field} is not declared in the scene schema`,
        `${path}.${field}`
      );
    }
  }
  for (const [field, definition] of Object.entries(schema)) {
    const fieldPath = `${path}.${field}`;
    const present = Object.hasOwn(props, field);
    const value = props[field];
    if (!present || value === null || value === undefined) {
      if (!partial && definition.required) {
        throw new SceneError(`${fieldPath} is required`, fieldPath);
      }
      continue;
    }

    const matches =
      definition.type === "optional" ||
      (definition.type === "string" && typeof value === "string") ||
      (definition.type === "number" && Number.isFinite(value)) ||
      (definition.type === "date" &&
        typeof value === "string" &&
        !Number.isNaN(Date.parse(value))) ||
      (definition.type === "list" && Array.isArray(value)) ||
      (definition.type === "url" && typeof value === "string");
    if (!matches) {
      throw new SceneError(
        `${fieldPath} must match schema type ${definition.type}`,
        fieldPath
      );
    }
  }
}

function generatedFixtureIds(schema, seed) {
  return hostileRules.flatMap((rule) => {
    const eligibleFields = Object.entries(schema)
      .filter(([, definition]) => rule.types.includes(definition.type))
      .map(([field]) => field);
    if (eligibleFields.length === 0) {
      return [];
    }
    const field = eligibleFields[hash(`${seed}:${rule.id}`) % eligibleFields.length];
    return [`${rule.id}-${field}`];
  });
}

export function validateScene(input) {
  if (!isRecord(input)) {
    throw new SceneError("Scene must be an object", "scene");
  }
  if (input.version !== 1) {
    throw new SceneError("Scene version must be 1", "scene.version", "UNSUPPORTED_SCENE");
  }
  if (typeof input.id !== "string" || input.id.trim() === "") {
    throw new SceneError("Scene id must be a non-empty string", "scene.id");
  }
  if (typeof input.name !== "string" || input.name.trim() === "") {
    throw new SceneError("Scene name must be a non-empty string", "scene.name");
  }
  if (!isRecord(input.schema) || Object.keys(input.schema).length === 0) {
    throw new SceneError("Scene schema must describe at least one prop", "scene.schema");
  }
  const schema = {};
  for (const [field, definition] of Object.entries(input.schema)) {
    if (!isRecord(definition) || !supportedTypes.has(definition.type)) {
      throw new SceneError(
        `Prop "${field}" must use a supported type`,
        `scene.schema.${field}.type`
      );
    }
    schema[field] = {
      type: definition.type,
      required: definition.required !== false
    };
  }
  if (!isRecord(input.baseProps)) {
    throw new SceneError("Scene baseProps must be an object", "scene.baseProps");
  }
  validateProps(input.baseProps, schema, "scene.baseProps");
  if (!Array.isArray(input.fixtures)) {
    throw new SceneError("Scene fixtures must be an array", "scene.fixtures");
  }
  const seed = String(input.seed ?? input.id);
  const fixtureIds = new Set(["baseline", ...generatedFixtureIds(schema, seed)]);
  const fixtures = input.fixtures.map((fixture, index) => {
    const path = `scene.fixtures.${index}`;
    if (!isRecord(fixture)) {
      throw new SceneError("Fixture must be an object", path);
    }
    if (typeof fixture.id !== "string" || fixture.id.trim() === "") {
      throw new SceneError("Fixture id must be a non-empty string", `${path}.id`);
    }
    if (fixtureIds.has(fixture.id)) {
      throw new SceneError(`Fixture id "${fixture.id}" is duplicated`, `${path}.id`);
    }
    fixtureIds.add(fixture.id);
    if (typeof fixture.name !== "string" || fixture.name.trim() === "") {
      throw new SceneError("Fixture name must be a non-empty string", `${path}.name`);
    }
    if (!isRecord(fixture.props)) {
      throw new SceneError("Fixture props must be an object", `${path}.props`);
    }
    validateProps(fixture.props, schema, `${path}.props`, { partial: true });
    validateProps(
      { ...clone(input.baseProps), ...clone(fixture.props) },
      schema,
      `${path}.props`
    );
    return {
      id: fixture.id,
      name: fixture.name,
      props: clone(fixture.props),
      source: fixture.source ?? "explicit"
    };
  });
  return {
    version: 1,
    id: input.id,
    name: input.name,
    seed,
    schema,
    baseProps: clone(input.baseProps),
    fixtures
  };
}

export function generateHostileFixtures(input) {
  const scene = validateScene(input);
  const generated = [];
  for (const rule of hostileRules) {
    const eligibleFields = Object.entries(scene.schema)
      .filter(([, definition]) => rule.types.includes(definition.type))
      .map(([field]) => field);
    if (eligibleFields.length === 0) {
      continue;
    }
    const field = eligibleFields[hash(`${scene.seed}:${rule.id}`) % eligibleFields.length];
    const value = rule.value();
    const props = clone(scene.baseProps);
    if (value === undefined) {
      delete props[field];
    } else {
      props[field] = value;
    }
    generated.push({
      id: `${rule.id}-${field}`,
      name: `${rule.name}: ${field}`,
      props,
      source: "generated",
      trace: { rule: rule.id, seed: scene.seed, field }
    });
  }
  return generated;
}

export function allFixtures(input) {
  const scene = validateScene(input);
  return [
    {
      id: "baseline",
      name: "Baseline",
      props: clone(scene.baseProps),
      source: "baseline"
    },
    ...scene.fixtures.map((fixture) => ({
      ...fixture,
      props: { ...clone(scene.baseProps), ...clone(fixture.props) }
    })),
    ...generateHostileFixtures(scene)
  ];
}

function validDimensions(dimensions) {
  if (!isRecord(dimensions)) {
    throw new SceneError("Dimensions must be an object", "dimensions");
  }
  const required = ["viewports", "themes", "directions"];
  for (const name of required) {
    if (!Array.isArray(dimensions[name]) || dimensions[name].length === 0) {
      throw new SceneError(`${name} must select at least one value`, `dimensions.${name}`);
    }
  }
  return {
    viewports: dimensions.viewports.map((viewport, index) => {
      if (
        !isRecord(viewport) ||
        typeof viewport.name !== "string" ||
        !Number.isInteger(viewport.width) ||
        viewport.width < 160
      ) {
        throw new SceneError(
          "Viewport must have a name and integer width of at least 160",
          `dimensions.viewports.${index}`
        );
      }
      return { name: viewport.name, width: viewport.width };
    }),
    themes: dimensions.themes.map(String),
    directions: dimensions.directions.map(String)
  };
}

export function planMatrix(input, selectedFixtureIds, dimensions) {
  const scene = validateScene(input);
  const fixtureMap = new Map(allFixtures(scene).map((fixture) => [fixture.id, fixture]));
  if (!Array.isArray(selectedFixtureIds) || selectedFixtureIds.length === 0) {
    throw new SceneError("Select at least one fixture", "selectedFixtureIds");
  }
  const selected = selectedFixtureIds.map((id, index) => {
    const fixture = fixtureMap.get(id);
    if (!fixture) {
      throw new SceneError(`Unknown fixture "${id}"`, `selectedFixtureIds.${index}`);
    }
    return fixture;
  });
  const resolved = validDimensions(dimensions);
  const frames = [];
  for (const fixture of selected) {
    for (const viewport of resolved.viewports) {
      for (const theme of resolved.themes) {
        for (const direction of resolved.directions) {
          frames.push({
            id: [scene.id, fixture.id, viewport.width, theme, direction].join("--"),
            sceneId: scene.id,
            sceneName: scene.name,
            fixture: clone(fixture),
            viewport,
            theme,
            direction
          });
        }
      }
    }
  }
  return frames;
}

export function isolateRender(frame, renderer) {
  try {
    return { ok: true, value: renderer(clone(frame.fixture.props), frame) };
  } catch (error) {
    return {
      ok: false,
      finding: {
        severity: "error",
        frame: frame.id,
        rule: "render-exception",
        evidence: error instanceof Error ? error.message : String(error),
        nextAction: "Inspect the fixture and component render path; neighbouring frames remain available."
      }
    };
  }
}

export function exportSelectedScene(input, selectedFixtureIds) {
  const scene = validateScene(input);
  const selected = allFixtures(scene).filter((fixture) => selectedFixtureIds.includes(fixture.id));
  return {
    version: 1,
    id: scene.id,
    name: scene.name,
    seed: scene.seed,
    schema: clone(scene.schema),
    baseProps: clone(scene.baseProps),
    fixtures: selected
      .filter((fixture) => fixture.id !== "baseline")
      .map(({ id, name, props, source, trace }) => ({
        id,
        name,
        props,
        source,
        ...(trace ? { trace } : {})
      }))
  };
}
