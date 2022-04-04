
import { execCmd, TestSession } from '@salesforce/cli-plugins-testkit';
import { AuthStrategy } from '@salesforce/cli-plugins-testkit/lib/hubAuth';
import { env } from 'process';


describe('TestSession', () => {
  let testSession: TestSession;

  beforeAll(async () => {
    testSession = await TestSession.create({
      project: {
        gitClone: 'https://github.com/dxatscale/dxatscale-template.git',
      },
       authStrategy:AuthStrategy.AUTH_URL
    });
  });

  it('should prepare a pool of ci scratch orgs', () => {
    console.log("N",process.env.node);
    execCmd('sfpowerscripts:orchestrator:prepare -f config/project-ci-pool-def.json -v '+env.TESTKIT_HUB_USERNAME, { ensureExitCode: 0 });
  });

  afterAll(async () => {
    //  await testSession?.clean();
    //  await testSession?.clean();
  },60000);
});