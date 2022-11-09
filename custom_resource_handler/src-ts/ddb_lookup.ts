// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { logger } from "./logger";

export interface DDBLookupProps {
    tableName: string,
    client: DynamoDBClient,
}

export interface LookupPartnerProps {
    accountId: string,
    registrationId: string,
}

export class DDBLookup {
    tableName: string;
    client: DynamoDBClient;

    constructor(props: DDBLookupProps) {
        this.client = props.client;
        this.tableName = props.tableName;
    }

    public async lookupPartner(props: LookupPartnerProps) {
        const getItemCommand = new GetItemCommand({
            TableName: this.tableName,
            Key: {
                pk: {S: props.accountId},
                sk: {S: props.registrationId},
            }
        })

        logger.debug(`Looking up in DDB ${this.tableName} ${props.accountId} ${props.registrationId}`);
        const res = await this.client.send(getItemCommand);

        logger.debug(`Returned ${JSON.stringify(res)}`)

        if(!res.Item) {
            logger.error(`Failed to lookup entry for ${props.accountId}`);
            throw new Error("No valid registration found");
        } 

        logger.info(`Successful lookup for ${props.accountId}`);
        const parsedPeering = {
            pk: res.Item.pk.S,
            sk: res.Item.sk.S,
            cidr: res.Item.cidr.S,
            port: res.Item.port.N,
            protocol: res.Item.protocol.S,
        }
        return parsedPeering;
    }
}