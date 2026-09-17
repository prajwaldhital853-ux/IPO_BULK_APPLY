const path = require('path');
const easRoot = path.join(process.env.APPDATA, 'npm', 'node_modules', 'eas-cli', 'build');
const { createGraphqlClient } = require(path.join(
  easRoot,
  'commandUtils/context/contextUtils/createGraphqlClient',
));
const SessionManager = require(path.join(easRoot, 'user/SessionManager')).default;

const sm = new SessionManager({ setActor: () => {} });
const client = createGraphqlClient({
  accessToken: sm.getAccessToken(),
  sessionSecret: sm.getSessionSecret(),
});

async function main() {
  const data = await client.withErrorHandlingAsync(async (gql) =>
    gql`
      query {
        meActor {
          accounts {
            name
            apps {
              id
              name
              slug
              fullName
            }
          }
        }
      }
    `,
  );
  console.log(JSON.stringify(data?.meActor?.accounts ?? [], null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
