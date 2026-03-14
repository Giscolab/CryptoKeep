export function showAuthScreen() {
  document.getElementById('auth-screen').hidden = false;
  document.getElementById('vault-ui').hidden = true;
}

export function hideAuthScreen() {
  document.getElementById('auth-screen').hidden = true;
  document.getElementById('vault-ui').hidden = false;
}
