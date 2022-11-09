// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import * as sinon from "sinon";
import * as sinonChai from "sinon-chai";

import { VpcController } from "../src-ts/vpc_control";
import { CrossAccountPeeringService } from "../src-ts/cross_account_service";
import {
  TEST_PEER_ID,
  TEST_PROVIDER_VPC_ID,
  TEST_CIDR,
  TEST_ROUTE_TABLES,
  TEST_SERVICE_CIDR,
  TEST_PORT,
  TEST_PROTOCOL,
  TEST_REGISTRATION_ID,
  TEST_ACCOUNT_ID,
  TEST_TABLE_NAME,
} from "./vars";

import { DDBLookup } from "../src-ts/ddb_lookup";

var chai = require("chai");
var chaiAsPromised = require("chai-as-promised");


chai.should();
chai.use(sinonChai);
chai.use(chaiAsPromised);
var expect = chai.expect; // we are using the "expect" style of Chai

var sandbox: sinon.SinonSandbox;

//@ts-ignore
const vpcControlStub = new VpcController({
  vpcId: TEST_PROVIDER_VPC_ID,
  //@ts-ignore
  client: {},
});

//@ts-ignore
const ddbLookupStub = new DDBLookup({ tableName: TEST_TABLE_NAME, client: {} });

const crossAccountPeeringHandlerUnderTest = new CrossAccountPeeringService({
  vpcController: vpcControlStub,
  ddbLookup: ddbLookupStub,
  serviceCidr: TEST_SERVICE_CIDR,
  routeTableIds: TEST_ROUTE_TABLES,
});

describe("HandleCreate", () => {
  beforeEach(() => {
    sandbox = sinon.createSandbox();
    sandbox.spy(crossAccountPeeringHandlerUnderTest);
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("Should initiatie end to end if the accountId and registration are valid", async () => {
    
    //sandbox.stub(vpcControlStub);
    sandbox.stub(vpcControlStub).lookupVpcPeeringConnectionCidr.resolves(TEST_CIDR);
    sandbox.stub(ddbLookupStub).lookupPartner.resolves({
      //@ts-ignore
      pk: TEST_ACCOUNT_ID,
      //@ts-ignore
      sk: TEST_REGISTRATION_ID,
      //@ts-ignore
      cidr: TEST_CIDR,
      //@ts-ignore
      port: TEST_PORT,
    });
    const res = await crossAccountPeeringHandlerUnderTest.handleCreate({
      registrationId: TEST_REGISTRATION_ID,
      accountId: TEST_ACCOUNT_ID,
      peeringId: TEST_PEER_ID,
    });

    expect(crossAccountPeeringHandlerUnderTest.establishEndToEndConnectivity).to.be
      .calledOnce;
  });


  it("Should not initiatie end to end if the accountId and registration are valid and the requested CIDR is inappropriate", async () => {
    sandbox.stub(vpcControlStub).lookupVpcPeeringConnectionCidr.resolves("1.1.1.1/8");

    sandbox.stub(ddbLookupStub).lookupPartner.resolves({
      //@ts-ignore
      pk: TEST_ACCOUNT_ID,
      //@ts-ignore
      sk: TEST_REGISTRATION_ID,
      //@ts-ignore
      cidr: TEST_CIDR,
      //@ts-ignore
      port: TEST_PORT,
    });

    await expect(crossAccountPeeringHandlerUnderTest.handleCreate({
      registrationId: TEST_REGISTRATION_ID,
      accountId: TEST_ACCOUNT_ID,
      peeringId: TEST_PEER_ID,
    })).to.eventually.be.rejectedWith(Error);


  });
});

describe("Establish end-to-end", () => {
  beforeEach(() => {
    sandbox = sinon.createSandbox();
    sandbox.spy(crossAccountPeeringHandlerUnderTest);
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should accept the peering set the routes and permit the ingress", async () => {
    sandbox.stub(vpcControlStub);
    const res = await crossAccountPeeringHandlerUnderTest.establishEndToEndConnectivity({
      cidr: TEST_CIDR,
      peeringId: TEST_PEER_ID,
      port: TEST_PORT,
      protocol: TEST_PROTOCOL,
    });
  });
});
