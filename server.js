  var forever = require('forever-monitor');

  var child = new (forever.Monitor)('ideal_server.js', {
    max: 3000,
    silent: false,
    options: [],
    'minUptime': 2000,     // Minimum time a child process has to be up. Forever will 'exit' otherwise.
    'spinSleepTime': 1000
  });

  child.on('exit', function () {
    console.log('your-filename.js has exited after 3 restarts');
  });

  child.start();