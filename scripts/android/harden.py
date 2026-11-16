"""Harden only the generated Android scaffold. No vault or signing file is read."""
from pathlib import Path
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parents[2] / 'src-tauri/gen/android/app/src/main'
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
app.attrib.pop(f'{{{ns}}}dataExtractionRules', None)
tree.write(manifest, encoding='utf-8', xml_declaration=True)
activities = list(root.glob('java/**/MainActivity.kt'))
if len(activities) != 1:
    raise RuntimeError('Expected exactly one generated MainActivity')
activity = activities[0]
source = activity.read_text(encoding='utf-8')
# Keep template evolution explicit: refuse an unexpected lifecycle implementation.
if 'FLAG_SECURE' not in source:
    if 'override fun onCreate' in source:
        raise RuntimeError('Review generated onCreate before applying screen protection')
    start = source.index('{', source.index('class MainActivity')) + 1
    source = source[:start] + '''
  override fun onCreate(savedInstanceState: android.os.Bundle?) {
    window.setFlags(
      android.view.WindowManager.LayoutParams.FLAG_SECURE,
      android.view.WindowManager.LayoutParams.FLAG_SECURE
    )
    super.onCreate(savedInstanceState)
  }
''' + source[start:]
    activity.write_text(source, encoding='utf-8')
print('Generated Android backup, cleartext and screen capture policy applied.')
