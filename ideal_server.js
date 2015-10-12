//var request = require('request');
var request = require('request-json');
var async = require('async');
var childProcess = require('child_process')
var zlib = require('zlib');

var common = require('./common')

var piGlow = require('piglow');

var config = common.config();

// This is hard-wired and not configurable because it's used in the startup script
var IDEAL_SOFTWARE_UPGRADE_FLAG="/home/pi/ideal.upgrade";

if (process.getuid) {
  console.log('Current uid: ' + process.getuid());
}

if (process.getgroups) {
  console.log('Current groups: ' + process.getgroups());
}

var maxLEDvalue = 100; // maximum setting of LED lights
var LEDs = []
var previousGasCumulativeByNodeId = {}

for (i = 0; i < 16; i++) {
  LEDs[i] = 0;
}

if (config.piglow) {
  piGlow(function(error, pi) {
      if(error) {
        console.log(error);
      }
      console.log("PiGlow");
      console.log(pi);
      piglow = pi;
      piglow.reset;
      //pi.all;
  });
}

setInterval(function(){
  if ('undefined' !== typeof piglow) {
    piglow.startTransaction();
    for (i = 0; i < 16; i++) {
      if (LEDs[i] > 0) {
        LEDs[i]-=1;
      }
    }
    // Mapping from basestation LED layout (top left to bottom righ) to piglow layout:
    piglow.l_1_2 = LEDs[0];
    piglow.l_1_5 = LEDs[1];
    piglow.l_2_5 = LEDs[2];
    piglow.l_2_4 = LEDs[3];
    piglow.l_0_5 = LEDs[4];
    piglow.l_2_3 = LEDs[5];
    piglow.l_0_4 = LEDs[6];
    piglow.l_2_2 = LEDs[7];
    piglow.l_1_1 = LEDs[8];
    piglow.l_1_0 = LEDs[9];
    piglow.l_1_3 = LEDs[10];
    piglow.l_1_4 = LEDs[11];
    piglow.l_0_3 = LEDs[12];
    piglow.l_0_2 = LEDs[13];
    piglow.l_0_1 = LEDs[14];
    piglow.l_0_0 = LEDs[15];
    piglow.commitTransaction();
  }
}, 35);

//currentLED = 0;

setInterval(function(){
  LEDs[0] = maxLEDvalue;
//  currentLED = ((currentLED + 1) % 16)
}, 1000);

const HomeOffset = 0;
const BaseStationAddress = process.env.RESIN_DEVICE_UUID;
config['basestationID'] = process.env.RESIN_DEVICE_UUID;
var JSONcount=0;
var JSONbuffer=[];
var homeID="unknown";

console.log(config.IDEALServer);
console.log(config.JSONbuffersize);
var IDEALJSONClient = request.createClient(config.IDEALServer);
var PingClient = request.createClient("http://"+config.CommandServer+":"+config.CommandPort);
//var IDEALJSONClient = request(config.IDEALServer);

var serialport = require("serialport")
var SerialPort = serialport.SerialPort
var serialPort = new SerialPort(config.SerialPort, {
  baudrate: 38400,
  parser: serialport.parsers.readline("\n")
});

function sendJSON(data) {
  if (data && data.home_id && !(data.home_id===undefined) && !(data.home_id=='undefined')) {
    // set the command prompt so that remote logins can see what pi they're on
    if (homeID=="unknown") { 
	var cmd = "sed -i 's/\\\\h/home"+data.home_id+"/g' ~/.bashrc";
	var result=executeShellCommand(cmd); // set prompt
        console.log(cmd);
	cmd = "echo \""+data.home_id+"\" > ~/home_id";
	var result=executeShellCommand(cmd); // set prompt
        console.log(cmd);
    }
    homeID=data.home_id;
  }  
  if (config['JSONbuffersize']) {
	sendJSONbuffered(data);
  } else {
     console.log(JSON_data);
     IDEALJSONClient.post( 'jsonreading/', data, function (err, res, body) {

      if(res) {
        console.log(err);
        console.log({"statusCode": res.statusCode});
	console.log("body JSON: "+JSON.stringify(body));
      }
  });
  }
}

function sendJSONbuffered(data) {
   JSONbuffer.push(data);
   JSONcount++;
   if (JSONcount>=config.JSONbuffersize) {
     console.log("Send buffer");
     var JSONdata = {
      "readings": JSONbuffer
     }

   if (config.compress) {
     console.log(" ...compress... ");
     zlib.deflate(JSON.stringify(JSONdata), function(err, buffer) {
       if (!err) {
         IDEALJSONClient.post( 'jsonreadings/', buffer, function (err, res, body) {
           if(res) {
             console.log(err);
             console.log({"statusCode": res.statusCode});
           }
         });
       } else {
	  console.log("Compression error: " + err);
       }
     })
   } else {
       IDEALJSONClient.post( 'jsonreadings/', JSONdata, function (err, res, body) {
         if(res) {
           console.log(err);
           console.log({"statusCode": res.statusCode});
         }
       });
   }
     // These resets belong outside of the callback because we need to be 
     // able to handle more calls before the post returns. However... what 
     // if we don't get a 200 response? Buffering indefinitely is too much, 
     // but could use a size-limited but larger secondary buffer for unsent
     // data. Certainly adds complication - leave it for now (JK 10/9/2015)
     JSONbuffer=[];
     JSONcount=0;
  }
}

console.log('about to open serial port');

serialPort.on("open", function () {
  console.log('serialPort.open');
  serialPort.on('data', function(data) {
    console.log('data received : ' + data);
    try {
      js_data = JSON.parse(data);
    } catch (er) {
      return;
    }
    JSON_data = {
      "sensorbox_address": js_data.node_id + config.homeOffset,
      "home_id": js_data.home_id,
      "timestamp": (Date.now())/100,
      "timeinterval": 60
    }
    if (config.piglow) {
      LEDs[js_data.node_id] = maxLEDvalue;
    }
    switch(js_data.packet_type) {
      case 1: // TEMP_HUM
        JSON_data["internal_temperature"] = js_data.val0;
        JSON_data["humidity"] = js_data.val1;
        sendJSON(JSON_data);
        break;
      case 2: // BROADCAST
        break;
      case 3: // CURRENT
        JSON_data["current"] = js_data.val0;
        sendJSON(JSON_data);
        break;
      case 4: // CLAMPS
        if ((js_data.val0 < 1300) && (js_data.val0 > 0)) {
          JSON_data["clamp_temperature1"] = js_data.val0 * 0.625;
        }
        if ((js_data.val1 < 1300) && (js_data.val1 > 0)) {
          JSON_data["clamp_temperature2"] = js_data.val1 * 0.625;
        }
        sendJSON(JSON_data);
        break;
      case 5: // LIGHT
        JSON_data["light"] = js_data.val0;
        sendJSON(JSON_data);
        break;
      case 6: // GAS

        //if (js_data.val0 > 0) {

          if (previousGasCumulativeByNodeId[js_data.node_id] == undefined) {
            JSON_data["gas_pulse"] = js_data.val0;
          } else {
            JSON_data["gas_pulse"] = (js_data.val1 - previousGasCumulativeByNodeId[js_data.node_id]) % 65536;
          }
          previousGasCumulativeByNodeId[js_data.node_id] = js_data.val1;
          sendJSON(JSON_data);
        //}
        break;
    }
  });
});

serialPort.on("error", function (_error) {
    console.log("Serial Port error: " + _error)
})


process.on('uncaughtException', function(err) {
    // handle the error safely
    console.log('uncaughtException: ' + err);
    var killtimer = setTimeout(function() {
          process.exit(1);
        }, 3000);
    // But don't keep the process open just for that!
    killtimer.unref();
});

// we're pinging the server anyway with sensor values, but this allows us to separate 
// this sort of ping and would potentially allow it to live on a different server.
// Every PINGDELAY seconds we send a 

var PINGDELAY=5; 

// execute a shell command. 
function executeShellCommand(command) {
    childProcess.exec(command, function (error, stdout, stderr) {
	console.log('stdout: ' + stdout);
	console.log('stderr: ' + stderr);
	if (error !== null) {
	    console.log('exec error: ' + error);
	    return -1
	}
        return 1;
    });
}

// execute a long running shell command returning the stdin (or null on failure)
function executeShellCommandStdin(command) {
    var spawn = childProcess.exec(command, {stdio: [ 'pipe', 0, 0 ] }, function (error, stdout, stderr) {
	console.log('stdout: ' + stdout);
	console.log('stderr: ' + stderr);
	if (error !== null) {
	    console.log('spawn error: ' + error);
	    return null
	}
    });
    return spawn.stdin;
}

var stdin=null;

var id = setInterval(function() {
     console.log("Hello from "+homeID);
     var JSONdata = {
      "home_id": homeID
     }
     PingClient.post( 'ping/', JSONdata, function (err, res, body) {
       //console.log("Ping response "+ JSON.stringify(res));
       if (res!=null && res.body!=null) {
	 var command = res.body.command;
         if (command!=null) {
           console.log("Ping response "+ command);
	   switch (command) {
             case "login":
		var comm = "ssh -p "+ config.SSHtunnelPort + " -R 3100:localhost:22 " + config.SSHtunnelUser + "@" + config.CommandServer;
		console.log(comm);
		stdin=executeShellCommandStdin(comm);
                break;
             case "logout":
		if (stdin) {
		  stdin.end('close\n');
		}
		stdin=null;
		break;
             case "led":
		var val = res.body.value;
		if (val==null) { val=0; }
		maxLEDvalue = val;
		// Blah
		break;
             case "restartpi":
		var comm = "sudo shutdown -r now";
		console.log(comm);
		var result=executeShellCommand(comm); // goodbye!
                break;
             case "softwareupdate":
		var comm = "sudo touch "+IDEAL_SOFTWARE_UPGRADE_FLAG;
		console.log(comm + "(set upgrage flag)");
		var result=executeShellCommand(comm); // flag
		comm = "sudo shutdown -r now";
		console.log(comm);
		var result=executeShellCommand(comm); // goodbye!
                break;
             default:
		console.log("ERROR: Cannot execute command: "+ command);
           }
         }
	}
     });
}, (PINGDELAY * 1000));

