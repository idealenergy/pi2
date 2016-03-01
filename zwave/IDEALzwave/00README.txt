Code, based on the open z-wave control panel, to detect Z-Stick on the provided port and pass changed values to the IDEAL server. 

REQUIREMENTS
In order to compile you need to set the path to open z-wave code in the Makefile - default being 
OPENZWAVE := ../open-zwave-master

NOTES
v0.3 - still to do: 
  Use libcurl instead of system call; 
  General efficiency and logging savings

CHANGES since previous version
 Add homeID as a command line argument & add to context for
 notification; pass class, genre, valuetype and correctly timestamp
 readings. 
  
USAGE
make idealoz
./idealoz -c /path/to/json.env -u /dev/cu.usbmodem621
