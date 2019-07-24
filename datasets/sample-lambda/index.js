exports.handler = function (event, context, callback) {
  const uuid = require('uuid');

  if (event.httpBody) {
    const body = JSON.parse(new Buffer(event.httpBody, 'base64').toString('ascii'));
    callback(body['text'].split("").reverse().join(""));
  } else {
    callback("Hello World From Function! Random ID:" + uuid);
  }
};