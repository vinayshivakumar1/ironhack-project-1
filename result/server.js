var express = require('express'),
    async = require('async'),
    { Pool } = require('pg'),
    cookieParser = require('cookie-parser'),
    path = require('path'),
    app = express(),
    server = require('http').Server(app),
    io = require('socket.io')(server, { path: '/socket.io' });

var port = process.env.PORT || 4000;

// Create namespaces
var rootNamespace = io.of('/');       // Default namespace for pages at "/"
var resultNamespace = io.of('/result'); // Namespace for pages at "/result"

// Handle connections on the default namespace
rootNamespace.on('connection', function (socket) {
  console.log("Connected on root namespace");
  socket.emit('message', { text: 'Welcome from root!' });

  socket.on('subscribe', function (data) {
    socket.join(data.channel);
  });
});

// Handle connections on the /result namespace
resultNamespace.on('connection', function (socket) {
  console.log("Connected on /result namespace");
  socket.emit('message', { text: 'Welcome from result!' });

  socket.on('subscribe', function (data) {
    socket.join(data.channel);
  });
});

// Build PostgreSQL connection string dynamically from environment variables
var pgHost = process.env.PG_HOST || 'db';
var pgPort = process.env.PG_PORT || 5432;
var pgUser = process.env.PG_USER || 'postgres';
var pgPassword = process.env.PG_PASSWORD || 'postgres';
var pgDatabase = process.env.PG_DATABASE || 'postgres';

var connectionString = `postgresql://${pgUser}:${pgPassword}@${pgHost}:${pgPort}/${pgDatabase}`;
console.log(connectionString);

var pool = new Pool({
  connectionString: connectionString
});

async.retry(
  { times: 1000, interval: 1000 },
  function (callback) {
    pool.connect(function (err, client, done) {
      if (err) {
        console.error("Waiting for db");
      }
      callback(err, client);
    });
  },
  function (err, client) {
    if (err) {
      return console.error("Giving up");
    }
    console.log("Connected to db");
    getVotes(client);
  }
);

function getVotes(client) {
  client.query('SELECT vote, COUNT(id) AS count FROM votes GROUP BY vote', [], function (err, result) {
    if (err) {
      console.error("Error performing query: " + err);
    } else {
      var votes = collectVotesFromResult(result);
      // Emit votes to both namespaces
      rootNamespace.emit("scores", JSON.stringify(votes));
      resultNamespace.emit("scores", JSON.stringify(votes));
    }
    setTimeout(function () { getVotes(client); }, 1000);
  });
}

function collectVotesFromResult(result) {
  var votes = { a: 0, b: 0 };
  result.rows.forEach(function (row) {
    votes[row.vote] = parseInt(row.count);
  });
  return votes;
}

app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the "views" folder on both "/" and "/result"
app.use(express.static(path.join(__dirname, 'views')));
app.use("/result", express.static(path.join(__dirname, 'views')));

// Serve index.html for both routes
app.get(['/', '/result'], function (req, res) {
  res.sendFile(path.resolve(__dirname, 'views', 'index.html'));
});

server.listen(port, function () {
  console.log('App running on port ' + server.address().port);
});
