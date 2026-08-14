/**
 * Print SHA-1 for the Android debug keystore (Google Cloud Console).
 * Run: npm run sha1:debug
 */
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const home = os.homedir();
const keystore = path.join(home, '.android', 'debug.keystore');

if (!fs.existsSync(keystore)) {
  console.log(
    'Debug keystore not found yet. Run npm run android:dev once — Gradle creates it.',
  );
  process.exit(1);
}

const keytool =
  process.env.JAVA_HOME
    ? path.join(process.env.JAVA_HOME, 'bin', 'keytool')
    : 'keytool';

try {
  const out = execSync(
    `"${keytool}" -list -v -keystore "${keystore}" -alias androiddebugkey -storepass android -keypass android`,
    { encoding: 'utf8', shell: true },
  );
  const sha1 = out.match(/SHA1:\s*([^\s]+)/i)?.[1];
  const sha256 = out.match(/SHA256:\s*([^\s]+)/i)?.[1];
  console.log('\nAdd this SHA-1 to Google Cloud → Android OAuth client (com.nepse.ghar):\n');
  if (sha1) console.log('SHA-1:   ' + sha1);
  if (sha256) console.log('SHA256: ' + sha256);
  console.log('\nKeystore: ' + keystore);
} catch (e) {
  console.error('Could not read keystore. Is Java/keytool installed?');
  console.error(e.message || e);
  process.exit(1);
}
