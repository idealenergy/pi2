
This directory has the stuff necessary to extract power in Watts from a CurrentCost monitor. 

 * Set up CurrentCost as described in the manual
 * Connect your CC monitor to the raspberry Pi with the included RJ45->USB cable. 
 * stty -F /dev/ttyUSB0 57600 cs8 -cstopb -parenb (set up expected input frm USB0)
 * while true; do read LINE < /dev/ttyUSB0; echo $LINE; done | ./currentcost2ideal.pl

Next version will check which tty to grab input from and process all
three types of CurrentCost XML messages (current clamps x 3; OptiSmart
x 1; plug monitors or IAMs x 9)
