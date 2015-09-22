echo "" > /etc/modprobe.d/raspi-blacklist.conf
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
#if [ $? -ne 0 ]; then
#    shutdown -r now
#fi
node server.js
