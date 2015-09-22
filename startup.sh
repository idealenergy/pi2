echo "" > /etc/modprobe.d/raspi-blacklist.conf
nohup bash util/deps.sh &> util/deps.log &
sleep 5
sudo modprobe i2c-dev
sudo modprobe i2c-bcm2708
sleep 5
sudo modprobe i2c-dev
sudo modprobe i2c-bcm2708
sleep 5
ls /dev/i2c*
cat /etc/modules
lsmod
sudo i2cdetect -y 1
cd /home/pi/pi
upgradeflag=/var/run/ideal/upgrade
#if [ $? -ne 0 ]; then
#    shutdown -r now
#fi
if [ -f $upgradeflag ]; then
    # grab software
    git pull
    rm $upgradeflag
fi
/usr/local/bin/node server.js
