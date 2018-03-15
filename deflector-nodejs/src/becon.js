const assert = require('assert');

const lambdaHandler = process.env['LAMBDA_HANDLER'];
const lambdaPath = process.env['LAMBDA_PATH'];
const socketPath = process.env['SOCKET_PATH'];
const avroProto = process.env['AVRO_PROTO'];

assert.ok(lambdaHandler);
assert.ok(lambdaPath);
assert.ok(socketPath);
assert.ok(avroProto)

const _ = require('lodash');
const avro = require('avsc');
const net = require('net');
const fn = require(lambdaPath);
const handler = fn[lambdaHandler];

const protocol = JSON.parse(new Buffer(avroProto, 'base64').toString('utf8'));

let logs = [];

function patchLogging() {
  console.log = function () {
    var args = Array.prototype.slice.call(arguments);
    logs.push({
      message: args.join(','),
      severity: 'INFO',
      eventTimestamp: Date().toString()
    });
  };

  console.debug = function () {
    var args = Array.prototype.slice.call(arguments);
    logs.push({
      message: args.join(','),
      severity: 'DEBUG',
      eventTimestamp: Date().toString()
    });
  };

  console.warn = function () {
    var args = Array.prototype.slice.call(arguments);
    logs.push({
      message: args.join(','),
      severity: 'WARN',
      eventTimestamp: Date().toString()
    });
  };

  console.error = function () {
    var args = Array.prototype.slice.call(arguments);
    logs.push({
      message: args.join(','),
      severity: 'ERROR',
      eventTimestamp: Date().toString()
    });
  };
}

const service = avro.Service.forProtocol(protocol);
const avroServer = service.createServer()
  .onProcessRequest((m, cb) => {
    // Reset Logs.
    logs = [];

    const response = {
      logs: logs,
      callbackData: {
        statusCode: 200,
        headers: {},
        body: "",
        isBase64: false
      }
    };

    const originalRequestId = m.requestId;

    handler(m, {}, (res) => {
       if (!_.isObject(res)) {
         response.callbackData.body = String(res);
       } else {
          _.assign(response.callbackData, _.pick(res, Object.keys(response.callbackData)));
       }

       // Ensure that we set the callback data id here again incase the user is trying to override it.
       response.callbackData.requestId = originalRequestId;
       cb(null, response);
    });
  });

const server = net.createServer()
  .on('connection', (con) => { avroServer.createChannel(con); })
  .listen(socketPath, () => {
    patchLogging();

    process.stdout.write('READY');
  });

process.on('SIGTERM', () => {
  server.close();

  process.exit(0);
});
