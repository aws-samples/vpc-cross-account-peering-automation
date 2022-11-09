// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import * as sinon from "sinon";
import * as sinonChai from "sinon-chai";
import { CrossAccountPeeringService } from "../src-ts/cross_account_service";
import { onEvent } from "../src-ts/index";
import { TEST_ACCOUNT_ID, TEST_PEER_ID, TEST_REGISTRATION_ID, TEST_ROUTE_TABLES, TEST_SECURITY_GROUP_ID, TEST_SERVICE_CIDR, TEST_SERVICE_TOKEN } from "./vars";

var chai = require("chai");
var chaiAsPromised = require("chai-as-promised");

chai.use(chaiAsPromised);
chai.should();
chai.use(sinonChai);
var expect = chai.expect; // we are using the "expect" style of Chai

const sandbox = sinon.createSandbox();

describe("Handler", () => {

    afterEach( () => {
        sandbox.restore();
    })

    it("Should call create with the correct parameters", async () => {
        //@ts-ignore
        const stubbedCrossAccountPeeringService = sandbox.stub(CrossAccountPeeringService.prototype, "handleCreate").callsFake( () => { return } );
        sandbox.stub(process.env, "ROUTE_TABLES").value(TEST_ROUTE_TABLES.toString())
        sandbox.stub(process.env, "CIDR").value(TEST_SERVICE_CIDR)
        sandbox.stub(process.env, "SECURITY_GROUP").value(TEST_SECURITY_GROUP_ID)
        

        const res = await onEvent({
            "RequestType": "Create",
            //"ResponseURL": "http://pre-signed-S3-url-for-response",
            "StackId": `arn:aws:cloudformation:ap-southeast-1:${TEST_ACCOUNT_ID}:stack/MyStack/guid`,
            //"RequestId": "unique id for this create request",
            //"ResourceType": "Custom::TestResource",
            //"LogicalResourceId": "MyTestResource",
            "ResourceProperties": {
              "PeeringId": TEST_PEER_ID,
              "RegistrationId": TEST_REGISTRATION_ID,
              "ServiceToken": TEST_SERVICE_TOKEN,
            }
          });
            
        stubbedCrossAccountPeeringService.should.have.been.calledWith({
            accountId: TEST_ACCOUNT_ID,
            registrationId: TEST_REGISTRATION_ID,
            peeringId: TEST_PEER_ID,
        });
        
    });
})