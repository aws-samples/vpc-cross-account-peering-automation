// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { Stack, App, CustomResource, StackProps } from "aws-cdk-lib";
import { Table } from "aws-cdk-lib/aws-dynamodb";
import { PrincipalBase, Role } from "aws-cdk-lib/aws-iam";
import {
  AwsCustomResource,
  PhysicalResourceId,
  AwsCustomResourcePolicy,
} from "aws-cdk-lib/custom-resources";
import { NagSuppressions } from "cdk-nag";
import * as iam from "aws-cdk-lib/aws-iam";
import {
  iam5ConditionSafeguard,
  l1CKDKProviderManaged,
} from "./cdk_nag_exceptions";

interface AllowListEntryDefinition {
  pk: string;
  sk: string;
  cidr: string;
  protocol: string;
  port: string;
}

interface ConsumerAllowListProps extends StackProps {
  connectionTable: Table;
  allowList: Array<AllowListEntryDefinition>;
}

export class ConsumerAllowListStack extends Stack {
  constructor(scope: App, id: string, props: ConsumerAllowListProps) {
    super(scope, id, props);

    const entryConstructs = [];

    const allowListUpdateRole = new Role(this, "allowlistrole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com")
    });

    props.connectionTable.grantReadWriteData(allowListUpdateRole);
    

    props.allowList.forEach((entry, index) => {
      const item = {
        pk: { S: entry.pk },
        sk: { S: entry.sk },
        cidr: { S: entry.cidr },
        protocol: { S: entry.protocol },
        port: { N: entry.port },
      };

      const primaryKey = {
        pk: item.pk,
        sk: item.sk,
      }

      const cidrId = entry.cidr.replace("/", "_").replace(".", "x")

      const id = `al${index}`;


      let tmp = new AwsCustomResource(this, id, {
        onCreate: {
          service: "DynamoDB",
          action: "putItem",
          parameters: {
            Item: item,
            TableName: props.connectionTable.tableName,
          },
          physicalResourceId: PhysicalResourceId.of(id),
        },
        onUpdate: {
          service: "DynamoDB",
          action: "updateItem",
          parameters: {
            TableName: props.connectionTable.tableName,
            Key: primaryKey,
            ExpressionAttributeNames: {
              "#cidr": "cidr",
              "#protocol": "protocol",
              "#port": "port",
            },
            ExpressionAttributeValues: {
              ":c": {
                S: entry.cidr,
              },
              ":p": {
                S: entry.protocol,
              },
              ":po": {
                N: entry.port,
              }
            },
            UpdateExpression: "SET #cidr = :c, #protocol = :p, #port = :po",
          },
          physicalResourceId: PhysicalResourceId.of(id),
        },
        onDelete: {
          service: "DynamoDB",
          action: "deleteItem",
          parameters: {
            Key: primaryKey,
            TableName: props.connectionTable.tableName,
          },
        },
        installLatestAwsSdk: false,
        role: allowListUpdateRole,
      });

      entryConstructs.push(tmp);

    });
  
      NagSuppressions.addResourceSuppressions(
        allowListUpdateRole,
        [
          iam5ConditionSafeguard,
          l1CKDKProviderManaged,
        ],
        true
      )

      if ( entryConstructs.length > 0 ) {
        NagSuppressions.addResourceSuppressionsByPath(
          this,
          "/consumerAllowList/AWS679f53fac002430cb0da5b7982bd2287/Resource",
          [l1CKDKProviderManaged]
        );
      }

     
  }
}
