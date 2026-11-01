// Static imports preserve DOMContentLoaded ordering. Failure of preflight
// prevents evaluation of app.js and its storage lifecycle handlers.
import './preflight.js';
import '../scripts/app.js';
import '../scripts/ui/security-report-init.js';
