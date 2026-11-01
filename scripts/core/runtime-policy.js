// The browser keeps its existing behaviour. The desktop entry point locks a
// stricter policy before app.js is evaluated; no preference is written.
let policy = Object.freeze({ offline: false, automaticMigrations: true });

export function getRuntimePolicy() {
  return policy;
}

export function enableDesktopPolicy() {
  policy = Object.freeze({ offline: true, automaticMigrations: false });
  return policy;
}
