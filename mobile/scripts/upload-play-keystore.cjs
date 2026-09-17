/**
 * Upload Play upload keystore to @ipo_ipo/ipo_ipo (com.nepse.ghar).
 */
const fs = require('fs');
const path = require('path');

const easRoot = path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'eas-cli', 'build');
const { createGraphqlClient } = require(path.join(
  easRoot,
  'commandUtils/context/contextUtils/createGraphqlClient',
));
const SessionManager = require(path.join(easRoot, 'user/SessionManager')).default;
const androidApi = require(path.join(easRoot, 'credentials/android/api/GraphqlClient'));

const PROJECT = { account: { name: 'ipo_ipo' }, projectName: 'ipo_ipo' };
const PACKAGE = 'com.nepse.ghar';
const EXPECTED_SHA1 = '9881c197a8f53fca0fa0926a1740fa40cef47a1b';
const KEYSTORE_PATH = path.join(
  __dirname,
  '..',
  'credentials',
  'hello35eg-keystore',
  'play-upload-keystore.jks',
);
const KEYSTORE_PASSWORD = 'a42ebcf0b1c2a32e537d00cf9ccb91ae';
const KEY_ALIAS = 'e51077c414ef2f5e6eddb9847f3a0d2f';
const KEY_PASSWORD = 'dbbb8ba22e48468be8a24038a29bd81e';

async function main() {
  if (!fs.existsSync(KEYSTORE_PATH)) {
    throw new Error(`Keystore not found: ${KEYSTORE_PATH}`);
  }

  const sm = new SessionManager({ setActor: () => {} });
  const graphqlClient = createGraphqlClient({
    accessToken: sm.getAccessToken(),
    sessionSecret: sm.getSessionSecret(),
  });

  const appLookup = { ...PROJECT, androidApplicationIdentifier: PACKAGE };
  let creds = await androidApi.getAndroidAppCredentialsWithCommonFieldsAsync(
    graphqlClient,
    appLookup,
  );

  const existingSha1 = (
    creds?.androidAppBuildCredentialsList?.[0]?.androidKeystore?.sha1CertificateFingerprint || ''
  ).toLowerCase();

  if (existingSha1 === EXPECTED_SHA1) {
    console.log(JSON.stringify({ ok: true, alreadyUploaded: true, sha1: existingSha1 }));
    return;
  }

  creds = await androidApi.createOrGetExistingAndroidAppCredentialsWithBuildCredentialsAsync(
    graphqlClient,
    appLookup,
  );

  const account = creds?.app?.ownerAccount;
  if (!account?.id) {
    throw new Error('Could not resolve Expo owner account');
  }

  const keystoreBytes = fs.readFileSync(KEYSTORE_PATH);
  const uploaded = await androidApi.createKeystoreAsync(graphqlClient, account, {
    keystore: keystoreBytes.toString('base64'),
    keystorePassword: KEYSTORE_PASSWORD,
    keyAlias: KEY_ALIAS,
    keyPassword: KEY_PASSWORD,
  });

  await androidApi.createOrUpdateAndroidAppBuildCredentialsByNameAsync(
    graphqlClient,
    appLookup,
    'Play upload keystore',
    { androidKeystoreId: uploaded.id },
  );

  const sha1 = (uploaded.sha1CertificateFingerprint || '').toLowerCase();
  if (sha1 !== EXPECTED_SHA1) {
    throw new Error(`Unexpected SHA-1 after upload: ${sha1}`);
  }

  console.log(JSON.stringify({ ok: true, uploadedNow: true, sha1 }));
}

main().catch((err) => {
  console.log(JSON.stringify({ ok: false, error: String(err?.message || err) }));
  process.exit(1);
});
