## Synopsis

Pi base station code for the IDEAL project. ideal_server.js is a node.js server that has two purposes: to send sensor data to the IDEAL database; to ping a server to see if there are commands that should be run on the Pi (for example to change the brightness of the LEDs on the PCB; or to update the software to the latest GIT version). There is also code that monitors the server on the Pi is running and makes it start on reboot etc.

## Installation

<li>git pull https://github.com/idealenergy/pi.git
<li>npm install
<li>node ideal_server.js

Note that all these steps should be automated. It is also the case that npm install will not (currently) work because piglow fails to install - need to download it into node_modules and edit its package.json file to include a more recent version of i2c (e.g. "~0.2.0". Then run npm install in the piglow dir and then in this dir again.

## License

N/A
