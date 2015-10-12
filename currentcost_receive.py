#!/usr/bin/python
from datetime import datetime
import json
import serial
import time
import urllib2
import sys
import os
import untangle
import traceback
import calendar

ENV_FILE = './env.json'
HOME_ID_FILE = '/home/pi/home_id'
HOME_ID=''

# Format documentation:
# http://www.currentcost.com/download/Envi%20XML%20v19%20-%202011-01-11.pdf
# or https://www.wiki.ed.ac.uk/download/attachments/286332549/Envi%20XML%20v19%20-%202011-01-11.pdf?version=1&modificationDate=1442565571000&api=v2
#
# Data from current clamp and plug sensors looks like this:
# <msg><src>CC128-v1.48.03</src><dsb>00011</dsb><time>15:43:04</time><tmpr>25.5</tmpr>..
# <sensor>8</sensor><id>02848</id><type>1</type><ch1><watts>00053</watts></ch1></msg>
# where sensor is a digit 1-9 indicating which sensor the data came from. The current 
# clamp may report up to 3 separate values at once using <ch2> and <ch3> elements; plug 
# sensors will only report channel 1. Type 1 = electricity
# Data from optisense reader will look like this:
# <msg><src>CC128-v1.48.03</src><dsb>00002</dsb><time>14:28:32</time><tmpr>25.5</tmpr>
# <sensor>0</sensor><id>01039</id><type>2</type><imp>0000014768</imp><ipu>1000</ipu></msg>
# where type is 2 (electric impulse); imp is cumulative impulse count; ipu is the number 
# of impulses per unit (if set by the user)

print "Current Cost receiver"
print

# Decide what USB port we're reading (JK)
usbtty = "ttyUSB0"
print 'hello '+sys.argv[1]+ ' '+str(len(sys.argv))
if len(sys.argv) == 3:
   if sys.argv[1] == "-input":
      usbtty=sys.argv[2]

# Load environment config file
with file(ENV_FILE) as f:
	env = json.loads(f.read())

NODE_ENV = 'development'
if 'NODE_ENV' in os.environ:
	NODE_ENV = os.environ['NODE_ENV']

config = env[NODE_ENV]

print "Loaded config: " + NODE_ENV
#print "  Home ID: " + str(config['home_id'])
print "  Server:  " + config['IDEALServer']
print

# Open the serial port for the CurrentCost USB connector
ser = serial.Serial(
	port = '/dev/'+usbtty,
	baudrate = 57600,
	stopbits=serial.STOPBITS_ONE,
	bytesize=serial.EIGHTBITS,
	parity = serial.PARITY_NONE
)

print "  Port:  /dev/" + usbtty

def sendReading(reading, call):
   req = urllib2.Request(config['IDEALServer'] + 'currentcostwattreading')
   req.add_header('Content-Type', 'application/json')
   try:
#	   print "Send " +reading['value']+" to "+config['IDEALServer'] + 'currentcostwattreading'
	response = urllib2.urlopen(req, json.dumps(reading))
   except:
	traceback.print_exc()
#	pass

def getHomeID():
   global HOME_ID
   global HOME_ID_FILE
   if (os.path.isfile(HOME_ID_FILE)):
	print "READ file "+HOME_ID_FILE
	with open (HOME_ID_FILE, "r") as myfile:
	   HOME_ID=myfile.read().replace('\n', '')
   else:
	print "File "+HOME_ID_FILE+" does not exist";



# curl -i -X POST -H 'Content-Type: application/json' -d 
# {"home_id":"8","sensorbox_address":1,"timestamp":14107914342.9,"timeinterval":60,
# "internal_temperature":193,"humidity":677}' http://129.215.164.145:3000/currentcostwattreading
def sendWattsReading(ts, sensor, value, channel):
   global HOME_ID
   if HOME_ID:
	print "Electric reading from clamp or plug sensor "+HOME_ID+ "; "+value
	reading = {'home_id': HOME_ID, 'sensorbox_address': sensor, 'timeinterval': 60, 'power': int(value), 'channel': channel} 
	reading['timestamp'] = int(calendar.timegm(time.gmtime()) * 10)
	sendReading(reading, 'currentcostwattreading')
   else:
	getHomeID()

def sendPulseReading(ts, sensor, impulsecount, ipu, radioid, temp):
   global HOME_ID
   if HOME_ID:
	print "Electric pulse from optisense sensor "+HOME_ID+ ". "
	reading = {'home_id': HOME_ID, 'sensorbox_address': sensor, 'total': int(impulsecount), 'ipu': ipu, 'temperature': temp, 'radioid': radioid} 
	reading['timestamp'] = int(calendar.timegm(time.gmtime()) * 10)
	sendReading(reading, 'currentcostpulsereading')
   else:
	getHomeID()

def processXML(xmlobject):
   if hasattr(xmlobject, 'msg') and hasattr(xmlobject.msg, 'time'):
	type = xmlobject.msg.type.cdata
	if type=="1":
	   if hasattr(xmlobject.msg,'ch1'):
		sendWattsReading(xmlobject.msg.time.cdata, xmlobject.msg.sensor.cdata, xmlobject.msg.ch1.watts.cdata, 1);
	   if hasattr(xmlobject.msg,'ch2'):
		sendWattsReading(xmlobject.msg.time.cdata, xmlobject.msg.sensor.cdata, xmlobject.msg.ch2.watts.cdata, 2);
	   if hasattr(xmlobject.msg,'ch3'):
		sendWattsReading(xmlobject.msg.time.cdata, xmlobject.msg.sensor.cdata, xmlobject.msg.ch3.watts.cdata, 3);

	elif type=="2":
# <msg><src>CC128-v1.48.03</src><dsb>00002</dsb><time>14:28:32</time><tmpr>25.5</tmpr>
# <sensor>0</sensor><id>01039</id><type>2</type><imp>0000014768</imp><ipu>1000</ipu></msg>
	   print "Electric impulse"
	   sendPulseReading(xmlobject.msg.time.cdata, xmlobject.msg.sensor.cdata, 
		xmlobject.msg.imp.cdata, xmlobject.msg.ipu.cdata, 
		xmlobject.msg.id.cdata, xmlobject.msg.tmpr.cdata)


while True:
   try:
	line = ser.readline()
        print "line: "+line
        xobj = []
	try:
	    xobj = untangle.parse(line)
	except:
	    print "Failed to parse incoming XML - check / reconnect CurrentCost cable"
	    traceback.print_exc()
        processXML(xobj)
	time.sleep(0.05)
   except:
	print "no"
	traceback.print_exc()

ser.close()

