#!/usr/bin/perl

use strict;
use warnings;

use JSON::Parse 'json_file_to_perl';
use Time::HiRes qw(gettimeofday);

my $input="ttyUSB0";
if ($ARGV[1] && $ARGV[1]=~/\-input/) {
  $input = $ARGV[2];
}

# set up tty
`stty -F /dev/$input 57600 cs8 -cstopb -parenb`;

my $preffile = "./env.json";
my $env = (defined $ENV{"NODE_ENV"}) ? $ENV{"NODE_ENV"} : "development";
my %p = %{json_file_to_perl ($preffile)};
my $httptarget = $p{$env}{"IDEALServer"};

open (TTY, '-|', 'while true; do read LINE < /dev/$input; echo $LINE; done') || die "Can't open /dev/$input for read";
while (<TTY>) {
  if (/<watts>([^<]*)<\/watts/) {
     my $whats = $1+0;
     my $t = int(gettimeofday*10);
     my $command = "curl -i -X POST -H 'Content-Type: application/json' -d '{\"home_id\":95,\"sensorbox_address\":1,\"timestamp\":$t,\"timeinterval\":60, \"current\":$whats}' ".$httptarget."jsonreading";
     print "EXECUTE $command\n";
     `$command`;
  } 
}
close TTY;
