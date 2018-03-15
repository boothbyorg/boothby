import 'mocha'
import { suite, test, slow, timeout } from "mocha-typescript";
import { assert, should, expect } from "chai";
import { Process, ProcessState } from "../../src/services/Process";
import { existsSync } from "fs"
import { ILogger } from 'src/interfaces';
import { ArrayLogger } from '../../src/loggers/ArrayLogger';
import { v4 } from 'uuid';
import { ProcessOptions } from '../../src/services/ProcessOptions';

describe("Process Test Suite", () => {
  const logger = new ArrayLogger();

  @suite()
  class ProcessStateTests {
    @test("initial state should be creating")
    processInitialState() {
      assert(new Process(new ProcessOptions(logger)).getCurrentState() == ProcessState.PROCESS_CREATING);
    }

    @test("destroying a non-initialized service should work")
    destroyUnstartedProcess() {

    }
  }

  @suite()
  class SimpleLambdaTests {
    static p: Process;
    static options: ProcessOptions;
    before() {
      logger.q.clear();
      SimpleLambdaTests.options = new ProcessOptions(logger);
      SimpleLambdaTests.options.lambdaPath = '/deflector/lambdas/simplelambda/';

      SimpleLambdaTests.p = new Process(SimpleLambdaTests.options)
    }

    requestHelper(testFunction: string, requestId: string = v4()) {
      return SimpleLambdaTests.p.getState()
        .filter((state) => state === ProcessState.PROCESS_READY)
        .take(1)
        .flatMap((state) => {
          return SimpleLambdaTests.p.handleRequest({
            requestId: requestId,
            httpMethod: "GET",
            httpBody: testFunction,
            enqueuedAt: Date.now(),
            expiresAt: Date.now() + 60,
            callbackQueueName: v4()
          });
        })
        .take(1);
    }

    errorRequestHelper(testFunction: string, done: () => void, finalState: ProcessState = ProcessState.PROCESS_DEAD) {
      return this.requestHelper(testFunction)
        .take(1)
        .flatMap((response) => {
          assert(response.callbackData.body === "A error was thrown during processing.");
          return SimpleLambdaTests.p.getState();
        })
        .filter((state) => state === finalState)
        .take(1)
        .subscribe(() => {
          done();
        });
    }

    @test("can sucessfully start up the process")
    startupProcess(done: () => void) {
      SimpleLambdaTests.p.getState()
        .filter((state) => state === ProcessState.PROCESS_READY)
        .take(1)
        .subscribe(() => done());

      SimpleLambdaTests.p.start();
    }

    @test("can shares state between invocations")
    sharedStateBetweenInvocations(done: () => void) {
      SimpleLambdaTests.p.getState()
        .filter((state) => state === ProcessState.PROCESS_READY)
        .take(2)
        .flatMap((state) => {
          return this.requestHelper("incrementCounter")
        })
        .take(2)
        .subscribe((response) => {
          if (response.callbackData.body == '2') {
            done();
          }
        })

      SimpleLambdaTests.p.start();
    }

    @test("simple json return works correctly")
    simpleJsonReturn(done: () => void) {
      this.requestHelper("simpleJsonReturn")
        .subscribe((response) => {
          const callbackData = response.callbackData;

          assert(callbackData.statusCode == 503);
          assert(callbackData.body == "Hello Body");
          assert(callbackData.headers['X-CUSTOM-HEADER'] == "xcustomvalue");
          assert(Object.keys(callbackData).indexOf("unauthedValue") == -1)

          done();
        });

      SimpleLambdaTests.p.start();
    }

    @test("console.log redirects correctly")
    consoleLogTest(done: () => void) {
      this.requestHelper("consoleLogTest")
        .subscribe((response) => {
          done();
        });

      SimpleLambdaTests.p.start();
    }

    @test("doesnt allow you to start a request unless the process is ready.")
    noStartUnlessReady(done: () => void) {
      SimpleLambdaTests.p.handleRequest({
        requestId: "1",
        httpMethod: "GET",
        httpParams: [],
        httpBody: "",
        enqueuedAt: Date.now(),
        expiresAt: Date.now() + 60,
        callbackQueueName: v4()
      })
        .take(1)
        .subscribe((response) => {
          assert(response.callbackData.statusCode === 500);
          done();
        });
    }

    @test("cleans up after itself")
    destoryCleansUp(done: () => void) {
      SimpleLambdaTests.p.getState()
        .filter((state) => state === ProcessState.PROCESS_READY)
        .take(1)
        .do(() => SimpleLambdaTests.p.destroy())
        .subscribe();

      SimpleLambdaTests.p.getState()
        .filter((state) => state === ProcessState.PROCESS_DEAD)
        .take(1)
        .do(() => {
          assert(!existsSync(SimpleLambdaTests.options.socketPath));
          done();
        })
        .subscribe();

      SimpleLambdaTests.p.start();
    }

    @test("doesn't allow you to override the requestId")
    noOverrideRequestId(done: () => void) {
      const callbackId = v4();
      this.requestHelper("overrideRequestId", callbackId)
        .subscribe((response) => {
          assert(response.callbackData.requestId === callbackId);
          done();
        });

      SimpleLambdaTests.p.start();
    }

    @test("process gets marked as dead once it exists with a error code .")
    processIsMarkedDeadAfterCrashing(done: () => void) {
      this.errorRequestHelper("killSelfError", done);
      SimpleLambdaTests.p.start();
    }

    @test("process gets marked as dead once it exists.")
    processIsMarkedDeadAfterExiting(done: () => void) {
      this.errorRequestHelper("killSelfSuccess", done);
      SimpleLambdaTests.p.start();
    }

    @test("process gets marked as dead once it throws an exception.")
    processIsMarkedDeadAfterThrowingException(done: () => void) {
      this.errorRequestHelper("throwException", done);
      SimpleLambdaTests.p.start();
    }

    @test("simple logging interception works")
    simpleLoggingWorks(done: () => void) {
      this.requestHelper("consoleTest")
        .subscribe((response) => {
          // Should be one message in the logger.
          assert(logger.q.size() === 1);
          done();
        });

      SimpleLambdaTests.p.start();
    }

    @test("all logging works correctly")
    allLoggingWorks(done: () => void) {
      this.requestHelper("allConsoleEvents")
        .subscribe((response) => {
          assert(logger.q.size() === 4);

          // Lets test the elements
          const firstMessage = logger.q.shift()

          assert(firstMessage.message === "1,2,3");
          assert(firstMessage.severity === "INFO");

          const secondMessage = logger.q.shift();

          assert(secondMessage.message === "4,5,6");
          assert(secondMessage.severity === "DEBUG");

          const thirdMessage = logger.q.shift();

          assert(thirdMessage.message === "7,8,9");
          assert(thirdMessage.severity === "WARN");

          const fourthMessage = logger.q.shift();

          assert(fourthMessage.message === "10,11,12");
          assert(fourthMessage.severity === "ERROR");

          done();
        });

      SimpleLambdaTests.p.start();
    }

    after() {
      return SimpleLambdaTests.p.destroy();
    }
  }
});
