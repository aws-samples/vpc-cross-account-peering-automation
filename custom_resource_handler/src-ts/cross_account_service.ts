
// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
// Licensed under the Amazon Software License  http://aws.amazon.com/asl/

import { logger } from "./logger";
import { DDBLookup } from "./ddb_lookup";
import { VpcController } from "./vpc_control";


export interface EstablishEndToEndConnectivityProps {
    cidr: string,
    peeringId: string,
    port: number,
    protocol: string,
    deletePeeringProviderSide? :boolean,
}

export interface CrossAccountPeeringServiceProps {
    vpcController: VpcController,
    ddbLookup: DDBLookup,
    serviceCidr: string,
    routeTableIds: Array<string>,
    securityGroupId?: string,
}

export interface HandleCreateProps {
    accountId: string,
    registrationId: string,
    peeringId: string,
}

export interface VerifyPeeringOwenershipProps {
    assignedCidr: string,
    peeringId: string
}

export class CrossAccountPeeringService {
    readonly routeTableIds: string[];
    readonly serviceCidr: string;
    readonly vpcController: VpcController;
    readonly securityGroupId: string;
    ddbLookup: DDBLookup;

    constructor(props: CrossAccountPeeringServiceProps) {
        this.vpcController = props.vpcController;
        this.serviceCidr = props.serviceCidr;
        this.routeTableIds = props.routeTableIds
        this.securityGroupId = props.securityGroupId
        this.ddbLookup = props.ddbLookup
    }

    public async handleDelete(props: HandleCreateProps) {
        try {
            logger.info(`Looking up peering entry for ${props.accountId}`);
            const peeringInformation = await this.ddbLookup.lookupPartner({
                accountId: props.accountId,
                registrationId: props.registrationId,
            });

            const res = await this.removeEndToEndConnectivity({
                //@ts-ignore
                cidr: peeringInformation.cidr,
                //@ts-ignore
                port: peeringInformation.port,
                //@ts-ignore
                protocol: peeringInformation.protocol,
                peeringId: props.peeringId,
            })

            logger.info(`Found peering entry for ${props.accountId}`)
        } catch(error) {
            logger.debug(`Error during delete ${error}`);
            logger.error(`Error during delete ${props.accountId}`);
            throw error;
        }     
        
    }

    public async handleCreate(props: HandleCreateProps) {
        
        try {
            logger.info(`Looking up peering entry for ${props.accountId}`);
            const peeringInformation = await this.ddbLookup.lookupPartner({
                accountId: props.accountId,
                registrationId: props.registrationId,
            });

            logger.info(`Found peering entry for ${props.accountId}`)
            await this.verifyOwnedCidr({assignedCidr: peeringInformation.cidr, peeringId: props.peeringId});
            

            const res = await this.establishEndToEndConnectivity({
                //@ts-ignore
                cidr: peeringInformation.cidr,
                //@ts-ignore
                port: peeringInformation.port,
                //@ts-ignore
                protocol: peeringInformation.protocol,
                peeringId: props.peeringId,
            })

        } catch(error) {
            logger.debug(`Error during create ${error}`);
            logger.error(`Error during create ${props.accountId}`);
            throw error;
        }        
    }

    public async verifyOwnedCidr(props: VerifyPeeringOwenershipProps) {
        
        const requestedCidr = await this.vpcController.lookupVpcPeeringConnectionCidr(props.peeringId);
        
        if (props.assignedCidr != requestedCidr) {
            throw new Error(`Requested CIDR ${requestedCidr} != Assigned CIDR: ${props.assignedCidr}`);
        }
    }

    public async establishEndToEndConnectivity(props: EstablishEndToEndConnectivityProps) {
        try {
            logger.info(`Accepting peering ${props.peeringId}`);
            await this.vpcController.acceptPeeringConnection({
                peeringId: props.peeringId,
            });

            const vpcModificationPromises = new Array<Promise<any>>();
            
            this.routeTableIds.forEach(routeTableId => {
                logger.debug(`Building route addition promise ${routeTableId} ${props.cidr} ${props.peeringId}`);
                const routeAdditionPromise = this.vpcController.createRoute({
                    cidr: props.cidr,
                    routeTable: routeTableId,
                    peeringId: props.peeringId,
                });
                vpcModificationPromises.push(routeAdditionPromise);
            })

            logger.debug(`Building authorization promise ${props.cidr} ${props.protocol} ${props.port} to ${this.securityGroupId}`);
            const ingressPromise = this.vpcController.authorizeIngress({
                cidr: props.cidr,
                protocol: props.protocol,
                port: props.port,
                securityGroupId: this.securityGroupId,
            })
            vpcModificationPromises.push(ingressPromise);

            logger.info(`Adding routes and security ingress`)
            const res = await Promise.all(vpcModificationPromises);


        } catch (error:any) {
            logger.error(`Something went wrong end-to-end ${error}`);
            throw error;
        }

    }


    public async removeEndToEndConnectivity(props: EstablishEndToEndConnectivityProps) {
        try {
            // By default not deleting peering provider side because that breaks the IaC state on the consumer side
            if(props.deletePeeringProviderSide) {
                logger.info(`Deleting peering ${props.peeringId}`);
                await this.vpcController.deletePeeringConnection({
                    peeringId: props.peeringId,
                });
            }
            
            const vpcModificationPromises = new Array<Promise<any>>();
            
            this.routeTableIds.forEach(routeTableId => {
                const routeAdditionPromise = this.vpcController.deleteRoute({
                    cidr: props.cidr,
                    routeTable: routeTableId,
                    peeringId: props.peeringId,
                });
                vpcModificationPromises.push(routeAdditionPromise);
            })

            logger.debug(`Revoking ${props.cidr} ${props.protocol} ${props.port} to ${this.securityGroupId}`);
            const ingressPromise = this.vpcController.revokeIngress({
                cidr: props.cidr,
                protocol: props.protocol,
                port: props.port,
                securityGroupId: this.securityGroupId,
            })
            vpcModificationPromises.push(ingressPromise);

            logger.info(`Removing routes and security ingress`)
            const res = await Promise.all(vpcModificationPromises);


        } catch (error:any) {
            logger.error(`Something went wrong removing end-to-end ${error}`);
            throw error;
        }

    }
}