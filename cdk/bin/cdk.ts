#!/usr/bin/env node

// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import {
  App,
  Aspects,
  Tags,
} from "aws-cdk-lib";

import { AwsSolutionsChecks } from "cdk-nag";
import {
  PROVIDER_ACCOUNT,
  CONSUMER_ACCOUNT,
  PROVIDER_VPC_ID,
  CONSUMER_CIDR,
  REGISTRATION_CODE,
} from "./environment";
import { CrossAccountProviderStack } from "../lib/cross_account_provider_stack";
import { CrossAccountPeeringStack } from "../lib/cross_account_peering_stack";
import { ProviderExampleEnvironmentStack, ConsumerExampleEnvironmentStack } from "../lib/examples/minimum_viable_test_environment";
import { ConsumerAllowListStack } from "../lib/consumer_allow_list_stack";

const MODIFIER_TAG = "cross_account_modifiable";
const providerEnvironment = {
  account: PROVIDER_ACCOUNT,
};

const consumerEnvironment = {
  account: CONSUMER_ACCOUNT,
};

const app = new App();
Aspects.of(app).add(new AwsSolutionsChecks());

// This sets up a minimum viable test environment for a provider consisting of a VPC and a security group you would use your own VPCs in production
const providerExampleEnvironment = new ProviderExampleEnvironmentStack(app, "providerExampleEnvironment", {
  env: providerEnvironment,
});

// This sets up a minimum viable test environment for a consumer consisting of a VPC you would use your own VPCs in production
const consumerExampleEnvironment = new ConsumerExampleEnvironmentStack(app, "consumerExampleEnvironment", {
  env: consumerEnvironment,
  cidr: CONSUMER_CIDR,
});

// This marks the resources in the provider example as modifiable by the custom lambda resource
Tags.of(providerExampleEnvironment).add(MODIFIER_TAG, "True");

// This deploys the provider VPC automation in the provider account
const providerCrossAccountProvider = new CrossAccountProviderStack(app, "providerStack", {
  env: providerEnvironment,
  vpcId: providerExampleEnvironment.vpcId,
  cidr: providerExampleEnvironment.cidr,
  securityGroupId: providerExampleEnvironment.sgId,
  routeTableIds: providerExampleEnvironment.routeTableIds,
  allowedAccounts: [CONSUMER_ACCOUNT],
  modifierTag: MODIFIER_TAG,
});

// Use this to maintain the list of allowed connections
const consumerAllowList = new ConsumerAllowListStack(app, "consumerAllowList", {
  env: providerEnvironment,
  connectionTable: providerCrossAccountProvider.connectionTable,
  //allowList: [],
  allowList: [
    {
      pk: CONSUMER_ACCOUNT,
      sk: REGISTRATION_CODE,
      cidr: CONSUMER_CIDR,
      protocol: "tcp",
      port: "443",
    },
    // Add more entries here e.g.:
    //  {
    //   pk: `${CONSUMER_ACCOUNT}2`,
    //   sk: REGISTRATION_CODE,
    //   cidr: CONSUMER_CIDR,
    //   protocol: "tcp",
    //   port: "443",
    // }
  ]
})

// This initiates the cross account peering automation request from the consumer side
const crossAccountVPCPeering = new CrossAccountPeeringStack(app, "crossAccountPeering", {
  env: consumerEnvironment,
  peerVpcId: PROVIDER_VPC_ID,
  registrationCode: REGISTRATION_CODE,
  serviceToken: providerCrossAccountProvider.serviceToken,
  cidr: CONSUMER_CIDR,
  vpcId: consumerExampleEnvironment.vpcId,
  providerAccount: PROVIDER_ACCOUNT,
});
