#!/bin/sh
ENV='/home/pi/pi/env.json'
TEMPENV='/home/pi/pi/tempenv.json'
IDEALSTARTER='/home/pi/pi/ideal.sh'

mqip=`ip r | grep default | sed 's/default via //' | sed 's/ .*//' | tail -1 | tr -d '\n'`
echo $mqip
sed "s/\"mqttBroker.*/\"mqttBroker\": \"mqtt\:\/\/$mqip\",/" $ENV > $TEMPENV
numdiffs=$((`diff -f $ENV $TEMPENV | wc -l` + 0))
if [ $numdiffs -gt 0 ]
then
  echo 'Changes to env file!'
  `mv $TEMPENV $ENV`
  `sh $IDEALSTARTER restart`
fi
