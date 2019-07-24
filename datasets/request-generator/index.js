var loremIpsum = require('lorem-ipsum'),
  output = loremIpsum({
    count: 1000
  });

function random(low, high) {
  return Math.random() * (high - low) + low
}


function sendRequest() {
  var possibleRequests = [
    loremIpsum({
      count: random(0, 250)
    }),
    loremIpsum({
      count: random(1000, 2000)
    }),
    loremIpsum({
      count: random(3000, 8000)
    })
  ];

  const request = require('request');

  request.post('http://10.0.0.49:3000/', {
    json: {
      text: possibleRequests[Math.floor(Math.random() * possibleRequests.length)]
    }
  }, (error, res, body) => {
    if (error) {
      console.error(error)
      return;
    }
    console.log(`statusCode: ${res.statusCode}`)
    console.log(body)
  });

  setTimeout(sendRequest, random(1000, 10000));
}