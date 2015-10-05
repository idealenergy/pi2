from datetime import datetime
import json
import os
import serial
from struct import unpack
import time
import urllib2

ENV_FILE = './env.json'

## Reference
# http://www.m-bus.com/mbusdoc/md6.php - data block format
# http://www.m-bus.com/mbusdoc/md8.php - list of valid DIFs/VIFs

# Example packet:
#
#	|                      Header                      |                                                     Data blocks                                                 |
#   |3b|44|a7 32|18 00 16 68|07|04|7a 2e 10 00 20|2f 2f|0c 06 24 00 00 00|0c 14 59 00 00 00|0b 3b 00 00 00|0b 2d 00 00 00|0b 5a 90 01 00|0b 5e 79 01 00|04 6d 35 0b e3 1a|0f 00 00 01 0a
#                                                      |      Energy     |     Volume      | Volume flow  |     Power    |  Flow temp.  | Return temp. |  Time and date  |
#
# Header
#	Length:		0x3b = 59
#	Control:	0x44 (constant)
#	Manuf. ID:	0x32A7
#	Serial #:	0x68160018 (printed as 68 160 018 on front of meter, displays as 8160018 on LCD on LOOP 3)
#	Version:	0x07
#	Type:		0x04 (heat meter)
#	Unknown:	0x2000102e7a (I think 0x7a is a constant control byte, part of this is packet # but not sure on width)
#	AES check:	0x2f2f (decrypted OK)
# Data
#	DIF:		0x0c (8 digit BCD follows)
#	VIF:		0x06 (matches mask E000 0nnn for energy in Wh, extension bit not set, nnn = 6, so value is in 10^(6-3)Wh or kWh)
#	Value:		0x00000024 (decodes to 24 in decimal, so 24*10^3Wh or 24kWh)
#	(repeat..)


toHex = lambda x:"".join([hex(ord(c))[2:].zfill(2) for c in x])

def decodeBCD(data):
	out = 0
	multiplier = 1
	for c in data:
		# BCD encodes each digit in 4 bits
		# a character "\x14" decodes to the decimal number 14
		# Take first nibble as is, then second nibble * 10
		num = ord(c)
		ones = num & 0xF
		tens = (num >> 4) & 0xF

		if (ones > 9 or tens > 9):
			print "Parser error: BCD digit > 9"
			print ones, tens, toHex(c)
			return 0

		out += (ones + tens * 10) * multiplier
		# Each character is two digits
		# so the next set need to be shifted over by two (*100)
		multiplier *= 100
	return out

# These functions extract exponent info from VIF, then populate MeterReading with multiplied value

def decodeEnergy(reading, vif, value):
	reading['energy'] = value
	reading['energyEXP'] = (vif & 0b111) - 3

def decodeVolume(reading, vif, value):
	reading['volume'] = value
	reading['volumeEXP'] = (vif & 0b111) - 6

def decodeVolumeFlow(reading, vif, value):
	reading['volumeFlow'] = value
	reading['volumeFlowEXP'] = (vif & 0b111) - 6

def decodePower(reading, vif, value):
	reading['power'] = value
	reading['powerEXP'] = (vif & 0b111) - 3

def decodeFlowTemperature(reading, vif, value):
	reading['flowTemp'] = value
	reading['flowTempEXP'] = (vif & 0b11) - 3

def decodeReturnTemperature(reading, vif, value):
	reading['returnTemp'] = value
	reading['returnTempEXP'] = (vif & 0b11) - 3

def decodeTimePoint(reading, vif, value):
	minute = value & 0x3F
	hour = (value >> 8) & 0x1F
	day = (value >> 16) & 0x1F
	month = (value >> 24) & 0xF
	year = ((value >> 25) & 0x78) | ((value >> 21) & 0x7)
	reading['timestamp'] = int((datetime(year + 2000, month, day, hour, minute) - datetime(1970, 1, 1)).total_seconds()) * 10

# Data block format:
#
#  | DIF (1 byte) | VIF (1 byte) | data (variable length, defined by DIF) |
#
# Special DIFs:
#   0x2F - empty data block, no VIF/data follows, used for verifying decryption was successful
#	0x0F - manuf. specific data follows, used here to mark the end of useful data

# DIF list http://www.m-bus.com/mbusdoc/md8.php section 8.4.2

DIFs = [
	# difValue, data length, decode function
	[0x04, 4, lambda x:unpack('I', x)[0]],	# 4 byte integer
	[0x0B, 3, decodeBCD],					# 6 digit BCD, 3 bytes
	[0x0C, 4, decodeBCD],					# 8 digit BCD, 4 bytes
]

# VIF list http://www.m-bus.com/mbusdoc/md8.php section 8.4.3

VIFs = [
	# vifValue, mask, decode function
	[0b00000000, 0b11111000, decodeEnergy],
	[0b00010000, 0b11111000, decodeVolume],
	[0b00111000, 0b11111000, decodeVolumeFlow],
	[0b00101000, 0b11111000, decodePower],
	[0b01011000, 0b11111100, decodeFlowTemperature],
	[0b01011100, 0b11111100, decodeReturnTemperature],
	[0b01101101, 0b11111111, decodeTimePoint],
]

def decode(packet):
	pktLength = len(packet)
	if pktLength < 10:
		# not long enough for the basic header
		return False

	length, control, manufacturerID, serialNumber, version, deviceType = unpack('BBHIBB', packet[0:10])

	# debug info
	#print toHex(packet)
	#print "Len: %u Control: %02X Manuf: %04X Serial: %08X Ver: %02X Type: %02X" % (length, control, manufacturerID, serialNumber, version, deviceType)

	if pktLength - 1 != length:
		# Length doesn't match up
		# (embedded length doesn't include length byte itself, so - 1)
		return False

	if control != 0x44:
		return False

	reading = {'manufacturerID': manufacturerID, 'serialNumber': decodeBCD(packet[4:8]), 'version': version, 'deviceType': deviceType}

	# skip bytes 10 to 14, unknown

	decryptionState, = unpack('H', packet[15:17])
	if decryptionState != 0x2f2f:
		print "Parser error: Bad decryption state"
		print toHex(packet)
		return False

	data = packet[17:]

	# Loop through parsing the actual data blocks
	while True:
		dataLength = 0
		DIF, VIF = unpack('BB', data[0:2])

		if DIF & 0x80:
			print "Parser error: DIF extension bit set"
			print toHex(packet)
			return False

		if VIF & 0x80:
			print "Parser error: VIF extension bit set"
			print toHex(packet)
			return False

		# Parse first byte: DIF (data information field)
		# defines the data type for the following value
		matched = False
		value = 0
		for d in DIFs:
			difValue, dataLength, decoder = d
			if DIF == difValue:
				matched = True
				value = decoder(data[2:2+dataLength])
				break
			elif DIF == 0x0F:
				# end!
				return reading

		if (not matched):
			print "Parser error: Unmatched DIF %02X" % (DIF)
			print toHex(packet)
			return False

		# Parse the next byte: VIF (value information field)
		# defines the unit of data that follows, and its exponent
		matched = False
		for v in VIFs:
			vifValue, mask, decoder = v
			if ((vifValue & mask) == (VIF & mask)):
				matched = True
				decoder(reading, VIF, value)
				break

		if (not matched):
			print "Parser error: Unmatched VIF %02X" % (VIF)
			print toHex(packet)
			return False

		data = data[2+dataLength:]

	return reading

print "Heat meter receiver"
print

# Load environment config file
with file(ENV_FILE) as f:
	env = json.loads(f.read())

NODE_ENV = 'production'
if 'NODE_ENV' in os.environ:
	NODE_ENV = os.environ['NODE_ENV']

config = env[NODE_ENV]

print "Loaded config: " + NODE_ENV
print "  Home ID: " + str(config['home_id'])
print "  Server:  " + config['IDEALServer']
print

# Open the serial port for the Amber dongle
# We're leaving it in it's default state
# It defaults to T mode and just spits out full packets
ser = serial.Serial(
	port = '/dev/tty.usbserial-5300070A',
	baudrate = 9600
)

while True:
	out = ''
	packet = False
	while ser.inWaiting() > 0:
		# Got data, loop until it's all read
		packet = True
		out += ser.read(1)
		# Delay a bit so the next byte has time to arrive
		time.sleep(0.005)

	if packet:
		result = decode(out)
		if result != False:
			result['home_id'] = config['home_id']
			print result
			req = urllib2.Request(config['IDEALServer'] + 'heatmeterreading')
			req.add_header('Content-Type', 'application/json')
			try:
				response = urllib2.urlopen(req, json.dumps(result))
			except:
				pass
