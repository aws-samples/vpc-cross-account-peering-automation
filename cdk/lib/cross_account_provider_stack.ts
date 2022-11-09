// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { Stack, App, StackProps, aws_dynamodb as ddb } from "aws-cdk-lib";
import { NagSuppressions } from "cdk-nag";
import { iam5ConditionSafeguard, iam4CDKProviderManaged, l1CKDKProviderManaged } from "./cdk_nag_exceptions";
import { CrossAccountPeeringProvider } from "./cross_account_peering_provider";

interface CrossAccountDeploymentStackProps extends StackProps {
    vpcId: string;
    cidr: string;
    securityGroupId: string;
    routeTableIds: string;
    modifierTag: string;
    allowedAccounts?: string[];
  }
    
export class CrossAccountProviderStack extends Stack {
    serviceToken: string;
    connectionTable: ddb.Table;
    constructor(scope: App, id: string, props: CrossAccountDeploymentStackProps) {
      super(scope, id, props);
  
      const crossAccountProvider = new CrossAccountPeeringProvider(this, "provider", {
        vpcId: props.vpcId,
        cidr: props.cidr,
        securityGroupId: props.securityGroupId,
        routeTables: props.routeTableIds,
        allowedAccounts: props.allowedAccounts,
        modifierTag: props.modifierTag,
      });
  
      this.serviceToken = crossAccountProvider.serviceToken;
      this.connectionTable = crossAccountProvider.connectionTable

      NagSuppressions.addResourceSuppressions(
        crossAccountProvider.providerRole,
        [iam5ConditionSafeguard]
      )
    
    }
  }