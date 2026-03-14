#!/usr/bin/env python3
import os, html
from datetime import datetime

# ——— Chemins ———
base      = os.path.dirname(os.path.abspath(__file__))
log_path  = os.path.join(base, 'vault_local.log')
html_path = os.path.join(base, 'export-log.html')

# ——— Vérification de l'existence du log ———
if not os.path.exists(log_path):
    print(f"[ERREUR] Aucun log à exporter : {log_path}")
    exit(1)

# ——— Lecture & compte ———
lines          = open(log_path, encoding='utf-8', errors='ignore').read().splitlines()
total_count    = len(lines)
visible_count  = total_count  # au démarrage, on affiche tout

# ——— 1) Déclaration du header (avant le .format) ———
header = """<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Logs • Vault Personal</title>
  <style>
    :root {
      --bg: #0f172a;
      --card: #1e293b;
      --alt: #1a2438;
      --accent: #38bdf8;
      --accent-light: #7dd3fc;
      --error: #f87171;
      --warn: #fbbf24;
      --success: #34d399;
      --text: #e2e8f0;
      --text-secondary: #94a3b8;
      --border: #334155;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg); color: var(--text); line-height: 1.6;
      padding-bottom: 2rem;
      background-image: radial-gradient(circle at 1px 1px, rgba(56, 189, 248, 0.05) 1px, transparent 0);
      background-size: 20px 20px;
    }
    header {
      background: linear-gradient(to right, #0c4a6e, #075985);
      padding: 2.5rem 1.5rem 1.5rem;
      text-align: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      margin-bottom: 2.5rem; position: relative;
    }
    .logo {
      position: absolute; top: 1rem; left: 1.5rem;
      display: flex; align-items: center; gap: 0.5rem; font-weight: 600;
    }
    .logo svg { width: 28px; height: 28px; fill: var(--accent-light); }
    header h1 {
      color: white; font-size: 1.8rem; font-weight: 700;
      margin-bottom: 0.25rem; letter-spacing: -0.5px;
    }
    .subtitle {
      color: rgba(255,255,255,0.8); font-size: 0.95rem;
      max-width: 600px; margin: 0 auto;
    }
    .controls {
      max-width: 900px; margin: -1rem auto 2.5rem; padding: 0 1.5rem;
      display: flex; gap:1rem; align-items:center; position:relative; z-index:10;
    }
    #search-container { flex:1; position:relative; }
    #search {
      width:100%; padding:0.85rem 1rem 0.85rem 3rem;
      border-radius:12px; border:1px solid var(--border);
      background:var(--card); color:var(--text);
      font-size:1rem; box-shadow:0 4px 10px rgba(0,0,0,0.2);
      transition:all 0.3s ease;
    }
    #search:focus {
      outline:none; border-color:var(--accent);
      box-shadow:0 0 0 3px rgba(56,189,248,0.3);
    }
    #search-container::before {
      content:"🔍"; position:absolute; left:1rem; top:50%;
      transform:translateY(-50%); opacity:0.6;
    }
    .stats {
      display:flex; gap:1rem;
      background:var(--card); padding:0.6rem 1.2rem;
      border-radius:10px; border:1px solid var(--border);
      box-shadow:0 4px 10px rgba(0,0,0,0.2); font-size:0.9rem;
    }
    .stat-item { display:flex; flex-direction:column; align-items:center; }
    .stat-value { font-weight:700; color:var(--accent); }
    .stat-label { font-size:0.75rem; color:var(--text-secondary); margin-top:0.1rem; }
    .logbox {
      max-width:900px; margin:0 auto; background:var(--card);
      border-radius:16px; overflow:hidden;
      box-shadow:0 10px 30px rgba(0,0,0,0.3); border:1px solid var(--border);
    }
    .logline {
      font-family:'JetBrains Mono','Fira Code',monospace;
      padding:0.9rem 1.5rem; border-bottom:1px solid var(--border);
      font-size:0.92rem; display:flex; transition:all 0.2s ease;
    }
    .logline:hover { background:var(--alt); }
    .timestamp {
      color:var(--accent-light); min-width:100px; margin-right:1.5rem;
      flex-shrink:0; opacity:0.9;
    }
    .message { flex:1; overflow-wrap:anywhere; }
    .error { color:var(--error); font-weight:600; }
    .warn  { color:var(--warn); }
    .success { color:var(--success); }
    .level-tag {
      display:inline-block; padding:0.15rem 0.6rem; border-radius:6px;
      font-size:0.75rem; font-weight:600; margin-right:0.8rem;
      text-transform:uppercase; letter-spacing:0.5px;
    }
    .level-error { background:rgba(248,113,113,0.15); color:var(--error); }
    .level-warn  { background:rgba(251,191,36,0.15); color:var(--warn); }
    .level-info  { background:rgba(56,189,248,0.15); color:var(--accent); }
    .empty-state {
      text-align:center; padding:3rem; color:var(--text-secondary);
      font-size:1.1rem;
    }
    .empty-state svg { width:60px; height:60px; margin-bottom:1rem; opacity:0.5; }
    footer {
      text-align:center; padding:2rem 1rem 0; font-size:0.85rem;
      color:var(--text-secondary); max-width:900px; margin:0 auto;
    }
    .to-top {
      position:fixed; bottom:2rem; right:2rem; width:50px; height:50px;
      border-radius:50%; background:var(--accent); color:white;
      display:flex; align-items:center; justify-content:center;
      cursor:pointer; box-shadow:0 4px 15px rgba(56,189,248,0.4);
      border:none; opacity:0; transform:translateY(20px);
      transition:all 0.3s ease; z-index:100;
    }
    .to-top.visible {
      opacity:1; transform:translateY(0);
    }
    @media (max-width:768px) {
      .controls { flex-direction:column; }
      .stats { width:100%; justify-content:space-around; }
      .logline { flex-direction:column; gap:0.5rem; }
      .timestamp { margin-right:0; }
    }
  </style>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;family=JetBrains+Mono:wght@400;500&amp;display=swap" rel="stylesheet">
</head>
<body>
  <header>
    <div class="logo">
      <svg viewBox="0 0 24 24"><path d="M12,1L3,5v6c0,5.…"/></svg> Vault Personal
    </div>
    <h1>Rapport des Logs Système</h1>
    <p class="subtitle">Journal complet des activités et événements du système</p>
  </header>

  <div class="controls">
    <div id="search-container">
      <input id="search" type="text" placeholder="Rechercher dans les logs…" autocomplete="off">
    </div>
    <div class="stats">
      <div class="stat-item">
        <span class="stat-value" id="total-count">{total_count}</span>
        <span class="stat-label">Total</span>
      </div>
      <div class="stat-item">
        <span class="stat-value" id="visible-count">{visible_count}</span>
        <span class="stat-label">Affichés</span>
      </div>
    </div>
  </div>

  <div class="logbox">
"""

# ——— 2) Injection « manuelle » des compteurs ———
header = header \
    .replace("{total_count}",   str(total_count)) \
    .replace("{visible_count}", str(visible_count))


# ——— 3) Corps avec timestamp, niveau et message ———
body_lines = []
for line in lines:
    esc = html.escape(line)
    timestamp = ""
    if line.startswith('['):
        end = line.find(']') + 1
        timestamp = html.escape(line[:end])
        esc = esc.replace(html.escape(line[:end]), "", 1)
    lvl = "info"
    tag = ""
    low = line.lower()
    if any(k in low for k in ("error","fail","critical")):
        lvl = "error"
        tag = '<span class="level-tag level-error">ERROR</span> '
    elif "warn" in low:
        lvl = "warn"
        tag = '<span class="level-tag level-warn">WARN</span> '
    elif any(k in low for k in ("success","complete","done")):
        lvl = "success"
        tag = '<span class="level-tag level-info">INFO</span> '
    body_lines.append(
        f'<div class="logline level-{lvl}">'
        f'<span class="timestamp">{timestamp}</span>'
        f'{tag}'
        f'<span class="message">{esc}</span>'
        f'</div>'
    )

# ——— 4) Footer (f-string pour la date) ———
footer = f"""  </div>

  <button class="to-top" id="to-top" title="Remonter en haut">↑</button>

  <footer>
    Rapport généré le {datetime.now().strftime('%d/%m/%Y à %H:%M:%S')} • Vault Personal Log •
    <span id="render-time"></span>
  </footer>
</body>
</html>"""

# ——— 5) Écriture du fichier HTML ———
with open(html_path, 'w', encoding='utf-8') as f:
    f.write(header)
    f.write("\n".join(body_lines))
    f.write("\n")
    f.write(footer)

print(f"[EXPORT] Logs HTML générés : {html_path}")
