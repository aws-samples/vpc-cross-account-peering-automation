// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import {
  EC2Client,
  AcceptVpcPeeringConnectionCommand,
  waitUntilVpcPeeringConnectionExists,
  CreateRouteCommand,
  DeleteRouteCommand,
  DeleteVpcPeeringConnectionCommand,
  waitUntilVpcPeeringConnectionDeleted,
  EC2,
  CreateVpcPeeringConnectionCommand,
  AuthorizeSecurityGroupIngressCommand,
  RevokeSecurityGroupIngressCommand,
  DescribeVpcPeeringConnectionsCommand,
} from "@aws-sdk/client-ec2";
import { json } from "stream/consumers";
import { logger } from "./logger";

export interface AcceptPeeringConnectionProps {
  peeringId: string;
}

export interface PeeringConnectionProps {
  peerVpc: string;
  peerAccount: string;
}

export interface RouteProps {
  peeringId: string;
  cidr: string;
  routeTable: string;
}

export interface VpcControllerProps {
  vpcId: string;
  client: EC2Client;
}

export interface IngressProps {
  cidr: string;
  protocol: string;
  port: number;
  securityGroupId: string;
}

export class VpcController {
  readonly vpcId: string;
  readonly ec2Client: EC2Client;

  constructor(props: VpcControllerProps) {
    this.vpcId = props.vpcId;
    this.ec2Client = props.client;
  }

  private async describePeeringConnection(peeringId: string) {
    const client = this.ec2Client;

    const describeCommand = new DescribeVpcPeeringConnectionsCommand({
      VpcPeeringConnectionIds: [peeringId],
    });

    const response = await this.ec2Client.send(describeCommand);
    logger.debug(
      `Peering connection desscribe response ${JSON.stringify(response)}`
    );

    return response.VpcPeeringConnections;
  }

  public async lookupVpcPeeringConnectionCidr(peeringId: string) {
    const peeringConnections = await this.describePeeringConnection(peeringId);

    if (peeringConnections.length != 1) {
      throw new Error(`No peering found for ${peeringId}`);
    }

    return peeringConnections[0].RequesterVpcInfo.CidrBlock;
  }

  public async createPeeringConnection(props: PeeringConnectionProps) {
    const client = this.ec2Client;

    const createCommand = new CreateVpcPeeringConnectionCommand({
      PeerVpcId: props.peerVpc,
      PeerOwnerId: props.peerAccount,
      VpcId: this.vpcId,
    });

    const response = await this.ec2Client.send(createCommand);
    return response.VpcPeeringConnection.VpcPeeringConnectionId;
  }

  public async acceptPeeringConnection(props: AcceptPeeringConnectionProps) {
    const client = this.ec2Client;
    const acceptCommand = new AcceptVpcPeeringConnectionCommand({
      VpcPeeringConnectionId: props.peeringId,
    });

    const response = await this.ec2Client.send(acceptCommand);
    logger.debug(
      `Peering connection accept response ${JSON.stringify(response)}`
    );

    await waitUntilVpcPeeringConnectionExists(
      {
        client,
        maxWaitTime: 60,
      },
      {
        VpcPeeringConnectionIds: [props.peeringId],
      }
    );
    logger.debug(`Peering connection established ${JSON.stringify(response)}`);

    return response;
  }

  public async deletePeeringConnection(props: AcceptPeeringConnectionProps) {
    const client = this.ec2Client;
    const acceptCommand = new DeleteVpcPeeringConnectionCommand({
      VpcPeeringConnectionId: props.peeringId,
    });

    const response = await this.ec2Client.send(acceptCommand);

    await waitUntilVpcPeeringConnectionDeleted(
      {
        client,
        maxWaitTime: 60,
      },
      {
        VpcPeeringConnectionIds: [props.peeringId],
      }
    );

    return response;
  }

  public async createRoute(props: RouteProps) {
    const client = new EC2Client({});
    const addRouteCommand = new CreateRouteCommand({
      DestinationCidrBlock: props.cidr,
      RouteTableId: props.routeTable,
      VpcPeeringConnectionId: props.peeringId,
    });

    const res = await client.send(addRouteCommand);
    return res;
  }

  public async deleteRoute(props: RouteProps) {
    const deleteRouteCommand = new DeleteRouteCommand({
      DestinationCidrBlock: props.cidr,
      RouteTableId: props.routeTable,
    });

    return await this.ec2Client.send(deleteRouteCommand);
  }

  public async authorizeIngress(props: IngressProps) {
    const authorizeIngressCommand = new AuthorizeSecurityGroupIngressCommand({
      CidrIp: props.cidr,
      IpProtocol: props.protocol,
      FromPort: props.port,
      ToPort: props.port,
      GroupId: props.securityGroupId,
    });

    const res = await this.ec2Client.send(authorizeIngressCommand);
    return res.Return;
  }

  public async revokeIngress(props: IngressProps) {
    const revokeIngressCommand = new RevokeSecurityGroupIngressCommand({
      CidrIp: props.cidr,
      IpProtocol: props.protocol,
      FromPort: props.port,
      ToPort: props.port,
      GroupId: props.securityGroupId,
    });

    const res = await this.ec2Client.send(revokeIngressCommand);
    return res.Return;
  }
}
