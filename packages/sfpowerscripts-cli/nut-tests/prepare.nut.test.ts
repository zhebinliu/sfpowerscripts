import { execCmd, ExecCmdOptions, TestSession } from '@salesforce/cli-plugins-testkit';
import { AuthStrategy } from '@salesforce/cli-plugins-testkit/lib/hubAuth';
import { env } from 'process';
import fs from 'fs-extra';
import QueryHelper from '@dxatscale/sfpowerscripts.core/lib/queryHelper/QueryHelper';
import * as rimraf from 'rimraf'

import { AuthInfo, Connection } from '@salesforce/core/';

describe('orchestrator:prepare', () => {
    let testSession: TestSession;

    beforeAll(async () => {
        testSession = await TestSession.create({
            project: {
                gitClone: 'https://github.com/dxatscale/dxatscale-template.git',
            },
            authStrategy: AuthStrategy.AUTH_URL,
        });
    });

    it('should prepare a pool of ci scratch orgs', async () => {
        let cmdOutput;

        let conn = await getConnection();
        //1. Clean any existing pool
        //Read pool name from config file
        let ciPoolTag = fs.readJsonSync(process.cwd() + `/config/project-ci-pool-def.json`).tag;
        cmdOutput = execCmd(`sfpowerscripts:pool:delete -t ${ciPoolTag} -v ${env.TESTKIT_HUB_USERNAME} -a`, {
            ensureExitCode: 0,
        });

        let records = await QueryHelper.query(
            `SELECT Pooltag__c, Allocation_status__c, SfdxAuthUrl__c, SignupUsername, CreatedDate, IsDeleted, Status
            FROM ScratchOrgInfo
            WHERE Pooltag__c = '${ciPoolTag} ' AND Status = 'Active'`,
            conn,
            false
        );

        //There should not be any records with the tag ci
        expect(records.length).toBe(0);

        //2.Create Pools

        let execOptions: any = {
            ensureExitCode: 0,
            timeOut: 60 * 1000 * 10,
            cwd: process.cwd(),
            silent: true,
        };

        cmdOutput = execCmd(
            `sfpowerscripts:orchestrator:prepare -f config/project-ci-pool-def.json -v ${env.TESTKIT_HUB_USERNAME}`,
            execOptions
        );

        //3. Verify in the org there are scratch orgs created with the paritcular tag

        records = await QueryHelper.query(
            `SELECT Pooltag__c, Allocation_status__c, SfdxAuthUrl__c, SignupUsername, CreatedDate
    FROM ScratchOrgInfo
    WHERE Pooltag__c = '${ciPoolTag}' AND Status = 'Active'`,
            conn,
            false
        );

        //There should be atleast one pool
        expect(records.length).toBeGreaterThan(1);

        //4. Tear down
        cmdOutput = execCmd(`sfpowerscripts:pool:delete -t ${ciPoolTag} -v ${env.TESTKIT_HUB_USERNAME} -a`, {
            ensureExitCode: 0,
        });
    });

    it('should prepare a pool of dev scratch orgs', async () => {
        let cmdOutput;

        let conn = await getConnection();
        //1. Clean any existing pool
        //Read pool name from config file
        let devPoolTag = fs.readJsonSync(process.cwd() + `/config/project-dev-pool-def.json`).tag;
        cmdOutput = execCmd(`sfpowerscripts:pool:delete -t ${devPoolTag} -v ${env.TESTKIT_HUB_USERNAME} -a`, {
            ensureExitCode: 0,
        });

        let records = await QueryHelper.query(
            `SELECT Pooltag__c, Allocation_status__c, SfdxAuthUrl__c, SignupUsername, CreatedDate, IsDeleted, Status
             FROM ScratchOrgInfo
             WHERE Pooltag__c = '${devPoolTag} ' AND Status = 'Active'`,
            conn,
            false
        );

        //There should not be any records with the tag ci
        expect(records.length).toBe(0);

        //2.Create Pools

        let execOptions: any = {
            ensureExitCode: 0,
            timeOut: 60 * 1000 * 10,
            cwd: process.cwd(),
            silent: true,
        };

        cmdOutput = execCmd(
            `sfpowerscripts:orchestrator:prepare -f config/project-dev-pool-def.json -v ${env.TESTKIT_HUB_USERNAME}`,
            execOptions
        );

        //3. Verify in the org there are scratch orgs created with the paritcular tag

        records = await QueryHelper.query(
            `SELECT Pooltag__c, Allocation_status__c, SfdxAuthUrl__c, SignupUsername, CreatedDate
             FROM ScratchOrgInfo
             WHERE Pooltag__c = '${devPoolTag}' AND Status = 'Active'`,
            conn,
            false
        );

        //There should be atleast one pool
        expect(records.length).toBeGreaterThan(1);

        //4. Tear down
        cmdOutput = execCmd(`sfpowerscripts:pool:delete -t ${devPoolTag} -v ${env.TESTKIT_HUB_USERNAME} -a`, {
            ensureExitCode: 0,
        });
    });

    afterAll(async () => {
        await testSession?.clean();
    }, 60000);
});

async function getConnection() {
    let cmdOutput;

    cmdOutput = execCmd(`force:org:display -u ${env.TESTKIT_HUB_USERNAME} --json`);

    let accessToken = cmdOutput.jsonOutput.result.accessToken;
    let instanceURL = cmdOutput.jsonOutput.result.instanceUrl;

    //Create Org
    let authInfo = await AuthInfo.create({
        accessTokenOptions: { accessToken: accessToken, instanceUrl: instanceURL },
    });

    let conn = await Connection.create({ authInfo });
    return conn;
}
