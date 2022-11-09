// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { EC2Client } from "@aws-sdk/client-ec2";
import { DDBLookup } from "./ddb_lookup";
import { logger } from "./logger";
import { VpcController } from "./vpc_control";
import { CrossAccountPeeringService } from "./cross_account_service";

interface CrossAccountPeeringEvent {
  RequestType: string,
  StackId: string,
  ResourceProperties: {
    ServiceToken?: string,
    RegistrationId: string,
    PeeringId: string,
  }
}

function validateEvent(event: CrossAccountPeeringEvent) {
  const props = event.ResourceProperties;
  const isValid = props.RegistrationId && props.PeeringId;
  if(!isValid) {
    throw new Error("Invalid ResourceProperties");
  }
}

export async function onEvent(event: CrossAccountPeeringEvent) {

  validateEvent(event);

  logger.debug(`Received Event ${JSON.stringify(event)}`)
  const registrationId = event.ResourceProperties.RegistrationId;
  // Extract calling account from stack id => "StackId": "arn:aws:cloudformation:us-east-1:123456789012:stack/MyStack/guid"
  const requesterAccountId = event.StackId.split(":")[4];
  const peeringId = event.ResourceProperties.PeeringId;

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      return await handleCreate(requesterAccountId, registrationId, peeringId);

    case 'Delete':
      return await handleDelete(requesterAccountId, registrationId, peeringId);
  }
}

const vpcController = new VpcController({
  vpcId: process.env.VPC_ID,
  client: new EC2Client({}),
})

const partnerLookup = new DDBLookup({
  tableName: process.env.TABLE_NAME,
  client: new DynamoDBClient({}),
})

const crossAccountPeeringService = new CrossAccountPeeringService({
  vpcController: vpcController,
  routeTableIds: process.env.ROUTE_TABLES.split(","),
  securityGroupId: process.env.SECURITY_GROUP_ID,
  serviceCidr: process.env.CIDR,
  ddbLookup: partnerLookup,
});
  
async function handleDelete(requesterAccountId:string, registrationId:string, peeringId:string) {
  try {
    const creation = await crossAccountPeeringService.handleDelete({
      accountId: requesterAccountId,
      registrationId: registrationId,
      peeringId: peeringId,
    })

    const response = {
      PhysicalResourceId: `${requesterAccountId}-${registrationId}`,
    }

    return response;
    
  } catch (error) {
    logger.error(JSON.stringify(error));
    throw new Error("Cross account peering delete failed")
  }
}

async function handleCreate(requesterAccountId:string, registrationId:string, peeringId:string) {
  
  try {
    const creation = await crossAccountPeeringService.handleCreate({
      accountId: requesterAccountId,
      registrationId: registrationId,
      peeringId: peeringId,
    })

    const response = {
      PhysicalResourceId: `${requesterAccountId}-${registrationId}`,
      Data: {
        ServiceCidr: process.env.CIDR,
      }
    }

    return response;
    
  } catch (error) {
    logger.error(JSON.stringify(error));
    throw new Error("Cross account peering creation failed")
  }
}