// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { Stack, App, StackProps, aws_logs, aws_iam } from "aws-cdk-lib";
import { Vpc, FlowLogDestination, FlowLogTrafficType, SecurityGroup, SubnetType } from "aws-cdk-lib/aws-ec2";

export interface ConsumerTestStackProps extends StackProps {
  cidr: string;
}

export class ProviderExampleEnvironmentStack extends Stack {
    vpcId: string;
    cidr: string;
    sgId: string;
    routeTableIds: string;
    constructor(scope: App, id: string, props?: StackProps) {
      super(scope, id, props);
  
      const logGroup = new aws_logs.LogGroup(this, "MyCustomLogGroup");
  
      const role = new aws_iam.Role(this, "MyCustomRole", {
        assumedBy: new aws_iam.ServicePrincipal("vpc-flow-logs.amazonaws.com"),
      });
  
      const testVpc = new Vpc(this, "testVpc", {
        subnetConfiguration: [
          {
            cidrMask: 27,
            name: 'provider',
            subnetType: SubnetType.PRIVATE_ISOLATED,
          },
        ],
        flowLogs: {
          test: {
            destination: FlowLogDestination.toCloudWatchLogs(logGroup, role),
            trafficType: FlowLogTrafficType.ALL,
          },
        },
        
      });
  
      const testSg = new SecurityGroup(this, "testSg", {
        vpc: testVpc,
      });
  
      const routeTableIds = [
        ...
        new Set(
          testVpc.isolatedSubnets.map((subnet) => {
            return subnet.routeTable.routeTableId;
          })
        
        ),
      ];
      const routeTableIdsString = routeTableIds.join(",");
  
      this.sgId = testSg.securityGroupId;
      this.vpcId = testVpc.vpcId;
      this.cidr = testVpc.vpcCidrBlock;
      this.routeTableIds = routeTableIdsString;
    }
  }

  export class ConsumerExampleEnvironmentStack extends Stack {
    vpcId: string;
    constructor(scope: App, id: string, props: ConsumerTestStackProps) {
      super(scope, id, props);
  
      const logGroup = new aws_logs.LogGroup(this, "CroasAccountLogGroup");
  
      const role = new aws_iam.Role(this, "CrossAccountFlowLogRole", {
        assumedBy: new aws_iam.ServicePrincipal("vpc-flow-logs.amazonaws.com"),
      });
  
      const testVpc = new Vpc(this, "testVpc", {
        flowLogs: {
          test: {
            destination: FlowLogDestination.toCloudWatchLogs(logGroup, role),
            trafficType: FlowLogTrafficType.ALL,
          },
        },
        cidr: props.cidr,
        subnetConfiguration: [
          {
            cidrMask: 27,
            name: "test",
            subnetType: SubnetType.PRIVATE_ISOLATED,
          },
        ],
      });
  
      this.vpcId = testVpc.vpcId;
    }
  }

