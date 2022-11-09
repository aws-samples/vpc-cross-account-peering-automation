import { mockClient } from "aws-sdk-client-mock";
import * as sinon from "sinon";
import * as sinonChai from "sinon-chai";
import {
  EC2Client,
  AcceptVpcPeeringConnectionCommandOutput,
  AcceptVpcPeeringConnectionCommand,
  CreateRouteCommand,
  DeleteRouteCommand,
  DeleteVpcPeeringConnectionCommand,
  DescribeVpcPeeringConnectionsCommand,
  AuthorizeSecurityGroupIngressCommand,
} from "@aws-sdk/client-ec2";

import { VpcController } from "../src-ts/vpc_control";
import {
  TEST_PEER_ID,
  TEST_PROVIDER_VPC_ID,
  TEST_CIDR,
  TEST_ROUTE_TABLE,
  TEST_PORT,
  TEST_PROTOCOL,
  TEST_SECURITY_GROUP_ID,
} from "./vars";

var chai = require("chai");
var chaiAsPromised = require("chai-as-promised");

chai.use(chaiAsPromised);
chai.should();
chai.use(sinonChai);
var expect = chai.expect; // we are using the "expect" style of Chai

const sandbox = sinon.createSandbox();

const ec2Mock = mockClient(EC2Client);

let vpcControlUnderTest = sandbox.spy(
  new VpcController({ vpcId: TEST_PROVIDER_VPC_ID, client:new EC2Client({})})
);

describe("PeeringAcceptance", () => {
  beforeEach(() => {
    ec2Mock.reset();
  });

  it("Should lookup the peering if it exists", async () => {
    ec2Mock.on(DescribeVpcPeeringConnectionsCommand).resolves({
      VpcPeeringConnections: [{
        VpcPeeringConnectionId: TEST_PEER_ID,
        RequesterVpcInfo: {
          CidrBlock: TEST_CIDR
        }
      }],
    });

    await vpcControlUnderTest.lookupVpcPeeringConnectionCidr(
      TEST_PEER_ID
    );
    //expect(res.VpcPeeringConnection.VpcPeeringConnectionId).to.equal(TEST_PEER_ID);
  });

  it("Should accept the peering if it exists", async () => {
    ec2Mock.on(AcceptVpcPeeringConnectionCommand).resolves({
      VpcPeeringConnection: {
        VpcPeeringConnectionId: TEST_PEER_ID,
      },
    });
    await vpcControlUnderTest.acceptPeeringConnection({
      peeringId: TEST_PEER_ID,
    });
    //expect(res.VpcPeeringConnection.VpcPeeringConnectionId).to.equal(TEST_PEER_ID);
  });

  it("should delete the peering if it exists", async () => {
    ec2Mock.on(DeleteVpcPeeringConnectionCommand).resolves({
        Return: true
      });
      ec2Mock.on(DescribeVpcPeeringConnectionsCommand).resolves({
      VpcPeeringConnections: [
          {
              VpcPeeringConnectionId: TEST_PEER_ID,
              Status: {
                  Code: "deleted",
              }
          }
      ]    
      });

      await vpcControlUnderTest.deletePeeringConnection({
        peeringId: TEST_PEER_ID,
      });
  })

  it("Should not accept the peering if it doesn't exist", async () => {
    ec2Mock.on(AcceptVpcPeeringConnectionCommand).rejects();
    const promise = vpcControlUnderTest.acceptPeeringConnection({
      peeringId: TEST_PEER_ID,
    });
    expect(promise).to.be.rejected;
  });
});

describe("RouteManagement", () => {
  beforeEach(() => {
    ec2Mock.reset();
  });

  it("Should add routes to the specified route-tables via the pcx if it exists", async () => {
    ec2Mock.on(CreateRouteCommand).resolves({
      Return: true,
    });
    const promise = vpcControlUnderTest.createRoute({
      peeringId: TEST_PEER_ID,
      cidr: TEST_CIDR,
      routeTable: TEST_ROUTE_TABLE,
    });
    await promise;
  });

  it("Should remove routes to the specified route-tables if it exists", async () => {
    ec2Mock.on(DeleteRouteCommand).resolves({});
    const promise = vpcControlUnderTest.deleteRoute({
      peeringId: TEST_PEER_ID,
      cidr: TEST_CIDR,
      routeTable: TEST_ROUTE_TABLE,
    });
    await promise;
  });
});

describe("SecurityGroupUpdate", () => {
  beforeEach(() => {
    ec2Mock.reset();
  });
  it("should add the CIDR to the security group", async() => {
    ec2Mock.on(AuthorizeSecurityGroupIngressCommand).resolves({
      Return: true
    })

    const promise = vpcControlUnderTest.authorizeIngress({
      securityGroupId: TEST_SECURITY_GROUP_ID,
      cidr: TEST_CIDR,
      port: TEST_PORT,
      protocol: TEST_PROTOCOL,
    })

    const res = await promise;
    expect(res).to.equal(true);
    
  });
})
