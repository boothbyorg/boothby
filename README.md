# Introduction to Boothby

Boothby is a lightweight, yet fast (and low latency!), FaaS platform built on Typescript using a variety of open source software (rabbitmq, redis, kafka). It is composed of two distinct pieces known as "Grappler" and "Deflector", you can read more about them below.

## Visual Overview

<a href="https://s3-us-west-2.amazonaws.com/therearefourlights/Boothby+Diagram.svg">
  <img src="https://s3-us-west-2.amazonaws.com/therearefourlights/Boothby+Diagram.svg" width="100%" height="550">
</a>

Breakdown:

```
1) Requests come in and hit a http server sitting inside of grappler.
2) Requests are parsed, converted to an internal request format, compressed using Apache Avro, and published to the queue layer.
3) Deflector will pickup requests from the queue, and find an open slot for the requests to be processed. Communication between 3 and 4 is done over Avro's RPC channels.
4) The sub process picks up the RPC request, process the request, and pushes it back up to deflector.
5a/5b) Once the message is passed back up, the logs are stripped away and shipped off to a separate logging process (still WIP). The initial message sent from point 3 contains instructions as to where to publish the response.
6) The message is reformatted, compressed w/ Avro and republished to the request channel from point 3.
7) The response is picked back up by Grappler.
8) The response is pushed out to the end user.
```

## Overview of Grappler

Grappler sits at the edge of network and is responsible the following:

1) Accepting requests from the edge, holding the connections open, and returning responses.
2) Setting up a response queue, for rabbitmq it's an exclusive queue... for redis, it's a dedicated pub/sub channel.
3) Handling timeouts for no responses and returning error messages.

There's nothing really special about Grappler. It's a simple express server that ties together a few different queue providers.

## Overview of Deflector

Deflector is the powerhouse of the system. It's core responsibility is the ingestion and processing of requests. Thanks to some clever engineering, the time from grappler, and back is on average ~4ms. Most of the other open source FaaS platforms utilize the quickness of bringing up a docker container, executing a process, and then terminating the container. Deflector takes a different approach, by focusing on reusing processes and having multiple processes per container we can much more gracefully handle a rapid spike in load by increasing the amount of processes AND adding additional deflector containers.

During bootup, deflector will start up N number of sub processes that are hot and ready to take requests. Communication between the sub process and deflector is done via unix sockets and sitting on top of that is a Avro RPC channel. All of this is done to minimize latency between communication but also to provide an additional layer of security. These sub processes are ran as a separate user with limited access. At the moment, the lambda function is specified in the dockerfile, downloaded and extracted to /tmp. Only NodeJS is supported, but deflector itself shouldn't be too difficult to port to other languages.

Each deflector sub process can handle 1 request at a time. I'm currently looking into how to expand it to allow multiple requests, however, due to the sync nature of logging this makes it significantly harder. Logging is currently hot-patched at process startup and log messages are passed back through the response in 5a. From here, logs can be sent anywhere. I'm currently working on splitting out the logging part into it's own processes that way time isn't spent waiting for Kafka writes.
