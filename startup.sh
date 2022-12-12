cd /home/pi/pi
upgradeflag=/home/pi/ideal.upgrade
#if [ $? -ne 0 ]; then
#    shutdown -r now
#fi
if [ -f $upgradeflag ]; then
    # grab software
    echo "Requesting software from git repository..."
    git fetch --all
    git reset --hard origin/master
    sleep 5
    sudo rm $upgradeflag
fi
. $HOME/.profile
node ideal_server.js
