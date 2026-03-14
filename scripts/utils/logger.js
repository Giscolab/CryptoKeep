/**
 * Logger UI – redirige console.log vers une console visuelle dans l'interface.
 * Nécessite un <div id="log-console"> dans le HTML.
 */

export function setupUILogger() {
  const box = document.getElementById('log-console');
  if (!box) return;

  const write = (type, args) => {
    const line = document.createElement('div');
    line.textContent = `[${new Date().toLocaleTimeString()}] [${type}] ${args.join(' ')}`;
    box.appendChild(line);
    box.scrollTop = box.scrollHeight;
  };

  ['log', 'warn', 'error'].forEach((method) => {
    const original = console[method];
    console[method] = function (...args) {
      write(method.toUpperCase(), args);
      original.apply(console, args);
    };
  });
}

export function logInfo(message) {
  console.log(`[INFO] ${message}`);
}

export function logError(message) {
  console.error(`[ERROR] ${message}`);
}
