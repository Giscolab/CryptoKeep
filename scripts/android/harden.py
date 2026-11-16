"""Harden only the generated Android scaffold. No vault or signing file is read."""
from pathlib import Path
import xml.etree.ElementTree as ET
import re

root = Path(__file__).resolve().parents[2] / 'src-tauri/gen/android/app/src/main'
# The CLI otherwise selects an SDK based on the runner's installed inventory.
gradle = root.parents[1] / 'build.gradle.kts'
source = gradle.read_text(encoding='utf-8')
for setting in ('compileSdk', 'targetSdk'):
    source, count = re.subn(r'\b' + setting + r'\s*=\s*\d+', setting + ' = 36', source)
    if count != 1:
        raise RuntimeError('Review generated Android SDK setting: ' + setting)
if re.search(r'\bbuildToolsVersion\s*=', source):
    source, count = re.subn(r'\bbuildToolsVersion\s*=\s*"[^"]+"', 'buildToolsVersion = "36.0.0"', source)
    if count != 1:
        raise RuntimeError('Unexpected generated build tools setting')
else:
    source, count = re.subn(r'\bandroid\s*\{', 'android {\n    buildToolsVersion = "36.0.0"', source, count=1)
    if count != 1:
        raise RuntimeError('Missing generated Android Gradle block')
gradle.write_text(source, encoding='utf-8')
manifest = root / 'AndroidManifest.xml'
ns = 'http://schemas.android.com/apk/res/android'
ET.register_namespace('android', ns)
tree = ET.parse(manifest)
app = tree.getroot().find('application')
if app is None:
    raise RuntimeError('Missing Android application')
app.set(f'{{{ns}}}allowBackup', 'false')
app.set(f'{{{ns}}}fullBackupContent', 'false')
app.set(f'{{{ns}}}usesCleartextTraffic', 'false')
app.set(f'{{{ns}}}dataExtractionRules', '@xml/cryptokeep_extraction_rules')
rules = ET.Element('data-extraction-rules')
for mode in ('cloud-backup', 'device-transfer'):
    section = ET.SubElement(rules, mode)
    for domain in ('root', 'file', 'database', 'sharedpref', 'external',
                   'device_root', 'device_file', 'device_database', 'device_sharedpref'):
        ET.SubElement(section, 'exclude', domain=domain, path='.')
resources = root / 'res/xml'
resources.mkdir(parents=True, exist_ok=True)
ET.ElementTree(rules).write(resources / 'cryptokeep_extraction_rules.xml', encoding='utf-8', xml_declaration=True)
tree.write(manifest, encoding='utf-8', xml_declaration=True)
activities = list(root.glob('java/**/MainActivity.kt'))
if len(activities) != 1:
    raise RuntimeError('Expected exactly one generated MainActivity')
activity = activities[0]
source = activity.read_text(encoding='utf-8')
# Preserve the generated lifecycle while protecting the window before WebView creation.
if 'FLAG_SECURE' not in source:
    flag = '''
    window.setFlags(
      android.view.WindowManager.LayoutParams.FLAG_SECURE,
      android.view.WindowManager.LayoutParams.FLAG_SECURE
    )
'''
    matches = list(re.finditer(r'override fun onCreate\([^)]*\)\s*\{', source))
    if len(matches) == 1:
        start = matches[0].end()
        source = source[:start] + flag + source[start:]
    elif not matches:
        start = source.index('{', source.index('class MainActivity')) + 1
        source = source[:start] + '\n  override fun onCreate(savedInstanceState: android.os.Bundle?) {' + flag + '\n    super.onCreate(savedInstanceState)\n  }\n' + source[start:]
    else:
        raise RuntimeError('Ambiguous generated activity lifecycle')
    activity.write_text(source, encoding='utf-8')
print('Generated Android backup, cleartext and screen capture policy applied.')
