import { Org } from '@salesforce/core';
import SFPLogger, { COLOR_KEY_MESSAGE, Logger, LoggerLevel } from '../logger/SFPLogger';
import PackageDetails from '../package/PackageDetails';
import SfpPackage from '../package/SfpPackage';
import QueryHelper from '../queryHelper/QueryHelper';
import { convertUsernameToAlias } from '../utils/AliasList';
import ObjectCRUDHelper from '../utils/ObjectCRUDHelper';
import InstalledPackagesQueryExecutor from './packageQuery/InstalledPackagesQueryExecutor';

export default class SFPOrg extends Org {
    /**
     * Get list of all artifacts in an org
     */
    public async getInstalledArtifacts(orderBy: string = `CreatedDate`) {
        try {
            let records = await QueryHelper.query<SfpowerscriptsArtifact2__c>(
                `SELECT Id, Name, CommitId__c, Version__c, Tag__c FROM SfpowerscriptsArtifact2__c ORDER BY ${orderBy} ASC`,
                this.getConnection(),
                false
            );
            return records;
        } catch (error) {
            throw new Error(
                'Unable to fetch any sfpowerscripts artifacts in the org\n' +
                    '1. sfpowerscripts package is notinstalled in the org\n' +
                    '2. The required prerequisite object is not deployed to this org\n'
            );
        }
    }
    /**
     * Check whether an artifact is installed in a Org
     * @param  {Logger} logger
     * @param  {SfpPackage} sfpPackage
     */
    public async isArtifactInstalledInOrg(
        logger: Logger,
        sfpPackage: SfpPackage
    ): Promise<{ isInstalled: boolean; versionNumber?: string }> {
        let result: { isInstalled: boolean; versionNumber?: string } = {
            isInstalled: false,
        };
        try {
            SFPLogger.log(`Querying for version of  ${sfpPackage.packageName} in the Org..`, LoggerLevel.INFO, logger);
            result.isInstalled = false;
            let installedArtifacts = await this.getInstalledArtifacts();
            let packageName = sfpPackage.packageName;
            for (const artifact of installedArtifacts) {
                if (artifact.Name === packageName) {
                    result.versionNumber = artifact.Version__c;
                    if (artifact.Version__c === sfpPackage.package_version_number) {
                        result.isInstalled = true;
                        return result;
                    }
                }
            }
        } catch (error) {
            console.log(error);
            SFPLogger.log(
                'Unable to fetch any sfpowerscripts artifacts in the org\n' +
                    '1. sfpowerscripts package is not installed in the org\n' +
                    '2. The required prerequisite object is not deployed to this org\n',
                LoggerLevel.WARN,
                logger
            );
        }
        return result;
    }
    /**
     * Updates or Create information about an artifact in the org
     * @param  {Logger} logger
     * @param  {SfpPackage} sfpPackage
     */
    public async updateArtifactInOrg(logger: Logger, sfpPackage: SfpPackage): Promise<string> {
        let artifactId = await this.getArtifactRecordId(sfpPackage);

        SFPLogger.log(
            COLOR_KEY_MESSAGE(
                `Existing artifact record id for  ${sfpPackage.packageName} in Org for ${
                    sfpPackage.package_version_number
                }: ${artifactId ? artifactId : 'N/A'}`
            ),
            LoggerLevel.INFO,
            logger
        );

        let packageName = sfpPackage.packageName;

        if (artifactId == null) {
            artifactId = await ObjectCRUDHelper.createRecord<SfpowerscriptsArtifact2__c>(
                this.getConnection(),
                'SfpowerscriptsArtifact2__c',
                {
                    Name: packageName,
                    Tag__c: sfpPackage.tag,
                    Version__c: sfpPackage.package_version_number,
                    CommitId__c: sfpPackage.sourceVersion,
                }
            );
        } else {
            artifactId = await ObjectCRUDHelper.updateRecord<SfpowerscriptsArtifact2__c>(
                this.getConnection(),
                'SfpowerscriptsArtifact2__c',
                {
                    Id: artifactId,
                    Name: packageName,
                    Tag__c: sfpPackage.tag,
                    Version__c: sfpPackage.package_version_number,
                    CommitId__c: sfpPackage.sourceVersion,
                }
            );
        }

        SFPLogger.log(
            COLOR_KEY_MESSAGE(
                `Updated Org with new Artifact ${packageName} ${sfpPackage.package_version_number} ${
                    artifactId ? artifactId : ''
                }`
            ),
            LoggerLevel.INFO,
            logger
        );
        return artifactId;
    }

    private async getArtifactRecordId(sfpPackage: SfpPackage): Promise<string> {
        let installedArtifacts = await this.getInstalledArtifacts();

        let packageName = sfpPackage.packageName;
        for (const artifact of installedArtifacts) {
            if (artifact.Name === packageName) {
                return artifact.Id;
            }
        }
        return null;
    }
    /**
     * Retrieves all packages(recognized by Salesforce) installed in the org
     */
    public async getAllInstalled2GPPackages(): Promise<PackageDetails[]> {
        const installedPackages: PackageDetails[] = [];

        let records = await InstalledPackagesQueryExecutor.exec(this.getConnection());

        records.forEach((record) => {
            let packageVersionNumber = `${record.SubscriberPackageVersion.MajorVersion}.${record.SubscriberPackageVersion.MinorVersion}.${record.SubscriberPackageVersion.PatchVersion}.${record.SubscriberPackageVersion.BuildNumber}`;

            let packageDetails: PackageDetails = {
                name: record.SubscriberPackage.Name,
                subscriberPackageId: record.SubscriberPackageId,
                namespacePrefix: record.SubscriberPackage.NamespacePrefix,
                subscriberPackageVersionId: record.SubscriberPackageVersion.Id,
                versionNumber: packageVersionNumber,
                type: record.SubscriberPackageVersion.Package2ContainerOptions,
                isOrgDependent: record.SubscriberPackageVersion.IsOrgDependent,
            };

            installedPackages.push(packageDetails);
        });

        return installedPackages;
    }

    /**
     * Retrives all managed packages in the org
     */
    public async getAllInstalledManagedPackages(): Promise<PackageDetails[]> {
        const installedPackages = await this.getAllInstalled2GPPackages();
        return installedPackages.filter((installedPackage) => installedPackage.type === 'Managed');
    }
    /**
     *  List all the packages created in DevHub, will throw an error, if its not a DevHub
     */
    public async listAllPackages() {
        if (await this.determineIfDevHubOrg(true)) {
            let records = await QueryHelper.query<PackageTypeInfo>(packageQuery, this.getConnection(), true);
            records.forEach((record) => {
                record.IsOrgDependent =
                    record.ContainerOptions === 'Managed' ? 'N/A' : record.IsOrgDependent === true ? 'Yes' : 'No';
            });

            return records;
        } else throw new Error('Package Type Information can only be fetched from a DevHub');
    }

    public async getAlias():Promise<string>{
        return await convertUsernameToAlias(this.getUsername());
    }
}

const packageQuery =
    'SELECT Id,Name, Description, NamespacePrefix, ContainerOptions, IsOrgDependent ' +
    'FROM Package2 ' +
    'WHERE IsDeprecated != true ' +
    'ORDER BY NamespacePrefix, Name';

export interface SfpowerscriptsArtifact2__c {
    Id?: string;
    Name: string;
    Tag__c: string;
    Version__c: string;
    CommitId__c: string;
}

export interface PackageTypeInfo {
    Id: string;
    Name: string;
    Description: string;
    NamespacePrefix: string;
    ContainerOptions: string;
    IsOrgDependent: boolean | string;
}
