// Should be shared between invocations.
let counter = 0;

function throwException(event, context, callback) {
  throw Error('Test Exception');
}

function killSelfError(event, context, callback) {
  process.exit(1);
}

function killSelfSuccess(event, context, callback) {
  process.exit(0);
}

function overrideRequestId(event, context, callback) {
  event.requestId = "shouldNotChange";
  callback({requestId: "shouldNotChange"});
}

function consoleTest(event, context, callback) {
  console.log("Hello from Console Test");
  callback();
}

function allConsoleEvents(event, context, callback) {
  console.log(1, 2, 3);
  console.debug(4, 5, 6);
  console.warn(7, 8, 9);
  console.error(10, 11, 12);
  callback();
}

function addTest(a, b) {
  return a + b;
}

function incrementCounter(event, context, callback) {
  counter++;
  callback(counter);
}

function simpleJsonReturn(event, context, callback) {
  callback({
    body: "Hello Body",
    statusCode: 503,
    headers: {
      "X-CUSTOM-HEADER": "xcustomvalue"
    },
    unauthedValue: "private"
  })
}

const testFunctions = {
  "consoleTest": consoleTest,
  "addTest": addTest,
  "incrementCounter": incrementCounter,
  "simpleJsonReturn": simpleJsonReturn,
  "overrideRequestId": overrideRequestId,
  "killSelfSuccess": killSelfSuccess,
  "killSelfError": killSelfError,
  "throwException": throwException,
  "allConsoleEvents": allConsoleEvents
}

exports.handler = (event, context, callback) => {
  if(testFunctions[event.httpBody]) {
    testFunctions[event.httpBody](event, context, callback);
  } else {
    callback("Hello From Simple Lambda!")
  }
}
