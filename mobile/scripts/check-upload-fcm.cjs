/**
 * One-off: check Expo FCM V1 credentials and upload if missing.
 * Uses the logged-in eas-cli session from ~/.expo/state.json
 */
const fs = require('fs');
const path = require('path');

const easRoot = path.join(
  process.env.APPDATA || '',
  'npm',
  'node_modules',
  'eas-cli',
  'build',
);
const { createGraphqlClient } = require(path.join(
  easRoot,
  'commandUtils/context/contextUtils/createGraphqlClient',
));
const SessionManager = require(path.join(easRoot, 'user/SessionManager')).default;
const androidApi = require(path.join(
  easRoot,
  'credentials/android/api/GraphqlClient',
));
const AppQuery = require(path.join(easRoot, 'graphql/queries/AppQuery')).AppQuery;

const PROJECT = {
  account: { name: 'ipobulks-team' },
  projectName: 'ipobulk',
};
const PACKAGE = 'com.nepse.ghar';
const KEY_PATH = path.join(__dirname, '..', 'credentials', 'fcm-v1-service-account.json');

async function main() {
  const sm = new SessionManager({ setActor: () => {} });
  const auth = {
    accessToken: sm.getAccessToken(),
    sessionSecret: sm.getSessionSecret(),
  };
  if (!auth.sessionSecret && !auth.accessToken) {
    console.log(JSON.stringify({ ok: false, error: 'Not logged in to Expo (run eas login)' }));
    process.exit(1);
  }

  const graphqlClient = createGraphqlClient(auth);
  const appLookup = {
    ...PROJECT,
    androidApplicationIdentifier: PACKAGE,
  };

  let creds = await androidApi.getAndroidAppCredentialsWithCommonFieldsAsync(
    graphqlClient,
    appLookup,
  );

  const existing = creds?.googleServiceAccountKeyForFcmV1;
  if (existing?.id) {
    console.log(
      JSON.stringify({
        ok: true,
        fcmV1Uploaded: true,
        keyId: existing.id,
        clientEmail: existing.clientEmail,
        projectId: existing.projectIdentifier,
        applicationIdentifier: PACKAGE,
      }),
    );
    return;
  }

  if (!fs.existsSync(KEY_PATH)) {
    console.log(
      JSON.stringify({
        ok: false,
        fcmV1Uploaded: false,
        error: `Missing service account file: ${KEY_PATH}`,
      }),
    );
    process.exit(1);
  }

  const jsonKey = JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'));
  const app = await AppQuery.byFullNameAsync(
    graphqlClient,
    androidApi.formatProjectFullName(PROJECT),
  );
  if (!app?.account?.id) {
    console.log(JSON.stringify({ ok: false, error: 'Could not resolve Expo app/account' }));
    process.exit(1);
  }

  const uploadedKey = await androidApi.createGoogleServiceAccountKeyAsync(
    graphqlClient,
    app.account,
    jsonKey,
  );

  creds = await androidApi.createOrGetExistingAndroidAppCredentialsWithBuildCredentialsAsync(
    graphqlClient,
    appLookup,
  );

  await androidApi.updateAndroidAppCredentialsAsync(graphqlClient, creds, {
    googleServiceAccountKeyForFcmV1Id: uploadedKey.id,
  });

  console.log(
    JSON.stringify({
      ok: true,
      fcmV1Uploaded: true,
      uploadedNow: true,
      keyId: uploadedKey.id,
      clientEmail: uploadedKey.clientEmail,
      projectId: uploadedKey.projectIdentifier,
      applicationIdentifier: PACKAGE,
    }),
  );
}

main().catch((err) => {
  console.log(JSON.stringify({ ok: false, error: String(err?.message || err) }));
  process.exit(1);
});
