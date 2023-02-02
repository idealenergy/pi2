var request = require('request-json');
var async = require('async');
var childProcess = require('child_process');
var zlib = require('zlib');
var fs = require('fs');
var exec = require('child_process').exec;

const mqtt = require('mqtt');

var common = require('./common')

//var piGlow = require('piglow');

var config = common.config();

// This is hard-wired and not configurable because it's used in the startup script
var IDEAL_SOFTWARE_UPGRADE_FLAG="/home/blackwood/ideal.upgrade";
// This one is an indicator to say we're running bigsmall mode
var BIGSMALL_FLAG="/home/blackwood/bigsmall";
var OEM_IP="/home/blackwood/oem_ip";
var OEM_API="/home/blackwood/oem_api";


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

/*
Piglow library not updated and insecure / no replacement available - run without lights for now
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

setInterval(function(){
  LEDs[0] = maxLEDvalue;
//  currentLED = ((currentLED + 1) % 16)
}, 1000);
*/

function execute (command,callback) {
   exec(command, function(error,stdout,stderr) { callback(stdout); });
};

const HomeOffset = 0;
const BaseStationAddress = process.env.RESIN_DEVICE_UUID;
config['basestationID'] = process.env.RESIN_DEVICE_UUID;
var JSONcount=0;
var secondselapsed=0;
var bufferstart=0;
var JSONbuffer=[];
var homeID="unknown";
var ID_30A=1;
var ID_100A=2;
var firstReadingReceived=-1;
var ELECTRIC_SCALING_RMS_100A=0.0351562;
var ELECTRIC_SCALING_RMS_30A=0.0105469;
var UK_VOLTAGE=230;

console.log(config.IDEALServer);
console.log(config.JSONbuffersize);
var IDEALJSONClient = request.createClient(config.IDEALServer);
var PingClient = request.createClient(config.CommandTransport+"://"+config.CommandServer+":"+config.CommandPort);
//var IDEALJSONClient = request(config.IDEALServer);

// READ FROM HAT (or other source depending on config
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
var port = new SerialPort({ path: config.SerialPort, baudRate: 38400 })
const parser = port.pipe(new ReadlineParser({delimeter:'\r\n'}))

var mqttclient;
if (config.mqtt) {
  // CONNECT to MQTT broker specified in config

  mqttclient = mqtt.connect(config.mqttBroker);
  console.log('connected to MQTT broker at '+config.mqttBroker);
}

function setupTimedBuffer() {
  console.log('Setup timer');
  setInterval(function(){
     console.log('Send buff timer');
     sendBuffer(JSONbuffer);
    //  currentLED = ((currentLED + 1) % 16)
   }, config['JSONbuffertime']*1000);
}

function sendJSON(data) {
  if (data && data.home_id && !(data.home_id===undefined) && !(data.home_id=='undefined')) {
    // set the command prompt so that remote logins can see what pi they're on
    if (homeID=="unknown") { 
	var cmd = "sed -i 's/\\\\h/home"+data.home_id+"/g' ~/.bashrc";
	var result=executeShellCommand(cmd); // set prompt
        console.log(cmd);
	cmd = "echo \""+data.home_id+"\" > ~/home_id";
	var result=executeShellCommand(cmd); // write home_id file
        console.log(cmd);
    }
    homeID=data.home_id;
    if (config['JSONbuffertime']) {
	JSONbuffer.push(data)
	if (firstReadingReceived==-1) {
	    setupTimedBuffer();
	    firstReadingReceived=1;
	}
    } else if (config['JSONbuffersize']) {
	sendJSONbuffered(data);
    } else {
     console.log(JSON_data);
     IDEALJSONClient.post( 'jsonreading/', data, function (err, res, body) {

      if(res) {
	if (err) {
	  console.log(err);
          console.log({"statusCode": res.statusCode});
	  console.log("body JSON: "+JSON.stringify(body));
	}
      }
    });
   }
  }
}

// turn 2 1-second streams of electrical current data into a single 10-second power stream
// Q: what to do with battery data / any other data that has been received?
// Q: how do we know which clip is being used? A: we don't so we will need to make assumptions / work it out
function aggregate(data) {
   var readings = data.readings;
   var readlength = readings.length;
   if (readlength==0) {
      return { };
   }
   var lastread = readings[readlength-1];
   var lasttime = lastread.timestamp;
   var only_electric_power = readings.filter( element => element.rms_current>0 )
   // here we group by node ID so we're separating the 30A and 100A clamp signals.
   groupedvals = Object.values(only_electric_power.reduce((a, { node_id, rms_current }) => {
	if (!a[node_id]) a[node_id] = { node_id, rms_current_total: 0, rms_count: 0 }
        a[node_id].rms_current_total+=rms_current; a[node_id].rms_count+=1;
        return a;
       },{}));
   var chosenpower=0;

   for (var i=0; i<groupedvals.length; i++) {
      groupedvals[i].mean=groupedvals[i].rms_current_total /  groupedvals[i].rms_count;
      if (groupedvals[i].node_id==ID_30A) { groupedvals[i].ampage=30; groupedvals[i].scaledcurrent=groupedvals[i].mean*ELECTRIC_SCALING_RMS_30A; }
      else { groupedvals[i].ampage=100; groupedvals[i].scaledcurrent=groupedvals[i].mean*ELECTRIC_SCALING_RMS_100A; }
      groupedvals[i].power = groupedvals[i].scaledcurrent * UK_VOLTAGE; // this is where measuring voltage would be useful!
      groupedvals[i].energyinjoules = groupedvals[i] * config.JSONbuffertime;
      if (groupedvals.length==1) { chosenpower=groupedvals[i].power; }
      else if (groupedvals[i].power<4000 && groupedvals[i].ampage==30) { chosenpower=groupedvals[i].power; }
      else if (groupedvals[i].power>=4000 && groupedvals[i].ampage==100) { chosenpower=groupedvals[i].power; }
   }

   // check validity of mappings!
   if (groupedvals.length==2) {
      console.log('check mappings');
      var assignments_correct=0;
      var node_for_30=0;
      var node_for_100=0;
      if (groupedvals[0].node_id==ID_30A && groupedvals[1].node_id==ID_100A) {
         if (groupedvals[0].mean > groupedvals[1].mean) {
            assignments_correct=1;
         } else {
	    assignments_correct=-1
            node_for_30=groupedvals[1].node_id;
	    node_for_100=groupedvals[0].node_id;
         }
      } else if (groupedvals[1].node_id==ID_30A || groupedvals[0].node_id==ID_100A) {
         if (groupedvals[1].mean > groupedvals[0].mean) {
            assignments_correct=1;
         } else {
	    assignments_correct=-1
            node_for_30=groupedvals[0].node_id;
	    node_for_100=groupedvals[1].node_id;
         }
      } else if (groupedvals[0].mean>groupedvals[1].mean) {
	    assignments_correct=-1
            node_for_30=groupedvals[0].node_id;
	    node_for_100=groupedvals[1].node_id;           
      } else {
	    assignments_correct=-1
            node_for_30=groupedvals[1].node_id;
	    node_for_100=groupedvals[0].node_id;
      }
      if (assignments_correct==-1) {
	console.log("mappings are wrong!");
        ID_30A=node_for_30;
        ID_100A=node_for_100;
      } else {
	console.log("mappings are correct");
      }
   }   
   console.log(groupedvals);
   //console.log("chosen power: "+chosenpower);
   //var comm = "sudo echo \""+val+"\" > "+NODEID_30A;
   //var result=executeShellCommand(comm); // flag
   //const groups = readings.groupBy(readings,"nodeid");
   //console.log("Group by "+groups);
   var powerJSON = { "homeid": homeID, "timestamp": lasttime, "power": chosenpower, "numreads": readlength };
   console.log(powerJSON);
   return powerJSON;
}

function aggregateIfRequired(data) {
   if (config.AggregatePower) {
     return JSON.stringify(aggregate(data));
   } else {
     return JSON.stringify(data);
   }
}

function sendJSONbuffered(data) {
   JSONbuffer.push(data);

   if (bufferstart==0 || JSONcount==0) {
     bufferstart=data.timestamp
   } 
   JSONcount++;

   if (JSONcount>=config.JSONbuffersize) {
     sendBuffer();
   }
}


function sendBuffer() {
     console.log("Send buffer ");
     var JSONdata = {
      "readings": JSONbuffer
     }
     if (config.compress) {
       console.log(" ...compress... ");

       // this nextTick means we can postpone execution of compress. It fixes 
       // the problem with a small memory leak on zlib.deflate
       process.nextTick(function() {
         zlib.deflate(JSON.stringify(JSONdata), function(err, buffer) {
           if (!err) {
	     if (config.mqtt) {
               console.log('SEND MQTT');
	       mqttclient.publish(homeID+'/ideal_compressed',aggregateIfRequired(JSONdata));
	     } else {
	       IDEALJSONClient.post( 'jsonreadings/', buffer, function (err, res, body) {
               //IDEALJSONClient.post( 'jsonreadings/', JSONdata, function (err, res, body) {
                 if(res) {
                   console.log(err);
                   console.log({"statusCode": res.statusCode});
                 }
               });
	     }
           } else {
	     console.log("Compression error: " + err);
           }
         })
       });
     } else {
       if (config.mqtt) {
         mqttclient.publish('ideal',aggregateIfRequired(JSONdata));
       } else {
         IDEALJSONClient.post( 'jsonreadings/', JSONdata, function (err, res, body) {
           if(res) {
             console.log(err);
             console.log({"statusCode": res.statusCode});
           }
         });
       }
     }
     // These resets belong outside of the callback because we need to be 
     // able to handle more calls before the post returns. However... what 
     // if we don't get a 200 response? Buffering indefinitely is too much, 
     // but could use a size-limited but larger secondary buffer for unsent
     // data. Certainly adds complication - leave it for now (JK 10/9/2015)
     JSONbuffer=[];
     JSONcount=0;
  
}

console.log('about to open serial port'+config.SerialPort);

//parser.on("open", function () {
//  console.log('serialPort.open');
  parser.on('data', function(data) {
    console.log('data received : ' + data);
    try {
      js_data = JSON.parse(data);
    } catch (er) {
      return;
    }
    JSON_data = {
      "node_id": js_data.node_id + config.homeOffset,
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
        JSON_data["peak_current"] = js_data.val0;
        JSON_data["rms_current"] = js_data.val1;
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
      case 7: // BATTERY LIFE
        JSON_data["battery1"] = js_data.val0;
        JSON_data["battery2"] = js_data.val1;
        sendJSON(JSON_data);
        break;
    }
  });
//});

parser.on("error", function (_error) {
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

var PINGDELAY=20; 

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



/* This was a check-in to the server every so often - not required
var id = setInterval(function() {
     console.log("Hello from "+homeID);
     var JSONdata=[];
     fs.readFile("/home/blackwood/sysinfo", function(err,data) {
	if (err || data=="") {
	   JSONdata={ "home_id": homeID };
        } else {
	   JSONdata = JSON.parse(data);
	   JSONdata.home_id=homeID;
	}

        console.log("Ping with " + JSON.stringify(JSONdata));

        PingClient.post( 'ping/', JSONdata, function (err, res, body) {
          console.log("Ping response "+ JSON.stringify(res));
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
		    break;
		  case "restartpi":
		    var comm = "sudo shutdown -r now";
		    console.log(comm);
		    var result=executeShellCommand(comm); // goodbye!
		    break;
		  case "bigsmall":
		    var comm = "sudo touch "+BIGSMALL_FLAG;
		    console.log(comm + "(set bigsmall flag)");
		    var result=executeShellCommand(comm); // flag
		    break;
		  case "setpitype":
		    var typeval = res.body.value;
		    var comm = "sed -i 's/NODE_ENV=.*$/NODE_ENV=\""+typeval+"\"/'  ~/.profile"
		    console.log(comm + "(set Home type - production or development)");
		    var result=executeShellCommand(comm); // flag
		    break;
		  case "oemip":
		    var val = res.body.value;
		    if (val!=null) { 
		      var comm = "sudo echo \""+val+"\" > "+OEM_IP;
		      console.log(comm + "(set oem ip to "+val+")");
		      var result=executeShellCommand(comm); // flag
                    }
		    break;
		  case "oemapi":
		    var val = res.body.value;
		    console.log("TEST:"+ comm + "(set oem api to "+val+")");
		    if (val!=null) { 
		      var comm = "sudo echo \""+val+"\" > "+OEM_API;
		      console.log(comm + "(set oem api to "+val+")");
		      var result=executeShellCommand(comm); // flag
                    }
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
   });
}, (PINGDELAY * 1000));
*/
