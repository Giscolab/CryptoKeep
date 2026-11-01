import { assertDesktopRuntime } from './contract.mjs';
import { enableDesktopPolicy } from '../scripts/core/runtime-policy.js';

try {
  assertDesktopRuntime(globalThis);
  enableDesktopPolicy();
} catch (error) {
  const message = document.createElement('p');
  message.setAttribute('role', 'alert');
  message.textContent = error.message;
  document.body.replaceChildren(message);
  throw error;
}
