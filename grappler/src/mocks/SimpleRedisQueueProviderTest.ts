import dotenv = require("dotenv");
import {RedisClient} from "redis";

// Import env
dotenv.config();

const client: RedisClient = new RedisClient({
  host: process.env.REDIS_HOST,
});

const sub: RedisClient = client.duplicate();

sub.subscribe(process.env.CONSUMER_NAME);

sub.on("message", (channel, message) => {
  client.publish(JSON.parse(message).requestId, "Response Worked");
});
