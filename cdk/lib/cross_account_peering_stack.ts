// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { Stack, App, CustomResource } from "aws-cdk-lib";
import {
  AwsCustomResource,
  PhysicalResourceId,
  PhysicalResourceIdReference,
  AwsCustomResourcePolicy,
} from "aws-cdk-lib/custom-resources";
import { NagSuppressions } from "cdk-nag";
import {
  iam5ConditionSafeguard,
  l1CKDKProviderManaged,
  iam4CDKProviderManaged,
} from "./cdk_nag_exceptions";
import { ConsumerTestStackProps } from "./examples/minimum_viable_test_environment";

interface CrossAccountPeeringProps extends ConsumerTestStackProps {
  serviceToken: string;
  registrationCode: string;
  vpcId: string;
  peerVpcId: string;
  providerAccount: string;
}

export class CrossAccountPeeringStack extends Stack {
  constructor(scope: App, id: string, props: CrossAccountPeeringProps) {
    super(scope, id, props);

    const peeringConnection = new AwsCustomResource(this, "requestPeering", {
      onCreate: {
        service: "EC2",
        action: "createVpcPeeringConnection",
        parameters: {
          PeerOwnerId: props.providerAccount,
          PeerVpcId: props.peerVpcId,
          VpcId: props.vpcId,
        },
        physicalResourceId: PhysicalResourceId.fromResponse(
          "VpcPeeringConnection.VpcPeeringConnectionId"
        ),
      },
      onDelete: {
        service: "EC2",
        action: "deleteVpcPeeringConnection",
        parameters: {
          VpcPeeringConnectionId: new PhysicalResourceIdReference(),
        },
      },
      installLatestAwsSdk: false,
      policy: AwsCustomResourcePolicy.fromSdkCalls({
        resources: AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
    });

    // This invokes the custom resource in the provider account and is the only bit that has to be done by CloudFormation from a consumer's side
    const crossAccountPeering = new CustomResource(this, "testCR", {
      serviceToken: props.serviceToken,
      properties: {
        RegistrationId: props.registrationCode,
        PeeringId: peeringConnection.getResponseField(
          "VpcPeeringConnection.VpcPeeringConnectionId"
        ),
      },
    });

    NagSuppressions.addResourceSuppressionsByPath(
      this,
      "/crossAccountPeering/requestPeering/CustomResourcePolicy/Resource",
      [iam5ConditionSafeguard]
    );

    NagSuppressions.addResourceSuppressionsByPath(
      this,
      "/crossAccountPeering/AWS679f53fac002430cb0da5b7982bd2287/Resource",
      [l1CKDKProviderManaged]
    );

    NagSuppressions.addResourceSuppressionsByPath(
      this,
      "/crossAccountPeering/AWS679f53fac002430cb0da5b7982bd2287/ServiceRole/Resource",
      [iam4CDKProviderManaged]
    );
  }
}
