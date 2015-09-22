## Synopsis

Code that goes on the base stations for the IDEAL project. Most fundamentally this comprises a node.js server that has two purposes: to send sensor data to the IDEAL database; to ping a server to see if there are commands that should be run on the Pi (for example to change the brightness of the LEDs on the PCB; or to update the software to the latest GIT version. There is also code that monitors the server on the Pi is running and makes it start on reboot etc.

## Installation

<li>git clone https://github.com/idealenergy/pi.git
<li>npm install
<li>node ideal_server.js

(note all these steps should be automated!)

## License

N/A