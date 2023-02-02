#! /bin/sh
# /home/blackwood/pi2/ideal.sh
#

# Sys-V startup script for ideal process (JK 25/8/2015)

# Wait for internet to be fully working! This is important to allow 
# reinstall of i2c and allow git pull to work (if it's necessary) 

inet=-1
while [ $inet != 1 ] ; do
  ping -q -w 1 -c 1 `ip r | grep default | cut -d ' ' -f 3` > /dev/null && inet=1
  sleep 5
done 

THIS_FILE=/home/blackwood/pi2/ideal.sh
IDEAL_PID_FILE=/home/blackwood/ideal.pid
IDEAL_START_COMMAND=/home/blackwood/pi2/startup.sh
# change this if you want to have a log file
IDEAL_LOG=/dev/null
# don't have a log file for production - only for debug
#IDEAL_LOG=/home/blackwood/pi2/LOG

# Simple start and stop commands for ideal process
case "$1" in
  start)
    # 2 checks - PID file, and process actually running - when only one check, you could
    # have problems restarting on hard reboot.
    alreadystarted=0;
    if [ -f $IDEAL_PID_FILE ]; then
	if ps -p $(cat $IDEAL_PID_FILE) > /dev/null; then
	    alreadystarted=1 
	fi
    fi
    if [ $alreadystarted -eq 1 ]; then
        echo "ideal process already running (if not - check / delete $IDEAL_PID_FILE)"
    else
        echo "Starting script ideal "
        # sudo -H -u pi sh $IDEAL_START_COMMAND > $IDEAL_LOG 2>&1 & echo $! > $IDEAL_PID_FILE
        #echo sh $IDEAL_START_COMMAND > $IDEAL_LOG 2>&1 & echo $! > $IDEAL_PID_FILE
        echo "sh $IDEAL_START_COMMAND > $IDEAL_LOG 2>&1 & echo $! > $IDEAL_PID_FILE"
        sh $IDEAL_START_COMMAND > $IDEAL_LOG 2>&1 & echo $! > $IDEAL_PID_FILE
    fi
    ;;
  stop)
    if [ -f $IDEAL_PID_FILE ]; then
        echo "Stopping script ideal"
        # get the process group of the running process
        pg=`ps xao pid,pgid | grep $(cat $IDEAL_PID_FILE)`
        set -- junk $pg
        shift
        # terminate the process group and delete the PID file
        echo "pkill -TERM -g $2"
        pkill -TERM -g $2
        rm $IDEAL_PID_FILE
    else 
        echo "No ideal process to stop"
    fi
    ;;
  restart)
    $THIS_FILE stop
    $THIS_FILE start
    ;;
  *)
    echo "Usage: /home/blackwood/pi2/ideal.sh {start|stop|restart}"
    exit 1
    ;;
esac

exit 0


