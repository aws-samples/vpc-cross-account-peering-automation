// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import * as sinon from "sinon";
import * as sinonChai from "sinon-chai";
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import {
  TEST_ACCOUNT_ID,
  TEST_CIDR,
  TEST_PORT,
  TEST_PROTOCOL,
  TEST_REGISTRATION_ID,
  TEST_TABLE_NAME,
} from "./vars";
import { DDBLookup } from "../src-ts/ddb_lookup";

var chai = require("chai");
var chaiAsPromised = require("chai-as-promised");

chai.use(sinonChai);
chai.use(chaiAsPromised);
chai.should();

var expect = chai.expect; // we are using the "expect" style of Chai

const sandbox = sinon.createSandbox();

const ddbMock = mockClient(DynamoDBClient);

let ddbLookupUnderTest = sandbox.spy(
  new DDBLookup({ tableName: TEST_TABLE_NAME, client: new DynamoDBClient({}) })
);

describe("Lookup input", () => {
  beforeEach(() => {
    ddbMock.reset();
  });

  it("Should return matching record if the RegistrationID and account id pair exists", async () => {
    ddbMock
      .on(GetItemCommand)
      .resolves({ Item: undefined })
      .on(GetItemCommand, {
        TableName: TEST_TABLE_NAME,
        Key: {
          pk: { S: TEST_ACCOUNT_ID },
          sk: { S: TEST_REGISTRATION_ID },
        },
      })
      .resolves({
        Item: {
          //@ts-ignore
          pk: {S: TEST_ACCOUNT_ID},
          //@ts-ignore
          sk: {S: TEST_REGISTRATION_ID},
          //@ts-ignore
          cidr: {S: TEST_CIDR},
          //@ts-ignore
          port: {N: TEST_PORT.toString()},
          //@ts-ignore
          protocol: {S: TEST_PROTOCOL},
        },
      });
    const res = await ddbLookupUnderTest.lookupPartner({
      registrationId: TEST_REGISTRATION_ID,
      accountId: TEST_ACCOUNT_ID,
    });
    expect(res.pk).to.equal(TEST_ACCOUNT_ID);
    expect(res.sk).to.equal(TEST_REGISTRATION_ID);
  });

  it("Should throw error if pair doesn't exist", async () => {
    ddbMock
      .on(GetItemCommand)
      .resolves({ Item: undefined })
      .on(GetItemCommand, {
        TableName: TEST_TABLE_NAME,
        Key: {
          pk: { S: TEST_ACCOUNT_ID },
          sk: { S: TEST_REGISTRATION_ID },
        },
      })
      .resolves({
        Item: {
          //@ts-ignore
          pk: TEST_ACCOUNT_ID,
          //@ts-ignore
          sk: TEST_REGISTRATION_ID,
          //@ts-ignore
          cidr: TEST_CIDR,
          //@ts-ignore
          port: TEST_PORT.toString(),
          //@ts-ignore
          protocol: TEST_PROTOCOL,
        },
      });

      return ddbLookupUnderTest.lookupPartner({
        registrationId: "1",
        accountId: TEST_ACCOUNT_ID,
      }).should.be.rejectedWith("No valid registration found");
  });
});
