import {raw} from "body-parser";
import {Definitions} from "boothby-definitions";
import * as express from "express";
import * as path from "path";
import {Pool, QueryResult} from "pg";
import v4 = require("uuid/v4");
import {IQueueProvider} from "./backends";

class App {
  public express: express.Application;
  private queueProvider: IQueueProvider;
  private pool: Pool;

  constructor(queueProvider: IQueueProvider) {
    this.express = express();
    this.queueProvider = queueProvider;
    this.pool = new Pool({
      database: "boothby",
      host: "db",
      password: "boothby",
      user: "boothby",
    });

    this.pool.on("error", (err, client) => {
      console.error("Error thrown by postgres: ", err);
      process.exit(-1);
    });

    this.middleware();
    this.routes();
  }

  public close(): void {
    // tslint:disable-next-line:no-empty
    this.pool.end().then(() => {});
  }

  /**
   * Add the required middleware to the application. Middleware will handle storing requests results
   * in the database.
   */
  private middleware(): void {
    // Handle favicon request and bounce it back with 204
    this.express.use((req, res, next) => {
      console.log(req.originalUrl);
      if (req.originalUrl === "/favicon.ico") {
        res.status(204);
      } else {
        next();
      }
    });

    this.express.use((req, res, next) => {
      const id = v4();
      const startTime = new Date();
      res.append("X-Request-Id", id);

      res.on("finish", () => {
        // Don't log anything to do with dashboards.
        if (req.originalUrl.includes("dashboard")) {
          return;
        }
        const endTime = new Date();

        const params = [
          id,
          startTime,
          endTime,
          (endTime.getTime() - startTime.getTime()),
          req.socket.bytesRead,
          res.statusCode,
        ];

        const SQL = `INSERT INTO
          requests(request_id, start_time, end_time, duration, size, status)
          VALUES ($1, $2, $3, $4, $5, $6)`;

        this.pool
          .connect()
          .then((client) => {
            return client
              .query(SQL, params)
              .then(() => {
                client.release();
              })
              .catch((e) => {
                console.error("Exception thrown: ", e);
                client.release();
              });
          })
          .catch((e) => {
            console.error("Exception thrown: ", e);
          });
      });

      next();
    });

    this.express.use(raw({
      limit: "50MB",
      type: "*/*",
    }));
  }

  /**
   * Builds the routes that make up all the parts of the application. All dashboard routes and core application
   * routes are setup here.
   */
  private routes(): void {
    const router = express.Router();

    router
      .get("/dashboard/latency", (req, res, next) => {
        const SQL = `SELECT date_trunc('minute', start_time), avg(duration) as latency
          FROM requests
          WHERE end_time >= NOW() - INTERVAL '5 minutes'
          GROUP BY date_trunc('minute', start_time)`;

        this.pool
          .connect()
          .then((client) => {
            return client
              .query(SQL)
              .then((value) => {
                client.release();
                res.send(value.rows);
              })
              .catch((err) => {
                client.release();
                res.send(204);
              });
          })
          .catch((e) => {
            console.error("Exception thrown: ", e);
            res.send(204);
          });
      })
      .get("/dashboard/clusters", (req, res, next) => {
        const SQL = `SELECT duration, size as request_size
          FROM requests
          WHERE end_time >= NOW() - INTERVAL '5 minutes'`;

        this.pool
          .connect()
          .then((client) => {
            return client
              .query(SQL)
              .then((value) => {

                // We use k-means clustering to dimension our data for size vs duration
                // and then we can have a rough estimate for an incoming requests for how long it
                // will take. This data can be used for analytics, or autoscaling purposes when
                // we see large requests. We cluster our data into 3 buckets of priority (LOW, MED, HIGH).
                // This data is used to visualize the clusters.
                client.release();
                const clusterMaker = require("clusters");
                clusterMaker.k(3);
                clusterMaker.iterations(700);

                const clusterData = [];

                for (let i = 0; i < value.rows.length; i++) {
                  clusterData.push([value.rows[i].request_size, value.rows[i].duration]);
                }
                clusterMaker.data(clusterData);
                res.send(clusterMaker.clusters());
              })
              .catch((err) => {
                client.release();
                console.log(err);
                res.send(204);
              });
          })
          .catch((e) => {
            console.error("Exception thrown: ", e);
            res.send(204);
          });
      })
      .get("/dashboard/rpm", (req, res, next) => {
        const SQL = `SELECT date_trunc('minute', start_time), count(*)
          FROM requests
          WHERE end_time >= NOW() - INTERVAL '5 minutes'
          GROUP BY date_trunc('minute', start_time)`;

        this.pool
          .connect()
          .then((client) => {
            return client
              .query(SQL)
              .then((value) => {
                client.release();
                res.send(value.rows);
              })
              .catch((err) => {
                client.release();
                res.send(204);
              });
          })
          .catch((e) => {
            console.error("Exception thrown: ", e);
            res.send(204);
          });
      })
      .get("/dashboard/errors", (req, res, next) => {
        const SQL = `SELECT count(*) FILTER (WHERE status != 200) as errorCount, count(*) as totalCount
          FROM requests
          WHERE end_time >= NOW() - INTERVAL '5 minutes'`;

        this.pool
          .connect()
          .then((client) => {
            return client
              .query(SQL)
              .then((value) => {
                client.release();
                res.send(value.rows);
              })
              .catch((err) => {
                client.release();
                res.send(204);
              });
          })
          .catch((e) => {
            console.error("Exception thrown: ", e);
            res.send(204);
          });
      })
      .get("/dashboard/health", (req, res, next) => {
        this.pool
          .connect()
          .then((client) => {
            client.release();
            // If we get to this point we've successfully connected to the database
            // and we can let the person know that we're currently up.
            res.send({database: "up"});
          })
          .catch((err) => {
            res.send({database: "down"});
          });
      })
      .get("/dashboard", (req, res, next) => {
        res.sendFile(path.resolve(__dirname + "/../assets/index.html"));
      });

    router
      .all("/", (req, res, next) => {
        const incomingTime = Date.now();

        this.queueProvider
          .processRequest(req, res)
          .take(1)
          .subscribe((response: Definitions.ILambdaResponse) => {
            res.send(response.body);
          });
      });

    this.express.use("/", router);
  }
}

export default App;
