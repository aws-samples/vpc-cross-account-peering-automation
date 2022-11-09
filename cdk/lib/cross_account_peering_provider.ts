// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { AssetHashType, Stack, StackProps } from "aws-cdk-lib";
import * as cr from "aws-cdk-lib/custom-resources";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as kms from "aws-cdk-lib/aws-kms";
import * as ddb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as path from "path";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import { NagSuppressions } from "cdk-nag";
import { iam4CDKProviderManaged, iam5ConditionSafeguard, l1CKDKProviderManaged } from "./cdk_nag_exceptions";

export interface CrossAccountPeeringProps extends StackProps {
  readonly TableName: string;
}

export interface CrossAccountPeeringProviderProps {
  vpcId: string;
  cidr: string;
  securityGroupId: string;
  routeTables: string;
  allowedAccounts?: Array<string>;
  modifierTag: string;
  
}

export class CrossAccountPeeringProvider extends Construct {
  serviceToken: string;
  providerRole: iam.Role;
  connectionTable: ddb.Table;
  public static getOrCreate(scope: Stack) {
    const stack = Stack.of(scope);
    const id =
      "com.amazonaws.cdk.custom-resources.crossaccount-peering-provider";

    const singeletonProvider =
      //@ts-ignore
      (Node.of(stack).tryFindChild(id) as CrossAccountPeeringProvider) ||
      //@ts-ignore
      new CrossAccountPeeringProvider(stack, id);
    return singeletonProvider.provider.serviceToken;
  }

  public readonly provider: cr.Provider;

  constructor(
    scope: Construct,
    id: string,
    props: CrossAccountPeeringProviderProps
  ) {
    super(scope, id);

    const partnerKey = new kms.Key(this, "partnerKey", {
      enableKeyRotation: true,
    });

    const providerFunctionName = "crossAccountPeeringProvider";

    this.connectionTable = new ddb.Table(this, "authorizedCrossAccountPeeringPartners", {
      partitionKey: { name: "pk", type: ddb.AttributeType.STRING },
      sortKey: { name: "sk", type: ddb.AttributeType.STRING },
      encryption: ddb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: partnerKey,
    });


    const onEventCode = lambda.Code.fromAsset(
      path.join(__dirname, "../../custom_resource_handler"),
      {
        assetHashType: AssetHashType.SOURCE,
        exclude: ["dist", ".npm"],
        bundling: {
          image: lambda.Runtime.NODEJS_16_X.bundlingImage,
          command: [
            "bash",
            "-c",
            "mkdir -p .npm && export npm_config_cache=.npm && npm install && npm run build && cd dist/src && cp -aur . /asset-output",
          ],
        },
      }
    );

    this.providerRole = new iam.Role(this, "providerRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
    });

    const handlerRole = new iam.Role(this, "handlerRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
    });

    // https://us-east-1.console.aws.amazon.com/iam/home?region=us-east-1#/policies/arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole$jsonEditor
    const lambdaBasicExecutionPolicy = iam.PolicyDocument.fromJson({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: [
            "logs:CreateLogGroup",
            "logs:CreateLogStream",
            "logs:PutLogEvents",
          ],
          Resource: "*",
        },
      ],
    });

    const providerRolePolicy = new iam.ManagedPolicy(this, "crossAccountPeeringLambdaExecutionPolicy", {
      document: lambdaBasicExecutionPolicy,
    });

    const ddbGetItemPolicy = new iam.Policy(this, "crossAccountddbDescribePolicy", {
      policyName: "ddbDescribe",
    });
    ddbGetItemPolicy.addStatements(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["dynamodb:GetItem"],
        resources: [this.connectionTable.tableArn],
      })
    );

    const vpcModificationPolicy = new iam.Policy(this, "crossAccountVpcModificationPolicy", {
      policyName: "crossAccountvpcModificationPolicy",
    });

    vpcModificationPolicy.addStatements(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ec2:AuthorizeSecurityGroupIngress",
          "ec2:RevokeSecurityGroupIngress",
          "ec2:UpdateSecurityGroupRuleDescriptionsIngress",
          "ec2:AuthorizeSecurityGroupEgress",
          "ec2:RevokeSecurityGroupEgress",
          "ec2:UpdateSecurityGroupRuleDescriptionsEgress",
          "ec2:ModifySecurityGroupRules",
          "ec2:CreateRoute",
          "ec2:ModifyRoute",
          "ec2:DeleteRoute",
        ],
        resources: ["*"],
        conditions: {
          StringEquals: {
            [`aws:ResourceTag/${props.modifierTag}`]: "True",
          },
        },
      })
    );

    vpcModificationPolicy.addStatements(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ec2:AcceptVpcPeeringConnection",
          "ec2:RejectVpcPeeringConnection",
          "ec2:DeleteVpcPeeringConnection",
          "ec2:ModifyVpcPeeringConnectionOptions",
        ],
        resources: [
          `arn:aws:ec2:${Stack.of(this).region}:${Stack.of(this).account}:vpc/${
            props.vpcId
          }`,
          `arn:aws:ec2:${Stack.of(this).region}:${
            Stack.of(this).account
          }:vpc-peering-connection/pcx-*`,
        ],
      }),

      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["ec2:DescribeVpcPeeringConnections"],
        resources: ["*"],
      })
    );

    ddbGetItemPolicy.attachToRole(handlerRole);
    vpcModificationPolicy.attachToRole(handlerRole);

    handlerRole.addManagedPolicy(providerRolePolicy);
    this.providerRole.addManagedPolicy(providerRolePolicy);

    this.connectionTable.grantReadData(handlerRole);

    const onEvent = new lambda.Function(this, "CrossAccountPeeringHandler", {
      code: onEventCode,
      handler: "index.onEvent",
      runtime: lambda.Runtime.NODEJS_16_X,
      role: handlerRole,
      environment: {
        TABLE_NAME: this.connectionTable.tableName,
        VPC_ID: props.vpcId,
        VPC_CIDR: props.cidr,
        SECURITY_GROUP_ID: props.securityGroupId,
        ROUTE_TABLES: props.routeTables,
        NODE_ENV: "prod",
      },
    });

    this.provider = new cr.Provider(this, "CrossAccountPeeringProvider", {
      onEventHandler: onEvent,
      //logRetention: logs.RetentionDays.ONE_DAY, // default is INFINITE
      role: this.providerRole,
      providerFunctionName: providerFunctionName,
    });

    this.serviceToken = this.provider.serviceToken;

    //@ts-ignore - see https://github.com/aws/aws-cdk/issues/20642
    const providerFunction = this.provider.entrypoint;

    props.allowedAccounts?.forEach((account) => {
      providerFunction.grantInvoke(new iam.AccountPrincipal(account));
    });

    this.serviceToken = this.provider.serviceToken;


    NagSuppressions.addResourceSuppressions(
      this.providerRole,
      [iam5ConditionSafeguard],
      true,
    )

    NagSuppressions.addResourceSuppressions(
      providerRolePolicy,
      [iam5ConditionSafeguard],
      true,
    )

    NagSuppressions.addResourceSuppressions(
      vpcModificationPolicy,
      [iam5ConditionSafeguard],
      true,
    )

    NagSuppressions.addResourceSuppressions(
      this.provider,
      [l1CKDKProviderManaged],
      true,
    )

    


  }
}
