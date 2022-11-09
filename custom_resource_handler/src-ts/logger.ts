// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import path = require("path");
import winston = require("winston");

const LOG_LEVEL = process.env.NODE_ENV === "prod" ? "info" : "debug";

const localTransport = new winston.transports.Console({
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.splat(),
    winston.format.printf(
      (info) => `${info.timestamp} ${info.level} : ${info.message}`
    )
  ),
  level: LOG_LEVEL,
});

const lambdaTransport = new winston.transports.Console({
  //
  // Possible to override the log method of the
  // internal transports of winston@3.0.0.
  //
  log(info, callback) {
    setImmediate(() => this.emit("logged", info));

    if (this.stderrLevels[info["level"]]) {
      console.error(info["message"]);

      if (callback) {
        callback();
      }
      return;
    }

    console.log(info["message"]);

    if (callback) {
      callback();
    }
  },
});

// https://github.com/winstonjs/winston/issues/1305
const winstonTransports: Array<winston.transport> = [];
if (process.env.LOCAL_RUN) {
  console.debug(`Using local logger transport`)
  winstonTransports.push(localTransport);
} else {
  console.debug(`Using lambda logger transport`)
  winstonTransports.push(lambdaTransport);
}

export const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: winston.format.combine(
    //winston.format.label({ label: path.basename(process.mainModule.filename) }),
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    // Format the metadata object
    winston.format.metadata({
      fillExcept: ["message", "level", "timestamp", "label"],
    })
  ),
  defaultMeta: { service: "cross-account-peering-service" },
  transports: winstonTransports,
});